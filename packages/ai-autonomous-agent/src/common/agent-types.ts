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
 * Represents an autonomous agent task
 */
export interface AgentTask {
    /** Unique identifier */
    id: string;
    /** Task description/goal */
    goal: string;
    /** Current status */
    status: AgentTaskStatus;
    /** Task priority */
    priority: TaskPriority;
    /** Created timestamp */
    createdAt: number;
    /** Started timestamp */
    startedAt?: number;
    /** Completed timestamp */
    completedAt?: number;
    /** Actions taken */
    actions: AgentAction[];
    /** Thoughts/reasoning */
    thoughts: AgentThought[];
    /** Files modified */
    modifiedFiles: string[];
    /** Commands executed */
    executedCommands: string[];
    /** Result summary */
    result?: TaskResult;
    /** Parent task ID (for subtasks) */
    parentTaskId?: string;
    /** Subtask IDs */
    subtaskIds: string[];
    /** Retry count */
    retryCount: number;
    /** Maximum retries */
    maxRetries: number;
    /** Context provided */
    context: TaskContext;
}

/**
 * Task status
 */
export enum AgentTaskStatus {
    Pending = 'pending',
    Planning = 'planning',
    Executing = 'executing',
    WaitingForApproval = 'waiting-approval',
    WaitingForInput = 'waiting-input',
    Paused = 'paused',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled'
}

/**
 * Task priority
 */
export enum TaskPriority {
    Low = 'low',
    Medium = 'medium',
    High = 'high',
    Critical = 'critical'
}

/**
 * Agent action
 */
export interface AgentAction {
    /** Action ID */
    id: string;
    /** Action type */
    type: ActionType;
    /** Action description */
    description: string;
    /** Action input/parameters */
    input: Record<string, unknown>;
    /** Action output */
    output?: unknown;
    /** Status */
    status: ActionStatus;
    /** Timestamp */
    timestamp: number;
    /** Duration in ms */
    duration?: number;
    /** Error if failed */
    error?: string;
    /** Whether this requires approval */
    requiresApproval: boolean;
    /** Whether approved (if requires approval) */
    approved?: boolean;
}

/**
 * Action type
 */
export enum ActionType {
    ReadFile = 'read-file',
    WriteFile = 'write-file',
    EditFile = 'edit-file',
    DeleteFile = 'delete-file',
    CreateDirectory = 'create-directory',
    ExecuteCommand = 'execute-command',
    SearchCode = 'search-code',
    SearchFiles = 'search-files',
    AnalyzeCode = 'analyze-code',
    GenerateCode = 'generate-code',
    RefactorCode = 'refactor-code',
    RunTests = 'run-tests',
    InstallDependency = 'install-dependency',
    GitOperation = 'git-operation',
    AskUser = 'ask-user',
    Think = 'think',
    Plan = 'plan',
    Delegate = 'delegate'
}

/**
 * Action status
 */
export enum ActionStatus {
    Pending = 'pending',
    Running = 'running',
    Completed = 'completed',
    Failed = 'failed',
    Skipped = 'skipped',
    Cancelled = 'cancelled'
}

/**
 * Agent thought/reasoning
 */
export interface AgentThought {
    /** Thought ID */
    id: string;
    /** Content */
    content: string;
    /** Type of thought */
    type: ThoughtType;
    /** Timestamp */
    timestamp: number;
    /** Related action ID */
    actionId?: string;
}

/**
 * Thought type
 */
export enum ThoughtType {
    Planning = 'planning',
    Reasoning = 'reasoning',
    Analysis = 'analysis',
    Decision = 'decision',
    Observation = 'observation',
    Reflection = 'reflection',
    Error = 'error'
}

/**
 * Task result
 */
export interface TaskResult {
    /** Success flag */
    success: boolean;
    /** Summary */
    summary: string;
    /** Detailed output */
    output?: string;
    /** Files created */
    filesCreated: string[];
    /** Files modified */
    filesModified: string[];
    /** Files deleted */
    filesDeleted: string[];
    /** Suggestions for next steps */
    nextSteps?: string[];
}

/**
 * Task context
 */
export interface TaskContext {
    /** Working directory */
    workingDirectory: string;
    /** Project type */
    projectType?: string;
    /** Language */
    language?: string;
    /** Relevant files */
    relevantFiles: string[];
    /** Environment variables */
    environment?: Record<string, string>;
    /** Custom context */
    custom?: Record<string, unknown>;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
    /** Agent enabled */
    enabled: boolean;
    /** Autonomous mode (no approval needed) */
    autonomousMode: boolean;
    /** Actions requiring approval in non-autonomous mode */
    approvalRequired: ActionType[];
    /** Maximum actions per task */
    maxActionsPerTask: number;
    /** Maximum subtask depth */
    maxSubtaskDepth: number;
    /** Default timeout per action (ms) */
    actionTimeout: number;
    /** Enable thinking/reasoning display */
    showThinking: boolean;
    /** Enable verbose logging */
    verboseLogging: boolean;
    /** Allowed directories (glob patterns) */
    allowedDirectories: string[];
    /** Blocked directories (glob patterns) */
    blockedDirectories: string[];
    /** Allowed commands */
    allowedCommands: string[];
    /** Blocked commands */
    blockedCommands: string[];
    /** Safety mode (extra confirmations) */
    safetyMode: boolean;
}

/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
    enabled: true,
    autonomousMode: false,
    approvalRequired: [
        ActionType.WriteFile,
        ActionType.EditFile,
        ActionType.DeleteFile,
        ActionType.ExecuteCommand,
        ActionType.GitOperation,
        ActionType.InstallDependency
    ],
    maxActionsPerTask: 100,
    maxSubtaskDepth: 3,
    actionTimeout: 60000,
    showThinking: true,
    verboseLogging: false,
    allowedDirectories: ['**/*'],
    blockedDirectories: ['**/node_modules/**', '**/.git/**'],
    allowedCommands: ['npm', 'yarn', 'pnpm', 'git', 'tsc', 'node', 'python', 'go', 'cargo', 'make'],
    blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
    safetyMode: true
};

/**
 * Agent capability
 */
export interface AgentCapability {
    /** Capability ID */
    id: string;
    /** Name */
    name: string;
    /** Description */
    description: string;
    /** Action types supported */
    supportedActions: ActionType[];
    /** Execute capability */
    execute(action: AgentAction, context: TaskContext): Promise<unknown>;
}

/**
 * Autonomous agent service interface
 */
export const AutonomousAgentService = Symbol('AutonomousAgentService');
export interface AutonomousAgentService {
    /** Start a new task */
    startTask(goal: string, context?: Partial<TaskContext>): Promise<AgentTask>;
    /** Get task by ID */
    getTask(taskId: string): AgentTask | undefined;
    /** Get all tasks */
    getAllTasks(): AgentTask[];
    /** Pause task */
    pauseTask(taskId: string): void;
    /** Resume task */
    resumeTask(taskId: string): Promise<void>;
    /** Cancel task */
    cancelTask(taskId: string): void;
    /** Approve pending action */
    approveAction(taskId: string, actionId: string): Promise<void>;
    /** Reject pending action */
    rejectAction(taskId: string, actionId: string, reason?: string): void;
    /** Provide user input */
    provideInput(taskId: string, input: string): Promise<void>;
    /** Get configuration */
    getConfig(): AgentConfig;
    /** Update configuration */
    updateConfig(config: Partial<AgentConfig>): void;
    /** Register capability */
    registerCapability(capability: AgentCapability): void;
    /** Check if task is running */
    isRunning(taskId: string): boolean;
    /** Subscribe to task updates */
    onTaskUpdated(callback: (task: AgentTask) => void): void;
    /** Subscribe to action execution */
    onActionExecuted(callback: (action: AgentAction, task: AgentTask) => void): void;
    /** Subscribe to thought generation */
    onThought(callback: (thought: AgentThought, task: AgentTask) => void): void;
    /** Subscribe to approval requests */
    onApprovalRequired(callback: (action: AgentAction, task: AgentTask) => void): void;
}

/**
 * Agent tool interface (for LLM tool calling)
 */
export interface AgentTool {
    /** Tool name */
    name: string;
    /** Description for LLM */
    description: string;
    /** Parameter schema */
    parameters: Record<string, ToolParameter>;
    /** Required parameters */
    required: string[];
    /** Execute tool */
    execute(params: Record<string, unknown>, context: TaskContext): Promise<unknown>;
}

/**
 * Tool parameter
 */
export interface ToolParameter {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    enum?: string[];
    items?: ToolParameter;
    properties?: Record<string, ToolParameter>;
}

/**
 * Agent memory
 */
export interface AgentMemory {
    /** Short-term memory (current session) */
    shortTerm: MemoryItem[];
    /** Long-term memory (persisted) */
    longTerm: MemoryItem[];
    /** Add to memory */
    add(item: Omit<MemoryItem, 'id' | 'timestamp'>): void;
    /** Search memory */
    search(query: string, limit?: number): MemoryItem[];
    /** Clear short-term memory */
    clearShortTerm(): void;
}

/**
 * Memory item
 */
export interface MemoryItem {
    id: string;
    type: 'fact' | 'decision' | 'error' | 'success' | 'observation';
    content: string;
    relevance: number;
    timestamp: number;
    taskId?: string;
}

/**
 * Agent state for persistence
 */
export interface AgentState {
    tasks: AgentTask[];
    config: AgentConfig;
    memory: MemoryItem[];
    lastUpdated: number;
}
