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

import { injectable } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core';
import { AbstractViewContribution, codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { ProviderSettingsWidget, PROVIDER_SETTINGS_WIDGET_ID } from './provider-settings-widget';

export const AI_PROVIDER_SETTINGS_COMMAND = Command.toLocalizedCommand({
    id: 'ai.provider.settings.open',
    label: 'AI Provider Settings',
    iconClass: codicon('settings-gear')
}, 'theia/ai/providerSettings');

export const AI_PROVIDER_TOGGLE_COMMAND = Command.toLocalizedCommand({
    id: 'ai.provider.toggle',
    label: 'Toggle AI Provider'
}, 'theia/ai/toggleProvider');

@injectable()
export class ProviderSettingsContribution extends AbstractViewContribution<ProviderSettingsWidget>
    implements CommandContribution, MenuContribution {

    constructor() {
        super({
            widgetId: PROVIDER_SETTINGS_WIDGET_ID,
            widgetName: nls.localize('theia/ai/providerSettings', 'AI Provider Settings'),
            defaultWidgetOptions: {
                area: 'right'
            },
            toggleCommandId: AI_PROVIDER_SETTINGS_COMMAND.id
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);

        commands.registerCommand(AI_PROVIDER_SETTINGS_COMMAND, {
            execute: () => this.openView({ activate: true, reveal: true })
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
    }
}
