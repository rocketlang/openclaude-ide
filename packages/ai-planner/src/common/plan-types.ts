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

/**
 * Represents a step in an execution plan
 */
export interface PlanStep {
    /** Unique identifier */
    id: string;
    /** Step number (1-indexed) */
    number: number;
    /** Step title/summary */
    title: string;
    /** Detailed description */
    description: string;
    /** Current status */
    status: StepStatus;
    /** Step type */
    type: StepType;
    /** Dependencies - IDs of steps that must complete first */
    dependencies: string[];
    /** Estimated effort/complexity (1-5) */
    complexity: number;
    /** Files that will be affected */
    affectedFiles?: string[];
    /** Output/result of the step */
    output?: string;
    /** Error message if failed */
    error?: string;
    /** Start timestamp */
    startedAt?: number;
    /** Completion timestamp */
    completedAt?: number;
    /** Checkpoint data for resume */
    checkpoint?: StepCheckpoint;
}

/**
 * Status of a plan step
 */
export enum StepStatus {
    Pending = 'pending',
    Ready = 'ready',
    InProgress = 'in-progress',
    Paused = 'paused',
    Completed = 'completed',
    Failed = 'failed',
    Skipped = 'skipped'
}

/**
 * Type of plan step
 */
export enum StepType {
    Analysis = 'analysis',
    FileCreate = 'file-create',
    FileModify = 'file-modify',
    FileDelete = 'file-delete',
    CodeGeneration = 'code-generation',
    Refactor = 'refactor',
    Test = 'test',
    Documentation = 'documentation',
    Review = 'review',
    Deploy = 'deploy',
    Custom = 'custom'
}

/**
 * Checkpoint data for resuming a step
 */
export interface StepCheckpoint {
    /** Progress percentage (0-100) */
    progress: number;
    /** Last processed item */
    lastItem?: string;
    /** Custom checkpoint data */
    data?: Record<string, unknown>;
    /** Timestamp */
    timestamp: number;
}

/**
 * Represents a complete execution plan
 */
export interface ExecutionPlan {
    /** Unique identifier */
    id: string;
    /** Plan title */
    title: string;
    /** Plan description */
    description: string;
    /** Original user prompt */
    prompt: string;
    /** List of steps */
    steps: PlanStep[];
    /** Current status */
    status: PlanStatus;
    /** Creation timestamp */
    createdAt: number;
    /** Last update timestamp */
    updatedAt: number;
    /** Completion timestamp */
    completedAt?: number;
    /** Total estimated complexity */
    totalComplexity: number;
    /** Tags for categorization */
    tags?: string[];
    /** Plan metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Status of an execution plan
 */
export enum PlanStatus {
    Draft = 'draft',
    Ready = 'ready',
    Executing = 'executing',
    Paused = 'paused',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled'
}

/**
 * Progress information for a plan
 */
export interface PlanProgress {
    /** Plan ID */
    planId: string;
    /** Total steps */
    totalSteps: number;
    /** Completed steps */
    completedSteps: number;
    /** Current step (if executing) */
    currentStep?: PlanStep;
    /** Percentage complete */
    percentComplete: number;
    /** Estimated time remaining (ms) */
    estimatedTimeRemaining?: number;
    /** Elapsed time (ms) */
    elapsedTime: number;
}

/**
 * Options for plan generation
 */
export interface PlanGenerationOptions {
    /** Maximum number of steps */
    maxSteps?: number;
    /** Include test steps */
    includeTests?: boolean;
    /** Include documentation steps */
    includeDocs?: boolean;
    /** Complexity preference (simple, balanced, thorough) */
    complexity?: 'simple' | 'balanced' | 'thorough';
    /** Context files to consider */
    contextFiles?: string[];
}

/**
 * Options for plan execution
 */
export interface PlanExecutionOptions {
    /** Auto-approve all steps */
    autoApprove?: boolean;
    /** Pause before each step */
    pauseBeforeEach?: boolean;
    /** Stop on first failure */
    stopOnFailure?: boolean;
    /** Maximum retries per step */
    maxRetries?: number;
    /** Step timeout (ms) */
    stepTimeout?: number;
}

/**
 * Plan template for common tasks
 */
export interface PlanTemplate {
    /** Template ID */
    id: string;
    /** Template name */
    name: string;
    /** Description */
    description: string;
    /** Category */
    category: string;
    /** Template steps */
    steps: Omit<PlanStep, 'id' | 'status' | 'startedAt' | 'completedAt'>[];
    /** Variables that can be customized */
    variables?: string[];
}

/**
 * Default plan templates
 */
export const DEFAULT_PLAN_TEMPLATES: PlanTemplate[] = [
    {
        id: 'new-feature',
        name: 'New Feature',
        description: 'Add a new feature to the codebase',
        category: 'Development',
        steps: [
            { number: 1, title: 'Analyze requirements', description: 'Understand feature requirements', type: StepType.Analysis, dependencies: [], complexity: 2 },
            { number: 2, title: 'Design solution', description: 'Design the implementation approach', type: StepType.Analysis, dependencies: [], complexity: 3 },
            { number: 3, title: 'Create files', description: 'Create new files needed', type: StepType.FileCreate, dependencies: [], complexity: 2 },
            { number: 4, title: 'Implement feature', description: 'Write the feature code', type: StepType.CodeGeneration, dependencies: [], complexity: 4 },
            { number: 5, title: 'Add tests', description: 'Write unit tests', type: StepType.Test, dependencies: [], complexity: 3 },
            { number: 6, title: 'Update documentation', description: 'Document the new feature', type: StepType.Documentation, dependencies: [], complexity: 2 }
        ],
        variables: ['featureName', 'targetFile']
    },
    {
        id: 'bug-fix',
        name: 'Bug Fix',
        description: 'Fix a bug in the codebase',
        category: 'Maintenance',
        steps: [
            { number: 1, title: 'Reproduce bug', description: 'Understand and reproduce the issue', type: StepType.Analysis, dependencies: [], complexity: 2 },
            { number: 2, title: 'Identify root cause', description: 'Find the source of the bug', type: StepType.Analysis, dependencies: [], complexity: 3 },
            { number: 3, title: 'Implement fix', description: 'Fix the bug', type: StepType.FileModify, dependencies: [], complexity: 3 },
            { number: 4, title: 'Add regression test', description: 'Add test to prevent recurrence', type: StepType.Test, dependencies: [], complexity: 2 },
            { number: 5, title: 'Verify fix', description: 'Confirm the bug is resolved', type: StepType.Review, dependencies: [], complexity: 1 }
        ],
        variables: ['bugDescription', 'affectedFile']
    },
    {
        id: 'refactor',
        name: 'Code Refactoring',
        description: 'Refactor existing code',
        category: 'Maintenance',
        steps: [
            { number: 1, title: 'Analyze current code', description: 'Understand existing implementation', type: StepType.Analysis, dependencies: [], complexity: 2 },
            { number: 2, title: 'Plan refactoring', description: 'Design the refactoring approach', type: StepType.Analysis, dependencies: [], complexity: 3 },
            { number: 3, title: 'Refactor code', description: 'Apply refactoring changes', type: StepType.Refactor, dependencies: [], complexity: 4 },
            { number: 4, title: 'Update tests', description: 'Update tests for new structure', type: StepType.Test, dependencies: [], complexity: 2 },
            { number: 5, title: 'Verify behavior', description: 'Ensure functionality unchanged', type: StepType.Review, dependencies: [], complexity: 2 }
        ],
        variables: ['targetCode', 'refactorType']
    }
];

/**
 * Plan generator service interface
 */
export const PlanGeneratorService = Symbol('PlanGeneratorService');
export interface PlanGeneratorService {
    /** Generate a plan from a prompt */
    generatePlan(prompt: string, options?: PlanGenerationOptions): Promise<ExecutionPlan>;
    /** Generate plan from template */
    fromTemplate(templateId: string, variables: Record<string, string>): ExecutionPlan;
    /** Get available templates */
    getTemplates(): PlanTemplate[];
}

/**
 * Plan executor service interface
 */
export const PlanExecutorService = Symbol('PlanExecutorService');
export interface PlanExecutorService {
    /** Execute a plan */
    execute(plan: ExecutionPlan, options?: PlanExecutionOptions): Promise<void>;
    /** Pause execution */
    pause(planId: string): void;
    /** Resume execution */
    resume(planId: string): Promise<void>;
    /** Cancel execution */
    cancel(planId: string): void;
    /** Execute single step */
    executeStep(planId: string, stepId: string): Promise<void>;
    /** Skip a step */
    skipStep(planId: string, stepId: string): void;
    /** Retry a failed step */
    retryStep(planId: string, stepId: string): Promise<void>;
    /** Get execution progress */
    getProgress(planId: string): PlanProgress | undefined;
    /** Check if plan is executing */
    isExecuting(planId: string): boolean;
    /** Subscribe to progress updates */
    onProgress(callback: (progress: PlanProgress) => void): void;
    /** Subscribe to step completion */
    onStepComplete(callback: (event: { planId: string; step: PlanStep }) => void): void;
    /** Subscribe to plan completion */
    onPlanComplete(callback: (plan: ExecutionPlan) => void): void;
}

/**
 * Plan storage service interface
 */
export const PlanStorageService = Symbol('PlanStorageService');
export interface PlanStorageService {
    /** Save a plan */
    savePlan(plan: ExecutionPlan): Promise<void>;
    /** Load a plan */
    loadPlan(planId: string): Promise<ExecutionPlan | undefined>;
    /** List all plans */
    listPlans(): Promise<ExecutionPlan[]>;
    /** Delete a plan */
    deletePlan(planId: string): Promise<void>;
    /** Save checkpoint */
    saveCheckpoint(planId: string, stepId: string, checkpoint: StepCheckpoint): Promise<void>;
}
