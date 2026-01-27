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
import { ChangeTrackerService } from '../common';
import { DiffCommands } from './diff-commands';
import { DiffPreviewWidget } from './diff-preview-widget';

export const AI_DIFF_MENU = [...['view'], 'ai-diff'];

@injectable()
export class DiffContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ChangeTrackerService)
    protected readonly changeTracker: ChangeTrackerService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(DiffCommands.SHOW_DIFF_PREVIEW, {
            execute: () => this.showDiffPreview()
        });

        registry.registerCommand(DiffCommands.ACCEPT_ALL_CHANGES, {
            execute: () => {
                const changes = this.changeTracker.getPendingChanges();
                for (const change of changes) {
                    this.changeTracker.acceptAll(change.diff.id);
                }
                this.messageService.info(`Accepted ${changes.length} change(s)`);
            },
            isEnabled: () => this.changeTracker.getPendingCount() > 0
        });

        registry.registerCommand(DiffCommands.REJECT_ALL_CHANGES, {
            execute: () => {
                const changes = this.changeTracker.getPendingChanges();
                for (const change of changes) {
                    this.changeTracker.rejectAll(change.diff.id);
                }
                this.messageService.info(`Rejected ${changes.length} change(s)`);
            },
            isEnabled: () => this.changeTracker.getPendingCount() > 0
        });

        registry.registerCommand(DiffCommands.APPLY_CHANGES, {
            execute: async () => {
                const changes = this.changeTracker.getPendingChanges();
                let applied = 0;
                for (const change of changes) {
                    const hasAccepted = change.diff.hunks.some(h => h.status === 'accepted');
                    if (hasAccepted) {
                        try {
                            await this.changeTracker.applyChanges(change.diff.id);
                            applied++;
                        } catch (error) {
                            console.error('Failed to apply changes:', error);
                        }
                    }
                }
                if (applied > 0) {
                    this.messageService.info(`Applied ${applied} change(s)`);
                } else {
                    this.messageService.warn('No accepted changes to apply');
                }
            },
            isEnabled: () => this.changeTracker.getPendingCount() > 0
        });

        registry.registerCommand(DiffCommands.CLEAR_ALL_CHANGES, {
            execute: () => {
                this.changeTracker.clearAll();
                this.messageService.info('Cleared all pending changes');
            },
            isEnabled: () => this.changeTracker.getPendingCount() > 0
        });

        // Navigation and per-hunk commands would be enhanced with state tracking
        registry.registerCommand(DiffCommands.NEXT_HUNK, {
            execute: () => this.navigateHunk('next'),
            isEnabled: () => this.changeTracker.getPendingCount() > 0
        });

        registry.registerCommand(DiffCommands.PREVIOUS_HUNK, {
            execute: () => this.navigateHunk('previous'),
            isEnabled: () => this.changeTracker.getPendingCount() > 0
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(AI_DIFF_MENU, 'AI Changes');

        registry.registerMenuAction(AI_DIFF_MENU, {
            commandId: DiffCommands.SHOW_DIFF_PREVIEW.id,
            order: '1'
        });

        registry.registerMenuAction(AI_DIFF_MENU, {
            commandId: DiffCommands.ACCEPT_ALL_CHANGES.id,
            order: '2'
        });

        registry.registerMenuAction(AI_DIFF_MENU, {
            commandId: DiffCommands.REJECT_ALL_CHANGES.id,
            order: '3'
        });

        registry.registerMenuAction(AI_DIFF_MENU, {
            commandId: DiffCommands.APPLY_CHANGES.id,
            order: '4'
        });

        registry.registerMenuAction(AI_DIFF_MENU, {
            commandId: DiffCommands.CLEAR_ALL_CHANGES.id,
            order: '5'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: DiffCommands.SHOW_DIFF_PREVIEW.id,
            keybinding: 'ctrlcmd+shift+d'
        });

        registry.registerKeybinding({
            command: DiffCommands.NEXT_HUNK.id,
            keybinding: 'alt+]'
        });

        registry.registerKeybinding({
            command: DiffCommands.PREVIOUS_HUNK.id,
            keybinding: 'alt+['
        });

        registry.registerKeybinding({
            command: DiffCommands.ACCEPT_HUNK.id,
            keybinding: 'ctrlcmd+shift+y'
        });

        registry.registerKeybinding({
            command: DiffCommands.REJECT_HUNK.id,
            keybinding: 'ctrlcmd+shift+n'
        });
    }

    protected async showDiffPreview(): Promise<void> {
        const widget = await this.shell.revealWidget(DiffPreviewWidget.ID);
        if (!widget) {
            const existing = this.shell.getWidgets('right').find(w => w.id === DiffPreviewWidget.ID);
            if (existing) {
                this.shell.activateWidget(DiffPreviewWidget.ID);
            }
        }
    }

    protected navigateHunk(_direction: 'next' | 'previous'): void {
        // Enhanced navigation would require tracking current position
        this.showDiffPreview();
    }
}
