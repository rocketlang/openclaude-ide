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

import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import {
    PlanExecutorService,
    PlanStorageService,
    ExecutionPlan,
    PlanStep,
    PlanStatus,
    StepStatus,
    PlanProgress,
    PlanExecutionOptions
} from '../common';

interface ExecutionState {
    plan: ExecutionPlan;
    options: PlanExecutionOptions;
    isPaused: boolean;
    isCancelled: boolean;
    startTime: number;
    currentStepIndex: number;
}

/**
 * Service for executing plans step by step
 */
@injectable()
export class PlanExecutorServiceImpl implements PlanExecutorService {

    @inject(PlanStorageService)
    protected readonly storageService: PlanStorageService;

    protected executingPlans: Map<string, ExecutionState> = new Map();

    protected readonly onProgressEmitter = new Emitter<PlanProgress>();
    protected readonly onStepCompleteEmitter = new Emitter<{ planId: string; step: PlanStep }>();
    protected readonly onPlanCompleteEmitter = new Emitter<ExecutionPlan>();

    onProgress(callback: (progress: PlanProgress) => void): void {
        this.onProgressEmitter.event(callback);
    }

    onStepComplete(callback: (event: { planId: string; step: PlanStep }) => void): void {
        this.onStepCompleteEmitter.event(callback);
    }

    onPlanComplete(callback: (plan: ExecutionPlan) => void): void {
        this.onPlanCompleteEmitter.event(callback);
    }

    async execute(plan: ExecutionPlan, options?: PlanExecutionOptions): Promise<void> {
        const opts: PlanExecutionOptions = {
            autoApprove: false,
            pauseBeforeEach: false,
            stopOnFailure: true,
            maxRetries: 3,
            stepTimeout: 60000,
            ...options
        };

        // Check if already executing
        if (this.executingPlans.has(plan.id)) {
            throw new Error(`Plan ${plan.id} is already executing`);
        }

        // Initialize execution state
        const state: ExecutionState = {
            plan,
            options: opts,
            isPaused: false,
            isCancelled: false,
            startTime: Date.now(),
            currentStepIndex: 0
        };

        this.executingPlans.set(plan.id, state);

        // Update plan status
        plan.status = PlanStatus.Executing;
        plan.updatedAt = Date.now();

        // Mark ready steps
        this.updateReadySteps(plan);

        try {
            await this.executeSteps(state);

            // Check completion
            if (!state.isCancelled) {
                const allCompleted = plan.steps.every(s =>
                    s.status === StepStatus.Completed || s.status === StepStatus.Skipped
                );

                if (allCompleted) {
                    plan.status = PlanStatus.Completed;
                    plan.completedAt = Date.now();
                } else if (plan.steps.some(s => s.status === StepStatus.Failed)) {
                    plan.status = PlanStatus.Failed;
                }
            }

            plan.updatedAt = Date.now();
            await this.storageService.savePlan(plan);
            this.onPlanCompleteEmitter.fire(plan);

        } finally {
            this.executingPlans.delete(plan.id);
        }
    }

    pause(planId: string): void {
        const state = this.executingPlans.get(planId);
        if (state) {
            state.isPaused = true;
            state.plan.status = PlanStatus.Paused;
            state.plan.updatedAt = Date.now();
            this.fireProgress(state);
        }
    }

    async resume(planId: string): Promise<void> {
        const state = this.executingPlans.get(planId);
        if (state && state.isPaused) {
            state.isPaused = false;
            state.plan.status = PlanStatus.Executing;
            state.plan.updatedAt = Date.now();
            await this.executeSteps(state);
        }
    }

    cancel(planId: string): void {
        const state = this.executingPlans.get(planId);
        if (state) {
            state.isCancelled = true;
            state.plan.status = PlanStatus.Cancelled;
            state.plan.updatedAt = Date.now();
            this.executingPlans.delete(planId);
        }
    }

    async executeStep(planId: string, stepId: string): Promise<void> {
        const state = this.executingPlans.get(planId);
        if (!state) {
            throw new Error(`Plan ${planId} is not executing`);
        }

        const step = state.plan.steps.find(s => s.id === stepId);
        if (!step) {
            throw new Error(`Step ${stepId} not found`);
        }

        await this.runStep(state, step);
    }

    skipStep(planId: string, stepId: string): void {
        const state = this.executingPlans.get(planId);
        if (!state) {
            // Try to load from storage
            return;
        }

        const step = state.plan.steps.find(s => s.id === stepId);
        if (step) {
            step.status = StepStatus.Skipped;
            step.completedAt = Date.now();
            this.updateReadySteps(state.plan);
            this.fireProgress(state);
        }
    }

    async retryStep(planId: string, stepId: string): Promise<void> {
        const state = this.executingPlans.get(planId);
        if (!state) {
            throw new Error(`Plan ${planId} is not executing`);
        }

        const step = state.plan.steps.find(s => s.id === stepId);
        if (!step) {
            throw new Error(`Step ${stepId} not found`);
        }

        if (step.status !== StepStatus.Failed) {
            throw new Error(`Step ${stepId} has not failed`);
        }

        // Reset step
        step.status = StepStatus.Ready;
        step.error = undefined;
        step.startedAt = undefined;
        step.completedAt = undefined;

        await this.runStep(state, step);
    }

    getProgress(planId: string): PlanProgress | undefined {
        const state = this.executingPlans.get(planId);
        if (!state) {
            return undefined;
        }

        return this.calculateProgress(state);
    }

    isExecuting(planId: string): boolean {
        return this.executingPlans.has(planId);
    }

    protected async executeSteps(state: ExecutionState): Promise<void> {
        const { plan, options } = state;

        while (!state.isPaused && !state.isCancelled) {
            // Find next ready step
            const readySteps = plan.steps.filter(s => s.status === StepStatus.Ready);

            if (readySteps.length === 0) {
                // Check if any steps are still pending (dependencies not met)
                const pendingSteps = plan.steps.filter(s => s.status === StepStatus.Pending);
                if (pendingSteps.length === 0) {
                    break; // All done
                }

                // Check for stuck state (dependencies can't be met)
                const canProgress = pendingSteps.some(s => this.canStepBeReady(s, plan));
                if (!canProgress) {
                    break; // Stuck
                }

                continue;
            }

            // Execute ready steps (could parallelize in future)
            for (const step of readySteps) {
                if (state.isPaused || state.isCancelled) {
                    break;
                }

                if (options.pauseBeforeEach && !options.autoApprove) {
                    state.isPaused = true;
                    plan.status = PlanStatus.Paused;
                    this.fireProgress(state);
                    return;
                }

                await this.runStep(state, step);

                if (step.status === StepStatus.Failed && options.stopOnFailure) {
                    return;
                }
            }
        }
    }

    protected async runStep(state: ExecutionState, step: PlanStep): Promise<void> {
        const { plan, options } = state;

        step.status = StepStatus.InProgress;
        step.startedAt = Date.now();
        state.currentStepIndex = plan.steps.indexOf(step);
        this.fireProgress(state);

        let retries = 0;
        const maxRetries = options.maxRetries || 3;

        while (retries <= maxRetries) {
            try {
                // Simulate step execution (in real implementation, this would invoke AI)
                await this.simulateStepExecution(step, options.stepTimeout || 60000);

                step.status = StepStatus.Completed;
                step.completedAt = Date.now();
                step.output = `Step completed successfully`;

                // Update ready steps
                this.updateReadySteps(plan);
                this.onStepCompleteEmitter.fire({ planId: plan.id, step });
                this.fireProgress(state);

                // Save checkpoint
                await this.storageService.saveCheckpoint(plan.id, step.id, {
                    progress: 100,
                    timestamp: Date.now()
                });

                return;

            } catch (error) {
                retries++;

                if (retries > maxRetries) {
                    step.status = StepStatus.Failed;
                    step.error = error instanceof Error ? error.message : String(error);
                    step.completedAt = Date.now();
                    this.fireProgress(state);
                    return;
                }

                // Wait before retry
                await this.delay(1000 * retries);
            }
        }
    }

    protected async simulateStepExecution(step: PlanStep, _timeout: number): Promise<void> {
        // Simulate work based on complexity
        const baseTime = 500;
        const complexityMultiplier = step.complexity * 200;
        const simulatedTime = baseTime + complexityMultiplier + Math.random() * 500;

        await this.delay(simulatedTime);

        // Simulate occasional failures (10% chance)
        if (Math.random() < 0.1) {
            throw new Error('Simulated step failure');
        }
    }

    protected updateReadySteps(plan: ExecutionPlan): void {
        for (const step of plan.steps) {
            if (step.status === StepStatus.Pending) {
                if (this.canStepBeReady(step, plan)) {
                    step.status = StepStatus.Ready;
                }
            }
        }
    }

    protected canStepBeReady(step: PlanStep, plan: ExecutionPlan): boolean {
        if (step.dependencies.length === 0) {
            return true;
        }

        return step.dependencies.every(depId => {
            const depStep = plan.steps.find(s => s.id === depId);
            return depStep && (
                depStep.status === StepStatus.Completed ||
                depStep.status === StepStatus.Skipped
            );
        });
    }

    protected calculateProgress(state: ExecutionState): PlanProgress {
        const { plan } = state;
        const completed = plan.steps.filter(s =>
            s.status === StepStatus.Completed || s.status === StepStatus.Skipped
        ).length;

        const currentStep = plan.steps.find(s => s.status === StepStatus.InProgress);
        const elapsed = Date.now() - state.startTime;

        // Estimate remaining time
        let estimatedRemaining: number | undefined;
        if (completed > 0) {
            const avgTimePerStep = elapsed / completed;
            const remaining = plan.steps.length - completed;
            estimatedRemaining = avgTimePerStep * remaining;
        }

        return {
            planId: plan.id,
            totalSteps: plan.steps.length,
            completedSteps: completed,
            currentStep,
            percentComplete: Math.round((completed / plan.steps.length) * 100),
            estimatedTimeRemaining: estimatedRemaining,
            elapsedTime: elapsed
        };
    }

    protected fireProgress(state: ExecutionState): void {
        const progress = this.calculateProgress(state);
        this.onProgressEmitter.fire(progress);
    }

    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
