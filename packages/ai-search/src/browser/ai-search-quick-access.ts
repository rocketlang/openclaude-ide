// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    QuickInputService,
    QuickPickItem,
    QuickPicks
} from '@theia/core/lib/browser/quick-input/quick-input-service';
import { QuickAccessProvider, QuickAccessRegistry } from '@theia/core/lib/browser/quick-input/quick-access';
import { CancellationToken, nls } from '@theia/core/lib/common';
import { Command } from '@theia/core/lib/common/command';
import { OpenerService } from '@theia/core/lib/browser';
import { URI } from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    AISearchService,
    AISearchResult,
    getSymbolIcon
} from '../common/ai-search-protocol';

export const aiSearchCommand: Command = {
    id: 'ai-search.open',
    label: 'AI Search: Find Files, Symbols, Content',
    category: 'AI'
};

export interface AISearchQuickPickItem extends QuickPickItem {
    result: AISearchResult;
}

@injectable()
export class AISearchQuickAccessProvider implements QuickAccessProvider {
    static readonly PREFIX = '>';

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(QuickAccessRegistry)
    protected readonly quickAccessRegistry: QuickAccessRegistry;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(AISearchService)
    protected readonly aiSearchService: AISearchService;

    protected lastQuery = '';
    protected lastResults: AISearchResult[] = [];

    @postConstruct()
    protected init(): void {
        this.registerQuickAccessProvider();
    }

    registerQuickAccessProvider(): void {
        this.quickAccessRegistry.registerQuickAccessProvider({
            getInstance: () => this,
            prefix: AISearchQuickAccessProvider.PREFIX,
            placeholder: nls.localize('ai-search/placeholder', 'Search files, symbols, and content (e.g., "find LoginComponent" or "class User")'),
            helpEntries: [{
                description: 'AI-powered search across files, symbols, and content',
                needsEditor: false
            }]
        });
    }

    async getPicks(
        filter: string,
        token: CancellationToken
    ): Promise<QuickPicks> {
        if (!filter || filter.length < 2) {
            return this.getInitialPicks();
        }

        this.lastQuery = filter;

        try {
            const roots = this.workspaceService.tryGetRoots();
            const rootUris = roots.map(r => r.resource.toString());

            if (rootUris.length === 0) {
                return [{
                    type: 'item',
                    label: '$(warning) No workspace open',
                    description: 'Open a folder to search'
                }];
            }

            const results = await this.aiSearchService.search({
                query: filter,
                rootUris,
                limit: 30,
                sources: ['file', 'content', 'symbol', 'recent'],
                fuzzyMatch: true,
                useAI: true,
                includeRecent: true
            }, token);

            if (token.isCancellationRequested) {
                return [];
            }

            this.lastResults = results.results;

            if (results.results.length === 0) {
                const picks: QuickPicks = [{
                    type: 'item',
                    label: '$(search) No results found',
                    description: `for "${filter}"`
                }];

                if (results.suggestions && results.suggestions.length > 0) {
                    picks.push({
                        type: 'separator',
                        label: 'Suggestions'
                    });
                    for (const suggestion of results.suggestions) {
                        picks.push({
                            type: 'item',
                            label: `$(lightbulb) ${suggestion}`
                        });
                    }
                }

                return picks;
            }

            return this.createPicksFromResults(results.results, results.interpretation);
        } catch (error) {
            return [{
                type: 'item',
                label: '$(error) Search failed',
                description: String(error)
            }];
        }
    }

    protected getInitialPicks(): QuickPicks {
        return [
            {
                type: 'separator',
                label: 'Search Tips'
            },
            {
                type: 'item',
                label: '$(file) Find by filename',
                description: 'e.g., "LoginComponent" or "package.json"'
            },
            {
                type: 'item',
                label: '$(symbol-class) Find classes/interfaces',
                description: 'e.g., "class User" or "interface Config"'
            },
            {
                type: 'item',
                label: '$(symbol-function) Find functions',
                description: 'e.g., "function handleSubmit"'
            },
            {
                type: 'item',
                label: '$(search) Search content',
                description: 'e.g., "TODO" or "console.log"'
            }
        ];
    }

    protected createPicksFromResults(results: AISearchResult[], interpretation?: string): QuickPicks {
        const picks: QuickPicks = [];

        // Group by source
        const fileResults = results.filter(r => r.source === 'file');
        const symbolResults = results.filter(r => r.source === 'symbol');
        const contentResults = results.filter(r => r.source === 'content');
        const recentResults = results.filter(r => r.source === 'recent');

        // Show interpretation if available
        if (interpretation) {
            picks.push({
                type: 'separator',
                label: `Searching: ${interpretation}`
            });
        }

        // Recent results first
        if (recentResults.length > 0) {
            picks.push({
                type: 'separator',
                label: 'Recent'
            });
            picks.push(...recentResults.map(r => this.createPick(r)));
        }

        // File results
        if (fileResults.length > 0) {
            picks.push({
                type: 'separator',
                label: `Files (${fileResults.length})`
            });
            picks.push(...fileResults.slice(0, 10).map(r => this.createPick(r)));
        }

        // Symbol results
        if (symbolResults.length > 0) {
            picks.push({
                type: 'separator',
                label: `Symbols (${symbolResults.length})`
            });
            picks.push(...symbolResults.slice(0, 10).map(r => this.createPick(r)));
        }

        // Content results
        if (contentResults.length > 0) {
            picks.push({
                type: 'separator',
                label: `Content Matches (${contentResults.length})`
            });
            picks.push(...contentResults.slice(0, 10).map(r => this.createPick(r)));
        }

        return picks;
    }

    protected createPick(result: AISearchResult): AISearchQuickPickItem {
        let iconClass = '$(file)';

        if (result.source === 'symbol' && result.symbolKind) {
            iconClass = `$(${getSymbolIcon(result.symbolKind)})`;
        } else if (result.source === 'recent') {
            iconClass = '$(history)';
        } else if (result.icon) {
            iconClass = `$(file-${result.icon})`;
        }

        let label = result.name;
        let description = result.path;
        let detail: string | undefined;

        if (result.source === 'symbol') {
            label = `${iconClass} ${result.name}`;
            description = result.symbolKind ? `${result.symbolKind} in ${result.path}` : result.path;
            if (result.line) {
                description += `:${result.line}`;
            }
        } else if (result.source === 'content') {
            label = `${iconClass} ${result.path}:${result.line}`;
            description = result.preview?.substring(0, 80) || '';
            detail = result.preview;
        } else {
            label = `${iconClass} ${result.name}`;
        }

        return {
            type: 'item',
            label,
            description,
            detail,
            ariaLabel: `${result.name} - ${result.path}`,
            result,
            buttons: [{
                iconClass: 'codicon codicon-go-to-file',
                tooltip: 'Open file'
            }]
        };
    }

    async onDidAccept(item: QuickPickItem): Promise<void> {
        const searchItem = item as AISearchQuickPickItem;
        if (!searchItem.result) {
            return;
        }

        const result = searchItem.result;

        try {
            const uri = new URI(result.uri);
            const options: any = {};

            if (result.line !== undefined) {
                options.selection = {
                    start: { line: result.line - 1, character: result.column || 0 },
                    end: { line: result.line - 1, character: result.column || 0 }
                };
            }

            await this.openerService.getOpener(uri).then(opener => opener.open(uri, options));

            // Record selection for learning
            await this.aiSearchService.recordSelection(this.lastQuery, result.uri);
        } catch (error) {
            console.error('Failed to open file:', error);
        }
    }
}
