// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const AICodeReviewService = Symbol('AICodeReviewService');
export const aiCodeReviewServicePath = '/services/ai-code-review';

/**
 * Severity levels for code review issues
 */
export type ReviewSeverity = 'blocker' | 'critical' | 'major' | 'minor' | 'info';

/**
 * Categories for code review issues
 */
export type ReviewCategory =
    | 'security'
    | 'performance'
    | 'reliability'
    | 'maintainability'
    | 'style'
    | 'documentation'
    | 'testing'
    | 'best-practice'
    | 'bug'
    | 'code-smell';

/**
 * A single code review issue
 */
export interface ReviewIssue {
    id: string;
    severity: ReviewSeverity;
    category: ReviewCategory;
    title: string;
    message: string;
    explanation?: string;
    file: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    code?: string;
    rule?: string;
    suggestedFix?: ReviewFix;
    relatedIssues?: string[];
}

/**
 * A suggested fix for a review issue
 */
export interface ReviewFix {
    title: string;
    description: string;
    confidence: 'high' | 'medium' | 'low';
    edits: ReviewEdit[];
    isPreferred?: boolean;
}

/**
 * A text edit for a fix
 */
export interface ReviewEdit {
    file: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    newText: string;
}

/**
 * Request for code review
 */
export interface ReviewRequest {
    files: string[];
    content?: Record<string, string>;
    language?: string;
    options?: ReviewOptions;
}

/**
 * Options for code review
 */
export interface ReviewOptions {
    categories?: ReviewCategory[];
    minSeverity?: ReviewSeverity;
    maxIssues?: number;
    includeExplanations?: boolean;
    includeFixes?: boolean;
    rules?: string[];
    ignoreRules?: string[];
    checkSecurity?: boolean;
    checkPerformance?: boolean;
    checkStyle?: boolean;
}

/**
 * Result of a code review
 */
export interface ReviewResult {
    id: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    files: string[];
    issues: ReviewIssue[];
    summary: ReviewSummary;
    startedAt: string;
    completedAt?: string;
    error?: string;
}

/**
 * Summary of code review results
 */
export interface ReviewSummary {
    totalIssues: number;
    bySeverity: Record<ReviewSeverity, number>;
    byCategory: Record<ReviewCategory, number>;
    filesReviewed: number;
    linesReviewed: number;
    score?: number;
    grade?: 'A' | 'B' | 'C' | 'D' | 'F';
    recommendations?: string[];
}

/**
 * Progress update during review
 */
export interface ReviewProgress {
    reviewId: string;
    phase: 'parsing' | 'analyzing' | 'ai-review' | 'generating-fixes' | 'completed';
    progress: number;
    currentFile?: string;
    issuesFound?: number;
}

/**
 * Result of applying a fix
 */
export interface ApplyFixResult {
    success: boolean;
    message?: string;
    appliedEdits?: number;
}

/**
 * Code review service interface
 */
export interface AICodeReviewService {
    /**
     * Start a code review
     */
    startReview(request: ReviewRequest): Promise<ReviewResult>;

    /**
     * Get a review by ID
     */
    getReview(reviewId: string): Promise<ReviewResult | undefined>;

    /**
     * Review a single file
     */
    reviewFile(uri: string, content: string, language: string, options?: ReviewOptions): Promise<ReviewIssue[]>;

    /**
     * Review selected code
     */
    reviewSelection(
        uri: string,
        content: string,
        startLine: number,
        endLine: number,
        language: string,
        options?: ReviewOptions
    ): Promise<ReviewIssue[]>;

    /**
     * Get issues for a file
     */
    getFileIssues(uri: string): Promise<ReviewIssue[]>;

    /**
     * Apply a fix
     */
    applyFix(issue: ReviewIssue): Promise<ApplyFixResult>;

    /**
     * Dismiss an issue
     */
    dismissIssue(issueId: string, reason?: string): Promise<void>;

    /**
     * Get review history
     */
    getReviewHistory(limit?: number): Promise<ReviewResult[]>;

    /**
     * Cancel an ongoing review
     */
    cancelReview(reviewId: string): Promise<void>;

    /**
     * Get severity icon
     */
    getSeverityIcon(severity: ReviewSeverity): string;

    /**
     * Get category icon
     */
    getCategoryIcon(category: ReviewCategory): string;
}

/**
 * Get the icon for a severity level
 */
export function getSeverityIcon(severity: ReviewSeverity): string {
    switch (severity) {
        case 'blocker': return 'error';
        case 'critical': return 'flame';
        case 'major': return 'warning';
        case 'minor': return 'info';
        case 'info': return 'lightbulb';
        default: return 'circle';
    }
}

/**
 * Get the color for a severity level
 */
export function getSeverityColor(severity: ReviewSeverity): string {
    switch (severity) {
        case 'blocker': return '#dc2626';
        case 'critical': return '#ea580c';
        case 'major': return '#f59e0b';
        case 'minor': return '#3b82f6';
        case 'info': return '#6b7280';
        default: return '#6b7280';
    }
}

/**
 * Get the icon for a category
 */
export function getCategoryIcon(category: ReviewCategory): string {
    switch (category) {
        case 'security': return 'shield';
        case 'performance': return 'dashboard';
        case 'reliability': return 'verified';
        case 'maintainability': return 'tools';
        case 'style': return 'symbol-color';
        case 'documentation': return 'book';
        case 'testing': return 'beaker';
        case 'best-practice': return 'star';
        case 'bug': return 'bug';
        case 'code-smell': return 'warning';
        default: return 'circle';
    }
}

/**
 * Get severity priority (lower = more severe)
 */
export function getSeverityPriority(severity: ReviewSeverity): number {
    switch (severity) {
        case 'blocker': return 0;
        case 'critical': return 1;
        case 'major': return 2;
        case 'minor': return 3;
        case 'info': return 4;
        default: return 5;
    }
}

/**
 * Sort issues by severity
 */
export function sortIssuesBySeverity(issues: ReviewIssue[]): ReviewIssue[] {
    return [...issues].sort((a, b) => {
        const priorityDiff = getSeverityPriority(a.severity) - getSeverityPriority(b.severity);
        if (priorityDiff !== 0) {
            return priorityDiff;
        }
        return a.startLine - b.startLine;
    });
}

/**
 * Calculate review score (0-100)
 */
export function calculateReviewScore(issues: ReviewIssue[], linesReviewed: number): number {
    if (linesReviewed === 0) {
        return 100;
    }

    let penalty = 0;
    for (const issue of issues) {
        switch (issue.severity) {
            case 'blocker':
                penalty += 25;
                break;
            case 'critical':
                penalty += 15;
                break;
            case 'major':
                penalty += 8;
                break;
            case 'minor':
                penalty += 3;
                break;
            case 'info':
                penalty += 1;
                break;
        }
    }

    const normalizedPenalty = (penalty / linesReviewed) * 100;
    return Math.max(0, Math.min(100, 100 - normalizedPenalty));
}

/**
 * Get grade from score
 */
export function getGradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}
