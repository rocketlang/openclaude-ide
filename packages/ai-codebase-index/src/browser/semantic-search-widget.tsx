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
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';
import {
    CodebaseIndexService,
    SearchResult,
    IndexStats,
    IndexingProgress,
    IndexingPhase
} from '../common';

interface SearchWidgetState {
    query: string;
    results: SearchResult[];
    isSearching: boolean;
    stats?: IndexStats;
    progress?: IndexingProgress;
    error?: string;
    filters: {
        languages: string[];
        hybridSearch: boolean;
    };
}

/**
 * Semantic search widget for codebase
 */
@injectable()
export class SemanticSearchWidget extends ReactWidget {

    static readonly ID = 'semantic-search-widget';
    static readonly LABEL = 'Semantic Search';

    @inject(CodebaseIndexService)
    protected readonly indexService: CodebaseIndexService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected state: SearchWidgetState = {
        query: '',
        results: [],
        isSearching: false,
        filters: {
            languages: [],
            hybridSearch: true
        }
    };

    protected searchInputRef: HTMLInputElement | null = null;

    @postConstruct()
    protected init(): void {
        this.id = SemanticSearchWidget.ID;
        this.title.label = SemanticSearchWidget.LABEL;
        this.title.caption = 'Search codebase semantically';
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-search';
        this.addClass('semantic-search-widget');

        // Subscribe to progress updates
        this.indexService.onProgress(progress => {
            this.state.progress = progress;
            this.update();
        });

        // Load initial stats
        this.refreshStats();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.searchInputRef?.focus();
    }

    protected render(): React.ReactNode {
        return (
            <div className="semantic-search-container">
                {this.renderSearchHeader()}
                {this.renderProgress()}
                {this.renderFilters()}
                {this.renderResults()}
                {this.renderStats()}
            </div>
        );
    }

    protected renderSearchHeader(): React.ReactNode {
        return (
            <div className="search-header">
                <div className="search-input-container">
                    <span className="codicon codicon-search" />
                    <input
                        ref={el => this.searchInputRef = el}
                        className="search-input"
                        type="text"
                        placeholder="Search by meaning... (e.g., 'authentication logic')"
                        value={this.state.query}
                        onChange={e => this.handleQueryChange(e.target.value)}
                        onKeyDown={e => this.handleKeyDown(e)}
                        disabled={this.state.isSearching}
                    />
                    {this.state.isSearching && (
                        <span className="codicon codicon-loading codicon-modifier-spin" />
                    )}
                </div>
                <div className="search-actions">
                    <button
                        className="theia-button"
                        onClick={() => this.handleSearch()}
                        disabled={!this.state.query.trim() || this.state.isSearching}
                    >
                        Search
                    </button>
                    <button
                        className="theia-button secondary"
                        onClick={() => this.handleIndexWorkspace()}
                        disabled={this.state.progress?.phase === IndexingPhase.Scanning ||
                                  this.state.progress?.phase === IndexingPhase.Embedding}
                        title="Re-index workspace"
                    >
                        <span className="codicon codicon-refresh" />
                    </button>
                </div>
            </div>
        );
    }

    protected renderProgress(): React.ReactNode {
        const progress = this.state.progress;
        if (!progress || progress.phase === IndexingPhase.Idle || progress.phase === IndexingPhase.Complete) {
            return null;
        }

        return (
            <div className="indexing-progress">
                <div className="progress-header">
                    <span className="progress-phase">{this.getPhaseLabel(progress.phase)}</span>
                    <span className="progress-percent">{progress.percentComplete}%</span>
                </div>
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${progress.percentComplete}%` }}
                    />
                </div>
                {progress.currentFile && (
                    <div className="progress-file">
                        {progress.currentFile}
                    </div>
                )}
                <div className="progress-stats">
                    <span>Files: {progress.filesProcessed}/{progress.totalFiles}</span>
                    <span>Chunks: {progress.chunksGenerated}</span>
                    <span>Embeddings: {progress.embeddingsComputed}</span>
                </div>
            </div>
        );
    }

    protected renderFilters(): React.ReactNode {
        return (
            <div className="search-filters">
                <label className="filter-checkbox">
                    <input
                        type="checkbox"
                        checked={this.state.filters.hybridSearch}
                        onChange={e => this.handleFilterChange('hybridSearch', e.target.checked)}
                    />
                    Hybrid Search (vector + keyword)
                </label>
            </div>
        );
    }

    protected renderResults(): React.ReactNode {
        if (this.state.error) {
            return (
                <div className="search-error">
                    <span className="codicon codicon-error" />
                    {this.state.error}
                </div>
            );
        }

        if (this.state.results.length === 0) {
            if (this.state.query && !this.state.isSearching) {
                return (
                    <div className="no-results">
                        <span className="codicon codicon-info" />
                        No results found for "{this.state.query}"
                    </div>
                );
            }
            return null;
        }

        return (
            <div className="search-results">
                <div className="results-header">
                    Found {this.state.results.length} results
                </div>
                {this.state.results.map((result, index) =>
                    this.renderResult(result, index)
                )}
            </div>
        );
    }

    protected renderResult(result: SearchResult, index: number): React.ReactNode {
        const score = (result.score * 100).toFixed(1);

        return (
            <div
                key={`${result.chunk.id}-${index}`}
                className="search-result"
                onClick={() => this.openResult(result)}
            >
                <div className="result-header">
                    <span className="result-file">
                        <span className={`codicon codicon-file-code`} />
                        {result.chunk.filePath}
                    </span>
                    <span className="result-score" title="Relevance score">
                        {score}%
                    </span>
                </div>
                <div className="result-location">
                    Lines {result.chunk.startLine}-{result.chunk.endLine}
                    {result.chunk.symbolName && (
                        <span className="result-symbol">
                            <span className={`codicon codicon-symbol-${result.chunk.symbolType || 'method'}`} />
                            {result.chunk.symbolName}
                        </span>
                    )}
                </div>
                <div className="result-snippet">
                    <pre><code>{result.snippet || result.chunk.content.slice(0, 200)}</code></pre>
                </div>
                {result.matchedKeywords && result.matchedKeywords.length > 0 && (
                    <div className="result-keywords">
                        {result.matchedKeywords.map(kw => (
                            <span key={kw} className="keyword-badge">{kw}</span>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    protected renderStats(): React.ReactNode {
        const stats = this.state.stats;
        if (!stats) {
            return null;
        }

        return (
            <div className="index-stats">
                <div className="stats-row">
                    <span className="stat">
                        <span className="codicon codicon-file" />
                        {stats.totalFiles} files
                    </span>
                    <span className="stat">
                        <span className="codicon codicon-symbol-class" />
                        {stats.totalChunks} chunks
                    </span>
                    <span className="stat">
                        <span className="codicon codicon-database" />
                        {this.formatBytes(stats.indexSizeBytes)}
                    </span>
                </div>
            </div>
        );
    }

    protected handleQueryChange(query: string): void {
        this.state.query = query;
        this.update();
    }

    protected handleKeyDown(e: React.KeyboardEvent): void {
        if (e.key === 'Enter' && this.state.query.trim()) {
            this.handleSearch();
        }
    }

    protected async handleSearch(): Promise<void> {
        if (!this.state.query.trim() || this.state.isSearching) {
            return;
        }

        this.state.isSearching = true;
        this.state.error = undefined;
        this.update();

        try {
            const results = await this.indexService.search(this.state.query, {
                maxResults: 20,
                minScore: 0.3,
                hybridSearch: this.state.filters.hybridSearch,
                keywordWeight: 0.3,
                languages: this.state.filters.languages.length > 0
                    ? this.state.filters.languages
                    : undefined
            });

            this.state.results = results;
        } catch (error) {
            this.state.error = error instanceof Error ? error.message : String(error);
            this.state.results = [];
        } finally {
            this.state.isSearching = false;
            this.update();
        }
    }

    protected async handleIndexWorkspace(): Promise<void> {
        try {
            await this.indexService.indexWorkspace();
            this.refreshStats();
        } catch (error) {
            this.state.error = error instanceof Error ? error.message : String(error);
            this.update();
        }
    }

    protected handleFilterChange(key: keyof SearchWidgetState['filters'], value: unknown): void {
        (this.state.filters as Record<string, unknown>)[key] = value;
        this.update();
    }

    protected async openResult(result: SearchResult): Promise<void> {
        try {
            // Construct URI - assuming workspace root
            const uri = new URI(`file://${result.chunk.filePath}`);

            await this.editorManager.open(uri, {
                selection: {
                    start: { line: result.chunk.startLine - 1, character: 0 },
                    end: { line: result.chunk.endLine - 1, character: 0 }
                },
                mode: 'reveal'
            });
        } catch (error) {
            console.error('Error opening result:', error);
        }
    }

    protected refreshStats(): void {
        this.state.stats = this.indexService.getStats();
        this.update();
    }

    protected getPhaseLabel(phase: IndexingPhase): string {
        switch (phase) {
            case IndexingPhase.Scanning: return 'Scanning files...';
            case IndexingPhase.Parsing: return 'Parsing files...';
            case IndexingPhase.Chunking: return 'Generating chunks...';
            case IndexingPhase.Embedding: return 'Computing embeddings...';
            case IndexingPhase.Storing: return 'Saving index...';
            case IndexingPhase.Error: return 'Error';
            default: return '';
        }
    }

    protected formatBytes(bytes: number): string {
        if (bytes < 1024) {
            return bytes + ' B';
        }
        if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + ' KB';
        }
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
}
