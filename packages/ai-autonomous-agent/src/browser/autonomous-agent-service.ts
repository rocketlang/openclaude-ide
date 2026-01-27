// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    AutonomousAgentService,
    AgentTask,
    AgentTaskStatus,
    AgentConfig,
    AgentAction,
    AgentThought,
    AgentCapability,
    TaskContext,
    TaskPriority,
    ActionType,
    ActionStatus,
    ThoughtType,
    DEFAULT_AGENT_CONFIG
} from '../common';

@injectable()
export class AutonomousAgentServiceImpl implements AutonomousAgentService {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected config: AgentConfig = { ...DEFAULT_AGENT_CONFIG };
    protected tasks: Map<string, AgentTask> = new Map();
    protected capabilities: Map<string, AgentCapability> = new Map();
    protected runningTasks: Set<string> = new Set();

    protected readonly onTaskUpdatedEmitter = new Emitter<AgentTask>();
    protected readonly onActionExecutedEmitter = new Emitter<{ action: AgentAction; task: AgentTask }>();
    protected readonly onThoughtEmitter = new Emitter<{ thought: AgentThought; task: AgentTask }>();
    protected readonly onApprovalRequiredEmitter = new Emitter<{ action: AgentAction; task: AgentTask }>();

    @postConstruct()
    protected init(): void {
        // Register default capabilities
        this.registerDefaultCapabilities();
    }

    async startTask(goal: string, context?: Partial<TaskContext>): Promise<AgentTask> {
        const workspaceRoot = this.workspaceService.tryGetRoots()[0]?.resource.toString() || '';

        const task: AgentTask = {
            id: this.generateId(),
            goal,
            status: AgentTaskStatus.Planning,
            priority: TaskPriority.Medium,
            createdAt: Date.now(),
            actions: [],
            thoughts: [],
            modifiedFiles: [],
            executedCommands: [],
            subtaskIds: [],
            retryCount: 0,
            maxRetries: 3,
            context: {
                workingDirectory: workspaceRoot,
                relevantFiles: [],
                ...context
            }
        };

        this.tasks.set(task.id, task);
        this.runningTasks.add(task.id);

        // Start execution loop
        this.executeTask(task).catch(error => {
            console.error('Task execution error:', error);
            task.status = AgentTaskStatus.Failed;
            task.result = {
                success: false,
                summary: `Task failed: ${error.message}`,
                filesCreated: [],
                filesModified: task.modifiedFiles,
                filesDeleted: []
            };
            this.onTaskUpdatedEmitter.fire(task);
        });

        return task;
    }

    getTask(taskId: string): AgentTask | undefined {
        return this.tasks.get(taskId);
    }

    getAllTasks(): AgentTask[] {
        return Array.from(this.tasks.values());
    }

    pauseTask(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (task && this.runningTasks.has(taskId)) {
            task.status = AgentTaskStatus.Paused;
            this.runningTasks.delete(taskId);
            this.onTaskUpdatedEmitter.fire(task);
        }
    }

    async resumeTask(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (task && task.status === AgentTaskStatus.Paused) {
            task.status = AgentTaskStatus.Executing;
            this.runningTasks.add(taskId);
            this.onTaskUpdatedEmitter.fire(task);
            await this.executeTask(task);
        }
    }

    cancelTask(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (task) {
            task.status = AgentTaskStatus.Cancelled;
            task.completedAt = Date.now();
            this.runningTasks.delete(taskId);
            this.onTaskUpdatedEmitter.fire(task);
        }
    }

    async approveAction(taskId: string, actionId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            return;
        }

        const action = task.actions.find(a => a.id === actionId);
        if (action && action.requiresApproval && action.status === ActionStatus.Pending) {
            action.approved = true;
            task.status = AgentTaskStatus.Executing;
            this.onTaskUpdatedEmitter.fire(task);
            await this.executeTask(task);
        }
    }

    rejectAction(taskId: string, actionId: string, reason?: string): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            return;
        }

        const action = task.actions.find(a => a.id === actionId);
        if (action && action.requiresApproval && action.status === ActionStatus.Pending) {
            action.approved = false;
            action.status = ActionStatus.Skipped;
            action.error = reason || 'Rejected by user';

            this.addThought(task, {
                content: `Action rejected: ${reason || 'No reason provided'}`,
                type: ThoughtType.Observation
            });

            this.onTaskUpdatedEmitter.fire(task);
        }
    }

    async provideInput(taskId: string, input: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (task && task.status === AgentTaskStatus.WaitingForInput) {
            this.addThought(task, {
                content: `User provided input: ${input}`,
                type: ThoughtType.Observation
            });

            task.status = AgentTaskStatus.Executing;
            this.onTaskUpdatedEmitter.fire(task);
            await this.executeTask(task);
        }
    }

    getConfig(): AgentConfig {
        return { ...this.config };
    }

    updateConfig(config: Partial<AgentConfig>): void {
        this.config = { ...this.config, ...config };
    }

    registerCapability(capability: AgentCapability): void {
        this.capabilities.set(capability.id, capability);
    }

    isRunning(taskId: string): boolean {
        return this.runningTasks.has(taskId);
    }

    onTaskUpdated(callback: (task: AgentTask) => void): void {
        this.onTaskUpdatedEmitter.event(callback);
    }

    onActionExecuted(callback: (action: AgentAction, task: AgentTask) => void): void {
        this.onActionExecutedEmitter.event(({ action, task }) => callback(action, task));
    }

    onThought(callback: (thought: AgentThought, task: AgentTask) => void): void {
        this.onThoughtEmitter.event(({ thought, task }) => callback(thought, task));
    }

    onApprovalRequired(callback: (action: AgentAction, task: AgentTask) => void): void {
        this.onApprovalRequiredEmitter.event(({ action, task }) => callback(action, task));
    }

    protected async executeTask(task: AgentTask): Promise<void> {
        if (!this.runningTasks.has(task.id)) {
            return;
        }

        task.startedAt = task.startedAt || Date.now();

        // Planning phase
        if (task.status === AgentTaskStatus.Planning) {
            await this.planTask(task);
        }

        // Execution loop
        while (this.runningTasks.has(task.id) && task.status === AgentTaskStatus.Executing) {
            // Check action limit
            if (task.actions.length >= this.config.maxActionsPerTask) {
                this.addThought(task, {
                    content: 'Reached maximum action limit',
                    type: ThoughtType.Observation
                });
                break;
            }

            // Determine next action
            const nextAction = await this.determineNextAction(task);
            if (!nextAction) {
                // Task complete
                break;
            }

            // Check if approval required
            if (this.requiresApproval(nextAction.type)) {
                nextAction.requiresApproval = true;
                nextAction.status = ActionStatus.Pending;
                task.actions.push(nextAction);
                task.status = AgentTaskStatus.WaitingForApproval;
                this.onApprovalRequiredEmitter.fire({ action: nextAction, task });
                this.onTaskUpdatedEmitter.fire(task);
                return;
            }

            // Execute action
            await this.executeAction(task, nextAction);
        }

        // Complete task
        if (this.runningTasks.has(task.id)) {
            this.completeTask(task);
        }
    }

    protected async planTask(task: AgentTask): Promise<void> {
        this.addThought(task, {
            content: `Planning approach for: ${task.goal}`,
            type: ThoughtType.Planning
        });

        // Analyze goal and create initial plan
        const plan = await this.analyzeGoal(task.goal, task.context);

        this.addThought(task, {
            content: `Plan created with ${plan.steps.length} steps`,
            type: ThoughtType.Planning
        });

        task.status = AgentTaskStatus.Executing;
        this.onTaskUpdatedEmitter.fire(task);
    }

    protected async analyzeGoal(goal: string, context: TaskContext): Promise<{ steps: string[] }> {
        // Simplified goal analysis
        // In production, this would use LLM to create detailed plan
        const steps: string[] = [];

        if (goal.toLowerCase().includes('create') || goal.toLowerCase().includes('add')) {
            steps.push('Analyze requirements');
            steps.push('Identify target location');
            steps.push('Generate code');
            steps.push('Write files');
            steps.push('Verify changes');
        } else if (goal.toLowerCase().includes('fix') || goal.toLowerCase().includes('bug')) {
            steps.push('Analyze error/issue');
            steps.push('Identify root cause');
            steps.push('Develop fix');
            steps.push('Apply fix');
            steps.push('Test fix');
        } else if (goal.toLowerCase().includes('refactor')) {
            steps.push('Analyze current code');
            steps.push('Plan refactoring');
            steps.push('Apply changes');
            steps.push('Run tests');
        } else {
            steps.push('Analyze task');
            steps.push('Execute task');
            steps.push('Verify result');
        }

        return { steps };
    }

    protected async determineNextAction(task: AgentTask): Promise<AgentAction | undefined> {
        // Simplified action determination
        // In production, this would use LLM to decide next action

        const completedActions = task.actions.filter(a => a.status === ActionStatus.Completed);
        const failedActions = task.actions.filter(a => a.status === ActionStatus.Failed);

        // If we have failures and haven't exceeded retries, try alternative
        if (failedActions.length > 0 && task.retryCount < task.maxRetries) {
            this.addThought(task, {
                content: 'Analyzing failed action to determine alternative approach',
                type: ThoughtType.Reasoning
            });
            task.retryCount++;
        }

        // Check if goal is achieved (simplified check)
        if (completedActions.length >= 3) {
            this.addThought(task, {
                content: 'Goal appears to be achieved based on completed actions',
                type: ThoughtType.Analysis
            });
            return undefined;
        }

        // Determine next action based on task state
        const nextActionType = this.determineActionType(task);
        if (!nextActionType) {
            return undefined;
        }

        return {
            id: this.generateId(),
            type: nextActionType,
            description: this.getActionDescription(nextActionType, task),
            input: {},
            status: ActionStatus.Pending,
            timestamp: Date.now(),
            requiresApproval: false
        };
    }

    protected determineActionType(task: AgentTask): ActionType | undefined {
        const completedTypes = new Set(
            task.actions
                .filter(a => a.status === ActionStatus.Completed)
                .map(a => a.type)
        );

        // Progressive action selection
        if (!completedTypes.has(ActionType.SearchCode)) {
            return ActionType.SearchCode;
        }
        if (!completedTypes.has(ActionType.AnalyzeCode)) {
            return ActionType.AnalyzeCode;
        }
        if (!completedTypes.has(ActionType.Think)) {
            return ActionType.Think;
        }
        if (!completedTypes.has(ActionType.GenerateCode)) {
            return ActionType.GenerateCode;
        }

        return undefined;
    }

    protected getActionDescription(type: ActionType, task: AgentTask): string {
        switch (type) {
            case ActionType.SearchCode:
                return `Search codebase for relevant files related to: ${task.goal}`;
            case ActionType.AnalyzeCode:
                return 'Analyze found code to understand current implementation';
            case ActionType.Think:
                return 'Reason about the best approach to achieve the goal';
            case ActionType.GenerateCode:
                return 'Generate code changes to achieve the goal';
            default:
                return `Execute ${type} action`;
        }
    }

    protected async executeAction(task: AgentTask, action: AgentAction): Promise<void> {
        action.status = ActionStatus.Running;
        task.actions.push(action);
        const startTime = Date.now();

        this.addThought(task, {
            content: `Executing: ${action.description}`,
            type: ThoughtType.Observation,
            actionId: action.id
        });

        this.onTaskUpdatedEmitter.fire(task);

        try {
            // Find capability for action type
            const capability = this.findCapabilityForAction(action.type);
            if (capability) {
                action.output = await capability.execute(action, task.context);
            } else {
                // Default execution (simulation)
                await this.simulateAction(action);
            }

            action.status = ActionStatus.Completed;
            action.duration = Date.now() - startTime;

            this.addThought(task, {
                content: `Completed: ${action.description}`,
                type: ThoughtType.Observation,
                actionId: action.id
            });

        } catch (error) {
            action.status = ActionStatus.Failed;
            action.error = error instanceof Error ? error.message : String(error);
            action.duration = Date.now() - startTime;

            this.addThought(task, {
                content: `Failed: ${action.description} - ${action.error}`,
                type: ThoughtType.Error,
                actionId: action.id
            });
        }

        this.onActionExecutedEmitter.fire({ action, task });
        this.onTaskUpdatedEmitter.fire(task);
    }

    protected async simulateAction(action: AgentAction): Promise<void> {
        // Simulate action execution
        await this.delay(500 + Math.random() * 500);
        action.output = { simulated: true, message: 'Action simulated successfully' };
    }

    protected completeTask(task: AgentTask): void {
        const completedActions = task.actions.filter(a => a.status === ActionStatus.Completed);
        const failedActions = task.actions.filter(a => a.status === ActionStatus.Failed);

        const success = failedActions.length === 0 || completedActions.length > failedActions.length;

        task.status = success ? AgentTaskStatus.Completed : AgentTaskStatus.Failed;
        task.completedAt = Date.now();
        task.result = {
            success,
            summary: success
                ? `Task completed successfully with ${completedActions.length} actions`
                : `Task failed with ${failedActions.length} failed actions`,
            filesCreated: [],
            filesModified: task.modifiedFiles,
            filesDeleted: [],
            nextSteps: success ? [] : ['Review failed actions', 'Try alternative approach']
        };

        this.runningTasks.delete(task.id);
        this.onTaskUpdatedEmitter.fire(task);
    }

    protected addThought(task: AgentTask, thought: Omit<AgentThought, 'id' | 'timestamp'>): void {
        const fullThought: AgentThought = {
            id: this.generateId(),
            timestamp: Date.now(),
            ...thought
        };
        task.thoughts.push(fullThought);
        this.onThoughtEmitter.fire({ thought: fullThought, task });
    }

    protected requiresApproval(actionType: ActionType): boolean {
        if (this.config.autonomousMode) {
            return false;
        }
        return this.config.approvalRequired.includes(actionType);
    }

    protected findCapabilityForAction(actionType: ActionType): AgentCapability | undefined {
        for (const capability of this.capabilities.values()) {
            if (capability.supportedActions.includes(actionType)) {
                return capability;
            }
        }
        return undefined;
    }

    protected registerDefaultCapabilities(): void {
        // Register basic capabilities
        // In production, more sophisticated capabilities would be registered
    }

    protected generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
