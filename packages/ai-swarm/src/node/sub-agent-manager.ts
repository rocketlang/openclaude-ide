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
    SubAgentInstance,
    AgentRole,
    SubAgentStatus
} from '../common/swarm-protocol';
import { SwarmSessionManager } from './swarm-session-manager';
import { createSwarmError } from '../common/swarm-errors';
import { DEFAULT_SWARM_CONFIGURATION, getDefaultRoleConfig } from '../common/swarm-configuration';

export const SubAgentManager = Symbol('SubAgentManager');

export interface SubAgentManager {
    spawnAgent(sessionId: string, role: AgentRole): Promise<SubAgentInstance>;
    getAgent(sessionId: string, agentId: string): Promise<SubAgentInstance | undefined>;
    getAgents(sessionId: string): Promise<SubAgentInstance[]>;
    getAgentsByRole(sessionId: string, role: AgentRole): Promise<SubAgentInstance[]>;
    getIdleAgents(sessionId: string): Promise<SubAgentInstance[]>;

    updateAgentStatus(sessionId: string, agentId: string, status: SubAgentStatus): Promise<void>;
    assignTaskToAgent(sessionId: string, agentId: string, taskId: string): Promise<void>;
    completeAgentTask(sessionId: string, agentId: string, taskId: string): Promise<void>;
    failAgentTask(sessionId: string, agentId: string, taskId: string): Promise<void>;

    terminateAgent(sessionId: string, agentId: string): Promise<void>;
    terminateAllAgents(sessionId: string): Promise<void>;

    onAgentSpawned: Event<{ sessionId: string; agent: SubAgentInstance }>;
    onAgentUpdated: Event<{ sessionId: string; agent: SubAgentInstance }>;
    onAgentTerminated: Event<{ sessionId: string; agentId: string }>;
}

@injectable()
export class SubAgentManagerImpl implements SubAgentManager {

    @inject(SwarmSessionManager)
    protected readonly sessionManager: SwarmSessionManager;

    private readonly onAgentSpawnedEmitter = new Emitter<{ sessionId: string; agent: SubAgentInstance }>();
    readonly onAgentSpawned = this.onAgentSpawnedEmitter.event;

    private readonly onAgentUpdatedEmitter = new Emitter<{ sessionId: string; agent: SubAgentInstance }>();
    readonly onAgentUpdated = this.onAgentUpdatedEmitter.event;

    private readonly onAgentTerminatedEmitter = new Emitter<{ sessionId: string; agentId: string }>();
    readonly onAgentTerminated = this.onAgentTerminatedEmitter.event;

    async spawnAgent(sessionId: string, role: AgentRole): Promise<SubAgentInstance> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const currentAgentCount = Object.keys(session.subAgents).length;
        if (currentAgentCount >= DEFAULT_SWARM_CONFIGURATION.maxConcurrentAgents) {
            throw createSwarmError('AGENT_LIMIT_EXCEEDED', undefined, {
                current: currentAgentCount,
                max: DEFAULT_SWARM_CONFIGURATION.maxConcurrentAgents
            });
        }

        const roleConfig = getDefaultRoleConfig(role);
        const agentId = uuid();
        const now = Date.now();

        const agent: SubAgentInstance = {
            id: agentId,
            sessionId,
            createdAt: now,

            role,
            model: roleConfig.defaultModel,
            systemPrompt: this.buildSystemPrompt(role, roleConfig),

            contextWindowId: uuid(),
            contextTokensUsed: 0,
            contextTokensMax: roleConfig.tokenBudget,

            status: 'initializing',
            completedTasks: [],
            failedTasks: [],

            inbox: [],
            unreadCount: 0,

            tokensUsed: 0,
            apiCalls: 0,
            startTime: now,
            lastActivityTime: now
        };

        session.subAgents[agentId] = agent;
        session.metrics.agentsSpawned++;

        await this.sessionManager.updateSession(sessionId, {
            subAgents: session.subAgents,
            metrics: session.metrics
        });

        // Transition to idle
        agent.status = 'idle';
        session.subAgents[agentId] = agent;
        await this.sessionManager.updateSession(sessionId, { subAgents: session.subAgents });

        this.onAgentSpawnedEmitter.fire({ sessionId, agent });

        console.info(`[SubAgentManager] Spawned ${role} agent ${agentId} for session ${sessionId}`);

        return agent;
    }

    async getAgent(sessionId: string, agentId: string): Promise<SubAgentInstance | undefined> {
        const session = await this.sessionManager.getSession(sessionId);
        return session?.subAgents[agentId];
    }

    async getAgents(sessionId: string): Promise<SubAgentInstance[]> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            return [];
        }
        return Object.values(session.subAgents);
    }

    async getAgentsByRole(sessionId: string, role: AgentRole): Promise<SubAgentInstance[]> {
        const agents = await this.getAgents(sessionId);
        return agents.filter(a => a.role === role);
    }

    async getIdleAgents(sessionId: string): Promise<SubAgentInstance[]> {
        const agents = await this.getAgents(sessionId);
        return agents.filter(a => a.status === 'idle');
    }

    async updateAgentStatus(sessionId: string, agentId: string, status: SubAgentStatus): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const agent = session.subAgents[agentId];
        if (!agent) {
            throw createSwarmError('AGENT_NOT_FOUND', undefined, { sessionId, agentId });
        }

        agent.status = status;
        agent.lastActivityTime = Date.now();

        await this.sessionManager.updateSession(sessionId, { subAgents: session.subAgents });
        this.onAgentUpdatedEmitter.fire({ sessionId, agent });
    }

    async assignTaskToAgent(sessionId: string, agentId: string, taskId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const agent = session.subAgents[agentId];
        if (!agent) {
            throw createSwarmError('AGENT_NOT_FOUND', undefined, { sessionId, agentId });
        }

        agent.currentTaskId = taskId;
        agent.status = 'working';
        agent.lastActivityTime = Date.now();

        await this.sessionManager.updateSession(sessionId, { subAgents: session.subAgents });
        this.onAgentUpdatedEmitter.fire({ sessionId, agent });

        console.info(`[SubAgentManager] Agent ${agentId} assigned task ${taskId}`);
    }

    async completeAgentTask(sessionId: string, agentId: string, taskId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const agent = session.subAgents[agentId];
        if (!agent) {
            throw createSwarmError('AGENT_NOT_FOUND', undefined, { sessionId, agentId });
        }

        agent.completedTasks.push(taskId);
        agent.currentTaskId = undefined;
        agent.status = 'idle';
        agent.lastActivityTime = Date.now();

        await this.sessionManager.updateSession(sessionId, { subAgents: session.subAgents });
        this.onAgentUpdatedEmitter.fire({ sessionId, agent });

        console.info(`[SubAgentManager] Agent ${agentId} completed task ${taskId}`);
    }

    async failAgentTask(sessionId: string, agentId: string, taskId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const agent = session.subAgents[agentId];
        if (!agent) {
            throw createSwarmError('AGENT_NOT_FOUND', undefined, { sessionId, agentId });
        }

        agent.failedTasks.push(taskId);
        agent.currentTaskId = undefined;
        agent.status = 'idle';
        agent.lastActivityTime = Date.now();

        await this.sessionManager.updateSession(sessionId, { subAgents: session.subAgents });
        this.onAgentUpdatedEmitter.fire({ sessionId, agent });

        console.warn(`[SubAgentManager] Agent ${agentId} failed task ${taskId}`);
    }

    async terminateAgent(sessionId: string, agentId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const agent = session.subAgents[agentId];
        if (!agent) {
            return; // Already terminated
        }

        agent.status = 'terminated';
        delete session.subAgents[agentId];

        await this.sessionManager.updateSession(sessionId, { subAgents: session.subAgents });
        this.onAgentTerminatedEmitter.fire({ sessionId, agentId });

        console.info(`[SubAgentManager] Terminated agent ${agentId}`);
    }

    async terminateAllAgents(sessionId: string): Promise<void> {
        const agents = await this.getAgents(sessionId);
        for (const agent of agents) {
            await this.terminateAgent(sessionId, agent.id);
        }
    }

    private buildSystemPrompt(role: AgentRole, config: any): string {
        const prompts: Record<AgentRole, string> = {
            architect: `You are a software architect. Your role is to:
- Design system architecture and component structure
- Define interfaces and contracts between components
- Create design documents and specifications
- You do NOT write implementation code - only interfaces and design docs
- Focus on maintainability, scalability, and best practices`,

            senior_dev: `You are a senior software developer. Your role is to:
- Handle complex implementation tasks
- Mentor and guide other agents when they have questions
- Make architectural decisions within your task scope
- Write high-quality, well-tested code
- Identify and fix potential issues proactively`,

            developer: `You are a software developer. Your role is to:
- Implement features according to specifications
- Write clean, maintainable code
- Follow established patterns and conventions
- Ask questions if requirements are unclear
- Write basic tests for your implementations`,

            junior_dev: `You are a junior developer. Your role is to:
- Handle straightforward implementation tasks
- Write unit tests for existing code
- Follow instructions carefully
- Ask questions when uncertain
- Learn from feedback and improve`,

            reviewer: `You are a code reviewer. Your role is to:
- Review code for quality, correctness, and best practices
- Identify bugs, security issues, and performance problems
- Provide constructive feedback with specific suggestions
- Approve or request changes to code
- You do NOT write code - only review it`,

            security: `You are a security engineer. Your role is to:
- Review code for security vulnerabilities
- Check for OWASP Top 10 issues
- Identify authentication and authorization problems
- Review data handling and encryption
- Ensure compliance with security best practices`,

            tester: `You are a test engineer. Your role is to:
- Write comprehensive unit tests
- Create integration tests
- Identify edge cases and test boundaries
- Ensure good test coverage
- Write test utilities and helpers`,

            documenter: `You are a technical writer. Your role is to:
- Write clear documentation
- Create README files and API docs
- Document code with appropriate comments
- Write user guides and tutorials
- Keep documentation up to date`,

            devops: `You are a DevOps engineer. Your role is to:
- Handle CI/CD configurations
- Manage deployment scripts
- Configure infrastructure as code
- Set up monitoring and logging
- Handle environment configurations`,

            generalist: `You are a generalist developer. Your role is to:
- Handle various types of tasks as needed
- Adapt to different requirements
- Balance quality with pragmatism
- Collaborate with specialized agents
- Fill gaps where needed`
        };

        return prompts[role] || prompts.generalist;
    }
}
