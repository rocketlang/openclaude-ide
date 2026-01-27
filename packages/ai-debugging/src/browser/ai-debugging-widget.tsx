// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// AI Debugging Widget - Error Analysis and Performance Profiling UI
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import {
    AIDebuggingService,
    AIProfilerService,
    ErrorAnalysis,
    PerformanceProfile,
    AIInsight
} from '../common';

@injectable()
export class AIDebuggingWidget extends ReactWidget {

    static readonly ID = 'ai-debugging-widget';
    static readonly LABEL = 'AI Debugger';

    @inject(AIDebuggingService)
    protected readonly debugService: AIDebuggingService;

    @inject(AIProfilerService)
    protected readonly profilerService: AIProfilerService;

    protected currentAnalysis?: ErrorAnalysis;
    protected currentProfile?: PerformanceProfile;
    protected activeTab: 'debug' | 'profile' = 'debug';
    protected isAnalyzing = false;
    protected isProfiling = false;
    protected profileId?: string;
    protected errorInput = '';

    @postConstruct()
    protected init(): void {
        this.id = AIDebuggingWidget.ID;
        this.title.label = AIDebuggingWidget.LABEL;
        this.title.caption = 'AI-Powered Debugging & Profiling';
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-debug';
        this.addClass('ai-debugging-widget');
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        return (
            <div className="ai-debugging-container">
                <div className="ai-debugging-tabs">
                    <button
                        className={`tab-btn ${this.activeTab === 'debug' ? 'active' : ''}`}
                        onClick={() => this.setTab('debug')}
                    >
                        <i className="codicon codicon-bug" />
                        Error Analysis
                    </button>
                    <button
                        className={`tab-btn ${this.activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => this.setTab('profile')}
                    >
                        <i className="codicon codicon-dashboard" />
                        Profiler
                    </button>
                </div>

                <div className="ai-debugging-content">
                    {this.activeTab === 'debug' ? this.renderDebugTab() : this.renderProfileTab()}
                </div>

                <style>{this.getStyles()}</style>
            </div>
        );
    }

    protected renderDebugTab(): React.ReactNode {
        return (
            <div className="debug-tab">
                <div className="input-section">
                    <label>Paste error message or stack trace:</label>
                    <textarea
                        className="error-input"
                        placeholder="Paste your error here..."
                        value={this.errorInput}
                        onChange={e => this.setErrorInput(e.target.value)}
                        rows={5}
                    />
                    <button
                        className="analyze-btn"
                        onClick={() => this.analyzeError()}
                        disabled={this.isAnalyzing || !this.errorInput.trim()}
                    >
                        {this.isAnalyzing ? (
                            <>
                                <i className="codicon codicon-loading codicon-modifier-spin" />
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <i className="codicon codicon-sparkle" />
                                Analyze with AI
                            </>
                        )}
                    </button>
                </div>

                {this.currentAnalysis && (
                    <div className="analysis-results">
                        <h4>Analysis Results</h4>

                        <div className="result-section">
                            <label>Error Type:</label>
                            <span className="error-type">{this.currentAnalysis.errorType}</span>
                        </div>

                        <div className="result-section">
                            <label>Root Cause:</label>
                            <p className="root-cause">{this.currentAnalysis.rootCause}</p>
                        </div>

                        <div className="result-section">
                            <label>Confidence:</label>
                            <div className="confidence-bar">
                                <div
                                    className="confidence-fill"
                                    style={{ width: `${this.currentAnalysis.confidence * 100}%` }}
                                />
                                <span>{Math.round(this.currentAnalysis.confidence * 100)}%</span>
                            </div>
                        </div>

                        {this.currentAnalysis.suggestedFixes.length > 0 && (
                            <div className="result-section">
                                <label>Suggested Fixes:</label>
                                <ul className="fixes-list">
                                    {this.currentAnalysis.suggestedFixes.map((fix, i) => (
                                        <li key={i} className={`fix-item priority-${fix.priority}`}>
                                            <span className="fix-priority">{fix.priority}</span>
                                            <span className="fix-desc">{fix.description}</span>
                                            <p className="fix-explanation">{fix.explanation}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    protected renderProfileTab(): React.ReactNode {
        return (
            <div className="profile-tab">
                <div className="profile-controls">
                    {!this.isProfiling ? (
                        <button className="start-profile-btn" onClick={() => this.startProfiling()}>
                            <i className="codicon codicon-play" />
                            Start Profiling
                        </button>
                    ) : (
                        <button className="stop-profile-btn" onClick={() => this.stopProfiling()}>
                            <i className="codicon codicon-debug-stop" />
                            Stop Profiling
                        </button>
                    )}
                </div>

                {this.currentProfile && this.renderProfileResults()}
            </div>
        );
    }

    protected renderProfileResults(): React.ReactNode {
        if (!this.currentProfile) {
            return null;
        }

        const profile = this.currentProfile;

        return (
            <div className="profile-results">
                <h4>Profile Results</h4>

                <div className="metrics-grid">
                    <div className="metric-card">
                        <i className="codicon codicon-clock" />
                        <span className="metric-value">{Math.round(profile.duration)}ms</span>
                        <span className="metric-label">Duration</span>
                    </div>
                    <div className="metric-card">
                        <i className="codicon codicon-server" />
                        <span className="metric-value">{Math.round(profile.metrics.memoryPeak / 1024 / 1024)}MB</span>
                        <span className="metric-label">Peak Memory</span>
                    </div>
                    <div className="metric-card">
                        <i className="codicon codicon-pulse" />
                        <span className="metric-value">{profile.metrics.functionCalls}</span>
                        <span className="metric-label">Function Calls</span>
                    </div>
                </div>

                {profile.aiInsights.length > 0 && (
                    <div className="insights-section">
                        <h5>AI Insights</h5>
                        {profile.aiInsights.map((insight, i) => this.renderInsight(insight, i))}
                    </div>
                )}
            </div>
        );
    }

    protected renderInsight(insight: AIInsight, index: number): React.ReactNode {
        return (
            <div key={index} className={`insight-card severity-${insight.severity}`}>
                <div className="insight-header">
                    <span className="insight-type">{insight.type}</span>
                    <span className={`insight-severity ${insight.severity}`}>{insight.severity}</span>
                </div>
                <h6>{insight.title}</h6>
                <p>{insight.description}</p>
                <div className="insight-recommendation">
                    <i className="codicon codicon-lightbulb" />
                    {insight.recommendation}
                </div>
            </div>
        );
    }

    protected setTab(tab: 'debug' | 'profile'): void {
        this.activeTab = tab;
        this.update();
    }

    protected setErrorInput(value: string): void {
        this.errorInput = value;
        this.update();
    }

    protected async analyzeError(): Promise<void> {
        if (!this.errorInput.trim()) {
            return;
        }

        this.isAnalyzing = true;
        this.update();

        try {
            this.currentAnalysis = await this.debugService.analyzeError(this.errorInput);
        } catch (error) {
            console.error('Error analysis failed:', error);
        } finally {
            this.isAnalyzing = false;
            this.update();
        }
    }

    protected async startProfiling(): Promise<void> {
        try {
            this.profileId = await this.profilerService.startProfile();
            this.isProfiling = true;
            this.update();
        } catch (error) {
            console.error('Failed to start profiling:', error);
        }
    }

    protected async stopProfiling(): Promise<void> {
        if (!this.profileId) {
            return;
        }

        try {
            this.currentProfile = await this.profilerService.stopProfile(this.profileId);
        } catch (error) {
            console.error('Failed to stop profiling:', error);
        } finally {
            this.isProfiling = false;
            this.profileId = undefined;
            this.update();
        }
    }

    protected getStyles(): string {
        return `
            .ai-debugging-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                padding: 12px;
            }
            .ai-debugging-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 16px;
                border-bottom: 1px solid var(--theia-widget-border);
                padding-bottom: 8px;
            }
            .tab-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 16px;
                background: transparent;
                border: none;
                cursor: pointer;
                font-size: 13px;
                color: var(--theia-descriptionForeground);
                border-radius: 4px;
            }
            .tab-btn:hover {
                background: var(--theia-toolbar-hoverBackground);
            }
            .tab-btn.active {
                background: var(--theia-button-background);
                color: var(--theia-button-foreground);
            }
            .ai-debugging-content {
                flex: 1;
                overflow-y: auto;
            }
            .input-section {
                margin-bottom: 16px;
            }
            .input-section label {
                display: block;
                font-size: 12px;
                margin-bottom: 8px;
                color: var(--theia-descriptionForeground);
            }
            .error-input {
                width: 100%;
                padding: 8px;
                font-family: monospace;
                font-size: 12px;
                background: var(--theia-editor-background);
                border: 1px solid var(--theia-widget-border);
                border-radius: 4px;
                color: var(--theia-foreground);
                resize: vertical;
            }
            .analyze-btn, .start-profile-btn, .stop-profile-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 12px;
                padding: 10px 20px;
                background: var(--theia-button-background);
                color: var(--theia-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
            }
            .analyze-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .stop-profile-btn {
                background: #f44336;
            }
            .analysis-results, .profile-results {
                background: var(--theia-sideBar-background);
                border-radius: 6px;
                padding: 16px;
            }
            .analysis-results h4, .profile-results h4 {
                margin: 0 0 16px 0;
                font-size: 14px;
            }
            .result-section {
                margin-bottom: 12px;
            }
            .result-section label {
                font-size: 11px;
                text-transform: uppercase;
                color: var(--theia-descriptionForeground);
            }
            .error-type {
                display: inline-block;
                padding: 4px 8px;
                background: rgba(244, 67, 54, 0.15);
                color: #f44336;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
            }
            .root-cause {
                margin: 4px 0;
                font-size: 13px;
            }
            .confidence-bar {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 4px;
            }
            .confidence-bar > div {
                flex: 1;
                height: 8px;
                background: var(--theia-progressBar-background);
                border-radius: 4px;
                overflow: hidden;
            }
            .confidence-fill {
                height: 100%;
                background: var(--theia-button-background);
            }
            .fixes-list {
                list-style: none;
                padding: 0;
                margin: 8px 0;
            }
            .fix-item {
                padding: 12px;
                background: var(--theia-editor-background);
                border-radius: 4px;
                margin-bottom: 8px;
                border-left: 3px solid transparent;
            }
            .fix-item.priority-high {
                border-left-color: #f44336;
            }
            .fix-item.priority-medium {
                border-left-color: #ff9800;
            }
            .fix-item.priority-low {
                border-left-color: #4caf50;
            }
            .fix-priority {
                font-size: 10px;
                text-transform: uppercase;
                padding: 2px 6px;
                border-radius: 3px;
                background: rgba(255,255,255,0.1);
            }
            .fix-desc {
                font-weight: 500;
                margin-left: 8px;
            }
            .fix-explanation {
                margin: 8px 0 0 0;
                font-size: 12px;
                color: var(--theia-descriptionForeground);
            }
            .metrics-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                margin-bottom: 16px;
            }
            .metric-card {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 16px;
                background: var(--theia-editor-background);
                border-radius: 6px;
            }
            .metric-card i {
                font-size: 24px;
                margin-bottom: 8px;
                opacity: 0.7;
            }
            .metric-value {
                font-size: 20px;
                font-weight: 600;
            }
            .metric-label {
                font-size: 11px;
                color: var(--theia-descriptionForeground);
            }
            .insights-section h5 {
                margin: 0 0 12px 0;
                font-size: 13px;
            }
            .insight-card {
                padding: 12px;
                background: var(--theia-editor-background);
                border-radius: 4px;
                margin-bottom: 8px;
                border-left: 3px solid transparent;
            }
            .insight-card.severity-critical {
                border-left-color: #f44336;
            }
            .insight-card.severity-warning {
                border-left-color: #ff9800;
            }
            .insight-card.severity-info {
                border-left-color: #2196f3;
            }
            .insight-header {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            .insight-type {
                font-size: 10px;
                text-transform: uppercase;
                opacity: 0.7;
            }
            .insight-severity {
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 3px;
            }
            .insight-severity.critical {
                background: rgba(244, 67, 54, 0.2);
                color: #f44336;
            }
            .insight-severity.warning {
                background: rgba(255, 152, 0, 0.2);
                color: #ff9800;
            }
            .insight-severity.info {
                background: rgba(33, 150, 243, 0.2);
                color: #2196f3;
            }
            .insight-card h6 {
                margin: 0 0 8px 0;
                font-size: 13px;
            }
            .insight-card p {
                margin: 0 0 8px 0;
                font-size: 12px;
            }
            .insight-recommendation {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                padding: 8px;
                background: rgba(255,255,255,0.05);
                border-radius: 4px;
                font-size: 12px;
            }
            .insight-recommendation i {
                color: #ffeb3b;
            }
        `;
    }
}
