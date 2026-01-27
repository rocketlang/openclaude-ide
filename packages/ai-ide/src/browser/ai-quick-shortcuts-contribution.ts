// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// Quick Keyboard Shortcuts for AI Features & Theme Toggle
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
    MAIN_MENU_BAR
} from '@theia/core/lib/common';
import {
    KeybindingContribution,
    KeybindingRegistry,
    ApplicationShell
} from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { AI_CHAT_NEW_CHAT_WINDOW_COMMAND, AI_CHAT_SHOW_CHATS_COMMAND } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { AIChatContribution } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';

export namespace AIQuickCommands {
    export const TOGGLE_THEME: Command = {
        id: 'ai.toggleTheme',
        label: 'Toggle Light/Dark Theme',
        category: 'View'
    };

    export const FOCUS_CHAT: Command = {
        id: 'ai.focusChat',
        label: 'Focus AI Chat',
        category: 'AI'
    };

    export const NEW_CHAT: Command = {
        id: 'ai.newChat',
        label: 'New AI Chat Session',
        category: 'AI'
    };

    export const TOGGLE_AI_PANEL: Command = {
        id: 'ai.togglePanel',
        label: 'Toggle AI Panel',
        category: 'AI'
    };

    export const EXPLAIN_CODE: Command = {
        id: 'ai.explainCode',
        label: 'Explain Selected Code',
        category: 'AI'
    };

    export const FIX_CODE: Command = {
        id: 'ai.fixCode',
        label: 'Fix Selected Code',
        category: 'AI'
    };

    export const AI_HELP: Command = {
        id: 'ai.help',
        label: 'AI Help & Shortcuts',
        category: 'Help'
    };
}

export namespace AIMenus {
    export const AI_MENU = [...MAIN_MENU_BAR, '7_ai'];
}

@injectable()
export class AIQuickShortcutsContribution implements CommandContribution, KeybindingContribution, MenuContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(AIChatContribution)
    protected readonly chatContribution: AIChatContribution;

    registerCommands(registry: CommandRegistry): void {
        // Toggle Theme
        registry.registerCommand(AIQuickCommands.TOGGLE_THEME, {
            execute: () => {
                const currentTheme = this.themeService.getCurrentTheme();
                const isDark = currentTheme.type === 'dark' || currentTheme.type === 'hc';
                const newThemeType = isDark ? 'light' : 'dark';
                const themes = this.themeService.getThemes();
                const targetTheme = themes.find((t: { type: string; id: string }) =>
                    (newThemeType === 'dark' && (t.type === 'dark' || t.id.toLowerCase().includes('dark'))) ||
                    (newThemeType === 'light' && (t.type === 'light' || t.id.toLowerCase().includes('light')))
                );
                if (targetTheme) {
                    this.themeService.setCurrentTheme(targetTheme.id);
                }
            }
        });

        // Focus Chat
        registry.registerCommand(AIQuickCommands.FOCUS_CHAT, {
            execute: async () => {
                await this.chatContribution.openView({ activate: true });
            }
        });

        // New Chat
        registry.registerCommand(AIQuickCommands.NEW_CHAT, {
            execute: async () => {
                await registry.executeCommand(AI_CHAT_NEW_CHAT_WINDOW_COMMAND.id);
            }
        });

        // Toggle AI Panel
        registry.registerCommand(AIQuickCommands.TOGGLE_AI_PANEL, {
            execute: async () => {
                await registry.executeCommand(AI_CHAT_SHOW_CHATS_COMMAND.id);
            }
        });

        // Explain Code
        registry.registerCommand(AIQuickCommands.EXPLAIN_CODE, {
            execute: async () => {
                await this.chatContribution.openView({ activate: true });
            }
        });

        // Fix Code
        registry.registerCommand(AIQuickCommands.FIX_CODE, {
            execute: async () => {
                await this.chatContribution.openView({ activate: true });
            }
        });

        // AI Help
        registry.registerCommand(AIQuickCommands.AI_HELP, {
            execute: () => {
                console.log(`
OpenClaude IDE - AI Keyboard Shortcuts
======================================

Chat Commands:
  Ctrl+Shift+A      - Focus AI Chat
  Ctrl+Shift+N      - New Chat Session
  Ctrl+Alt+A        - Toggle AI Panel

Code Commands:
  Ctrl+Shift+E      - Explain Selected Code
  Ctrl+Shift+F      - Fix Selected Code

View Commands:
  Ctrl+Shift+T      - Toggle Light/Dark Theme

MCP Apps:
  Ctrl+Shift+M      - Open MCP Apps Panel

Tips:
  - Use @file to reference files in chat
  - Use #codebase to search your codebase
  - Use /commands for slash commands
`);
            }
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        // Theme toggle
        registry.registerKeybinding({
            command: AIQuickCommands.TOGGLE_THEME.id,
            keybinding: 'ctrlcmd+shift+t'
        });

        // Focus chat
        registry.registerKeybinding({
            command: AIQuickCommands.FOCUS_CHAT.id,
            keybinding: 'ctrlcmd+shift+a'
        });

        // New chat
        registry.registerKeybinding({
            command: AIQuickCommands.NEW_CHAT.id,
            keybinding: 'ctrlcmd+shift+n'
        });

        // Toggle AI panel
        registry.registerKeybinding({
            command: AIQuickCommands.TOGGLE_AI_PANEL.id,
            keybinding: 'ctrlcmd+alt+a'
        });

        // Explain code
        registry.registerKeybinding({
            command: AIQuickCommands.EXPLAIN_CODE.id,
            keybinding: 'ctrlcmd+shift+e',
            when: 'editorTextFocus'
        });

        // Fix code
        registry.registerKeybinding({
            command: AIQuickCommands.FIX_CODE.id,
            keybinding: 'ctrlcmd+shift+f',
            when: 'editorTextFocus'
        });

        // AI Help
        registry.registerKeybinding({
            command: AIQuickCommands.AI_HELP.id,
            keybinding: 'f1',
            when: 'chatInputFocus'
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        // Register AI menu
        registry.registerSubmenu(AIMenus.AI_MENU, 'AI');

        registry.registerMenuAction(AIMenus.AI_MENU, {
            commandId: AIQuickCommands.FOCUS_CHAT.id,
            order: '1'
        });

        registry.registerMenuAction(AIMenus.AI_MENU, {
            commandId: AIQuickCommands.NEW_CHAT.id,
            order: '2'
        });

        registry.registerMenuAction(AIMenus.AI_MENU, {
            commandId: AIQuickCommands.TOGGLE_AI_PANEL.id,
            order: '3'
        });

        registry.registerMenuAction(AIMenus.AI_MENU, {
            commandId: AIQuickCommands.EXPLAIN_CODE.id,
            order: '4'
        });

        registry.registerMenuAction(AIMenus.AI_MENU, {
            commandId: AIQuickCommands.FIX_CODE.id,
            order: '5'
        });

        registry.registerMenuAction(AIMenus.AI_MENU, {
            commandId: AIQuickCommands.TOGGLE_THEME.id,
            order: '6'
        });

        registry.registerMenuAction(AIMenus.AI_MENU, {
            commandId: AIQuickCommands.AI_HELP.id,
            order: '7'
        });
    }
}
