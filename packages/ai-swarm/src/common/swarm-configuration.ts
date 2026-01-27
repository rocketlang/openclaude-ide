// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AgentRole, AgentRoleConfig } from './swarm-protocol';

export interface SwarmConfiguration {
    enabled: boolean;

    maxConcurrentAgents: number;
    maxConcurrentSessions: number;
    maxTasksPerSession: number;

    orchestrationIntervalMs: number;

    defaultLeadModel: string;
    defaultWorkerModel: string;
    fallbackModel: string;

    tokenBudget: {
        perSession: number;
        perTask: number;
        perAgent: number;
    };

    timeouts: {
        taskExecution: number;
        agentIdle: number;
        sessionTotal: number;
        messageResponse: number;
    };

    gitWorktrees: {
        enabled: boolean;
        basePath: string;
        cleanupOnComplete: boolean;
    };

    roles: Record<AgentRole, AgentRoleConfig>;

    qualityGates: {
        requireReview: boolean;
        minReviewers: number;
        requireTests: boolean;
        minTestCoverage: number;
    };

    logging: {
        level: 'debug' | 'info' | 'warn' | 'error';
        persistLogs: boolean;
        logPath: string;
    };
}

export const DEFAULT_SWARM_CONFIGURATION: SwarmConfiguration = {
    enabled: true,
    maxConcurrentAgents: 5,
    maxConcurrentSessions: 3,
    maxTasksPerSession: 50,

    orchestrationIntervalMs: 1000,

    defaultLeadModel: 'claude-opus-4-5',
    defaultWorkerModel: 'claude-sonnet-4-5',
    fallbackModel: 'claude-haiku-4-5',

    tokenBudget: {
        perSession: 1_000_000,
        perTask: 50_000,
        perAgent: 200_000
    },

    timeouts: {
        taskExecution: 5 * 60 * 1000,
        agentIdle: 2 * 60 * 1000,
        sessionTotal: 60 * 60 * 1000,
        messageResponse: 30 * 1000
    },

    gitWorktrees: {
        enabled: false,
        basePath: '.swarm-worktrees',
        cleanupOnComplete: true
    },

    roles: {
        architect: {
            role: 'architect',
            name: 'Architect',
            description: 'Designs architecture, interfaces, and system structure. Does not write implementation code.',
            defaultModel: 'claude-sonnet-4-5',
            capabilities: ['design', 'documentation', 'review'],
            systemPromptTemplate: 'architect',
            allowedTools: ['read', 'glob', 'grep', 'write'],
            maxConcurrentTasks: 2,
            tokenBudget: 100_000
        },
        senior_dev: {
            role: 'senior_dev',
            name: 'Senior Developer',
            description: 'Handles complex implementation tasks and mentors other agents.',
            defaultModel: 'claude-sonnet-4-5',
            capabilities: ['implementation', 'refactoring', 'review', 'debugging'],
            systemPromptTemplate: 'senior_dev',
            allowedTools: ['read', 'write', 'edit', 'glob', 'grep', 'bash'],
            maxConcurrentTasks: 2,
            tokenBudget: 150_000
        },
        developer: {
            role: 'developer',
            name: 'Developer',
            description: 'Implements features and fixes bugs according to specifications.',
            defaultModel: 'claude-sonnet-4-5',
            capabilities: ['implementation', 'refactoring'],
            systemPromptTemplate: 'developer',
            allowedTools: ['read', 'write', 'edit', 'glob', 'grep', 'bash'],
            maxConcurrentTasks: 3,
            tokenBudget: 100_000
        },
        junior_dev: {
            role: 'junior_dev',
            name: 'Junior Developer',
            description: 'Handles simple implementation tasks and writes tests.',
            defaultModel: 'claude-haiku-4-5',
            capabilities: ['implementation', 'testing'],
            systemPromptTemplate: 'junior_dev',
            allowedTools: ['read', 'write', 'edit', 'glob', 'grep'],
            maxConcurrentTasks: 3,
            tokenBudget: 50_000
        },
        reviewer: {
            role: 'reviewer',
            name: 'Code Reviewer',
            description: 'Reviews code for quality, correctness, and best practices.',
            defaultModel: 'claude-opus-4-5',
            capabilities: ['review', 'security'],
            systemPromptTemplate: 'reviewer',
            allowedTools: ['read', 'glob', 'grep'],
            maxConcurrentTasks: 4,
            tokenBudget: 80_000
        },
        security: {
            role: 'security',
            name: 'Security Reviewer',
            description: 'Reviews code for security vulnerabilities and compliance.',
            defaultModel: 'claude-opus-4-5',
            capabilities: ['security', 'review'],
            systemPromptTemplate: 'security',
            allowedTools: ['read', 'glob', 'grep'],
            maxConcurrentTasks: 2,
            tokenBudget: 80_000
        },
        tester: {
            role: 'tester',
            name: 'Test Engineer',
            description: 'Writes unit tests, integration tests, and test utilities.',
            defaultModel: 'claude-haiku-4-5',
            capabilities: ['testing'],
            systemPromptTemplate: 'tester',
            allowedTools: ['read', 'write', 'edit', 'glob', 'grep', 'bash'],
            maxConcurrentTasks: 4,
            tokenBudget: 60_000
        },
        documenter: {
            role: 'documenter',
            name: 'Documentation Writer',
            description: 'Writes and maintains documentation, README files, and API docs.',
            defaultModel: 'claude-haiku-4-5',
            capabilities: ['documentation'],
            systemPromptTemplate: 'documenter',
            allowedTools: ['read', 'write', 'glob', 'grep'],
            maxConcurrentTasks: 3,
            tokenBudget: 40_000
        },
        devops: {
            role: 'devops',
            name: 'DevOps Engineer',
            description: 'Handles CI/CD, deployment configurations, and infrastructure.',
            defaultModel: 'claude-sonnet-4-5',
            capabilities: ['configuration', 'deployment'],
            systemPromptTemplate: 'devops',
            allowedTools: ['read', 'write', 'edit', 'glob', 'grep', 'bash'],
            maxConcurrentTasks: 2,
            tokenBudget: 80_000
        },
        generalist: {
            role: 'generalist',
            name: 'Generalist',
            description: 'Can handle any type of task with moderate proficiency.',
            defaultModel: 'claude-sonnet-4-5',
            capabilities: ['implementation', 'testing', 'documentation', 'review'],
            systemPromptTemplate: 'generalist',
            allowedTools: ['read', 'write', 'edit', 'glob', 'grep', 'bash'],
            maxConcurrentTasks: 2,
            tokenBudget: 100_000
        }
    },

    qualityGates: {
        requireReview: true,
        minReviewers: 1,
        requireTests: false,
        minTestCoverage: 0
    },

    logging: {
        level: 'info',
        persistLogs: true,
        logPath: '.swarm-logs'
    }
};

export function getDefaultRoleConfig(role: AgentRole): AgentRoleConfig {
    return DEFAULT_SWARM_CONFIGURATION.roles[role];
}

export function mergeConfiguration(
    base: SwarmConfiguration,
    override: Partial<SwarmConfiguration>
): SwarmConfiguration {
    return {
        ...base,
        ...override,
        tokenBudget: { ...base.tokenBudget, ...override.tokenBudget },
        timeouts: { ...base.timeouts, ...override.timeouts },
        gitWorktrees: { ...base.gitWorktrees, ...override.gitWorktrees },
        qualityGates: { ...base.qualityGates, ...override.qualityGates },
        logging: { ...base.logging, ...override.logging },
        roles: { ...base.roles, ...override.roles }
    };
}

export function getRoleForTaskType(taskType: string): AgentRole {
    const roleMapping: Record<string, AgentRole> = {
        design: 'architect',
        implementation: 'developer',
        refactoring: 'senior_dev',
        testing: 'tester',
        review: 'reviewer',
        documentation: 'documenter',
        configuration: 'devops',
        research: 'architect',
        integration: 'senior_dev'
    };
    return roleMapping[taskType] || 'generalist';
}
