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
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import {
    EnhancedContextProvider,
    ContextProviderCategory,
    ContextContentType,
    ContextResolutionOptions,
    ResolvedContextMention,
    ContextMentionUtils
} from '../../common';

@injectable()
export class SelectionContextProvider implements EnhancedContextProvider {
    readonly id = 'context.selection';
    readonly name = 'selection';
    readonly label = 'Editor Selection';
    readonly description = 'Current text selection in the active editor';
    readonly category = ContextProviderCategory.Editor;
    readonly iconClass = 'codicon codicon-selection';
    readonly acceptsArguments = false;
    readonly examples = ['@selection'];

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    async canResolve(_arg?: string): Promise<boolean> {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            return false;
        }

        const monacoEditor = this.getMonacoEditor(editor);
        if (!monacoEditor) {
            return false;
        }

        const selection = monacoEditor.getSelection();
        return selection !== null && !selection.isEmpty();
    }

    async resolve(_arg?: string, options?: ContextResolutionOptions): Promise<ResolvedContextMention | undefined> {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            return undefined;
        }

        const monacoEditor = this.getMonacoEditor(editor);
        if (!monacoEditor) {
            return undefined;
        }

        const selection = monacoEditor.getSelection();
        if (!selection || selection.isEmpty()) {
            return undefined;
        }

        const model = monacoEditor.getModel();
        if (!model) {
            return undefined;
        }

        const selectedText = model.getValueInRange(selection);
        const uri = editor.editor.uri;
        const language = model.getLanguageId();

        let content = selectedText;
        if (options?.includeLineNumbers) {
            const startLine = selection.startLineNumber;
            const lines = selectedText.split('\n');
            const padWidth = String(startLine + lines.length - 1).length;
            content = lines.map((line: string, i: number) =>
                `${String(startLine + i).padStart(padWidth, ' ')} | ${line}`
            ).join('\n');
        }

        // Add file context
        const header = `// Selection from: ${uri.path.base} (lines ${selection.startLineNumber}-${selection.endLineNumber})\n`;
        const formattedContent = header + '```' + language + '\n' + content + '\n```';

        return {
            providerId: this.id,
            label: `Selection (${uri.path.base}:${selection.startLineNumber}-${selection.endLineNumber})`,
            content: formattedContent,
            contentType: ContextContentType.Code,
            contentSize: formattedContent.length,
            tokenEstimate: ContextMentionUtils.estimateTokens(formattedContent),
            sourceUri: uri.toString(),
            metadata: {
                startLine: selection.startLineNumber,
                endLine: selection.endLineNumber,
                startColumn: selection.startColumn,
                endColumn: selection.endColumn,
                language
            }
        };
    }

    protected getMonacoEditor(editor: EditorWidget): monaco.editor.ICodeEditor | undefined {
        // Access the Monaco editor instance
        const editorWidget = editor.editor;
        if ('getControl' in editorWidget && typeof editorWidget.getControl === 'function') {
            return editorWidget.getControl() as monaco.editor.ICodeEditor;
        }
        return undefined;
    }
}
