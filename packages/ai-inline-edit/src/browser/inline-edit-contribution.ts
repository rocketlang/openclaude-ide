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
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { CommonMenus } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { InlineEditCommands } from './inline-edit-commands';
import { InlineEditService, EditContext } from '../common';

@injectable()
export class InlineEditContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(InlineEditService)
    protected readonly inlineEditService: InlineEditService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected isInitialized = false;

    @postConstruct()
    protected init(): void {
        // Listen for text changes to auto-trigger suggestions
        this.editorManager.onCurrentEditorChanged(editor => {
            if (editor && !this.isInitialized) {
                this.setupEditorListeners(editor);
                this.isInitialized = true;
            }
        });
    }

    protected setupEditorListeners(editorWidget: any): void {
        const monacoEditor = editorWidget.editor?.getControl?.();
        if (!monacoEditor) {
            return;
        }

        // Listen for content changes
        monacoEditor.onDidChangeModelContent?.((e: any) => {
            const config = this.inlineEditService.getConfig();
            if (config.autoTrigger && config.enabled) {
                const context = this.getEditorContext(monacoEditor);
                if (context) {
                    this.inlineEditService.triggerSuggestion(context);
                }
            }
        });

        // Listen for cursor position changes
        monacoEditor.onDidChangeCursorPosition?.(() => {
            if (this.inlineEditService.isShowingSuggestion()) {
                this.inlineEditService.dismissSuggestion();
            }
        });
    }

    protected getEditorContext(monacoEditor: any): EditContext | undefined {
        const model = monacoEditor.getModel();
        if (!model) {
            return undefined;
        }

        const position = monacoEditor.getPosition();
        if (!position) {
            return undefined;
        }

        const lineContent = model.getLineContent(position.lineNumber);
        const prefix = model.getValueInRange({
            startLineNumber: Math.max(1, position.lineNumber - 50),
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
        });
        const suffix = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 50),
            endColumn: model.getLineMaxColumn(Math.min(model.getLineCount(), position.lineNumber + 50))
        });

        // Get surrounding context (5 lines before and after)
        const surroundingContext: string[] = [];
        for (let i = Math.max(1, position.lineNumber - 5); i <= Math.min(model.getLineCount(), position.lineNumber + 5); i++) {
            if (i !== position.lineNumber) {
                surroundingContext.push(model.getLineContent(i));
            }
        }

        return {
            filePath: model.uri.toString(),
            languageId: model.getLanguageId(),
            prefix,
            suffix,
            currentLine: lineContent,
            cursorPosition: {
                lineNumber: position.lineNumber,
                column: position.column
            },
            surroundingContext
        };
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(InlineEditCommands.TRIGGER_SUGGESTION, {
            execute: async () => {
                const editor = this.editorManager.currentEditor;
                if (!editor) {
                    return;
                }

                const monacoEditor = (editor.editor as any).getControl?.();
                if (!monacoEditor) {
                    return;
                }

                const context = this.getEditorContext(monacoEditor);
                if (context) {
                    await this.inlineEditService.triggerSuggestion(context);
                }
            },
            isEnabled: () => !!this.editorManager.currentEditor
        });

        registry.registerCommand(InlineEditCommands.ACCEPT_SUGGESTION, {
            execute: async () => {
                await this.inlineEditService.acceptSuggestion();
            },
            isEnabled: () => this.inlineEditService.isShowingSuggestion()
        });

        registry.registerCommand(InlineEditCommands.ACCEPT_WORD, {
            execute: async () => {
                await this.inlineEditService.acceptPartial('word');
            },
            isEnabled: () => this.inlineEditService.isShowingSuggestion()
        });

        registry.registerCommand(InlineEditCommands.ACCEPT_LINE, {
            execute: async () => {
                await this.inlineEditService.acceptPartial('line');
            },
            isEnabled: () => this.inlineEditService.isShowingSuggestion()
        });

        registry.registerCommand(InlineEditCommands.DISMISS_SUGGESTION, {
            execute: () => {
                this.inlineEditService.dismissSuggestion();
            },
            isEnabled: () => this.inlineEditService.isShowingSuggestion()
        });

        registry.registerCommand(InlineEditCommands.NEXT_SUGGESTION, {
            execute: () => {
                this.inlineEditService.nextSuggestion();
            },
            isEnabled: () => this.inlineEditService.isShowingSuggestion()
        });

        registry.registerCommand(InlineEditCommands.PREVIOUS_SUGGESTION, {
            execute: () => {
                this.inlineEditService.previousSuggestion();
            },
            isEnabled: () => this.inlineEditService.isShowingSuggestion()
        });

        registry.registerCommand(InlineEditCommands.TOGGLE_INLINE_SUGGESTIONS, {
            execute: () => {
                const config = this.inlineEditService.getConfig();
                this.inlineEditService.updateConfig({ enabled: !config.enabled });
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: InlineEditCommands.TRIGGER_SUGGESTION.id,
            order: '1'
        });

        registry.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: InlineEditCommands.TOGGLE_INLINE_SUGGESTIONS.id,
            order: '2'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        // Trigger suggestion
        registry.registerKeybinding({
            command: InlineEditCommands.TRIGGER_SUGGESTION.id,
            keybinding: 'alt+\\',
            when: 'editorTextFocus'
        });

        // Accept suggestion with Tab
        registry.registerKeybinding({
            command: InlineEditCommands.ACCEPT_SUGGESTION.id,
            keybinding: 'tab',
            when: 'editorTextFocus && ai.inlineSuggestionVisible'
        });

        // Accept word with Ctrl+Right
        registry.registerKeybinding({
            command: InlineEditCommands.ACCEPT_WORD.id,
            keybinding: 'ctrlcmd+right',
            when: 'editorTextFocus && ai.inlineSuggestionVisible'
        });

        // Accept line with Ctrl+End
        registry.registerKeybinding({
            command: InlineEditCommands.ACCEPT_LINE.id,
            keybinding: 'ctrlcmd+end',
            when: 'editorTextFocus && ai.inlineSuggestionVisible'
        });

        // Dismiss with Escape
        registry.registerKeybinding({
            command: InlineEditCommands.DISMISS_SUGGESTION.id,
            keybinding: 'escape',
            when: 'editorTextFocus && ai.inlineSuggestionVisible'
        });

        // Next suggestion with Alt+]
        registry.registerKeybinding({
            command: InlineEditCommands.NEXT_SUGGESTION.id,
            keybinding: 'alt+]',
            when: 'editorTextFocus && ai.inlineSuggestionVisible'
        });

        // Previous suggestion with Alt+[
        registry.registerKeybinding({
            command: InlineEditCommands.PREVIOUS_SUGGESTION.id,
            keybinding: 'alt+[',
            when: 'editorTextFocus && ai.inlineSuggestionVisible'
        });

        // Toggle inline suggestions
        registry.registerKeybinding({
            command: InlineEditCommands.TOGGLE_INLINE_SUGGESTIONS.id,
            keybinding: 'alt+shift+i'
        });
    }
}
