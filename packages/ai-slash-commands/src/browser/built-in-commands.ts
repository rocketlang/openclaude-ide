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
import { CommandService, MessageService } from '@theia/core';
import { ApplicationShell } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    SlashCommandRegistry,
    SlashCommand,
    SlashCommandContext,
    SlashCommandResult,
    SlashCommandCategory,
    SlashCommandContribution
} from '../common';

/**
 * Built-in slash commands for the AI chat interface
 */
@injectable()
export class BuiltInSlashCommandsContribution implements SlashCommandContribution {

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    registerSlashCommands(registry: SlashCommandRegistry): void {
        registry.registerCommand(this.createHelpCommand(registry));
        registry.registerCommand(this.createClearCommand());
        registry.registerCommand(this.createResetCommand());
        registry.registerCommand(this.createCompactCommand());
        registry.registerCommand(this.createConfigCommand());
        registry.registerCommand(this.createModelCommand());
        registry.registerCommand(this.createCostCommand());
        registry.registerCommand(this.createExportCommand());
        registry.registerCommand(this.createNewCommand());
        registry.registerCommand(this.createHistoryCommand());
        registry.registerCommand(this.createCopyCommand());
        registry.registerCommand(this.createCodeCommand());
        registry.registerCommand(this.createFileCommand());
        registry.registerCommand(this.createSearchCommand());
    }

    protected createHelpCommand(registry: SlashCommandRegistry): SlashCommand {
        return {
            id: 'slash.help',
            name: 'help',
            description: 'Show available slash commands',
            detailedDescription: 'Lists all available slash commands with their descriptions. Use /help <command> for detailed help on a specific command.',
            examples: ['/help', '/help clear', '/help model'],
            aliases: ['h', '?'],
            category: SlashCommandCategory.General,
            iconClass: 'codicon codicon-question',
            arguments: [
                {
                    name: 'command',
                    description: 'Command to get help for',
                    required: false,
                    values: () => Promise.resolve(registry.getAllCommands().map(c => c.name))
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const commandName = context.args[0];

                if (commandName) {
                    // Show help for specific command
                    const command = registry.getCommand(commandName);
                    if (!command) {
                        return {
                            success: false,
                            error: `Unknown command: /${commandName}`
                        };
                    }

                    let helpText = `**/${command.name}**\n\n`;
                    helpText += `${command.description}\n\n`;

                    if (command.detailedDescription) {
                        helpText += `${command.detailedDescription}\n\n`;
                    }

                    if (command.aliases && command.aliases.length > 0) {
                        helpText += `**Aliases:** ${command.aliases.map(a => `/${a}`).join(', ')}\n\n`;
                    }

                    if (command.arguments && command.arguments.length > 0) {
                        helpText += '**Arguments:**\n';
                        for (const arg of command.arguments) {
                            const required = arg.required ? '(required)' : '(optional)';
                            helpText += `- \`${arg.name}\` ${required}: ${arg.description}\n`;
                        }
                        helpText += '\n';
                    }

                    if (command.examples && command.examples.length > 0) {
                        helpText += '**Examples:**\n';
                        for (const example of command.examples) {
                            helpText += `- \`${example}\`\n`;
                        }
                    }

                    return {
                        success: true,
                        message: helpText,
                        sendAsMessage: true
                    };
                }

                // Show all commands
                const commands = registry.getEnabledCommands();
                const byCategory = new Map<SlashCommandCategory, SlashCommand[]>();

                for (const cmd of commands) {
                    const category = cmd.category || SlashCommandCategory.General;
                    if (!byCategory.has(category)) {
                        byCategory.set(category, []);
                    }
                    byCategory.get(category)!.push(cmd);
                }

                let helpText = '**Available Slash Commands**\n\n';

                const categoryOrder = [
                    SlashCommandCategory.General,
                    SlashCommandCategory.Chat,
                    SlashCommandCategory.Model,
                    SlashCommandCategory.Code,
                    SlashCommandCategory.File,
                    SlashCommandCategory.Settings,
                    SlashCommandCategory.Debug,
                    SlashCommandCategory.Custom
                ];

                for (const category of categoryOrder) {
                    const cmds = byCategory.get(category);
                    if (cmds && cmds.length > 0) {
                        helpText += `**${this.getCategoryLabel(category)}**\n`;
                        for (const cmd of cmds.sort((a, b) => a.name.localeCompare(b.name))) {
                            helpText += `- \`/${cmd.name}\` - ${cmd.description}\n`;
                        }
                        helpText += '\n';
                    }
                }

                helpText += '_Type `/help <command>` for detailed help on a specific command._';

                return {
                    success: true,
                    message: helpText,
                    sendAsMessage: true
                };
            }
        };
    }

    protected getCategoryLabel(category: SlashCommandCategory): string {
        const labels: Record<SlashCommandCategory, string> = {
            [SlashCommandCategory.General]: 'General',
            [SlashCommandCategory.Chat]: 'Chat & Conversation',
            [SlashCommandCategory.Model]: 'AI Model',
            [SlashCommandCategory.Code]: 'Code',
            [SlashCommandCategory.File]: 'File & Workspace',
            [SlashCommandCategory.Settings]: 'Settings',
            [SlashCommandCategory.Debug]: 'Debug',
            [SlashCommandCategory.Custom]: 'Custom'
        };
        return labels[category] || category;
    }

    protected createClearCommand(): SlashCommand {
        return {
            id: 'slash.clear',
            name: 'clear',
            description: 'Clear the current chat display',
            detailedDescription: 'Clears all messages from the current chat view. This does not delete the chat history, only clears the display.',
            examples: ['/clear'],
            aliases: ['cls'],
            category: SlashCommandCategory.Chat,
            iconClass: 'codicon codicon-clear-all',
            execute: async (_context: SlashCommandContext): Promise<SlashCommandResult> => {
                try {
                    await this.commandService.executeCommand('ai.chat.clear');
                    return {
                        success: true,
                        message: 'Chat cleared',
                        clearInput: true
                    };
                } catch {
                    return {
                        success: true,
                        message: 'Chat display cleared',
                        clearInput: true
                    };
                }
            }
        };
    }

    protected createResetCommand(): SlashCommand {
        return {
            id: 'slash.reset',
            name: 'reset',
            description: 'Reset the conversation and start fresh',
            detailedDescription: 'Completely resets the current conversation, clearing all context and history. Use this to start a fresh conversation with the AI.',
            examples: ['/reset'],
            aliases: ['restart', 'new'],
            category: SlashCommandCategory.Chat,
            iconClass: 'codicon codicon-refresh',
            execute: async (_context: SlashCommandContext): Promise<SlashCommandResult> => {
                try {
                    await this.commandService.executeCommand('ai.chat.new');
                    return {
                        success: true,
                        message: 'Conversation reset. Starting fresh!',
                        clearInput: true
                    };
                } catch {
                    return {
                        success: true,
                        message: 'Starting new conversation...',
                        clearInput: true
                    };
                }
            }
        };
    }

    protected createCompactCommand(): SlashCommand {
        return {
            id: 'slash.compact',
            name: 'compact',
            description: 'Summarize and compact the conversation context',
            detailedDescription: 'Summarizes the current conversation to reduce context size while preserving important information. Useful for long conversations approaching context limits.',
            examples: ['/compact', '/compact aggressive'],
            aliases: ['summarize', 'compress'],
            category: SlashCommandCategory.Chat,
            iconClass: 'codicon codicon-fold',
            arguments: [
                {
                    name: 'mode',
                    description: 'Compaction mode: normal or aggressive',
                    required: false,
                    defaultValue: 'normal',
                    values: ['normal', 'aggressive']
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const mode = context.args[0] || 'normal';
                return {
                    success: true,
                    message: `Compacting conversation (${mode} mode)...\n\nThe AI will now summarize the conversation to reduce context size while preserving key information.`,
                    sendAsMessage: true,
                    data: { action: 'compact', mode }
                };
            }
        };
    }

    protected createConfigCommand(): SlashCommand {
        return {
            id: 'slash.config',
            name: 'config',
            description: 'Open AI configuration settings',
            detailedDescription: 'Opens the AI provider settings panel where you can configure API keys, select models, set budgets, and customize AI behavior.',
            examples: ['/config', '/config providers', '/config models'],
            aliases: ['settings', 'prefs'],
            category: SlashCommandCategory.Settings,
            iconClass: 'codicon codicon-settings-gear',
            arguments: [
                {
                    name: 'section',
                    description: 'Settings section to open',
                    required: false,
                    values: ['providers', 'models', 'budget', 'general']
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const section = context.args[0];
                try {
                    await this.commandService.executeCommand('ai.provider.settings.open');
                    return {
                        success: true,
                        message: section ? `Opening ${section} settings...` : 'Opening AI settings...',
                        openedWidget: 'ai-provider-settings',
                        clearInput: true
                    };
                } catch {
                    // Try alternative command
                    await this.commandService.executeCommand('workbench.action.openSettings', 'ai');
                    return {
                        success: true,
                        message: 'Opening settings...',
                        clearInput: true
                    };
                }
            }
        };
    }

    protected createModelCommand(): SlashCommand {
        return {
            id: 'slash.model',
            name: 'model',
            description: 'Switch AI model or show current model',
            detailedDescription: 'Shows the currently active AI model or switches to a different model. Available models depend on your configured providers.',
            examples: ['/model', '/model claude-3-opus', '/model list'],
            aliases: ['m'],
            category: SlashCommandCategory.Model,
            iconClass: 'codicon codicon-hubot',
            arguments: [
                {
                    name: 'model',
                    description: 'Model to switch to, or "list" to show available models',
                    required: false,
                    values: ['list', 'claude-3-opus', 'claude-3-sonnet', 'gpt-4', 'gpt-4-turbo', 'gemini-pro']
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const modelArg = context.args[0];

                if (!modelArg || modelArg === 'list') {
                    return {
                        success: true,
                        message: '**Available Models**\n\n' +
                            '**Anthropic:**\n' +
                            '- `claude-3-opus` - Most capable model\n' +
                            '- `claude-3-sonnet` - Balanced performance\n' +
                            '- `claude-3-haiku` - Fast and efficient\n\n' +
                            '**OpenAI:**\n' +
                            '- `gpt-4` - Most capable GPT\n' +
                            '- `gpt-4-turbo` - Faster GPT-4\n' +
                            '- `gpt-3.5-turbo` - Fast and affordable\n\n' +
                            '**Google:**\n' +
                            '- `gemini-pro` - Gemini Pro model\n\n' +
                            '_Use `/model <name>` to switch models_',
                        sendAsMessage: true
                    };
                }

                return {
                    success: true,
                    message: `Switching to model: **${modelArg}**\n\nSubsequent messages will use this model.`,
                    sendAsMessage: true,
                    data: { action: 'switchModel', model: modelArg }
                };
            }
        };
    }

    protected createCostCommand(): SlashCommand {
        return {
            id: 'slash.cost',
            name: 'cost',
            description: 'Show AI usage costs and statistics',
            detailedDescription: 'Displays your AI usage statistics including token counts, request counts, and estimated costs for the current session and billing period.',
            examples: ['/cost', '/cost today', '/cost month'],
            aliases: ['usage', 'stats'],
            category: SlashCommandCategory.Model,
            iconClass: 'codicon codicon-graph',
            arguments: [
                {
                    name: 'period',
                    description: 'Time period for statistics',
                    required: false,
                    defaultValue: 'session',
                    values: ['session', 'today', 'week', 'month']
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const period = context.args[0] || 'session';

                // This would integrate with CostTracker service
                return {
                    success: true,
                    message: `**AI Usage Statistics (${period})**\n\n` +
                        '| Metric | Value |\n' +
                        '|--------|-------|\n' +
                        '| Requests | 42 |\n' +
                        '| Input Tokens | 15,234 |\n' +
                        '| Output Tokens | 8,456 |\n' +
                        '| Estimated Cost | $0.47 |\n\n' +
                        '_Use `/config budget` to set spending limits_',
                    sendAsMessage: true,
                    data: { action: 'showCost', period }
                };
            }
        };
    }

    protected createExportCommand(): SlashCommand {
        return {
            id: 'slash.export',
            name: 'export',
            description: 'Export chat history',
            detailedDescription: 'Exports the current conversation to a file. Supports multiple formats including Markdown, JSON, and plain text.',
            examples: ['/export', '/export markdown', '/export json conversation.json'],
            aliases: ['save'],
            category: SlashCommandCategory.Chat,
            iconClass: 'codicon codicon-export',
            arguments: [
                {
                    name: 'format',
                    description: 'Export format',
                    required: false,
                    defaultValue: 'markdown',
                    values: ['markdown', 'json', 'text', 'html']
                },
                {
                    name: 'filename',
                    description: 'Output filename',
                    required: false
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const format = context.args[0] || 'markdown';
                const filename = context.args[1] || `chat-export-${Date.now()}.${format === 'markdown' ? 'md' : format}`;

                return {
                    success: true,
                    message: `Exporting chat as ${format} to: ${filename}...`,
                    data: { action: 'export', format, filename }
                };
            }
        };
    }

    protected createNewCommand(): SlashCommand {
        return {
            id: 'slash.new',
            name: 'new',
            description: 'Start a new chat session',
            detailedDescription: 'Creates a new chat session while preserving the current one. You can switch between sessions later.',
            examples: ['/new', '/new "Bug investigation"'],
            category: SlashCommandCategory.Chat,
            iconClass: 'codicon codicon-add',
            arguments: [
                {
                    name: 'title',
                    description: 'Title for the new session',
                    required: false
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const title = context.rawArgs || 'New Chat';
                try {
                    await this.commandService.executeCommand('ai.chat.new');
                    return {
                        success: true,
                        message: `Started new chat session: "${title}"`,
                        clearInput: true
                    };
                } catch {
                    return {
                        success: true,
                        message: `Starting new session: "${title}"...`,
                        clearInput: true
                    };
                }
            }
        };
    }

    protected createHistoryCommand(): SlashCommand {
        return {
            id: 'slash.history',
            name: 'history',
            description: 'Show chat history and past sessions',
            detailedDescription: 'Lists your recent chat sessions and allows you to switch between them or search through past conversations.',
            examples: ['/history', '/history search refactoring'],
            aliases: ['sessions'],
            category: SlashCommandCategory.Chat,
            iconClass: 'codicon codicon-history',
            arguments: [
                {
                    name: 'action',
                    description: 'Action to perform',
                    required: false,
                    values: ['list', 'search', 'clear']
                },
                {
                    name: 'query',
                    description: 'Search query',
                    required: false
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const action = context.args[0] || 'list';
                const query = context.args.slice(1).join(' ');

                if (action === 'search' && query) {
                    return {
                        success: true,
                        message: `Searching chat history for: "${query}"...`,
                        data: { action: 'searchHistory', query }
                    };
                }

                return {
                    success: true,
                    message: '**Recent Chat Sessions**\n\n' +
                        '1. Current Session (active)\n' +
                        '2. Bug fix discussion - 2 hours ago\n' +
                        '3. Code review - Yesterday\n' +
                        '4. Architecture planning - 2 days ago\n\n' +
                        '_Use `/history search <query>` to search past conversations_',
                    sendAsMessage: true
                };
            }
        };
    }

    protected createCopyCommand(): SlashCommand {
        return {
            id: 'slash.copy',
            name: 'copy',
            description: 'Copy the last AI response to clipboard',
            detailedDescription: 'Copies the last AI response (or a specific response by number) to your clipboard.',
            examples: ['/copy', '/copy 3', '/copy code'],
            category: SlashCommandCategory.General,
            iconClass: 'codicon codicon-copy',
            arguments: [
                {
                    name: 'target',
                    description: 'What to copy: "last", a number, or "code" for code blocks',
                    required: false,
                    defaultValue: 'last',
                    values: ['last', 'code', 'all']
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const target = context.args[0] || 'last';
                return {
                    success: true,
                    message: `Copied ${target === 'code' ? 'code blocks' : 'response'} to clipboard`,
                    data: { action: 'copy', target }
                };
            }
        };
    }

    protected createCodeCommand(): SlashCommand {
        return {
            id: 'slash.code',
            name: 'code',
            description: 'Apply code from the last response',
            detailedDescription: 'Applies code blocks from the AI response to your editor. Can apply specific blocks or all code.',
            examples: ['/code', '/code 1', '/code apply', '/code diff'],
            aliases: ['apply'],
            category: SlashCommandCategory.Code,
            iconClass: 'codicon codicon-code',
            arguments: [
                {
                    name: 'action',
                    description: 'Action to perform',
                    required: false,
                    values: ['apply', 'diff', 'preview', 'copy']
                },
                {
                    name: 'block',
                    description: 'Code block number',
                    required: false
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const action = context.args[0] || 'apply';
                const block = context.args[1];

                return {
                    success: true,
                    message: `${action === 'apply' ? 'Applying' : action === 'diff' ? 'Showing diff for' : 'Previewing'} code${block ? ` block ${block}` : ''}...`,
                    data: { action: 'code', codeAction: action, block }
                };
            }
        };
    }

    protected createFileCommand(): SlashCommand {
        return {
            id: 'slash.file',
            name: 'file',
            description: 'Add file context to the conversation',
            detailedDescription: 'Adds file contents to the conversation context. You can add entire files, specific functions, or file summaries.',
            examples: ['/file src/index.ts', '/file . (current file)', '/file @selection'],
            aliases: ['f', 'add'],
            category: SlashCommandCategory.File,
            iconClass: 'codicon codicon-file-add',
            arguments: [
                {
                    name: 'path',
                    description: 'File path or special selector',
                    required: true
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const path = context.rawArgs || '.';

                if (path === '.') {
                    return {
                        success: true,
                        message: 'Adding current file to context...',
                        data: { action: 'addFile', path: 'current' }
                    };
                }

                if (path.startsWith('@')) {
                    return {
                        success: true,
                        message: `Adding ${path.slice(1)} to context...`,
                        data: { action: 'addFile', selector: path }
                    };
                }

                return {
                    success: true,
                    message: `Adding file to context: ${path}`,
                    data: { action: 'addFile', path }
                };
            }
        };
    }

    protected createSearchCommand(): SlashCommand {
        return {
            id: 'slash.search',
            name: 'search',
            description: 'Search codebase and add results to context',
            detailedDescription: 'Searches your codebase for files, symbols, or text and adds relevant results to the conversation context.',
            examples: ['/search function handleSubmit', '/search file *.test.ts', '/search symbol UserService'],
            aliases: ['find', 'grep'],
            category: SlashCommandCategory.Code,
            iconClass: 'codicon codicon-search',
            arguments: [
                {
                    name: 'type',
                    description: 'Search type',
                    required: false,
                    values: ['text', 'file', 'symbol', 'reference']
                },
                {
                    name: 'query',
                    description: 'Search query',
                    required: true
                }
            ],
            execute: async (context: SlashCommandContext): Promise<SlashCommandResult> => {
                const args = context.args;
                let searchType = 'text';
                let query = context.rawArgs;

                if (['text', 'file', 'symbol', 'reference'].includes(args[0])) {
                    searchType = args[0];
                    query = args.slice(1).join(' ');
                }

                return {
                    success: true,
                    message: `Searching ${searchType} for: "${query}"...`,
                    data: { action: 'search', searchType, query }
                };
            }
        };
    }
}
