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
import { Disposable, DisposableCollection } from '@theia/core';
import { MemoryIntegrationService, EnrichedAIContext } from './memory-integration';

/**
 * Message to be sent to AI with memory context
 */
export interface MemoryAugmentedMessage {
    /** Original user message */
    userMessage: string;
    /** System prompt with memory context */
    systemPrompt: string;
    /** Full context for reference */
    context: EnrichedAIContext;
    /** Estimated token count */
    estimatedTokens: number;
}

/**
 * Configuration for memory-augmented chat
 */
export interface ChatMemoryConfig {
    /** Maximum tokens for memory context */
    maxContextTokens: number;
    /** Include conversation history */
    includeConversations: boolean;
    /** Include learned patterns */
    includePatterns: boolean;
    /** Include error solutions */
    includeErrorSolutions: boolean;
    /** System prompt prefix */
    systemPromptPrefix: string;
}

const DEFAULT_CONFIG: ChatMemoryConfig = {
    maxContextTokens: 2000,
    includeConversations: true,
    includePatterns: true,
    includeErrorSolutions: true,
    systemPromptPrefix: 'You are an AI coding assistant with memory of past interactions.'
};

/**
 * Integrates memory system with AI chat
 * Provides memory-augmented prompts and learns from interactions
 */
@injectable()
export class ChatMemoryIntegration implements Disposable {

    @inject(MemoryIntegrationService)
    protected readonly memoryIntegration: MemoryIntegrationService;

    protected config: ChatMemoryConfig = DEFAULT_CONFIG;
    protected readonly disposables = new DisposableCollection();
    protected pendingSuggestions: Map<string, { content: string; timestamp: number }> = new Map();

    @postConstruct()
    protected init(): void {
        // Clean up old pending suggestions periodically
        const cleanupInterval = setInterval(() => {
            this.cleanupPendingSuggestions();
        }, 60000); // Every minute

        this.disposables.push(Disposable.create(() => clearInterval(cleanupInterval)));
    }

    /**
     * Configure memory integration
     */
    configure(config: Partial<ChatMemoryConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Prepare a user message with memory context
     */
    async prepareMessage(
        userMessage: string,
        options?: {
            currentFileUri?: string;
            codeContext?: string;
            maxTokens?: number;
        }
    ): Promise<MemoryAugmentedMessage> {
        // Record the user message in conversation history
        await this.memoryIntegration.addConversationTurn(
            'user',
            userMessage,
            options?.codeContext,
            options?.currentFileUri
        );

        // Get enriched context
        const context = await this.memoryIntegration.getEnrichedContext(userMessage, {
            maxTokens: options?.maxTokens ?? this.config.maxContextTokens,
            includeConversations: this.config.includeConversations,
            includePatterns: this.config.includePatterns,
            currentFileUri: options?.currentFileUri
        });

        // Build system prompt
        const systemPrompt = this.buildSystemPrompt(context);

        return {
            userMessage,
            systemPrompt,
            context,
            estimatedTokens: this.estimateTokens(systemPrompt + userMessage)
        };
    }

    /**
     * Record AI response and learn from it
     */
    async recordResponse(
        response: string,
        suggestionId?: string
    ): Promise<void> {
        // Record in conversation history
        await this.memoryIntegration.addConversationTurn('assistant', response);

        // Track suggestion for feedback
        if (suggestionId) {
            this.pendingSuggestions.set(suggestionId, {
                content: response,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Record user feedback on a suggestion
     */
    async recordFeedback(
        suggestionId: string,
        accepted: boolean,
        modification?: string
    ): Promise<void> {
        await this.memoryIntegration.recordFeedback(suggestionId, accepted, modification);
        this.pendingSuggestions.delete(suggestionId);
    }

    /**
     * Get context for code completion
     */
    async getCompletionContext(
        fileUri: string,
        prefix: string,
        suffix: string
    ): Promise<{
        patterns: string[];
        preferences: Record<string, unknown>;
        recentCode: string[];
    }> {
        const context = await this.memoryIntegration.getEnrichedContext(
            `Code completion for ${fileUri}`,
            {
                maxTokens: 500,
                includePatterns: true,
                currentFileUri: fileUri
            }
        );

        return {
            patterns: context.relevantPatterns.map(p => p.pattern),
            preferences: Object.fromEntries(
                context.preferences.map(p => [p.key, p.value])
            ),
            recentCode: context.recentConversation
                .filter(c => c.role === 'assistant')
                .map(c => c.content)
                .slice(0, 3)
        };
    }

    /**
     * Get context for error fixing
     */
    async getErrorFixContext(
        errorMessage: string,
        fileUri?: string
    ): Promise<{
        knownSolutions: Array<{ error: string; solution: string; successRate: number }>;
        relatedConversations: string[];
    }> {
        const context = await this.memoryIntegration.getEnrichedContext(
            `Fix error: ${errorMessage}`,
            {
                maxTokens: 1000,
                currentFileUri: fileUri
            }
        );

        return {
            knownSolutions: context.errorSolutions.map(s => ({
                error: s.errorType,
                solution: s.solution,
                successRate: 0.8 // Would come from actual data
            })),
            relatedConversations: context.recentConversation
                .filter(c => c.content.toLowerCase().includes('error') ||
                            c.content.toLowerCase().includes('fix'))
                .map(c => c.content)
        };
    }

    /**
     * Start a new conversation session
     */
    async newConversation(): Promise<string> {
        return this.memoryIntegration.newSession();
    }

    /**
     * Get current session statistics
     */
    async getSessionStats(): Promise<{
        sessionId: string;
        messageCount: number;
        topicsDiscussed: string[];
        suggestionsAccepted: number;
        suggestionsRejected: number;
    }> {
        const stats = await this.memoryIntegration.getStats();

        return {
            sessionId: stats.currentSession.id || 'unknown',
            messageCount: stats.recentConversations,
            topicsDiscussed: [], // Would extract from conversation
            suggestionsAccepted: 0, // Would track
            suggestionsRejected: 0
        };
    }

    dispose(): void {
        this.disposables.dispose();
        this.pendingSuggestions.clear();
    }

    protected buildSystemPrompt(context: EnrichedAIContext): string {
        const parts: string[] = [this.config.systemPromptPrefix];

        // Add project context
        if (context.project) {
            parts.push('');
            parts.push(`You are working on "${context.project.name}", a ${context.project.languages.join('/')} project${context.project.framework ? ` using ${context.project.framework}` : ''}.`);

            if (context.project.conventions.length > 0) {
                parts.push('');
                parts.push('Project conventions:');
                for (const conv of context.project.conventions.slice(0, 3)) {
                    parts.push(`- ${conv.description}`);
                }
            }
        }

        // Add learned patterns
        if (context.relevantPatterns.length > 0) {
            parts.push('');
            parts.push('The user prefers these coding patterns:');
            for (const pattern of context.relevantPatterns.slice(0, 3)) {
                parts.push(`- ${pattern.pattern}`);
            }
        }

        // Add preferences
        const stylePrefs = context.preferences.filter(p =>
            typeof p.key === 'string' && p.key.includes('style')
        );
        if (stylePrefs.length > 0) {
            parts.push('');
            parts.push('User preferences:');
            for (const pref of stylePrefs.slice(0, 3)) {
                parts.push(`- ${pref.key}: ${JSON.stringify(pref.value)}`);
            }
        }

        // Add known error solutions
        if (this.config.includeErrorSolutions && context.errorSolutions.length > 0) {
            parts.push('');
            parts.push('Known solutions for common errors:');
            for (const solution of context.errorSolutions.slice(0, 2)) {
                parts.push(`- ${solution.errorType}: ${solution.solution.substring(0, 100)}...`);
            }
        }

        // Add conversation context hint
        if (context.recentConversation.length > 0) {
            parts.push('');
            parts.push(`You have been helping with: ${this.summarizeRecentTopics(context.recentConversation)}`);
        }

        return parts.join('\n');
    }

    protected summarizeRecentTopics(conversation: Array<{ role: string; content: string }>): string {
        const userMessages = conversation
            .filter(c => c.role === 'user')
            .map(c => c.content);

        if (userMessages.length === 0) {
            return 'general coding assistance';
        }

        // Extract key topics from recent messages
        const keywords = new Set<string>();
        const technicalTerms = ['function', 'class', 'component', 'api', 'test', 'bug', 'error', 'refactor', 'implement'];

        for (const msg of userMessages.slice(-3)) {
            const words = msg.toLowerCase().split(/\s+/);
            for (const word of words) {
                if (technicalTerms.includes(word)) {
                    keywords.add(word);
                }
            }
        }

        if (keywords.size > 0) {
            return Array.from(keywords).slice(0, 3).join(', ');
        }

        return 'coding tasks';
    }

    protected estimateTokens(text: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    protected cleanupPendingSuggestions(): void {
        const maxAge = 10 * 60 * 1000; // 10 minutes
        const now = Date.now();

        for (const [id, suggestion] of this.pendingSuggestions) {
            if (now - suggestion.timestamp > maxAge) {
                this.pendingSuggestions.delete(id);
            }
        }
    }
}
