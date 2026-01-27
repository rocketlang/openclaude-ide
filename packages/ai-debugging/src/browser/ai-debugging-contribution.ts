// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// AI Debugging Contribution - Commands, Menus, Keybindings
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core/lib/common';
import {
    KeybindingContribution,
    KeybindingRegistry,
    ApplicationShell,
    WidgetManager
} from '@theia/core/lib/browser';
import { AIDebuggingWidget } from './ai-debugging-widget';

export namespace AIDebuggingCommands {
    export const OPEN_DEBUGGER: Command = {
        id: 'ai-debugging.open',
        label: 'AI Debugger: Open Panel',
        category: 'AI'
    };

    export const ANALYZE_ERROR: Command = {
        id: 'ai-debugging.analyzeError',
        label: 'AI Debugger: Analyze Error',
        category: 'AI'
    };

    export const START_PROFILE: Command = {
        id: 'ai-debugging.startProfile',
        label: 'AI Debugger: Start Profiling',
        category: 'AI'
    };

    export const STOP_PROFILE: Command = {
        id: 'ai-debugging.stopProfile',
        label: 'AI Debugger: Stop Profiling',
        category: 'AI'
    };
}

export namespace AIDebuggingMenus {
    export const AI_DEBUGGING = [...['ai'], 'debugging'];
}

@injectable()
export class AIDebuggingContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AIDebuggingCommands.OPEN_DEBUGGER, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget(AIDebuggingWidget.ID);
                await this.shell.addWidget(widget, { area: 'right' });
                this.shell.activateWidget(widget.id);
            }
        });

        registry.registerCommand(AIDebuggingCommands.ANALYZE_ERROR, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget(AIDebuggingWidget.ID);
                await this.shell.addWidget(widget, { area: 'right' });
                this.shell.activateWidget(widget.id);
            }
        });

        registry.registerCommand(AIDebuggingCommands.START_PROFILE, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget(AIDebuggingWidget.ID);
                await this.shell.addWidget(widget, { area: 'right' });
                this.shell.activateWidget(widget.id);
            }
        });

        registry.registerCommand(AIDebuggingCommands.STOP_PROFILE, {
            execute: async () => {
                // Profile stopping handled by widget
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(AIDebuggingMenus.AI_DEBUGGING, 'AI Debugger');

        registry.registerMenuAction(AIDebuggingMenus.AI_DEBUGGING, {
            commandId: AIDebuggingCommands.OPEN_DEBUGGER.id,
            order: '1'
        });

        registry.registerMenuAction(AIDebuggingMenus.AI_DEBUGGING, {
            commandId: AIDebuggingCommands.ANALYZE_ERROR.id,
            order: '2'
        });

        registry.registerMenuAction(AIDebuggingMenus.AI_DEBUGGING, {
            commandId: AIDebuggingCommands.START_PROFILE.id,
            order: '3'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: AIDebuggingCommands.OPEN_DEBUGGER.id,
            keybinding: 'ctrlcmd+shift+d'
        });
    }
}
