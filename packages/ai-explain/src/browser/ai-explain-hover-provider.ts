// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { CancellationToken, Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import {
    AIExplainService,
    CodeExplanation,
    ExplainRequest
} from '../common/ai-explain-protocol';

/**
 * Event when explanation is ready to show
 */
export interface ExplanationReadyEvent {
    explanation: CodeExplanation;
    position: { line: number; column: number };
    uri: string;
}

@injectable()
export class AIExplainHoverProvider implements Disposable {
    @inject(AIExplainService)
    protected readonly explainService: AIExplainService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected readonly disposables = new DisposableCollection();
    protected readonly registeredEditors = new Set<string>();
    protected hoverProviderDisposables = new Map<string, monaco.IDisposable>();

    protected readonly onExplanationReadyEmitter = new Emitter<ExplanationReadyEvent>();
    readonly onExplanationReady: Event<ExplanationReadyEvent> = this.onExplanationReadyEmitter.event;

    protected enabled = true;
    protected debounceDelay = 500;
    protected lastHoverTime = 0;

    @postConstruct()
    protected init(): void {
        // Register on current editors
        this.editorManager.all.forEach(editor => {
            this.registerEditor(editor.editor);
        });

        // Listen for new editors
        this.disposables.push(
            this.editorManager.onCreated(widget => {
                this.registerEditor(widget.editor);
            })
        );

        // Cleanup when editors close
        this.disposables.push(
            this.editorManager.onCurrentEditorChanged(() => {
                this.cleanupClosedEditors();
            })
        );
    }

    dispose(): void {
        this.disposables.dispose();
        this.hoverProviderDisposables.forEach(d => d.dispose());
        this.hoverProviderDisposables.clear();
        this.onExplanationReadyEmitter.dispose();
    }

    /**
     * Enable or disable the hover provider
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if hover provider is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Set debounce delay for hover
     */
    setDebounceDelay(delay: number): void {
        this.debounceDelay = delay;
    }

    /**
     * Manually trigger explanation at current position
     */
    async explainAtCursor(): Promise<CodeExplanation | undefined> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return undefined;
        }

        const model = editor.getControl().getModel();
        const position = editor.getControl().getPosition();

        if (!model || !position) {
            return undefined;
        }

        const word = model.getWordAtPosition(position);
        if (!word) {
            return undefined;
        }

        const lineContent = model.getLineContent(position.lineNumber);

        // Get context (lines before and after)
        const startLine = Math.max(1, position.lineNumber - 5);
        const endLine = Math.min(model.getLineCount(), position.lineNumber + 5);

        const beforeContext: string[] = [];
        const afterContext: string[] = [];

        for (let i = startLine; i < position.lineNumber; i++) {
            beforeContext.push(model.getLineContent(i));
        }
        for (let i = position.lineNumber + 1; i <= endLine; i++) {
            afterContext.push(model.getLineContent(i));
        }

        const request: ExplainRequest = {
            code: lineContent,
            language: this.getLanguageId(model),
            filePath: model.uri.toString(),
            startLine: position.lineNumber,
            startColumn: position.column,
            symbolName: word.word,
            context: {
                before: beforeContext,
                after: afterContext
            },
            detailLevel: 'detailed',
            includeExamples: true
        };

        const explanation = await this.explainService.explainCode(request);

        this.onExplanationReadyEmitter.fire({
            explanation,
            position: { line: position.lineNumber, column: position.column },
            uri: model.uri.toString()
        });

        return explanation;
    }

    protected registerEditor(editor: unknown): void {
        if (!this.isMonacoEditor(editor)) {
            return;
        }

        const monacoEditor = editor as MonacoEditor;
        const control = monacoEditor.getControl();
        const model = control.getModel();

        if (!model) {
            return;
        }

        const uri = model.uri.toString();

        if (this.registeredEditors.has(uri)) {
            return;
        }

        // Register hover provider for this editor's language
        const languageId = this.getLanguageId(model);
        const disposable = monaco.languages.registerHoverProvider(languageId, {
            provideHover: (m, position, token) =>
                this.provideHover(m, position, token)
        });

        this.hoverProviderDisposables.set(uri, disposable);
        this.registeredEditors.add(uri);
    }

    protected async provideHover(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        token: CancellationToken
    ): Promise<monaco.languages.Hover | null> {
        if (!this.enabled) {
            return null;
        }

        // Debounce
        const now = Date.now();
        if (now - this.lastHoverTime < this.debounceDelay) {
            return null;
        }
        this.lastHoverTime = now;

        const word = model.getWordAtPosition(position);
        if (!word) {
            return null;
        }

        // Only explain meaningful code (not just whitespace or punctuation)
        if (word.word.length < 2) {
            return null;
        }

        try {
            // Get the full line for context
            const lineContent = model.getLineContent(position.lineNumber);

            // Get surrounding context
            const startLine = Math.max(1, position.lineNumber - 3);
            const endLine = Math.min(model.getLineCount(), position.lineNumber + 3);

            const beforeContext: string[] = [];
            const afterContext: string[] = [];

            for (let i = startLine; i < position.lineNumber; i++) {
                beforeContext.push(model.getLineContent(i));
            }
            for (let i = position.lineNumber + 1; i <= endLine; i++) {
                afterContext.push(model.getLineContent(i));
            }

            const request: ExplainRequest = {
                code: lineContent,
                language: this.getLanguageId(model),
                filePath: model.uri.toString(),
                startLine: position.lineNumber,
                startColumn: position.column,
                symbolName: word.word,
                context: {
                    before: beforeContext,
                    after: afterContext
                },
                detailLevel: 'brief',
                maxLength: 200
            };

            if (token.isCancellationRequested) {
                return null;
            }

            const hoverExplanation = await this.explainService.getHoverExplanation(request, token);

            if (token.isCancellationRequested || !hoverExplanation.contents) {
                return null;
            }

            // Build hover content
            const contents: monaco.IMarkdownString[] = [];

            // Main explanation
            contents.push({
                value: hoverExplanation.contents,
                isTrusted: true
            });

            // Add "Get more details" hint if available
            if (hoverExplanation.hasMoreDetails) {
                contents.push({
                    value: '_Press `Ctrl+Shift+E` for detailed explanation_',
                    isTrusted: true
                });
            }

            return {
                contents,
                range: {
                    startLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endLineNumber: position.lineNumber,
                    endColumn: word.endColumn
                }
            };
        } catch (error) {
            console.error('AI Explain hover error:', error);
            return null;
        }
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

    protected getLanguageId(model: monaco.editor.ITextModel): string {
        const languageId = model.getLanguageId();

        // Map Monaco language IDs to our language identifiers
        const languageMap: Record<string, string> = {
            'typescript': 'typescript',
            'javascript': 'javascript',
            'typescriptreact': 'tsx',
            'javascriptreact': 'jsx',
            'python': 'python',
            'java': 'java',
            'csharp': 'csharp',
            'cpp': 'cpp',
            'c': 'c',
            'go': 'go',
            'rust': 'rust',
            'ruby': 'ruby',
            'php': 'php',
            'swift': 'swift',
            'kotlin': 'kotlin',
            'scala': 'scala',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'less': 'less',
            'json': 'json',
            'yaml': 'yaml',
            'markdown': 'markdown',
            'sql': 'sql',
            'shell': 'shell',
            'bash': 'bash',
            'powershell': 'powershell'
        };

        return languageMap[languageId] || languageId;
    }

    protected cleanupClosedEditors(): void {
        const openUris = new Set(
            this.editorManager.all
                .map(w => {
                    const editor = w.editor;
                    if (this.isMonacoEditor(editor)) {
                        const model = (editor as MonacoEditor).getControl().getModel();
                        return model?.uri.toString();
                    }
                    return undefined;
                })
                .filter((uri): uri is string => uri !== undefined)
        );

        // Cleanup disposed editors
        this.registeredEditors.forEach(uri => {
            if (!openUris.has(uri)) {
                const disposable = this.hoverProviderDisposables.get(uri);
                if (disposable) {
                    disposable.dispose();
                    this.hoverProviderDisposables.delete(uri);
                }
                this.registeredEditors.delete(uri);
            }
        });
    }
}
