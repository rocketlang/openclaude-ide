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
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core';
import {
    SwarmService,
    SwarmServiceClient,
    SwarmSession,
    SwarmTask,
    SubAgentInstance,
    AgentMessage,
    BroadcastMessage,
    CreateTaskInput,
    CreateMessageInput,
    MessageFilters,
    TaskResult,
    AgentRole,
    SwarmArtifact
} from '../common/swarm-protocol';
import { SwarmSessionManager } from './swarm-session-manager';
import { TaskBoardService } from './task-board-service';
import { SubAgentManager } from './sub-agent-manager';
import { MailboxService } from './mailbox-service';
import { LeadAgentOrchestrator } from './lead-agent-orchestrator';

@injectable()
export class SwarmServiceImpl implements SwarmService, Disposable {

    @inject(SwarmSessionManager)
    protected readonly sessionManager: SwarmSessionManager;

    @inject(TaskBoardService)
    protected readonly taskBoardService: TaskBoardService;

    @inject(SubAgentManager)
    protected readonly subAgentManager: SubAgentManager;

    @inject(MailboxService)
    protected readonly mailboxService: MailboxService;

    @inject(LeadAgentOrchestrator)
    protected readonly orchestrator: LeadAgentOrchestrator;

    protected client: SwarmServiceClient | undefined;
    protected readonly toDispose = new DisposableCollection();

    // Event emitters for the SwarmService interface
    private readonly onSessionUpdateEmitter = new Emitter<SwarmSession>();
    readonly onSessionUpdate: Event<SwarmSession> = this.onSessionUpdateEmitter.event;

    private readonly onTaskUpdateEmitter = new Emitter<{ sessionId: string; task: SwarmTask }>();
    readonly onTaskUpdate: Event<{ sessionId: string; task: SwarmTask }> = this.onTaskUpdateEmitter.event;

    private readonly onAgentUpdateEmitter = new Emitter<{ sessionId: string; agent: SubAgentInstance }>();
    readonly onAgentUpdate: Event<{ sessionId: string; agent: SubAgentInstance }> = this.onAgentUpdateEmitter.event;

    private readonly onNewMessageEmitter = new Emitter<{ sessionId: string; message: AgentMessage }>();
    readonly onNewMessage: Event<{ sessionId: string; message: AgentMessage }> = this.onNewMessageEmitter.event;

    private readonly onArtifactCreatedEmitter = new Emitter<{ sessionId: string; artifact: SwarmArtifact }>();
    readonly onArtifactCreated: Event<{ sessionId: string; artifact: SwarmArtifact }> = this.onArtifactCreatedEmitter.event;

    @postConstruct()
    protected init(): void {
        // Forward events to client and local emitters
        this.toDispose.push(this.sessionManager.onSessionCreated(session => {
            this.client?.onSessionCreated(session);
        }));

        this.toDispose.push(this.sessionManager.onSessionUpdated(session => {
            this.client?.onSessionUpdate(session);
            this.onSessionUpdateEmitter.fire(session);
        }));

        this.toDispose.push(this.sessionManager.onSessionDeleted(sessionId => {
            this.client?.onSessionDeleted(sessionId);
        }));

        this.toDispose.push(this.taskBoardService.onTaskCreated(data => {
            this.client?.onTaskCreated(data.sessionId, data.task);
        }));

        this.toDispose.push(this.taskBoardService.onTaskUpdated(data => {
            this.client?.onTaskUpdate(data.sessionId, data.task);
            this.onTaskUpdateEmitter.fire(data);
        }));

        this.toDispose.push(this.subAgentManager.onAgentSpawned(data => {
            this.client?.onAgentSpawned(data.sessionId, data.agent);
        }));

        this.toDispose.push(this.subAgentManager.onAgentUpdated(data => {
            this.client?.onAgentUpdate(data.sessionId, data.agent);
            this.onAgentUpdateEmitter.fire(data);
        }));

        this.toDispose.push(this.subAgentManager.onAgentTerminated(data => {
            this.client?.onAgentTerminated(data.sessionId, data.agentId);
        }));

        this.toDispose.push(this.mailboxService.onNewMessage(data => {
            this.client?.onNewMessage(data.sessionId, data.message);
            this.onNewMessageEmitter.fire(data);
        }));

        this.toDispose.push(this.mailboxService.onNewBroadcast(data => {
            this.client?.onNewBroadcast(data.sessionId, data.broadcast);
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    setClient(client: SwarmServiceClient): void {
        this.client = client;
    }

    // Session Management
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

    // Swarm Lifecycle
    async startSwarm(sessionId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // Transition to planning phase
        await this.sessionManager.transitionStatus(sessionId, 'planning');

        // Start the orchestration loop
        await this.orchestrator.startOrchestration(sessionId);
    }

    async pauseSwarm(sessionId: string): Promise<void> {
        await this.sessionManager.transitionStatus(sessionId, 'paused');
        await this.orchestrator.pauseOrchestration(sessionId);
    }

    async resumeSwarm(sessionId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // Resume from paused state - figure out the right state to go back to
        const hasActiveTasks = Object.values(session.taskBoard.tasks).some(
            t => t.status === 'in_progress' || t.status === 'review'
        );

        if (hasActiveTasks) {
            await this.sessionManager.transitionStatus(sessionId, 'executing');
        } else {
            await this.sessionManager.transitionStatus(sessionId, 'planning');
        }

        await this.orchestrator.resumeOrchestration(sessionId);
    }

    async cancelSwarm(sessionId: string): Promise<void> {
        await this.sessionManager.transitionStatus(sessionId, 'cancelled');
        await this.orchestrator.stopOrchestration(sessionId);
        await this.subAgentManager.terminateAllAgents(sessionId);
    }

    // Task Management
    async createTask(sessionId: string, input: CreateTaskInput): Promise<SwarmTask> {
        return this.taskBoardService.createTask(sessionId, input);
    }

    async getTask(sessionId: string, taskId: string): Promise<SwarmTask | undefined> {
        return this.taskBoardService.getTask(sessionId, taskId);
    }

    async getTasks(sessionId: string): Promise<SwarmTask[]> {
        return this.taskBoardService.getTasks(sessionId);
    }

    async updateTask(sessionId: string, taskId: string, updates: Partial<SwarmTask>): Promise<SwarmTask> {
        return this.taskBoardService.updateTask(sessionId, taskId, updates);
    }

    async assignTask(sessionId: string, taskId: string, agentId: string): Promise<void> {
        await this.taskBoardService.assignTask(sessionId, taskId, agentId);
        await this.subAgentManager.assignTaskToAgent(sessionId, agentId, taskId);
    }

    async completeTask(sessionId: string, taskId: string, result: TaskResult): Promise<void> {
        const task = await this.taskBoardService.getTask(sessionId, taskId);
        if (task?.assignedTo) {
            await this.subAgentManager.completeAgentTask(sessionId, task.assignedTo, taskId);
        }
        await this.taskBoardService.completeTask(sessionId, taskId, result);
    }

    async failTask(sessionId: string, taskId: string, error: string): Promise<void> {
        const task = await this.taskBoardService.getTask(sessionId, taskId);
        if (task?.assignedTo) {
            await this.subAgentManager.failAgentTask(sessionId, task.assignedTo, taskId);
        }
        await this.taskBoardService.failTask(sessionId, taskId, error);
    }

    // Agent Management
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

    // Messaging
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

    // Artifacts - placeholder implementation
    async getArtifacts(sessionId: string): Promise<SwarmArtifact[]> {
        const session = await this.sessionManager.getSession(sessionId);
        return session?.artifacts || [];
    }

    async getArtifact(sessionId: string, artifactId: string): Promise<SwarmArtifact | undefined> {
        const session = await this.sessionManager.getSession(sessionId);
        return session?.artifacts.find(a => a.id === artifactId);
    }
}
