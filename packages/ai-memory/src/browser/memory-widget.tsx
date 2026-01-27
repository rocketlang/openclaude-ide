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

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, Message } from '@theia/core/lib/browser';
import { MemoryIntegrationService, MemoryStats } from './memory-integration';
import { MemoryEntryType } from '../common';

/**
 * Widget displaying AI memory statistics and management
 */
@injectable()
export class MemoryWidget extends ReactWidget {

    static readonly ID = 'ai-memory-widget';
    static readonly LABEL = 'AI Memory';

    @inject(MemoryIntegrationService)
    protected readonly memoryIntegration: MemoryIntegrationService;

    protected stats: MemoryStats | undefined;
    protected isLoading = true;
    protected error: string | undefined;

    @postConstruct()
    protected init(): void {
        this.id = MemoryWidget.ID;
        this.title.label = MemoryWidget.LABEL;
        this.title.caption = MemoryWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-database';
        this.addClass('ai-memory-widget');

        this.loadStats();

        // Refresh on context updates
        this.toDispose.push(
            this.memoryIntegration.onContextUpdate(() => {
                this.loadStats();
            })
        );
    }

    protected async loadStats(): Promise<void> {
        this.isLoading = true;
        this.error = undefined;
        this.update();

        try {
            this.stats = await this.memoryIntegration.getStats();
        } catch (e) {
            this.error = e instanceof Error ? e.message : 'Failed to load stats';
        } finally {
            this.isLoading = false;
            this.update();
        }
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        if (this.isLoading) {
            return this.renderLoading();
        }

        if (this.error) {
            return this.renderError();
        }

        if (!this.stats) {
            return this.renderEmpty();
        }

        return (
            <div className="ai-memory-container">
                <div className="ai-memory-header">
                    <h2>AI Memory</h2>
                    <div className="ai-memory-actions">
                        <button
                            className="theia-button"
                            onClick={() => this.loadStats()}
                            title="Refresh"
                        >
                            <span className="codicon codicon-refresh" />
                        </button>
                        <button
                            className="theia-button secondary"
                            onClick={() => this.handleExport()}
                            title="Export Memory"
                        >
                            <span className="codicon codicon-export" />
                        </button>
                    </div>
                </div>

                {this.renderSession()}
                {this.renderMemoryStats()}
                {this.renderCacheStats()}
                {this.renderActions()}
            </div>
        );
    }

    protected renderLoading(): React.ReactNode {
        return (
            <div className="ai-memory-loading">
                <span className="codicon codicon-loading codicon-modifier-spin" />
                <span>Loading memory statistics...</span>
            </div>
        );
    }

    protected renderError(): React.ReactNode {
        return (
            <div className="ai-memory-error">
                <span className="codicon codicon-error" />
                <span>{this.error}</span>
                <button className="theia-button" onClick={() => this.loadStats()}>
                    Retry
                </button>
            </div>
        );
    }

    protected renderEmpty(): React.ReactNode {
        return (
            <div className="ai-memory-empty">
                <span className="codicon codicon-database" />
                <span>No memory data available</span>
            </div>
        );
    }

    protected renderSession(): React.ReactNode {
        const { currentSession, recentConversations } = this.stats!;

        return (
            <div className="ai-memory-section">
                <h3>Current Session</h3>
                <div className="ai-memory-stat-grid">
                    <div className="ai-memory-stat">
                        <span className="stat-label">Session ID</span>
                        <span className="stat-value">
                            {currentSession.id?.substring(0, 8) || 'N/A'}...
                        </span>
                    </div>
                    <div className="ai-memory-stat">
                        <span className="stat-label">Conversations</span>
                        <span className="stat-value">{recentConversations}</span>
                    </div>
                </div>
            </div>
        );
    }

    protected renderMemoryStats(): React.ReactNode {
        const { memory } = this.stats!;

        return (
            <div className="ai-memory-section">
                <h3>Memory Storage</h3>
                <div className="ai-memory-stat-grid">
                    <div className="ai-memory-stat">
                        <span className="stat-label">Total Entries</span>
                        <span className="stat-value">{memory.totalEntries}</span>
                    </div>
                    <div className="ai-memory-stat">
                        <span className="stat-label">Total Size</span>
                        <span className="stat-value">
                            {this.formatBytes(memory.totalSize)}
                        </span>
                    </div>
                </div>

                <h4>By Type</h4>
                <div className="ai-memory-type-breakdown">
                    {Object.entries(memory.byType).map(([type, count]) => (
                        <div key={type} className="ai-memory-type-row">
                            <span className="type-icon">
                                {this.getTypeIcon(type as MemoryEntryType)}
                            </span>
                            <span className="type-name">{this.formatTypeName(type)}</span>
                            <span className="type-count">{count}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    protected renderCacheStats(): React.ReactNode {
        const { cache } = this.stats!;

        return (
            <div className="ai-memory-section">
                <h3>Cache Performance</h3>
                <div className="ai-memory-stat-grid">
                    <div className="ai-memory-stat">
                        <span className="stat-label">Cached Entries</span>
                        <span className="stat-value">{cache.entries}</span>
                    </div>
                    <div className="ai-memory-stat">
                        <span className="stat-label">Cache Size</span>
                        <span className="stat-value">
                            {this.formatBytes(cache.size)}
                        </span>
                    </div>
                    <div className="ai-memory-stat">
                        <span className="stat-label">Hit Rate</span>
                        <span className="stat-value">
                            {(cache.hitRate * 100).toFixed(1)}%
                        </span>
                    </div>
                </div>

                <div className="ai-memory-progress">
                    <div className="progress-label">
                        <span>Cache Usage</span>
                        <span>{Math.round((cache.size / (10 * 1024 * 1024)) * 100)}%</span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${(cache.size / (10 * 1024 * 1024)) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    protected renderActions(): React.ReactNode {
        return (
            <div className="ai-memory-section ai-memory-actions-section">
                <h3>Actions</h3>
                <div className="ai-memory-action-buttons">
                    <button
                        className="theia-button"
                        onClick={() => this.handleNewSession()}
                    >
                        <span className="codicon codicon-add" />
                        New Session
                    </button>
                    <button
                        className="theia-button secondary"
                        onClick={() => this.handleImport()}
                    >
                        <span className="codicon codicon-import" />
                        Import
                    </button>
                    <button
                        className="theia-button secondary warning"
                        onClick={() => this.handleClear()}
                    >
                        <span className="codicon codicon-trash" />
                        Clear All
                    </button>
                </div>
            </div>
        );
    }

    protected async handleNewSession(): Promise<void> {
        const newSessionId = await this.memoryIntegration.newSession();
        console.info(`New session started: ${newSessionId}`);
        this.loadStats();
    }

    protected async handleExport(): Promise<void> {
        try {
            const data = await this.memoryIntegration.exportMemory();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-memory-export-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Export failed:', e);
        }
    }

    protected async handleImport(): Promise<void> {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const text = await file.text();
                await this.memoryIntegration.importMemory(text);
                this.loadStats();
            }
        };
        input.click();
    }

    protected async handleClear(): Promise<void> {
        if (confirm('Are you sure you want to clear all AI memory? This cannot be undone.')) {
            await this.memoryIntegration.clearAllMemory();
            this.loadStats();
        }
    }

    protected formatBytes(bytes: number): string {
        if (bytes === 0) {
            return '0 B';
        }
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    protected formatTypeName(type: string): string {
        return type
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    protected getTypeIcon(type: MemoryEntryType): React.ReactNode {
        const iconMap: Record<MemoryEntryType, string> = {
            [MemoryEntryType.Conversation]: 'codicon-comment-discussion',
            [MemoryEntryType.CodePattern]: 'codicon-symbol-pattern',
            [MemoryEntryType.UserPreference]: 'codicon-settings-gear',
            [MemoryEntryType.ProjectContext]: 'codicon-folder',
            [MemoryEntryType.LearnedBehavior]: 'codicon-mortar-board',
            [MemoryEntryType.ErrorSolution]: 'codicon-lightbulb',
            [MemoryEntryType.CodeSnippet]: 'codicon-code'
        };

        return <span className={`codicon ${iconMap[type] || 'codicon-circle'}`} />;
    }
}
