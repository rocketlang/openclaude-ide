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
} from '@theia/core/lib/common';
import {
    CommonMenus,
    QuickInputService,
    KeybindingContribution,
    KeybindingRegistry,
    ApplicationShell
} from '@theia/core/lib/browser';
import { AgentCommands } from './agent-commands';
import { AgentWidget } from './agent-widget';
import { AutonomousAgentService } from '../common';

@injectable()
export class AgentContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(AutonomousAgentService)
    protected readonly agentService: AutonomousAgentService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AgentCommands.OPEN_AGENT, {
            execute: async () => {
                const widget = await this.shell.getWidgets('right').find(w => w.id === AgentWidget.ID)
                    || await this.shell.getWidgets('bottom').find(w => w.id === AgentWidget.ID);
                if (widget) {
                    this.shell.activateWidget(widget.id);
                }
            }
        });

        registry.registerCommand(AgentCommands.START_TASK, {
            execute: async () => {
                const goal = await this.quickInputService.input({
                    prompt: 'What do you want the agent to do?',
                    placeHolder: 'Describe the task...'
                });

                if (goal) {
                    await this.agentService.startTask(goal);
                    // Open widget to show task
                    registry.executeCommand(AgentCommands.OPEN_AGENT.id);
                }
            }
        });

        registry.registerCommand(AgentCommands.TOGGLE_AUTONOMOUS, {
            execute: () => {
                const config = this.agentService.getConfig();
                this.agentService.updateConfig({ autonomousMode: !config.autonomousMode });
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(
            [...CommonMenus.VIEW, 'ai-agent'],
            'AI Agent'
        );

        registry.registerMenuAction([...CommonMenus.VIEW, 'ai-agent'], {
            commandId: AgentCommands.OPEN_AGENT.id,
            order: '1'
        });

        registry.registerMenuAction([...CommonMenus.VIEW, 'ai-agent'], {
            commandId: AgentCommands.START_TASK.id,
            order: '2'
        });

        registry.registerMenuAction([...CommonMenus.VIEW, 'ai-agent'], {
            commandId: AgentCommands.TOGGLE_AUTONOMOUS.id,
            order: '3'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: AgentCommands.OPEN_AGENT.id,
            keybinding: 'ctrlcmd+shift+a'
        });

        registry.registerKeybinding({
            command: AgentCommands.START_TASK.id,
            keybinding: 'ctrlcmd+alt+a'
        });
    }
}
