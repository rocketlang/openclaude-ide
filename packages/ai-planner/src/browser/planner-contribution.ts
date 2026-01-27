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
    MenuModelRegistry
} from '@theia/core';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { PlannerCommands } from './planner-commands';
import { PlanWidget } from './plan-widget';

export const AI_PLANNER_MENU = [...['view'], 'ai-planner'];

@injectable()
export class PlannerContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(PlannerCommands.SHOW_PLANNER, {
            execute: () => this.showPlanner()
        });

        registry.registerCommand(PlannerCommands.NEW_PLAN, {
            execute: () => this.showPlanner()
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(AI_PLANNER_MENU, 'AI Planner');

        registry.registerMenuAction(AI_PLANNER_MENU, {
            commandId: PlannerCommands.SHOW_PLANNER.id,
            order: '1'
        });

        registry.registerMenuAction(AI_PLANNER_MENU, {
            commandId: PlannerCommands.NEW_PLAN.id,
            order: '2'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: PlannerCommands.SHOW_PLANNER.id,
            keybinding: 'ctrlcmd+shift+p'
        });
    }

    protected async showPlanner(): Promise<void> {
        const widget = await this.shell.revealWidget(PlanWidget.ID);
        if (!widget) {
            const existing = this.shell.getWidgets('right').find(w => w.id === PlanWidget.ID);
            if (existing) {
                this.shell.activateWidget(PlanWidget.ID);
            }
        }
    }
}
