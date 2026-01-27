// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
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
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser';
import { ApplicationShell, FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { SwarmFrontendService } from './swarm-frontend-service';
import { SWARM_VIEW_WIDGET_ID } from './swarm-view-widget';

export namespace SwarmCommands {
    export const CATEGORY = 'AI Swarm';

    export const NEW_SWARM: Command = {
        id: 'ai-swarm.new',
        category: CATEGORY,
        label: 'New Swarm Session'
    };

    export const SHOW_SWARM_VIEW: Command = {
        id: 'ai-swarm.showView',
        category: CATEGORY,
        label: 'Show Swarm View'
    };

    export const START_SWARM: Command = {
        id: 'ai-swarm.start',
        category: CATEGORY,
        label: 'Start Swarm'
    };

    export const PAUSE_SWARM: Command = {
        id: 'ai-swarm.pause',
        category: CATEGORY,
        label: 'Pause Swarm'
    };

    export const RESUME_SWARM: Command = {
        id: 'ai-swarm.resume',
        category: CATEGORY,
        label: 'Resume Swarm'
    };

    export const STOP_SWARM: Command = {
        id: 'ai-swarm.stop',
        category: CATEGORY,
        label: 'Stop Swarm'
    };

    export const LIST_SESSIONS: Command = {
        id: 'ai-swarm.listSessions',
        category: CATEGORY,
        label: 'List Swarm Sessions'
    };
}

interface SwarmQuickPickItem extends QuickPickItem {
    sessionId: string;
}

@injectable()
export class SwarmCommandContribution implements CommandContribution, FrontendApplicationContribution {

    @inject(SwarmFrontendService)
    protected readonly swarmService: SwarmFrontendService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected currentSessionId: string | undefined;

    onStart(_app: FrontendApplication): void {
        // Initialize on start if needed
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SwarmCommands.NEW_SWARM, {
            execute: async () => {
                const task = await this.quickInputService.input({
                    prompt: 'Enter the task for the swarm to work on',
                    placeHolder: 'e.g., Implement a REST API for user management'
                });

                if (task) {
                    const name = await this.quickInputService.input({
                        prompt: 'Enter a name for this swarm session (optional)',
                        placeHolder: 'e.g., User API Sprint'
                    });

                    const session = await this.swarmService.createSession(task, name);
                    this.currentSessionId = session.id;
                    console.info(`Created swarm session: ${session.id}`);

                    // Show the swarm view
                    await this.shell.activateWidget(SWARM_VIEW_WIDGET_ID);
                }
            }
        });

        commands.registerCommand(SwarmCommands.SHOW_SWARM_VIEW, {
            execute: async () => {
                await this.shell.activateWidget(SWARM_VIEW_WIDGET_ID);
            }
        });

        commands.registerCommand(SwarmCommands.START_SWARM, {
            execute: async () => {
                const sessionId = await this.selectSession();
                if (sessionId) {
                    await this.swarmService.startSwarm(sessionId);
                    console.info(`Started swarm session: ${sessionId}`);
                }
            },
            isEnabled: () => true
        });

        commands.registerCommand(SwarmCommands.PAUSE_SWARM, {
            execute: async () => {
                const sessionId = await this.selectSession();
                if (sessionId) {
                    await this.swarmService.pauseSwarm(sessionId);
                    console.info(`Paused swarm session: ${sessionId}`);
                }
            }
        });

        commands.registerCommand(SwarmCommands.RESUME_SWARM, {
            execute: async () => {
                const sessionId = await this.selectSession();
                if (sessionId) {
                    await this.swarmService.resumeSwarm(sessionId);
                    console.info(`Resumed swarm session: ${sessionId}`);
                }
            }
        });

        commands.registerCommand(SwarmCommands.STOP_SWARM, {
            execute: async () => {
                const sessionId = await this.selectSession();
                if (sessionId) {
                    await this.swarmService.cancelSwarm(sessionId);
                    console.info(`Stopped swarm session: ${sessionId}`);
                }
            }
        });

        commands.registerCommand(SwarmCommands.LIST_SESSIONS, {
            execute: async () => {
                const sessions = await this.swarmService.getSessions();
                if (sessions.length === 0) {
                    console.info('No swarm sessions found');
                    return;
                }

                const items: SwarmQuickPickItem[] = sessions.map(s => ({
                    label: s.name,
                    description: `${s.status} - ${s.originalTask.substring(0, 50)}...`,
                    detail: `ID: ${s.id}`,
                    sessionId: s.id
                }));

                const selected = await this.quickInputService.showQuickPick(items, {
                    placeholder: 'Select a swarm session'
                });

                if (selected) {
                    this.currentSessionId = (selected as SwarmQuickPickItem).sessionId;
                    await this.shell.activateWidget(SWARM_VIEW_WIDGET_ID);
                }
            }
        });
    }

    private async selectSession(): Promise<string | undefined> {
        if (this.currentSessionId) {
            return this.currentSessionId;
        }

        const sessions = await this.swarmService.getSessions();
        if (sessions.length === 0) {
            console.info('No swarm sessions available. Create one first.');
            return undefined;
        }

        const items: SwarmQuickPickItem[] = sessions.map(s => ({
            label: s.name,
            description: s.status,
            sessionId: s.id
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Select a swarm session'
        });

        return selected ? (selected as SwarmQuickPickItem).sessionId : undefined;
    }
}

@injectable()
export class SwarmMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        const AI_SWARM_MENU = [...['ai'], 'swarm'];

        menus.registerSubmenu(AI_SWARM_MENU, 'AI Swarm');

        menus.registerMenuAction(AI_SWARM_MENU, {
            commandId: SwarmCommands.NEW_SWARM.id,
            order: '1'
        });

        menus.registerMenuAction(AI_SWARM_MENU, {
            commandId: SwarmCommands.SHOW_SWARM_VIEW.id,
            order: '2'
        });

        menus.registerMenuAction(AI_SWARM_MENU, {
            commandId: SwarmCommands.LIST_SESSIONS.id,
            order: '3'
        });

        menus.registerMenuAction(AI_SWARM_MENU, {
            commandId: SwarmCommands.START_SWARM.id,
            order: '4'
        });

        menus.registerMenuAction(AI_SWARM_MENU, {
            commandId: SwarmCommands.PAUSE_SWARM.id,
            order: '5'
        });

        menus.registerMenuAction(AI_SWARM_MENU, {
            commandId: SwarmCommands.RESUME_SWARM.id,
            order: '6'
        });

        menus.registerMenuAction(AI_SWARM_MENU, {
            commandId: SwarmCommands.STOP_SWARM.id,
            order: '7'
        });
    }
}
