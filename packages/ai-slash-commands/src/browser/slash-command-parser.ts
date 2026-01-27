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
import { Emitter, Event } from '@theia/core';
import {
    SlashCommandRegistry,
    SlashCommandContext,
    SlashCommandResult,
    ParsedSlashCommand,
    SlashCommandSuggestion
} from '../common';

/**
 * Service for parsing and executing slash commands in chat input
 */
export const SlashCommandParser = Symbol('SlashCommandParser');
export interface SlashCommandParser {
    /**
     * Check if input starts with a slash command
     */
    isSlashCommand(input: string): boolean;

    /**
     * Parse input to extract command information
     */
    parse(input: string, sessionId: string): ParsedSlashCommand;

    /**
     * Execute a slash command from input
     */
    execute(input: string, sessionId: string, metadata?: Record<string, unknown>): Promise<SlashCommandResult>;

    /**
     * Get autocomplete suggestions for the given input
     */
    getSuggestions(input: string, cursorPosition: number): Promise<SlashCommandSuggestion[]>;

    /**
     * Event fired when a command is about to execute
     */
    readonly onWillExecute: Event<{ input: string; sessionId: string }>;

    /**
     * Event fired after a command executes
     */
    readonly onDidExecute: Event<{ input: string; result: SlashCommandResult }>;
}

@injectable()
export class SlashCommandParserImpl implements SlashCommandParser {

    @inject(SlashCommandRegistry)
    protected readonly registry: SlashCommandRegistry;

    protected readonly onWillExecuteEmitter = new Emitter<{ input: string; sessionId: string }>();
    readonly onWillExecute = this.onWillExecuteEmitter.event;

    protected readonly onDidExecuteEmitter = new Emitter<{ input: string; result: SlashCommandResult }>();
    readonly onDidExecute = this.onDidExecuteEmitter.event;

    isSlashCommand(input: string): boolean {
        const trimmed = input.trim();
        return trimmed.startsWith('/') && trimmed.length > 1;
    }

    parse(input: string, sessionId: string): ParsedSlashCommand {
        return this.registry.parseInput(input, sessionId);
    }

    async execute(
        input: string,
        sessionId: string,
        metadata?: Record<string, unknown>
    ): Promise<SlashCommandResult> {
        const parsed = this.parse(input, sessionId);

        if (!parsed.isCommand) {
            return {
                success: false,
                error: 'Input is not a slash command'
            };
        }

        if (!parsed.command) {
            return {
                success: false,
                error: parsed.error || `Unknown command: /${parsed.commandName}`
            };
        }

        this.onWillExecuteEmitter.fire({ input, sessionId });

        const context: SlashCommandContext = {
            sessionId,
            fullInput: input,
            commandName: parsed.commandName!,
            args: parsed.args,
            rawArgs: parsed.rawArgs,
            metadata
        };

        const result = await this.registry.executeCommand(context);

        this.onDidExecuteEmitter.fire({ input, result });

        return result;
    }

    async getSuggestions(input: string, cursorPosition: number): Promise<SlashCommandSuggestion[]> {
        return this.registry.getSuggestions(input, cursorPosition);
    }
}

/**
 * Monaco completion provider for slash commands
 */
export const SlashCommandCompletionProvider = Symbol('SlashCommandCompletionProvider');
export interface SlashCommandCompletionProvider {
    /**
     * Provide completions for Monaco editor
     */
    provideCompletionItems(
        input: string,
        position: number
    ): Promise<SlashCommandCompletionItem[]>;
}

export interface SlashCommandCompletionItem {
    label: string;
    kind: 'command' | 'argument';
    detail: string;
    documentation?: string;
    insertText: string;
    range: { startColumn: number; endColumn: number };
    sortText: string;
    command?: SlashCommandSuggestion['command'];
}

@injectable()
export class SlashCommandCompletionProviderImpl implements SlashCommandCompletionProvider {

    @inject(SlashCommandRegistry)
    protected readonly registry: SlashCommandRegistry;

    async provideCompletionItems(
        input: string,
        position: number
    ): Promise<SlashCommandCompletionItem[]> {
        const suggestions = await this.registry.getSuggestions(input, position);

        return suggestions.map((suggestion, index) => ({
            label: suggestion.isArgumentSuggestion
                ? suggestion.insertText
                : `/${suggestion.command.name}`,
            kind: suggestion.isArgumentSuggestion ? 'argument' : 'command',
            detail: suggestion.isArgumentSuggestion
                ? suggestion.argument?.description || ''
                : suggestion.command.description,
            documentation: suggestion.command.detailedDescription,
            insertText: suggestion.insertText,
            range: {
                startColumn: suggestion.replaceRange.start + 1,
                endColumn: suggestion.replaceRange.end + 1
            },
            sortText: String(index).padStart(4, '0'),
            command: suggestion.command
        }));
    }
}
