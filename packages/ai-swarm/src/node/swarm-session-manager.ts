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
import { Emitter, Event } from '@theia/core';
import { v4 as uuid } from 'uuid';
import {
    SwarmSession,
    SwarmStatus,
    TaskBoard,
    AgentMailbox,
    SwarmMetrics,
    LeadAgentConfig,
    TaskColumn
} from '../common/swarm-protocol';
import { DEFAULT_SWARM_CONFIGURATION } from '../common/swarm-configuration';
import { createSwarmError } from '../common/swarm-errors';

export const SwarmSessionManager = Symbol('SwarmSessionManager');

export interface SwarmSessionManager {
    createSession(task: string, name?: string): Promise<SwarmSession>;
    getSession(sessionId: string): Promise<SwarmSession | undefined>;
    getAllSessions(): Promise<SwarmSession[]>;
    updateSession(sessionId: string, updates: Partial<SwarmSession>): Promise<SwarmSession>;
    deleteSession(sessionId: string): Promise<boolean>;

    transitionStatus(sessionId: string, newStatus: SwarmStatus): Promise<void>;

    onSessionCreated: Event<SwarmSession>;
    onSessionUpdated: Event<SwarmSession>;
    onSessionDeleted: Event<string>;
}

@injectable()
export class SwarmSessionManagerImpl implements SwarmSessionManager {

    private sessions = new Map<string, SwarmSession>();

    private readonly onSessionCreatedEmitter = new Emitter<SwarmSession>();
    readonly onSessionCreated = this.onSessionCreatedEmitter.event;

    private readonly onSessionUpdatedEmitter = new Emitter<SwarmSession>();
    readonly onSessionUpdated = this.onSessionUpdatedEmitter.event;

    private readonly onSessionDeletedEmitter = new Emitter<string>();
    readonly onSessionDeleted = this.onSessionDeletedEmitter.event;

    async createSession(task: string, name?: string): Promise<SwarmSession> {
        if (this.sessions.size >= DEFAULT_SWARM_CONFIGURATION.maxConcurrentSessions) {
            throw createSwarmError('SESSION_LIMIT_EXCEEDED', undefined, {
                current: this.sessions.size,
                max: DEFAULT_SWARM_CONFIGURATION.maxConcurrentSessions
            });
        }

        const sessionId = uuid();
        const now = Date.now();

        const session: SwarmSession = {
            id: sessionId,
            name: name || `Swarm ${new Date().toLocaleString()}`,
            createdAt: now,
            updatedAt: now,
            status: 'initializing',
            originalTask: task,

            leadAgent: this.createDefaultLeadConfig(),
            taskBoard: this.createEmptyTaskBoard(),
            subAgents: {},
            mailbox: this.createEmptyMailbox(),
            artifacts: [],

            metrics: this.createInitialMetrics()
        };

        this.sessions.set(sessionId, session);
        this.onSessionCreatedEmitter.fire(session);

        console.info(`[SwarmSessionManager] Created session ${sessionId}: "${name || task.substring(0, 50)}..."`);

        return session;
    }

    async getSession(sessionId: string): Promise<SwarmSession | undefined> {
        return this.sessions.get(sessionId);
    }

    async getAllSessions(): Promise<SwarmSession[]> {
        return Array.from(this.sessions.values());
    }

    async updateSession(sessionId: string, updates: Partial<SwarmSession>): Promise<SwarmSession> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const updatedSession: SwarmSession = {
            ...session,
            ...updates,
            updatedAt: Date.now(),
            // Preserve readonly fields
            id: session.id,
            createdAt: session.createdAt,
            originalTask: session.originalTask
        };

        this.sessions.set(sessionId, updatedSession);
        this.onSessionUpdatedEmitter.fire(updatedSession);

        return updatedSession;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }

        // Can only delete sessions that are complete, failed, or cancelled
        if (!['complete', 'failed', 'cancelled', 'initializing'].includes(session.status)) {
            throw createSwarmError('SESSION_INVALID_STATE',
                `Cannot delete session in ${session.status} state. Stop it first.`,
                { sessionId, status: session.status }
            );
        }

        this.sessions.delete(sessionId);
        this.onSessionDeletedEmitter.fire(sessionId);

        console.info(`[SwarmSessionManager] Deleted session ${sessionId}`);

        return true;
    }

    async transitionStatus(sessionId: string, newStatus: SwarmStatus): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        if (!this.isValidTransition(session.status, newStatus)) {
            throw createSwarmError('SESSION_INVALID_STATE',
                `Cannot transition from ${session.status} to ${newStatus}`,
                { sessionId, currentStatus: session.status, newStatus }
            );
        }

        const updates: Partial<SwarmSession> = { status: newStatus };

        // Track timing metrics
        if (newStatus === 'planning' && !session.metrics.startTime) {
            updates.metrics = { ...session.metrics, startTime: Date.now() };
        } else if (['complete', 'failed', 'cancelled'].includes(newStatus)) {
            const endTime = Date.now();
            updates.metrics = {
                ...session.metrics,
                endTime,
                duration: session.metrics.startTime ? endTime - session.metrics.startTime : 0
            };
        }

        await this.updateSession(sessionId, updates);

        console.info(`[SwarmSessionManager] Session ${sessionId} transitioned: ${session.status} -> ${newStatus}`);
    }

    private isValidTransition(from: SwarmStatus, to: SwarmStatus): boolean {
        const validTransitions: Record<SwarmStatus, SwarmStatus[]> = {
            'initializing': ['planning', 'cancelled', 'failed'],
            'planning': ['delegating', 'paused', 'cancelled', 'failed'],
            'delegating': ['executing', 'paused', 'cancelled', 'failed'],
            'executing': ['reviewing', 'synthesizing', 'paused', 'cancelled', 'failed'],
            'reviewing': ['executing', 'synthesizing', 'paused', 'cancelled', 'failed'],
            'synthesizing': ['complete', 'paused', 'cancelled', 'failed'],
            'complete': [],
            'failed': [],
            'paused': ['planning', 'delegating', 'executing', 'reviewing', 'synthesizing', 'cancelled'],
            'cancelled': []
        };

        return validTransitions[from]?.includes(to) ?? false;
    }

    private createDefaultLeadConfig(): LeadAgentConfig {
        return {
            model: DEFAULT_SWARM_CONFIGURATION.defaultLeadModel,
            systemPrompt: '',
            maxRetries: 3,
            temperature: 0.7
        };
    }

    private createEmptyTaskBoard(): TaskBoard {
        const columns: TaskColumn[] = [
            { id: 'backlog', name: 'Backlog', taskIds: [], color: '#6b7280' },
            { id: 'ready', name: 'Ready', taskIds: [], color: '#3b82f6' },
            { id: 'in_progress', name: 'In Progress', taskIds: [], color: '#f59e0b' },
            { id: 'review', name: 'Review', taskIds: [], color: '#8b5cf6' },
            { id: 'done', name: 'Done', taskIds: [], color: '#10b981' },
            { id: 'failed', name: 'Failed', taskIds: [], color: '#ef4444' }
        ];

        return {
            columns,
            tasks: {},
            taskOrder: []
        };
    }

    private createEmptyMailbox(): AgentMailbox {
        return {
            messages: [],
            broadcasts: []
        };
    }

    private createInitialMetrics(): SwarmMetrics {
        return {
            totalTokensUsed: 0,
            totalCost: 0,
            tasksCompleted: 0,
            tasksFailed: 0,
            agentsSpawned: 0
        };
    }
}
