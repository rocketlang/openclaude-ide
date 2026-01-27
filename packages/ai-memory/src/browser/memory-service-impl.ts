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

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { generateUuid } from '@theia/core';
import {
    MemoryService,
    MemoryEntry,
    MemoryEntryType,
    MemoryQueryOptions,
    MemoryStats
} from '../common';

const DB_NAME = 'openclaude-memory';
const DB_VERSION = 1;
const STORE_NAME = 'memories';

@injectable()
export class MemoryServiceImpl implements MemoryService {

    protected db: IDBDatabase | undefined;
    protected initPromise: Promise<void> | undefined;

    @postConstruct()
    protected init(): void {
        this.initPromise = this.initDatabase();
    }

    protected async initDatabase(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open memory database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('projectId', 'projectId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('importance', 'importance', { unique: false });
                }
            };
        });
    }

    protected async ensureDb(): Promise<IDBDatabase> {
        if (this.initPromise) {
            await this.initPromise;
        }
        if (!this.db) {
            throw new Error('Memory database not initialized');
        }
        return this.db;
    }

    async store(entry: Omit<MemoryEntry, 'id' | 'accessCount' | 'lastAccessed'>): Promise<string> {
        const db = await this.ensureDb();
        const id = generateUuid();
        const now = Date.now();

        const fullEntry: MemoryEntry = {
            ...entry,
            id,
            accessCount: 0,
            lastAccessed: now
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(fullEntry);

            request.onsuccess = () => resolve(id);
            request.onerror = () => reject(request.error);
        });
    }

    async retrieve(id: string): Promise<MemoryEntry | undefined> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                const entry = request.result as MemoryEntry | undefined;
                if (entry) {
                    // Update access count and last accessed
                    entry.accessCount++;
                    entry.lastAccessed = Date.now();
                    store.put(entry);
                }
                resolve(entry);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async query(options: MemoryQueryOptions): Promise<MemoryEntry[]> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const results: MemoryEntry[] = [];

            let request: IDBRequest<IDBCursorWithValue | null>;

            if (options.types && options.types.length === 1) {
                const index = store.index('type');
                request = index.openCursor(IDBKeyRange.only(options.types[0]));
            } else if (options.projectId) {
                const index = store.index('projectId');
                request = index.openCursor(IDBKeyRange.only(options.projectId));
            } else {
                request = store.openCursor();
            }

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    const entry = cursor.value as MemoryEntry;
                    if (this.matchesQuery(entry, options)) {
                        results.push(entry);
                    }
                    if (!options.limit || results.length < options.limit) {
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                } else {
                    // Sort by importance and recency
                    results.sort((a, b) => {
                        const importanceWeight = 0.6;
                        const recencyWeight = 0.4;
                        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

                        const aRecency = Math.max(0, 1 - (Date.now() - a.lastAccessed) / maxAge);
                        const bRecency = Math.max(0, 1 - (Date.now() - b.lastAccessed) / maxAge);

                        const aScore = a.importance * importanceWeight + aRecency * recencyWeight;
                        const bScore = b.importance * importanceWeight + bRecency * recencyWeight;

                        return bScore - aScore;
                    });

                    resolve(options.limit ? results.slice(0, options.limit) : results);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    protected matchesQuery(entry: MemoryEntry, options: MemoryQueryOptions): boolean {
        if (options.types && options.types.length > 0 && !options.types.includes(entry.type)) {
            return false;
        }

        if (options.projectId && entry.projectId !== options.projectId) {
            return false;
        }

        if (options.tags && options.tags.length > 0) {
            if (!entry.tags || !options.tags.some(tag => entry.tags!.includes(tag))) {
                return false;
            }
        }

        if (options.minImportance !== undefined && entry.importance < options.minImportance) {
            return false;
        }

        if (options.since !== undefined && entry.timestamp < options.since) {
            return false;
        }

        return true;
    }

    async update(id: string, updates: Record<string, unknown>): Promise<void> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const entry = getRequest.result as MemoryEntry | undefined;
                if (entry) {
                    const updatedEntry = { ...entry, ...updates, id }; // Ensure ID is preserved
                    const putRequest = store.put(updatedEntry);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error(`Memory entry not found: ${id}`));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async delete(id: string): Promise<void> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getStats(): Promise<MemoryStats> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);

            const stats: MemoryStats = {
                totalEntries: 0,
                byType: {} as Record<MemoryEntryType, number>,
                totalSize: 0,
                oldestEntry: Number.MAX_SAFE_INTEGER,
                newestEntry: 0
            };

            // Initialize type counts
            for (const type of Object.values(MemoryEntryType)) {
                stats.byType[type] = 0;
            }

            const request = store.openCursor();

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    const entry = cursor.value as MemoryEntry;
                    stats.totalEntries++;
                    stats.byType[entry.type]++;
                    stats.totalSize += JSON.stringify(entry).length;
                    stats.oldestEntry = Math.min(stats.oldestEntry, entry.timestamp);
                    stats.newestEntry = Math.max(stats.newestEntry, entry.timestamp);
                    cursor.continue();
                } else {
                    if (stats.oldestEntry === Number.MAX_SAFE_INTEGER) {
                        stats.oldestEntry = 0;
                    }
                    resolve(stats);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clear(): Promise<void> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async export(): Promise<string> {
        const entries = await this.query({});
        return JSON.stringify(entries, null, 2);
    }

    async import(data: string): Promise<void> {
        const entries = JSON.parse(data) as MemoryEntry[];
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            let completed = 0;
            let failed = 0;

            for (const entry of entries) {
                const request = store.put(entry);
                request.onsuccess = () => {
                    completed++;
                    if (completed + failed === entries.length) {
                        resolve();
                    }
                };
                request.onerror = () => {
                    failed++;
                    console.error('Failed to import entry:', entry.id, request.error);
                    if (completed + failed === entries.length) {
                        resolve();
                    }
                };
            }

            if (entries.length === 0) {
                resolve();
            }
        });
    }
}
