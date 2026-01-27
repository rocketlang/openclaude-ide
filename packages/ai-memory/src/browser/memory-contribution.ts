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
import { MemoryCommands } from './memory-commands';
import { MemoryWidget } from './memory-widget';
import { MemoryIntegrationService } from './memory-integration';

export const AI_MEMORY_MENU = ['ai-memory-menu'];
export const AI_MEMORY_MENU_MAIN = [...AI_MEMORY_MENU, 'main'];

@injectable()
export class MemoryContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(MemoryIntegrationService)
    protected readonly memoryIntegration: MemoryIntegrationService;

    protected learningEnabled = true;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(MemoryCommands.SHOW_MEMORY_PANEL, {
            execute: () => this.showMemoryPanel()
        });

        registry.registerCommand(MemoryCommands.NEW_SESSION, {
            execute: async () => {
                const sessionId = await this.memoryIntegration.newSession();
                this.messageService.info(`New AI memory session started: ${sessionId.substring(0, 8)}...`);
            }
        });

        registry.registerCommand(MemoryCommands.EXPORT_MEMORY, {
            execute: async () => {
                try {
                    const data = await this.memoryIntegration.exportMemory();
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ai-memory-export-${Date.now()}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    this.messageService.info('AI memory exported successfully');
                } catch (e) {
                    this.messageService.error(`Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
            }
        });

        registry.registerCommand(MemoryCommands.IMPORT_MEMORY, {
            execute: async () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                        try {
                            const text = await file.text();
                            await this.memoryIntegration.importMemory(text);
                            this.messageService.info('AI memory imported successfully');
                        } catch (err) {
                            this.messageService.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        }
                    }
                };
                input.click();
            }
        });

        registry.registerCommand(MemoryCommands.CLEAR_MEMORY, {
            execute: async () => {
                // In a real implementation, use a dialog service
                if (confirm('Are you sure you want to clear all AI memory? This cannot be undone.')) {
                    await this.memoryIntegration.clearAllMemory();
                    this.messageService.info('AI memory cleared');
                }
            }
        });

        registry.registerCommand(MemoryCommands.LEARN_FROM_FILE, {
            execute: async () => {
                await this.memoryIntegration.learnFromCurrentEditor();
                this.messageService.info('Learning from current file...');
            }
        });

        registry.registerCommand(MemoryCommands.SHOW_MEMORY_STATS, {
            execute: async () => {
                const stats = await this.memoryIntegration.getStats();
                const message = `Memory: ${stats.memory.totalEntries} entries (${this.formatBytes(stats.memory.totalSize)}) | ` +
                    `Cache: ${stats.cache.entries} entries, ${(stats.cache.hitRate * 100).toFixed(1)}% hit rate | ` +
                    `Session: ${stats.recentConversations} conversations`;
                this.messageService.info(message);
            }
        });

        registry.registerCommand(MemoryCommands.TOGGLE_MEMORY_LEARNING, {
            execute: () => {
                this.learningEnabled = !this.learningEnabled;
                this.messageService.info(`AI memory learning ${this.learningEnabled ? 'enabled' : 'disabled'}`);
            },
            isToggled: () => this.learningEnabled
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        // Register AI Memory submenu
        registry.registerSubmenu(AI_MEMORY_MENU, 'AI Memory');

        registry.registerMenuAction(AI_MEMORY_MENU_MAIN, {
            commandId: MemoryCommands.SHOW_MEMORY_PANEL.id,
            order: '1'
        });

        registry.registerMenuAction(AI_MEMORY_MENU_MAIN, {
            commandId: MemoryCommands.SHOW_MEMORY_STATS.id,
            order: '2'
        });

        registry.registerMenuAction(AI_MEMORY_MENU_MAIN, {
            commandId: MemoryCommands.NEW_SESSION.id,
            order: '3'
        });

        registry.registerMenuAction(AI_MEMORY_MENU_MAIN, {
            commandId: MemoryCommands.LEARN_FROM_FILE.id,
            order: '4'
        });

        registry.registerMenuAction(AI_MEMORY_MENU_MAIN, {
            commandId: MemoryCommands.TOGGLE_MEMORY_LEARNING.id,
            order: '5'
        });

        registry.registerMenuAction(AI_MEMORY_MENU_MAIN, {
            commandId: MemoryCommands.EXPORT_MEMORY.id,
            order: '6'
        });

        registry.registerMenuAction(AI_MEMORY_MENU_MAIN, {
            commandId: MemoryCommands.IMPORT_MEMORY.id,
            order: '7'
        });

        registry.registerMenuAction(AI_MEMORY_MENU_MAIN, {
            commandId: MemoryCommands.CLEAR_MEMORY.id,
            order: '8'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: MemoryCommands.SHOW_MEMORY_PANEL.id,
            keybinding: 'ctrlcmd+shift+m'
        });

        registry.registerKeybinding({
            command: MemoryCommands.SHOW_MEMORY_STATS.id,
            keybinding: 'ctrlcmd+alt+m'
        });

        registry.registerKeybinding({
            command: MemoryCommands.NEW_SESSION.id,
            keybinding: 'ctrlcmd+shift+n'
        });
    }

    protected async showMemoryPanel(): Promise<void> {
        const widget = await this.shell.revealWidget(MemoryWidget.ID);
        if (widget) {
            this.shell.activateWidget(MemoryWidget.ID);
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
}
