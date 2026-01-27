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

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
    MessageService
} from '@theia/core';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { EditorManager } from '@theia/editor/lib/browser';
import { CodebaseIndexService } from '../common';
import { IndexCommands } from './index-commands';
import { SemanticSearchWidget } from './semantic-search-widget';

export const AI_INDEX_MENU = [...['view'], 'ai-index'];

@injectable()
export class IndexContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CodebaseIndexService)
    protected readonly indexService: CodebaseIndexService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(IndexCommands.SHOW_SEARCH, {
            execute: () => this.showSearchWidget()
        });

        registry.registerCommand(IndexCommands.INDEX_WORKSPACE, {
            execute: async () => {
                this.messageService.info('Starting workspace indexing...');
                try {
                    await this.indexService.indexWorkspace();
                    const stats = this.indexService.getStats();
                    this.messageService.info(`Indexing complete: ${stats.totalFiles} files, ${stats.totalChunks} chunks`);
                } catch (error) {
                    this.messageService.error(`Indexing failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        });

        registry.registerCommand(IndexCommands.INDEX_CURRENT_FILE, {
            execute: async () => {
                const editor = this.editorManager.currentEditor;
                if (editor) {
                    const uri = editor.editor.uri;
                    const filePath = uri.path.toString();
                    try {
                        await this.indexService.indexFile(filePath);
                        this.messageService.info(`Indexed: ${filePath}`);
                    } catch (error) {
                        this.messageService.error(`Failed to index file: ${error instanceof Error ? error.message : String(error)}`);
                    }
                } else {
                    this.messageService.warn('No file is currently open');
                }
            },
            isEnabled: () => !!this.editorManager.currentEditor
        });

        registry.registerCommand(IndexCommands.CLEAR_INDEX, {
            execute: async () => {
                try {
                    await this.indexService.clearIndex();
                    this.messageService.info('Codebase index cleared');
                } catch (error) {
                    this.messageService.error(`Failed to clear index: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        });

        registry.registerCommand(IndexCommands.SHOW_INDEX_STATS, {
            execute: () => {
                const stats = this.indexService.getStats();
                const languages = Array.from(stats.languages.entries())
                    .map(([lang, count]) => `${lang}: ${count}`)
                    .join(', ');

                this.messageService.info(
                    `Index Stats:\n` +
                    `Files: ${stats.totalFiles}\n` +
                    `Chunks: ${stats.totalChunks}\n` +
                    `Size: ${this.formatBytes(stats.indexSizeBytes)}\n` +
                    `Languages: ${languages || 'None'}`
                );
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(AI_INDEX_MENU, 'AI Index');

        registry.registerMenuAction(AI_INDEX_MENU, {
            commandId: IndexCommands.SHOW_SEARCH.id,
            order: '1'
        });

        registry.registerMenuAction(AI_INDEX_MENU, {
            commandId: IndexCommands.INDEX_WORKSPACE.id,
            order: '2'
        });

        registry.registerMenuAction(AI_INDEX_MENU, {
            commandId: IndexCommands.INDEX_CURRENT_FILE.id,
            order: '3'
        });

        registry.registerMenuAction(AI_INDEX_MENU, {
            commandId: IndexCommands.SHOW_INDEX_STATS.id,
            order: '4'
        });

        registry.registerMenuAction(AI_INDEX_MENU, {
            commandId: IndexCommands.CLEAR_INDEX.id,
            order: '5'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: IndexCommands.SHOW_SEARCH.id,
            keybinding: 'ctrlcmd+shift+s'
        });

        registry.registerKeybinding({
            command: IndexCommands.INDEX_WORKSPACE.id,
            keybinding: 'ctrlcmd+shift+i'
        });
    }

    protected async showSearchWidget(): Promise<void> {
        const widget = await this.shell.revealWidget(SemanticSearchWidget.ID);
        if (!widget) {
            // Widget doesn't exist, create it
            const existing = this.shell.getWidgets('bottom').find(w => w.id === SemanticSearchWidget.ID);
            if (existing) {
                this.shell.activateWidget(SemanticSearchWidget.ID);
            }
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
