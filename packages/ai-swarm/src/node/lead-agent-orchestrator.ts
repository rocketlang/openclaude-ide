// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { Emitter, Event, CancellationTokenSource } from '@theia/core';
import { v4 as uuid } from 'uuid';
import {
    SwarmSession,
    SwarmTask,
    CreateTaskInput,
    TaskType
} from '../common/swarm-protocol';
import { SwarmSessionManager } from './swarm-session-manager';
import { TaskBoardService } from './task-board-service';
import { SubAgentManager } from './sub-agent-manager';
import { MailboxService } from './mailbox-service';
import { DEFAULT_SWARM_CONFIGURATION, getRoleForTaskType } from '../common/swarm-configuration';
import {
    LanguageModelRegistry,
    UserRequest,
    isLanguageModelTextResponse,
    isLanguageModelStreamResponse,
    isTextResponsePart
} from '@theia/ai-core/lib/common/language-model';

export const LeadAgentOrchestrator = Symbol('LeadAgentOrchestrator');

export interface LeadAgentOrchestrator {
    startOrchestration(sessionId: string): Promise<void>;
    pauseOrchestration(sessionId: string): Promise<void>;
    resumeOrchestration(sessionId: string): Promise<void>;
    stopOrchestration(sessionId: string): Promise<void>;

    onOrchestrationStep: Event<{ sessionId: string; step: string; details?: unknown }>;
    onOrchestrationError: Event<{ sessionId: string; error: Error }>;
}

interface OrchestrationState {
    sessionId: string;
    isRunning: boolean;
    isPaused: boolean;
    currentPhase: 'planning' | 'delegating' | 'executing' | 'reviewing' | 'synthesizing';
    loopHandle?: NodeJS.Timeout;
}

@injectable()
export class LeadAgentOrchestratorImpl implements LeadAgentOrchestrator {

    @inject(SwarmSessionManager)
    protected readonly sessionManager: SwarmSessionManager;

    @inject(TaskBoardService)
    protected readonly taskBoardService: TaskBoardService;

    @inject(SubAgentManager)
    protected readonly subAgentManager: SubAgentManager;

    @inject(MailboxService)
    protected readonly mailboxService: MailboxService;

    @inject(LanguageModelRegistry) @optional()
    protected readonly languageModelRegistry: LanguageModelRegistry | undefined;

    private readonly orchestrationStates = new Map<string, OrchestrationState>();

    private readonly onOrchestrationStepEmitter = new Emitter<{ sessionId: string; step: string; details?: unknown }>();
    readonly onOrchestrationStep = this.onOrchestrationStepEmitter.event;

    private readonly onOrchestrationErrorEmitter = new Emitter<{ sessionId: string; error: Error }>();
    readonly onOrchestrationError = this.onOrchestrationErrorEmitter.event;

    async startOrchestration(sessionId: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        const state: OrchestrationState = {
            sessionId,
            isRunning: true,
            isPaused: false,
            currentPhase: 'planning'
        };

        this.orchestrationStates.set(sessionId, state);

        console.info(`[LeadAgentOrchestrator] Starting orchestration for session ${sessionId}`);
        this.onOrchestrationStepEmitter.fire({ sessionId, step: 'started' });

        // Begin the orchestration loop
        await this.runOrchestrationLoop(sessionId);
    }

    async pauseOrchestration(sessionId: string): Promise<void> {
        const state = this.orchestrationStates.get(sessionId);
        if (state) {
            state.isPaused = true;
            if (state.loopHandle) {
                clearTimeout(state.loopHandle);
                state.loopHandle = undefined;
            }
            console.info(`[LeadAgentOrchestrator] Paused orchestration for session ${sessionId}`);
            this.onOrchestrationStepEmitter.fire({ sessionId, step: 'paused' });
        }
    }

    async resumeOrchestration(sessionId: string): Promise<void> {
        const state = this.orchestrationStates.get(sessionId);
        if (state && state.isPaused) {
            state.isPaused = false;
            console.info(`[LeadAgentOrchestrator] Resumed orchestration for session ${sessionId}`);
            this.onOrchestrationStepEmitter.fire({ sessionId, step: 'resumed' });
            await this.runOrchestrationLoop(sessionId);
        }
    }

    async stopOrchestration(sessionId: string): Promise<void> {
        const state = this.orchestrationStates.get(sessionId);
        if (state) {
            state.isRunning = false;
            state.isPaused = false;
            if (state.loopHandle) {
                clearTimeout(state.loopHandle);
            }
            this.orchestrationStates.delete(sessionId);
            console.info(`[LeadAgentOrchestrator] Stopped orchestration for session ${sessionId}`);
            this.onOrchestrationStepEmitter.fire({ sessionId, step: 'stopped' });
        }
    }

    private async runOrchestrationLoop(sessionId: string): Promise<void> {
        const state = this.orchestrationStates.get(sessionId);
        if (!state || !state.isRunning || state.isPaused) {
            return;
        }

        try {
            const session = await this.sessionManager.getSession(sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            // Execute the appropriate phase
            switch (session.status) {
                case 'planning':
                    await this.executePlanningPhase(session);
                    break;
                case 'delegating':
                    await this.executeDelegatingPhase(session);
                    break;
                case 'executing':
                    await this.executeExecutionPhase(session);
                    break;
                case 'reviewing':
                    await this.executeReviewingPhase(session);
                    break;
                case 'synthesizing':
                    await this.executeSynthesizingPhase(session);
                    break;
                case 'complete':
                case 'failed':
                case 'cancelled':
                    // Terminal states - stop the loop
                    state.isRunning = false;
                    return;
                default:
                    break;
            }

            // Schedule next iteration if still running
            if (state.isRunning && !state.isPaused) {
                state.loopHandle = setTimeout(
                    () => this.runOrchestrationLoop(sessionId),
                    DEFAULT_SWARM_CONFIGURATION.orchestrationIntervalMs || 1000
                );
            }
        } catch (error) {
            console.error(`[LeadAgentOrchestrator] Error in orchestration loop:`, error);
            this.onOrchestrationErrorEmitter.fire({
                sessionId,
                error: error instanceof Error ? error : new Error(String(error))
            });

            // Transition to failed state
            try {
                await this.sessionManager.transitionStatus(sessionId, 'failed');
            } catch (e) {
                console.error(`[LeadAgentOrchestrator] Failed to transition to failed state:`, e);
            }
        }
    }

    private async executePlanningPhase(session: SwarmSession): Promise<void> {
        this.onOrchestrationStepEmitter.fire({
            sessionId: session.id,
            step: 'planning',
            details: { task: session.originalTask }
        });

        // Check if we already have tasks created
        const existingTasks = await this.taskBoardService.getTasks(session.id);
        if (existingTasks.length > 0) {
            // Planning already done, move to delegating
            await this.sessionManager.transitionStatus(session.id, 'delegating');
            return;
        }

        // In a real implementation, this would call the LLM to decompose the task
        // For now, we create a placeholder task structure
        const decomposedTasks = await this.decomposeTask(session.originalTask);

        for (const taskInput of decomposedTasks) {
            await this.taskBoardService.createTask(session.id, taskInput);
        }

        // Broadcast planning complete
        await this.mailboxService.broadcast(
            session.id,
            'lead',
            `Planning phase complete. Created ${decomposedTasks.length} tasks.`,
            'info'
        );

        // Transition to delegating phase
        await this.sessionManager.transitionStatus(session.id, 'delegating');
    }

    private async executeDelegatingPhase(session: SwarmSession): Promise<void> {
        this.onOrchestrationStepEmitter.fire({
            sessionId: session.id,
            step: 'delegating'
        });

        // Get ready tasks (no unmet dependencies)
        const readyTasks = await this.taskBoardService.getReadyTasks(session.id);
        const idleAgents = await this.subAgentManager.getIdleAgents(session.id);

        // Spawn agents if needed
        for (const task of readyTasks) {
            if (task.assignedTo) {
                continue; // Already assigned
            }

            // Find an idle agent with the right role
            let agent = idleAgents.find(a => a.role === task.assignedRole);

            if (!agent) {
                // Check if we can spawn a new agent
                const currentAgents = await this.subAgentManager.getAgents(session.id);
                if (currentAgents.length < DEFAULT_SWARM_CONFIGURATION.maxConcurrentAgents) {
                    agent = await this.subAgentManager.spawnAgent(session.id, task.assignedRole || 'developer');
                }
            }

            if (agent) {
                await this.taskBoardService.assignTask(session.id, task.id, agent.id);
                await this.subAgentManager.assignTaskToAgent(session.id, agent.id, task.id);

                // Send task assignment message to agent
                await this.mailboxService.sendMessage(session.id, {
                    from: 'lead',
                    to: agent.id,
                    type: 'task_assignment',
                    subject: `Task Assignment: ${task.title}`,
                    content: this.formatTaskAssignment(task),
                    priority: task.priority === 'critical' ? 'urgent' : task.priority === 'high' ? 'high' : 'normal',
                    requiresResponse: true
                });
            }
        }

        // If all tasks are assigned or blocked, transition to executing
        const allTasks = await this.taskBoardService.getTasks(session.id);
        const unassignedReadyTasks = allTasks.filter(
            t => !t.assignedTo && t.status !== 'complete' && t.status !== 'failed'
        );

        if (unassignedReadyTasks.length === 0 || idleAgents.length === 0) {
            await this.sessionManager.transitionStatus(session.id, 'executing');
        }
    }

    private async executeExecutionPhase(session: SwarmSession): Promise<void> {
        this.onOrchestrationStepEmitter.fire({
            sessionId: session.id,
            step: 'executing'
        });

        const allTasks = await this.taskBoardService.getTasks(session.id);
        const readyTasks = await this.taskBoardService.getReadyTasks(session.id);

        // If there are ready tasks that need assignment, go back to delegating
        if (readyTasks.some(t => !t.assignedTo)) {
            await this.sessionManager.transitionStatus(session.id, 'delegating');
            return;
        }

        // Check for tasks needing review
        const reviewTasks = allTasks.filter(t => t.status === 'review');
        if (reviewTasks.length > 0) {
            await this.sessionManager.transitionStatus(session.id, 'reviewing');
            return;
        }

        // Check if all tasks are done
        const doneTasks = allTasks.filter(t => t.status === 'complete');
        const failedTasks = allTasks.filter(t => t.status === 'failed');

        if (doneTasks.length + failedTasks.length === allTasks.length) {
            // All tasks complete, move to synthesizing
            await this.sessionManager.transitionStatus(session.id, 'synthesizing');
            return;
        }

        // Otherwise, keep executing
        // In a real implementation, this would poll for agent progress
        // and handle agent completion callbacks
    }

    private async executeReviewingPhase(session: SwarmSession): Promise<void> {
        this.onOrchestrationStepEmitter.fire({
            sessionId: session.id,
            step: 'reviewing'
        });

        const allTasks = await this.taskBoardService.getTasks(session.id);
        const reviewTasks = allTasks.filter(t => t.status === 'review');

        // Assign review tasks to reviewer agents
        for (const task of reviewTasks) {
            // Find or spawn a reviewer
            const reviewerAgents = await this.subAgentManager.getAgentsByRole(session.id, 'reviewer');
            let reviewer = reviewerAgents.find(a => a.status === 'idle');

            if (!reviewer) {
                const currentAgents = await this.subAgentManager.getAgents(session.id);
                if (currentAgents.length < DEFAULT_SWARM_CONFIGURATION.maxConcurrentAgents) {
                    reviewer = await this.subAgentManager.spawnAgent(session.id, 'reviewer');
                }
            }

            if (reviewer) {
                // Send review request
                await this.mailboxService.sendMessage(session.id, {
                    from: 'lead',
                    to: reviewer.id,
                    type: 'code_review_request',
                    subject: `Review Request: ${task.title}`,
                    content: `Please review the completed work for task: ${task.title}\n\n${task.description}`,
                    priority: 'normal',
                    requiresResponse: true
                });
            }
        }

        // Check if all reviews are done
        if (reviewTasks.length === 0) {
            await this.sessionManager.transitionStatus(session.id, 'executing');
        }
    }

    private async executeSynthesizingPhase(session: SwarmSession): Promise<void> {
        this.onOrchestrationStepEmitter.fire({
            sessionId: session.id,
            step: 'synthesizing'
        });

        // Collect all results from completed tasks
        const allTasks = await this.taskBoardService.getTasks(session.id);
        const completedTasks = allTasks.filter(t => t.status === 'complete');
        const failedTasks = allTasks.filter(t => t.status === 'failed');

        // Calculate final metrics
        const session2 = await this.sessionManager.getSession(session.id);
        if (session2) {
            const metrics = { ...session2.metrics };
            metrics.tasksCompleted = completedTasks.length;
            metrics.tasksFailed = failedTasks.length;

            await this.sessionManager.updateSession(session.id, { metrics });
        }

        // Broadcast completion
        await this.mailboxService.broadcast(
            session.id,
            'lead',
            `Swarm completed. ${completedTasks.length} tasks completed, ${failedTasks.length} failed.`,
            'info'
        );

        // Terminate all agents
        await this.subAgentManager.terminateAllAgents(session.id);

        // Transition to complete
        await this.sessionManager.transitionStatus(session.id, 'complete');
    }

    private async decomposeTask(task: string): Promise<CreateTaskInput[]> {
        // Try to use LLM for intelligent task decomposition
        if (this.languageModelRegistry) {
            try {
                const llmTasks = await this.decomposeTaskWithLLM(task);
                if (llmTasks.length > 0) {
                    return llmTasks;
                }
            } catch (error) {
                console.warn('[LeadAgentOrchestrator] LLM task decomposition failed, using fallback:', error);
            }
        }

        // Fallback: return a simple default structure
        return this.getDefaultTaskDecomposition(task);
    }

    private async decomposeTaskWithLLM(task: string): Promise<CreateTaskInput[]> {
        if (!this.languageModelRegistry) {
            throw new Error('LanguageModelRegistry not available');
        }

        const model = await this.languageModelRegistry.getLanguageModel(
            DEFAULT_SWARM_CONFIGURATION.defaultLeadModel
        );

        if (!model) {
            throw new Error(`Language model not found: ${DEFAULT_SWARM_CONFIGURATION.defaultLeadModel}`);
        }

        const systemPrompt = `You are a software project manager AI. Your job is to decompose a user's task into smaller, actionable subtasks that can be assigned to specialized agents.

Available task types: design, implementation, refactoring, testing, review, documentation, configuration, research, integration

Available agent roles: architect, senior_dev, developer, junior_dev, reviewer, security, tester, documenter, devops, generalist

Output your response as a JSON array of tasks with this structure:
[
  {
    "title": "Short task title",
    "description": "Detailed description of what needs to be done",
    "type": "implementation",
    "priority": "high|medium|low",
    "requiredRole": "developer",
    "acceptanceCriteria": ["criterion 1", "criterion 2"],
    "dependencies": []
  }
]

Rules:
- Break down complex tasks into 3-8 subtasks
- Order tasks logically (design before implementation, implementation before testing)
- Assign appropriate roles based on task complexity
- Include clear acceptance criteria
- Set dependencies where tasks depend on others (use task index like "task_0", "task_1")`;

        const userMessage = `Please decompose this task into subtasks:\n\n${task}`;

        const request: UserRequest = {
            sessionId: uuid(),
            requestId: uuid(),
            messages: [
                { actor: 'system', type: 'text', text: systemPrompt },
                { actor: 'user', type: 'text', text: userMessage }
            ],
            response_format: { type: 'json_object' }
        };

        const cancellation = new CancellationTokenSource();
        const response = await model.request(request, cancellation.token);

        let responseText = '';

        if (isLanguageModelTextResponse(response)) {
            responseText = response.text;
        } else if (isLanguageModelStreamResponse(response)) {
            for await (const part of response.stream) {
                if (isTextResponsePart(part)) {
                    responseText += part.content;
                }
            }
        }

        // Parse the JSON response
        const parsed = this.parseTasksFromLLMResponse(responseText);
        return parsed;
    }

    private parseTasksFromLLMResponse(response: string): CreateTaskInput[] {
        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('No JSON array found in response');
            }

            const tasks = JSON.parse(jsonMatch[0]);

            if (!Array.isArray(tasks)) {
                throw new Error('Response is not an array');
            }

            // Map task indices to temporary IDs for dependencies
            const taskIdMap = new Map<string, string>();
            tasks.forEach((_, index) => {
                taskIdMap.set(`task_${index}`, uuid());
            });

            return tasks.map((task, index): CreateTaskInput => {
                const taskType = this.validateTaskType(task.type);
                const role = task.requiredRole || getRoleForTaskType(taskType);

                // Resolve dependencies from task indices to actual IDs
                const dependencies = (task.dependencies || [])
                    .map((dep: string) => taskIdMap.get(dep))
                    .filter((id: string | undefined): id is string => !!id);

                return {
                    title: task.title || `Task ${index + 1}`,
                    description: task.description || '',
                    type: taskType,
                    priority: this.validatePriority(task.priority),
                    requiredRole: role,
                    acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [],
                    dependencies,
                    estimatedTokens: task.estimatedTokens || 3000
                };
            });
        } catch (error) {
            console.error('[LeadAgentOrchestrator] Failed to parse LLM response:', error);
            throw error;
        }
    }

    private validateTaskType(type: string): TaskType {
        const validTypes: TaskType[] = [
            'design', 'implementation', 'refactoring', 'testing',
            'review', 'documentation', 'configuration', 'research', 'integration'
        ];
        return validTypes.includes(type as TaskType) ? type as TaskType : 'implementation';
    }

    private validatePriority(priority: string): 'critical' | 'high' | 'medium' | 'low' {
        const validPriorities = ['critical', 'high', 'medium', 'low'];
        return validPriorities.includes(priority) ? priority as 'critical' | 'high' | 'medium' | 'low' : 'medium';
    }

    private getDefaultTaskDecomposition(task: string): CreateTaskInput[] {
        return [
            {
                title: 'Analyze requirements',
                description: `Analyze the requirements for: ${task}`,
                type: 'research',
                requiredRole: 'architect',
                priority: 'high',
                acceptanceCriteria: ['Requirements documented', 'Scope defined', 'Risks identified'],
                estimatedTokens: 2000
            },
            {
                title: 'Design solution',
                description: `Design the solution architecture for: ${task}`,
                type: 'design',
                requiredRole: 'architect',
                priority: 'high',
                acceptanceCriteria: ['Architecture documented', 'Interfaces defined', 'Design reviewed'],
                estimatedTokens: 3000
            },
            {
                title: 'Implement solution',
                description: `Implement the designed solution for: ${task}`,
                type: 'implementation',
                requiredRole: 'senior_dev',
                priority: 'medium',
                acceptanceCriteria: ['Code complete', 'Follows design', 'No lint errors'],
                estimatedTokens: 5000
            },
            {
                title: 'Write tests',
                description: 'Write comprehensive tests for the implementation',
                type: 'testing',
                requiredRole: 'tester',
                priority: 'medium',
                acceptanceCriteria: ['Unit tests pass', 'Coverage > 80%', 'Edge cases covered'],
                estimatedTokens: 3000
            },
            {
                title: 'Code review',
                description: 'Review the implementation for quality and best practices',
                type: 'review',
                requiredRole: 'reviewer',
                priority: 'medium',
                acceptanceCriteria: ['No critical issues', 'Best practices followed', 'Documentation complete'],
                estimatedTokens: 2000
            }
        ];
    }

    private formatTaskAssignment(task: SwarmTask): string {
        return `
# Task Assignment

**Title:** ${task.title}
**Type:** ${task.type}
**Priority:** ${task.priority}

## Description
${task.description}

## Acceptance Criteria
${task.acceptanceCriteria?.map(c => `- ${c}`).join('\n') || 'Not specified'}

## Guidelines
- Follow existing code patterns and conventions
- Write clean, maintainable code
- Add appropriate tests
- Document your changes
- Ask questions if requirements are unclear

## Dependencies
${task.blockedBy?.length ? task.blockedBy.join(', ') : 'None'}
`;
    }
}
