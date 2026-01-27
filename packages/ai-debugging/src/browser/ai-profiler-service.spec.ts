// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { AIProfilerServiceImpl } from './ai-profiler-service';
import { InsightType } from '../common';

describe('AIProfilerService', () => {
    let service: AIProfilerServiceImpl;

    beforeEach(() => {
        service = new AIProfilerServiceImpl();
    });

    describe('startProfile', () => {
        it('should return a profile ID', async () => {
            const profileId = await service.startProfile();

            expect(profileId).to.be.a('string');
            expect(profileId).to.include('profile-');
        });

        it('should accept options', async () => {
            const profileId = await service.startProfile({
                sampleRate: 100,
                includeMemory: true
            });

            expect(profileId).to.be.a('string');
        });
    });

    describe('stopProfile', () => {
        it('should return a performance profile', async () => {
            const profileId = await service.startProfile();

            // Simulate some work
            await new Promise(resolve => setTimeout(resolve, 50));

            const profile = await service.stopProfile(profileId);

            expect(profile.id).to.equal(profileId);
            expect(profile.duration).to.be.greaterThan(0);
            expect(profile.metrics).to.exist;
        });

        it('should throw for non-existent profile', async () => {
            try {
                await service.stopProfile('non-existent');
                expect.fail('Should have thrown');
            } catch (error) {
                expect((error as Error).message).to.include('not found');
            }
        });

        it('should include metrics', async () => {
            const profileId = await service.startProfile();
            const profile = await service.stopProfile(profileId);

            expect(profile.metrics.cpuTime).to.exist;
            expect(profile.metrics.memoryPeak).to.exist;
            expect(profile.metrics.memoryAverage).to.exist;
        });
    });

    describe('analyzeProfile', () => {
        it('should detect high memory usage', async () => {
            const profile = {
                id: 'test',
                startTime: 0,
                endTime: 1000,
                duration: 1000,
                metrics: {
                    cpuTime: 1000,
                    memoryPeak: 200 * 1024 * 1024, // 200MB
                    memoryAverage: 150 * 1024 * 1024,
                    gcTime: 0,
                    ioWaitTime: 0,
                    functionCalls: 0
                },
                hotspots: [],
                aiInsights: []
            };

            const insights = await service.analyzeProfile(profile);

            const memoryInsight = insights.find(i => i.type === InsightType.MemoryLeak);
            expect(memoryInsight).to.exist;
            expect(memoryInsight?.severity).to.equal('warning');
        });

        it('should detect long execution time', async () => {
            const profile = {
                id: 'test',
                startTime: 0,
                endTime: 10000,
                duration: 10000, // 10 seconds
                metrics: {
                    cpuTime: 10000,
                    memoryPeak: 50 * 1024 * 1024,
                    memoryAverage: 40 * 1024 * 1024,
                    gcTime: 0,
                    ioWaitTime: 0,
                    functionCalls: 0
                },
                hotspots: [],
                aiInsights: []
            };

            const insights = await service.analyzeProfile(profile);

            const durationInsight = insights.find(i =>
                i.type === InsightType.PerformanceBottleneck &&
                i.title.includes('Long Execution')
            );
            expect(durationInsight).to.exist;
        });

        it('should return info insight when no issues', async () => {
            const profile = {
                id: 'test',
                startTime: 0,
                endTime: 100,
                duration: 100,
                metrics: {
                    cpuTime: 100,
                    memoryPeak: 10 * 1024 * 1024,
                    memoryAverage: 8 * 1024 * 1024,
                    gcTime: 0,
                    ioWaitTime: 0,
                    functionCalls: 0
                },
                hotspots: [],
                aiInsights: []
            };

            const insights = await service.analyzeProfile(profile);

            expect(insights).to.have.length.greaterThan(0);
            const infoInsight = insights.find(i => i.severity === 'info');
            expect(infoInsight).to.exist;
        });
    });

    describe('getOptimizationSuggestions', () => {
        it('should suggest optimizations for high memory', async () => {
            const profile = {
                id: 'test',
                startTime: 0,
                endTime: 1000,
                duration: 1000,
                metrics: {
                    cpuTime: 1000,
                    memoryPeak: 100 * 1024 * 1024,
                    memoryAverage: 80 * 1024 * 1024,
                    gcTime: 0,
                    ioWaitTime: 0,
                    functionCalls: 0
                },
                hotspots: [],
                aiInsights: []
            };

            const suggestions = await service.getOptimizationSuggestions(profile);

            expect(suggestions).to.have.length.greaterThan(0);
            const memSuggestion = suggestions.find(s => s.description.includes('pooling'));
            expect(memSuggestion).to.exist;
        });

        it('should suggest optimizations for long duration', async () => {
            const profile = {
                id: 'test',
                startTime: 0,
                endTime: 2000,
                duration: 2000,
                metrics: {
                    cpuTime: 2000,
                    memoryPeak: 20 * 1024 * 1024,
                    memoryAverage: 15 * 1024 * 1024,
                    gcTime: 0,
                    ioWaitTime: 0,
                    functionCalls: 0
                },
                hotspots: [],
                aiInsights: []
            };

            const suggestions = await service.getOptimizationSuggestions(profile);

            const durationSuggestion = suggestions.find(s => s.description.includes('chunks'));
            expect(durationSuggestion).to.exist;
        });
    });
});
