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
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { QuickInputService } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { AIExplainService } from '../common/ai-explain-protocol';
import { AIExplainHoverProvider } from './ai-explain-hover-provider';

export namespace AIExplainCommands {
    export const EXPLAIN_CODE: Command = {
        id: 'ai-explain.explain-code',
        label: 'AI Explain: Explain Code at Cursor',
        category: 'AI'
    };

    export const EXPLAIN_SELECTION: Command = {
        id: 'ai-explain.explain-selection',
        label: 'AI Explain: Explain Selected Code',
        category: 'AI'
    };

    export const EXPLAIN_SYMBOL: Command = {
        id: 'ai-explain.explain-symbol',
        label: 'AI Explain: Explain Symbol',
        category: 'AI'
    };

    export const EXPLAIN_ERROR: Command = {
        id: 'ai-explain.explain-error',
        label: 'AI Explain: Explain Error',
        category: 'AI'
    };

    export const TOGGLE_HOVER: Command = {
        id: 'ai-explain.toggle-hover',
        label: 'AI Explain: Toggle Hover Explanations',
        category: 'AI'
    };

    export const CLEAR_CACHE: Command = {
        id: 'ai-explain.clear-cache',
        label: 'AI Explain: Clear Explanation Cache',
        category: 'AI'
    };
}

@injectable()
export class AIExplainContribution implements CommandContribution, MenuContribution, KeybindingContribution {
    @inject(AIExplainService)
    protected readonly explainService: AIExplainService;

    @inject(AIExplainHoverProvider)
    protected readonly hoverProvider: AIExplainHoverProvider;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AIExplainCommands.EXPLAIN_CODE, {
            execute: async () => {
                const explanation = await this.hoverProvider.explainAtCursor();
                if (explanation) {
                    this.showExplanation(explanation.explanation);
                }
            }
        });

        registry.registerCommand(AIExplainCommands.EXPLAIN_SYMBOL, {
            execute: async () => {
                const symbol = await this.quickInputService.input({
                    prompt: 'Enter symbol name to explain',
                    placeHolder: 'e.g., Promise, Array.map, useState'
                });

                if (symbol) {
                    const explanation = await this.explainService.explainSymbol(
                        symbol,
                        'javascript' // Default language
                    );
                    this.showExplanation(explanation.explanation);
                }
            }
        });

        registry.registerCommand(AIExplainCommands.EXPLAIN_ERROR, {
            execute: async () => {
                const errorMessage = await this.quickInputService.input({
                    prompt: 'Enter error message',
                    placeHolder: 'e.g., Cannot read property of undefined'
                });

                if (errorMessage) {
                    const result = await this.explainService.explainError(
                        errorMessage,
                        '',
                        'javascript'
                    );

                    const content = `## Error Explanation\n\n${result.explanation}\n\n` +
                        `### Cause\n${result.cause}\n\n` +
                        `### Solutions\n${result.solutions.map(s => `- ${s}`).join('\n')}`;

                    this.showExplanation(content);
                }
            }
        });

        registry.registerCommand(AIExplainCommands.TOGGLE_HOVER, {
            execute: () => {
                const newState = !this.hoverProvider.isEnabled();
                this.hoverProvider.setEnabled(newState);
                this.messageService.info(`AI Explain hover ${newState ? 'enabled' : 'disabled'}`);
            }
        });

        registry.registerCommand(AIExplainCommands.CLEAR_CACHE, {
            execute: async () => {
                await this.explainService.clearCache();
                this.messageService.info('AI Explain cache cleared');
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        // Add to Edit menu
        registry.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: AIExplainCommands.EXPLAIN_CODE.id,
            label: 'AI: Explain Code',
            order: '9.1'
        });

        // Context menu
        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AIExplainCommands.EXPLAIN_CODE.id,
            label: 'AI: Explain This',
            order: '1'
        });

        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AIExplainCommands.EXPLAIN_SYMBOL.id,
            label: 'AI: Explain Symbol',
            order: '2'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: AIExplainCommands.EXPLAIN_CODE.id,
            keybinding: 'ctrlcmd+shift+e'
        });

        registry.registerKeybinding({
            command: AIExplainCommands.EXPLAIN_SYMBOL.id,
            keybinding: 'ctrlcmd+shift+/'
        });
    }

    protected showExplanation(content: string): void {
        // Show in a quick pick or notification
        // In a full implementation, this would open a side panel or overlay
        console.log('=== AI Explanation ===');
        console.log(content);

        // Show brief notification
        this.messageService.info('Explanation ready - check console for details');
    }
}
