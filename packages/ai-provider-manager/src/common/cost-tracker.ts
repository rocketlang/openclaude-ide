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

import { Disposable, Emitter, Event } from '@theia/core';
import { TaskType } from './provider-types';

export const CostTracker = Symbol('CostTracker');

/**
 * Time period for usage reports
 */
export enum UsagePeriod {
    TODAY = 'today',
    THIS_WEEK = 'this_week',
    THIS_MONTH = 'this_month',
    LAST_30_DAYS = 'last_30_days',
    ALL_TIME = 'all_time',
    CUSTOM = 'custom'
}

/**
 * Token usage breakdown
 */
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    requestCount: number;
}

/**
 * A tracked API request
 */
export interface TrackedRequest {
    /** Unique request ID */
    id: string;
    /** Provider ID */
    providerId: string;
    /** Model ID */
    modelId: string;
    /** Input tokens used */
    inputTokens: number;
    /** Output tokens used */
    outputTokens: number;
    /** Cost in USD */
    cost: number;
    /** Request timestamp */
    timestamp: Date;
    /** Task type */
    taskType: TaskType;
    /** Duration in milliseconds */
    durationMs?: number;
    /** Whether the request was successful */
    success: boolean;
    /** Session ID for grouping */
    sessionId?: string;
}

/**
 * Usage report for a given period
 */
export interface UsageReport {
    /** Total cost in USD */
    totalCost: number;
    /** Total tokens used */
    totalTokens: number;
    /** Total input tokens */
    totalInputTokens: number;
    /** Total output tokens */
    totalOutputTokens: number;
    /** Total number of requests */
    totalRequests: number;
    /** Success rate (0-1) */
    successRate: number;
    /** Average request duration in ms */
    averageDurationMs: number;
    /** Token usage breakdown by model */
    tokensByModel: Record<string, TokenUsage>;
    /** Token usage breakdown by provider */
    tokensByProvider: Record<string, TokenUsage>;
    /** Cost breakdown by task type */
    costByTask: Record<TaskType, number>;
    /** Requests breakdown by task type */
    requestsByTask: Record<TaskType, number>;
    /** Daily breakdown for charts */
    dailyBreakdown: Array<{
        date: string;
        cost: number;
        tokens: number;
        requests: number;
    }>;
    /** Report period */
    period: UsagePeriod;
    /** Period start date */
    periodStart: Date;
    /** Period end date */
    periodEnd: Date;
}

/**
 * Budget configuration
 */
export interface Budget {
    /** Daily spending limit in USD */
    dailyLimit?: number;
    /** Weekly spending limit in USD */
    weeklyLimit?: number;
    /** Monthly spending limit in USD */
    monthlyLimit?: number;
    /** Warning threshold (0-1, e.g., 0.8 for 80%) */
    warningThreshold: number;
    /** Whether to block requests when budget exceeded */
    hardLimit: boolean;
}

/**
 * Budget warning event
 */
export interface BudgetWarning {
    /** Type of limit being approached/exceeded */
    limitType: 'daily' | 'weekly' | 'monthly';
    /** Current usage in USD */
    currentUsage: number;
    /** Limit in USD */
    limit: number;
    /** Usage percentage (0-1) */
    percentage: number;
    /** Whether limit is exceeded */
    exceeded: boolean;
}

/**
 * Export format options
 */
export enum ExportFormat {
    CSV = 'csv',
    JSON = 'json'
}

/**
 * Service for tracking API usage costs
 */
export interface CostTracker extends Disposable {
    /**
     * Track a new API request
     */
    trackRequest(request: Omit<TrackedRequest, 'id'>): Promise<TrackedRequest>;

    /**
     * Get usage report for a period
     */
    getUsage(period: UsagePeriod, customStart?: Date, customEnd?: Date): Promise<UsageReport>;

    /**
     * Get all tracked requests for a period
     */
    getRequests(period: UsagePeriod, customStart?: Date, customEnd?: Date): Promise<TrackedRequest[]>;

    /**
     * Set budget configuration
     */
    setBudget(budget: Budget): Promise<void>;

    /**
     * Get current budget configuration
     */
    getBudget(): Budget | undefined;

    /**
     * Check if budget allows a request
     */
    checkBudget(estimatedCost: number): Promise<{ allowed: boolean; warning?: BudgetWarning }>;

    /**
     * Get current spending against budget
     */
    getCurrentSpending(): Promise<{
        today: number;
        thisWeek: number;
        thisMonth: number;
    }>;

    /**
     * Export usage data
     */
    exportUsage(period: UsagePeriod, format: ExportFormat): Promise<string>;

    /**
     * Clear usage history
     */
    clearHistory(olderThan?: Date): Promise<number>;

    /**
     * Event fired when budget warning threshold is reached
     */
    readonly onBudgetWarning: Event<BudgetWarning>;

    /**
     * Event fired when budget limit is exceeded
     */
    readonly onBudgetExceeded: Event<BudgetWarning>;

    /**
     * Event fired when a request is tracked
     */
    readonly onRequestTracked: Event<TrackedRequest>;
}

/**
 * Abstract base implementation of CostTracker
 */
export abstract class BaseCostTracker implements CostTracker {

    protected budget: Budget | undefined;

    protected readonly onBudgetWarningEmitter = new Emitter<BudgetWarning>();
    readonly onBudgetWarning = this.onBudgetWarningEmitter.event;

    protected readonly onBudgetExceededEmitter = new Emitter<BudgetWarning>();
    readonly onBudgetExceeded = this.onBudgetExceededEmitter.event;

    protected readonly onRequestTrackedEmitter = new Emitter<TrackedRequest>();
    readonly onRequestTracked = this.onRequestTrackedEmitter.event;

    dispose(): void {
        this.onBudgetWarningEmitter.dispose();
        this.onBudgetExceededEmitter.dispose();
        this.onRequestTrackedEmitter.dispose();
    }

    abstract trackRequest(request: Omit<TrackedRequest, 'id'>): Promise<TrackedRequest>;
    abstract getUsage(period: UsagePeriod, customStart?: Date, customEnd?: Date): Promise<UsageReport>;
    abstract getRequests(period: UsagePeriod, customStart?: Date, customEnd?: Date): Promise<TrackedRequest[]>;
    abstract setBudget(budget: Budget): Promise<void>;
    abstract getCurrentSpending(): Promise<{ today: number; thisWeek: number; thisMonth: number }>;
    abstract exportUsage(period: UsagePeriod, format: ExportFormat): Promise<string>;
    abstract clearHistory(olderThan?: Date): Promise<number>;

    getBudget(): Budget | undefined {
        return this.budget;
    }

    async checkBudget(estimatedCost: number): Promise<{ allowed: boolean; warning?: BudgetWarning }> {
        if (!this.budget) {
            return { allowed: true };
        }

        const spending = await this.getCurrentSpending();

        // Check daily limit
        if (this.budget.dailyLimit !== undefined) {
            const newDaily = spending.today + estimatedCost;
            const percentage = newDaily / this.budget.dailyLimit;

            if (newDaily > this.budget.dailyLimit) {
                const warning: BudgetWarning = {
                    limitType: 'daily',
                    currentUsage: spending.today,
                    limit: this.budget.dailyLimit,
                    percentage,
                    exceeded: true
                };
                this.onBudgetExceededEmitter.fire(warning);
                return { allowed: !this.budget.hardLimit, warning };
            }

            if (percentage >= this.budget.warningThreshold) {
                const warning: BudgetWarning = {
                    limitType: 'daily',
                    currentUsage: spending.today,
                    limit: this.budget.dailyLimit,
                    percentage,
                    exceeded: false
                };
                this.onBudgetWarningEmitter.fire(warning);
                return { allowed: true, warning };
            }
        }

        // Check weekly limit
        if (this.budget.weeklyLimit !== undefined) {
            const newWeekly = spending.thisWeek + estimatedCost;
            const percentage = newWeekly / this.budget.weeklyLimit;

            if (newWeekly > this.budget.weeklyLimit) {
                const warning: BudgetWarning = {
                    limitType: 'weekly',
                    currentUsage: spending.thisWeek,
                    limit: this.budget.weeklyLimit,
                    percentage,
                    exceeded: true
                };
                this.onBudgetExceededEmitter.fire(warning);
                return { allowed: !this.budget.hardLimit, warning };
            }

            if (percentage >= this.budget.warningThreshold) {
                const warning: BudgetWarning = {
                    limitType: 'weekly',
                    currentUsage: spending.thisWeek,
                    limit: this.budget.weeklyLimit,
                    percentage,
                    exceeded: false
                };
                this.onBudgetWarningEmitter.fire(warning);
                return { allowed: true, warning };
            }
        }

        // Check monthly limit
        if (this.budget.monthlyLimit !== undefined) {
            const newMonthly = spending.thisMonth + estimatedCost;
            const percentage = newMonthly / this.budget.monthlyLimit;

            if (newMonthly > this.budget.monthlyLimit) {
                const warning: BudgetWarning = {
                    limitType: 'monthly',
                    currentUsage: spending.thisMonth,
                    limit: this.budget.monthlyLimit,
                    percentage,
                    exceeded: true
                };
                this.onBudgetExceededEmitter.fire(warning);
                return { allowed: !this.budget.hardLimit, warning };
            }

            if (percentage >= this.budget.warningThreshold) {
                const warning: BudgetWarning = {
                    limitType: 'monthly',
                    currentUsage: spending.thisMonth,
                    limit: this.budget.monthlyLimit,
                    percentage,
                    exceeded: false
                };
                this.onBudgetWarningEmitter.fire(warning);
                return { allowed: true, warning };
            }
        }

        return { allowed: true };
    }

    /**
     * Get date range for a usage period
     */
    protected getDateRange(period: UsagePeriod, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
        const now = new Date();
        const end = customEnd || now;
        let start: Date;

        switch (period) {
            case UsagePeriod.TODAY:
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case UsagePeriod.THIS_WEEK:
                const dayOfWeek = now.getDay();
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
                break;
            case UsagePeriod.THIS_MONTH:
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case UsagePeriod.LAST_30_DAYS:
                start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case UsagePeriod.ALL_TIME:
                start = new Date(0);
                break;
            case UsagePeriod.CUSTOM:
                start = customStart || new Date(0);
                break;
            default:
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        return { start, end };
    }

    /**
     * Generate usage report from requests
     */
    protected generateReport(requests: TrackedRequest[], period: UsagePeriod, start: Date, end: Date): UsageReport {
        const tokensByModel: Record<string, TokenUsage> = {};
        const tokensByProvider: Record<string, TokenUsage> = {};
        const costByTask: Record<string, number> = {};
        const requestsByTask: Record<string, number> = {};
        const dailyMap = new Map<string, { cost: number; tokens: number; requests: number }>();

        let totalCost = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalDurationMs = 0;
        let successCount = 0;
        let durationCount = 0;

        for (const req of requests) {
            totalCost += req.cost;
            totalInputTokens += req.inputTokens;
            totalOutputTokens += req.outputTokens;

            if (req.success) {
                successCount++;
            }

            if (req.durationMs !== undefined) {
                totalDurationMs += req.durationMs;
                durationCount++;
            }

            // By model
            if (!tokensByModel[req.modelId]) {
                tokensByModel[req.modelId] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, requestCount: 0 };
            }
            tokensByModel[req.modelId].inputTokens += req.inputTokens;
            tokensByModel[req.modelId].outputTokens += req.outputTokens;
            tokensByModel[req.modelId].totalTokens += req.inputTokens + req.outputTokens;
            tokensByModel[req.modelId].cost += req.cost;
            tokensByModel[req.modelId].requestCount++;

            // By provider
            if (!tokensByProvider[req.providerId]) {
                tokensByProvider[req.providerId] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, requestCount: 0 };
            }
            tokensByProvider[req.providerId].inputTokens += req.inputTokens;
            tokensByProvider[req.providerId].outputTokens += req.outputTokens;
            tokensByProvider[req.providerId].totalTokens += req.inputTokens + req.outputTokens;
            tokensByProvider[req.providerId].cost += req.cost;
            tokensByProvider[req.providerId].requestCount++;

            // By task type
            costByTask[req.taskType] = (costByTask[req.taskType] || 0) + req.cost;
            requestsByTask[req.taskType] = (requestsByTask[req.taskType] || 0) + 1;

            // Daily breakdown
            const dateKey = req.timestamp.toISOString().split('T')[0];
            const daily = dailyMap.get(dateKey) || { cost: 0, tokens: 0, requests: 0 };
            daily.cost += req.cost;
            daily.tokens += req.inputTokens + req.outputTokens;
            daily.requests++;
            dailyMap.set(dateKey, daily);
        }

        const dailyBreakdown = Array.from(dailyMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return {
            totalCost,
            totalTokens: totalInputTokens + totalOutputTokens,
            totalInputTokens,
            totalOutputTokens,
            totalRequests: requests.length,
            successRate: requests.length > 0 ? successCount / requests.length : 1,
            averageDurationMs: durationCount > 0 ? totalDurationMs / durationCount : 0,
            tokensByModel,
            tokensByProvider,
            costByTask: costByTask as Record<TaskType, number>,
            requestsByTask: requestsByTask as Record<TaskType, number>,
            dailyBreakdown,
            period,
            periodStart: start,
            periodEnd: end
        };
    }

    /**
     * Generate CSV export
     */
    protected generateCSV(requests: TrackedRequest[]): string {
        const headers = [
            'ID', 'Provider', 'Model', 'Task Type', 'Input Tokens', 'Output Tokens',
            'Cost (USD)', 'Duration (ms)', 'Success', 'Timestamp', 'Session ID'
        ];

        const rows = requests.map(req => [
            req.id,
            req.providerId,
            req.modelId,
            req.taskType,
            req.inputTokens.toString(),
            req.outputTokens.toString(),
            req.cost.toFixed(6),
            req.durationMs?.toString() || '',
            req.success.toString(),
            req.timestamp.toISOString(),
            req.sessionId || ''
        ]);

        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }

    /**
     * Generate JSON export
     */
    protected generateJSON(requests: TrackedRequest[]): string {
        return JSON.stringify(requests, null, 2);
    }
}
