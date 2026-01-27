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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core';
import { KeybindingContribution, KeybindingRegistry, CommonMenus } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { SlashCommandRegistry, SlashCommand, SlashCommandCategory } from '../common';
import { SlashCommandParser } from './slash-command-parser';

export const SLASH_COMMAND_CATEGORY = 'AI Chat';
export const SLASH_COMMAND_CATEGORY_KEY = nls.localize('theia/ai-slash-commands/category', 'AI Chat');

/**
 * Commands for slash command system
 */
export namespace SlashCommands {
    export const SHOW_COMMANDS = Command.toLocalizedCommand({
        id: 'ai.slash.showCommands',
        label: 'Show Slash Commands',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/showCommands', SLASH_COMMAND_CATEGORY_KEY);

    export const EXECUTE_HELP = Command.toLocalizedCommand({
        id: 'ai.slash.help',
        label: 'AI: Show Help',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/help', SLASH_COMMAND_CATEGORY_KEY);

    export const EXECUTE_CLEAR = Command.toLocalizedCommand({
        id: 'ai.slash.clear',
        label: 'AI: Clear Chat',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/clear', SLASH_COMMAND_CATEGORY_KEY);

    export const EXECUTE_CONFIG = Command.toLocalizedCommand({
        id: 'ai.slash.config',
        label: 'AI: Open Settings',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/config', SLASH_COMMAND_CATEGORY_KEY);

    export const EXECUTE_MODEL = Command.toLocalizedCommand({
        id: 'ai.slash.model',
        label: 'AI: Switch Model',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/model', SLASH_COMMAND_CATEGORY_KEY);

    export const EXECUTE_COST = Command.toLocalizedCommand({
        id: 'ai.slash.cost',
        label: 'AI: Show Usage Stats',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/cost', SLASH_COMMAND_CATEGORY_KEY);

    export const EXECUTE_NEW = Command.toLocalizedCommand({
        id: 'ai.slash.new',
        label: 'AI: New Chat Session',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/new', SLASH_COMMAND_CATEGORY_KEY);

    export const EXECUTE_RESET = Command.toLocalizedCommand({
        id: 'ai.slash.reset',
        label: 'AI: Reset Conversation',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/reset', SLASH_COMMAND_CATEGORY_KEY);

    export const EXECUTE_EXPORT = Command.toLocalizedCommand({
        id: 'ai.slash.export',
        label: 'AI: Export Chat',
        category: SLASH_COMMAND_CATEGORY
    }, 'theia/ai-slash-commands/export', SLASH_COMMAND_CATEGORY_KEY);
}

/**
 * Contribution for registering slash commands in command palette
 */
@injectable()
export class SlashCommandContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(SlashCommandRegistry)
    protected readonly registry: SlashCommandRegistry;

    @inject(SlashCommandParser)
    protected readonly parser: SlashCommandParser;

    protected registeredCommands: Map<string, Command> = new Map();

    @postConstruct()
    protected init(): void {
        // Listen for command changes to update registrations
        this.registry.onCommandsChanged(() => {
            // Commands are registered at startup, dynamic updates would need CommandRegistry re-binding
        });
    }

    registerCommands(commands: CommandRegistry): void {
        // Register the show commands action
        commands.registerCommand(SlashCommands.SHOW_COMMANDS, {
            execute: () => this.showCommandPalette(commands)
        });

        // Register direct command palette entries for common slash commands
        this.registerSlashCommandAsCommand(commands, 'slash.help', SlashCommands.EXECUTE_HELP);
        this.registerSlashCommandAsCommand(commands, 'slash.clear', SlashCommands.EXECUTE_CLEAR);
        this.registerSlashCommandAsCommand(commands, 'slash.config', SlashCommands.EXECUTE_CONFIG);
        this.registerSlashCommandAsCommand(commands, 'slash.model', SlashCommands.EXECUTE_MODEL);
        this.registerSlashCommandAsCommand(commands, 'slash.cost', SlashCommands.EXECUTE_COST);
        this.registerSlashCommandAsCommand(commands, 'slash.new', SlashCommands.EXECUTE_NEW);
        this.registerSlashCommandAsCommand(commands, 'slash.reset', SlashCommands.EXECUTE_RESET);
        this.registerSlashCommandAsCommand(commands, 'slash.export', SlashCommands.EXECUTE_EXPORT);

        // Register all slash commands dynamically
        for (const slashCommand of this.registry.getAllCommands()) {
            this.registerSlashCommandDynamic(commands, slashCommand);
        }
    }

    protected registerSlashCommandAsCommand(
        commands: CommandRegistry,
        slashCommandId: string,
        command: Command
    ): void {
        commands.registerCommand(command, {
            execute: async () => {
                const slashCommand = this.registry.getCommandById(slashCommandId);
                if (slashCommand) {
                    await this.executeSlashCommand(slashCommand);
                }
            },
            isEnabled: () => {
                const slashCommand = this.registry.getCommandById(slashCommandId);
                return slashCommand ? (!slashCommand.isEnabled || slashCommand.isEnabled()) : false;
            }
        });
    }

    protected registerSlashCommandDynamic(
        commands: CommandRegistry,
        slashCommand: SlashCommand
    ): void {
        // Create a command ID based on the slash command
        const commandId = `ai.slash.dynamic.${slashCommand.id}`;

        // Skip if already registered via explicit registration
        if (this.registeredCommands.has(commandId)) {
            return;
        }

        const command: Command = {
            id: commandId,
            label: `AI: /${slashCommand.name} - ${slashCommand.description}`,
            category: this.getCategoryLabel(slashCommand.category)
        };

        commands.registerCommand(command, {
            execute: async () => this.executeSlashCommand(slashCommand),
            isEnabled: () => !slashCommand.isEnabled || slashCommand.isEnabled(),
            isVisible: () => !slashCommand.isVisible || slashCommand.isVisible()
        });

        this.registeredCommands.set(commandId, command);
    }

    protected async executeSlashCommand(slashCommand: SlashCommand): Promise<void> {
        const context = {
            sessionId: 'current',
            fullInput: `/${slashCommand.name}`,
            commandName: slashCommand.name,
            args: [],
            rawArgs: ''
        };

        const result = await slashCommand.execute(context);

        if (!result.success && result.error) {
            console.error('Slash command failed:', result.error);
        }
    }

    protected getCategoryLabel(category?: SlashCommandCategory): string {
        if (!category) {
            return SLASH_COMMAND_CATEGORY;
        }

        const labels: Record<SlashCommandCategory, string> = {
            [SlashCommandCategory.General]: 'AI: General',
            [SlashCommandCategory.Chat]: 'AI: Chat',
            [SlashCommandCategory.Model]: 'AI: Model',
            [SlashCommandCategory.Code]: 'AI: Code',
            [SlashCommandCategory.File]: 'AI: File',
            [SlashCommandCategory.Settings]: 'AI: Settings',
            [SlashCommandCategory.Debug]: 'AI: Debug',
            [SlashCommandCategory.Custom]: 'AI: Custom'
        };

        return labels[category];
    }

    protected showCommandPalette(commands: CommandRegistry): void {
        // Trigger quick open with AI commands filtered
        commands.executeCommand('workbench.action.quickOpen', '>AI: /');
    }

    registerMenus(menus: MenuModelRegistry): void {
        // Add AI Chat submenu to View menu
        menus.registerSubmenu(
            [...CommonMenus.VIEW, 'ai-chat'],
            nls.localize('theia/ai-slash-commands/aiChat', 'AI Chat')
        );

        // Add common slash commands to the submenu
        menus.registerMenuAction([...CommonMenus.VIEW, 'ai-chat'], {
            commandId: SlashCommands.EXECUTE_NEW.id,
            order: '1'
        });

        menus.registerMenuAction([...CommonMenus.VIEW, 'ai-chat'], {
            commandId: SlashCommands.EXECUTE_CLEAR.id,
            order: '2'
        });

        menus.registerMenuAction([...CommonMenus.VIEW, 'ai-chat'], {
            commandId: SlashCommands.EXECUTE_CONFIG.id,
            order: '3'
        });

        menus.registerMenuAction([...CommonMenus.VIEW, 'ai-chat'], {
            commandId: SlashCommands.EXECUTE_HELP.id,
            order: '4'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        // Register keybinding for showing slash commands
        keybindings.registerKeybinding({
            command: SlashCommands.SHOW_COMMANDS.id,
            keybinding: 'ctrlcmd+shift+/',
            when: 'chatInputFocused'
        });

        // New chat session
        keybindings.registerKeybinding({
            command: SlashCommands.EXECUTE_NEW.id,
            keybinding: 'ctrlcmd+shift+n',
            when: 'chatFocused'
        });

        // Clear chat
        keybindings.registerKeybinding({
            command: SlashCommands.EXECUTE_CLEAR.id,
            keybinding: 'ctrlcmd+shift+l',
            when: 'chatFocused'
        });
    }
}
