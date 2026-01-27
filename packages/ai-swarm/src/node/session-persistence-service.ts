// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SwarmSession, SwarmTask, SubAgentInstance, AgentMessage } from '../common/swarm-protocol';
import { CostSummary, UsageRecord } from './cost-tracking-service';

/**
 * Persisted session data
 */
export interface PersistedSession {
    /** Version of the persistence format */
    version: string;
    /** When the session was saved */
    savedAt: number;
    /** The session data */
    session: SwarmSession;
    /** All tasks */
    tasks: SwarmTask[];
    /** All agents */
    agents: SubAgentInstance[];
    /** All messages */
    messages: AgentMessage[];
    /** Cost summary */
    costSummary?: CostSummary;
    /** Usage records */
    usageRecords?: UsageRecord[];
    /** Metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Session list entry (lightweight)
 */
export interface SessionListEntry {
    id: string;
    name: string;
    status: string;
    originalTask: string;
    savedAt: number;
    tasksCount: number;
    agentsCount: number;
    totalCost?: number;
}

/**
 * Configuration for persistence
 */
export interface PersistenceConfig {
    /** Base directory for storing sessions */
    storageDir: string;
    /** Auto-save interval in ms (0 = disabled) */
    autoSaveInterval: number;
    /** Max sessions to keep */
    maxSessions: number;
    /** Whether to compress saved data */
    compress: boolean;
}

const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
    storageDir: '.swarm-sessions',
    autoSaveInterval: 60000, // 1 minute
    maxSessions: 50,
    compress: false
};

const PERSISTENCE_VERSION = '1.0.0';

export const SessionPersistenceService = Symbol('SessionPersistenceService');

/**
 * Service for persisting and restoring swarm sessions
 */
export interface SessionPersistenceService {
    /**
     * Initialize the persistence service with a workspace path
     */
    initialize(workspacePath: string): Promise<void>;

    /**
     * Save a session to disk
     */
    saveSession(
        session: SwarmSession,
        tasks: SwarmTask[],
        agents: SubAgentInstance[],
        messages: AgentMessage[],
        costSummary?: CostSummary,
        usageRecords?: UsageRecord[]
    ): Promise<void>;

    /**
     * Load a session from disk
     */
    loadSession(sessionId: string): Promise<PersistedSession | undefined>;

    /**
     * List all saved sessions
     */
    listSessions(): Promise<SessionListEntry[]>;

    /**
     * Delete a saved session
     */
    deleteSession(sessionId: string): Promise<void>;

    /**
     * Check if a session exists
     */
    sessionExists(sessionId: string): Promise<boolean>;

    /**
     * Get the storage path for a session
     */
    getSessionPath(sessionId: string): string;

    /**
     * Export session as JSON string
     */
    exportSession(sessionId: string): Promise<string>;

    /**
     * Import session from JSON string
     */
    importSession(jsonData: string): Promise<string>;

    /**
     * Clean up old sessions (keep only maxSessions)
     */
    cleanup(): Promise<number>;

    /**
     * Get storage statistics
     */
    getStorageStats(): Promise<{
        totalSessions: number;
        totalSizeBytes: number;
        oldestSession?: number;
        newestSession?: number;
    }>;
}

@injectable()
export class SessionPersistenceServiceImpl implements SessionPersistenceService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected config: PersistenceConfig = DEFAULT_PERSISTENCE_CONFIG;
    protected storageDir: string = '';
    protected initialized: boolean = false;

    async initialize(workspacePath: string): Promise<void> {
        this.storageDir = path.join(workspacePath, this.config.storageDir);

        try {
            await fs.mkdir(this.storageDir, { recursive: true });
            this.initialized = true;
            this.logger.info(`Session persistence initialized at ${this.storageDir}`);
        } catch (error) {
            this.logger.error(`Failed to initialize persistence: ${error}`);
            throw error;
        }
    }

    async saveSession(
        session: SwarmSession,
        tasks: SwarmTask[],
        agents: SubAgentInstance[],
        messages: AgentMessage[],
        costSummary?: CostSummary,
        usageRecords?: UsageRecord[]
    ): Promise<void> {
        if (!this.initialized) {
            throw new Error('Persistence service not initialized');
        }

        const persisted: PersistedSession = {
            version: PERSISTENCE_VERSION,
            savedAt: Date.now(),
            session,
            tasks,
            agents,
            messages,
            costSummary,
            usageRecords
        };

        const filePath = this.getSessionPath(session.id);
        const content = JSON.stringify(persisted, null, 2);

        try {
            await fs.writeFile(filePath, content, 'utf-8');
            this.logger.info(`Session ${session.id} saved to ${filePath}`);
        } catch (error) {
            this.logger.error(`Failed to save session ${session.id}: ${error}`);
            throw error;
        }
    }

    async loadSession(sessionId: string): Promise<PersistedSession | undefined> {
        if (!this.initialized) {
            throw new Error('Persistence service not initialized');
        }

        const filePath = this.getSessionPath(sessionId);

        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const persisted: PersistedSession = JSON.parse(content);

            // Version check for future migrations
            if (persisted.version !== PERSISTENCE_VERSION) {
                this.logger.warn(`Session ${sessionId} uses older version ${persisted.version}`);
                // Could implement migration here
            }

            this.logger.info(`Session ${sessionId} loaded from ${filePath}`);
            return persisted;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            this.logger.error(`Failed to load session ${sessionId}: ${error}`);
            throw error;
        }
    }

    async listSessions(): Promise<SessionListEntry[]> {
        if (!this.initialized) {
            throw new Error('Persistence service not initialized');
        }

        try {
            const files = await fs.readdir(this.storageDir);
            const sessionFiles = files.filter(f => f.endsWith('.json'));

            const entries: SessionListEntry[] = [];

            for (const file of sessionFiles) {
                try {
                    const filePath = path.join(this.storageDir, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const persisted: PersistedSession = JSON.parse(content);

                    entries.push({
                        id: persisted.session.id,
                        name: persisted.session.name,
                        status: persisted.session.status,
                        originalTask: persisted.session.originalTask,
                        savedAt: persisted.savedAt,
                        tasksCount: persisted.tasks.length,
                        agentsCount: persisted.agents.length,
                        totalCost: persisted.costSummary?.totalCost
                    });
                } catch (error) {
                    this.logger.warn(`Failed to read session file ${file}: ${error}`);
                }
            }

            // Sort by savedAt descending (newest first)
            entries.sort((a, b) => b.savedAt - a.savedAt);

            return entries;
        } catch (error) {
            this.logger.error(`Failed to list sessions: ${error}`);
            throw error;
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        if (!this.initialized) {
            throw new Error('Persistence service not initialized');
        }

        const filePath = this.getSessionPath(sessionId);

        try {
            await fs.unlink(filePath);
            this.logger.info(`Session ${sessionId} deleted from ${filePath}`);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                // Already deleted, ignore
                return;
            }
            this.logger.error(`Failed to delete session ${sessionId}: ${error}`);
            throw error;
        }
    }

    async sessionExists(sessionId: string): Promise<boolean> {
        if (!this.initialized) {
            return false;
        }

        const filePath = this.getSessionPath(sessionId);

        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    getSessionPath(sessionId: string): string {
        // Sanitize sessionId to prevent path traversal
        const sanitized = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_');
        return path.join(this.storageDir, `${sanitized}.json`);
    }

    async exportSession(sessionId: string): Promise<string> {
        const persisted = await this.loadSession(sessionId);

        if (!persisted) {
            throw new Error(`Session ${sessionId} not found`);
        }

        return JSON.stringify(persisted, null, 2);
    }

    async importSession(jsonData: string): Promise<string> {
        if (!this.initialized) {
            throw new Error('Persistence service not initialized');
        }

        try {
            const persisted: PersistedSession = JSON.parse(jsonData);

            // Validate structure
            if (!persisted.version || !persisted.session || !persisted.tasks) {
                throw new Error('Invalid session data format');
            }

            // Generate new ID if importing a duplicate
            const exists = await this.sessionExists(persisted.session.id);
            if (exists) {
                const newId = `${persisted.session.id}-imported-${Date.now()}`;
                // Create new session with new ID (since id is readonly)
                persisted.session = {
                    ...persisted.session,
                    id: newId
                } as SwarmSession;
                this.logger.info(`Session ID changed to ${newId} to avoid conflict`);
            }

            // Update savedAt
            persisted.savedAt = Date.now();

            // Save the imported session
            const filePath = this.getSessionPath(persisted.session.id);
            await fs.writeFile(filePath, JSON.stringify(persisted, null, 2), 'utf-8');

            this.logger.info(`Session imported as ${persisted.session.id}`);
            return persisted.session.id;
        } catch (error) {
            this.logger.error(`Failed to import session: ${error}`);
            throw error;
        }
    }

    async cleanup(): Promise<number> {
        if (!this.initialized) {
            return 0;
        }

        const sessions = await this.listSessions();

        if (sessions.length <= this.config.maxSessions) {
            return 0;
        }

        // Sessions are already sorted newest first
        const toDelete = sessions.slice(this.config.maxSessions);
        let deleted = 0;

        for (const session of toDelete) {
            try {
                await this.deleteSession(session.id);
                deleted++;
            } catch (error) {
                this.logger.warn(`Failed to delete old session ${session.id}: ${error}`);
            }
        }

        if (deleted > 0) {
            this.logger.info(`Cleaned up ${deleted} old sessions`);
        }

        return deleted;
    }

    async getStorageStats(): Promise<{
        totalSessions: number;
        totalSizeBytes: number;
        oldestSession?: number;
        newestSession?: number;
    }> {
        if (!this.initialized) {
            return { totalSessions: 0, totalSizeBytes: 0 };
        }

        try {
            const files = await fs.readdir(this.storageDir);
            const sessionFiles = files.filter(f => f.endsWith('.json'));

            let totalSize = 0;
            let oldest: number | undefined;
            let newest: number | undefined;

            for (const file of sessionFiles) {
                const filePath = path.join(this.storageDir, file);
                const stats = await fs.stat(filePath);
                totalSize += stats.size;

                const mtime = stats.mtime.getTime();
                if (!oldest || mtime < oldest) {
                    oldest = mtime;
                }
                if (!newest || mtime > newest) {
                    newest = mtime;
                }
            }

            return {
                totalSessions: sessionFiles.length,
                totalSizeBytes: totalSize,
                oldestSession: oldest,
                newestSession: newest
            };
        } catch (error) {
            this.logger.error(`Failed to get storage stats: ${error}`);
            return { totalSessions: 0, totalSizeBytes: 0 };
        }
    }
}
