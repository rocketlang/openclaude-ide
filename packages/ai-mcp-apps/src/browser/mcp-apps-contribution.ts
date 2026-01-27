// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// MCP Apps Contribution - Commands, Menus, Keybindings
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
    WidgetManager,
    FrontendApplication,
    FrontendApplicationContribution
} from '@theia/core/lib/browser';
import { MCPAppsWidget } from './mcp-apps-widget';
import { MCPAppsService } from '../common';
import { ConsentServiceImpl } from './consent-service';
import { ConsentDialog, ConsentDialogProps } from './consent-dialog';

export namespace MCPAppsCommands {
    export const OPEN_MCP_APPS: Command = {
        id: 'mcp-apps.open',
        label: 'MCP Apps: Open Apps Panel',
        category: 'AI'
    };

    export const LAUNCH_APP: Command = {
        id: 'mcp-apps.launch',
        label: 'MCP Apps: Launch App',
        category: 'AI'
    };

    export const CLOSE_APP: Command = {
        id: 'mcp-apps.close',
        label: 'MCP Apps: Close App',
        category: 'AI'
    };

    export const MANAGE_CONSENTS: Command = {
        id: 'mcp-apps.manage-consents',
        label: 'MCP Apps: Manage Permissions',
        category: 'AI'
    };

    export const REVOKE_ALL_CONSENTS: Command = {
        id: 'mcp-apps.revoke-all-consents',
        label: 'MCP Apps: Revoke All Permissions',
        category: 'AI'
    };
}

export namespace MCPAppsMenus {
    export const MCP_APPS = [...['ai'], 'mcp-apps'];
}

@injectable()
export class MCPAppsContribution implements CommandContribution, MenuContribution, KeybindingContribution, FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(MCPAppsService)
    protected readonly appsService: MCPAppsService;

    @inject(ConsentServiceImpl)
    protected readonly consentService: ConsentServiceImpl;

    onStart(app: FrontendApplication): void {
        // Listen for consent requests and show dialog
        this.consentService.onConsentRequest(async request => {
            const instance = this.appsService.getInstances().find(i => i.app.id === request.appId);
            const appName = instance?.app.name || request.appId;

            // Create and show consent dialog
            const dialogProps: ConsentDialogProps = {
                title: 'Permission Required',
                request,
                appName,
                consentService: this.consentService
            };

            const dialog = new ConsentDialog(dialogProps);
            await dialog.open();
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(MCPAppsCommands.OPEN_MCP_APPS, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget(MCPAppsWidget.ID);
                await this.shell.addWidget(widget, { area: 'right' });
                this.shell.activateWidget(widget.id);
            }
        });

        registry.registerCommand(MCPAppsCommands.LAUNCH_APP, {
            execute: async (appId: string) => {
                if (appId) {
                    await this.appsService.launchApp(appId);
                }
            },
            isEnabled: (appId: string) => !!appId
        });

        registry.registerCommand(MCPAppsCommands.CLOSE_APP, {
            execute: (instanceId: string) => {
                if (instanceId) {
                    this.appsService.closeApp(instanceId);
                }
            },
            isEnabled: (instanceId: string) => !!instanceId
        });

        registry.registerCommand(MCPAppsCommands.MANAGE_CONSENTS, {
            execute: async () => {
                // Open MCP Apps panel with consents tab
                const widget = await this.widgetManager.getOrCreateWidget(MCPAppsWidget.ID);
                await this.shell.addWidget(widget, { area: 'right' });
                this.shell.activateWidget(widget.id);
            }
        });

        registry.registerCommand(MCPAppsCommands.REVOKE_ALL_CONSENTS, {
            execute: () => {
                this.consentService.clearAllConsents();
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(MCPAppsMenus.MCP_APPS, 'MCP Apps');

        registry.registerMenuAction(MCPAppsMenus.MCP_APPS, {
            commandId: MCPAppsCommands.OPEN_MCP_APPS.id,
            order: '1'
        });

        registry.registerMenuAction(MCPAppsMenus.MCP_APPS, {
            commandId: MCPAppsCommands.MANAGE_CONSENTS.id,
            order: '2'
        });

        registry.registerMenuAction(MCPAppsMenus.MCP_APPS, {
            commandId: MCPAppsCommands.REVOKE_ALL_CONSENTS.id,
            order: '3'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: MCPAppsCommands.OPEN_MCP_APPS.id,
            keybinding: 'ctrlcmd+shift+m'
        });
    }
}
