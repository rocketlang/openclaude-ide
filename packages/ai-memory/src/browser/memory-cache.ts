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
import { MemoryEntry, MemoryEntryType } from '../common';

/**
 * LRU Cache entry with metadata
 */
interface CacheEntry<T> {
    value: T;
    timestamp: number;
    accessCount: number;
    size: number;
}

/**
 * Configuration for the memory cache
 */
export interface MemoryCacheConfig {
    /** Maximum number of entries */
    maxEntries: number;
    /** Maximum total size in bytes */
    maxSize: number;
    /** TTL in milliseconds (0 = no expiry) */
    ttl: number;
    /** Enable LRU eviction */
    enableLRU: boolean;
}

const DEFAULT_CONFIG: MemoryCacheConfig = {
    maxEntries: 1000,
    maxSize: 10 * 1024 * 1024, // 10MB
    ttl: 30 * 60 * 1000, // 30 minutes
    enableLRU: true
};

/**
 * High-performance in-memory cache for memory entries
 * Uses LRU eviction and size-based limits
 */
@injectable()
export class MemoryCache {

    protected cache: Map<string, CacheEntry<MemoryEntry>> = new Map();
    protected typeIndex: Map<MemoryEntryType, Set<string>> = new Map();
    protected tagIndex: Map<string, Set<string>> = new Map();
    protected config: MemoryCacheConfig;
    protected currentSize = 0;

    constructor(config: Partial<MemoryCacheConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.initializeIndexes();
    }

    protected initializeIndexes(): void {
        for (const type of Object.values(MemoryEntryType)) {
            this.typeIndex.set(type, new Set());
        }
    }

    /**
     * Get an entry from cache
     */
    get(id: string): MemoryEntry | undefined {
        const entry = this.cache.get(id);
        if (!entry) {
            return undefined;
        }

        // Check TTL
        if (this.config.ttl > 0 && Date.now() - entry.timestamp > this.config.ttl) {
            this.delete(id);
            return undefined;
        }

        // Update access metadata for LRU
        entry.accessCount++;
        entry.timestamp = Date.now();

        return entry.value;
    }

    /**
     * Set an entry in cache
     */
    set(entry: MemoryEntry): void {
        const size = this.estimateSize(entry);

        // Evict if necessary
        while (this.shouldEvict(size)) {
            this.evictOne();
        }

        // Remove old entry if exists
        if (this.cache.has(entry.id)) {
            this.delete(entry.id);
        }

        // Add new entry
        const cacheEntry: CacheEntry<MemoryEntry> = {
            value: entry,
            timestamp: Date.now(),
            accessCount: 1,
            size
        };

        this.cache.set(entry.id, cacheEntry);
        this.currentSize += size;

        // Update indexes
        this.indexEntry(entry);
    }

    /**
     * Delete an entry from cache
     */
    delete(id: string): boolean {
        const entry = this.cache.get(id);
        if (!entry) {
            return false;
        }

        // Remove from indexes
        this.unindexEntry(entry.value);

        // Remove from cache
        this.cache.delete(id);
        this.currentSize -= entry.size;

        return true;
    }

    /**
     * Check if entry exists in cache
     */
    has(id: string): boolean {
        const entry = this.cache.get(id);
        if (!entry) {
            return false;
        }

        // Check TTL
        if (this.config.ttl > 0 && Date.now() - entry.timestamp > this.config.ttl) {
            this.delete(id);
            return false;
        }

        return true;
    }

    /**
     * Get entries by type (uses index for O(1) lookup)
     */
    getByType(type: MemoryEntryType): MemoryEntry[] {
        const ids = this.typeIndex.get(type);
        if (!ids) {
            return [];
        }

        const results: MemoryEntry[] = [];
        for (const id of ids) {
            const entry = this.get(id);
            if (entry) {
                results.push(entry);
            }
        }

        return results;
    }

    /**
     * Get entries by tag (uses index for O(1) lookup)
     */
    getByTag(tag: string): MemoryEntry[] {
        const ids = this.tagIndex.get(tag);
        if (!ids) {
            return [];
        }

        const results: MemoryEntry[] = [];
        for (const id of ids) {
            const entry = this.get(id);
            if (entry) {
                results.push(entry);
            }
        }

        return results;
    }

    /**
     * Get all entries matching a filter
     */
    filter(predicate: (entry: MemoryEntry) => boolean): MemoryEntry[] {
        const results: MemoryEntry[] = [];

        for (const [id] of this.cache) {
            const entry = this.get(id);
            if (entry && predicate(entry)) {
                results.push(entry);
            }
        }

        return results;
    }

    /**
     * Clear the entire cache
     */
    clear(): void {
        this.cache.clear();
        this.currentSize = 0;
        this.initializeIndexes();
        this.tagIndex.clear();
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        entries: number;
        size: number;
        maxEntries: number;
        maxSize: number;
        hitRate: number;
    } {
        let totalAccess = 0;
        for (const entry of this.cache.values()) {
            totalAccess += entry.accessCount;
        }

        return {
            entries: this.cache.size,
            size: this.currentSize,
            maxEntries: this.config.maxEntries,
            maxSize: this.config.maxSize,
            hitRate: this.cache.size > 0 ? totalAccess / this.cache.size : 0
        };
    }

    /**
     * Prewarm cache with entries
     */
    prewarm(entries: MemoryEntry[]): void {
        for (const entry of entries) {
            this.set(entry);
        }
    }

    /**
     * Export cache for persistence
     */
    export(): MemoryEntry[] {
        const entries: MemoryEntry[] = [];
        for (const cacheEntry of this.cache.values()) {
            entries.push(cacheEntry.value);
        }
        return entries;
    }

    protected indexEntry(entry: MemoryEntry): void {
        // Type index
        const typeSet = this.typeIndex.get(entry.type);
        if (typeSet) {
            typeSet.add(entry.id);
        }

        // Tag index
        if (entry.tags) {
            for (const tag of entry.tags) {
                let tagSet = this.tagIndex.get(tag);
                if (!tagSet) {
                    tagSet = new Set();
                    this.tagIndex.set(tag, tagSet);
                }
                tagSet.add(entry.id);
            }
        }
    }

    protected unindexEntry(entry: MemoryEntry): void {
        // Type index
        const typeSet = this.typeIndex.get(entry.type);
        if (typeSet) {
            typeSet.delete(entry.id);
        }

        // Tag index
        if (entry.tags) {
            for (const tag of entry.tags) {
                const tagSet = this.tagIndex.get(tag);
                if (tagSet) {
                    tagSet.delete(entry.id);
                    if (tagSet.size === 0) {
                        this.tagIndex.delete(tag);
                    }
                }
            }
        }
    }

    protected shouldEvict(newSize: number): boolean {
        if (this.cache.size >= this.config.maxEntries) {
            return true;
        }
        if (this.currentSize + newSize > this.config.maxSize) {
            return true;
        }
        return false;
    }

    protected evictOne(): void {
        if (this.cache.size === 0) {
            return;
        }

        if (this.config.enableLRU) {
            // Find least recently used entry
            let lruId: string | undefined;
            let lruTime = Infinity;

            for (const [id, entry] of this.cache) {
                // Consider both timestamp and access count
                const score = entry.timestamp - (entry.accessCount * 1000);
                if (score < lruTime) {
                    lruTime = score;
                    lruId = id;
                }
            }

            if (lruId) {
                this.delete(lruId);
            }
        } else {
            // FIFO eviction - remove first entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.delete(firstKey);
            }
        }
    }

    protected estimateSize(entry: MemoryEntry): number {
        // Rough estimation of object size in bytes
        return JSON.stringify(entry).length * 2; // UTF-16 encoding
    }
}

/**
 * Decorator for caching method results
 */
export function Cached(ttl: number = 60000) {
    const cache = new Map<string, { value: unknown; expires: number }>();

    return function (
        _target: unknown,
        _propertyKey: string,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: unknown[]): Promise<unknown> {
            const key = JSON.stringify(args);
            const cached = cache.get(key);

            if (cached && Date.now() < cached.expires) {
                return cached.value;
            }

            const result = await originalMethod.apply(this, args);
            cache.set(key, { value: result, expires: Date.now() + ttl });

            return result;
        };

        return descriptor;
    };
}
