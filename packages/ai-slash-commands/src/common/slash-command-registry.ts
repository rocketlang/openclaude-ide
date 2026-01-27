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

import { injectable, inject, named, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, ContributionProvider, ILogger } from '@theia/core';
import {
    SlashCommandRegistry,
    SlashCommand,
    SlashCommandContext,
    SlashCommandResult,
    SlashCommandCategory,
    SlashCommandSuggestion,
    ParsedSlashCommand,
    SlashCommandExecutedEvent,
    SlashCommandContribution
} from './slash-command-types';

@injectable()
export class SlashCommandRegistryImpl implements SlashCommandRegistry {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ContributionProvider) @named(SlashCommandContribution)
    protected readonly contributions: ContributionProvider<SlashCommandContribution>;

    protected readonly commands = new Map<string, SlashCommand>();
    protected readonly aliasMap = new Map<string, string>();

    protected readonly onCommandExecutedEmitter = new Emitter<SlashCommandExecutedEvent>();
    readonly onCommandExecuted: Event<SlashCommandExecutedEvent> = this.onCommandExecutedEmitter.event;

    protected readonly onCommandsChangedEmitter = new Emitter<void>();
    readonly onCommandsChanged: Event<void> = this.onCommandsChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        // Register commands from contributions
        for (const contribution of this.contributions.getContributions()) {
            contribution.registerSlashCommands(this);
        }
    }

    registerCommand(command: SlashCommand): void {
        if (this.commands.has(command.id)) {
            this.logger.warn(`Slash command with id '${command.id}' is already registered`);
            return;
        }

        // Check for name conflicts
        const nameLower = command.name.toLowerCase();
        if (this.aliasMap.has(nameLower)) {
            this.logger.warn(`Slash command name '${command.name}' conflicts with existing command`);
            return;
        }

        this.commands.set(command.id, command);
        this.aliasMap.set(nameLower, command.id);

        // Register aliases
        if (command.aliases) {
            for (const alias of command.aliases) {
                const aliasLower = alias.toLowerCase();
                if (!this.aliasMap.has(aliasLower)) {
                    this.aliasMap.set(aliasLower, command.id);
                }
            }
        }

        this.onCommandsChangedEmitter.fire();
    }

    unregisterCommand(commandId: string): void {
        const command = this.commands.get(commandId);
        if (!command) {
            return;
        }

        // Remove from alias map
        this.aliasMap.delete(command.name.toLowerCase());
        if (command.aliases) {
            for (const alias of command.aliases) {
                this.aliasMap.delete(alias.toLowerCase());
            }
        }

        this.commands.delete(commandId);
        this.onCommandsChangedEmitter.fire();
    }

    getCommand(nameOrAlias: string): SlashCommand | undefined {
        const commandId = this.aliasMap.get(nameOrAlias.toLowerCase());
        return commandId ? this.commands.get(commandId) : undefined;
    }

    getCommandById(id: string): SlashCommand | undefined {
        return this.commands.get(id);
    }

    getAllCommands(): SlashCommand[] {
        return Array.from(this.commands.values());
    }

    getCommandsByCategory(category: SlashCommandCategory): SlashCommand[] {
        return this.getAllCommands().filter(cmd => cmd.category === category);
    }

    getEnabledCommands(): SlashCommand[] {
        return this.getAllCommands().filter(cmd =>
            !cmd.isEnabled || cmd.isEnabled()
        );
    }

    async executeCommand(context: SlashCommandContext): Promise<SlashCommandResult> {
        const command = this.getCommand(context.commandName);

        if (!command) {
            return {
                success: false,
                error: `Unknown command: /${context.commandName}. Type /help to see available commands.`
            };
        }

        if (command.isEnabled && !command.isEnabled()) {
            return {
                success: false,
                error: `Command /${context.commandName} is currently disabled.`
            };
        }

        try {
            const result = await command.execute(context);

            // Fire execution event
            this.onCommandExecutedEmitter.fire({
                command,
                context,
                result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error executing slash command /${context.commandName}:`, error);

            return {
                success: false,
                error: `Failed to execute /${context.commandName}: ${errorMessage}`
            };
        }
    }

    parseInput(input: string, sessionId: string): ParsedSlashCommand {
        const trimmed = input.trim();

        // Check if it starts with /
        if (!trimmed.startsWith('/')) {
            return {
                isCommand: false,
                args: [],
                rawArgs: '',
                isComplete: false
            };
        }

        // Parse the command and arguments
        const withoutSlash = trimmed.slice(1);
        const parts = withoutSlash.split(/\s+/);
        const commandName = parts[0] || '';
        const args = parts.slice(1);
        const rawArgs = withoutSlash.slice(commandName.length).trim();

        // Check if command exists
        const command = this.getCommand(commandName);

        if (!commandName) {
            return {
                isCommand: true,
                commandName: '',
                args: [],
                rawArgs: '',
                isComplete: false
            };
        }

        if (!command) {
            return {
                isCommand: true,
                commandName,
                args,
                rawArgs,
                isComplete: false,
                error: `Unknown command: /${commandName}`
            };
        }

        return {
            isCommand: true,
            command,
            commandName,
            args,
            rawArgs,
            isComplete: true
        };
    }

    async getSuggestions(input: string, cursorPosition: number): Promise<SlashCommandSuggestion[]> {
        const beforeCursor = input.slice(0, cursorPosition);
        const trimmed = beforeCursor.trim();

        // Check if we're at the start of a slash command
        if (!trimmed.startsWith('/')) {
            // If cursor is at start or after whitespace, suggest starting a command
            if (cursorPosition === 0 || /\s$/.test(beforeCursor)) {
                return [];
            }
            return [];
        }

        const withoutSlash = trimmed.slice(1);
        const parts = withoutSlash.split(/\s+/);
        const commandPart = parts[0] || '';

        // If we're still typing the command name
        if (parts.length === 1) {
            return this.getCommandSuggestions(commandPart, beforeCursor);
        }

        // If we have a command, suggest arguments
        const command = this.getCommand(commandPart);
        if (command && command.arguments) {
            return this.getArgumentSuggestions(command, parts.slice(1), beforeCursor);
        }

        return [];
    }

    protected getCommandSuggestions(partial: string, fullInput: string): SlashCommandSuggestion[] {
        const partialLower = partial.toLowerCase();
        const suggestions: SlashCommandSuggestion[] = [];

        for (const command of this.getEnabledCommands()) {
            if (!command.isVisible || command.isVisible()) {
                let score = 0;

                // Check main name
                const nameLower = command.name.toLowerCase();
                if (nameLower.startsWith(partialLower)) {
                    score = 100 - (command.name.length - partial.length);
                } else if (nameLower.includes(partialLower)) {
                    score = 50 - (command.name.length - partial.length);
                }

                // Check aliases
                if (score === 0 && command.aliases) {
                    for (const alias of command.aliases) {
                        const aliasLower = alias.toLowerCase();
                        if (aliasLower.startsWith(partialLower)) {
                            score = 80 - (alias.length - partial.length);
                            break;
                        }
                    }
                }

                if (score > 0 || partial === '') {
                    suggestions.push({
                        command,
                        score: score || 50,
                        replaceRange: {
                            start: fullInput.lastIndexOf('/'),
                            end: fullInput.length
                        },
                        insertText: `/${command.name}`
                    });
                }
            }
        }

        return suggestions.sort((a, b) => b.score - a.score);
    }

    protected async getArgumentSuggestions(
        command: SlashCommand,
        existingArgs: string[],
        fullInput: string
    ): Promise<SlashCommandSuggestion[]> {
        if (!command.arguments) {
            return [];
        }

        const argIndex = existingArgs.length - 1;
        const currentArg = existingArgs[argIndex] || '';
        const argDef = command.arguments[argIndex];

        if (!argDef || !argDef.values) {
            return [];
        }

        // Get possible values
        let possibleValues: string[];
        if (typeof argDef.values === 'function') {
            possibleValues = await argDef.values();
        } else {
            possibleValues = argDef.values;
        }

        // Filter by current input
        const currentLower = currentArg.toLowerCase();
        const suggestions: SlashCommandSuggestion[] = [];

        for (const value of possibleValues) {
            const valueLower = value.toLowerCase();
            let score = 0;

            if (valueLower.startsWith(currentLower)) {
                score = 100 - (value.length - currentArg.length);
            } else if (valueLower.includes(currentLower)) {
                score = 50;
            }

            if (score > 0 || currentArg === '') {
                // Find the position of the current argument
                const lastSpaceIndex = fullInput.lastIndexOf(' ');
                suggestions.push({
                    command,
                    score: score || 50,
                    replaceRange: {
                        start: lastSpaceIndex + 1,
                        end: fullInput.length
                    },
                    insertText: value,
                    isArgumentSuggestion: true,
                    argument: argDef
                });
            }
        }

        return suggestions.sort((a, b) => b.score - a.score);
    }
}
