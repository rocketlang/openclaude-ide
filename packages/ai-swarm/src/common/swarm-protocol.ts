// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Event } from '@theia/core';

// ============================================================================
// RPC PATH
// ============================================================================

export const SWARM_SERVICE_PATH = '/services/ai-swarm';
export const swarmServicePath = SWARM_SERVICE_PATH;

// ============================================================================
// SWARM SESSION
// ============================================================================

export interface SwarmSession {
    readonly id: string;
    readonly name: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    status: SwarmStatus;

    /** Original task from user */
    readonly originalTask: string;

    /** Lead agent configuration */
    leadAgent: LeadAgentConfig;

    /** Task management */
    taskBoard: TaskBoard;

    /** Sub-agents (keyed by agent ID) */
    subAgents: Record<string, SubAgentInstance>;

    /** Communication */
    mailbox: AgentMailbox;

    /** Results */
    artifacts: SwarmArtifact[];
    finalReport?: string;

    /** Metrics */
    metrics: SwarmMetrics;
}

export type SwarmStatus =
    | 'initializing'
    | 'planning'
    | 'delegating'
    | 'executing'
    | 'reviewing'
    | 'synthesizing'
    | 'complete'
    | 'failed'
    | 'paused'
    | 'cancelled';

export interface LeadAgentConfig {
    model: string;
    systemPrompt: string;
    maxRetries: number;
    temperature: number;
}

export interface SwarmMetrics {
    totalTokensUsed: number;
    totalCost: number;
    tasksCompleted: number;
    tasksFailed: number;
    agentsSpawned: number;
    startTime?: number;
    endTime?: number;
    duration?: number;
}

// ============================================================================
// TASK BOARD
// ============================================================================

export interface TaskBoard {
    columns: TaskColumn[];
    tasks: Record<string, SwarmTask>;
    taskOrder: string[];
}

export interface TaskColumn {
    id: TaskColumnId;
    name: string;
    taskIds: string[];
    color: string;
}

export type TaskColumnId =
    | 'backlog'
    | 'ready'
    | 'in_progress'
    | 'review'
    | 'done'
    | 'failed';

export interface SwarmTask {
    readonly id: string;
    readonly createdAt: number;
    updatedAt: number;

    title: string;
    description: string;
    acceptanceCriteria: string[];

    type: TaskType;
    priority: TaskPriority;
    estimatedComplexity: TaskComplexity;

    status: TaskStatus;
    column: TaskColumnId;

    blockedBy: string[];
    blocks: string[];

    assignedRole?: AgentRole;
    assignedTo?: string;

    startedAt?: number;
    completedAt?: number;
    attempts: number;
    maxAttempts: number;

    result?: TaskResult;

    contextFiles: string[];
    requiredTools: string[];

    tags: string[];
    notes: string;
}

export type TaskType =
    | 'design'
    | 'implementation'
    | 'refactoring'
    | 'testing'
    | 'review'
    | 'documentation'
    | 'configuration'
    | 'research'
    | 'integration';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'epic';

export type TaskStatus =
    | 'pending'
    | 'ready'
    | 'assigned'
    | 'in_progress'
    | 'review'
    | 'revision'
    | 'blocked'
    | 'complete'
    | 'failed'
    | 'cancelled';

export interface TaskResult {
    success: boolean;
    summary: string;
    artifacts: string[];
    codeChanges?: CodeChange[];
    issues?: TaskIssue[];
    reviewComments?: ReviewComment[];
}

export interface CodeChange {
    filePath: string;
    changeType: 'create' | 'modify' | 'delete' | 'rename';
    diff?: string;
    newContent?: string;
}

export interface TaskIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    line?: number;
}

export interface ReviewComment {
    file: string;
    line: number;
    severity: 'critical' | 'major' | 'minor' | 'suggestion';
    message: string;
    suggestion?: string;
}

// ============================================================================
// SUB-AGENTS
// ============================================================================

export interface SubAgentInstance {
    readonly id: string;
    readonly sessionId: string;
    readonly createdAt: number;

    role: AgentRole;
    model: string;
    systemPrompt: string;

    contextWindowId: string;
    contextTokensUsed: number;
    contextTokensMax: number;

    status: SubAgentStatus;
    currentTaskId?: string;
    completedTasks: string[];
    failedTasks: string[];

    inbox: AgentMessage[];
    unreadCount: number;

    tokensUsed: number;
    apiCalls: number;
    startTime?: number;
    lastActivityTime?: number;

    worktreePath?: string;
}

export type AgentRole =
    | 'architect'
    | 'senior_dev'
    | 'developer'
    | 'junior_dev'
    | 'reviewer'
    | 'security'
    | 'tester'
    | 'documenter'
    | 'devops'
    | 'generalist';

export type SubAgentStatus =
    | 'initializing'
    | 'idle'
    | 'working'
    | 'waiting'
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'terminated';

export interface AgentRoleConfig {
    role: AgentRole;
    name: string;
    description: string;
    defaultModel: string;
    capabilities: string[];
    systemPromptTemplate: string;
    allowedTools: string[];
    maxConcurrentTasks: number;
    tokenBudget: number;
}

// ============================================================================
// MAILBOX & COMMUNICATION
// ============================================================================

export interface AgentMailbox {
    messages: AgentMessage[];
    broadcasts: BroadcastMessage[];
}

export interface AgentMessage {
    readonly id: string;
    readonly timestamp: number;
    readonly from: string;
    readonly to: string;

    type: MessageType;
    subject: string;
    content: string;

    priority: MessagePriority;
    requiresResponse: boolean;
    responseDeadline?: number;

    read: boolean;
    readAt?: number;

    threadId?: string;
    replyTo?: string;

    attachments?: MessageAttachment[];
}

export type MessageType =
    | 'task_assignment'
    | 'task_accepted'
    | 'task_rejected'
    | 'task_progress'
    | 'task_complete'
    | 'task_failed'
    | 'task_blocked'
    | 'question'
    | 'answer'
    | 'clarification_needed'
    | 'help_request'
    | 'code_review_request'
    | 'code_review_result'
    | 'revision_required'
    | 'approved'
    | 'merge_conflict'
    | 'dependency_resolved'
    | 'status_update'
    | 'artifact_ready'
    | 'system_notice'
    | 'warning'
    | 'error';

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface MessageAttachment {
    id: string;
    name: string;
    type: 'file' | 'code' | 'diff' | 'image' | 'json';
    content: string;
    mimeType?: string;
}

export interface BroadcastMessage {
    readonly id: string;
    readonly timestamp: number;
    readonly from: string;

    content: string;
    importance: 'info' | 'warning' | 'critical';
    acknowledgedBy: string[];
}

// ============================================================================
// ARTIFACTS
// ============================================================================

export interface SwarmArtifact {
    readonly id: string;
    readonly sessionId: string;
    readonly createdAt: number;
    readonly createdBy: string;

    type: ArtifactType;
    name: string;
    description: string;

    content: string;
    contentType: string;

    taskId?: string;
    tags: string[];
    version: number;

    filePath?: string;
    fileSize?: number;
}

export type ArtifactType =
    | 'design_doc'
    | 'source_code'
    | 'test_code'
    | 'documentation'
    | 'config'
    | 'report'
    | 'review'
    | 'diff'
    | 'log';

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

export const SwarmService = Symbol('SwarmService');

export interface SwarmService {
    // Session Management
    createSession(task: string, name?: string): Promise<SwarmSession>;
    getSession(sessionId: string): Promise<SwarmSession | undefined>;
    getSessions(): Promise<SwarmSession[]>;
    deleteSession(sessionId: string): Promise<boolean>;

    // Swarm Control
    startSwarm(sessionId: string): Promise<void>;
    pauseSwarm(sessionId: string): Promise<void>;
    resumeSwarm(sessionId: string): Promise<void>;
    cancelSwarm(sessionId: string): Promise<void>;

    // Task Management
    createTask(sessionId: string, input: CreateTaskInput): Promise<SwarmTask>;
    getTasks(sessionId: string): Promise<SwarmTask[]>;
    getTask(sessionId: string, taskId: string): Promise<SwarmTask | undefined>;
    updateTask(sessionId: string, taskId: string, updates: Partial<SwarmTask>): Promise<SwarmTask>;
    assignTask(sessionId: string, taskId: string, agentId: string): Promise<void>;
    completeTask(sessionId: string, taskId: string, result: TaskResult): Promise<void>;
    failTask(sessionId: string, taskId: string, error: string): Promise<void>;

    // Sub-Agent Management
    spawnAgent(sessionId: string, role: AgentRole): Promise<SubAgentInstance>;
    getSubAgents(sessionId: string): Promise<SubAgentInstance[]>;
    getSubAgent(sessionId: string, agentId: string): Promise<SubAgentInstance | undefined>;
    terminateAgent(sessionId: string, agentId: string): Promise<void>;

    // Communication
    sendMessage(sessionId: string, input: CreateMessageInput): Promise<AgentMessage>;
    getMessages(sessionId: string, filters?: MessageFilters): Promise<AgentMessage[]>;
    markMessageAsRead(sessionId: string, messageId: string): Promise<void>;
    broadcast(sessionId: string, from: string, content: string, importance: 'info' | 'warning' | 'critical'): Promise<BroadcastMessage>;
    getBroadcasts(sessionId: string): Promise<BroadcastMessage[]>;

    // Artifacts
    getArtifacts(sessionId: string): Promise<SwarmArtifact[]>;
    getArtifact(sessionId: string, artifactId: string): Promise<SwarmArtifact | undefined>;

    // Client registration for RPC
    setClient?(client: SwarmServiceClient): void;

    // Events
    onSessionUpdate: Event<SwarmSession>;
    onTaskUpdate: Event<{ sessionId: string; task: SwarmTask }>;
    onAgentUpdate: Event<{ sessionId: string; agent: SubAgentInstance }>;
    onNewMessage: Event<{ sessionId: string; message: AgentMessage }>;
    onArtifactCreated: Event<{ sessionId: string; artifact: SwarmArtifact }>;
}

export interface MessageFilters {
    from?: string;
    to?: string;
    type?: MessageType;
    unreadOnly?: boolean;
    since?: number;
    limit?: number;
}

// ============================================================================
// RPC CLIENT INTERFACE
// ============================================================================

export interface SwarmServiceClient {
    onSessionCreated(session: SwarmSession): void;
    onSessionUpdate(session: SwarmSession): void;
    onSessionDeleted(sessionId: string): void;
    onTaskCreated(sessionId: string, task: SwarmTask): void;
    onTaskUpdate(sessionId: string, task: SwarmTask): void;
    onAgentSpawned(sessionId: string, agent: SubAgentInstance): void;
    onAgentUpdate(sessionId: string, agent: SubAgentInstance): void;
    onAgentTerminated(sessionId: string, agentId: string): void;
    onNewMessage(sessionId: string, message: AgentMessage): void;
    onNewBroadcast(sessionId: string, broadcast: BroadcastMessage): void;
    onArtifactCreated(sessionId: string, artifact: SwarmArtifact): void;
}

// ============================================================================
// TASK INPUT TYPES
// ============================================================================

export interface CreateTaskInput {
    title: string;
    description: string;
    type: TaskType;
    priority?: TaskPriority;
    complexity?: TaskComplexity;
    acceptanceCriteria?: string[];
    blockedBy?: string[];
    dependencies?: string[];
    contextFiles?: string[];
    requiredTools?: string[];
    requiredRole?: AgentRole;
    estimatedTokens?: number;
    tags?: string[];
}

export interface CreateMessageInput {
    from: string;
    to: string;
    type: MessageType;
    subject: string;
    content: string;
    priority?: MessagePriority;
    requiresResponse?: boolean;
    responseDeadline?: number;
    threadId?: string;
    replyTo?: string;
    attachments?: MessageAttachment[];
}
