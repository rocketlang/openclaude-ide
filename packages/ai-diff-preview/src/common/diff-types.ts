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
 * Represents a single line change in a diff
 */
export interface DiffLine {
    /** Line number in original file (undefined for additions) */
    originalLineNumber?: number;
    /** Line number in modified file (undefined for deletions) */
    modifiedLineNumber?: number;
    /** The line content */
    content: string;
    /** Type of change */
    type: DiffLineType;
}

/**
 * Type of diff line
 */
export enum DiffLineType {
    Unchanged = 'unchanged',
    Added = 'added',
    Removed = 'removed',
    Modified = 'modified'
}

/**
 * A hunk is a contiguous group of changes
 */
export interface DiffHunk {
    /** Unique identifier for this hunk */
    id: string;
    /** Start line in original file */
    originalStart: number;
    /** Number of lines in original */
    originalLength: number;
    /** Start line in modified file */
    modifiedStart: number;
    /** Number of lines in modified */
    modifiedLength: number;
    /** Lines in this hunk */
    lines: DiffLine[];
    /** Current status of this hunk */
    status: HunkStatus;
    /** Optional description of the change */
    description?: string;
}

/**
 * Status of a diff hunk
 */
export enum HunkStatus {
    Pending = 'pending',
    Accepted = 'accepted',
    Rejected = 'rejected'
}

/**
 * Represents a complete file diff
 */
export interface FileDiff {
    /** Unique identifier */
    id: string;
    /** File path */
    filePath: string;
    /** Original file content */
    originalContent: string;
    /** Modified file content */
    modifiedContent: string;
    /** List of hunks */
    hunks: DiffHunk[];
    /** Overall status */
    status: DiffStatus;
    /** Timestamp when diff was created */
    createdAt: number;
    /** Source of the change (e.g., 'ai-chat', 'ai-agent') */
    source: string;
    /** Optional description */
    description?: string;
}

/**
 * Overall diff status
 */
export enum DiffStatus {
    Pending = 'pending',
    PartiallyAccepted = 'partially-accepted',
    Accepted = 'accepted',
    Rejected = 'rejected',
    Applied = 'applied'
}

/**
 * Pending change in the change tracker
 */
export interface PendingChange {
    /** The file diff */
    diff: FileDiff;
    /** Preview URI for the diff viewer */
    previewUri?: string;
}

/**
 * Diff computation options
 */
export interface DiffOptions {
    /** Number of context lines around changes */
    contextLines?: number;
    /** Ignore whitespace changes */
    ignoreWhitespace?: boolean;
    /** Ignore case changes */
    ignoreCase?: boolean;
    /** Trim trailing whitespace */
    trimTrailingWhitespace?: boolean;
}

/**
 * Default diff options
 */
export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
    contextLines: 3,
    ignoreWhitespace: false,
    ignoreCase: false,
    trimTrailingWhitespace: true
};

/**
 * Diff computation service interface
 */
export const DiffComputationService = Symbol('DiffComputationService');
export interface DiffComputationService {
    /** Compute diff between two strings */
    computeDiff(original: string, modified: string, options?: DiffOptions): FileDiff;
    /** Apply accepted hunks to original content */
    applyHunks(original: string, hunks: DiffHunk[]): string;
    /** Get the resulting content after applying accepted changes */
    getResultContent(diff: FileDiff): string;
}

/**
 * Change tracker service interface
 */
export const ChangeTrackerService = Symbol('ChangeTrackerService');
export interface ChangeTrackerService {
    /** Add a pending change */
    addChange(filePath: string, originalContent: string, modifiedContent: string, source: string, description?: string): FileDiff;
    /** Get all pending changes */
    getPendingChanges(): PendingChange[];
    /** Get pending change for a file */
    getChangeForFile(filePath: string): PendingChange | undefined;
    /** Accept a hunk */
    acceptHunk(diffId: string, hunkId: string): void;
    /** Reject a hunk */
    rejectHunk(diffId: string, hunkId: string): void;
    /** Accept all hunks in a diff */
    acceptAll(diffId: string): void;
    /** Reject all hunks in a diff */
    rejectAll(diffId: string): void;
    /** Apply accepted changes to file */
    applyChanges(diffId: string): Promise<void>;
    /** Discard a pending change */
    discardChange(diffId: string): void;
    /** Clear all pending changes */
    clearAll(): void;
    /** Get count of pending changes */
    getPendingCount(): number;
    /** Subscribe to change updates */
    onChangesUpdated(callback: (changes: PendingChange[]) => void): void;
}

/**
 * Diff preview widget service interface
 */
export const DiffPreviewService = Symbol('DiffPreviewService');
export interface DiffPreviewService {
    /** Show diff preview for a file */
    showPreview(diff: FileDiff): Promise<void>;
    /** Close diff preview */
    closePreview(diffId: string): void;
    /** Check if preview is open */
    isPreviewOpen(diffId: string): boolean;
}
