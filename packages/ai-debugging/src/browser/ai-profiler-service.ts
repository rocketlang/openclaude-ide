// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// AI Profiler Service Implementation
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import {
    AIProfilerService,
    PerformanceProfile,
    ProfileOptions,
    AIInsight,
    SuggestedFix,
    InsightType,
    Hotspot
} from '../common';

@injectable()
export class AIProfilerServiceImpl implements AIProfilerService {

    protected activeProfiles: Map<string, {
        startTime: number;
        options: ProfileOptions;
    }> = new Map();

    async startProfile(options?: ProfileOptions): Promise<string> {
        const profileId = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        this.activeProfiles.set(profileId, {
            startTime: performance.now(),
            options: options || {}
        });

        return profileId;
    }

    async stopProfile(profileId: string): Promise<PerformanceProfile> {
        const profileData = this.activeProfiles.get(profileId);

        if (!profileData) {
            throw new Error(`Profile ${profileId} not found`);
        }

        const endTime = performance.now();
        const duration = endTime - profileData.startTime;

        // Collect performance metrics
        const metrics = this.collectMetrics();
        const hotspots = this.identifyHotspots();

        this.activeProfiles.delete(profileId);

        const profile: PerformanceProfile = {
            id: profileId,
            startTime: profileData.startTime,
            endTime,
            duration,
            metrics,
            hotspots,
            aiInsights: []
        };

        // Generate insights
        profile.aiInsights = await this.analyzeProfile(profile);

        return profile;
    }

    async analyzeProfile(profile: PerformanceProfile): Promise<AIInsight[]> {
        const insights: AIInsight[] = [];

        // Analyze memory usage
        if (profile.metrics.memoryPeak > 100 * 1024 * 1024) {
            insights.push({
                type: InsightType.MemoryLeak,
                title: 'High Memory Usage Detected',
                description: `Peak memory usage was ${Math.round(profile.metrics.memoryPeak / 1024 / 1024)}MB`,
                severity: 'warning',
                recommendation: 'Consider reviewing object allocations and implementing proper cleanup'
            });
        }

        // Analyze duration
        if (profile.duration > 5000) {
            insights.push({
                type: InsightType.PerformanceBottleneck,
                title: 'Long Execution Time',
                description: `Profile duration was ${Math.round(profile.duration)}ms`,
                severity: 'warning',
                recommendation: 'Consider optimizing long-running operations or using async processing'
            });
        }

        // Analyze GC time (if available)
        if (profile.metrics.gcTime > profile.duration * 0.1) {
            insights.push({
                type: InsightType.MemoryLeak,
                title: 'Excessive Garbage Collection',
                description: `GC took ${Math.round(profile.metrics.gcTime / profile.duration * 100)}% of total time`,
                severity: 'warning',
                recommendation: 'Reduce temporary object allocations and reuse objects where possible'
            });
        }

        // Analyze hotspots
        for (const hotspot of profile.hotspots) {
            if (hotspot.totalTime > profile.duration * 0.2) {
                insights.push({
                    type: InsightType.PerformanceBottleneck,
                    title: 'Performance Hotspot',
                    description: `${hotspot.location.context} takes ${Math.round(hotspot.totalTime / profile.duration * 100)}% of execution time`,
                    severity: 'critical',
                    affectedCode: [hotspot.location],
                    recommendation: hotspot.aiSuggestion || 'Consider optimizing this code path'
                });
            }
        }

        // Add general recommendations if no specific insights
        if (insights.length === 0) {
            insights.push({
                type: InsightType.PerformanceBottleneck,
                title: 'Profile Complete',
                description: `Execution completed in ${Math.round(profile.duration)}ms`,
                severity: 'info',
                recommendation: 'No significant performance issues detected'
            });
        }

        return insights;
    }

    async getOptimizationSuggestions(profile: PerformanceProfile): Promise<SuggestedFix[]> {
        const suggestions: SuggestedFix[] = [];

        // Memory optimization suggestions
        if (profile.metrics.memoryPeak > 50 * 1024 * 1024) {
            suggestions.push({
                description: 'Consider using object pooling for frequently created objects',
                priority: 'medium',
                explanation: 'Object pooling can reduce garbage collection overhead'
            });
        }

        // Duration optimization suggestions
        if (profile.duration > 1000) {
            suggestions.push({
                description: 'Consider breaking up long operations into smaller chunks',
                priority: 'medium',
                explanation: 'Use requestAnimationFrame or setTimeout to avoid blocking the main thread'
            });
        }

        // Hotspot suggestions
        for (const hotspot of profile.hotspots) {
            if (hotspot.totalTime > profile.duration * 0.1) {
                suggestions.push({
                    description: `Optimize ${hotspot.location.context}`,
                    priority: hotspot.totalTime > profile.duration * 0.2 ? 'high' : 'medium',
                    explanation: `This function accounts for ${Math.round(hotspot.totalTime / profile.duration * 100)}% of total execution time`
                });
            }
        }

        return suggestions;
    }

    private collectMetrics() {
        // Collect real metrics if available, otherwise use estimates
        const memoryInfo = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

        return {
            cpuTime: performance.now(),
            memoryPeak: memoryInfo?.usedJSHeapSize || 50 * 1024 * 1024,
            memoryAverage: (memoryInfo?.usedJSHeapSize || 50 * 1024 * 1024) * 0.8,
            gcTime: 0,
            ioWaitTime: 0,
            functionCalls: 0
        };
    }

    private identifyHotspots(): Hotspot[] {
        // In a real implementation, this would analyze actual profiling data
        return [];
    }
}
