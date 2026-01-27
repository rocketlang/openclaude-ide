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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, nls } from '@theia/core';
import { AbstractViewContribution } from '@theia/core/lib/browser';
import { FrontendApplicationContribution, Widget } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { MultiEditWidget, MULTI_EDIT_WIDGET_ID } from './multi-edit-widget';
import { MultiEditService, EditSession } from '../common';

export namespace MultiEditCommands {
    const MULTI_EDIT_CATEGORY = 'AI Multi-Edit';

    export const OPEN_MULTI_EDIT_WIDGET: Command = {
        id: 'ai.multiEdit.openWidget',
        label: nls.localize('theia/ai/multiEdit/open', 'Open Multi-Edit Review'),
        category: MULTI_EDIT_CATEGORY
    };

    export const APPLY_SESSION: Command = {
        id: 'ai.multiEdit.apply',
        label: nls.localize('theia/ai/multiEdit/apply', 'Apply All Changes'),
        category: MULTI_EDIT_CATEGORY
    };

    export const CANCEL_SESSION: Command = {
        id: 'ai.multiEdit.cancel',
        label: nls.localize('theia/ai/multiEdit/cancel', 'Cancel Session'),
        category: MULTI_EDIT_CATEGORY
    };

    export const REVERT_SESSION: Command = {
        id: 'ai.multiEdit.revert',
        label: nls.localize('theia/ai/multiEdit/revert', 'Revert All Changes'),
        category: MULTI_EDIT_CATEGORY
    };

    export const EXPAND_ALL: Command = {
        id: 'ai.multiEdit.expandAll',
        iconClass: 'codicon codicon-expand-all'
    };

    export const COLLAPSE_ALL: Command = {
        id: 'ai.multiEdit.collapseAll',
        iconClass: 'codicon codicon-collapse-all'
    };
}

@injectable()
export class MultiEditContribution extends AbstractViewContribution<MultiEditWidget>
    implements CommandContribution, MenuContribution, TabBarToolbarContribution, FrontendApplicationContribution {

    @inject(MultiEditService)
    protected readonly multiEditService: MultiEditService;

    constructor() {
        super({
            widgetId: MULTI_EDIT_WIDGET_ID,
            widgetName: nls.localize('theia/ai/multiEdit', 'Multi-File Edit Review'),
            defaultWidgetOptions: {
                area: 'right',
                rank: 300
            },
            toggleCommandId: MultiEditCommands.OPEN_MULTI_EDIT_WIDGET.id
        });
    }

    async initializeLayout(): Promise<void> {
        // Widget is not opened by default - only when needed
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);

        registry.registerCommand(MultiEditCommands.APPLY_SESSION, {
            execute: () => this.applyCurrentSession(),
            isEnabled: () => this.hasActiveSession()
        });

        registry.registerCommand(MultiEditCommands.CANCEL_SESSION, {
            execute: () => this.cancelCurrentSession(),
            isEnabled: () => this.hasActiveSession()
        });

        registry.registerCommand(MultiEditCommands.REVERT_SESSION, {
            execute: () => this.revertCurrentSession(),
            isEnabled: () => this.canRevert()
        });

        registry.registerCommand(MultiEditCommands.EXPAND_ALL, {
            execute: (widget: Widget) => {
                if (widget instanceof MultiEditWidget) {
                    // Expand all operations
                }
            },
            isEnabled: (widget: Widget) => widget instanceof MultiEditWidget,
            isVisible: (widget: Widget) => widget instanceof MultiEditWidget
        });

        registry.registerCommand(MultiEditCommands.COLLAPSE_ALL, {
            execute: (widget: Widget) => {
                if (widget instanceof MultiEditWidget) {
                    // Collapse all operations
                }
            },
            isEnabled: (widget: Widget) => widget instanceof MultiEditWidget,
            isVisible: (widget: Widget) => widget instanceof MultiEditWidget
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: MultiEditCommands.EXPAND_ALL.id,
            command: MultiEditCommands.EXPAND_ALL.id,
            tooltip: nls.localize('theia/ai/multiEdit/expandAll', 'Expand All'),
            priority: 0
        });

        toolbar.registerItem({
            id: MultiEditCommands.COLLAPSE_ALL.id,
            command: MultiEditCommands.COLLAPSE_ALL.id,
            tooltip: nls.localize('theia/ai/multiEdit/collapseAll', 'Collapse All'),
            priority: 1
        });
    }

    /**
     * Open the widget and display a session
     */
    async openWithSession(session: EditSession): Promise<void> {
        const widget = await this.openView({ reveal: true });
        if (widget) {
            widget.setSession(session);
        }
    }

    protected hasActiveSession(): boolean {
        return this.multiEditService.getActiveSessions().length > 0;
    }

    protected canRevert(): boolean {
        const sessions = this.multiEditService.getActiveSessions();
        return sessions.some(s => s.status === 'completed' || s.status === 'partially_completed');
    }

    protected async applyCurrentSession(): Promise<void> {
        const sessions = this.multiEditService.getActiveSessions();
        if (sessions.length > 0) {
            await this.multiEditService.apply(sessions[0].id, {
                createBackup: true,
                saveAfterApply: true
            });
        }
    }

    protected async cancelCurrentSession(): Promise<void> {
        const sessions = this.multiEditService.getActiveSessions();
        if (sessions.length > 0) {
            this.multiEditService.cancel(sessions[0].id);
        }
    }

    protected async revertCurrentSession(): Promise<void> {
        const sessions = this.multiEditService.getActiveSessions();
        const completedSession = sessions.find(s => s.status === 'completed' || s.status === 'partially_completed');
        if (completedSession) {
            await this.multiEditService.revert(completedSession.id);
        }
    }
}
