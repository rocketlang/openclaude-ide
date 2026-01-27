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

import { Disposable } from '@theia/core';

/**
 * Debounce function calls
 */
export class Debouncer<T extends (...args: unknown[]) => unknown> implements Disposable {
    protected timeoutId: ReturnType<typeof setTimeout> | undefined;
    protected lastArgs: Parameters<T> | undefined;

    constructor(
        protected readonly fn: T,
        protected readonly delay: number,
        protected readonly leading = false
    ) {}

    call(...args: Parameters<T>): void {
        this.lastArgs = args;

        if (this.leading && !this.timeoutId) {
            this.fn(...args);
        }

        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }

        this.timeoutId = setTimeout(() => {
            if (!this.leading && this.lastArgs) {
                this.fn(...this.lastArgs);
            }
            this.timeoutId = undefined;
            this.lastArgs = undefined;
        }, this.delay);
    }

    cancel(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
        }
        this.lastArgs = undefined;
    }

    flush(): void {
        if (this.timeoutId && this.lastArgs) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
            this.fn(...this.lastArgs);
            this.lastArgs = undefined;
        }
    }

    dispose(): void {
        this.cancel();
    }
}

/**
 * Throttle function calls
 */
export class Throttler<T extends (...args: unknown[]) => unknown> implements Disposable {
    protected lastCall = 0;
    protected timeoutId: ReturnType<typeof setTimeout> | undefined;
    protected lastArgs: Parameters<T> | undefined;

    constructor(
        protected readonly fn: T,
        protected readonly interval: number,
        protected readonly trailing = true
    ) {}

    call(...args: Parameters<T>): void {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCall;

        if (timeSinceLastCall >= this.interval) {
            this.lastCall = now;
            this.fn(...args);
        } else if (this.trailing) {
            this.lastArgs = args;

            if (!this.timeoutId) {
                this.timeoutId = setTimeout(() => {
                    this.lastCall = Date.now();
                    if (this.lastArgs) {
                        this.fn(...this.lastArgs);
                        this.lastArgs = undefined;
                    }
                    this.timeoutId = undefined;
                }, this.interval - timeSinceLastCall);
            }
        }
    }

    cancel(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
        }
        this.lastArgs = undefined;
    }

    dispose(): void {
        this.cancel();
    }
}

/**
 * Batch multiple calls into one
 */
export class Batcher<T, R> implements Disposable {
    protected items: T[] = [];
    protected timeoutId: ReturnType<typeof setTimeout> | undefined;
    protected resolvers: Array<(result: R) => void> = [];

    constructor(
        protected readonly processBatch: (items: T[]) => Promise<R[]>,
        protected readonly delay: number,
        protected readonly maxBatchSize = 100
    ) {}

    async add(item: T): Promise<R> {
        return new Promise((resolve) => {
            this.items.push(item);
            this.resolvers.push(resolve);

            if (this.items.length >= this.maxBatchSize) {
                this.flush();
            } else if (!this.timeoutId) {
                this.timeoutId = setTimeout(() => this.flush(), this.delay);
            }
        });
    }

    protected async flush(): Promise<void> {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
        }

        if (this.items.length === 0) {
            return;
        }

        const items = this.items;
        const resolvers = this.resolvers;
        this.items = [];
        this.resolvers = [];

        try {
            const results = await this.processBatch(items);
            for (let i = 0; i < resolvers.length; i++) {
                resolvers[i](results[i]);
            }
        } catch (error) {
            // On error, reject all pending promises
            console.error('Batch processing error:', error);
        }
    }

    dispose(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
        }
        this.items = [];
        this.resolvers = [];
    }
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
    protected tokens: number;
    protected lastRefill: number;

    constructor(
        protected readonly maxTokens: number,
        protected readonly refillRate: number, // tokens per second
        protected readonly refillInterval = 1000
    ) {
        this.tokens = maxTokens;
        this.lastRefill = Date.now();
    }

    async acquire(tokens = 1): Promise<boolean> {
        this.refill();

        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }

        // Wait for tokens to be available
        const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
        await this.delay(waitTime);

        this.refill();
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }

        return false;
    }

    tryAcquire(tokens = 1): boolean {
        this.refill();

        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }

        return false;
    }

    protected refill(): void {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const tokensToAdd = (elapsed / this.refillInterval) * this.refillRate;

        this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }

    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Simple object pool for reusing objects
 */
export class ObjectPool<T> {
    protected pool: T[] = [];

    constructor(
        protected readonly factory: () => T,
        protected readonly reset: (obj: T) => void,
        protected readonly maxSize = 100
    ) {}

    acquire(): T {
        if (this.pool.length > 0) {
            return this.pool.pop()!;
        }
        return this.factory();
    }

    release(obj: T): void {
        if (this.pool.length < this.maxSize) {
            this.reset(obj);
            this.pool.push(obj);
        }
    }

    clear(): void {
        this.pool = [];
    }

    get size(): number {
        return this.pool.length;
    }
}

/**
 * Measure and log execution time
 */
export function measureTime<T>(
    name: string,
    fn: () => T,
    threshold = 100
): T {
    const start = performance.now();
    try {
        return fn();
    } finally {
        const duration = performance.now() - start;
        if (duration > threshold) {
            console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
        }
    }
}

/**
 * Measure and log async execution time
 */
export async function measureTimeAsync<T>(
    name: string,
    fn: () => Promise<T>,
    threshold = 100
): Promise<T> {
    const start = performance.now();
    try {
        return await fn();
    } finally {
        const duration = performance.now() - start;
        if (duration > threshold) {
            console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
        }
    }
}

/**
 * Create a memoized version of a function
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
    fn: T,
    keyFn: (...args: Parameters<T>) => string = (...args) => JSON.stringify(args),
    maxSize = 1000
): T {
    const cache = new Map<string, ReturnType<T>>();

    return ((...args: Parameters<T>): ReturnType<T> => {
        const key = keyFn(...args);

        if (cache.has(key)) {
            return cache.get(key)!;
        }

        const result = fn(...args) as ReturnType<T>;

        // Evict oldest if at capacity
        if (cache.size >= maxSize) {
            const firstKey = cache.keys().next().value;
            if (firstKey) {
                cache.delete(firstKey);
            }
        }

        cache.set(key, result);
        return result;
    }) as T;
}

/**
 * Run function in idle callback if available
 */
export function runWhenIdle(fn: () => void, timeout = 1000): void {
    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => fn(), { timeout });
    } else {
        setTimeout(fn, 0);
    }
}

/**
 * Chunk array for batch processing
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Process array items with concurrency limit
 */
export async function processWithConcurrency<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number
): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
        const promise = processor(item).then(result => {
            results.push(result);
        });

        executing.push(promise);

        if (executing.length >= concurrency) {
            await Promise.race(executing);
            // Remove completed promises
            for (let i = executing.length - 1; i >= 0; i--) {
                // Check if promise is settled by racing with resolved promise
                const settled = await Promise.race([
                    executing[i].then(() => true),
                    Promise.resolve(false)
                ]);
                if (settled) {
                    executing.splice(i, 1);
                }
            }
        }
    }

    await Promise.all(executing);
    return results;
}
