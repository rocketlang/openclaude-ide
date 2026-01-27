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
 * Represents a ghost text suggestion
 */
export interface GhostTextSuggestion {
    /** Unique identifier */
    id: string;
    /** The suggested text to insert */
    text: string;
    /** Position where suggestion starts */
    position: TextPosition;
    /** Range to replace (if any) */
    replaceRange?: TextRange;
    /** Confidence score (0-1) */
    confidence: number;
    /** Source of the suggestion */
    source: SuggestionSource;
    /** Timestamp when generated */
    timestamp: number;
    /** Whether this is a multi-line suggestion */
    isMultiLine: boolean;
    /** Preview lines for display */
    previewLines: string[];
}

/**
 * Text position in editor
 */
export interface TextPosition {
    lineNumber: number;
    column: number;
}

/**
 * Text range in editor
 */
export interface TextRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

/**
 * Source of AI suggestion
 */
export enum SuggestionSource {
    Completion = 'completion',
    Refactor = 'refactor',
    Fix = 'fix',
    Comment = 'comment',
    Documentation = 'documentation'
}

/**
 * Inline edit session state
 */
export interface InlineEditSession {
    /** Session ID */
    id: string;
    /** URI of the document */
    documentUri: string;
    /** Current suggestions */
    suggestions: GhostTextSuggestion[];
    /** Active suggestion index */
    activeSuggestionIndex: number;
    /** Session state */
    state: SessionState;
    /** Context used for generation */
    context: EditContext;
    /** Session start time */
    startedAt: number;
}

/**
 * Session state
 */
export enum SessionState {
    Idle = 'idle',
    Generating = 'generating',
    Showing = 'showing',
    Accepting = 'accepting',
    Dismissed = 'dismissed'
}

/**
 * Context for generating suggestions
 */
export interface EditContext {
    /** File path */
    filePath: string;
    /** Language ID */
    languageId: string;
    /** Text before cursor */
    prefix: string;
    /** Text after cursor */
    suffix: string;
    /** Current line text */
    currentLine: string;
    /** Cursor position */
    cursorPosition: TextPosition;
    /** Selected text (if any) */
    selectedText?: string;
    /** Surrounding context (nearby lines) */
    surroundingContext: string[];
    /** Import statements */
    imports?: string[];
    /** Function/class scope */
    scope?: ScopeInfo;
}

/**
 * Scope information
 */
export interface ScopeInfo {
    type: 'function' | 'class' | 'method' | 'module' | 'block';
    name?: string;
    startLine: number;
    endLine?: number;
}

/**
 * Configuration for inline editing
 */
export interface InlineEditConfig {
    /** Enable/disable inline suggestions */
    enabled: boolean;
    /** Debounce delay in ms */
    debounceDelay: number;
    /** Minimum characters before triggering */
    minTriggerLength: number;
    /** Maximum suggestion length (lines) */
    maxSuggestionLines: number;
    /** Show multi-line suggestions */
    showMultiLine: boolean;
    /** Auto-trigger on typing */
    autoTrigger: boolean;
    /** Trigger characters */
    triggerCharacters: string[];
    /** Languages to enable */
    enabledLanguages: string[];
    /** Ghost text opacity (0-1) */
    ghostTextOpacity: number;
    /** Show inline toolbar */
    showInlineToolbar: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_INLINE_EDIT_CONFIG: InlineEditConfig = {
    enabled: true,
    debounceDelay: 300,
    minTriggerLength: 3,
    maxSuggestionLines: 10,
    showMultiLine: true,
    autoTrigger: true,
    triggerCharacters: ['.', '(', '{', '[', ' ', '\n'],
    enabledLanguages: ['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'c', 'cpp'],
    ghostTextOpacity: 0.5,
    showInlineToolbar: true
};

/**
 * Inline suggestion provider interface
 */
export const InlineSuggestionProvider = Symbol('InlineSuggestionProvider');
export interface InlineSuggestionProvider {
    /** Generate suggestions for context */
    provideSuggestions(context: EditContext): Promise<GhostTextSuggestion[]>;
    /** Cancel pending requests */
    cancel(): void;
    /** Provider ID */
    readonly id: string;
    /** Provider priority (higher = preferred) */
    readonly priority: number;
}

/**
 * Inline edit service interface
 */
export const InlineEditService = Symbol('InlineEditService');
export interface InlineEditService {
    /** Start inline edit session */
    startSession(documentUri: string): Promise<InlineEditSession>;
    /** End current session */
    endSession(sessionId: string): void;
    /** Get current session */
    getCurrentSession(): InlineEditSession | undefined;
    /** Trigger suggestion generation */
    triggerSuggestion(context: EditContext): Promise<void>;
    /** Accept current suggestion */
    acceptSuggestion(): Promise<boolean>;
    /** Accept partial suggestion (word/line) */
    acceptPartial(type: 'word' | 'line'): Promise<boolean>;
    /** Dismiss current suggestion */
    dismissSuggestion(): void;
    /** Cycle to next suggestion */
    nextSuggestion(): void;
    /** Cycle to previous suggestion */
    previousSuggestion(): void;
    /** Get configuration */
    getConfig(): InlineEditConfig;
    /** Update configuration */
    updateConfig(config: Partial<InlineEditConfig>): void;
    /** Register suggestion provider */
    registerProvider(provider: InlineSuggestionProvider): void;
    /** Check if suggestions are showing */
    isShowingSuggestion(): boolean;
    /** Subscribe to suggestion events */
    onSuggestionShown(callback: (suggestion: GhostTextSuggestion) => void): void;
    onSuggestionAccepted(callback: (suggestion: GhostTextSuggestion) => void): void;
    onSuggestionDismissed(callback: () => void): void;
}

/**
 * Ghost text decoration service interface
 */
export const GhostTextDecorationService = Symbol('GhostTextDecorationService');
export interface GhostTextDecorationService {
    /** Show ghost text at position */
    showGhostText(suggestion: GhostTextSuggestion): void;
    /** Hide ghost text */
    hideGhostText(): void;
    /** Update ghost text styling */
    updateStyling(opacity: number): void;
    /** Check if ghost text is visible */
    isVisible(): boolean;
}

/**
 * Telemetry events for inline editing
 */
export interface InlineEditTelemetry {
    suggestionShown: number;
    suggestionAccepted: number;
    suggestionDismissed: number;
    partialAccepted: number;
    averageAcceptTime: number;
    acceptRate: number;
}
