// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import {
    SwarmService,
    SwarmServiceClient,
    SwarmSession,
    SwarmTask,
    SubAgentInstance,
    AgentRole,
    AgentMessage,
    BroadcastMessage,
    SwarmArtifact,
    TaskResult,
    CreateTaskInput,
    CreateMessageInput,
    MessageFilters
} from '../common/swarm-protocol';
import { SwarmSessionManager } from './swarm-session-manager';
import { TaskBoardService } from './task-board-service';
import { SubAgentManager } from './sub-agent-manager';
import { MailboxService } from './mailbox-service';
import { createSwarmError } from '../common/swarm-errors';

@injectable()
export class SwarmServiceImpl implements SwarmService {

    @inject(SwarmSessionManager)
    protected readonly sessionManager: SwarmSessionManager;

    @inject(TaskBoardService)
    protected readonly taskBoardService: TaskBoardService;

    @inject(SubAgentManager)
    protected readonly subAgentManager: SubAgentManager;

    @inject(MailboxService)
    protected readonly mailboxService: MailboxService;

    private client: SwarmServiceClient | undefined;

    // Event emitters
    private readonly onSessionUpdateEmitter = new Emitter<SwarmSession>();
    readonly onSessionUpdate = this.onSessionUpdateEmitter.event;

    private readonly onTaskUpdateEmitter = new Emitter<{ sessionId: string; task: SwarmTask }>();
    readonly onTaskUpdate = this.onTaskUpdateEmitter.event;

    private readonly onAgentUpdateEmitter = new Emitter<{ sessionId: string; agent: SubAgentInstance }>();
    readonly onAgentUpdate = this.onAgentUpdateEmitter.event;

    private readonly onNewMessageEmitter = new Emitter<{ sessionId: string; message: AgentMessage }>();
    readonly onNewMessage = this.onNewMessageEmitter.event;

    private readonly onArtifactCreatedEmitter = new Emitter<{ sessionId: string; artifact: SwarmArtifact }>();
    readonly onArtifactCreated = this.onArtifactCreatedEmitter.event;

    @postConstruct()
    protected init(): void {
        // Wire up events from sub-services to client notifications
        this.sessionManager.onSessionCreated(session => {
            this.client?.onSessionCreated(session);
            this.onSessionUpdateEmitter.fire(session);
        });

        this.sessionManager.onSessionUpdated(session => {
            this.client?.onSessionUpdate(session);
            this.onSessionUpdateEmitter.fire(session);
        });

        this.sessionManager.onSessionDeleted(sessionId => {
            this.client?.onSessionDeleted(sessionId);
        });

        this.taskBoardService.onTaskCreated(event => {
            this.client?.onTaskCreated(event.sessionId, event.task);
            this.onTaskUpdateEmitter.fire(event);
        });

        this.taskBoardService.onTaskUpdated(event => {
            this.client?.onTaskUpdate(event.sessionId, event.task);
            this.onTaskUpdateEmitter.fire(event);
        });

        this.subAgentManager.onAgentSpawned(event => {
            this.client?.onAgentSpawned(event.sessionId, event.agent);
            this.onAgentUpdateEmitter.fire(event);
        });

        this.subAgentManager.onAgentUpdated(event => {
            this.client?.onAgentUpdate(event.sessionId, event.agent);
            this.onAgentUpdateEmitter.fire(event);
        });

        this.subAgentManager.onAgentTerminated(event => {
            this.client?.onAgentTerminated(event.sessionId, event.agentId);
        });

        this.mailboxService.onNewMessage(event => {
            this.client?.onNewMessage(event.sessionId, event.message);
            this.onNewMessageEmitter.fire(event);
        });

        this.mailboxService.onNewBroadcast(event => {
            this.client?.onNewBroadcast(event.sessionId, event.broadcast);
        });
    }

    setClient(client: SwarmServiceClient): void {
        this.client = client;
    }

    // ========================================================================
    // Session Management
    // ========================================================================

    async createSession(task: string, name?: string): Promise<SwarmSession> {
        return this.sessionManager.createSession(task, name);
    }

    async getSession(sessionId: string): Promise<SwarmSession | undefined> {
        return this.sessionManager.getSession(sessionId);
    }

    async getSessions(): Promise<SwarmSession[]> {
        return this.sessionManager.getAllSessions();
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        return this.sessionManager.deleteSession(sessionId);
    }

    // ========================================================================
    // Swarm Control
    // ========================================================================

    async startSwarm(sessionId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        // Transition to planning phase
        await this.sessionManager.transitionStatus(sessionId, 'planning');

        console.info(`[SwarmService] Started swarm ${sessionId}`);

        // TODO: Integrate with LeadAgentOrchestrator to begin planning
    }

    async pauseSwarm(sessionId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        await this.sessionManager.transitionStatus(sessionId, 'paused');

        // Broadcast pause notification to all agents
        await this.mailboxService.broadcast(
            sessionId,
            'lead',
            'Swarm paused by user. All agents should save state and wait.',
            'warning'
        );

        console.info(`[SwarmService] Paused swarm ${sessionId}`);
    }

    async resumeSwarm(sessionId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        if (session.status !== 'paused') {
            throw createSwarmError('SESSION_INVALID_STATE',
                `Cannot resume from ${session.status} state`,
                { sessionId, status: session.status }
            );
        }

        // Resume to executing (most common resume point)
        await this.sessionManager.transitionStatus(sessionId, 'executing');

        // Broadcast resume notification
        await this.mailboxService.broadcast(
            sessionId,
            'lead',
            'Swarm resumed. All agents may continue work.',
            'info'
        );

        console.info(`[SwarmService] Resumed swarm ${sessionId}`);
    }

    async cancelSwarm(sessionId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        // Broadcast cancellation
        await this.mailboxService.broadcast(
            sessionId,
            'lead',
            'Swarm cancelled. All agents will be terminated.',
            'critical'
        );

        // Terminate all agents
        await this.subAgentManager.terminateAllAgents(sessionId);

        // Transition to cancelled
        await this.sessionManager.transitionStatus(sessionId, 'cancelled');

        console.info(`[SwarmService] Cancelled swarm ${sessionId}`);
    }

    // ========================================================================
    // Task Management
    // ========================================================================

    async createTask(sessionId: string, input: CreateTaskInput): Promise<SwarmTask> {
        return this.taskBoardService.createTask(sessionId, input);
    }

    async getTasks(sessionId: string): Promise<SwarmTask[]> {
        return this.taskBoardService.getTasks(sessionId);
    }

    async getTask(sessionId: string, taskId: string): Promise<SwarmTask | undefined> {
        return this.taskBoardService.getTask(sessionId, taskId);
    }

    async updateTask(sessionId: string, taskId: string, updates: Partial<SwarmTask>): Promise<SwarmTask> {
        return this.taskBoardService.updateTask(sessionId, taskId, updates);
    }

    async assignTask(sessionId: string, taskId: string, agentId: string): Promise<void> {
        await this.taskBoardService.assignTask(sessionId, taskId, agentId);
        await this.subAgentManager.assignTaskToAgent(sessionId, agentId, taskId);

        // Send task assignment message
        const task = await this.taskBoardService.getTask(sessionId, taskId);
        if (task) {
            await this.mailboxService.sendMessage(sessionId, {
                from: 'lead',
                to: agentId,
                type: 'task_assignment',
                subject: `Assigned: ${task.title}`,
                content: `You have been assigned task: ${task.title}\n\nDescription: ${task.description}\n\nAcceptance Criteria:\n${task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}`,
                priority: task.priority === 'critical' ? 'urgent' : 'normal',
                requiresResponse: true
            });
        }
    }

    async completeTask(sessionId: string, taskId: string, result: TaskResult): Promise<void> {
        const task = await this.taskBoardService.getTask(sessionId, taskId);
        if (!task) {
            throw createSwarmError('TASK_NOT_FOUND', undefined, { sessionId, taskId });
        }

        await this.taskBoardService.completeTask(sessionId, taskId, result);

        if (task.assignedTo) {
            await this.subAgentManager.completeAgentTask(sessionId, task.assignedTo, taskId);

            // Send completion message to lead
            await this.mailboxService.sendMessage(sessionId, {
                from: task.assignedTo,
                to: 'lead',
                type: 'task_complete',
                subject: `Completed: ${task.title}`,
                content: result.summary,
                priority: 'normal',
                requiresResponse: false
            });
        }

        // Update session metrics
        const session = await this.sessionManager.getSession(sessionId);
        if (session) {
            await this.sessionManager.updateSession(sessionId, {
                metrics: {
                    ...session.metrics,
                    tasksCompleted: session.metrics.tasksCompleted + 1
                }
            });
        }
    }

    async failTask(sessionId: string, taskId: string, error: string): Promise<void> {
        const task = await this.taskBoardService.getTask(sessionId, taskId);
        if (!task) {
            throw createSwarmError('TASK_NOT_FOUND', undefined, { sessionId, taskId });
        }

        await this.taskBoardService.failTask(sessionId, taskId, error);

        if (task.assignedTo) {
            await this.subAgentManager.failAgentTask(sessionId, task.assignedTo, taskId);

            // Send failure message to lead
            await this.mailboxService.sendMessage(sessionId, {
                from: task.assignedTo,
                to: 'lead',
                type: 'task_failed',
                subject: `Failed: ${task.title}`,
                content: error,
                priority: 'high',
                requiresResponse: true
            });
        }

        // Update session metrics
        const session = await this.sessionManager.getSession(sessionId);
        if (session) {
            await this.sessionManager.updateSession(sessionId, {
                metrics: {
                    ...session.metrics,
                    tasksFailed: session.metrics.tasksFailed + 1
                }
            });
        }
    }

    // ========================================================================
    // Sub-Agent Management
    // ========================================================================

    async spawnAgent(sessionId: string, role: AgentRole): Promise<SubAgentInstance> {
        return this.subAgentManager.spawnAgent(sessionId, role);
    }

    async getSubAgents(sessionId: string): Promise<SubAgentInstance[]> {
        return this.subAgentManager.getAgents(sessionId);
    }

    async getSubAgent(sessionId: string, agentId: string): Promise<SubAgentInstance | undefined> {
        return this.subAgentManager.getAgent(sessionId, agentId);
    }

    async terminateAgent(sessionId: string, agentId: string): Promise<void> {
        return this.subAgentManager.terminateAgent(sessionId, agentId);
    }

    // ========================================================================
    // Communication
    // ========================================================================

    async sendMessage(sessionId: string, input: CreateMessageInput): Promise<AgentMessage> {
        return this.mailboxService.sendMessage(sessionId, input);
    }

    async getMessages(sessionId: string, filters?: MessageFilters): Promise<AgentMessage[]> {
        return this.mailboxService.getMessages(sessionId, filters);
    }

    async markMessageAsRead(sessionId: string, messageId: string): Promise<void> {
        return this.mailboxService.markAsRead(sessionId, messageId);
    }

    async broadcast(
        sessionId: string,
        from: string,
        content: string,
        importance: 'info' | 'warning' | 'critical'
    ): Promise<BroadcastMessage> {
        return this.mailboxService.broadcast(sessionId, from, content, importance);
    }

    async getBroadcasts(sessionId: string): Promise<BroadcastMessage[]> {
        return this.mailboxService.getBroadcasts(sessionId);
    }

    // ========================================================================
    // Artifacts
    // ========================================================================

    async getArtifacts(sessionId: string): Promise<SwarmArtifact[]> {
        const session = await this.sessionManager.getSession(sessionId);
        return session?.artifacts || [];
    }

    async getArtifact(sessionId: string, artifactId: string): Promise<SwarmArtifact | undefined> {
        const session = await this.sessionManager.getSession(sessionId);
        return session?.artifacts.find(a => a.id === artifactId);
    }
}
