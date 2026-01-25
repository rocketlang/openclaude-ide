// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { OpenClaudeBackendService, Collaborator, CursorPosition, SelectionRange } from '../../common/openclaude-protocol';
import * as monaco from '@theia/monaco-editor-core';

/**
 * Provides cursor and selection decorations for collaborators
 */
@injectable()
export class CursorDecoratorProvider {

    @inject(EditorManager)
    protected readonly editorManager!: EditorManager;

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    protected decorations: Map<string, string[]> = new Map();
    protected sessionId: string | undefined;
    protected updateInterval: number | undefined;

    @postConstruct()
    protected init(): void {
        // Listen for editor changes
        this.editorManager.onCurrentEditorChanged(() => {
            this.clearDecorations();
        });
    }

    /**
     * Start tracking cursors for a session
     */
    startTracking(sessionId: string): void {
        this.sessionId = sessionId;
        this.startUpdating();
    }

    /**
     * Stop tracking cursors
     */
    stopTracking(): void {
        this.sessionId = undefined;
        this.stopUpdating();
        this.clearDecorations();
    }

    /**
     * Start periodic updates
     */
    protected startUpdating(): void {
        this.stopUpdating();
        this.updateInterval = window.setInterval(() => {
            this.updateDecorations();
        }, 500); // Update every 500ms
    }

    /**
     * Stop periodic updates
     */
    protected stopUpdating(): void {
        if (this.updateInterval) {
            window.clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }
    }

    /**
     * Update decorations for all collaborators
     */
    protected async updateDecorations(): Promise<void> {
        if (!this.sessionId) {
            return;
        }

        const editor = this.editorManager.currentEditor;
        if (!editor || !(editor instanceof MonacoEditor)) {
            return;
        }

        try {
            const collaborators = await this.backendService.getCollaborators(this.sessionId);
            this.renderCollaborators(editor, collaborators);
        } catch (error) {
            console.error('[OpenClaude] Failed to update cursor decorations:', error);
        }
    }

    /**
     * Render collaborator cursors and selections
     */
    protected renderCollaborators(editor: MonacoEditor, collaborators: Collaborator[]): void {
        const monacoEditor = editor.getControl();
        const model = monacoEditor.getModel();
        if (!model) {
            return;
        }

        // Clear old decorations
        this.clearDecorations();

        // Add new decorations for each collaborator
        for (const collaborator of collaborators) {
            const decorationIds = this.createDecorationsForCollaborator(
                monacoEditor,
                model,
                collaborator
            );
            this.decorations.set(collaborator.user.id, decorationIds);
        }
    }

    /**
     * Create decorations for a single collaborator
     */
    protected createDecorationsForCollaborator(
        editor: monaco.editor.IStandaloneCodeEditor,
        model: monaco.editor.ITextModel,
        collaborator: Collaborator
    ): string[] {
        const decorations: monaco.editor.IModelDeltaDecoration[] = [];

        // Add cursor decoration
        if (collaborator.cursor) {
            decorations.push(this.createCursorDecoration(collaborator));
        }

        // Add selection decoration
        if (collaborator.selection) {
            decorations.push(this.createSelectionDecoration(collaborator));
        }

        // Apply decorations
        return editor.deltaDecorations([], decorations);
    }

    /**
     * Create cursor decoration
     */
    protected createCursorDecoration(collaborator: Collaborator): monaco.editor.IModelDeltaDecoration {
        const position = this.convertPosition(collaborator.cursor);
        const color = collaborator.color;

        return {
            range: new monaco.Range(
                position.line + 1,
                position.column + 1,
                position.line + 1,
                position.column + 1
            ),
            options: {
                className: 'openclaude-collaborator-cursor',
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                before: {
                    content: '|',
                    inlineClassName: 'openclaude-cursor-line',
                    inlineClassNameAffectsLetterSpacing: true
                },
                after: {
                    content: collaborator.user.name,
                    inlineClassName: 'openclaude-cursor-label',
                    inlineClassNameAffectsLetterSpacing: false
                },
                // Add custom styles via CSS variables
                overviewRuler: {
                    color,
                    position: monaco.editor.OverviewRulerLane.Full
                }
            }
        };
    }

    /**
     * Create selection decoration
     */
    protected createSelectionDecoration(collaborator: Collaborator): monaco.editor.IModelDeltaDecoration {
        if (!collaborator.selection) {
            throw new Error('Selection is required');
        }

        const start = this.convertPosition(collaborator.selection.start);
        const end = this.convertPosition(collaborator.selection.end);
        const color = collaborator.color;

        return {
            range: new monaco.Range(
                start.line + 1,
                start.column + 1,
                end.line + 1,
                end.column + 1
            ),
            options: {
                className: 'openclaude-collaborator-selection',
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                inlineClassName: `openclaude-selection-${this.colorToClass(color)}`,
                // Add opacity to the selection
                overviewRuler: {
                    color: this.addAlpha(color, 0.3),
                    position: monaco.editor.OverviewRulerLane.Full
                }
            }
        };
    }

    /**
     * Convert cursor position
     */
    protected convertPosition(position: CursorPosition): { line: number; column: number } {
        return {
            line: position.line,
            column: position.column
        };
    }

    /**
     * Convert color to CSS class name
     */
    protected colorToClass(color: string): string {
        return color.replace('#', 'color-');
    }

    /**
     * Add alpha channel to color
     */
    protected addAlpha(color: string, alpha: number): string {
        // Convert hex to rgba
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Clear all decorations
     */
    protected clearDecorations(): void {
        const editor = this.editorManager.currentEditor;
        if (!editor || !(editor instanceof MonacoEditor)) {
            return;
        }

        const monacoEditor = editor.getControl();
        for (const decorationIds of this.decorations.values()) {
            monacoEditor.deltaDecorations(decorationIds, []);
        }

        this.decorations.clear();
    }

    /**
     * Update local cursor position to backend
     */
    async updateLocalCursor(sessionId: string, cursor: CursorPosition): Promise<void> {
        try {
            await this.backendService.updateCursorPosition(sessionId, cursor);
        } catch (error) {
            console.error('[OpenClaude] Failed to update cursor:', error);
        }
    }

    /**
     * Update local selection to backend
     */
    async updateLocalSelection(sessionId: string, selection: SelectionRange): Promise<void> {
        try {
            await this.backendService.updateSelection(sessionId, selection);
        } catch (error) {
            console.error('[OpenClaude] Failed to update selection:', error);
        }
    }

    dispose(): void {
        this.stopTracking();
    }
}
