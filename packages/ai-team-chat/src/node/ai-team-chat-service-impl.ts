// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import {
    AITeamChatService,
    ChatUser,
    ChatChannel,
    ChatMessage,
    MessageThread,
    TypingIndicator,
    ChatNotification,
    SendMessageRequest,
    CreateChannelRequest,
    SearchMessagesRequest,
    CodeSnippet,
    PresenceStatus,
    extractMentions
} from '../common/ai-team-chat-protocol';

@injectable()
export class AITeamChatServiceImpl implements AITeamChatService {
    protected currentUser: ChatUser = {
        id: 'user-1',
        name: 'Current User',
        email: 'user@example.com',
        status: 'online'
    };

    protected users: Map<string, ChatUser> = new Map([
        ['user-1', this.currentUser],
        ['user-2', { id: 'user-2', name: 'Alice', status: 'online', email: 'alice@example.com' }],
        ['user-3', { id: 'user-3', name: 'Bob', status: 'away', email: 'bob@example.com' }],
        ['user-4', { id: 'user-4', name: 'Charlie', status: 'busy', email: 'charlie@example.com' }]
    ]);

    protected channels: Map<string, ChatChannel> = new Map([
        ['general', {
            id: 'general',
            name: 'general',
            type: 'public',
            description: 'General discussion',
            members: ['user-1', 'user-2', 'user-3', 'user-4'],
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            unreadCount: 0
        }],
        ['dev', {
            id: 'dev',
            name: 'dev',
            type: 'public',
            description: 'Development discussions',
            members: ['user-1', 'user-2', 'user-3'],
            createdAt: new Date().toISOString(),
            createdBy: 'user-2',
            unreadCount: 0
        }],
        ['code-review', {
            id: 'code-review',
            name: 'code-review',
            type: 'public',
            description: 'Code review discussions',
            members: ['user-1', 'user-2'],
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            unreadCount: 0
        }]
    ]);

    protected messages: Map<string, ChatMessage[]> = new Map([
        ['general', [
            {
                id: 'msg-1',
                channelId: 'general',
                userId: 'user-2',
                userName: 'Alice',
                type: 'text',
                content: 'Hey team! How is everyone doing?',
                createdAt: new Date(Date.now() - 3600000).toISOString(),
                reactions: [{ emoji: '👋', users: ['user-1', 'user-3'], count: 2 }]
            },
            {
                id: 'msg-2',
                channelId: 'general',
                userId: 'user-3',
                userName: 'Bob',
                type: 'text',
                content: 'Doing great! Working on the new feature.',
                createdAt: new Date(Date.now() - 3000000).toISOString()
            }
        ]],
        ['dev', []],
        ['code-review', []]
    ]);

    protected threads: Map<string, MessageThread> = new Map();
    protected typingUsers: Map<string, TypingIndicator[]> = new Map();
    protected notifications: ChatNotification[] = [];

    // User operations
    async getCurrentUser(): Promise<ChatUser> {
        return this.currentUser;
    }

    async getUser(userId: string): Promise<ChatUser | undefined> {
        return this.users.get(userId);
    }

    async getOnlineUsers(): Promise<ChatUser[]> {
        return Array.from(this.users.values()).filter(u => u.status !== 'offline');
    }

    async updatePresence(status: PresenceStatus): Promise<void> {
        this.currentUser.status = status;
        this.users.set(this.currentUser.id, this.currentUser);
    }

    // Channel operations
    async getChannels(): Promise<ChatChannel[]> {
        return Array.from(this.channels.values())
            .filter(c => c.members.includes(this.currentUser.id));
    }

    async getChannel(channelId: string): Promise<ChatChannel | undefined> {
        return this.channels.get(channelId);
    }

    async createChannel(request: CreateChannelRequest): Promise<ChatChannel> {
        const id = `channel-${Date.now()}`;
        const channel: ChatChannel = {
            id,
            name: request.name,
            type: request.type,
            description: request.description,
            members: request.members || [this.currentUser.id],
            createdAt: new Date().toISOString(),
            createdBy: this.currentUser.id,
            unreadCount: 0
        };

        this.channels.set(id, channel);
        this.messages.set(id, []);

        return channel;
    }

    async joinChannel(channelId: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (channel && !channel.members.includes(this.currentUser.id)) {
            channel.members.push(this.currentUser.id);
            this.channels.set(channelId, channel);
        }
    }

    async leaveChannel(channelId: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (channel) {
            channel.members = channel.members.filter(m => m !== this.currentUser.id);
            this.channels.set(channelId, channel);
        }
    }

    async updateChannel(channelId: string, updates: Partial<ChatChannel>): Promise<ChatChannel> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error('Channel not found');
        }

        const updated = { ...channel, ...updates };
        this.channels.set(channelId, updated);
        return updated;
    }

    async deleteChannel(channelId: string): Promise<void> {
        this.channels.delete(channelId);
        this.messages.delete(channelId);
    }

    // Message operations
    async getMessages(channelId: string, limit: number = 50, before?: string): Promise<ChatMessage[]> {
        const channelMessages = this.messages.get(channelId) || [];
        let filtered = channelMessages;

        if (before) {
            const beforeIndex = filtered.findIndex(m => m.id === before);
            if (beforeIndex > 0) {
                filtered = filtered.slice(0, beforeIndex);
            }
        }

        return filtered.slice(-limit);
    }

    async sendMessage(request: SendMessageRequest): Promise<ChatMessage> {
        const message: ChatMessage = {
            id: `msg-${Date.now()}`,
            channelId: request.channelId,
            userId: this.currentUser.id,
            userName: this.currentUser.name,
            userAvatar: this.currentUser.avatar,
            type: request.type || 'text',
            content: request.content,
            codeSnippet: request.codeSnippet,
            threadId: request.threadId,
            mentions: request.mentions || extractMentions(request.content),
            createdAt: new Date().toISOString()
        };

        const channelMessages = this.messages.get(request.channelId) || [];
        channelMessages.push(message);
        this.messages.set(request.channelId, channelMessages);

        // Update channel last message
        const channel = this.channels.get(request.channelId);
        if (channel) {
            channel.lastMessage = message;
            this.channels.set(request.channelId, channel);
        }

        // Create notifications for mentions
        if (message.mentions && message.mentions.length > 0) {
            for (const mention of message.mentions) {
                const user = Array.from(this.users.values()).find(u =>
                    u.name.toLowerCase() === mention.toLowerCase()
                );
                if (user && user.id !== this.currentUser.id) {
                    this.notifications.push({
                        id: `notif-${Date.now()}-${user.id}`,
                        type: 'mention',
                        channelId: request.channelId,
                        messageId: message.id,
                        fromUserId: this.currentUser.id,
                        fromUserName: this.currentUser.name,
                        preview: message.content.slice(0, 100),
                        createdAt: new Date().toISOString(),
                        isRead: false
                    });
                }
            }
        }

        return message;
    }

    async editMessage(messageId: string, content: string): Promise<ChatMessage> {
        for (const [channelId, messages] of this.messages.entries()) {
            const index = messages.findIndex(m => m.id === messageId);
            if (index !== -1) {
                messages[index] = {
                    ...messages[index],
                    content,
                    updatedAt: new Date().toISOString(),
                    isEdited: true
                };
                this.messages.set(channelId, messages);
                return messages[index];
            }
        }
        throw new Error('Message not found');
    }

    async deleteMessage(messageId: string): Promise<void> {
        for (const [channelId, messages] of this.messages.entries()) {
            const filtered = messages.filter(m => m.id !== messageId);
            if (filtered.length !== messages.length) {
                this.messages.set(channelId, filtered);
                return;
            }
        }
    }

    async pinMessage(messageId: string): Promise<void> {
        for (const [channelId, messages] of this.messages.entries()) {
            const index = messages.findIndex(m => m.id === messageId);
            if (index !== -1) {
                messages[index].isPinned = true;
                this.messages.set(channelId, messages);
                return;
            }
        }
    }

    async unpinMessage(messageId: string): Promise<void> {
        for (const [channelId, messages] of this.messages.entries()) {
            const index = messages.findIndex(m => m.id === messageId);
            if (index !== -1) {
                messages[index].isPinned = false;
                this.messages.set(channelId, messages);
                return;
            }
        }
    }

    // Thread operations
    async getThread(threadId: string): Promise<MessageThread | undefined> {
        return this.threads.get(threadId);
    }

    async replyToThread(threadId: string, content: string): Promise<ChatMessage> {
        let thread = this.threads.get(threadId);

        if (!thread) {
            // Find the parent message
            let parentMessage: ChatMessage | undefined;
            for (const messages of this.messages.values()) {
                parentMessage = messages.find(m => m.id === threadId);
                if (parentMessage) break;
            }

            if (!parentMessage) {
                throw new Error('Thread not found');
            }

            thread = {
                id: threadId,
                parentMessage,
                replies: [],
                participantIds: [parentMessage.userId],
                lastReplyAt: new Date().toISOString()
            };
        }

        const reply: ChatMessage = {
            id: `msg-${Date.now()}`,
            channelId: thread.parentMessage.channelId,
            userId: this.currentUser.id,
            userName: this.currentUser.name,
            type: 'text',
            content,
            threadId,
            createdAt: new Date().toISOString()
        };

        thread.replies.push(reply);
        thread.lastReplyAt = reply.createdAt;
        if (!thread.participantIds.includes(this.currentUser.id)) {
            thread.participantIds.push(this.currentUser.id);
        }

        this.threads.set(threadId, thread);

        // Update parent message reply count
        const messages = this.messages.get(thread.parentMessage.channelId);
        if (messages) {
            const parent = messages.find(m => m.id === threadId);
            if (parent) {
                parent.replyCount = (parent.replyCount || 0) + 1;
            }
        }

        return reply;
    }

    // Reaction operations
    async addReaction(messageId: string, emoji: string): Promise<void> {
        for (const [channelId, messages] of this.messages.entries()) {
            const message = messages.find(m => m.id === messageId);
            if (message) {
                if (!message.reactions) {
                    message.reactions = [];
                }

                const existing = message.reactions.find(r => r.emoji === emoji);
                if (existing) {
                    if (!existing.users.includes(this.currentUser.id)) {
                        existing.users.push(this.currentUser.id);
                        existing.count++;
                    }
                } else {
                    message.reactions.push({
                        emoji,
                        users: [this.currentUser.id],
                        count: 1
                    });
                }

                this.messages.set(channelId, messages);
                return;
            }
        }
    }

    async removeReaction(messageId: string, emoji: string): Promise<void> {
        for (const [channelId, messages] of this.messages.entries()) {
            const message = messages.find(m => m.id === messageId);
            if (message && message.reactions) {
                const existing = message.reactions.find(r => r.emoji === emoji);
                if (existing) {
                    existing.users = existing.users.filter(u => u !== this.currentUser.id);
                    existing.count = existing.users.length;

                    if (existing.count === 0) {
                        message.reactions = message.reactions.filter(r => r.emoji !== emoji);
                    }
                }

                this.messages.set(channelId, messages);
                return;
            }
        }
    }

    // Search
    async searchMessages(request: SearchMessagesRequest): Promise<ChatMessage[]> {
        const results: ChatMessage[] = [];
        const query = request.query.toLowerCase();

        for (const [channelId, messages] of this.messages.entries()) {
            if (request.channelId && channelId !== request.channelId) {
                continue;
            }

            for (const message of messages) {
                if (request.userId && message.userId !== request.userId) {
                    continue;
                }

                if (request.hasCode && message.type !== 'code' && !message.codeSnippet) {
                    continue;
                }

                if (message.content.toLowerCase().includes(query)) {
                    results.push(message);
                }

                if (request.limit && results.length >= request.limit) {
                    return results;
                }
            }
        }

        return results;
    }

    // Typing indicator
    async setTyping(channelId: string, isTyping: boolean): Promise<void> {
        const channelTyping = this.typingUsers.get(channelId) || [];

        if (isTyping) {
            if (!channelTyping.find(t => t.userId === this.currentUser.id)) {
                channelTyping.push({
                    channelId,
                    userId: this.currentUser.id,
                    userName: this.currentUser.name,
                    isTyping: true
                });
            }
        } else {
            const filtered = channelTyping.filter(t => t.userId !== this.currentUser.id);
            this.typingUsers.set(channelId, filtered);
            return;
        }

        this.typingUsers.set(channelId, channelTyping);
    }

    async getTypingUsers(channelId: string): Promise<TypingIndicator[]> {
        return (this.typingUsers.get(channelId) || [])
            .filter(t => t.userId !== this.currentUser.id);
    }

    // Notifications
    async getNotifications(unreadOnly: boolean = false): Promise<ChatNotification[]> {
        if (unreadOnly) {
            return this.notifications.filter(n => !n.isRead);
        }
        return this.notifications;
    }

    async markNotificationRead(notificationId: string): Promise<void> {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.isRead = true;
        }
    }

    async markAllNotificationsRead(): Promise<void> {
        for (const notification of this.notifications) {
            notification.isRead = true;
        }
    }

    // Code sharing
    async shareCodeToChat(channelId: string, snippet: CodeSnippet, message?: string): Promise<ChatMessage> {
        return this.sendMessage({
            channelId,
            content: message || 'Shared code snippet',
            type: 'code',
            codeSnippet: snippet
        });
    }

    // Direct messages
    async getOrCreateDirectChannel(userId: string): Promise<ChatChannel> {
        const dmId = this.getDirectChannelId(this.currentUser.id, userId);

        let channel = this.channels.get(dmId);
        if (!channel) {
            const otherUser = this.users.get(userId);
            channel = {
                id: dmId,
                name: otherUser?.name || userId,
                type: 'direct',
                members: [this.currentUser.id, userId],
                createdAt: new Date().toISOString(),
                createdBy: this.currentUser.id,
                unreadCount: 0
            };
            this.channels.set(dmId, channel);
            this.messages.set(dmId, []);
        }

        return channel;
    }

    protected getDirectChannelId(user1: string, user2: string): string {
        const sorted = [user1, user2].sort();
        return `dm-${sorted[0]}-${sorted[1]}`;
    }
}
