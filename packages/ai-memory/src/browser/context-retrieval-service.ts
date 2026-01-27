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

import { injectable, inject } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    ContextRetrievalService,
    ContextRetrievalOptions,
    RetrievedContext,
    MemoryService,
    MemoryEntryType,
    ConversationMemory,
    ConversationTurn,
    CodePatternMemory,
    UserPreferenceMemory,
    ProjectContextMemory,
    ErrorSolutionMemory
} from '../common';

@injectable()
export class ContextRetrievalServiceImpl implements ContextRetrievalService {

    @inject(MemoryService)
    protected readonly memoryService: MemoryService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    async getRelevantContext(query: string, options?: ContextRetrievalOptions): Promise<RetrievedContext> {
        const maxTokens = options?.maxTokens ?? 4000;
        const includeConversations = options?.includeConversations ?? true;
        const includePatterns = options?.includePatterns ?? true;
        const includePreferences = options?.includePreferences ?? true;

        const relevanceScores = new Map<string, number>();
        const context: RetrievedContext = {
            conversations: [],
            patterns: [],
            preferences: [],
            errorSolutions: [],
            relevanceScores
        };

        // Get project context
        if (options?.projectId || this.workspaceService.workspace) {
            const projectRoot = options?.projectId || this.workspaceService.workspace?.resource.toString();
            if (projectRoot) {
                const projectContexts = await this.memoryService.query({
                    types: [MemoryEntryType.ProjectContext]
                });

                for (const memory of projectContexts) {
                    const projectContext = memory as ProjectContextMemory;
                    if (projectContext.projectRoot === projectRoot) {
                        context.projectContext = projectContext;
                        relevanceScores.set(projectContext.id, 1.0);
                        break;
                    }
                }
            }
        }

        // Get relevant conversations
        if (includeConversations) {
            const conversations = await this.getRelevantConversations(query, maxTokens / 4);
            for (const conv of conversations) {
                context.conversations.push(...conv.turns);
                relevanceScores.set(conv.id, conv.importance);
            }
        }

        // Get relevant patterns
        if (includePatterns) {
            const patterns = await this.getRelevantPatterns(query);
            context.patterns = patterns;
            for (const pattern of patterns) {
                relevanceScores.set(pattern.id, this.calculateRelevance(query, pattern.pattern));
            }
        }

        // Get relevant preferences
        if (includePreferences) {
            const preferences = await this.getRelevantPreferences(query);
            context.preferences = preferences;
            for (const pref of preferences) {
                relevanceScores.set(pref.id, pref.confidence);
            }
        }

        // Get relevant error solutions
        const errorSolutions = await this.getRelevantErrorSolutions(query);
        context.errorSolutions = errorSolutions;
        for (const solution of errorSolutions) {
            relevanceScores.set(solution.id, solution.successRate);
        }

        return context;
    }

    async getCompletionContext(uri: string, position: { line: number; character: number }): Promise<RetrievedContext> {
        const language = this.detectLanguage(uri);
        const relevanceScores = new Map<string, number>();

        const context: RetrievedContext = {
            conversations: [],
            patterns: [],
            preferences: [],
            errorSolutions: [],
            relevanceScores
        };

        // Get language-specific patterns
        const patterns = await this.memoryService.query({
            types: [MemoryEntryType.CodePattern],
            tags: [language],
            limit: 10
        });

        context.patterns = patterns as CodePatternMemory[];

        // Get code style preferences
        const preferences = await this.memoryService.query({
            types: [MemoryEntryType.UserPreference],
            tags: ['codeStyle'],
            limit: 5
        });

        context.preferences = preferences as UserPreferenceMemory[];

        // Get project context
        if (this.workspaceService.workspace) {
            const projectRoot = this.workspaceService.workspace.resource.toString();
            const projectContexts = await this.memoryService.query({
                types: [MemoryEntryType.ProjectContext]
            });

            for (const memory of projectContexts) {
                const projectContext = memory as ProjectContextMemory;
                if (projectContext.projectRoot === projectRoot) {
                    context.projectContext = projectContext;
                    break;
                }
            }
        }

        // Calculate relevance scores based on position context
        for (const pattern of context.patterns) {
            relevanceScores.set(pattern.id, pattern.importance * (pattern.frequency / 100));
        }

        for (const pref of context.preferences) {
            relevanceScores.set(pref.id, pref.confidence);
        }

        return context;
    }

    async getErrorContext(errorMessage: string, uri?: string): Promise<RetrievedContext> {
        const relevanceScores = new Map<string, number>();

        const context: RetrievedContext = {
            conversations: [],
            patterns: [],
            preferences: [],
            errorSolutions: [],
            relevanceScores
        };

        // Get error solutions
        const errorSolutions = await this.memoryService.query({
            types: [MemoryEntryType.ErrorSolution],
            limit: 10
        });

        // Rank solutions by similarity to error message
        const scoredSolutions: Array<{ solution: ErrorSolutionMemory; score: number }> = [];

        for (const memory of errorSolutions) {
            const solution = memory as ErrorSolutionMemory;
            const similarity = this.calculateErrorSimilarity(errorMessage, solution.errorMessage);
            const score = similarity * solution.successRate * solution.importance;

            if (score > 0.1) {
                scoredSolutions.push({ solution, score });
            }
        }

        // Sort by score and take top results
        scoredSolutions.sort((a, b) => b.score - a.score);
        context.errorSolutions = scoredSolutions.slice(0, 5).map(s => s.solution);

        for (const { solution, score } of scoredSolutions.slice(0, 5)) {
            relevanceScores.set(solution.id, score);
        }

        // Get error handling patterns
        const language = uri ? this.detectLanguage(uri) : undefined;
        const patternQuery: { types: MemoryEntryType[]; tags?: string[]; limit: number } = {
            types: [MemoryEntryType.CodePattern],
            limit: 5
        };

        if (language) {
            patternQuery.tags = [language, 'errorHandling'];
        }

        const patterns = await this.memoryService.query(patternQuery);
        context.patterns = (patterns as CodePatternMemory[]).filter(p =>
            p.patternType === 'errorHandling' || p.context?.includes('error')
        );

        // Get related conversations
        const conversations = await this.getRelevantConversations(errorMessage, 1000);
        const errorConversations = conversations.filter(conv =>
            conv.turns.some(turn =>
                turn.content.toLowerCase().includes('error') ||
                turn.content.toLowerCase().includes('fix') ||
                turn.content.toLowerCase().includes('bug')
            )
        );

        for (const conv of errorConversations.slice(0, 3)) {
            context.conversations.push(...conv.turns.slice(-5));
            relevanceScores.set(conv.id, conv.importance);
        }

        return context;
    }

    protected async getRelevantConversations(query: string, maxTokens: number): Promise<ConversationMemory[]> {
        const conversations = await this.memoryService.query({
            types: [MemoryEntryType.Conversation],
            limit: 20
        });

        // Score conversations by relevance to query
        const scored: Array<{ conv: ConversationMemory; score: number }> = [];

        for (const memory of conversations) {
            const conv = memory as ConversationMemory;
            let score = conv.importance;

            // Check topic match
            if (conv.topics) {
                const queryWords = query.toLowerCase().split(/\s+/);
                const matchingTopics = conv.topics.filter(topic =>
                    queryWords.some(word => topic.toLowerCase().includes(word))
                );
                score += matchingTopics.length * 0.1;
            }

            // Check content match
            const matchingTurns = conv.turns.filter(turn =>
                this.calculateRelevance(query, turn.content) > 0.3
            );
            score += matchingTurns.length * 0.05;

            if (score > 0.3) {
                scored.push({ conv, score });
            }
        }

        // Sort by score and collect within token limit
        scored.sort((a, b) => b.score - a.score);

        const result: ConversationMemory[] = [];
        let tokenCount = 0;

        for (const { conv } of scored) {
            const convTokens = this.estimateTokens(conv.turns);
            if (tokenCount + convTokens <= maxTokens) {
                result.push(conv);
                tokenCount += convTokens;
            }
        }

        return result;
    }

    protected async getRelevantPatterns(query: string): Promise<CodePatternMemory[]> {
        const patterns = await this.memoryService.query({
            types: [MemoryEntryType.CodePattern],
            limit: 20
        });

        // Filter and score patterns
        const scored: Array<{ pattern: CodePatternMemory; score: number }> = [];

        for (const memory of patterns) {
            const pattern = memory as CodePatternMemory;
            const relevance = this.calculateRelevance(query, pattern.pattern);
            const score = relevance * pattern.importance * Math.log(pattern.frequency + 1);

            if (score > 0.1) {
                scored.push({ pattern, score });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 10).map(s => s.pattern);
    }

    protected async getRelevantPreferences(query: string): Promise<UserPreferenceMemory[]> {
        const preferences = await this.memoryService.query({
            types: [MemoryEntryType.UserPreference],
            limit: 20
        });

        // Filter by query relevance
        const scored: Array<{ pref: UserPreferenceMemory; score: number }> = [];

        for (const memory of preferences) {
            const pref = memory as UserPreferenceMemory;
            const relevance = this.calculateRelevance(query, pref.key);
            const score = relevance * pref.confidence * pref.importance;

            if (score > 0.1 || pref.confidence > 0.8) {
                scored.push({ pref, score: Math.max(score, pref.confidence) });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 10).map(s => s.pref);
    }

    protected async getRelevantErrorSolutions(query: string): Promise<ErrorSolutionMemory[]> {
        const solutions = await this.memoryService.query({
            types: [MemoryEntryType.ErrorSolution],
            limit: 20
        });

        const scored: Array<{ solution: ErrorSolutionMemory; score: number }> = [];

        for (const memory of solutions) {
            const solution = memory as ErrorSolutionMemory;
            const similarity = this.calculateErrorSimilarity(query, solution.errorMessage);

            if (similarity > 0.3) {
                const score = similarity * solution.successRate;
                scored.push({ solution, score });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 5).map(s => s.solution);
    }

    protected calculateRelevance(query: string, text: string): number {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const textWords = new Set(text.toLowerCase().split(/\s+/));

        if (queryWords.length === 0) {
            return 0;
        }

        let matches = 0;
        for (const word of queryWords) {
            if (textWords.has(word)) {
                matches++;
            } else {
                // Partial match
                for (const textWord of textWords) {
                    if (textWord.includes(word) || word.includes(textWord)) {
                        matches += 0.5;
                        break;
                    }
                }
            }
        }

        return matches / queryWords.length;
    }

    protected calculateErrorSimilarity(error1: string, error2: string): number {
        const normalize = (s: string) => s
            .toLowerCase()
            .replace(/\d+/g, 'N')
            .replace(/['"][^'"]*['"]/g, 'STR')
            .replace(/\s+/g, ' ')
            .trim();

        const normalized1 = normalize(error1);
        const normalized2 = normalize(error2);

        if (normalized1 === normalized2) {
            return 1;
        }

        // Calculate word overlap
        const words1 = new Set(normalized1.split(' '));
        const words2 = new Set(normalized2.split(' '));

        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    protected estimateTokens(turns: ConversationTurn[]): number {
        let chars = 0;
        for (const turn of turns) {
            chars += turn.content.length;
            if (turn.codeContext) {
                chars += turn.codeContext.length;
            }
        }
        // Rough estimate: 4 chars per token
        return Math.ceil(chars / 4);
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
            'c': 'c',
            'cs': 'csharp',
            'rb': 'ruby',
            'php': 'php',
            'swift': 'swift',
            'kt': 'kotlin'
        };

        return languageMap[ext || ''] || 'unknown';
    }
}
