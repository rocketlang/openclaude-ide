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
 * Symbol kinds matching LSP SymbolKind
 */
export enum CodeSymbolKind {
    File = 1,
    Module = 2,
    Namespace = 3,
    Package = 4,
    Class = 5,
    Method = 6,
    Property = 7,
    Field = 8,
    Constructor = 9,
    Enum = 10,
    Interface = 11,
    Function = 12,
    Variable = 13,
    Constant = 14,
    String = 15,
    Number = 16,
    Boolean = 17,
    Array = 18,
    Object = 19,
    Key = 20,
    Null = 21,
    EnumMember = 22,
    Struct = 23,
    Event = 24,
    Operator = 25,
    TypeParameter = 26
}

/**
 * Position in a document
 */
export interface CodePosition {
    line: number;
    character: number;
}

/**
 * Range in a document
 */
export interface CodeRange {
    start: CodePosition;
    end: CodePosition;
}

/**
 * Location of a symbol
 */
export interface CodeLocation {
    uri: string;
    range: CodeRange;
}

/**
 * Represents a code symbol (class, function, variable, etc.)
 */
export interface CodeSymbol {
    /** Symbol name */
    name: string;
    /** Fully qualified name */
    qualifiedName?: string;
    /** Symbol kind */
    kind: CodeSymbolKind;
    /** Symbol location */
    location: CodeLocation;
    /** Container symbol (e.g., class containing a method) */
    containerName?: string;
    /** Child symbols */
    children?: CodeSymbol[];
    /** Symbol documentation/description */
    documentation?: string;
    /** Symbol signature (for functions/methods) */
    signature?: string;
    /** Visibility modifier */
    visibility?: 'public' | 'private' | 'protected' | 'internal';
    /** Whether symbol is static */
    isStatic?: boolean;
    /** Whether symbol is async */
    isAsync?: boolean;
    /** Symbol tags (deprecated, etc.) */
    tags?: string[];
}

/**
 * Represents a reference to a symbol
 */
export interface CodeReference {
    /** Location of the reference */
    location: CodeLocation;
    /** Whether this is a definition */
    isDefinition: boolean;
    /** Whether this is a declaration */
    isDeclaration: boolean;
    /** Whether this is a read reference */
    isRead: boolean;
    /** Whether this is a write reference */
    isWrite: boolean;
    /** Context around the reference */
    context?: string;
}

/**
 * Semantic context for AI queries
 */
export interface SemanticContext {
    /** Current file URI */
    fileUri: string;
    /** Current file language */
    language: string;
    /** Cursor position */
    position: CodePosition;
    /** Current line content */
    currentLine: string;
    /** Lines before cursor (configurable) */
    linesBefore: string[];
    /** Lines after cursor (configurable) */
    linesAfter: string[];
    /** Symbol at cursor */
    symbolAtCursor?: CodeSymbol;
    /** Enclosing symbol (function, class, etc.) */
    enclosingSymbol?: CodeSymbol;
    /** Visible symbols in scope */
    visibleSymbols: CodeSymbol[];
    /** Imports in the file */
    imports: ImportInfo[];
    /** File outline (top-level symbols) */
    outline: CodeSymbol[];
    /** Related files (imports, dependencies) */
    relatedFiles: string[];
    /** Selection range if any */
    selection?: CodeRange;
    /** Selected text if any */
    selectedText?: string;
}

/**
 * Import information
 */
export interface ImportInfo {
    /** Module/package being imported */
    module: string;
    /** Imported names */
    names: string[];
    /** Whether it's a default import */
    isDefault: boolean;
    /** Whether it's a namespace import */
    isNamespace: boolean;
    /** Alias if any */
    alias?: string;
    /** Location of the import statement */
    location: CodeLocation;
}

/**
 * AI-powered code action
 */
export interface AICodeAction {
    /** Unique identifier */
    id: string;
    /** Title shown to user */
    title: string;
    /** Description of what the action does */
    description?: string;
    /** Kind of code action */
    kind: AICodeActionKind;
    /** Diagnostics this action addresses */
    diagnostics?: CodeDiagnostic[];
    /** Whether this is the preferred action */
    isPreferred?: boolean;
    /** Edit to apply */
    edit?: CodeEdit;
    /** Command to execute instead of edit */
    command?: CodeCommand;
}

/**
 * Types of AI code actions
 */
export enum AICodeActionKind {
    QuickFix = 'quickfix',
    Refactor = 'refactor',
    RefactorExtract = 'refactor.extract',
    RefactorInline = 'refactor.inline',
    RefactorRewrite = 'refactor.rewrite',
    Source = 'source',
    SourceOrganizeImports = 'source.organizeImports',
    SourceFixAll = 'source.fixAll',
    Generate = 'generate',
    Explain = 'explain',
    Document = 'document',
    Test = 'test'
}

/**
 * Code diagnostic (error, warning, etc.)
 */
export interface CodeDiagnostic {
    /** Diagnostic message */
    message: string;
    /** Severity level */
    severity: DiagnosticSeverity;
    /** Range in document */
    range: CodeRange;
    /** Source of the diagnostic */
    source?: string;
    /** Error/warning code */
    code?: string | number;
    /** Related information */
    relatedInformation?: DiagnosticRelatedInfo[];
}

/**
 * Diagnostic severity levels
 */
export enum DiagnosticSeverity {
    Error = 1,
    Warning = 2,
    Information = 3,
    Hint = 4
}

/**
 * Related diagnostic information
 */
export interface DiagnosticRelatedInfo {
    location: CodeLocation;
    message: string;
}

/**
 * Code edit operation
 */
export interface CodeEdit {
    /** URI of file to edit */
    uri: string;
    /** Text edits to apply */
    edits: TextEdit[];
}

/**
 * Single text edit
 */
export interface TextEdit {
    /** Range to replace */
    range: CodeRange;
    /** New text */
    newText: string;
}

/**
 * Command to execute
 */
export interface CodeCommand {
    /** Command identifier */
    id: string;
    /** Command title */
    title: string;
    /** Command arguments */
    arguments?: unknown[];
}

/**
 * AI explanation of code
 */
export interface CodeExplanation {
    /** Summary explanation */
    summary: string;
    /** Detailed explanation */
    details?: string;
    /** Key concepts identified */
    concepts?: string[];
    /** Complexity assessment */
    complexity?: 'simple' | 'moderate' | 'complex';
    /** Potential issues or improvements */
    suggestions?: string[];
    /** Related documentation links */
    references?: string[];
}

/**
 * Options for symbol analysis
 */
export interface SymbolAnalysisOptions {
    /** Include private symbols */
    includePrivate?: boolean;
    /** Maximum depth for nested symbols */
    maxDepth?: number;
    /** Symbol kinds to include */
    kinds?: CodeSymbolKind[];
    /** Include documentation */
    includeDocumentation?: boolean;
}

/**
 * Options for getting semantic context
 */
export interface SemanticContextOptions {
    /** Number of lines before cursor */
    linesBefore?: number;
    /** Number of lines after cursor */
    linesAfter?: number;
    /** Include full file outline */
    includeOutline?: boolean;
    /** Include visible symbols */
    includeVisibleSymbols?: boolean;
    /** Include imports */
    includeImports?: boolean;
    /** Include related files */
    includeRelatedFiles?: boolean;
    /** Maximum related files */
    maxRelatedFiles?: number;
}

/**
 * Event when code intelligence is ready for a file
 */
export interface CodeIntelligenceReadyEvent {
    uri: string;
    language: string;
}

/**
 * Symbol analysis service
 */
export const SymbolAnalysisService = Symbol('SymbolAnalysisService');
export interface SymbolAnalysisService {
    /**
     * Get all symbols in a document
     */
    getDocumentSymbols(uri: string, options?: SymbolAnalysisOptions): Promise<CodeSymbol[]>;

    /**
     * Get symbol at a specific position
     */
    getSymbolAtPosition(uri: string, position: CodePosition): Promise<CodeSymbol | undefined>;

    /**
     * Get symbol definition
     */
    getDefinition(uri: string, position: CodePosition): Promise<CodeLocation[]>;

    /**
     * Get symbol references
     */
    getReferences(uri: string, position: CodePosition, includeDeclaration?: boolean): Promise<CodeReference[]>;

    /**
     * Get symbol hover information
     */
    getHoverInfo(uri: string, position: CodePosition): Promise<string | undefined>;

    /**
     * Get type hierarchy for a symbol
     */
    getTypeHierarchy(uri: string, position: CodePosition): Promise<CodeSymbol[]>;

    /**
     * Get call hierarchy for a function/method
     */
    getCallHierarchy(uri: string, position: CodePosition): Promise<CodeSymbol[]>;

    /**
     * Search for symbols in workspace
     */
    searchSymbols(query: string, options?: SymbolAnalysisOptions): Promise<CodeSymbol[]>;

    /**
     * Event when symbols change
     */
    readonly onSymbolsChanged: Event<string>;
}

/**
 * Semantic context service
 */
export const SemanticContextService = Symbol('SemanticContextService');
export interface SemanticContextService {
    /**
     * Get semantic context at a position
     */
    getContext(uri: string, position: CodePosition, options?: SemanticContextOptions): Promise<SemanticContext>;

    /**
     * Get context for the current editor
     */
    getCurrentContext(options?: SemanticContextOptions): Promise<SemanticContext | undefined>;

    /**
     * Get context as formatted string for AI
     */
    formatContextForAI(context: SemanticContext): string;

    /**
     * Event when context changes
     */
    readonly onContextChanged: Event<SemanticContext>;
}

/**
 * AI code actions service
 */
export const AICodeActionsService = Symbol('AICodeActionsService');
export interface AICodeActionsService {
    /**
     * Get available code actions at a position
     */
    getCodeActions(uri: string, range: CodeRange, diagnostics?: CodeDiagnostic[]): Promise<AICodeAction[]>;

    /**
     * Execute a code action
     */
    executeAction(action: AICodeAction): Promise<boolean>;

    /**
     * Get AI-powered quick fix for a diagnostic
     */
    getQuickFix(uri: string, diagnostic: CodeDiagnostic): Promise<AICodeAction[]>;

    /**
     * Get AI explanation for code
     */
    explainCode(uri: string, range: CodeRange): Promise<CodeExplanation>;

    /**
     * Generate documentation for code
     */
    generateDocumentation(uri: string, range: CodeRange): Promise<string>;

    /**
     * Suggest refactoring for code
     */
    suggestRefactoring(uri: string, range: CodeRange): Promise<AICodeAction[]>;

    /**
     * Generate unit tests for code
     */
    generateTests(uri: string, range: CodeRange): Promise<string>;
}

/**
 * Code intelligence provider contribution
 */
export const CodeIntelligenceContribution = Symbol('CodeIntelligenceContribution');
export interface CodeIntelligenceContribution {
    /**
     * Languages this contribution supports
     */
    readonly languages: string[];

    /**
     * Priority (higher = preferred)
     */
    readonly priority?: number;

    /**
     * Provide additional symbols
     */
    provideSymbols?(uri: string): Promise<CodeSymbol[]>;

    /**
     * Enhance semantic context
     */
    enhanceContext?(context: SemanticContext): Promise<SemanticContext>;

    /**
     * Provide additional code actions
     */
    provideCodeActions?(uri: string, range: CodeRange): Promise<AICodeAction[]>;
}
