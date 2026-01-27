// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CancellationToken } from '@theia/core/lib/common';

export const AIErrorRecoveryService = Symbol('AIErrorRecoveryService');
export const aiErrorRecoveryServicePath = '/services/ai-error-recovery';

/**
 * Error severity levels
 */
export type ErrorSeverity = 'error' | 'warning' | 'info' | 'hint';

/**
 * Error category for classification
 */
export type ErrorCategory =
    | 'syntax'
    | 'type'
    | 'reference'
    | 'import'
    | 'runtime'
    | 'logic'
    | 'style'
    | 'security'
    | 'performance'
    | 'deprecated'
    | 'unknown';

/**
 * Fix confidence level
 */
export type FixConfidence = 'high' | 'medium' | 'low';

/**
 * An error/diagnostic from the editor
 */
export interface EditorError {
    /** Error message */
    message: string;
    /** Error code (e.g., TS2304) */
    code?: string | number;
    /** Source (e.g., 'typescript', 'eslint') */
    source?: string;
    /** Severity level */
    severity: ErrorSeverity;
    /** File URI */
    uri: string;
    /** Start line (1-indexed) */
    startLine: number;
    /** Start column (0-indexed) */
    startColumn: number;
    /** End line (1-indexed) */
    endLine: number;
    /** End column (0-indexed) */
    endColumn: number;
    /** Related information */
    relatedInfo?: Array<{
        message: string;
        uri: string;
        line: number;
        column: number;
    }>;
}

/**
 * Context for error analysis
 */
export interface ErrorContext {
    /** The error to analyze */
    error: EditorError;
    /** Full file content */
    fileContent: string;
    /** Language ID */
    language: string;
    /** Lines around the error for context */
    surroundingCode?: {
        before: string[];
        errorLine: string;
        after: string[];
    };
    /** Stack trace if available */
    stackTrace?: string;
    /** Recent changes that might have caused the error */
    recentChanges?: string[];
}

/**
 * A text edit for fixing an error
 */
export interface FixEdit {
    /** Start line */
    startLine: number;
    /** Start column */
    startColumn: number;
    /** End line */
    endLine: number;
    /** End column */
    endColumn: number;
    /** New text to insert */
    newText: string;
}

/**
 * A suggested fix for an error
 */
export interface ErrorFix {
    /** Unique ID */
    id: string;
    /** Human-readable title */
    title: string;
    /** Detailed description */
    description: string;
    /** Confidence level */
    confidence: FixConfidence;
    /** Is this the recommended fix? */
    isPreferred: boolean;
    /** Edits to apply */
    edits: FixEdit[];
    /** Files affected */
    affectedFiles: string[];
    /** Whether this fix might have side effects */
    hasSideEffects: boolean;
    /** Preview of the fix */
    preview?: string;
    /** Additional imports needed */
    importsToAdd?: string[];
    /** Commands to run after fix (e.g., npm install) */
    postFixCommands?: string[];
}

/**
 * Analysis result for an error
 */
export interface ErrorAnalysis {
    /** Original error */
    error: EditorError;
    /** Detected category */
    category: ErrorCategory;
    /** Plain English explanation */
    explanation: string;
    /** Root cause analysis */
    rootCause: string;
    /** Why this error occurred */
    whyItHappened: string;
    /** How to prevent in future */
    prevention?: string;
    /** Suggested fixes */
    fixes: ErrorFix[];
    /** Related documentation */
    documentation?: {
        title: string;
        url: string;
    }[];
    /** Similar errors in the file */
    relatedErrors?: EditorError[];
    /** Learning resources */
    learningResources?: {
        title: string;
        url: string;
        type: 'docs' | 'tutorial' | 'video' | 'article';
    }[];
}

/**
 * Common error pattern
 */
export interface ErrorPattern {
    /** Pattern name */
    name: string;
    /** Regex or matcher for error message */
    matcher: RegExp | string;
    /** Error codes that match */
    codes?: (string | number)[];
    /** Category */
    category: ErrorCategory;
    /** Template explanation */
    explanationTemplate: string;
    /** Template fixes */
    fixTemplates: Array<{
        title: string;
        description: string;
        editTemplate: string;
    }>;
}

/**
 * Error statistics for a file/project
 */
export interface ErrorStatistics {
    /** Total error count */
    totalErrors: number;
    /** By severity */
    bySeverity: Record<ErrorSeverity, number>;
    /** By category */
    byCategory: Record<ErrorCategory, number>;
    /** Most common errors */
    mostCommon: Array<{
        message: string;
        count: number;
        category: ErrorCategory;
    }>;
    /** Files with most errors */
    filesByErrorCount: Array<{
        uri: string;
        count: number;
    }>;
    /** Trend (increasing/decreasing) */
    trend?: 'increasing' | 'stable' | 'decreasing';
}

/**
 * Batch fix result
 */
export interface BatchFixResult {
    /** Number of errors fixed */
    fixedCount: number;
    /** Number of errors that couldn't be fixed */
    failedCount: number;
    /** Errors that were fixed */
    fixedErrors: EditorError[];
    /** Errors that failed */
    failedErrors: Array<{
        error: EditorError;
        reason: string;
    }>;
    /** Total edits applied */
    edits: FixEdit[];
}

/**
 * Service for AI-powered error recovery
 */
export interface AIErrorRecoveryService {
    /**
     * Analyze a single error
     */
    analyzeError(context: ErrorContext, token?: CancellationToken): Promise<ErrorAnalysis>;

    /**
     * Get quick fixes for an error
     */
    getQuickFixes(context: ErrorContext, token?: CancellationToken): Promise<ErrorFix[]>;

    /**
     * Apply a specific fix
     */
    applyFix(fix: ErrorFix, token?: CancellationToken): Promise<{
        success: boolean;
        message?: string;
    }>;

    /**
     * Analyze multiple errors and find common patterns
     */
    analyzeErrors(errors: EditorError[], fileContent: string, language: string, token?: CancellationToken): Promise<{
        analyses: ErrorAnalysis[];
        commonPatterns: string[];
        suggestedBatchFixes: ErrorFix[];
    }>;

    /**
     * Fix all auto-fixable errors in a file
     */
    fixAllInFile(uri: string, fileContent: string, language: string, token?: CancellationToken): Promise<BatchFixResult>;

    /**
     * Explain a stack trace
     */
    explainStackTrace(stackTrace: string, language: string, token?: CancellationToken): Promise<{
        summary: string;
        rootCause: string;
        relevantFrames: Array<{
            file: string;
            line: number;
            function: string;
            explanation: string;
            isUserCode: boolean;
        }>;
        suggestedFixes: string[];
    }>;

    /**
     * Get error statistics for a workspace
     */
    getStatistics(errors: EditorError[]): Promise<ErrorStatistics>;

    /**
     * Learn from user's fix choice
     */
    recordFixChoice(error: EditorError, chosenFix: ErrorFix): Promise<void>;

    /**
     * Get explanation for an error code
     */
    explainErrorCode(code: string | number, source: string): Promise<{
        title: string;
        explanation: string;
        commonCauses: string[];
        solutions: string[];
        documentationUrl?: string;
    }>;

    /**
     * Suggest preventive measures based on error history
     */
    suggestPreventiveMeasures(errors: EditorError[]): Promise<{
        suggestions: Array<{
            title: string;
            description: string;
            impact: 'high' | 'medium' | 'low';
            implementation: string;
        }>;
    }>;
}

/**
 * Get icon for error category
 */
export function getCategoryIcon(category: ErrorCategory): string {
    const icons: Record<ErrorCategory, string> = {
        'syntax': 'error',
        'type': 'symbol-type-parameter',
        'reference': 'references',
        'import': 'package',
        'runtime': 'debug-alt',
        'logic': 'lightbulb',
        'style': 'paintcan',
        'security': 'shield',
        'performance': 'dashboard',
        'deprecated': 'warning',
        'unknown': 'question'
    };
    return icons[category] || 'question';
}

/**
 * Get severity icon
 */
export function getSeverityIcon(severity: ErrorSeverity): string {
    const icons: Record<ErrorSeverity, string> = {
        'error': 'error',
        'warning': 'warning',
        'info': 'info',
        'hint': 'lightbulb'
    };
    return icons[severity];
}
