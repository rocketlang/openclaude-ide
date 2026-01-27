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
import { ILogger, Emitter, Event } from '@theia/core';
import * as crypto from 'crypto';

/**
 * Supported AI providers
 */
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'mistral' | 'local' | 'custom';

/**
 * Task types for task-based key selection
 */
export type TaskType = 'generic' | 'coder' | 'multilingual' | 'review' | 'test' | 'docs' | 'architect';

/**
 * Free tier configuration
 */
export interface FreeTierConfig {
    /** Whether free tier is enabled */
    enabled: boolean;
    /** Free tokens per month */
    freeTokensPerMonth: number;
    /** Free tokens used this month */
    freeTokensUsed: number;
    /** Month of the free tier (YYYY-MM format) */
    freeMonth: string;
    /** Models available in free tier */
    freeModels: string[];
    /** Task types allowed in free tier */
    freeTaskTypes: TaskType[];
}

/**
 * API Key configuration
 */
export interface APIKeyConfig {
    /** Unique key ID */
    id: string;
    /** User ID who owns this key */
    userId: string;
    /** Display name for the key */
    name: string;
    /** Provider (anthropic, openai, etc.) */
    provider: AIProvider;
    /** The actual API key (encrypted at rest) */
    encryptedKey: string;
    /** When the key was added */
    createdAt: number;
    /** Last time the key was used */
    lastUsedAt?: number;
    /** Whether the key is active */
    isActive: boolean;
    /** Usage quota (tokens per month, 0 = unlimited) */
    monthlyQuota: number;
    /** Tokens used this month */
    tokensUsedThisMonth: number;
    /** Month of the quota (YYYY-MM format) */
    quotaMonth: string;
    /** Priority (lower = higher priority for selection) */
    priority: number;
    /** Custom endpoint URL (for custom providers) */
    customEndpoint?: string;
    /** Models this key can access */
    allowedModels?: string[];
    /** Rate limit (requests per minute, 0 = unlimited) */
    rateLimit: number;
    /** Current requests this minute */
    requestsThisMinute: number;
    /** Minute timestamp for rate limiting */
    rateLimitMinute: number;
    /** Task types this key is optimized for */
    taskTypes: TaskType[];
    /** Best for multilingual tasks (for language-specific keys) */
    languages?: string[];
}

/**
 * User configuration
 */
export interface UserConfig {
    /** User ID */
    id: string;
    /** User display name */
    name: string;
    /** User email */
    email?: string;
    /** Default provider preference */
    defaultProvider?: AIProvider;
    /** Default model preference */
    defaultModel?: string;
    /** Whether user can add their own keys */
    canAddKeys: boolean;
    /** Maximum keys user can have */
    maxKeys: number;
    /** Total monthly quota across all keys */
    totalMonthlyQuota: number;
    /** Total tokens used this month */
    totalTokensUsedThisMonth: number;
    /** Whether user is admin */
    isAdmin: boolean;
    /** Created timestamp */
    createdAt: number;
    /** Free tier configuration */
    freeTier: FreeTierConfig;
}

/**
 * Key selection strategy
 */
export type KeySelectionStrategy =
    | 'priority'      // Use highest priority key
    | 'round-robin'   // Rotate through keys
    | 'least-used'    // Use key with lowest usage
    | 'random';       // Random selection

/**
 * Key usage event
 */
export interface KeyUsageEvent {
    keyId: string;
    userId: string;
    provider: AIProvider;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    timestamp: number;
    success: boolean;
    errorMessage?: string;
}

/**
 * Key validation result
 */
export interface KeyValidationResult {
    valid: boolean;
    provider: AIProvider;
    models?: string[];
    error?: string;
    quotaRemaining?: number;
}

export const AIProxyKeyManager = Symbol('AIProxyKeyManager');

/**
 * Service for managing user API keys for AI Proxy
 */
export interface AIProxyKeyManager {
    // User Management
    createUser(config: Omit<UserConfig, 'id' | 'createdAt' | 'totalTokensUsedThisMonth'>): UserConfig;
    getUser(userId: string): UserConfig | undefined;
    updateUser(userId: string, updates: Partial<UserConfig>): UserConfig | undefined;
    deleteUser(userId: string): boolean;
    listUsers(): UserConfig[];

    // Key Management
    addKey(userId: string, config: {
        name: string;
        provider: AIProvider;
        apiKey: string;
        priority?: number;
        monthlyQuota?: number;
        rateLimit?: number;
        customEndpoint?: string;
        allowedModels?: string[];
    }): APIKeyConfig;

    getKey(keyId: string): APIKeyConfig | undefined;
    getUserKeys(userId: string): APIKeyConfig[];
    updateKey(keyId: string, updates: Partial<Omit<APIKeyConfig, 'id' | 'userId' | 'encryptedKey'>>): APIKeyConfig | undefined;
    deleteKey(keyId: string): boolean;
    activateKey(keyId: string): boolean;
    deactivateKey(keyId: string): boolean;

    // Key Selection
    selectKey(userId: string, options?: {
        provider?: AIProvider;
        model?: string;
        strategy?: KeySelectionStrategy;
        taskType?: TaskType;
        language?: string;
    }): APIKeyConfig | undefined;

    /**
     * Select key specifically for a task type (free tier first)
     */
    selectKeyForTask(userId: string, taskType: TaskType, options?: {
        provider?: AIProvider;
        model?: string;
        language?: string;
    }): { key: APIKeyConfig | undefined; usingFreeTier: boolean };

    /**
     * Check if user can use free tier for a request
     */
    checkFreeTier(userId: string, taskType: TaskType, estimatedTokens: number): {
        allowed: boolean;
        remaining: number;
        reason?: string;
    };

    /**
     * Record free tier usage
     */
    recordFreeTierUsage(userId: string, tokens: number): void;

    /**
     * Get free tier status for a user
     */
    getFreeTierStatus(userId: string): FreeTierConfig | undefined;

    // Key Decryption (for actual use)
    decryptKey(keyId: string): string | undefined;

    // Key Validation
    validateKey(keyId: string): Promise<KeyValidationResult>;

    // Usage Tracking
    recordUsage(event: Omit<KeyUsageEvent, 'timestamp'>): void;
    getKeyUsage(keyId: string, days?: number): KeyUsageEvent[];
    getUserUsage(userId: string, days?: number): KeyUsageEvent[];

    // Quota Management
    checkQuota(keyId: string): { allowed: boolean; remaining: number; resetAt: number };
    checkUserQuota(userId: string): { allowed: boolean; remaining: number; resetAt: number };
    resetMonthlyQuotas(): void;

    // Rate Limiting
    checkRateLimit(keyId: string): { allowed: boolean; retryAfter?: number };

    // Events
    onKeyUsage: Event<KeyUsageEvent>;
    onQuotaExceeded: Event<{ keyId: string; userId: string }>;
    onRateLimitHit: Event<{ keyId: string; userId: string }>;

    // Import/Export
    exportUserKeys(userId: string): string;
    importUserKeys(userId: string, data: string): number;
}

@injectable()
export class AIProxyKeyManagerImpl implements AIProxyKeyManager {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected users: Map<string, UserConfig> = new Map();
    protected keys: Map<string, APIKeyConfig> = new Map();
    protected usageHistory: KeyUsageEvent[] = [];
    protected roundRobinIndex: Map<string, number> = new Map();

    // Encryption key (in production, this should come from secure storage)
    protected encryptionKey: Buffer = crypto.scryptSync(
        process.env.AI_KEY_ENCRYPTION_SECRET || 'default-swarm-key-secret',
        'salt',
        32
    );

    protected readonly onKeyUsageEmitter = new Emitter<KeyUsageEvent>();
    readonly onKeyUsage = this.onKeyUsageEmitter.event;

    protected readonly onQuotaExceededEmitter = new Emitter<{ keyId: string; userId: string }>();
    readonly onQuotaExceeded = this.onQuotaExceededEmitter.event;

    protected readonly onRateLimitHitEmitter = new Emitter<{ keyId: string; userId: string }>();
    readonly onRateLimitHit = this.onRateLimitHitEmitter.event;

    // ============== User Management ==============

    createUser(config: Omit<UserConfig, 'id' | 'createdAt' | 'totalTokensUsedThisMonth'>): UserConfig {
        const currentMonth = this.getCurrentMonth();
        const defaultFreeTier: FreeTierConfig = {
            enabled: true,
            freeTokensPerMonth: 100000, // 100K free tokens per month
            freeTokensUsed: 0,
            freeMonth: currentMonth,
            freeModels: ['claude-3-haiku-20240307', 'gpt-4o-mini', 'llama3.1-8b'],
            freeTaskTypes: ['generic', 'docs', 'review'] // Basic tasks free
        };

        const user: UserConfig = {
            ...config,
            id: `user-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
            createdAt: Date.now(),
            totalTokensUsedThisMonth: 0,
            freeTier: config.freeTier || defaultFreeTier
        };

        this.users.set(user.id, user);
        this.logger.info(`Created user: ${user.id} (${user.name}) with free tier: ${user.freeTier.enabled}`);
        return user;
    }

    getUser(userId: string): UserConfig | undefined {
        return this.users.get(userId);
    }

    updateUser(userId: string, updates: Partial<UserConfig>): UserConfig | undefined {
        const user = this.users.get(userId);
        if (!user) return undefined;

        const updated = { ...user, ...updates, id: user.id }; // Prevent ID change
        this.users.set(userId, updated);
        return updated;
    }

    deleteUser(userId: string): boolean {
        // Also delete all user's keys
        const userKeys = this.getUserKeys(userId);
        userKeys.forEach(key => this.keys.delete(key.id));

        return this.users.delete(userId);
    }

    listUsers(): UserConfig[] {
        return Array.from(this.users.values());
    }

    // ============== Key Management ==============

    addKey(userId: string, config: {
        name: string;
        provider: AIProvider;
        apiKey: string;
        priority?: number;
        monthlyQuota?: number;
        rateLimit?: number;
        customEndpoint?: string;
        allowedModels?: string[];
        taskTypes?: TaskType[];
        languages?: string[];
    }): APIKeyConfig {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error(`User not found: ${userId}`);
        }

        // Check max keys limit
        const userKeys = this.getUserKeys(userId);
        if (userKeys.length >= user.maxKeys) {
            throw new Error(`User has reached maximum keys limit (${user.maxKeys})`);
        }

        // Encrypt the API key
        const encryptedKey = this.encryptApiKey(config.apiKey);

        const currentMonth = this.getCurrentMonth();
        const keyConfig: APIKeyConfig = {
            id: `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
            userId,
            name: config.name,
            provider: config.provider,
            encryptedKey,
            createdAt: Date.now(),
            isActive: true,
            monthlyQuota: config.monthlyQuota || 0,
            tokensUsedThisMonth: 0,
            quotaMonth: currentMonth,
            priority: config.priority || 100,
            customEndpoint: config.customEndpoint,
            allowedModels: config.allowedModels,
            rateLimit: config.rateLimit || 0,
            requestsThisMinute: 0,
            rateLimitMinute: 0,
            taskTypes: config.taskTypes || ['generic'], // Default to generic
            languages: config.languages
        };

        this.keys.set(keyConfig.id, keyConfig);
        this.logger.info(`Added API key: ${keyConfig.id} for user ${userId} (${config.provider}, tasks: ${keyConfig.taskTypes.join(',')})`);
        return keyConfig;
    }

    getKey(keyId: string): APIKeyConfig | undefined {
        return this.keys.get(keyId);
    }

    getUserKeys(userId: string): APIKeyConfig[] {
        return Array.from(this.keys.values())
            .filter(k => k.userId === userId)
            .sort((a, b) => a.priority - b.priority);
    }

    updateKey(keyId: string, updates: Partial<Omit<APIKeyConfig, 'id' | 'userId' | 'encryptedKey'>>): APIKeyConfig | undefined {
        const key = this.keys.get(keyId);
        if (!key) return undefined;

        const updated = { ...key, ...updates };
        this.keys.set(keyId, updated);
        return updated;
    }

    deleteKey(keyId: string): boolean {
        return this.keys.delete(keyId);
    }

    activateKey(keyId: string): boolean {
        const key = this.keys.get(keyId);
        if (!key) return false;

        key.isActive = true;
        this.keys.set(keyId, key);
        return true;
    }

    deactivateKey(keyId: string): boolean {
        const key = this.keys.get(keyId);
        if (!key) return false;

        key.isActive = false;
        this.keys.set(keyId, key);
        return true;
    }

    // ============== Key Selection ==============

    selectKey(userId: string, options?: {
        provider?: AIProvider;
        model?: string;
        strategy?: KeySelectionStrategy;
        taskType?: TaskType;
        language?: string;
    }): APIKeyConfig | undefined {
        let keys = this.getUserKeys(userId).filter(k => k.isActive);

        // Filter by provider if specified
        if (options?.provider) {
            keys = keys.filter(k => k.provider === options.provider);
        }

        // Filter by model if specified
        if (options?.model) {
            keys = keys.filter(k =>
                !k.allowedModels || k.allowedModels.length === 0 || k.allowedModels.includes(options.model!)
            );
        }

        // Filter by task type if specified - prefer keys optimized for the task
        if (options?.taskType) {
            const taskSpecificKeys = keys.filter(k => k.taskTypes.includes(options.taskType!));
            if (taskSpecificKeys.length > 0) {
                keys = taskSpecificKeys;
            }
            // If no task-specific keys, fall back to generic keys
            else {
                keys = keys.filter(k => k.taskTypes.includes('generic'));
            }
        }

        // Filter by language if specified (for multilingual tasks)
        if (options?.language) {
            const langSpecificKeys = keys.filter(k =>
                k.languages && k.languages.includes(options.language!)
            );
            if (langSpecificKeys.length > 0) {
                keys = langSpecificKeys;
            }
        }

        // Filter by quota availability
        keys = keys.filter(k => {
            const quota = this.checkQuota(k.id);
            return quota.allowed;
        });

        // Filter by rate limit
        keys = keys.filter(k => {
            const rateLimit = this.checkRateLimit(k.id);
            return rateLimit.allowed;
        });

        if (keys.length === 0) {
            return undefined;
        }

        const strategy = options?.strategy || 'priority';

        switch (strategy) {
            case 'priority':
                return keys[0]; // Already sorted by priority

            case 'round-robin': {
                const index = this.roundRobinIndex.get(userId) || 0;
                const key = keys[index % keys.length];
                this.roundRobinIndex.set(userId, index + 1);
                return key;
            }

            case 'least-used':
                return keys.sort((a, b) => a.tokensUsedThisMonth - b.tokensUsedThisMonth)[0];

            case 'random':
                return keys[Math.floor(Math.random() * keys.length)];

            default:
                return keys[0];
        }
    }

    // ============== Free Tier & Task-Based Selection ==============

    selectKeyForTask(userId: string, taskType: TaskType, options?: {
        provider?: AIProvider;
        model?: string;
        language?: string;
    }): { key: APIKeyConfig | undefined; usingFreeTier: boolean } {
        const user = this.users.get(userId);
        if (!user) {
            return { key: undefined, usingFreeTier: false };
        }

        // Check free tier FIRST
        const freeTierCheck = this.checkFreeTier(userId, taskType, 0);
        if (freeTierCheck.allowed) {
            this.logger.debug(`User ${userId} using free tier for ${taskType}`);
            // Return a "virtual" free tier key indicator - actual key selection happens via pool
            return { key: undefined, usingFreeTier: true };
        }

        // Free tier exhausted or not allowed for this task, use personal keys
        const key = this.selectKey(userId, {
            provider: options?.provider,
            model: options?.model,
            taskType,
            language: options?.language,
            strategy: 'priority'
        });

        return { key, usingFreeTier: false };
    }

    checkFreeTier(userId: string, taskType: TaskType, estimatedTokens: number): {
        allowed: boolean;
        remaining: number;
        reason?: string;
    } {
        const user = this.users.get(userId);
        if (!user) {
            return { allowed: false, remaining: 0, reason: 'User not found' };
        }

        const freeTier = user.freeTier;

        // Check if free tier is enabled
        if (!freeTier.enabled) {
            return { allowed: false, remaining: 0, reason: 'Free tier not enabled' };
        }

        // Check if month changed - reset if so
        const currentMonth = this.getCurrentMonth();
        if (freeTier.freeMonth !== currentMonth) {
            freeTier.freeTokensUsed = 0;
            freeTier.freeMonth = currentMonth;
            this.users.set(userId, user);
        }

        // Check if task type is allowed in free tier
        if (!freeTier.freeTaskTypes.includes(taskType)) {
            return {
                allowed: false,
                remaining: freeTier.freeTokensPerMonth - freeTier.freeTokensUsed,
                reason: `Task type '${taskType}' not available in free tier. Free tasks: ${freeTier.freeTaskTypes.join(', ')}`
            };
        }

        // Check if tokens remaining
        const remaining = freeTier.freeTokensPerMonth - freeTier.freeTokensUsed;
        if (remaining <= 0) {
            return {
                allowed: false,
                remaining: 0,
                reason: 'Free tier tokens exhausted for this month'
            };
        }

        // Check if estimated tokens would exceed
        if (estimatedTokens > remaining) {
            return {
                allowed: false,
                remaining,
                reason: `Estimated tokens (${estimatedTokens}) exceed remaining free tokens (${remaining})`
            };
        }

        return { allowed: true, remaining };
    }

    recordFreeTierUsage(userId: string, tokens: number): void {
        const user = this.users.get(userId);
        if (!user) {
            this.logger.warn(`Cannot record free tier usage: user ${userId} not found`);
            return;
        }

        const currentMonth = this.getCurrentMonth();
        if (user.freeTier.freeMonth !== currentMonth) {
            user.freeTier.freeTokensUsed = 0;
            user.freeTier.freeMonth = currentMonth;
        }

        user.freeTier.freeTokensUsed += tokens;
        this.users.set(userId, user);

        this.logger.debug(`Recorded ${tokens} free tier tokens for user ${userId}. Used: ${user.freeTier.freeTokensUsed}/${user.freeTier.freeTokensPerMonth}`);
    }

    getFreeTierStatus(userId: string): FreeTierConfig | undefined {
        const user = this.users.get(userId);
        if (!user) return undefined;

        // Reset if month changed
        const currentMonth = this.getCurrentMonth();
        if (user.freeTier.freeMonth !== currentMonth) {
            user.freeTier.freeTokensUsed = 0;
            user.freeTier.freeMonth = currentMonth;
            this.users.set(userId, user);
        }

        return { ...user.freeTier };
    }

    // ============== Key Decryption ==============

    decryptKey(keyId: string): string | undefined {
        const key = this.keys.get(keyId);
        if (!key) return undefined;

        try {
            return this.decryptApiKey(key.encryptedKey);
        } catch (error) {
            this.logger.error(`Failed to decrypt key ${keyId}: ${error}`);
            return undefined;
        }
    }

    // ============== Key Validation ==============

    async validateKey(keyId: string): Promise<KeyValidationResult> {
        const key = this.keys.get(keyId);
        if (!key) {
            return { valid: false, provider: 'custom', error: 'Key not found' };
        }

        const apiKey = this.decryptKey(keyId);
        if (!apiKey) {
            return { valid: false, provider: key.provider, error: 'Failed to decrypt key' };
        }

        try {
            // Validate based on provider
            switch (key.provider) {
                case 'anthropic':
                    return await this.validateAnthropicKey(apiKey);
                case 'openai':
                    return await this.validateOpenAIKey(apiKey);
                default:
                    // For other providers, just check if the key looks valid
                    return {
                        valid: apiKey.length > 10,
                        provider: key.provider,
                        error: apiKey.length <= 10 ? 'Key too short' : undefined
                    };
            }
        } catch (error) {
            return {
                valid: false,
                provider: key.provider,
                error: error instanceof Error ? error.message : 'Validation failed'
            };
        }
    }

    protected async validateAnthropicKey(apiKey: string): Promise<KeyValidationResult> {
        // Simple validation - check if it starts with expected prefix
        if (!apiKey.startsWith('sk-ant-')) {
            return { valid: false, provider: 'anthropic', error: 'Invalid Anthropic key format' };
        }
        return {
            valid: true,
            provider: 'anthropic',
            models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-sonnet-4', 'claude-opus-4']
        };
    }

    protected async validateOpenAIKey(apiKey: string): Promise<KeyValidationResult> {
        if (!apiKey.startsWith('sk-')) {
            return { valid: false, provider: 'openai', error: 'Invalid OpenAI key format' };
        }
        return {
            valid: true,
            provider: 'openai',
            models: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']
        };
    }

    // ============== Usage Tracking ==============

    recordUsage(event: Omit<KeyUsageEvent, 'timestamp'>): void {
        const fullEvent: KeyUsageEvent = {
            ...event,
            timestamp: Date.now()
        };

        this.usageHistory.push(fullEvent);

        // Update key usage
        const key = this.keys.get(event.keyId);
        if (key) {
            const currentMonth = this.getCurrentMonth();
            if (key.quotaMonth !== currentMonth) {
                key.tokensUsedThisMonth = 0;
                key.quotaMonth = currentMonth;
            }
            key.tokensUsedThisMonth += event.inputTokens + event.outputTokens;
            key.lastUsedAt = Date.now();
            this.keys.set(event.keyId, key);
        }

        // Update user usage
        const user = this.users.get(event.userId);
        if (user) {
            user.totalTokensUsedThisMonth += event.inputTokens + event.outputTokens;
            this.users.set(event.userId, user);
        }

        // Emit event
        this.onKeyUsageEmitter.fire(fullEvent);

        // Check quotas
        if (key && key.monthlyQuota > 0 && key.tokensUsedThisMonth >= key.monthlyQuota) {
            this.onQuotaExceededEmitter.fire({ keyId: event.keyId, userId: event.userId });
        }

        // Trim old history (keep last 30 days)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        this.usageHistory = this.usageHistory.filter(e => e.timestamp > thirtyDaysAgo);
    }

    getKeyUsage(keyId: string, days: number = 30): KeyUsageEvent[] {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return this.usageHistory.filter(e => e.keyId === keyId && e.timestamp > cutoff);
    }

    getUserUsage(userId: string, days: number = 30): KeyUsageEvent[] {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return this.usageHistory.filter(e => e.userId === userId && e.timestamp > cutoff);
    }

    // ============== Quota Management ==============

    checkQuota(keyId: string): { allowed: boolean; remaining: number; resetAt: number } {
        const key = this.keys.get(keyId);
        if (!key) {
            return { allowed: false, remaining: 0, resetAt: 0 };
        }

        // No quota = unlimited
        if (key.monthlyQuota === 0) {
            return { allowed: true, remaining: Infinity, resetAt: this.getNextMonthStart() };
        }

        // Check if we need to reset
        const currentMonth = this.getCurrentMonth();
        if (key.quotaMonth !== currentMonth) {
            key.tokensUsedThisMonth = 0;
            key.quotaMonth = currentMonth;
            this.keys.set(keyId, key);
        }

        const remaining = key.monthlyQuota - key.tokensUsedThisMonth;
        return {
            allowed: remaining > 0,
            remaining: Math.max(0, remaining),
            resetAt: this.getNextMonthStart()
        };
    }

    checkUserQuota(userId: string): { allowed: boolean; remaining: number; resetAt: number } {
        const user = this.users.get(userId);
        if (!user) {
            return { allowed: false, remaining: 0, resetAt: 0 };
        }

        // No quota = unlimited
        if (user.totalMonthlyQuota === 0) {
            return { allowed: true, remaining: Infinity, resetAt: this.getNextMonthStart() };
        }

        const remaining = user.totalMonthlyQuota - user.totalTokensUsedThisMonth;
        return {
            allowed: remaining > 0,
            remaining: Math.max(0, remaining),
            resetAt: this.getNextMonthStart()
        };
    }

    resetMonthlyQuotas(): void {
        const currentMonth = this.getCurrentMonth();

        for (const [keyId, key] of this.keys) {
            if (key.quotaMonth !== currentMonth) {
                key.tokensUsedThisMonth = 0;
                key.quotaMonth = currentMonth;
                this.keys.set(keyId, key);
            }
        }

        for (const [userId, user] of this.users) {
            user.totalTokensUsedThisMonth = 0;
            this.users.set(userId, user);
        }

        this.logger.info(`Reset monthly quotas for ${currentMonth}`);
    }

    // ============== Rate Limiting ==============

    checkRateLimit(keyId: string): { allowed: boolean; retryAfter?: number } {
        const key = this.keys.get(keyId);
        if (!key) {
            return { allowed: false };
        }

        // No rate limit = unlimited
        if (key.rateLimit === 0) {
            return { allowed: true };
        }

        const currentMinute = Math.floor(Date.now() / 60000);

        // Reset if new minute
        if (key.rateLimitMinute !== currentMinute) {
            key.requestsThisMinute = 0;
            key.rateLimitMinute = currentMinute;
            this.keys.set(keyId, key);
        }

        if (key.requestsThisMinute >= key.rateLimit) {
            const retryAfter = 60 - (Date.now() % 60000) / 1000;
            this.onRateLimitHitEmitter.fire({ keyId, userId: key.userId });
            return { allowed: false, retryAfter };
        }

        // Increment counter
        key.requestsThisMinute++;
        this.keys.set(keyId, key);

        return { allowed: true };
    }

    // ============== Import/Export ==============

    exportUserKeys(userId: string): string {
        const keys = this.getUserKeys(userId).map(key => ({
            name: key.name,
            provider: key.provider,
            priority: key.priority,
            monthlyQuota: key.monthlyQuota,
            rateLimit: key.rateLimit,
            customEndpoint: key.customEndpoint,
            allowedModels: key.allowedModels,
            // Note: We don't export the actual API key for security
            hasKey: true
        }));

        return JSON.stringify({ userId, keys, exportedAt: new Date().toISOString() }, null, 2);
    }

    importUserKeys(userId: string, data: string): number {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error(`User not found: ${userId}`);
        }

        try {
            const parsed = JSON.parse(data);
            let imported = 0;

            // Note: This only imports key configurations, not actual keys
            // User would need to re-add the actual API keys
            for (const keyConfig of parsed.keys || []) {
                this.logger.info(`Key config imported for ${keyConfig.name} - user needs to add actual API key`);
                imported++;
            }

            return imported;
        } catch (error) {
            throw new Error(`Failed to parse import data: ${error}`);
        }
    }

    // ============== Helper Methods ==============

    protected encryptApiKey(apiKey: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        let encrypted = cipher.update(apiKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    protected decryptApiKey(encryptedKey: string): string {
        const [ivHex, encrypted] = encryptedKey.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    protected getCurrentMonth(): string {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    protected getNextMonthStart(): number {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    }
}
