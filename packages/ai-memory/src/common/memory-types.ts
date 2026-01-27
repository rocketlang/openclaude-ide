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
 * Types of memory entries
 */
export enum MemoryEntryType {
    Conversation = 'conversation',
    CodePattern = 'codePattern',
    UserPreference = 'userPreference',
    ProjectContext = 'projectContext',
    LearnedBehavior = 'learnedBehavior',
    ErrorSolution = 'errorSolution',
    CodeSnippet = 'codeSnippet'
}

/**
 * Base memory entry
 */
export interface MemoryEntry {
    id: string;
    type: MemoryEntryType;
    timestamp: number;
    projectId?: string;
    tags?: string[];
    importance: number; // 0-1, used for retention/recall
    accessCount: number;
    lastAccessed: number;
}

/**
 * A conversation turn in history
 */
export interface ConversationTurn {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    codeContext?: string;
    fileUri?: string;
}

/**
 * Conversation memory entry
 */
export interface ConversationMemory extends MemoryEntry {
    type: MemoryEntryType.Conversation;
    sessionId: string;
    turns: ConversationTurn[];
    summary?: string;
    topics?: string[];
}

/**
 * Code pattern learned from user behavior
 */
export interface CodePatternMemory extends MemoryEntry {
    type: MemoryEntryType.CodePattern;
    language: string;
    patternType: CodePatternType;
    pattern: string;
    frequency: number;
    examples: string[];
    context?: string;
}

export enum CodePatternType {
    NamingConvention = 'namingConvention',
    CodeStyle = 'codeStyle',
    ArchitecturePattern = 'architecturePattern',
    ErrorHandling = 'errorHandling',
    TestingPattern = 'testingPattern',
    ImportStyle = 'importStyle',
    CommentStyle = 'commentStyle'
}

/**
 * User preference memory
 */
export interface UserPreferenceMemory extends MemoryEntry {
    type: MemoryEntryType.UserPreference;
    category: PreferenceCategory;
    key: string;
    value: unknown;
    confidence: number;
    learnedFrom: string[]; // Evidence/sources
}

export enum PreferenceCategory {
    CodeStyle = 'codeStyle',
    Documentation = 'documentation',
    Testing = 'testing',
    Communication = 'communication',
    Workflow = 'workflow',
    Language = 'language'
}

/**
 * Project-specific context
 */
export interface ProjectContextMemory extends MemoryEntry {
    type: MemoryEntryType.ProjectContext;
    projectRoot: string;
    projectName: string;
    framework?: string;
    languages: string[];
    conventions: ProjectConvention[];
    dependencies: string[];
    structure: ProjectStructure;
}

export interface ProjectConvention {
    type: string;
    description: string;
    examples: string[];
    filePattern?: string;
}

export interface ProjectStructure {
    srcDir?: string;
    testDir?: string;
    configFiles: string[];
    entryPoints: string[];
}

/**
 * Learned behavior from user interactions
 */
export interface LearnedBehaviorMemory extends MemoryEntry {
    type: MemoryEntryType.LearnedBehavior;
    behaviorType: BehaviorType;
    trigger: string;
    action: string;
    confidence: number;
    observations: number;
}

export enum BehaviorType {
    AcceptedSuggestion = 'acceptedSuggestion',
    RejectedSuggestion = 'rejectedSuggestion',
    ModifiedSuggestion = 'modifiedSuggestion',
    PreferredApproach = 'preferredApproach',
    AvoidedPattern = 'avoidedPattern'
}

/**
 * Error solution memory
 */
export interface ErrorSolutionMemory extends MemoryEntry {
    type: MemoryEntryType.ErrorSolution;
    errorMessage: string;
    errorType: string;
    solution: string;
    language?: string;
    framework?: string;
    successRate: number;
    applications: number;
}

/**
 * Code snippet memory
 */
export interface CodeSnippetMemory extends MemoryEntry {
    type: MemoryEntryType.CodeSnippet;
    name: string;
    description: string;
    code: string;
    language: string;
    usageContext: string;
    usageCount: number;
}

/**
 * Memory query options
 */
export interface MemoryQueryOptions {
    types?: MemoryEntryType[];
    projectId?: string;
    tags?: string[];
    minImportance?: number;
    limit?: number;
    since?: number;
    searchText?: string;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
    totalEntries: number;
    byType: Record<MemoryEntryType, number>;
    totalSize: number;
    oldestEntry: number;
    newestEntry: number;
}

/**
 * Memory service interface
 */
export const MemoryService = Symbol('MemoryService');
export interface MemoryService {
    /**
     * Store a memory entry
     */
    store(entry: Omit<MemoryEntry, 'id' | 'accessCount' | 'lastAccessed'>): Promise<string>;

    /**
     * Retrieve a memory entry by ID
     */
    retrieve(id: string): Promise<MemoryEntry | undefined>;

    /**
     * Query memory entries
     */
    query(options: MemoryQueryOptions): Promise<MemoryEntry[]>;

    /**
     * Update a memory entry with arbitrary properties
     */
    update(id: string, updates: Record<string, unknown>): Promise<void>;

    /**
     * Delete a memory entry
     */
    delete(id: string): Promise<void>;

    /**
     * Get memory statistics
     */
    getStats(): Promise<MemoryStats>;

    /**
     * Clear all memory
     */
    clear(): Promise<void>;

    /**
     * Export memory to JSON
     */
    export(): Promise<string>;

    /**
     * Import memory from JSON
     */
    import(data: string): Promise<void>;
}

/**
 * Conversation history service
 */
export const ConversationHistoryService = Symbol('ConversationHistoryService');
export interface ConversationHistoryService {
    /**
     * Start a new conversation session
     */
    startSession(): string;

    /**
     * Add a turn to the current session
     */
    addTurn(sessionId: string, turn: Omit<ConversationTurn, 'timestamp'>): Promise<void>;

    /**
     * Get conversation history
     */
    getHistory(sessionId: string): Promise<ConversationTurn[]>;

    /**
     * Get recent conversations
     */
    getRecentConversations(limit?: number): Promise<ConversationMemory[]>;

    /**
     * Search conversation history
     */
    searchHistory(query: string): Promise<ConversationMemory[]>;

    /**
     * Generate summary for a conversation
     */
    summarizeConversation(sessionId: string): Promise<string>;

    /**
     * End and persist a session
     */
    endSession(sessionId: string): Promise<void>;
}

/**
 * Learning service for pattern recognition
 */
export const LearningService = Symbol('LearningService');
export interface LearningService {
    /**
     * Learn from user code
     */
    learnFromCode(uri: string, content: string, language: string): Promise<void>;

    /**
     * Learn from user feedback
     */
    learnFromFeedback(suggestionId: string, accepted: boolean, modification?: string): Promise<void>;

    /**
     * Learn from error resolution
     */
    learnFromErrorResolution(errorMessage: string, solution: string, successful: boolean): Promise<void>;

    /**
     * Get learned patterns for a language
     */
    getPatterns(language: string): Promise<CodePatternMemory[]>;

    /**
     * Get user preferences
     */
    getPreferences(category?: PreferenceCategory): Promise<UserPreferenceMemory[]>;

    /**
     * Get project context
     */
    getProjectContext(projectRoot: string): Promise<ProjectContextMemory | undefined>;

    /**
     * Analyze project and build context
     */
    analyzeProject(projectRoot: string): Promise<ProjectContextMemory>;
}

/**
 * Context retrieval service for AI
 */
export const ContextRetrievalService = Symbol('ContextRetrievalService');
export interface ContextRetrievalService {
    /**
     * Get relevant context for an AI query
     */
    getRelevantContext(query: string, options?: ContextRetrievalOptions): Promise<RetrievedContext>;

    /**
     * Get context for code completion
     */
    getCompletionContext(uri: string, position: { line: number; character: number }): Promise<RetrievedContext>;

    /**
     * Get context for error fixing
     */
    getErrorContext(errorMessage: string, uri?: string): Promise<RetrievedContext>;
}

export interface ContextRetrievalOptions {
    maxTokens?: number;
    includeConversations?: boolean;
    includePatterns?: boolean;
    includePreferences?: boolean;
    projectId?: string;
}

export interface RetrievedContext {
    conversations: ConversationTurn[];
    patterns: CodePatternMemory[];
    preferences: UserPreferenceMemory[];
    projectContext?: ProjectContextMemory;
    errorSolutions: ErrorSolutionMemory[];
    relevanceScores: Map<string, number>;
}
