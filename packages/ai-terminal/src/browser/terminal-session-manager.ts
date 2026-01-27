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

import { Disposable, DisposableCollection, Emitter, Event, generateUuid, ILogger } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { StorageService } from '@theia/core/lib/browser';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { ExecutionResult } from './terminal-executor';

/**
 * A conversation turn in a terminal session
 */
export interface SessionTurn {
    /** Unique ID for this turn */
    id: string;
    /** Timestamp */
    timestamp: number;
    /** User's request */
    userRequest: string;
    /** Commands suggested/executed */
    commands: string[];
    /** Execution results (if executed) */
    results?: ExecutionResult[];
    /** Working directory at time of request */
    cwd: string;
}

/**
 * A terminal AI session
 */
export interface TerminalSession {
    /** Unique session ID */
    id: string;
    /** Terminal widget ID this session belongs to */
    terminalId: string;
    /** Session creation timestamp */
    createdAt: number;
    /** Last activity timestamp */
    lastActivityAt: number;
    /** Conversation turns */
    turns: SessionTurn[];
    /** Session context/notes */
    context?: string;
    /** Whether session is active */
    active: boolean;
}

/**
 * Session summary for listing
 */
export interface SessionSummary {
    id: string;
    terminalId: string;
    createdAt: number;
    lastActivityAt: number;
    turnCount: number;
    lastRequest?: string;
    active: boolean;
}

export const TerminalSessionManager = Symbol('TerminalSessionManager');

/**
 * Service for managing terminal AI sessions with persistence
 */
export interface TerminalSessionManager extends Disposable {
    /**
     * Get or create a session for a terminal
     */
    getOrCreateSession(terminalId: string): TerminalSession;

    /**
     * Get a specific session by ID
     */
    getSession(sessionId: string): TerminalSession | undefined;

    /**
     * Get the active session for a terminal
     */
    getActiveSession(terminalId: string): TerminalSession | undefined;

    /**
     * List all sessions for a terminal
     */
    listSessions(terminalId?: string): SessionSummary[];

    /**
     * Add a turn to a session
     */
    addTurn(sessionId: string, turn: Omit<SessionTurn, 'id' | 'timestamp'>): SessionTurn;

    /**
     * Update a turn with execution results
     */
    updateTurnResults(sessionId: string, turnId: string, results: ExecutionResult[]): void;

    /**
     * Close/deactivate a session
     */
    closeSession(sessionId: string): void;

    /**
     * Delete a session
     */
    deleteSession(sessionId: string): void;

    /**
     * Clear all sessions for a terminal
     */
    clearSessions(terminalId: string): void;

    /**
     * Get recent context from session for AI prompt
     */
    getSessionContext(sessionId: string, maxTurns?: number): string;

    /**
     * Export session history
     */
    exportSession(sessionId: string): string;

    /**
     * Event fired when session is updated
     */
    readonly onSessionUpdated: Event<TerminalSession>;

    /**
     * Event fired when session is created
     */
    readonly onSessionCreated: Event<TerminalSession>;

    /**
     * Event fired when session is closed
     */
    readonly onSessionClosed: Event<string>;
}

@injectable()
export class TerminalSessionManagerImpl implements TerminalSessionManager {

    protected static readonly STORAGE_KEY = 'openclaude.terminal.sessions';
    protected static readonly MAX_SESSIONS_PER_TERMINAL = 10;
    protected static readonly MAX_TURNS_PER_SESSION = 100;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    protected readonly disposables = new DisposableCollection();
    protected readonly sessions = new Map<string, TerminalSession>();
    protected readonly terminalSessions = new Map<string, string[]>(); // terminalId -> sessionIds

    protected readonly onSessionUpdatedEmitter = new Emitter<TerminalSession>();
    readonly onSessionUpdated = this.onSessionUpdatedEmitter.event;

    protected readonly onSessionCreatedEmitter = new Emitter<TerminalSession>();
    readonly onSessionCreated = this.onSessionCreatedEmitter.event;

    protected readonly onSessionClosedEmitter = new Emitter<string>();
    readonly onSessionClosed = this.onSessionClosedEmitter.event;

    @postConstruct()
    protected async init(): Promise<void> {
        this.disposables.push(this.onSessionUpdatedEmitter);
        this.disposables.push(this.onSessionCreatedEmitter);
        this.disposables.push(this.onSessionClosedEmitter);

        // Load sessions from storage
        await this.loadSessions();

        // Listen for terminal disposal
        this.terminalService.onDidCreateTerminal(terminal => {
            terminal.onDidDispose(() => {
                this.handleTerminalDisposed(terminal.id);
            });
        });
    }

    dispose(): void {
        this.disposables.dispose();
    }

    getOrCreateSession(terminalId: string): TerminalSession {
        // Check for existing active session
        const existingSession = this.getActiveSession(terminalId);
        if (existingSession) {
            return existingSession;
        }

        // Create new session
        const session: TerminalSession = {
            id: generateUuid(),
            terminalId,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
            turns: [],
            active: true
        };

        this.sessions.set(session.id, session);

        // Track session for terminal
        const terminalSessionIds = this.terminalSessions.get(terminalId) || [];
        terminalSessionIds.push(session.id);
        this.terminalSessions.set(terminalId, terminalSessionIds);

        // Enforce max sessions per terminal
        this.pruneOldSessions(terminalId);

        this.onSessionCreatedEmitter.fire(session);
        this.saveSessions();

        this.logger.info(`Created new terminal session: ${session.id} for terminal: ${terminalId}`);
        return session;
    }

    getSession(sessionId: string): TerminalSession | undefined {
        return this.sessions.get(sessionId);
    }

    getActiveSession(terminalId: string): TerminalSession | undefined {
        const sessionIds = this.terminalSessions.get(terminalId) || [];
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session?.active) {
                return session;
            }
        }
        return undefined;
    }

    listSessions(terminalId?: string): SessionSummary[] {
        const summaries: SessionSummary[] = [];

        const sessionIds = terminalId
            ? (this.terminalSessions.get(terminalId) || [])
            : Array.from(this.sessions.keys());

        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session) {
                summaries.push({
                    id: session.id,
                    terminalId: session.terminalId,
                    createdAt: session.createdAt,
                    lastActivityAt: session.lastActivityAt,
                    turnCount: session.turns.length,
                    lastRequest: session.turns[session.turns.length - 1]?.userRequest,
                    active: session.active
                });
            }
        }

        // Sort by last activity, newest first
        return summaries.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    }

    addTurn(sessionId: string, turn: Omit<SessionTurn, 'id' | 'timestamp'>): SessionTurn {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        const newTurn: SessionTurn = {
            ...turn,
            id: generateUuid(),
            timestamp: Date.now()
        };

        session.turns.push(newTurn);
        session.lastActivityAt = Date.now();

        // Enforce max turns per session
        if (session.turns.length > TerminalSessionManagerImpl.MAX_TURNS_PER_SESSION) {
            session.turns.shift();
        }

        this.onSessionUpdatedEmitter.fire(session);
        this.saveSessions();

        return newTurn;
    }

    updateTurnResults(sessionId: string, turnId: string, results: ExecutionResult[]): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        const turn = session.turns.find(t => t.id === turnId);
        if (turn) {
            turn.results = results;
            session.lastActivityAt = Date.now();
            this.onSessionUpdatedEmitter.fire(session);
            this.saveSessions();
        }
    }

    closeSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.active = false;
            this.onSessionClosedEmitter.fire(sessionId);
            this.saveSessions();
            this.logger.info(`Closed terminal session: ${sessionId}`);
        }
    }

    deleteSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.sessions.delete(sessionId);

            // Remove from terminal sessions
            const terminalSessionIds = this.terminalSessions.get(session.terminalId) || [];
            const index = terminalSessionIds.indexOf(sessionId);
            if (index !== -1) {
                terminalSessionIds.splice(index, 1);
                this.terminalSessions.set(session.terminalId, terminalSessionIds);
            }

            this.onSessionClosedEmitter.fire(sessionId);
            this.saveSessions();
            this.logger.info(`Deleted terminal session: ${sessionId}`);
        }
    }

    clearSessions(terminalId: string): void {
        const sessionIds = this.terminalSessions.get(terminalId) || [];
        for (const sessionId of sessionIds) {
            this.sessions.delete(sessionId);
            this.onSessionClosedEmitter.fire(sessionId);
        }
        this.terminalSessions.delete(terminalId);
        this.saveSessions();
        this.logger.info(`Cleared all sessions for terminal: ${terminalId}`);
    }

    getSessionContext(sessionId: string, maxTurns = 5): string {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return '';
        }

        const recentTurns = session.turns.slice(-maxTurns);
        const contextParts: string[] = [];

        for (const turn of recentTurns) {
            contextParts.push(`User: ${turn.userRequest}`);
            if (turn.commands.length > 0) {
                contextParts.push(`Commands: ${turn.commands.join('; ')}`);
            }
            if (turn.results && turn.results.length > 0) {
                const successCount = turn.results.filter(r => r.success).length;
                contextParts.push(`Results: ${successCount}/${turn.results.length} successful`);
            }
        }

        return contextParts.join('\n');
    }

    exportSession(sessionId: string): string {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return '';
        }

        const lines: string[] = [
            `# Terminal Session Export`,
            `Session ID: ${session.id}`,
            `Created: ${new Date(session.createdAt).toISOString()}`,
            `Last Activity: ${new Date(session.lastActivityAt).toISOString()}`,
            ``,
            `## Conversation`,
            ``
        ];

        for (const turn of session.turns) {
            lines.push(`### ${new Date(turn.timestamp).toLocaleString()}`);
            lines.push(`**Request:** ${turn.userRequest}`);
            lines.push(`**Directory:** ${turn.cwd}`);
            lines.push(`**Commands:**`);
            for (const cmd of turn.commands) {
                lines.push(`\`\`\`bash`);
                lines.push(cmd);
                lines.push(`\`\`\``);
            }
            if (turn.results) {
                lines.push(`**Results:**`);
                for (const result of turn.results) {
                    lines.push(`- ${result.command}: ${result.success ? 'Success' : 'Failed'} (${result.duration}ms)`);
                    if (result.stdout) {
                        lines.push(`  Output: ${result.stdout.substring(0, 200)}${result.stdout.length > 200 ? '...' : ''}`);
                    }
                }
            }
            lines.push(``);
        }

        return lines.join('\n');
    }

    protected async loadSessions(): Promise<void> {
        try {
            const data = await this.storageService.getData<{
                sessions: TerminalSession[];
                terminalSessions: Record<string, string[]>;
            }>(TerminalSessionManagerImpl.STORAGE_KEY);

            if (data) {
                for (const session of data.sessions) {
                    this.sessions.set(session.id, session);
                }
                for (const [terminalId, sessionIds] of Object.entries(data.terminalSessions)) {
                    this.terminalSessions.set(terminalId, sessionIds);
                }
                this.logger.info(`Loaded ${this.sessions.size} terminal sessions from storage`);
            }
        } catch (error) {
            this.logger.warn('Failed to load terminal sessions from storage:', error);
        }
    }

    protected saveSessions(): void {
        const data = {
            sessions: Array.from(this.sessions.values()),
            terminalSessions: Object.fromEntries(this.terminalSessions.entries())
        };
        this.storageService.setData(TerminalSessionManagerImpl.STORAGE_KEY, data);
    }

    protected pruneOldSessions(terminalId: string): void {
        const sessionIds = this.terminalSessions.get(terminalId) || [];
        if (sessionIds.length <= TerminalSessionManagerImpl.MAX_SESSIONS_PER_TERMINAL) {
            return;
        }

        // Get sessions sorted by last activity (oldest first)
        const sessions = sessionIds
            .map(id => this.sessions.get(id))
            .filter((s): s is TerminalSession => !!s && !s.active)
            .sort((a, b) => a.lastActivityAt - b.lastActivityAt);

        // Remove oldest inactive sessions
        const toRemove = sessions.slice(0, sessionIds.length - TerminalSessionManagerImpl.MAX_SESSIONS_PER_TERMINAL);
        for (const session of toRemove) {
            this.deleteSession(session.id);
        }
    }

    protected handleTerminalDisposed(terminalId: string): void {
        // Close active session for this terminal
        const activeSession = this.getActiveSession(terminalId);
        if (activeSession) {
            this.closeSession(activeSession.id);
        }
    }
}
