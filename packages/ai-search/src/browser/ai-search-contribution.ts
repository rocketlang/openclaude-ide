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
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { QuickInputService } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { AISearchQuickAccessProvider } from './ai-search-quick-access';

export namespace AISearchCommands {
    export const OPEN_SEARCH: Command = {
        id: 'ai-search.open',
        label: 'AI Search: Find Files, Symbols, Content',
        category: 'AI'
    };

    export const SEARCH_FILES: Command = {
        id: 'ai-search.searchFiles',
        label: 'AI Search: Find File by Name',
        category: 'AI'
    };

    export const SEARCH_SYMBOLS: Command = {
        id: 'ai-search.searchSymbols',
        label: 'AI Search: Go to Symbol',
        category: 'AI'
    };

    export const SEARCH_CONTENT: Command = {
        id: 'ai-search.searchContent',
        label: 'AI Search: Find in Files',
        category: 'AI'
    };
}

@injectable()
export class AISearchContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AISearchCommands.OPEN_SEARCH, {
            execute: () => this.openSearch()
        });

        registry.registerCommand(AISearchCommands.SEARCH_FILES, {
            execute: () => this.openSearch('find file ')
        });

        registry.registerCommand(AISearchCommands.SEARCH_SYMBOLS, {
            execute: () => this.openSearch('class ')
        });

        registry.registerCommand(AISearchCommands.SEARCH_CONTENT, {
            execute: () => this.openSearch('search ')
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: AISearchCommands.OPEN_SEARCH.id,
            label: 'AI Search...',
            order: '1'
        });

        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: AISearchCommands.OPEN_SEARCH.id,
            label: 'AI Search...',
            order: '0'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        // Cmd+K / Ctrl+K for AI Search (main shortcut)
        keybindings.registerKeybinding({
            command: AISearchCommands.OPEN_SEARCH.id,
            keybinding: 'ctrlcmd+k'
        });

        // Alternative: Ctrl+Shift+P style
        keybindings.registerKeybinding({
            command: AISearchCommands.OPEN_SEARCH.id,
            keybinding: 'ctrlcmd+shift+f'
        });

        // Go to file
        keybindings.registerKeybinding({
            command: AISearchCommands.SEARCH_FILES.id,
            keybinding: 'ctrlcmd+p'
        });

        // Go to symbol
        keybindings.registerKeybinding({
            command: AISearchCommands.SEARCH_SYMBOLS.id,
            keybinding: 'ctrlcmd+shift+o'
        });
    }

    protected openSearch(initialValue?: string): void {
        this.quickInputService.open(AISearchQuickAccessProvider.PREFIX + (initialValue || ''));
    }
}
