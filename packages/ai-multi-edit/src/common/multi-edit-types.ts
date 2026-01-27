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

import { Event } from '@theia/core';

/**
 * Type of file change operation
 */
export enum FileChangeType {
    /** Create a new file */
    Create = 'create',
    /** Modify existing file content */
    Modify = 'modify',
    /** Delete a file */
    Delete = 'delete',
    /** Rename/move a file */
    Rename = 'rename'
}

/**
 * Status of an edit operation
 */
export enum EditOperationStatus {
    /** Operation is pending application */
    Pending = 'pending',
    /** Operation has been applied successfully */
    Applied = 'applied',
    /** Operation was rejected by user */
    Rejected = 'rejected',
    /** Operation failed to apply */
    Failed = 'failed',
    /** Operation was reverted */
    Reverted = 'reverted',
    /** Operation has conflicts that need resolution */
    Conflict = 'conflict'
}

/**
 * Represents a range in a file
 */
export interface FileRange {
    /** Start line (1-indexed) */
    startLine: number;
    /** Start column (1-indexed) */
    startColumn: number;
    /** End line (1-indexed) */
    endLine: number;
    /** End column (1-indexed) */
    endColumn: number;
}

/**
 * A single hunk in a diff
 */
export interface DiffHunk {
    /** Unique identifier for this hunk */
    id: string;
    /** Original file range */
    originalRange: FileRange;
    /** New file range */
    newRange: FileRange;
    /** Lines removed (without - prefix) */
    removedLines: string[];
    /** Lines added (without + prefix) */
    addedLines: string[];
    /** Context lines before */
    contextBefore: string[];
    /** Context lines after */
    contextAfter: string[];
    /** Whether this hunk is accepted */
    accepted: boolean;
}

/**
 * Represents a single file change
 */
export interface FileChange {
    /** Unique identifier for this change */
    id: string;
    /** Type of change */
    type: FileChangeType;
    /** File path (relative to workspace) */
    filePath: string;
    /** New file path (for rename operations) */
    newFilePath?: string;
    /** Original file content (for modify/delete) */
    originalContent?: string;
    /** New file content (for create/modify) */
    newContent?: string;
    /** Individual diff hunks (for modify operations) */
    hunks?: DiffHunk[];
    /** Language ID for syntax highlighting */
    languageId?: string;
}

/**
 * A single edit operation on a file
 */
export interface EditOperation {
    /** Unique identifier */
    id: string;
    /** The file change */
    change: FileChange;
    /** Current status */
    status: EditOperationStatus;
    /** Description of what this change does */
    description?: string;
    /** Error message if failed */
    error?: string;
    /** Timestamp when created */
    createdAt: number;
    /** Timestamp when applied */
    appliedAt?: number;
    /** Source of this edit (e.g., "ai-assistant", "user") */
    source: string;
}

/**
 * Session containing multiple edit operations
 */
export interface EditSession {
    /** Unique session identifier */
    id: string;
    /** Human-readable title */
    title: string;
    /** Description of the overall changes */
    description?: string;
    /** All operations in this session */
    operations: EditOperation[];
    /** Session status */
    status: EditSessionStatus;
    /** Timestamp when created */
    createdAt: number;
    /** Timestamp when completed */
    completedAt?: number;
    /** Source that initiated this session */
    source: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Status of an edit session
 */
export enum EditSessionStatus {
    /** Session is being built */
    Building = 'building',
    /** Session is ready for review */
    PendingReview = 'pending_review',
    /** Session is being applied */
    Applying = 'applying',
    /** All operations applied successfully */
    Completed = 'completed',
    /** Some operations failed */
    PartiallyCompleted = 'partially_completed',
    /** Session was cancelled */
    Cancelled = 'cancelled',
    /** Session was reverted */
    Reverted = 'reverted'
}

/**
 * Result of applying an edit session
 */
export interface EditSessionResult {
    /** The session that was applied */
    session: EditSession;
    /** Whether all operations succeeded */
    success: boolean;
    /** Number of successful operations */
    successCount: number;
    /** Number of failed operations */
    failedCount: number;
    /** Number of skipped/rejected operations */
    skippedCount: number;
    /** Error details for failed operations */
    errors: Array<{ operationId: string; error: string }>;
}

/**
 * Options for applying an edit session
 */
export interface ApplyOptions {
    /** Whether to create backup before applying */
    createBackup?: boolean;
    /** Whether to stop on first error */
    stopOnError?: boolean;
    /** Whether to show confirmation for each file */
    confirmEach?: boolean;
    /** Whether to auto-format after applying */
    formatAfterApply?: boolean;
    /** Whether to save files after applying */
    saveAfterApply?: boolean;
}

/**
 * Options for creating a diff
 */
export interface DiffOptions {
    /** Number of context lines */
    contextLines?: number;
    /** Whether to ignore whitespace changes */
    ignoreWhitespace?: boolean;
    /** Whether to ignore case */
    ignoreCase?: boolean;
}

/**
 * Conflict information when changes overlap
 */
export interface EditConflict {
    /** The operation with conflict */
    operation: EditOperation;
    /** Description of the conflict */
    description: string;
    /** Conflicting content from disk */
    diskContent: string;
    /** Expected content (what we thought was there) */
    expectedContent: string;
    /** Possible resolutions */
    resolutions: ConflictResolution[];
}

/**
 * Possible ways to resolve a conflict
 */
export interface ConflictResolution {
    /** Resolution type */
    type: 'keep-ours' | 'keep-theirs' | 'merge' | 'manual';
    /** Description */
    description: string;
    /** Resulting content if this resolution is chosen */
    resultContent?: string;
}

/**
 * Event fired when edit session changes
 */
export interface EditSessionChangeEvent {
    /** The session that changed */
    session: EditSession;
    /** Type of change */
    changeType: 'created' | 'updated' | 'operation-added' | 'operation-updated' | 'completed' | 'cancelled';
    /** Affected operation if applicable */
    operation?: EditOperation;
}

/**
 * Service for managing multi-file edits
 */
export const MultiEditService = Symbol('MultiEditService');
export interface MultiEditService {
    /**
     * Create a new edit session
     */
    createSession(title: string, source: string, description?: string): EditSession;

    /**
     * Get an existing session by ID
     */
    getSession(sessionId: string): EditSession | undefined;

    /**
     * Get all active sessions
     */
    getActiveSessions(): EditSession[];

    /**
     * Add an operation to a session
     */
    addOperation(sessionId: string, change: FileChange, description?: string): EditOperation;

    /**
     * Remove an operation from a session
     */
    removeOperation(sessionId: string, operationId: string): void;

    /**
     * Update operation status
     */
    updateOperationStatus(sessionId: string, operationId: string, status: EditOperationStatus): void;

    /**
     * Accept or reject a specific hunk
     */
    setHunkAccepted(sessionId: string, operationId: string, hunkId: string, accepted: boolean): void;

    /**
     * Preview changes without applying
     */
    preview(sessionId: string): Promise<EditSession>;

    /**
     * Apply all accepted operations in a session
     */
    apply(sessionId: string, options?: ApplyOptions): Promise<EditSessionResult>;

    /**
     * Revert applied changes
     */
    revert(sessionId: string): Promise<EditSessionResult>;

    /**
     * Cancel a session
     */
    cancel(sessionId: string): void;

    /**
     * Check for conflicts before applying
     */
    checkConflicts(sessionId: string): Promise<EditConflict[]>;

    /**
     * Generate diff for an operation
     */
    generateDiff(operation: EditOperation, options?: DiffOptions): string;

    /**
     * Event fired when sessions change
     */
    readonly onSessionChanged: Event<EditSessionChangeEvent>;
}

/**
 * Contribution interface for extending multi-edit functionality
 */
export const MultiEditContribution = Symbol('MultiEditContribution');
export interface MultiEditContribution {
    /**
     * Called before an operation is applied
     */
    onBeforeApply?(operation: EditOperation): Promise<boolean>;

    /**
     * Called after an operation is applied
     */
    onAfterApply?(operation: EditOperation, success: boolean): Promise<void>;
}
