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
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import {
    AIRefactorService,
    RefactorContext,
    getRefactorIcon,
    getRefactorLabel
} from '../common/ai-refactor-protocol';

export namespace AIRefactorCommands {
    export const SHOW_REFACTORS: Command = {
        id: 'ai-refactor.show-refactors',
        label: 'AI Refactor: Show Available Refactorings',
        category: 'AI'
    };

    export const EXTRACT_FUNCTION: Command = {
        id: 'ai-refactor.extract-function',
        label: 'AI Refactor: Extract Function',
        category: 'AI'
    };

    export const EXTRACT_VARIABLE: Command = {
        id: 'ai-refactor.extract-variable',
        label: 'AI Refactor: Extract Variable',
        category: 'AI'
    };

    export const EXTRACT_CONSTANT: Command = {
        id: 'ai-refactor.extract-constant',
        label: 'AI Refactor: Extract Constant',
        category: 'AI'
    };

    export const RENAME_SYMBOL: Command = {
        id: 'ai-refactor.rename-symbol',
        label: 'AI Refactor: Rename with AI Suggestions',
        category: 'AI'
    };

    export const OPTIMIZE_IMPORTS: Command = {
        id: 'ai-refactor.optimize-imports',
        label: 'AI Refactor: Optimize Imports',
        category: 'AI'
    };

    export const DETECT_SMELLS: Command = {
        id: 'ai-refactor.detect-smells',
        label: 'AI Refactor: Detect Code Smells',
        category: 'AI'
    };

    export const CONVERT_ARROW: Command = {
        id: 'ai-refactor.convert-arrow',
        label: 'AI Refactor: Convert to Arrow Function',
        category: 'AI'
    };

    export const SIMPLIFY_CONDITIONAL: Command = {
        id: 'ai-refactor.simplify-conditional',
        label: 'AI Refactor: Simplify Conditional',
        category: 'AI'
    };
}

@injectable()
export class AIRefactorContribution implements CommandContribution, MenuContribution, KeybindingContribution {
    @inject(AIRefactorService)
    protected readonly refactorService: AIRefactorService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AIRefactorCommands.SHOW_REFACTORS, {
            execute: () => this.showRefactorings(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AIRefactorCommands.EXTRACT_FUNCTION, {
            execute: () => this.extractFunction(),
            isEnabled: () => this.hasSelection()
        });

        registry.registerCommand(AIRefactorCommands.EXTRACT_VARIABLE, {
            execute: () => this.extractVariable(),
            isEnabled: () => this.hasSelection()
        });

        registry.registerCommand(AIRefactorCommands.EXTRACT_CONSTANT, {
            execute: () => this.extractConstant(),
            isEnabled: () => this.hasSelection()
        });

        registry.registerCommand(AIRefactorCommands.RENAME_SYMBOL, {
            execute: () => this.renameWithSuggestions(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AIRefactorCommands.OPTIMIZE_IMPORTS, {
            execute: () => this.optimizeImports(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AIRefactorCommands.DETECT_SMELLS, {
            execute: () => this.detectCodeSmells(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AIRefactorCommands.CONVERT_ARROW, {
            execute: () => this.convertToArrow(),
            isEnabled: () => this.hasSelection()
        });

        registry.registerCommand(AIRefactorCommands.SIMPLIFY_CONDITIONAL, {
            execute: () => this.simplifyConditional(),
            isEnabled: () => this.hasSelection()
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        // Add to Edit menu
        registry.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: AIRefactorCommands.SHOW_REFACTORS.id,
            label: 'AI: Refactor...',
            order: '9.2'
        });

        // Context menu - Refactor submenu
        registry.registerMenuAction(['editor_context_menu', 'refactor'], {
            commandId: AIRefactorCommands.EXTRACT_FUNCTION.id,
            label: 'Extract Function',
            order: '1'
        });

        registry.registerMenuAction(['editor_context_menu', 'refactor'], {
            commandId: AIRefactorCommands.EXTRACT_VARIABLE.id,
            label: 'Extract Variable',
            order: '2'
        });

        registry.registerMenuAction(['editor_context_menu', 'refactor'], {
            commandId: AIRefactorCommands.RENAME_SYMBOL.id,
            label: 'Rename with AI',
            order: '3'
        });

        registry.registerMenuAction(['editor_context_menu', 'refactor'], {
            commandId: AIRefactorCommands.OPTIMIZE_IMPORTS.id,
            label: 'Optimize Imports',
            order: '4'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: AIRefactorCommands.SHOW_REFACTORS.id,
            keybinding: 'ctrlcmd+shift+r'
        });

        registry.registerKeybinding({
            command: AIRefactorCommands.EXTRACT_FUNCTION.id,
            keybinding: 'ctrlcmd+shift+m'
        });

        registry.registerKeybinding({
            command: AIRefactorCommands.EXTRACT_VARIABLE.id,
            keybinding: 'ctrlcmd+shift+l'
        });

        registry.registerKeybinding({
            command: AIRefactorCommands.OPTIMIZE_IMPORTS.id,
            keybinding: 'ctrlcmd+shift+o'
        });

        registry.registerKeybinding({
            command: AIRefactorCommands.RENAME_SYMBOL.id,
            keybinding: 'f2'
        });
    }

    protected async showRefactorings(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context) {
            return;
        }

        const suggestions = await this.refactorService.getSuggestions({ context });

        if (suggestions.length === 0) {
            this.messageService.info('No refactorings available for current selection');
            return;
        }

        const items: QuickPickItem[] = suggestions.map(s => ({
            label: `$(${getRefactorIcon(s.kind)}) ${s.title}`,
            description: s.shortcut,
            detail: s.description,
            id: s.id
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Select a refactoring to apply'
        });

        if (selected) {
            await this.applyRefactoring(selected.id!, context);
        }
    }

    protected async extractFunction(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context || !context.selection) {
            this.messageService.warn('Please select code to extract');
            return;
        }

        const name = await this.quickInputService.input({
            prompt: 'Enter function name',
            placeHolder: 'newFunction'
        });

        if (!name) {
            return;
        }

        const result = await this.refactorService.extractFunction(
            { selection: context.selection, suggestedName: name },
            context
        );

        await this.handleRefactorResult(result, 'Extract function');
    }

    protected async extractVariable(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context || !context.selection) {
            this.messageService.warn('Please select an expression to extract');
            return;
        }

        const name = await this.quickInputService.input({
            prompt: 'Enter variable name',
            placeHolder: 'newVariable'
        });

        if (!name) {
            return;
        }

        const result = await this.refactorService.extractVariable(
            { selection: context.selection, suggestedName: name },
            context
        );

        await this.handleRefactorResult(result, 'Extract variable');
    }

    protected async extractConstant(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context || !context.selection) {
            this.messageService.warn('Please select a value to extract');
            return;
        }

        const name = await this.quickInputService.input({
            prompt: 'Enter constant name (UPPER_CASE)',
            placeHolder: 'NEW_CONSTANT'
        });

        if (!name) {
            return;
        }

        const result = await this.refactorService.extractConstant(
            { selection: context.selection, suggestedName: name },
            context
        );

        await this.handleRefactorResult(result, 'Extract constant');
    }

    protected async renameWithSuggestions(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context) {
            return;
        }

        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return;
        }

        const model = editor.getControl().getModel();
        const position = editor.getControl().getPosition();
        if (!model || !position) {
            return;
        }

        const word = model.getWordAtPosition(position);
        if (!word) {
            this.messageService.warn('Place cursor on a symbol to rename');
            return;
        }

        // Get AI suggestions
        const suggestions = await this.refactorService.suggestNames(
            { name: word.word, kind: 'unknown', context: context.content },
            context.language,
            5
        );

        const items: QuickPickItem[] = [
            {
                label: '$(edit) Enter custom name...',
                id: 'custom'
            },
            ...suggestions.map((s, i) => ({
                label: `$(lightbulb) ${s.name}`,
                description: `${Math.round(s.confidence * 100)}% confidence`,
                detail: s.reason,
                id: `suggestion-${i}`,
                suggestion: s.name
            }))
        ];

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: `Rename '${word.word}' to...`
        });

        if (!selected) {
            return;
        }

        let newName: string | undefined;

        if (selected.id === 'custom') {
            newName = await this.quickInputService.input({
                prompt: `Rename '${word.word}' to`,
                value: word.word
            });
        } else {
            newName = (selected as any).suggestion;
        }

        if (!newName || newName === word.word) {
            return;
        }

        const result = await this.refactorService.rename(
            {
                symbol: {
                    name: word.word,
                    uri: context.uri,
                    line: position.lineNumber,
                    column: position.column
                },
                newName
            },
            context
        );

        await this.handleRefactorResult(result, 'Rename');
    }

    protected async optimizeImports(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context) {
            return;
        }

        const result = await this.refactorService.optimizeImports(context.uri, context);
        await this.handleRefactorResult(result, 'Optimize imports');
    }

    protected async detectCodeSmells(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context) {
            return;
        }

        const smells = await this.refactorService.detectCodeSmells(
            context.uri,
            context.content,
            context.language
        );

        if (smells.length === 0) {
            this.messageService.info('No code smells detected');
            return;
        }

        const items: QuickPickItem[] = smells.map(s => ({
            label: `$(warning) ${s.type.replace(/-/g, ' ')}`,
            description: `Line ${s.location.startLine}`,
            detail: s.description
        }));

        await this.quickInputService.showQuickPick(items, {
            placeholder: `Found ${smells.length} code smell(s)`
        });
    }

    protected async convertToArrow(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context || !context.selection) {
            this.messageService.warn('Please select a function to convert');
            return;
        }

        const result = await this.refactorService.convertToArrow(context.selection, context);
        await this.handleRefactorResult(result, 'Convert to arrow function');
    }

    protected async simplifyConditional(): Promise<void> {
        const context = await this.getRefactorContext();
        if (!context || !context.selection) {
            this.messageService.warn('Please select a conditional to simplify');
            return;
        }

        const result = await this.refactorService.simplifyConditional(context.selection, context);
        await this.handleRefactorResult(result, 'Simplify conditional');
    }

    protected async applyRefactoring(suggestionId: string, context: RefactorContext): Promise<void> {
        const result = await this.refactorService.applyRefactor(suggestionId, context);
        await this.handleRefactorResult(result, getRefactorLabel(suggestionId.split('-')[0] as any));
    }

    protected async handleRefactorResult(
        result: { success: boolean; message?: string; edits: any[] },
        operation: string
    ): Promise<void> {
        if (result.success) {
            if (result.edits.length > 0) {
                // In a full implementation, we would apply edits to the editor
                console.log('Refactor edits:', result.edits);
            }
            this.messageService.info(result.message || `${operation} completed`);
        } else {
            this.messageService.warn(result.message || `${operation} failed`);
        }
    }

    protected async getRefactorContext(): Promise<RefactorContext | undefined> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return undefined;
        }

        const model = editor.getControl().getModel();
        if (!model) {
            return undefined;
        }

        const selection = editor.getControl().getSelection();
        const uri = model.uri.toString();
        const content = model.getValue();
        const language = model.getLanguageId();

        let selectionData = undefined;
        if (selection && !selection.isEmpty()) {
            selectionData = {
                uri,
                startLine: selection.startLineNumber,
                startColumn: selection.startColumn - 1,
                endLine: selection.endLineNumber,
                endColumn: selection.endColumn - 1,
                text: model.getValueInRange(selection)
            };
        }

        // Get symbol at cursor
        const position = editor.getControl().getPosition();
        let symbol = undefined;
        if (position) {
            const word = model.getWordAtPosition(position);
            if (word) {
                symbol = {
                    name: word.word,
                    kind: 'unknown',
                    range: {
                        uri,
                        startLine: position.lineNumber,
                        startColumn: word.startColumn - 1,
                        endLine: position.lineNumber,
                        endColumn: word.endColumn - 1,
                        text: word.word
                    }
                };
            }
        }

        return {
            uri,
            language,
            content,
            selection: selectionData,
            symbol
        };
    }

    protected getCurrentMonacoEditor(): MonacoEditor | undefined {
        const current = this.editorManager.currentEditor;
        if (!current) {
            return undefined;
        }

        const editor = current.editor;
        if (this.isMonacoEditor(editor)) {
            return editor as MonacoEditor;
        }

        return undefined;
    }

    protected isMonacoEditor(editor: unknown): boolean {
        return editor !== null &&
            typeof editor === 'object' &&
            'getControl' in editor &&
            typeof (editor as any).getControl === 'function';
    }

    protected hasActiveEditor(): boolean {
        return this.editorManager.currentEditor !== undefined;
    }

    protected hasSelection(): boolean {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return false;
        }

        const selection = editor.getControl().getSelection();
        return selection !== null && !selection.isEmpty();
    }
}
