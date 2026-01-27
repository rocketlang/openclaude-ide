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

export const AIRefactorService = Symbol('AIRefactorService');
export const aiRefactorServicePath = '/services/ai-refactor';

/**
 * Types of refactoring operations
 */
export type RefactorKind =
    | 'extract-function'
    | 'extract-variable'
    | 'extract-constant'
    | 'extract-interface'
    | 'extract-type'
    | 'inline-variable'
    | 'inline-function'
    | 'rename'
    | 'convert-to-arrow'
    | 'convert-to-function'
    | 'convert-to-async'
    | 'add-parameter'
    | 'remove-parameter'
    | 'reorder-parameters'
    | 'simplify-conditional'
    | 'remove-dead-code'
    | 'optimize-imports';

/**
 * Scope of refactoring
 */
export type RefactorScope = 'selection' | 'function' | 'class' | 'file' | 'workspace';

/**
 * Risk level of a refactoring
 */
export type RefactorRisk = 'safe' | 'low' | 'medium' | 'high';

/**
 * Code selection for refactoring
 */
export interface CodeSelection {
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
    /** Selected text */
    text: string;
}

/**
 * Context for refactoring
 */
export interface RefactorContext {
    /** File URI */
    uri: string;
    /** Language ID */
    language: string;
    /** Full file content */
    content: string;
    /** Current selection */
    selection?: CodeSelection;
    /** Symbol at cursor (if any) */
    symbol?: {
        name: string;
        kind: string;
        range: CodeSelection;
    };
}

/**
 * Request for refactoring suggestions
 */
export interface RefactorRequest {
    /** Context for refactoring */
    context: RefactorContext;
    /** Specific refactor kind (optional - if not provided, suggest all applicable) */
    kind?: RefactorKind;
    /** Scope of refactoring */
    scope?: RefactorScope;
    /** Whether to include risky refactorings */
    includeRisky?: boolean;
}

/**
 * A single text edit
 */
export interface TextEdit {
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
 * Edits for a single file
 */
export interface FileEdit {
    /** File URI */
    uri: string;
    /** Edits to apply */
    edits: TextEdit[];
    /** Whether this creates a new file */
    isNew?: boolean;
}

/**
 * A refactoring suggestion
 */
export interface RefactorSuggestion {
    /** Unique ID */
    id: string;
    /** Kind of refactoring */
    kind: RefactorKind;
    /** Human-readable title */
    title: string;
    /** Detailed description */
    description: string;
    /** Risk level */
    risk: RefactorRisk;
    /** Confidence score 0-1 */
    confidence: number;
    /** Preview of the change */
    preview?: string;
    /** Files affected */
    affectedFiles: string[];
    /** Whether this is a quick fix */
    isQuickFix: boolean;
    /** Keyboard shortcut hint */
    shortcut?: string;
}

/**
 * Result of applying a refactoring
 */
export interface RefactorResult {
    /** Whether the refactoring succeeded */
    success: boolean;
    /** File edits to apply */
    edits: FileEdit[];
    /** New cursor position (optional) */
    newCursor?: {
        uri: string;
        line: number;
        column: number;
    };
    /** Message to show user */
    message?: string;
    /** Undo information */
    undoId?: string;
}

/**
 * Rename suggestion
 */
export interface RenameSuggestion {
    /** Suggested new name */
    name: string;
    /** Why this name is suggested */
    reason: string;
    /** Confidence score */
    confidence: number;
}

/**
 * Parameters for extract refactorings
 */
export interface ExtractParams {
    /** Selection to extract */
    selection: CodeSelection;
    /** Suggested name for extracted element */
    suggestedName?: string;
    /** Whether to make it exported */
    makeExported?: boolean;
    /** Whether to add JSDoc */
    addDocumentation?: boolean;
}

/**
 * Parameters for rename refactoring
 */
export interface RenameParams {
    /** Symbol to rename */
    symbol: {
        name: string;
        uri: string;
        line: number;
        column: number;
    };
    /** New name */
    newName: string;
    /** Whether to rename in comments */
    renameInComments?: boolean;
    /** Whether to rename in strings */
    renameInStrings?: boolean;
}

/**
 * Code smell detection
 */
export interface CodeSmell {
    /** Type of smell */
    type: 'long-function' | 'complex-conditional' | 'duplicate-code' | 'dead-code' | 'magic-number' | 'god-class' | 'feature-envy';
    /** Description */
    description: string;
    /** Location */
    location: CodeSelection;
    /** Severity */
    severity: 'hint' | 'warning' | 'error';
    /** Suggested refactorings to fix */
    suggestedRefactors: RefactorKind[];
}

/**
 * Service for AI-powered code refactoring
 */
export interface AIRefactorService {
    /**
     * Get available refactoring suggestions for a context
     */
    getSuggestions(request: RefactorRequest, token?: CancellationToken): Promise<RefactorSuggestion[]>;

    /**
     * Apply a specific refactoring
     */
    applyRefactor(
        suggestionId: string,
        context: RefactorContext,
        params?: Record<string, any>,
        token?: CancellationToken
    ): Promise<RefactorResult>;

    /**
     * Extract function from selection
     */
    extractFunction(params: ExtractParams, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Extract variable from selection
     */
    extractVariable(params: ExtractParams, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Extract constant from selection
     */
    extractConstant(params: ExtractParams, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Rename symbol with AI suggestions
     */
    rename(params: RenameParams, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Get AI-powered name suggestions for a symbol
     */
    suggestNames(
        symbol: { name: string; kind: string; context: string },
        language: string,
        count?: number,
        token?: CancellationToken
    ): Promise<RenameSuggestion[]>;

    /**
     * Convert function to arrow function
     */
    convertToArrow(selection: CodeSelection, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Convert arrow function to regular function
     */
    convertToFunction(selection: CodeSelection, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Convert function to async
     */
    convertToAsync(selection: CodeSelection, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Simplify a complex conditional
     */
    simplifyConditional(selection: CodeSelection, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Detect code smells in file
     */
    detectCodeSmells(uri: string, content: string, language: string, token?: CancellationToken): Promise<CodeSmell[]>;

    /**
     * Remove dead/unused code
     */
    removeDeadCode(uri: string, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Optimize imports (remove unused, sort, group)
     */
    optimizeImports(uri: string, context: RefactorContext, token?: CancellationToken): Promise<RefactorResult>;

    /**
     * Undo a refactoring
     */
    undoRefactor(undoId: string): Promise<boolean>;

    /**
     * Preview a refactoring without applying
     */
    previewRefactor(
        suggestionId: string,
        context: RefactorContext,
        params?: Record<string, any>,
        token?: CancellationToken
    ): Promise<{
        before: string;
        after: string;
        diff: string;
    }>;
}

/**
 * Get icon for refactor kind
 */
export function getRefactorIcon(kind: RefactorKind): string {
    const icons: Record<RefactorKind, string> = {
        'extract-function': 'symbol-function',
        'extract-variable': 'symbol-variable',
        'extract-constant': 'symbol-constant',
        'extract-interface': 'symbol-interface',
        'extract-type': 'symbol-type-parameter',
        'inline-variable': 'fold',
        'inline-function': 'fold',
        'rename': 'edit',
        'convert-to-arrow': 'arrow-right',
        'convert-to-function': 'symbol-function',
        'convert-to-async': 'sync',
        'add-parameter': 'add',
        'remove-parameter': 'remove',
        'reorder-parameters': 'list-ordered',
        'simplify-conditional': 'filter',
        'remove-dead-code': 'trash',
        'optimize-imports': 'library'
    };
    return icons[kind] || 'edit';
}

/**
 * Get label for refactor kind
 */
export function getRefactorLabel(kind: RefactorKind): string {
    const labels: Record<RefactorKind, string> = {
        'extract-function': 'Extract Function',
        'extract-variable': 'Extract Variable',
        'extract-constant': 'Extract Constant',
        'extract-interface': 'Extract Interface',
        'extract-type': 'Extract Type',
        'inline-variable': 'Inline Variable',
        'inline-function': 'Inline Function',
        'rename': 'Rename Symbol',
        'convert-to-arrow': 'Convert to Arrow Function',
        'convert-to-function': 'Convert to Function',
        'convert-to-async': 'Convert to Async',
        'add-parameter': 'Add Parameter',
        'remove-parameter': 'Remove Parameter',
        'reorder-parameters': 'Reorder Parameters',
        'simplify-conditional': 'Simplify Conditional',
        'remove-dead-code': 'Remove Dead Code',
        'optimize-imports': 'Optimize Imports'
    };
    return labels[kind] || kind;
}
