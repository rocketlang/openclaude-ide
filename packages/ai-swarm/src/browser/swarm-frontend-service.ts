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
import { Emitter, Event } from '@theia/core';
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

/**
 * Frontend service that proxies to the backend SwarmService
 * and emits events for UI updates.
 */
@injectable()
export class SwarmFrontendService implements SwarmServiceClient {

    @inject(SwarmService)
    protected readonly swarmService: SwarmService;

    // Event emitters for UI updates - these are fired when we receive RPC callbacks
    private readonly sessionCreatedEmitter = new Emitter<SwarmSession>();
    readonly onSessionCreatedEvent: Event<SwarmSession> = this.sessionCreatedEmitter.event;

    private readonly sessionUpdatedEmitter = new Emitter<SwarmSession>();
    readonly onSessionUpdatedEvent: Event<SwarmSession> = this.sessionUpdatedEmitter.event;

    private readonly sessionDeletedEmitter = new Emitter<string>();
    readonly onSessionDeletedEvent: Event<string> = this.sessionDeletedEmitter.event;

    private readonly taskCreatedEmitter = new Emitter<{ sessionId: string; task: SwarmTask }>();
    readonly onTaskCreatedEvent: Event<{ sessionId: string; task: SwarmTask }> = this.taskCreatedEmitter.event;

    private readonly taskUpdatedEmitter = new Emitter<{ sessionId: string; task: SwarmTask }>();
    readonly onTaskUpdatedEvent: Event<{ sessionId: string; task: SwarmTask }> = this.taskUpdatedEmitter.event;

    private readonly agentSpawnedEmitter = new Emitter<{ sessionId: string; agent: SubAgentInstance }>();
    readonly onAgentSpawnedEvent: Event<{ sessionId: string; agent: SubAgentInstance }> = this.agentSpawnedEmitter.event;

    private readonly agentUpdatedEmitter = new Emitter<{ sessionId: string; agent: SubAgentInstance }>();
    readonly onAgentUpdatedEvent: Event<{ sessionId: string; agent: SubAgentInstance }> = this.agentUpdatedEmitter.event;

    private readonly agentTerminatedEmitter = new Emitter<{ sessionId: string; agentId: string }>();
    readonly onAgentTerminatedEvent: Event<{ sessionId: string; agentId: string }> = this.agentTerminatedEmitter.event;

    private readonly newMessageEmitter = new Emitter<{ sessionId: string; message: AgentMessage }>();
    readonly onNewMessageEvent: Event<{ sessionId: string; message: AgentMessage }> = this.newMessageEmitter.event;

    private readonly newBroadcastEmitter = new Emitter<{ sessionId: string; broadcast: BroadcastMessage }>();
    readonly onNewBroadcastEvent: Event<{ sessionId: string; broadcast: BroadcastMessage }> = this.newBroadcastEmitter.event;

    private readonly artifactCreatedEmitter = new Emitter<{ sessionId: string; artifact: SwarmArtifact }>();
    readonly onArtifactCreatedEvent: Event<{ sessionId: string; artifact: SwarmArtifact }> = this.artifactCreatedEmitter.event;

    // Local cache for sessions
    private sessionsCache = new Map<string, SwarmSession>();

    @postConstruct()
    protected init(): void {
        // Register as client with backend service
        if (this.swarmService.setClient) {
            this.swarmService.setClient(this);
        }
    }

    // SwarmServiceClient implementation - called by backend via RPC
    onSessionCreated(session: SwarmSession): void {
        this.sessionsCache.set(session.id, session);
        this.sessionCreatedEmitter.fire(session);
    }

    onSessionUpdate(session: SwarmSession): void {
        this.sessionsCache.set(session.id, session);
        this.sessionUpdatedEmitter.fire(session);
    }

    onSessionDeleted(sessionId: string): void {
        this.sessionsCache.delete(sessionId);
        this.sessionDeletedEmitter.fire(sessionId);
    }

    onTaskCreated(sessionId: string, task: SwarmTask): void {
        this.taskCreatedEmitter.fire({ sessionId, task });
    }

    onTaskUpdate(sessionId: string, task: SwarmTask): void {
        this.taskUpdatedEmitter.fire({ sessionId, task });
    }

    onAgentSpawned(sessionId: string, agent: SubAgentInstance): void {
        this.agentSpawnedEmitter.fire({ sessionId, agent });
    }

    onAgentUpdate(sessionId: string, agent: SubAgentInstance): void {
        this.agentUpdatedEmitter.fire({ sessionId, agent });
    }

    onAgentTerminated(sessionId: string, agentId: string): void {
        this.agentTerminatedEmitter.fire({ sessionId, agentId });
    }

    onNewMessage(sessionId: string, message: AgentMessage): void {
        this.newMessageEmitter.fire({ sessionId, message });
    }

    onNewBroadcast(sessionId: string, broadcast: BroadcastMessage): void {
        this.newBroadcastEmitter.fire({ sessionId, broadcast });
    }

    onArtifactCreated(sessionId: string, artifact: SwarmArtifact): void {
        this.artifactCreatedEmitter.fire({ sessionId, artifact });
    }

    // Session Management - proxy to backend
    async createSession(task: string, name?: string): Promise<SwarmSession> {
        return this.swarmService.createSession(task, name);
    }

    async getSession(sessionId: string): Promise<SwarmSession | undefined> {
        // Try cache first
        const cached = this.sessionsCache.get(sessionId);
        if (cached) {
            return cached;
        }
        return this.swarmService.getSession(sessionId);
    }

    async getSessions(): Promise<SwarmSession[]> {
        const sessions = await this.swarmService.getSessions();
        // Update cache
        for (const session of sessions) {
            this.sessionsCache.set(session.id, session);
        }
        return sessions;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        return this.swarmService.deleteSession(sessionId);
    }

    // Swarm Lifecycle
    async startSwarm(sessionId: string): Promise<void> {
        return this.swarmService.startSwarm(sessionId);
    }

    async pauseSwarm(sessionId: string): Promise<void> {
        return this.swarmService.pauseSwarm(sessionId);
    }

    async resumeSwarm(sessionId: string): Promise<void> {
        return this.swarmService.resumeSwarm(sessionId);
    }

    async cancelSwarm(sessionId: string): Promise<void> {
        return this.swarmService.cancelSwarm(sessionId);
    }

    // Task Management
    async createTask(sessionId: string, input: CreateTaskInput): Promise<SwarmTask> {
        return this.swarmService.createTask(sessionId, input);
    }

    async getTask(sessionId: string, taskId: string): Promise<SwarmTask | undefined> {
        return this.swarmService.getTask(sessionId, taskId);
    }

    async getTasks(sessionId: string): Promise<SwarmTask[]> {
        return this.swarmService.getTasks(sessionId);
    }

    async updateTask(sessionId: string, taskId: string, updates: Partial<SwarmTask>): Promise<SwarmTask> {
        return this.swarmService.updateTask(sessionId, taskId, updates);
    }

    async assignTask(sessionId: string, taskId: string, agentId: string): Promise<void> {
        return this.swarmService.assignTask(sessionId, taskId, agentId);
    }

    async completeTask(sessionId: string, taskId: string, result: TaskResult): Promise<void> {
        return this.swarmService.completeTask(sessionId, taskId, result);
    }

    async failTask(sessionId: string, taskId: string, error: string): Promise<void> {
        return this.swarmService.failTask(sessionId, taskId, error);
    }

    // Agent Management
    async spawnAgent(sessionId: string, role: AgentRole): Promise<SubAgentInstance> {
        return this.swarmService.spawnAgent(sessionId, role);
    }

    async getSubAgents(sessionId: string): Promise<SubAgentInstance[]> {
        return this.swarmService.getSubAgents(sessionId);
    }

    async getSubAgent(sessionId: string, agentId: string): Promise<SubAgentInstance | undefined> {
        return this.swarmService.getSubAgent(sessionId, agentId);
    }

    async terminateAgent(sessionId: string, agentId: string): Promise<void> {
        return this.swarmService.terminateAgent(sessionId, agentId);
    }

    // Messaging
    async sendMessage(sessionId: string, input: CreateMessageInput): Promise<AgentMessage> {
        return this.swarmService.sendMessage(sessionId, input);
    }

    async getMessages(sessionId: string, filters?: MessageFilters): Promise<AgentMessage[]> {
        return this.swarmService.getMessages(sessionId, filters);
    }

    async markMessageAsRead(sessionId: string, messageId: string): Promise<void> {
        return this.swarmService.markMessageAsRead(sessionId, messageId);
    }

    async broadcast(
        sessionId: string,
        from: string,
        content: string,
        importance: 'info' | 'warning' | 'critical'
    ): Promise<BroadcastMessage> {
        return this.swarmService.broadcast(sessionId, from, content, importance);
    }

    async getBroadcasts(sessionId: string): Promise<BroadcastMessage[]> {
        return this.swarmService.getBroadcasts(sessionId);
    }

    // Artifacts
    async getArtifacts(sessionId: string): Promise<SwarmArtifact[]> {
        return this.swarmService.getArtifacts(sessionId);
    }

    async getArtifact(sessionId: string, artifactId: string): Promise<SwarmArtifact | undefined> {
        return this.swarmService.getArtifact(sessionId, artifactId);
    }

    // Utility methods for UI
    getCachedSession(sessionId: string): SwarmSession | undefined {
        return this.sessionsCache.get(sessionId);
    }

    clearCache(): void {
        this.sessionsCache.clear();
    }
}
