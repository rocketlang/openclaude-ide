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
import { EditorManager } from '@theia/editor/lib/browser';
import { GhostTextDecorationService, GhostTextSuggestion } from '../common';

@injectable()
export class GhostTextDecorationServiceImpl implements GhostTextDecorationService {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected decorationIds: string[] = [];
    protected ghostTextWidget?: any;
    protected currentOpacity: number = 0.5;
    protected isGhostTextVisible: boolean = false;

    @postConstruct()
    protected init(): void {
        // Add CSS for ghost text
        this.injectStyles();
    }

    showGhostText(suggestion: GhostTextSuggestion): void {
        this.hideGhostText();

        const editor = this.editorManager.currentEditor;
        if (!editor) {
            return;
        }

        const monacoEditor = (editor.editor as any).getControl?.();
        if (!monacoEditor) {
            return;
        }

        const { position, text, isMultiLine } = suggestion;

        if (isMultiLine) {
            this.showMultiLineGhostText(monacoEditor, position, text);
        } else {
            this.showInlineGhostText(monacoEditor, position, text);
        }

        this.isGhostTextVisible = true;
    }

    hideGhostText(): void {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            return;
        }

        const monacoEditor = (editor.editor as any).getControl?.();
        if (monacoEditor && this.decorationIds.length > 0) {
            monacoEditor.removeDecorations(this.decorationIds);
            this.decorationIds = [];
        }

        if (this.ghostTextWidget) {
            this.ghostTextWidget.dispose?.();
            this.ghostTextWidget = undefined;
        }

        this.isGhostTextVisible = false;
    }

    updateStyling(opacity: number): void {
        this.currentOpacity = opacity;
        this.updateGhostTextStyle();
    }

    isVisible(): boolean {
        return this.isGhostTextVisible;
    }

    protected showInlineGhostText(
        monacoEditor: any,
        position: { lineNumber: number; column: number },
        text: string
    ): void {
        // Use Monaco's inline decorations for single-line suggestions
        const model = monacoEditor.getModel();
        if (!model) {
            return;
        }

        // Create inline decoration
        const decorations = [{
            range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            },
            options: {
                after: {
                    content: text,
                    inlineClassName: 'ai-ghost-text-inline'
                },
                description: 'ai-inline-suggestion'
            }
        }];

        this.decorationIds = monacoEditor.deltaDecorations(this.decorationIds, decorations);
    }

    protected showMultiLineGhostText(
        monacoEditor: any,
        position: { lineNumber: number; column: number },
        text: string
    ): void {
        const lines = text.split('\n');
        const firstLine = lines[0];
        const remainingLines = lines.slice(1);

        // Show first part as inline decoration
        if (firstLine) {
            this.showInlineGhostText(monacoEditor, position, firstLine);
        }

        // Show remaining lines as a widget below
        if (remainingLines.length > 0) {
            this.showGhostTextWidget(monacoEditor, position, remainingLines);
        }
    }

    protected showGhostTextWidget(
        monacoEditor: any,
        position: { lineNumber: number; column: number },
        lines: string[]
    ): void {
        // Create a content widget for multi-line suggestions
        const domNode = document.createElement('div');
        domNode.className = 'ai-ghost-text-widget';
        domNode.style.opacity = String(this.currentOpacity);

        lines.forEach((line, index) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'ai-ghost-text-line';
            lineDiv.textContent = line || ' ';
            domNode.appendChild(lineDiv);
        });

        const widget = {
            getId: () => 'ai-ghost-text-widget',
            getDomNode: () => domNode,
            getPosition: () => ({
                position: {
                    lineNumber: position.lineNumber + 1,
                    column: 1
                },
                preference: [1] // BELOW
            }),
            dispose: () => {
                try {
                    monacoEditor.removeContentWidget(widget);
                } catch (e) {
                    // Widget may already be removed
                }
            }
        };

        try {
            monacoEditor.addContentWidget(widget);
            this.ghostTextWidget = widget;
        } catch (error) {
            console.error('Error adding ghost text widget:', error);
        }
    }

    protected injectStyles(): void {
        const styleId = 'ai-ghost-text-styles';
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .ai-ghost-text-inline {
                opacity: ${this.currentOpacity};
                color: var(--theia-editorGhostText-foreground, #888888) !important;
                font-style: italic;
                pointer-events: none;
            }

            .ai-ghost-text-widget {
                position: relative;
                background: transparent;
                font-family: var(--theia-code-font-family);
                font-size: var(--theia-code-font-size);
                line-height: var(--theia-code-line-height);
                color: var(--theia-editorGhostText-foreground, #888888);
                font-style: italic;
                pointer-events: none;
                padding-left: 0;
                margin-left: 0;
                z-index: 10;
            }

            .ai-ghost-text-line {
                white-space: pre;
                opacity: ${this.currentOpacity};
            }

            /* Inline toolbar for accept/reject */
            .ai-inline-toolbar {
                position: absolute;
                display: flex;
                gap: 4px;
                padding: 4px;
                background: var(--theia-editor-background);
                border: 1px solid var(--theia-widget-border);
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                z-index: 100;
            }

            .ai-inline-toolbar button {
                padding: 2px 8px;
                font-size: 11px;
                border: none;
                border-radius: 3px;
                cursor: pointer;
            }

            .ai-inline-toolbar .accept {
                background: var(--theia-button-background);
                color: var(--theia-button-foreground);
            }

            .ai-inline-toolbar .dismiss {
                background: var(--theia-button-secondaryBackground);
                color: var(--theia-button-secondaryForeground);
            }

            .ai-inline-toolbar .accept:hover {
                background: var(--theia-button-hoverBackground);
            }

            .ai-inline-toolbar .dismiss:hover {
                background: var(--theia-button-secondaryHoverBackground);
            }

            /* Hint text */
            .ai-ghost-text-hint {
                position: absolute;
                bottom: -16px;
                left: 0;
                font-size: 10px;
                color: var(--theia-descriptionForeground);
                opacity: 0.7;
            }
        `;
        document.head.appendChild(style);
    }

    protected updateGhostTextStyle(): void {
        const styleElement = document.getElementById('ai-ghost-text-styles');
        if (styleElement) {
            styleElement.remove();
        }
        this.injectStyles();
    }
}
