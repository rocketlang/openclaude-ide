// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { v4 as uuid } from 'uuid';
import {
    AgentMessage,
    BroadcastMessage,
    MessageFilters,
    CreateMessageInput
} from '../common/swarm-protocol';
import { SwarmSessionManager } from './swarm-session-manager';
import { createSwarmError } from '../common/swarm-errors';

export const MailboxService = Symbol('MailboxService');

export interface MailboxService {
    sendMessage(sessionId: string, input: CreateMessageInput): Promise<AgentMessage>;
    getMessages(sessionId: string, filters?: MessageFilters): Promise<AgentMessage[]>;
    getMessage(sessionId: string, messageId: string): Promise<AgentMessage | undefined>;
    markAsRead(sessionId: string, messageId: string): Promise<void>;
    markAllAsRead(sessionId: string, agentId: string): Promise<void>;

    broadcast(sessionId: string, from: string, content: string, importance: 'info' | 'warning' | 'critical'): Promise<BroadcastMessage>;
    getBroadcasts(sessionId: string): Promise<BroadcastMessage[]>;
    acknowledgeBroadcast(sessionId: string, broadcastId: string, agentId: string): Promise<void>;

    getUnreadCount(sessionId: string, agentId: string): Promise<number>;
    getThread(sessionId: string, threadId: string): Promise<AgentMessage[]>;

    onNewMessage: Event<{ sessionId: string; message: AgentMessage }>;
    onNewBroadcast: Event<{ sessionId: string; broadcast: BroadcastMessage }>;
}

@injectable()
export class MailboxServiceImpl implements MailboxService {

    @inject(SwarmSessionManager)
    protected readonly sessionManager: SwarmSessionManager;

    private readonly onNewMessageEmitter = new Emitter<{ sessionId: string; message: AgentMessage }>();
    readonly onNewMessage = this.onNewMessageEmitter.event;

    private readonly onNewBroadcastEmitter = new Emitter<{ sessionId: string; broadcast: BroadcastMessage }>();
    readonly onNewBroadcast = this.onNewBroadcastEmitter.event;

    async sendMessage(sessionId: string, input: CreateMessageInput): Promise<AgentMessage> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const message: AgentMessage = {
            id: uuid(),
            timestamp: Date.now(),
            from: input.from,
            to: input.to,

            type: input.type,
            subject: input.subject,
            content: input.content,

            priority: input.priority || 'normal',
            requiresResponse: input.requiresResponse || false,
            responseDeadline: input.responseDeadline,

            read: false,

            threadId: input.threadId || uuid(),
            replyTo: input.replyTo,

            attachments: input.attachments
        };

        session.mailbox.messages.push(message);

        // Update unread count for recipient agent
        if (input.to !== 'all' && input.to !== 'lead') {
            const agent = session.subAgents[input.to];
            if (agent) {
                agent.inbox.push(message);
                agent.unreadCount++;
            }
        }

        await this.sessionManager.updateSession(sessionId, {
            mailbox: session.mailbox,
            subAgents: session.subAgents
        });

        this.onNewMessageEmitter.fire({ sessionId, message });

        console.info(`[MailboxService] Message sent: ${input.from} -> ${input.to} [${input.type}]`);

        return message;
    }

    async getMessages(sessionId: string, filters?: MessageFilters): Promise<AgentMessage[]> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            return [];
        }

        let messages = session.mailbox.messages;

        if (filters) {
            if (filters.from) {
                messages = messages.filter(m => m.from === filters.from);
            }
            if (filters.to) {
                messages = messages.filter(m => m.to === filters.to || m.to === 'all');
            }
            if (filters.type) {
                messages = messages.filter(m => m.type === filters.type);
            }
            if (filters.unreadOnly) {
                messages = messages.filter(m => !m.read);
            }
            if (filters.since) {
                messages = messages.filter(m => m.timestamp >= filters.since!);
            }
            if (filters.limit) {
                messages = messages.slice(-filters.limit);
            }
        }

        return messages;
    }

    async getMessage(sessionId: string, messageId: string): Promise<AgentMessage | undefined> {
        const session = await this.sessionManager.getSession(sessionId);
        return session?.mailbox.messages.find(m => m.id === messageId);
    }

    async markAsRead(sessionId: string, messageId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const message = session.mailbox.messages.find(m => m.id === messageId);
        if (!message) {
            throw createSwarmError('MESSAGE_NOT_FOUND', undefined, { sessionId, messageId });
        }

        if (!message.read) {
            message.read = true;
            message.readAt = Date.now();

            // Update agent unread count
            if (message.to !== 'all' && message.to !== 'lead') {
                const agent = session.subAgents[message.to];
                if (agent && agent.unreadCount > 0) {
                    agent.unreadCount--;
                }
            }

            await this.sessionManager.updateSession(sessionId, {
                mailbox: session.mailbox,
                subAgents: session.subAgents
            });
        }
    }

    async markAllAsRead(sessionId: string, agentId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const now = Date.now();
        for (const message of session.mailbox.messages) {
            if ((message.to === agentId || message.to === 'all') && !message.read) {
                message.read = true;
                message.readAt = now;
            }
        }

        const agent = session.subAgents[agentId];
        if (agent) {
            agent.unreadCount = 0;
            agent.inbox = agent.inbox.map(m => ({ ...m, read: true, readAt: now }));
        }

        await this.sessionManager.updateSession(sessionId, {
            mailbox: session.mailbox,
            subAgents: session.subAgents
        });
    }

    async broadcast(
        sessionId: string,
        from: string,
        content: string,
        importance: 'info' | 'warning' | 'critical'
    ): Promise<BroadcastMessage> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const broadcast: BroadcastMessage = {
            id: uuid(),
            timestamp: Date.now(),
            from,
            content,
            importance,
            acknowledgedBy: []
        };

        session.mailbox.broadcasts.push(broadcast);

        await this.sessionManager.updateSession(sessionId, { mailbox: session.mailbox });

        this.onNewBroadcastEmitter.fire({ sessionId, broadcast });

        console.info(`[MailboxService] Broadcast from ${from}: [${importance}] ${content.substring(0, 50)}...`);

        return broadcast;
    }

    async getBroadcasts(sessionId: string): Promise<BroadcastMessage[]> {
        const session = await this.sessionManager.getSession(sessionId);
        return session?.mailbox.broadcasts || [];
    }

    async acknowledgeBroadcast(sessionId: string, broadcastId: string, agentId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const broadcast = session.mailbox.broadcasts.find(b => b.id === broadcastId);
        if (broadcast && !broadcast.acknowledgedBy.includes(agentId)) {
            broadcast.acknowledgedBy.push(agentId);
            await this.sessionManager.updateSession(sessionId, { mailbox: session.mailbox });
        }
    }

    async getUnreadCount(sessionId: string, agentId: string): Promise<number> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            return 0;
        }

        if (agentId === 'lead') {
            return session.mailbox.messages.filter(m => m.to === 'lead' && !m.read).length;
        }

        const agent = session.subAgents[agentId];
        return agent?.unreadCount || 0;
    }

    async getThread(sessionId: string, threadId: string): Promise<AgentMessage[]> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            return [];
        }

        return session.mailbox.messages
            .filter(m => m.threadId === threadId)
            .sort((a, b) => a.timestamp - b.timestamp);
    }
}
