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

/**
 * Model pricing information (per 1M tokens)
 */
export interface ModelPricing {
    /** Model identifier */
    modelId: string;
    /** Cost per 1M input tokens in USD */
    inputCostPer1M: number;
    /** Cost per 1M output tokens in USD */
    outputCostPer1M: number;
    /** Display name */
    displayName: string;
}

/**
 * Token usage for a single request
 */
export interface TokenUsage {
    /** Number of input tokens */
    inputTokens: number;
    /** Number of output tokens */
    outputTokens: number;
    /** Total tokens */
    totalTokens: number;
    /** Model used */
    modelId: string;
    /** Timestamp */
    timestamp: number;
}

/**
 * Usage record for tracking
 */
export interface UsageRecord {
    /** Unique ID */
    id: string;
    /** Session ID */
    sessionId: string;
    /** Agent ID (optional - for lead agent this is undefined) */
    agentId?: string;
    /** Agent role */
    role?: string;
    /** Task ID being worked on */
    taskId?: string;
    /** Token usage */
    usage: TokenUsage;
    /** Calculated cost in USD */
    cost: number;
    /** Request type (e.g., 'task_decomposition', 'code_generation', 'review') */
    requestType: string;
}

/**
 * Aggregated cost summary
 */
export interface CostSummary {
    /** Total cost in USD */
    totalCost: number;
    /** Total input tokens */
    totalInputTokens: number;
    /** Total output tokens */
    totalOutputTokens: number;
    /** Total tokens */
    totalTokens: number;
    /** Number of requests */
    requestCount: number;
    /** Cost breakdown by model */
    byModel: Record<string, {
        cost: number;
        inputTokens: number;
        outputTokens: number;
        requests: number;
    }>;
    /** Cost breakdown by agent */
    byAgent: Record<string, {
        agentId: string;
        role: string;
        cost: number;
        inputTokens: number;
        outputTokens: number;
        requests: number;
    }>;
    /** Cost breakdown by request type */
    byRequestType: Record<string, {
        cost: number;
        inputTokens: number;
        outputTokens: number;
        requests: number;
    }>;
}

/**
 * Event emitted when cost changes
 */
export interface CostUpdateEvent {
    sessionId: string;
    record: UsageRecord;
    summary: CostSummary;
}

/**
 * Default model pricing (as of Jan 2025)
 */
const DEFAULT_MODEL_PRICING: ModelPricing[] = [
    {
        modelId: 'claude-sonnet-4-20250514',
        displayName: 'Claude 4 Sonnet',
        inputCostPer1M: 3.00,
        outputCostPer1M: 15.00
    },
    {
        modelId: 'claude-opus-4-20250514',
        displayName: 'Claude 4 Opus',
        inputCostPer1M: 15.00,
        outputCostPer1M: 75.00
    },
    {
        modelId: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        inputCostPer1M: 3.00,
        outputCostPer1M: 15.00
    },
    {
        modelId: 'claude-3-haiku-20240307',
        displayName: 'Claude 3 Haiku',
        inputCostPer1M: 0.25,
        outputCostPer1M: 1.25
    },
    {
        modelId: 'gpt-4-turbo',
        displayName: 'GPT-4 Turbo',
        inputCostPer1M: 10.00,
        outputCostPer1M: 30.00
    },
    {
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
        inputCostPer1M: 2.50,
        outputCostPer1M: 10.00
    },
    {
        modelId: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.60
    }
];

export const CostTrackingService = Symbol('CostTrackingService');

/**
 * Service for tracking token usage and costs across swarm sessions
 */
export interface CostTrackingService {
    /**
     * Record token usage for a request
     */
    recordUsage(
        sessionId: string,
        usage: TokenUsage,
        requestType: string,
        agentId?: string,
        role?: string,
        taskId?: string
    ): UsageRecord;

    /**
     * Get cost summary for a session
     */
    getSessionSummary(sessionId: string): CostSummary;

    /**
     * Get all usage records for a session
     */
    getSessionRecords(sessionId: string): UsageRecord[];

    /**
     * Get usage records for a specific agent
     */
    getAgentRecords(sessionId: string, agentId: string): UsageRecord[];

    /**
     * Get usage records for a specific task
     */
    getTaskRecords(sessionId: string, taskId: string): UsageRecord[];

    /**
     * Calculate cost for given token usage
     */
    calculateCost(usage: TokenUsage): number;

    /**
     * Get model pricing
     */
    getModelPricing(modelId: string): ModelPricing | undefined;

    /**
     * Set custom model pricing
     */
    setModelPricing(pricing: ModelPricing): void;

    /**
     * Clear all records for a session
     */
    clearSession(sessionId: string): void;

    /**
     * Event emitted when cost is updated
     */
    onCostUpdate: Event<CostUpdateEvent>;

    /**
     * Get estimated cost for a number of tokens
     */
    estimateCost(modelId: string, inputTokens: number, outputTokens: number): number;

    /**
     * Format cost as currency string
     */
    formatCost(cost: number): string;

    /**
     * Format token count
     */
    formatTokens(tokens: number): string;

    /**
     * Export session data as JSON
     */
    exportSession(sessionId: string): string;
}

@injectable()
export class CostTrackingServiceImpl implements CostTrackingService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected modelPricing: Map<string, ModelPricing> = new Map();
    protected sessionRecords: Map<string, UsageRecord[]> = new Map();
    protected sessionSummaries: Map<string, CostSummary> = new Map();

    protected readonly onCostUpdateEmitter = new Emitter<CostUpdateEvent>();
    readonly onCostUpdate = this.onCostUpdateEmitter.event;

    constructor() {
        // Initialize default pricing
        DEFAULT_MODEL_PRICING.forEach(pricing => {
            this.modelPricing.set(pricing.modelId, pricing);
        });
    }

    recordUsage(
        sessionId: string,
        usage: TokenUsage,
        requestType: string,
        agentId?: string,
        role?: string,
        taskId?: string
    ): UsageRecord {
        const cost = this.calculateCost(usage);

        const record: UsageRecord = {
            id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            sessionId,
            agentId,
            role,
            taskId,
            usage,
            cost,
            requestType
        };

        // Store record
        const records = this.sessionRecords.get(sessionId) || [];
        records.push(record);
        this.sessionRecords.set(sessionId, records);

        // Update summary
        const summary = this.updateSummary(sessionId, record);

        // Emit event
        this.onCostUpdateEmitter.fire({
            sessionId,
            record,
            summary
        });

        this.logger.debug(`Cost recorded: $${cost.toFixed(6)} for ${requestType} (${usage.totalTokens} tokens)`);

        return record;
    }

    protected updateSummary(sessionId: string, record: UsageRecord): CostSummary {
        let summary = this.sessionSummaries.get(sessionId);

        if (!summary) {
            summary = {
                totalCost: 0,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalTokens: 0,
                requestCount: 0,
                byModel: {},
                byAgent: {},
                byRequestType: {}
            };
        }

        // Update totals
        summary.totalCost += record.cost;
        summary.totalInputTokens += record.usage.inputTokens;
        summary.totalOutputTokens += record.usage.outputTokens;
        summary.totalTokens += record.usage.totalTokens;
        summary.requestCount++;

        // Update by model
        const modelId = record.usage.modelId;
        if (!summary.byModel[modelId]) {
            summary.byModel[modelId] = {
                cost: 0,
                inputTokens: 0,
                outputTokens: 0,
                requests: 0
            };
        }
        summary.byModel[modelId].cost += record.cost;
        summary.byModel[modelId].inputTokens += record.usage.inputTokens;
        summary.byModel[modelId].outputTokens += record.usage.outputTokens;
        summary.byModel[modelId].requests++;

        // Update by agent
        if (record.agentId) {
            if (!summary.byAgent[record.agentId]) {
                summary.byAgent[record.agentId] = {
                    agentId: record.agentId,
                    role: record.role || 'unknown',
                    cost: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    requests: 0
                };
            }
            summary.byAgent[record.agentId].cost += record.cost;
            summary.byAgent[record.agentId].inputTokens += record.usage.inputTokens;
            summary.byAgent[record.agentId].outputTokens += record.usage.outputTokens;
            summary.byAgent[record.agentId].requests++;
        }

        // Update by request type
        const reqType = record.requestType;
        if (!summary.byRequestType[reqType]) {
            summary.byRequestType[reqType] = {
                cost: 0,
                inputTokens: 0,
                outputTokens: 0,
                requests: 0
            };
        }
        summary.byRequestType[reqType].cost += record.cost;
        summary.byRequestType[reqType].inputTokens += record.usage.inputTokens;
        summary.byRequestType[reqType].outputTokens += record.usage.outputTokens;
        summary.byRequestType[reqType].requests++;

        this.sessionSummaries.set(sessionId, summary);
        return summary;
    }

    getSessionSummary(sessionId: string): CostSummary {
        return this.sessionSummaries.get(sessionId) || {
            totalCost: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            requestCount: 0,
            byModel: {},
            byAgent: {},
            byRequestType: {}
        };
    }

    getSessionRecords(sessionId: string): UsageRecord[] {
        return this.sessionRecords.get(sessionId) || [];
    }

    getAgentRecords(sessionId: string, agentId: string): UsageRecord[] {
        const records = this.sessionRecords.get(sessionId) || [];
        return records.filter(r => r.agentId === agentId);
    }

    getTaskRecords(sessionId: string, taskId: string): UsageRecord[] {
        const records = this.sessionRecords.get(sessionId) || [];
        return records.filter(r => r.taskId === taskId);
    }

    calculateCost(usage: TokenUsage): number {
        const pricing = this.modelPricing.get(usage.modelId);

        if (!pricing) {
            // Use default Sonnet pricing if model not found
            this.logger.warn(`Unknown model ${usage.modelId}, using default pricing`);
            const inputCost = (usage.inputTokens / 1000000) * 3.00;
            const outputCost = (usage.outputTokens / 1000000) * 15.00;
            return inputCost + outputCost;
        }

        const inputCost = (usage.inputTokens / 1000000) * pricing.inputCostPer1M;
        const outputCost = (usage.outputTokens / 1000000) * pricing.outputCostPer1M;

        return inputCost + outputCost;
    }

    getModelPricing(modelId: string): ModelPricing | undefined {
        return this.modelPricing.get(modelId);
    }

    setModelPricing(pricing: ModelPricing): void {
        this.modelPricing.set(pricing.modelId, pricing);
        this.logger.info(`Updated pricing for ${pricing.modelId}`);
    }

    clearSession(sessionId: string): void {
        this.sessionRecords.delete(sessionId);
        this.sessionSummaries.delete(sessionId);
        this.logger.info(`Cleared cost tracking for session ${sessionId}`);
    }

    estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
        const pricing = this.modelPricing.get(modelId);

        if (!pricing) {
            // Use default Sonnet pricing
            const inputCost = (inputTokens / 1000000) * 3.00;
            const outputCost = (outputTokens / 1000000) * 15.00;
            return inputCost + outputCost;
        }

        const inputCost = (inputTokens / 1000000) * pricing.inputCostPer1M;
        const outputCost = (outputTokens / 1000000) * pricing.outputCostPer1M;

        return inputCost + outputCost;
    }

    formatCost(cost: number): string {
        if (cost < 0.01) {
            return `$${cost.toFixed(6)}`;
        }
        if (cost < 1) {
            return `$${cost.toFixed(4)}`;
        }
        return `$${cost.toFixed(2)}`;
    }

    formatTokens(tokens: number): string {
        if (tokens < 1000) {
            return tokens.toString();
        }
        if (tokens < 1000000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        }
        return `${(tokens / 1000000).toFixed(2)}M`;
    }

    exportSession(sessionId: string): string {
        const records = this.getSessionRecords(sessionId);
        const summary = this.getSessionSummary(sessionId);

        return JSON.stringify({
            sessionId,
            exportedAt: new Date().toISOString(),
            summary,
            records
        }, null, 2);
    }
}
