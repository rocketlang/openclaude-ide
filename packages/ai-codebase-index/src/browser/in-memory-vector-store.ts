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

import { injectable } from '@theia/core/shared/inversify';
import {
    VectorStore,
    CodeChunk,
    SearchResult,
    SearchOptions
} from '../common';

const INDEX_STORAGE_KEY = 'openclaude-codebase-index';
const INDEX_VERSION = '1.0.0';

interface StoredIndex {
    version: string;
    chunks: CodeChunk[];
    timestamp: number;
}

/**
 * In-memory vector store with IndexedDB persistence
 */
@injectable()
export class InMemoryVectorStore implements VectorStore {

    protected chunks: Map<string, CodeChunk> = new Map();
    protected fileIndex: Map<string, Set<string>> = new Map();
    protected db: IDBDatabase | undefined;
    protected dbName = 'openclaude-index';
    protected storeName = 'chunks';

    async add(chunks: CodeChunk[]): Promise<void> {
        for (const chunk of chunks) {
            this.chunks.set(chunk.id, chunk);

            // Update file index
            if (!this.fileIndex.has(chunk.filePath)) {
                this.fileIndex.set(chunk.filePath, new Set());
            }
            this.fileIndex.get(chunk.filePath)!.add(chunk.id);
        }
    }

    async removeByFile(filePath: string): Promise<void> {
        const chunkIds = this.fileIndex.get(filePath);
        if (chunkIds) {
            for (const id of chunkIds) {
                this.chunks.delete(id);
            }
            this.fileIndex.delete(filePath);
        }
    }

    async search(embedding: number[], options?: SearchOptions): Promise<SearchResult[]> {
        const maxResults = options?.maxResults ?? 10;
        const minScore = options?.minScore ?? 0.5;
        const results: SearchResult[] = [];

        for (const chunk of this.chunks.values()) {
            // Apply filters
            if (options?.filePatterns && options.filePatterns.length > 0) {
                const matches = options.filePatterns.some(pattern =>
                    this.matchPattern(chunk.filePath, pattern)
                );
                if (!matches) {
                    continue;
                }
            }

            if (options?.languages && options.languages.length > 0) {
                if (!options.languages.includes(chunk.language)) {
                    continue;
                }
            }

            if (options?.symbolTypes && options.symbolTypes.length > 0) {
                if (chunk.symbolType && !options.symbolTypes.includes(chunk.symbolType)) {
                    continue;
                }
            }

            // Calculate similarity
            if (chunk.embedding) {
                const score = this.cosineSimilarity(embedding, chunk.embedding);
                if (score >= minScore) {
                    results.push({
                        chunk: options?.includeContent ? chunk : { ...chunk, content: '' },
                        score,
                        snippet: this.generateSnippet(chunk.content)
                    });
                }
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        // Return top results
        return results.slice(0, maxResults);
    }

    getChunk(id: string): CodeChunk | undefined {
        return this.chunks.get(id);
    }

    getChunksByFile(filePath: string): CodeChunk[] {
        const chunkIds = this.fileIndex.get(filePath);
        if (!chunkIds) {
            return [];
        }

        const result: CodeChunk[] = [];
        for (const id of chunkIds) {
            const chunk = this.chunks.get(id);
            if (chunk) {
                result.push(chunk);
            }
        }
        return result;
    }

    getCount(): number {
        return this.chunks.size;
    }

    async clear(): Promise<void> {
        this.chunks.clear();
        this.fileIndex.clear();
        await this.clearStorage();
    }

    async persist(): Promise<void> {
        try {
            // Try IndexedDB first
            await this.persistToIndexedDB();
        } catch (error) {
            console.warn('IndexedDB persist failed, trying localStorage:', error);
            // Fallback to localStorage for smaller indexes
            this.persistToLocalStorage();
        }
    }

    async load(): Promise<void> {
        try {
            // Try IndexedDB first
            const loaded = await this.loadFromIndexedDB();
            if (!loaded) {
                // Fallback to localStorage
                this.loadFromLocalStorage();
            }
        } catch (error) {
            console.warn('Index load failed:', error);
        }
    }

    protected cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            return 0;
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) {
            return 0;
        }

        return dotProduct / denominator;
    }

    protected matchPattern(filePath: string, pattern: string): boolean {
        // Simple glob matching
        const regex = new RegExp(
            '^' + pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '.')
                .replace(/\./g, '\\.') + '$'
        );
        return regex.test(filePath);
    }

    protected generateSnippet(content: string, maxLength: number = 200): string {
        if (content.length <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength - 3) + '...';
    }

    protected async openDB(): Promise<IDBDatabase> {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
        });
    }

    protected async persistToIndexedDB(): Promise<void> {
        const db = await this.openDB();
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);

        // Clear existing data
        store.clear();

        // Store each chunk
        for (const chunk of this.chunks.values()) {
            store.put(chunk);
        }

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    protected async loadFromIndexedDB(): Promise<boolean> {
        try {
            const db = await this.openDB();
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const chunks = request.result as CodeChunk[];
                    if (chunks && chunks.length > 0) {
                        for (const chunk of chunks) {
                            this.chunks.set(chunk.id, chunk);
                            if (!this.fileIndex.has(chunk.filePath)) {
                                this.fileIndex.set(chunk.filePath, new Set());
                            }
                            this.fileIndex.get(chunk.filePath)!.add(chunk.id);
                        }
                        console.log(`Loaded ${chunks.length} chunks from IndexedDB`);
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch {
            return false;
        }
    }

    protected persistToLocalStorage(): void {
        try {
            const chunks = Array.from(this.chunks.values());
            // Limit size for localStorage
            if (chunks.length > 1000) {
                console.warn('Index too large for localStorage, truncating');
                chunks.length = 1000;
            }

            const stored: StoredIndex = {
                version: INDEX_VERSION,
                chunks,
                timestamp: Date.now()
            };

            localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(stored));
        } catch (error) {
            console.error('localStorage persist failed:', error);
        }
    }

    protected loadFromLocalStorage(): void {
        try {
            const stored = localStorage.getItem(INDEX_STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored) as StoredIndex;
                if (data.version === INDEX_VERSION) {
                    for (const chunk of data.chunks) {
                        this.chunks.set(chunk.id, chunk);
                        if (!this.fileIndex.has(chunk.filePath)) {
                            this.fileIndex.set(chunk.filePath, new Set());
                        }
                        this.fileIndex.get(chunk.filePath)!.add(chunk.id);
                    }
                    console.log(`Loaded ${data.chunks.length} chunks from localStorage`);
                }
            }
        } catch (error) {
            console.error('localStorage load failed:', error);
        }
    }

    protected async clearStorage(): Promise<void> {
        try {
            localStorage.removeItem(INDEX_STORAGE_KEY);
            const db = await this.openDB();
            const transaction = db.transaction(this.storeName, 'readwrite');
            transaction.objectStore(this.storeName).clear();
        } catch (error) {
            console.error('Clear storage failed:', error);
        }
    }
}
