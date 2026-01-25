// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { OpenClaudeBackendService, CompletionRequest, CompletionItem, CompletionItemKind } from '../../common/openclaude-protocol';
import * as monaco from '@theia/monaco-editor-core';

/**
 * AI-powered code completion provider for Monaco
 *
 * Provides intelligent code suggestions using AI backend
 */
@injectable()
export class AICompletionProvider implements monaco.languages.CompletionItemProvider {

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    // Cache for completion results
    protected cache = new Map<string, { items: monaco.languages.CompletionItem[]; timestamp: number }>();
    protected readonly CACHE_TTL = 30000; // 30 seconds

    // Debouncing
    protected pendingRequest: Promise<monaco.languages.CompletionList | null> | undefined;
    protected lastRequestTime = 0;
    protected readonly DEBOUNCE_DELAY = 300; // 300ms

    @postConstruct()
    protected init(): void {
        // Register for all languages
        monaco.languages.registerCompletionItemProvider('*', this);
        console.log('[OpenClaude] AI Completion Provider registered');
    }

    /**
     * Provide completion items
     */
    async provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.CompletionContext,
        token: monaco.CancellationToken
    ): Promise<monaco.languages.CompletionList | null> {
        // Check if cancelled
        if (token.isCancellationRequested) {
            return null;
        }

        // Get cache key
        const cacheKey = this.getCacheKey(model, position);

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return {
                suggestions: cached.items,
                incomplete: false
            };
        }

        // Debounce requests
        const now = Date.now();
        if (now - this.lastRequestTime < this.DEBOUNCE_DELAY) {
            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, this.DEBOUNCE_DELAY));

            // Check if still valid
            if (token.isCancellationRequested) {
                return null;
            }
        }

        this.lastRequestTime = now;

        try {
            // Build request
            const request: CompletionRequest = {
                filePath: model.uri.toString(),
                content: model.getValue(),
                line: position.lineNumber,
                column: position.column,
                triggerCharacter: context.triggerCharacter,
                language: model.getLanguageId()
            };

            // Get completions from backend
            const result = await this.backendService.getCompletions(request);

            // Check if cancelled during request
            if (token.isCancellationRequested) {
                return null;
            }

            // Convert to Monaco format
            const items = result.items.map(item => this.convertToMonacoItem(item, position));

            // Cache results
            this.cache.set(cacheKey, { items, timestamp: Date.now() });

            // Cleanup old cache entries
            this.cleanupCache();

            return {
                suggestions: items,
                incomplete: result.isIncomplete
            };
        } catch (error) {
            console.error('[OpenClaude] Completion request failed:', error);
            return null;
        }
    }

    /**
     * Resolve completion item with additional details
     */
    async resolveCompletionItem?(
        item: monaco.languages.CompletionItem,
        token: monaco.CancellationToken
    ): Promise<monaco.languages.CompletionItem> {
        // Already has all details
        return item;
    }

    /**
     * Convert backend completion item to Monaco format
     */
    protected convertToMonacoItem(
        item: CompletionItem,
        position: monaco.Position
    ): monaco.languages.CompletionItem {
        const monacoItem: monaco.languages.CompletionItem = {
            label: item.isAI ? `🤖 ${item.label}` : item.label,
            kind: this.convertKind(item.kind),
            insertText: item.insertText,
            detail: item.detail,
            documentation: item.documentation ? {
                value: item.documentation,
                isTrusted: true
            } : undefined,
            sortText: item.sortText || (item.isAI ? `0_${item.label}` : item.label),
            filterText: item.filterText || item.label,
            range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            ),
            // Add AI badge tag
            tags: item.isAI ? [1] : undefined, // CompletionItemTag.Deprecated = 1 (reused for AI badge)
        };

        // Add confidence indicator for AI suggestions
        if (item.isAI && item.confidence !== undefined) {
            monacoItem.detail = `${monacoItem.detail || ''} (${item.confidence}% confidence)`.trim();
        }

        return monacoItem;
    }

    /**
     * Convert completion item kind to Monaco kind
     */
    protected convertKind(kind: CompletionItemKind): monaco.languages.CompletionItemKind {
        // Direct mapping - CompletionItemKind enum values match Monaco's
        return kind as unknown as monaco.languages.CompletionItemKind;
    }

    /**
     * Get cache key for model and position
     */
    protected getCacheKey(model: monaco.editor.ITextModel, position: monaco.Position): string {
        const line = model.getLineContent(position.lineNumber);
        const prefix = line.substring(0, position.column - 1);
        return `${model.uri.toString()}:${position.lineNumber}:${prefix}`;
    }

    /**
     * Cleanup old cache entries
     */
    protected cleanupCache(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.cache.delete(key);
        }
    }
}
