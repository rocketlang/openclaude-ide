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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser/status-bar/status-bar';
import { CommandService } from '@theia/core';
import { CodebaseIndexService, IndexingPhase } from '../common';
import { IndexCommands } from './index-commands';

const INDEX_STATUS_BAR_ID = 'ai-codebase-index-status';

/**
 * Status bar contribution showing codebase index status
 */
@injectable()
export class IndexStatusBar {

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(CodebaseIndexService)
    protected readonly indexService: CodebaseIndexService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @postConstruct()
    protected init(): void {
        // Set initial status
        this.updateStatusBar();

        // Subscribe to progress updates
        this.indexService.onProgress(() => {
            this.updateStatusBar();
        });
    }

    protected updateStatusBar(): void {
        const progress = this.indexService.getProgress();
        const stats = this.indexService.getStats();

        let entry: StatusBarEntry;

        switch (progress.phase) {
            case IndexingPhase.Scanning:
            case IndexingPhase.Parsing:
            case IndexingPhase.Chunking:
            case IndexingPhase.Embedding:
            case IndexingPhase.Storing:
                entry = {
                    text: `$(sync~spin) Indexing ${progress.percentComplete}%`,
                    tooltip: `${this.getPhaseLabel(progress.phase)}\n${progress.filesProcessed}/${progress.totalFiles} files`,
                    alignment: StatusBarAlignment.RIGHT,
                    priority: 100,
                    command: IndexCommands.SHOW_SEARCH.id
                };
                break;

            case IndexingPhase.Error:
                entry = {
                    text: '$(error) Index Error',
                    tooltip: progress.error || 'Indexing failed',
                    alignment: StatusBarAlignment.RIGHT,
                    priority: 100,
                    command: IndexCommands.SHOW_SEARCH.id,
                    color: 'var(--theia-errorForeground)'
                };
                break;

            case IndexingPhase.Complete:
            case IndexingPhase.Idle:
            default:
                if (stats.totalFiles > 0) {
                    entry = {
                        text: `$(search) ${stats.totalFiles} indexed`,
                        tooltip: `Codebase Index\n${stats.totalFiles} files\n${stats.totalChunks} chunks\nClick to search`,
                        alignment: StatusBarAlignment.RIGHT,
                        priority: 100,
                        command: IndexCommands.SHOW_SEARCH.id
                    };
                } else {
                    entry = {
                        text: '$(search) Not indexed',
                        tooltip: 'Click to index workspace',
                        alignment: StatusBarAlignment.RIGHT,
                        priority: 100,
                        command: IndexCommands.INDEX_WORKSPACE.id
                    };
                }
                break;
        }

        this.statusBar.setElement(INDEX_STATUS_BAR_ID, entry);
    }

    protected getPhaseLabel(phase: IndexingPhase): string {
        switch (phase) {
            case IndexingPhase.Scanning: return 'Scanning files...';
            case IndexingPhase.Parsing: return 'Parsing files...';
            case IndexingPhase.Chunking: return 'Generating chunks...';
            case IndexingPhase.Embedding: return 'Computing embeddings...';
            case IndexingPhase.Storing: return 'Saving index...';
            default: return '';
        }
    }
}
