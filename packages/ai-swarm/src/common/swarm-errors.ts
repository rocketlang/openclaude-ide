// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export type SwarmErrorCode =
    // Session errors
    | 'SESSION_NOT_FOUND'
    | 'SESSION_ALREADY_EXISTS'
    | 'SESSION_INVALID_STATE'
    | 'SESSION_LIMIT_EXCEEDED'

    // Task errors
    | 'TASK_NOT_FOUND'
    | 'TASK_INVALID_STATE'
    | 'TASK_DEPENDENCY_CYCLE'
    | 'TASK_ALREADY_ASSIGNED'
    | 'TASK_LIMIT_EXCEEDED'

    // Agent errors
    | 'AGENT_NOT_FOUND'
    | 'AGENT_LIMIT_EXCEEDED'
    | 'AGENT_SPAWN_FAILED'
    | 'AGENT_EXECUTION_FAILED'
    | 'AGENT_TIMEOUT'

    // Communication errors
    | 'MESSAGE_DELIVERY_FAILED'
    | 'MESSAGE_TIMEOUT'
    | 'MESSAGE_NOT_FOUND'

    // Resource errors
    | 'TOKEN_BUDGET_EXCEEDED'
    | 'TIMEOUT_EXCEEDED'
    | 'CONTEXT_OVERFLOW'

    // Model errors
    | 'MODEL_NOT_AVAILABLE'
    | 'MODEL_RATE_LIMITED'
    | 'MODEL_API_ERROR'

    // Git errors
    | 'WORKTREE_CREATE_FAILED'
    | 'WORKTREE_CLEANUP_FAILED'
    | 'MERGE_CONFLICT'

    // Artifact errors
    | 'ARTIFACT_NOT_FOUND'
    | 'ARTIFACT_CREATE_FAILED'

    // General errors
    | 'CONFIGURATION_ERROR'
    | 'INTERNAL_ERROR'
    | 'NOT_IMPLEMENTED'
    | 'VALIDATION_ERROR';

export class SwarmError extends Error {
    constructor(
        message: string,
        public readonly code: SwarmErrorCode,
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'SwarmError';
        Object.setPrototypeOf(this, SwarmError.prototype);
    }

    toJSON(): object {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details
        };
    }
}

export function isSwarmError(error: unknown): error is SwarmError {
    return error instanceof SwarmError;
}

const DEFAULT_ERROR_MESSAGES: Record<SwarmErrorCode, string> = {
    SESSION_NOT_FOUND: 'Swarm session not found',
    SESSION_ALREADY_EXISTS: 'Swarm session already exists',
    SESSION_INVALID_STATE: 'Invalid session state for this operation',
    SESSION_LIMIT_EXCEEDED: 'Maximum concurrent sessions exceeded',

    TASK_NOT_FOUND: 'Task not found',
    TASK_INVALID_STATE: 'Invalid task state for this operation',
    TASK_DEPENDENCY_CYCLE: 'Circular dependency detected in tasks',
    TASK_ALREADY_ASSIGNED: 'Task is already assigned to an agent',
    TASK_LIMIT_EXCEEDED: 'Maximum tasks per session exceeded',

    AGENT_NOT_FOUND: 'Sub-agent not found',
    AGENT_LIMIT_EXCEEDED: 'Maximum concurrent agents exceeded',
    AGENT_SPAWN_FAILED: 'Failed to spawn sub-agent',
    AGENT_EXECUTION_FAILED: 'Agent execution failed',
    AGENT_TIMEOUT: 'Agent execution timed out',

    MESSAGE_DELIVERY_FAILED: 'Failed to deliver message',
    MESSAGE_TIMEOUT: 'Message response timeout',
    MESSAGE_NOT_FOUND: 'Message not found',

    TOKEN_BUDGET_EXCEEDED: 'Token budget exceeded',
    TIMEOUT_EXCEEDED: 'Operation timeout exceeded',
    CONTEXT_OVERFLOW: 'Context window overflow',

    MODEL_NOT_AVAILABLE: 'Language model not available',
    MODEL_RATE_LIMITED: 'Model rate limit reached',
    MODEL_API_ERROR: 'Model API error',

    WORKTREE_CREATE_FAILED: 'Failed to create git worktree',
    WORKTREE_CLEANUP_FAILED: 'Failed to cleanup git worktree',
    MERGE_CONFLICT: 'Git merge conflict detected',

    ARTIFACT_NOT_FOUND: 'Artifact not found',
    ARTIFACT_CREATE_FAILED: 'Failed to create artifact',

    CONFIGURATION_ERROR: 'Configuration error',
    INTERNAL_ERROR: 'Internal error',
    NOT_IMPLEMENTED: 'Feature not implemented',
    VALIDATION_ERROR: 'Validation error'
};

export function createSwarmError(
    code: SwarmErrorCode,
    message?: string,
    details?: Record<string, unknown>
): SwarmError {
    return new SwarmError(
        message || DEFAULT_ERROR_MESSAGES[code],
        code,
        details
    );
}

export function throwSwarmError(
    code: SwarmErrorCode,
    message?: string,
    details?: Record<string, unknown>
): never {
    throw createSwarmError(code, message, details);
}
