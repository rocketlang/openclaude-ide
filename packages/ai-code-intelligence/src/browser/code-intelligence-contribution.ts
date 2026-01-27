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

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    Command,
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
    nls
} from '@theia/core';
import { CommonMenus, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import {
    AICodeActionsService,
    SemanticContextService,
    CodeRange,
    CodeExplanation
} from '../common';

export namespace CodeIntelligenceCommands {
    const CATEGORY = 'AI Code Intelligence';

    export const EXPLAIN_CODE: Command = {
        id: 'ai.codeIntelligence.explain',
        label: nls.localize('theia/ai/codeIntelligence/explain', 'Explain Code'),
        category: CATEGORY
    };

    export const GENERATE_DOCS: Command = {
        id: 'ai.codeIntelligence.generateDocs',
        label: nls.localize('theia/ai/codeIntelligence/generateDocs', 'Generate Documentation'),
        category: CATEGORY
    };

    export const SUGGEST_REFACTORING: Command = {
        id: 'ai.codeIntelligence.refactor',
        label: nls.localize('theia/ai/codeIntelligence/refactor', 'Suggest Refactoring'),
        category: CATEGORY
    };

    export const GENERATE_TESTS: Command = {
        id: 'ai.codeIntelligence.generateTests',
        label: nls.localize('theia/ai/codeIntelligence/generateTests', 'Generate Unit Tests'),
        category: CATEGORY
    };

    export const SHOW_CONTEXT: Command = {
        id: 'ai.codeIntelligence.showContext',
        label: nls.localize('theia/ai/codeIntelligence/showContext', 'Show Semantic Context'),
        category: CATEGORY
    };

    export const QUICK_FIX: Command = {
        id: 'ai.codeIntelligence.quickFix',
        label: nls.localize('theia/ai/codeIntelligence/quickFix', 'AI Quick Fix'),
        category: CATEGORY
    };
}

export namespace CodeIntelligenceMenus {
    export const AI_CODE_ACTIONS = [...CommonMenus.EDIT, 'ai-code-actions'];
}

@injectable()
export class CodeIntelligenceContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(AICodeActionsService)
    protected readonly codeActionsService: AICodeActionsService;

    @inject(SemanticContextService)
    protected readonly contextService: SemanticContextService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(CodeIntelligenceCommands.EXPLAIN_CODE, {
            execute: () => this.explainSelection(),
            isEnabled: () => this.hasSelection()
        });

        registry.registerCommand(CodeIntelligenceCommands.GENERATE_DOCS, {
            execute: () => this.generateDocumentation(),
            isEnabled: () => this.hasSelection()
        });

        registry.registerCommand(CodeIntelligenceCommands.SUGGEST_REFACTORING, {
            execute: () => this.suggestRefactoring(),
            isEnabled: () => this.hasSelection()
        });

        registry.registerCommand(CodeIntelligenceCommands.GENERATE_TESTS, {
            execute: () => this.generateTests(),
            isEnabled: () => this.hasSelection()
        });

        registry.registerCommand(CodeIntelligenceCommands.SHOW_CONTEXT, {
            execute: () => this.showContext(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(CodeIntelligenceCommands.QUICK_FIX, {
            execute: () => this.showQuickFix(),
            isEnabled: () => this.hasActiveEditor()
        });

        // Internal commands for showing results
        registry.registerCommand({ id: 'ai.showExplanation' }, {
            execute: (explanation: CodeExplanation) => this.showExplanation(explanation)
        });

        registry.registerCommand({ id: 'ai.showRefactoringSuggestions' }, {
            execute: (suggestions: import('../common').AICodeAction[]) => this.showRefactoringSuggestions(suggestions)
        });

        registry.registerCommand({ id: 'ai.insertDocumentation' }, {
            execute: (uri: string, range: CodeRange, documentation: string) =>
                this.insertDocumentation(uri, range, documentation)
        });

        registry.registerCommand({ id: 'ai.showGeneratedTests' }, {
            execute: (tests: string) => this.showGeneratedTests(tests)
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(CodeIntelligenceMenus.AI_CODE_ACTIONS, 'AI Code Actions');

        menus.registerMenuAction(CodeIntelligenceMenus.AI_CODE_ACTIONS, {
            commandId: CodeIntelligenceCommands.EXPLAIN_CODE.id,
            order: '1'
        });

        menus.registerMenuAction(CodeIntelligenceMenus.AI_CODE_ACTIONS, {
            commandId: CodeIntelligenceCommands.GENERATE_DOCS.id,
            order: '2'
        });

        menus.registerMenuAction(CodeIntelligenceMenus.AI_CODE_ACTIONS, {
            commandId: CodeIntelligenceCommands.SUGGEST_REFACTORING.id,
            order: '3'
        });

        menus.registerMenuAction(CodeIntelligenceMenus.AI_CODE_ACTIONS, {
            commandId: CodeIntelligenceCommands.GENERATE_TESTS.id,
            order: '4'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CodeIntelligenceCommands.EXPLAIN_CODE.id,
            keybinding: 'ctrlcmd+shift+e',
            when: 'editorTextFocus && editorHasSelection'
        });

        keybindings.registerKeybinding({
            command: CodeIntelligenceCommands.QUICK_FIX.id,
            keybinding: 'ctrlcmd+.',
            when: 'editorTextFocus'
        });
    }

    protected hasActiveEditor(): boolean {
        const editor = this.editorManager.currentEditor?.editor;
        return editor instanceof MonacoEditor;
    }

    protected hasSelection(): boolean {
        const editor = this.editorManager.currentEditor?.editor;
        if (!(editor instanceof MonacoEditor)) {
            return false;
        }

        const selection = editor.getControl().getSelection();
        return selection !== null && !selection.isEmpty();
    }

    protected getSelectionRange(): CodeRange | undefined {
        const editor = this.editorManager.currentEditor?.editor;
        if (!(editor instanceof MonacoEditor)) {
            return undefined;
        }

        const selection = editor.getControl().getSelection();
        if (!selection || selection.isEmpty()) {
            return undefined;
        }

        return {
            start: { line: selection.startLineNumber - 1, character: selection.startColumn - 1 },
            end: { line: selection.endLineNumber - 1, character: selection.endColumn - 1 }
        };
    }

    protected async explainSelection(): Promise<void> {
        const editor = this.editorManager.currentEditor?.editor;
        if (!(editor instanceof MonacoEditor)) {
            return;
        }

        const range = this.getSelectionRange();
        if (!range) {
            return;
        }

        const uri = editor.uri.toString();
        const explanation = await this.codeActionsService.explainCode(uri, range);
        this.showExplanation(explanation);
    }

    protected async generateDocumentation(): Promise<void> {
        const editor = this.editorManager.currentEditor?.editor;
        if (!(editor instanceof MonacoEditor)) {
            return;
        }

        const range = this.getSelectionRange();
        if (!range) {
            return;
        }

        const uri = editor.uri.toString();
        const documentation = await this.codeActionsService.generateDocumentation(uri, range);
        await this.insertDocumentation(uri, range, documentation);
    }

    protected async suggestRefactoring(): Promise<void> {
        const editor = this.editorManager.currentEditor?.editor;
        if (!(editor instanceof MonacoEditor)) {
            return;
        }

        const range = this.getSelectionRange();
        if (!range) {
            return;
        }

        const uri = editor.uri.toString();
        const suggestions = await this.codeActionsService.suggestRefactoring(uri, range);
        this.showRefactoringSuggestions(suggestions);
    }

    protected async generateTests(): Promise<void> {
        const editor = this.editorManager.currentEditor?.editor;
        if (!(editor instanceof MonacoEditor)) {
            return;
        }

        const range = this.getSelectionRange();
        if (!range) {
            return;
        }

        const uri = editor.uri.toString();
        const tests = await this.codeActionsService.generateTests(uri, range);
        this.showGeneratedTests(tests);
    }

    protected async showContext(): Promise<void> {
        const context = await this.contextService.getCurrentContext();
        if (!context) {
            return;
        }

        const formatted = this.contextService.formatContextForAI(context);
        console.log('Semantic Context:', formatted);

        // Could show in a panel or notification
    }

    protected async showQuickFix(): Promise<void> {
        const editor = this.editorManager.currentEditor?.editor;
        if (!(editor instanceof MonacoEditor)) {
            return;
        }

        // Trigger Monaco's quick fix menu
        editor.getControl().trigger('keyboard', 'editor.action.quickFix', {});
    }

    protected showExplanation(explanation: CodeExplanation): void {
        // For now, log to console. In production, show in a panel
        console.log('Code Explanation:');
        console.log('Summary:', explanation.summary);
        if (explanation.details) {
            console.log('Details:', explanation.details);
        }
        if (explanation.concepts) {
            console.log('Concepts:', explanation.concepts.join(', '));
        }
        console.log('Complexity:', explanation.complexity);
        if (explanation.suggestions) {
            console.log('Suggestions:', explanation.suggestions.join('\n'));
        }

        // TODO: Show in a dedicated explanation panel
    }

    protected showRefactoringSuggestions(suggestions: import('../common').AICodeAction[]): void {
        console.log('Refactoring Suggestions:');
        for (const suggestion of suggestions) {
            console.log(`- ${suggestion.title}: ${suggestion.description}`);
        }

        // TODO: Show as quick pick menu
    }

    protected async insertDocumentation(uri: string, range: CodeRange, documentation: string): Promise<void> {
        const editor = this.editorManager.currentEditor?.editor;
        if (!(editor instanceof MonacoEditor)) {
            return;
        }

        const model = editor.getControl().getModel();
        if (!model) {
            return;
        }

        // Insert documentation above the selection
        const insertPosition = new monaco.Position(range.start.line + 1, 1);
        const insertText = documentation + '\n';

        model.pushEditOperations(
            [],
            [{
                range: new monaco.Range(
                    insertPosition.lineNumber,
                    insertPosition.column,
                    insertPosition.lineNumber,
                    insertPosition.column
                ),
                text: insertText
            }],
            () => null
        );
    }

    protected showGeneratedTests(tests: string): void {
        console.log('Generated Tests:');
        console.log(tests);

        // TODO: Open in a new editor
    }
}
