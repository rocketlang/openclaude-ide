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
import { generateUuid } from '@theia/core';
import {
    ConversationHistoryService,
    ConversationTurn,
    ConversationMemory,
    MemoryService,
    MemoryEntryType
} from '../common';

interface ActiveSession {
    sessionId: string;
    turns: ConversationTurn[];
    startTime: number;
    topics: Set<string>;
}

@injectable()
export class ConversationHistoryServiceImpl implements ConversationHistoryService {

    @inject(MemoryService)
    protected readonly memoryService: MemoryService;

    protected activeSessions: Map<string, ActiveSession> = new Map();

    @postConstruct()
    protected init(): void {
        // Clean up stale sessions on startup
        this.cleanupStaleSessions();
    }

    protected async cleanupStaleSessions(): Promise<void> {
        // Sessions older than 24 hours are considered stale
        const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;

        for (const [sessionId, session] of this.activeSessions) {
            if (session.startTime < staleThreshold) {
                await this.endSession(sessionId);
            }
        }
    }

    startSession(): string {
        const sessionId = generateUuid();
        this.activeSessions.set(sessionId, {
            sessionId,
            turns: [],
            startTime: Date.now(),
            topics: new Set()
        });
        return sessionId;
    }

    async addTurn(sessionId: string, turn: Omit<ConversationTurn, 'timestamp'>): Promise<void> {
        let session = this.activeSessions.get(sessionId);

        if (!session) {
            // Start a new session if not found
            session = {
                sessionId,
                turns: [],
                startTime: Date.now(),
                topics: new Set()
            };
            this.activeSessions.set(sessionId, session);
        }

        const fullTurn: ConversationTurn = {
            ...turn,
            timestamp: Date.now()
        };

        session.turns.push(fullTurn);

        // Extract topics from the content
        const topics = this.extractTopics(turn.content);
        for (const topic of topics) {
            session.topics.add(topic);
        }

        // Auto-persist if the session gets too large
        if (session.turns.length > 100) {
            await this.persistSession(session);
            session.turns = session.turns.slice(-20); // Keep last 20 turns
        }
    }

    async getHistory(sessionId: string): Promise<ConversationTurn[]> {
        const activeSession = this.activeSessions.get(sessionId);
        if (activeSession) {
            return activeSession.turns;
        }

        // Try to load from memory
        const memories = await this.memoryService.query({
            types: [MemoryEntryType.Conversation],
            searchText: sessionId,
            limit: 1
        });

        if (memories.length > 0) {
            const memory = memories[0] as ConversationMemory;
            return memory.turns;
        }

        return [];
    }

    async getRecentConversations(limit = 10): Promise<ConversationMemory[]> {
        const memories = await this.memoryService.query({
            types: [MemoryEntryType.Conversation],
            limit
        });

        return memories as ConversationMemory[];
    }

    async searchHistory(query: string): Promise<ConversationMemory[]> {
        const memories = await this.memoryService.query({
            types: [MemoryEntryType.Conversation]
        });

        const queryLower = query.toLowerCase();
        const results: ConversationMemory[] = [];

        for (const memory of memories) {
            const conv = memory as ConversationMemory;

            // Search in turns
            const matchingTurns = conv.turns.filter(turn =>
                turn.content.toLowerCase().includes(queryLower)
            );

            if (matchingTurns.length > 0) {
                results.push(conv);
                continue;
            }

            // Search in topics
            if (conv.topics && conv.topics.some(topic =>
                topic.toLowerCase().includes(queryLower)
            )) {
                results.push(conv);
                continue;
            }

            // Search in summary
            if (conv.summary && conv.summary.toLowerCase().includes(queryLower)) {
                results.push(conv);
            }
        }

        return results;
    }

    async summarizeConversation(sessionId: string): Promise<string> {
        const turns = await this.getHistory(sessionId);

        if (turns.length === 0) {
            return '';
        }

        // Simple summarization based on content analysis
        const userQueries = turns
            .filter(t => t.role === 'user')
            .map(t => t.content);

        const topics = new Set<string>();
        const codeFiles = new Set<string>();

        for (const turn of turns) {
            // Extract topics
            for (const topic of this.extractTopics(turn.content)) {
                topics.add(topic);
            }

            // Track files
            if (turn.fileUri) {
                codeFiles.add(turn.fileUri);
            }
        }

        const parts: string[] = [];

        if (userQueries.length > 0) {
            parts.push(`Discussion with ${userQueries.length} user messages`);
        }

        if (topics.size > 0) {
            parts.push(`Topics: ${Array.from(topics).slice(0, 5).join(', ')}`);
        }

        if (codeFiles.size > 0) {
            parts.push(`Files: ${Array.from(codeFiles).slice(0, 3).join(', ')}`);
        }

        return parts.join('. ');
    }

    async endSession(sessionId: string): Promise<void> {
        const session = this.activeSessions.get(sessionId);
        if (!session || session.turns.length === 0) {
            this.activeSessions.delete(sessionId);
            return;
        }

        await this.persistSession(session);
        this.activeSessions.delete(sessionId);
    }

    protected async persistSession(session: ActiveSession): Promise<void> {
        const summary = await this.summarizeConversation(session.sessionId);

        const memory: Omit<ConversationMemory, 'id' | 'accessCount' | 'lastAccessed'> = {
            type: MemoryEntryType.Conversation,
            timestamp: session.startTime,
            importance: this.calculateImportance(session),
            sessionId: session.sessionId,
            turns: session.turns,
            summary,
            topics: Array.from(session.topics)
        };

        await this.memoryService.store(memory);
    }

    protected calculateImportance(session: ActiveSession): number {
        let importance = 0.5;

        // More turns = more important
        importance += Math.min(0.2, session.turns.length * 0.01);

        // Code context increases importance
        const hasCodeContext = session.turns.some(t => t.codeContext || t.fileUri);
        if (hasCodeContext) {
            importance += 0.15;
        }

        // Technical topics increase importance
        const technicalTopics = ['code', 'bug', 'error', 'implement', 'fix', 'test', 'refactor'];
        const hasTechnicalTopic = Array.from(session.topics).some(topic =>
            technicalTopics.some(tt => topic.toLowerCase().includes(tt))
        );
        if (hasTechnicalTopic) {
            importance += 0.1;
        }

        return Math.min(1, importance);
    }

    protected extractTopics(content: string): string[] {
        const topics: string[] = [];

        // Extract code-related keywords
        const codeKeywords = [
            'function', 'class', 'interface', 'component', 'module',
            'api', 'endpoint', 'database', 'query', 'test',
            'bug', 'error', 'fix', 'implement', 'refactor',
            'typescript', 'javascript', 'react', 'node', 'python'
        ];

        const contentLower = content.toLowerCase();
        for (const keyword of codeKeywords) {
            if (contentLower.includes(keyword)) {
                topics.push(keyword);
            }
        }

        // Extract file references
        const filePattern = /[\w/-]+\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h)/g;
        const fileMatches = content.match(filePattern);
        if (fileMatches) {
            topics.push(...fileMatches);
        }

        return topics;
    }
}
