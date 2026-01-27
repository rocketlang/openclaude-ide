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
    SwarmTask,
    TaskStatus,
    TaskColumnId,
    TaskResult,
    CreateTaskInput
} from '../common/swarm-protocol';
import { SwarmSessionManager } from './swarm-session-manager';
import { createSwarmError } from '../common/swarm-errors';
import { DEFAULT_SWARM_CONFIGURATION } from '../common/swarm-configuration';

export const TaskBoardService = Symbol('TaskBoardService');

export interface TaskBoardService {
    createTask(sessionId: string, input: CreateTaskInput): Promise<SwarmTask>;
    getTask(sessionId: string, taskId: string): Promise<SwarmTask | undefined>;
    getTasks(sessionId: string): Promise<SwarmTask[]>;
    updateTask(sessionId: string, taskId: string, updates: Partial<SwarmTask>): Promise<SwarmTask>;
    deleteTask(sessionId: string, taskId: string): Promise<boolean>;

    assignTask(sessionId: string, taskId: string, agentId: string): Promise<void>;
    unassignTask(sessionId: string, taskId: string): Promise<void>;
    completeTask(sessionId: string, taskId: string, result: TaskResult): Promise<void>;
    failTask(sessionId: string, taskId: string, reason: string): Promise<void>;

    addDependency(sessionId: string, taskId: string, dependsOn: string): Promise<void>;
    removeDependency(sessionId: string, taskId: string, dependsOn: string): Promise<void>;

    getReadyTasks(sessionId: string): Promise<SwarmTask[]>;
    getTasksByStatus(sessionId: string, status: TaskStatus): Promise<SwarmTask[]>;
    getExecutionOrder(sessionId: string): Promise<SwarmTask[]>;

    onTaskCreated: Event<{ sessionId: string; task: SwarmTask }>;
    onTaskUpdated: Event<{ sessionId: string; task: SwarmTask }>;
    onTaskDeleted: Event<{ sessionId: string; taskId: string }>;
}

@injectable()
export class TaskBoardServiceImpl implements TaskBoardService {

    @inject(SwarmSessionManager)
    protected readonly sessionManager: SwarmSessionManager;

    private readonly onTaskCreatedEmitter = new Emitter<{ sessionId: string; task: SwarmTask }>();
    readonly onTaskCreated = this.onTaskCreatedEmitter.event;

    private readonly onTaskUpdatedEmitter = new Emitter<{ sessionId: string; task: SwarmTask }>();
    readonly onTaskUpdated = this.onTaskUpdatedEmitter.event;

    private readonly onTaskDeletedEmitter = new Emitter<{ sessionId: string; taskId: string }>();
    readonly onTaskDeleted = this.onTaskDeletedEmitter.event;

    async createTask(sessionId: string, input: CreateTaskInput): Promise<SwarmTask> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const taskCount = Object.keys(session.taskBoard.tasks).length;
        if (taskCount >= DEFAULT_SWARM_CONFIGURATION.maxTasksPerSession) {
            throw createSwarmError('TASK_LIMIT_EXCEEDED', undefined, {
                current: taskCount,
                max: DEFAULT_SWARM_CONFIGURATION.maxTasksPerSession
            });
        }

        const taskId = uuid();
        const now = Date.now();

        const task: SwarmTask = {
            id: taskId,
            createdAt: now,
            updatedAt: now,

            title: input.title,
            description: input.description,
            acceptanceCriteria: input.acceptanceCriteria || [],

            type: input.type,
            priority: input.priority || 'medium',
            estimatedComplexity: input.complexity || 'moderate',

            status: 'pending',
            column: 'backlog',

            blockedBy: input.blockedBy || [],
            blocks: [],

            attempts: 0,
            maxAttempts: 3,

            contextFiles: input.contextFiles || [],
            requiredTools: input.requiredTools || [],

            tags: input.tags || [],
            notes: ''
        };

        // Add to board
        session.taskBoard.tasks[taskId] = task;
        session.taskBoard.taskOrder.push(taskId);

        // Add to backlog column
        const backlogColumn = session.taskBoard.columns.find(c => c.id === 'backlog');
        if (backlogColumn) {
            backlogColumn.taskIds.push(taskId);
        }

        // Update blocks for dependencies
        for (const depId of task.blockedBy) {
            const depTask = session.taskBoard.tasks[depId];
            if (depTask && !depTask.blocks.includes(taskId)) {
                depTask.blocks.push(taskId);
            }
        }

        // Check if task is ready (no blockers or all blockers complete)
        if (await this.areAllDependenciesComplete(session, task)) {
            task.status = 'ready';
            task.column = 'ready';
            this.moveTaskToColumn(session, taskId, 'ready');
        }

        await this.sessionManager.updateSession(sessionId, { taskBoard: session.taskBoard });
        this.onTaskCreatedEmitter.fire({ sessionId, task });

        console.info(`[TaskBoardService] Created task ${taskId}: "${task.title}"`);

        return task;
    }

    async getTask(sessionId: string, taskId: string): Promise<SwarmTask | undefined> {
        const session = await this.sessionManager.getSession(sessionId);
        return session?.taskBoard.tasks[taskId];
    }

    async getTasks(sessionId: string): Promise<SwarmTask[]> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            return [];
        }
        return Object.values(session.taskBoard.tasks);
    }

    async updateTask(sessionId: string, taskId: string, updates: Partial<SwarmTask>): Promise<SwarmTask> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const task = session.taskBoard.tasks[taskId];
        if (!task) {
            throw createSwarmError('TASK_NOT_FOUND', undefined, { sessionId, taskId });
        }

        const updatedTask: SwarmTask = {
            ...task,
            ...updates,
            updatedAt: Date.now(),
            // Preserve readonly fields
            id: task.id,
            createdAt: task.createdAt
        };

        // Handle column change if status changed
        if (updates.status && updates.status !== task.status) {
            const newColumn = this.getColumnForStatus(updates.status);
            if (newColumn !== task.column) {
                this.moveTaskToColumn(session, taskId, newColumn);
                updatedTask.column = newColumn;
            }
        }

        session.taskBoard.tasks[taskId] = updatedTask;
        await this.sessionManager.updateSession(sessionId, { taskBoard: session.taskBoard });
        this.onTaskUpdatedEmitter.fire({ sessionId, task: updatedTask });

        return updatedTask;
    }

    async deleteTask(sessionId: string, taskId: string): Promise<boolean> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            return false;
        }

        const task = session.taskBoard.tasks[taskId];
        if (!task) {
            return false;
        }

        // Remove from column
        this.removeTaskFromColumn(session, taskId, task.column);

        // Remove from order
        session.taskBoard.taskOrder = session.taskBoard.taskOrder.filter(id => id !== taskId);

        // Remove from dependencies
        for (const t of Object.values(session.taskBoard.tasks)) {
            t.blockedBy = t.blockedBy.filter(id => id !== taskId);
            t.blocks = t.blocks.filter(id => id !== taskId);
        }

        // Delete task
        delete session.taskBoard.tasks[taskId];

        await this.sessionManager.updateSession(sessionId, { taskBoard: session.taskBoard });
        this.onTaskDeletedEmitter.fire({ sessionId, taskId });

        return true;
    }

    async assignTask(sessionId: string, taskId: string, agentId: string): Promise<void> {
        const task = await this.getTask(sessionId, taskId);
        if (!task) {
            throw createSwarmError('TASK_NOT_FOUND', undefined, { sessionId, taskId });
        }

        if (task.assignedTo) {
            throw createSwarmError('TASK_ALREADY_ASSIGNED', undefined, {
                sessionId, taskId, currentAgent: task.assignedTo, newAgent: agentId
            });
        }

        await this.updateTask(sessionId, taskId, {
            status: 'assigned',
            assignedTo: agentId,
            startedAt: Date.now()
        });

        console.info(`[TaskBoardService] Assigned task ${taskId} to agent ${agentId}`);
    }

    async unassignTask(sessionId: string, taskId: string): Promise<void> {
        const task = await this.getTask(sessionId, taskId);
        if (!task) {
            throw createSwarmError('TASK_NOT_FOUND', undefined, { sessionId, taskId });
        }

        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const newStatus = await this.areAllDependenciesComplete(session, task) ? 'ready' : 'pending';

        await this.updateTask(sessionId, taskId, {
            status: newStatus,
            assignedTo: undefined
        });
    }

    async completeTask(sessionId: string, taskId: string, result: TaskResult): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        await this.updateTask(sessionId, taskId, {
            status: 'complete',
            completedAt: Date.now(),
            result
        });

        // Update metrics
        session.metrics.tasksCompleted++;

        // Check if blocked tasks are now ready
        const task = session.taskBoard.tasks[taskId];
        for (const blockedId of task.blocks) {
            const blockedTask = session.taskBoard.tasks[blockedId];
            if (blockedTask && await this.areAllDependenciesComplete(session, blockedTask)) {
                if (blockedTask.status === 'pending' || blockedTask.status === 'blocked') {
                    await this.updateTask(sessionId, blockedId, { status: 'ready' });
                }
            }
        }

        await this.sessionManager.updateSession(sessionId, { metrics: session.metrics });

        console.info(`[TaskBoardService] Task ${taskId} completed`);
    }

    async failTask(sessionId: string, taskId: string, reason: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const task = session.taskBoard.tasks[taskId];
        if (!task) {
            throw createSwarmError('TASK_NOT_FOUND', undefined, { sessionId, taskId });
        }

        task.attempts++;

        if (task.attempts >= task.maxAttempts) {
            await this.updateTask(sessionId, taskId, {
                status: 'failed',
                attempts: task.attempts,
                result: {
                    success: false,
                    summary: reason,
                    artifacts: []
                }
            });
            session.metrics.tasksFailed++;
            await this.sessionManager.updateSession(sessionId, { metrics: session.metrics });

            console.warn(`[TaskBoardService] Task ${taskId} failed after ${task.attempts} attempts: ${reason}`);
        } else {
            // Retry - put back in ready
            await this.updateTask(sessionId, taskId, {
                status: 'ready',
                attempts: task.attempts,
                assignedTo: undefined
            });

            console.info(`[TaskBoardService] Task ${taskId} failed, will retry (attempt ${task.attempts}/${task.maxAttempts})`);
        }
    }

    async addDependency(sessionId: string, taskId: string, dependsOn: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const task = session.taskBoard.tasks[taskId];
        const depTask = session.taskBoard.tasks[dependsOn];

        if (!task || !depTask) {
            throw createSwarmError('TASK_NOT_FOUND', undefined, { sessionId, taskId, dependsOn });
        }

        // Check for cycles
        if (await this.wouldCreateCycle(session, taskId, dependsOn)) {
            throw createSwarmError('TASK_DEPENDENCY_CYCLE', undefined, { taskId, dependsOn });
        }

        if (!task.blockedBy.includes(dependsOn)) {
            task.blockedBy.push(dependsOn);
        }
        if (!depTask.blocks.includes(taskId)) {
            depTask.blocks.push(taskId);
        }

        // Update status if needed
        if (task.status === 'ready' && depTask.status !== 'complete') {
            task.status = 'pending';
            task.column = 'backlog';
            this.moveTaskToColumn(session, taskId, 'backlog');
        }

        await this.sessionManager.updateSession(sessionId, { taskBoard: session.taskBoard });
    }

    async removeDependency(sessionId: string, taskId: string, dependsOn: string): Promise<void> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            throw createSwarmError('SESSION_NOT_FOUND', undefined, { sessionId });
        }

        const task = session.taskBoard.tasks[taskId];
        const depTask = session.taskBoard.tasks[dependsOn];

        if (!task || !depTask) {
            throw createSwarmError('TASK_NOT_FOUND', undefined, { sessionId, taskId, dependsOn });
        }

        task.blockedBy = task.blockedBy.filter(id => id !== dependsOn);
        depTask.blocks = depTask.blocks.filter(id => id !== taskId);

        // Check if task is now ready
        if (task.status === 'pending' && await this.areAllDependenciesComplete(session, task)) {
            task.status = 'ready';
            task.column = 'ready';
            this.moveTaskToColumn(session, taskId, 'ready');
        }

        await this.sessionManager.updateSession(sessionId, { taskBoard: session.taskBoard });
    }

    async getReadyTasks(sessionId: string): Promise<SwarmTask[]> {
        return this.getTasksByStatus(sessionId, 'ready');
    }

    async getTasksByStatus(sessionId: string, status: TaskStatus): Promise<SwarmTask[]> {
        const tasks = await this.getTasks(sessionId);
        return tasks.filter(t => t.status === status);
    }

    async getExecutionOrder(sessionId: string): Promise<SwarmTask[]> {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
            return [];
        }

        // Topological sort
        const tasks = Object.values(session.taskBoard.tasks);
        const sorted: SwarmTask[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (task: SwarmTask) => {
            if (visited.has(task.id)) {
                return;
            }
            if (visiting.has(task.id)) {
                throw createSwarmError('TASK_DEPENDENCY_CYCLE');
            }

            visiting.add(task.id);

            for (const depId of task.blockedBy) {
                const dep = session.taskBoard.tasks[depId];
                if (dep) {
                    visit(dep);
                }
            }

            visiting.delete(task.id);
            visited.add(task.id);
            sorted.push(task);
        };

        for (const task of tasks) {
            visit(task);
        }

        return sorted;
    }

    private async areAllDependenciesComplete(session: any, task: SwarmTask): Promise<boolean> {
        for (const depId of task.blockedBy) {
            const dep = session.taskBoard.tasks[depId];
            if (!dep || dep.status !== 'complete') {
                return false;
            }
        }
        return true;
    }

    private async wouldCreateCycle(session: any, taskId: string, dependsOn: string): Promise<boolean> {
        const visited = new Set<string>();
        const queue = [dependsOn];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === taskId) {
                return true;
            }
            if (visited.has(current)) {
                continue;
            }

            visited.add(current);
            const task = session.taskBoard.tasks[current];
            if (task) {
                queue.push(...task.blockedBy);
            }
        }

        return false;
    }

    private getColumnForStatus(status: TaskStatus): TaskColumnId {
        const mapping: Record<TaskStatus, TaskColumnId> = {
            'pending': 'backlog',
            'ready': 'ready',
            'assigned': 'in_progress',
            'in_progress': 'in_progress',
            'review': 'review',
            'revision': 'in_progress',
            'blocked': 'backlog',
            'complete': 'done',
            'failed': 'failed',
            'cancelled': 'failed'
        };
        return mapping[status];
    }

    private moveTaskToColumn(session: any, taskId: string, newColumn: TaskColumnId): void {
        // Remove from all columns
        for (const col of session.taskBoard.columns) {
            col.taskIds = col.taskIds.filter((id: string) => id !== taskId);
        }
        // Add to new column
        const column = session.taskBoard.columns.find((c: any) => c.id === newColumn);
        if (column) {
            column.taskIds.push(taskId);
        }
    }

    private removeTaskFromColumn(session: any, taskId: string, column: TaskColumnId): void {
        const col = session.taskBoard.columns.find((c: any) => c.id === column);
        if (col) {
            col.taskIds = col.taskIds.filter((id: string) => id !== taskId);
        }
    }
}
