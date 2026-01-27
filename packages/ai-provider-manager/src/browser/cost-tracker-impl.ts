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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { generateUuid, ILogger } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser';
import {
    BaseCostTracker,
    TrackedRequest,
    UsagePeriod,
    UsageReport,
    Budget,
    ExportFormat
} from '../common';

const STORAGE_KEY = 'openclaude.costTracker';
const MAX_STORED_REQUESTS = 10000;

@injectable()
export class CostTrackerImpl extends BaseCostTracker {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    protected requests: TrackedRequest[] = [];
    protected initialized = false;

    @postConstruct()
    protected async init(): Promise<void> {
        await this.loadData();
        this.initialized = true;
    }

    async trackRequest(request: Omit<TrackedRequest, 'id'>): Promise<TrackedRequest> {
        const trackedRequest: TrackedRequest = {
            ...request,
            id: generateUuid(),
            timestamp: new Date(request.timestamp)
        };

        this.requests.push(trackedRequest);

        // Prune old requests if needed
        if (this.requests.length > MAX_STORED_REQUESTS) {
            this.requests = this.requests.slice(-MAX_STORED_REQUESTS);
        }

        await this.persistData();
        this.onRequestTrackedEmitter.fire(trackedRequest);

        // Check budget
        if (this.budget) {
            await this.checkBudget(0); // Check current spending against limits
        }

        this.logger.debug(`Tracked request: ${trackedRequest.providerId}/${trackedRequest.modelId} - $${trackedRequest.cost.toFixed(4)}`);

        return trackedRequest;
    }

    async getUsage(period: UsagePeriod, customStart?: Date, customEnd?: Date): Promise<UsageReport> {
        const { start, end } = this.getDateRange(period, customStart, customEnd);
        const filteredRequests = this.filterRequestsByPeriod(start, end);
        return this.generateReport(filteredRequests, period, start, end);
    }

    async getRequests(period: UsagePeriod, customStart?: Date, customEnd?: Date): Promise<TrackedRequest[]> {
        const { start, end } = this.getDateRange(period, customStart, customEnd);
        return this.filterRequestsByPeriod(start, end);
    }

    async setBudget(budget: Budget): Promise<void> {
        this.budget = budget;
        await this.persistData();
        this.logger.info('Budget updated:', budget);
    }

    async getCurrentSpending(): Promise<{ today: number; thisWeek: number; thisMonth: number }> {
        const now = new Date();

        // Today
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayRequests = this.filterRequestsByPeriod(todayStart, now);
        const today = todayRequests.reduce((sum, r) => sum + r.cost, 0);

        // This week
        const dayOfWeek = now.getDay();
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        const weekRequests = this.filterRequestsByPeriod(weekStart, now);
        const thisWeek = weekRequests.reduce((sum, r) => sum + r.cost, 0);

        // This month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthRequests = this.filterRequestsByPeriod(monthStart, now);
        const thisMonth = monthRequests.reduce((sum, r) => sum + r.cost, 0);

        return { today, thisWeek, thisMonth };
    }

    async exportUsage(period: UsagePeriod, format: ExportFormat): Promise<string> {
        const requests = await this.getRequests(period);

        switch (format) {
            case ExportFormat.CSV:
                return this.generateCSV(requests);
            case ExportFormat.JSON:
                return this.generateJSON(requests);
            default:
                return this.generateJSON(requests);
        }
    }

    async clearHistory(olderThan?: Date): Promise<number> {
        const originalCount = this.requests.length;

        if (olderThan) {
            this.requests = this.requests.filter(r => r.timestamp >= olderThan);
        } else {
            this.requests = [];
        }

        await this.persistData();
        const deletedCount = originalCount - this.requests.length;
        this.logger.info(`Cleared ${deletedCount} requests from history`);
        return deletedCount;
    }

    protected filterRequestsByPeriod(start: Date, end: Date): TrackedRequest[] {
        return this.requests.filter(r => {
            const timestamp = new Date(r.timestamp);
            return timestamp >= start && timestamp <= end;
        });
    }

    protected async loadData(): Promise<void> {
        try {
            const data = await this.storageService.getData<{
                requests: TrackedRequest[];
                budget?: Budget;
            }>(STORAGE_KEY);

            if (data) {
                // Parse dates from JSON
                this.requests = (data.requests || []).map(r => ({
                    ...r,
                    timestamp: new Date(r.timestamp)
                }));
                this.budget = data.budget;
            }

            this.logger.info(`Loaded ${this.requests.length} tracked requests`);
        } catch (error) {
            this.logger.warn('Failed to load cost tracker data:', error);
        }
    }

    protected async persistData(): Promise<void> {
        await this.storageService.setData(STORAGE_KEY, {
            requests: this.requests,
            budget: this.budget
        });
    }
}
