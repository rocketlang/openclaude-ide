// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Conventional commit types
 */
export type CommitType =
    | 'feat'      // New feature
    | 'fix'       // Bug fix
    | 'docs'      // Documentation only
    | 'style'     // Code style (formatting, etc)
    | 'refactor'  // Code refactoring
    | 'perf'      // Performance improvement
    | 'test'      // Adding/updating tests
    | 'build'     // Build system changes
    | 'ci'        // CI configuration
    | 'chore'     // Maintenance tasks
    | 'revert';   // Reverts a previous commit

/**
 * Represents a single file change in a commit
 */
export interface FileChange {
    /** File path */
    path: string;
    /** Change type: added, modified, deleted, renamed */
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    /** Number of lines added */
    additions: number;
    /** Number of lines deleted */
    deletions: number;
    /** Diff content (optional, for analysis) */
    diff?: string;
    /** Old path if renamed */
    oldPath?: string;
}

/**
 * Git diff analysis result
 */
export interface DiffAnalysis {
    /** Repository path */
    repositoryPath: string;
    /** List of changed files */
    files: FileChange[];
    /** Total lines added */
    totalAdditions: number;
    /** Total lines deleted */
    totalDeletions: number;
    /** Whether changes are staged or unstaged */
    staged: boolean;
    /** Summary of change types */
    changeTypes: {
        added: number;
        modified: number;
        deleted: number;
        renamed: number;
    };
    /** Detected patterns (e.g., "test files", "config changes") */
    patterns: string[];
}

/**
 * Generated commit message with metadata
 */
export interface GeneratedCommitMessage {
    /** The generated commit message */
    message: string;
    /** Commit type (conventional commit) */
    type: CommitType;
    /** Optional scope (e.g., component name) */
    scope?: string;
    /** Short description (first line) */
    subject: string;
    /** Optional body (detailed description) */
    body?: string;
    /** Optional breaking change note */
    breakingChange?: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Alternative suggestions */
    alternatives?: string[];
    /** Explanation of why this message was generated */
    reasoning?: string;
}

/**
 * Options for commit message generation
 */
export interface CommitMessageOptions {
    /** Include file list in body */
    includeFileList?: boolean;
    /** Maximum length for subject line */
    maxSubjectLength?: number;
    /** Use conventional commit format */
    conventionalCommit?: boolean;
    /** Preferred commit type (override AI decision) */
    preferredType?: CommitType;
    /** Custom scope to use */
    scope?: string;
    /** Language for the commit message */
    language?: 'en' | 'hi' | 'mr' | 'gu';
    /** Include emojis (gitmoji style) */
    useEmojis?: boolean;
    /** Number of alternative messages to generate */
    numAlternatives?: number;
}

/**
 * Commit message history entry
 */
export interface CommitMessageHistoryEntry {
    /** Unique ID */
    id: string;
    /** Timestamp */
    timestamp: number;
    /** Repository path */
    repositoryPath: string;
    /** Generated message */
    generatedMessage: string;
    /** Final message used (may be edited) */
    finalMessage: string;
    /** Whether user accepted without editing */
    acceptedAsIs: boolean;
    /** Diff analysis that was used */
    diffAnalysis: DiffAnalysis;
}

/**
 * Service path for RPC
 */
export const aiCommitServicePath = '/services/ai-commit';

/**
 * AI Commit Service - Backend service for generating commit messages
 */
export const AICommitService = Symbol('AICommitService');

export interface AICommitService {
    /**
     * Analyze git diff for a repository
     */
    analyzeDiff(repositoryPath: string, staged?: boolean): Promise<DiffAnalysis>;

    /**
     * Generate commit message based on diff analysis
     */
    generateCommitMessage(
        analysis: DiffAnalysis,
        options?: CommitMessageOptions
    ): Promise<GeneratedCommitMessage>;

    /**
     * Get commit history for learning
     */
    getRecentCommits(repositoryPath: string, count?: number): Promise<string[]>;

    /**
     * Record user's final commit message for learning
     */
    recordCommitMessage(entry: Omit<CommitMessageHistoryEntry, 'id' | 'timestamp'>): Promise<void>;

    /**
     * Get commit message suggestions based on history
     */
    getHistorySuggestions(repositoryPath: string): Promise<string[]>;
}

/**
 * Client interface for frontend notifications
 */
export interface AICommitServiceClient {
    /**
     * Called when a commit message is generated
     */
    onMessageGenerated?(message: GeneratedCommitMessage): void;

    /**
     * Called when generation fails
     */
    onGenerationError?(error: string): void;
}

/**
 * Gitmoji mapping for conventional commit types
 */
export const GITMOJI: Record<CommitType, string> = {
    feat: '✨',
    fix: '🐛',
    docs: '📝',
    style: '💄',
    refactor: '♻️',
    perf: '⚡',
    test: '✅',
    build: '📦',
    ci: '👷',
    chore: '🔧',
    revert: '⏪'
};

/**
 * Human-readable labels for commit types
 */
export const COMMIT_TYPE_LABELS: Record<CommitType, string> = {
    feat: 'Feature',
    fix: 'Bug Fix',
    docs: 'Documentation',
    style: 'Code Style',
    refactor: 'Refactoring',
    perf: 'Performance',
    test: 'Tests',
    build: 'Build System',
    ci: 'CI/CD',
    chore: 'Maintenance',
    revert: 'Revert'
};

/**
 * Format a commit message in conventional commit format
 */
export function formatConventionalCommit(
    type: CommitType,
    subject: string,
    options?: {
        scope?: string;
        body?: string;
        breakingChange?: string;
        useEmoji?: boolean;
    }
): string {
    const emoji = options?.useEmoji ? `${GITMOJI[type]} ` : '';
    const scope = options?.scope ? `(${options.scope})` : '';
    const breaking = options?.breakingChange ? '!' : '';

    let message = `${emoji}${type}${scope}${breaking}: ${subject}`;

    if (options?.body) {
        message += `\n\n${options.body}`;
    }

    if (options?.breakingChange) {
        message += `\n\nBREAKING CHANGE: ${options.breakingChange}`;
    }

    return message;
}
