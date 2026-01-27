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
import { Emitter } from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';
import {
    InlineEditService,
    InlineEditSession,
    InlineEditConfig,
    EditContext,
    GhostTextSuggestion,
    InlineSuggestionProvider,
    GhostTextDecorationService,
    SessionState,
    DEFAULT_INLINE_EDIT_CONFIG
} from '../common';

@injectable()
export class InlineEditServiceImpl implements InlineEditService {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(GhostTextDecorationService)
    protected readonly decorationService: GhostTextDecorationService;

    protected config: InlineEditConfig = { ...DEFAULT_INLINE_EDIT_CONFIG };
    protected providers: InlineSuggestionProvider[] = [];
    protected currentSession?: InlineEditSession;
    protected debounceTimer?: NodeJS.Timeout;

    protected readonly onSuggestionShownEmitter = new Emitter<GhostTextSuggestion>();
    protected readonly onSuggestionAcceptedEmitter = new Emitter<GhostTextSuggestion>();
    protected readonly onSuggestionDismissedEmitter = new Emitter<void>();

    @postConstruct()
    protected init(): void {
        // Listen for editor changes
        this.editorManager.onActiveEditorChanged(() => {
            if (this.currentSession) {
                this.dismissSuggestion();
            }
        });
    }

    async startSession(documentUri: string): Promise<InlineEditSession> {
        // End any existing session
        if (this.currentSession) {
            this.endSession(this.currentSession.id);
        }

        const session: InlineEditSession = {
            id: this.generateSessionId(),
            documentUri,
            suggestions: [],
            activeSuggestionIndex: 0,
            state: SessionState.Idle,
            context: this.createEmptyContext(documentUri),
            startedAt: Date.now()
        };

        this.currentSession = session;
        return session;
    }

    endSession(sessionId: string): void {
        if (this.currentSession?.id === sessionId) {
            this.dismissSuggestion();
            this.currentSession = undefined;
        }
    }

    getCurrentSession(): InlineEditSession | undefined {
        return this.currentSession;
    }

    async triggerSuggestion(context: EditContext): Promise<void> {
        if (!this.config.enabled) {
            return;
        }

        // Check language support
        if (!this.config.enabledLanguages.includes(context.languageId)) {
            return;
        }

        // Check minimum trigger length
        const triggerText = context.prefix.split('\n').pop() || '';
        if (triggerText.length < this.config.minTriggerLength) {
            return;
        }

        // Clear existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce the suggestion request
        this.debounceTimer = setTimeout(async () => {
            await this.generateSuggestions(context);
        }, this.config.debounceDelay);
    }

    protected async generateSuggestions(context: EditContext): Promise<void> {
        if (!this.currentSession) {
            return;
        }

        this.currentSession.state = SessionState.Generating;
        this.currentSession.context = context;

        // Sort providers by priority
        const sortedProviders = [...this.providers].sort((a, b) => b.priority - a.priority);

        const allSuggestions: GhostTextSuggestion[] = [];

        for (const provider of sortedProviders) {
            try {
                const suggestions = await provider.provideSuggestions(context);
                allSuggestions.push(...suggestions);
            } catch (error) {
                console.error(`Provider ${provider.id} error:`, error);
            }
        }

        if (allSuggestions.length === 0) {
            this.currentSession.state = SessionState.Idle;
            return;
        }

        // Sort by confidence
        allSuggestions.sort((a, b) => b.confidence - a.confidence);

        // Limit suggestions
        this.currentSession.suggestions = allSuggestions.slice(0, 5);
        this.currentSession.activeSuggestionIndex = 0;
        this.currentSession.state = SessionState.Showing;

        // Show first suggestion
        this.showActiveSuggestion();
    }

    protected showActiveSuggestion(): void {
        if (!this.currentSession || this.currentSession.suggestions.length === 0) {
            return;
        }

        const suggestion = this.currentSession.suggestions[this.currentSession.activeSuggestionIndex];
        this.decorationService.showGhostText(suggestion);
        this.onSuggestionShownEmitter.fire(suggestion);
    }

    async acceptSuggestion(): Promise<boolean> {
        if (!this.currentSession || this.currentSession.state !== SessionState.Showing) {
            return false;
        }

        const suggestion = this.currentSession.suggestions[this.currentSession.activeSuggestionIndex];
        if (!suggestion) {
            return false;
        }

        this.currentSession.state = SessionState.Accepting;

        try {
            // Insert the suggestion text
            await this.insertText(suggestion.text, suggestion.position, suggestion.replaceRange);

            this.decorationService.hideGhostText();
            this.onSuggestionAcceptedEmitter.fire(suggestion);

            // Reset session
            this.currentSession.suggestions = [];
            this.currentSession.state = SessionState.Idle;

            return true;

        } catch (error) {
            console.error('Error accepting suggestion:', error);
            this.currentSession.state = SessionState.Showing;
            return false;
        }
    }

    async acceptPartial(type: 'word' | 'line'): Promise<boolean> {
        if (!this.currentSession || this.currentSession.state !== SessionState.Showing) {
            return false;
        }

        const suggestion = this.currentSession.suggestions[this.currentSession.activeSuggestionIndex];
        if (!suggestion) {
            return false;
        }

        let partialText: string;

        if (type === 'word') {
            // Accept first word
            const match = suggestion.text.match(/^\s*\S+/);
            partialText = match ? match[0] : suggestion.text;
        } else {
            // Accept first line
            const lineEnd = suggestion.text.indexOf('\n');
            partialText = lineEnd > 0 ? suggestion.text.substring(0, lineEnd) : suggestion.text;
        }

        try {
            await this.insertText(partialText, suggestion.position);

            // Update suggestion with remaining text
            const remainingText = suggestion.text.substring(partialText.length);
            if (remainingText.trim()) {
                suggestion.text = remainingText;
                suggestion.previewLines = remainingText.split('\n').slice(0, 5);
                this.showActiveSuggestion();
            } else {
                this.dismissSuggestion();
            }

            return true;

        } catch (error) {
            console.error('Error accepting partial suggestion:', error);
            return false;
        }
    }

    dismissSuggestion(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Cancel all provider requests
        for (const provider of this.providers) {
            provider.cancel();
        }

        this.decorationService.hideGhostText();

        if (this.currentSession) {
            this.currentSession.suggestions = [];
            this.currentSession.state = SessionState.Dismissed;
        }

        this.onSuggestionDismissedEmitter.fire();
    }

    nextSuggestion(): void {
        if (!this.currentSession || this.currentSession.suggestions.length <= 1) {
            return;
        }

        this.currentSession.activeSuggestionIndex =
            (this.currentSession.activeSuggestionIndex + 1) % this.currentSession.suggestions.length;

        this.showActiveSuggestion();
    }

    previousSuggestion(): void {
        if (!this.currentSession || this.currentSession.suggestions.length <= 1) {
            return;
        }

        this.currentSession.activeSuggestionIndex =
            (this.currentSession.activeSuggestionIndex - 1 + this.currentSession.suggestions.length) %
            this.currentSession.suggestions.length;

        this.showActiveSuggestion();
    }

    getConfig(): InlineEditConfig {
        return { ...this.config };
    }

    updateConfig(config: Partial<InlineEditConfig>): void {
        this.config = { ...this.config, ...config };
        this.decorationService.updateStyling(this.config.ghostTextOpacity);
    }

    registerProvider(provider: InlineSuggestionProvider): void {
        this.providers.push(provider);
    }

    isShowingSuggestion(): boolean {
        return this.currentSession?.state === SessionState.Showing;
    }

    onSuggestionShown(callback: (suggestion: GhostTextSuggestion) => void): void {
        this.onSuggestionShownEmitter.event(callback);
    }

    onSuggestionAccepted(callback: (suggestion: GhostTextSuggestion) => void): void {
        this.onSuggestionAcceptedEmitter.event(callback);
    }

    onSuggestionDismissed(callback: () => void): void {
        this.onSuggestionDismissedEmitter.event(callback);
    }

    protected async insertText(
        text: string,
        position: { lineNumber: number; column: number },
        replaceRange?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }
    ): Promise<void> {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            throw new Error('No active editor');
        }

        const monacoEditor = (editor.editor as any).getControl?.();
        if (!monacoEditor) {
            throw new Error('Cannot access Monaco editor');
        }

        const model = monacoEditor.getModel();
        if (!model) {
            throw new Error('No model available');
        }

        const range = replaceRange || {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column
        };

        monacoEditor.executeEdits('ai-inline-edit', [{
            range,
            text,
            forceMoveMarkers: true
        }]);
    }

    protected createEmptyContext(documentUri: string): EditContext {
        return {
            filePath: documentUri,
            languageId: '',
            prefix: '',
            suffix: '',
            currentLine: '',
            cursorPosition: { lineNumber: 1, column: 1 },
            surroundingContext: []
        };
    }

    protected generateSessionId(): string {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
