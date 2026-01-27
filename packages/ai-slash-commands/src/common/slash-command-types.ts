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

import { Event } from '@theia/core';

/**
 * Represents the context in which a slash command is executed
 */
export interface SlashCommandContext {
    /** The current chat session ID */
    sessionId: string;
    /** The full input text including the command */
    fullInput: string;
    /** The command name without the leading slash */
    commandName: string;
    /** Arguments passed to the command */
    args: string[];
    /** Raw argument string after the command */
    rawArgs: string;
    /** Current editor file path if available */
    currentFile?: string;
    /** Current workspace root if available */
    workspaceRoot?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Result of executing a slash command
 */
export interface SlashCommandResult {
    /** Whether the command executed successfully */
    success: boolean;
    /** Message to display to the user */
    message?: string;
    /** If the result should be sent as a chat message */
    sendAsMessage?: boolean;
    /** If the command produces content to insert */
    content?: string;
    /** If the command should clear the input */
    clearInput?: boolean;
    /** If the command opens a UI element */
    openedWidget?: string;
    /** Error message if failed */
    error?: string;
    /** Additional data from the command */
    data?: unknown;
}

/**
 * Argument definition for a slash command
 */
export interface SlashCommandArgument {
    /** Argument name */
    name: string;
    /** Description of the argument */
    description: string;
    /** Whether the argument is required */
    required: boolean;
    /** Default value if not provided */
    defaultValue?: string;
    /** Possible values for autocomplete */
    values?: string[] | (() => Promise<string[]>);
}

/**
 * Definition of a slash command
 */
export interface SlashCommand {
    /** Unique identifier for the command */
    id: string;
    /** The command name (without leading slash) */
    name: string;
    /** Short description shown in autocomplete */
    description: string;
    /** Detailed help text */
    detailedDescription?: string;
    /** Usage examples */
    examples?: string[];
    /** Alternative names for the command */
    aliases?: string[];
    /** Command arguments */
    arguments?: SlashCommandArgument[];
    /** Category for grouping commands */
    category?: SlashCommandCategory;
    /** Icon class for display */
    iconClass?: string;
    /** Whether the command is enabled */
    isEnabled?: () => boolean;
    /** Whether the command is visible */
    isVisible?: () => boolean;
    /** Execute the command */
    execute(context: SlashCommandContext): Promise<SlashCommandResult>;
}

/**
 * Categories for organizing slash commands
 */
export enum SlashCommandCategory {
    /** General utility commands */
    General = 'general',
    /** Chat and conversation management */
    Chat = 'chat',
    /** AI model and provider settings */
    Model = 'model',
    /** Code-related commands */
    Code = 'code',
    /** File and workspace commands */
    File = 'file',
    /** Settings and configuration */
    Settings = 'settings',
    /** Debug and development */
    Debug = 'debug',
    /** Custom user commands */
    Custom = 'custom'
}

/**
 * Autocomplete suggestion for slash commands
 */
export interface SlashCommandSuggestion {
    /** The command being suggested */
    command: SlashCommand;
    /** Match score for sorting (0-100) */
    score: number;
    /** Range in input to replace */
    replaceRange: { start: number; end: number };
    /** Text to insert when selected */
    insertText: string;
    /** Whether this is an argument suggestion */
    isArgumentSuggestion?: boolean;
    /** Argument being suggested if applicable */
    argument?: SlashCommandArgument;
}

/**
 * Parsed slash command from user input
 */
export interface ParsedSlashCommand {
    /** Whether the input is a valid slash command */
    isCommand: boolean;
    /** The command if found */
    command?: SlashCommand;
    /** The command name as typed */
    commandName?: string;
    /** Parsed arguments */
    args: string[];
    /** Raw argument string */
    rawArgs: string;
    /** Whether the command is complete (not partial) */
    isComplete: boolean;
    /** Error message if parsing failed */
    error?: string;
}

/**
 * Event fired when a slash command is executed
 */
export interface SlashCommandExecutedEvent {
    /** The command that was executed */
    command: SlashCommand;
    /** The execution context */
    context: SlashCommandContext;
    /** The result of execution */
    result: SlashCommandResult;
    /** Timestamp of execution */
    timestamp: number;
}

/**
 * Service for managing slash commands
 */
export const SlashCommandRegistry = Symbol('SlashCommandRegistry');
export interface SlashCommandRegistry {
    /**
     * Register a new slash command
     */
    registerCommand(command: SlashCommand): void;

    /**
     * Unregister a command by ID
     */
    unregisterCommand(commandId: string): void;

    /**
     * Get a command by name or alias
     */
    getCommand(nameOrAlias: string): SlashCommand | undefined;

    /**
     * Get a command by ID
     */
    getCommandById(id: string): SlashCommand | undefined;

    /**
     * Get all registered commands
     */
    getAllCommands(): SlashCommand[];

    /**
     * Get commands by category
     */
    getCommandsByCategory(category: SlashCommandCategory): SlashCommand[];

    /**
     * Get enabled commands
     */
    getEnabledCommands(): SlashCommand[];

    /**
     * Execute a slash command
     */
    executeCommand(context: SlashCommandContext): Promise<SlashCommandResult>;

    /**
     * Parse input to detect slash command
     */
    parseInput(input: string, sessionId: string): ParsedSlashCommand;

    /**
     * Get autocomplete suggestions for input
     */
    getSuggestions(input: string, cursorPosition: number): Promise<SlashCommandSuggestion[]>;

    /**
     * Event fired when a command is executed
     */
    readonly onCommandExecuted: Event<SlashCommandExecutedEvent>;

    /**
     * Event fired when commands are registered/unregistered
     */
    readonly onCommandsChanged: Event<void>;
}

/**
 * Contribution interface for registering slash commands
 */
export const SlashCommandContribution = Symbol('SlashCommandContribution');
export interface SlashCommandContribution {
    /**
     * Register slash commands
     */
    registerSlashCommands(registry: SlashCommandRegistry): void;
}
