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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    MemoryService,
    LearningService,
    ConversationHistoryService,
    ContextRetrievalService,
    MemoryEntryType,
    RetrievedContext
} from '../common';
import { MemoryCache } from './memory-cache';
import { Debouncer, Throttler } from './performance-utils';

/**
 * Event fired when memory context is updated
 */
export interface MemoryContextUpdateEvent {
    source: 'editor' | 'conversation' | 'project' | 'manual';
    timestamp: number;
}

/**
 * Integrated memory manager that connects all memory services
 * and provides a unified interface for AI features
 */
@injectable()
export class MemoryIntegrationService implements Disposable {

    @inject(MemoryService)
    protected readonly memoryService: MemoryService;

    @inject(LearningService)
    protected readonly learningService: LearningService;

    @inject(ConversationHistoryService)
    protected readonly conversationHistory: ConversationHistoryService;

    @inject(ContextRetrievalService)
    protected readonly contextRetrieval: ContextRetrievalService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected readonly disposables = new DisposableCollection();
    protected readonly cache: MemoryCache;
    protected readonly onContextUpdateEmitter = new Emitter<MemoryContextUpdateEvent>();

    protected currentSessionId: string | undefined;
    protected learnDebouncer: Debouncer<(uri: string, content: string, language: string) => Promise<void>>;
    protected contextThrottler: Throttler<() => void>;

    readonly onContextUpdate: Event<MemoryContextUpdateEvent> = this.onContextUpdateEmitter.event;

    constructor() {
        this.cache = new MemoryCache({
            maxEntries: 500,
            maxSize: 5 * 1024 * 1024, // 5MB
            ttl: 15 * 60 * 1000, // 15 minutes
            enableLRU: true
        });

        // Debounce learning to avoid excessive processing
        this.learnDebouncer = new Debouncer(
            async (uri: string, content: string, language: string) => {
                await this.learningService.learnFromCode(uri, content, language);
            },
            2000 // 2 second delay
        );

        // Throttle context updates
        this.contextThrottler = new Throttler(
            () => this.emitContextUpdate('editor'),
            1000 // Max once per second
        );
    }

    @postConstruct()
    protected init(): void {
        // Start a new conversation session
        this.currentSessionId = this.conversationHistory.startSession();

        // Watch for editor changes
        this.disposables.push(
            this.editorManager.onActiveEditorChanged(() => {
                this.onEditorChanged();
            })
        );

        // Watch for workspace changes
        this.disposables.push(
            this.workspaceService.onWorkspaceChanged(() => {
                this.onWorkspaceChanged();
            })
        );

        // Prewarm cache with recent memories
        this.prewarmCache();
    }

    /**
     * Get the current conversation session ID
     */
    getSessionId(): string {
        if (!this.currentSessionId) {
            this.currentSessionId = this.conversationHistory.startSession();
        }
        return this.currentSessionId;
    }

    /**
     * Add a message to the current conversation
     */
    async addConversationTurn(
        role: 'user' | 'assistant',
        content: string,
        codeContext?: string,
        fileUri?: string
    ): Promise<void> {
        const sessionId = this.getSessionId();
        await this.conversationHistory.addTurn(sessionId, {
            role,
            content,
            codeContext,
            fileUri
        });

        this.emitContextUpdate('conversation');
    }

    /**
     * Get enriched context for an AI query
     */
    async getEnrichedContext(
        query: string,
        options?: {
            maxTokens?: number;
            includeConversations?: boolean;
            includePatterns?: boolean;
            currentFileUri?: string;
        }
    ): Promise<EnrichedAIContext> {
        const retrievedContext = await this.contextRetrieval.getRelevantContext(query, {
            maxTokens: options?.maxTokens ?? 4000,
            includeConversations: options?.includeConversations ?? true,
            includePatterns: options?.includePatterns ?? true
        });

        // Get current project context
        const projectRoot = this.workspaceService.workspace?.resource.toString();
        let projectContext = retrievedContext.projectContext;

        if (!projectContext && projectRoot) {
            projectContext = await this.learningService.getProjectContext(projectRoot);
            if (!projectContext) {
                projectContext = await this.learningService.analyzeProject(projectRoot);
            }
        }

        // Build enriched context
        return {
            query,
            timestamp: Date.now(),
            sessionId: this.getSessionId(),

            // Conversation context
            recentConversation: retrievedContext.conversations.slice(-10),

            // Code patterns
            relevantPatterns: retrievedContext.patterns.slice(0, 5),

            // User preferences
            preferences: retrievedContext.preferences,

            // Project info
            project: projectContext ? {
                name: projectContext.projectName,
                languages: projectContext.languages,
                framework: projectContext.framework,
                conventions: projectContext.conventions
            } : undefined,

            // Error solutions
            errorSolutions: retrievedContext.errorSolutions.slice(0, 3),

            // Current file context
            currentFile: options?.currentFileUri,

            // Format for AI prompt
            formatted: this.formatContextForPrompt(retrievedContext, projectContext)
        };
    }

    /**
     * Learn from the current editor content
     */
    async learnFromCurrentEditor(): Promise<void> {
        const editor = this.editorManager.currentEditor?.editor;
        if (!editor) {
            return;
        }

        const uri = editor.uri.toString();
        const content = editor.document.getText();
        const language = this.detectLanguage(uri);

        this.learnDebouncer.call(uri, content, language);
    }

    /**
     * Record feedback on an AI suggestion
     */
    async recordFeedback(
        suggestionId: string,
        accepted: boolean,
        modification?: string
    ): Promise<void> {
        await this.learningService.learnFromFeedback(suggestionId, accepted, modification);
        this.cache.clear(); // Invalidate cache after learning
    }

    /**
     * Record an error resolution
     */
    async recordErrorResolution(
        errorMessage: string,
        solution: string,
        successful: boolean
    ): Promise<void> {
        await this.learningService.learnFromErrorResolution(errorMessage, solution, successful);
    }

    /**
     * Get memory statistics
     */
    async getStats(): Promise<MemoryStats> {
        const memoryStats = await this.memoryService.getStats();
        const cacheStats = this.cache.getStats();
        const recentConversations = await this.conversationHistory.getRecentConversations(5);

        return {
            memory: memoryStats,
            cache: cacheStats,
            currentSession: {
                id: this.currentSessionId,
                started: Date.now() // Would track actual start time
            },
            recentConversations: recentConversations.length
        };
    }

    /**
     * Clear all memory (with confirmation)
     */
    async clearAllMemory(): Promise<void> {
        await this.memoryService.clear();
        this.cache.clear();
        this.currentSessionId = this.conversationHistory.startSession();
    }

    /**
     * Export memory for backup
     */
    async exportMemory(): Promise<string> {
        return this.memoryService.export();
    }

    /**
     * Import memory from backup
     */
    async importMemory(data: string): Promise<void> {
        await this.memoryService.import(data);
        this.cache.clear();
        await this.prewarmCache();
    }

    /**
     * End current session and start a new one
     */
    async newSession(): Promise<string> {
        if (this.currentSessionId) {
            await this.conversationHistory.endSession(this.currentSessionId);
        }
        this.currentSessionId = this.conversationHistory.startSession();
        return this.currentSessionId;
    }

    dispose(): void {
        this.learnDebouncer.dispose();
        this.contextThrottler.dispose();
        this.disposables.dispose();
        this.onContextUpdateEmitter.dispose();

        // End session on dispose
        if (this.currentSessionId) {
            this.conversationHistory.endSession(this.currentSessionId);
        }
    }

    protected async prewarmCache(): Promise<void> {
        // Load recent high-importance memories into cache
        const recentMemories = await this.memoryService.query({
            minImportance: 0.5,
            limit: 100
        });

        this.cache.prewarm(recentMemories);
    }

    protected onEditorChanged(): void {
        this.contextThrottler.call();

        // Learn from editor content after a delay
        setTimeout(() => {
            this.learnFromCurrentEditor();
        }, 5000); // 5 second delay
    }

    protected async onWorkspaceChanged(): Promise<void> {
        const projectRoot = this.workspaceService.workspace?.resource.toString();
        if (projectRoot) {
            // Check if we need to analyze this project
            const existing = await this.learningService.getProjectContext(projectRoot);
            if (!existing) {
                await this.learningService.analyzeProject(projectRoot);
            }
        }
        this.emitContextUpdate('project');
    }

    protected emitContextUpdate(source: MemoryContextUpdateEvent['source']): void {
        this.onContextUpdateEmitter.fire({
            source,
            timestamp: Date.now()
        });
    }

    protected formatContextForPrompt(
        context: RetrievedContext,
        projectContext?: { projectName: string; languages: string[]; framework?: string } | null
    ): string {
        const parts: string[] = [];

        // Project context
        if (projectContext) {
            parts.push(`## Project: ${projectContext.projectName}`);
            parts.push(`Languages: ${projectContext.languages.join(', ')}`);
            if (projectContext.framework) {
                parts.push(`Framework: ${projectContext.framework}`);
            }
            parts.push('');
        }

        // Recent conversation
        if (context.conversations.length > 0) {
            parts.push('## Recent Conversation');
            for (const turn of context.conversations.slice(-5)) {
                const prefix = turn.role === 'user' ? 'User' : 'Assistant';
                const content = turn.content.length > 200
                    ? turn.content.substring(0, 200) + '...'
                    : turn.content;
                parts.push(`${prefix}: ${content}`);
            }
            parts.push('');
        }

        // Learned patterns
        if (context.patterns.length > 0) {
            parts.push('## Coding Patterns');
            for (const pattern of context.patterns.slice(0, 3)) {
                parts.push(`- ${pattern.pattern} (${pattern.language})`);
            }
            parts.push('');
        }

        // Error solutions
        if (context.errorSolutions.length > 0) {
            parts.push('## Known Solutions');
            for (const solution of context.errorSolutions.slice(0, 2)) {
                parts.push(`- Error: ${solution.errorType}`);
                parts.push(`  Solution: ${solution.solution.substring(0, 100)}...`);
            }
            parts.push('');
        }

        return parts.join('\n');
    }

    protected detectLanguage(uri: string): string {
        const ext = uri.split('.').pop()?.toLowerCase();
        const languageMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript',
            'jsx': 'javascript',
            'py': 'python',
            'java': 'java',
            'go': 'go',
            'rs': 'rust',
            'cpp': 'cpp',
            'c': 'c'
        };
        return languageMap[ext || ''] || 'unknown';
    }
}

/**
 * Enriched context for AI queries
 */
export interface EnrichedAIContext {
    query: string;
    timestamp: number;
    sessionId: string;
    recentConversation: Array<{ role: string; content: string }>;
    relevantPatterns: Array<{ pattern: string; language: string }>;
    preferences: Array<{ key: string; value: unknown }>;
    project?: {
        name: string;
        languages: string[];
        framework?: string;
        conventions: Array<{ type: string; description: string }>;
    };
    errorSolutions: Array<{ errorType: string; solution: string }>;
    currentFile?: string;
    formatted: string;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
    memory: {
        totalEntries: number;
        byType: Record<MemoryEntryType, number>;
        totalSize: number;
    };
    cache: {
        entries: number;
        size: number;
        hitRate: number;
    };
    currentSession: {
        id: string | undefined;
        started: number;
    };
    recentConversations: number;
}
