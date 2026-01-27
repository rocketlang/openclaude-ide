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

import { Event } from '@theia/core';

/**
 * Categories for organizing context providers
 */
export enum ContextProviderCategory {
    /** File and workspace related */
    File = 'file',
    /** Editor and selection related */
    Editor = 'editor',
    /** Source control related */
    Git = 'git',
    /** Terminal and output related */
    Terminal = 'terminal',
    /** External resources */
    External = 'external',
    /** Code structure and symbols */
    Code = 'code',
    /** System and environment */
    System = 'system'
}

/**
 * Content type for resolved context
 */
export enum ContextContentType {
    /** Plain text content */
    Text = 'text',
    /** Source code content */
    Code = 'code',
    /** Markdown content */
    Markdown = 'markdown',
    /** JSON data */
    Json = 'json',
    /** Binary/image data (base64) */
    Binary = 'binary',
    /** Structured data */
    Structured = 'structured'
}

/**
 * Result of resolving a context mention
 */
export interface ResolvedContextMention {
    /** The provider that resolved this */
    providerId: string;
    /** Display label for the context */
    label: string;
    /** The actual content */
    content: string;
    /** Content type */
    contentType: ContextContentType;
    /** Size of content in bytes */
    contentSize: number;
    /** Token estimate for LLM context */
    tokenEstimate?: number;
    /** Source URI if applicable */
    sourceUri?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
    /** Whether content was truncated */
    truncated?: boolean;
    /** Original size if truncated */
    originalSize?: number;
}

/**
 * Options for context resolution
 */
export interface ContextResolutionOptions {
    /** Maximum content size in bytes */
    maxSize?: number;
    /** Maximum token count */
    maxTokens?: number;
    /** Whether to include line numbers for code */
    includeLineNumbers?: boolean;
    /** Whether to include metadata */
    includeMetadata?: boolean;
    /** Specific file patterns to include (for folder/codebase) */
    includePatterns?: string[];
    /** File patterns to exclude */
    excludePatterns?: string[];
    /** Depth limit for recursive operations */
    maxDepth?: number;
}

/**
 * Suggestion for context mention autocomplete
 */
export interface ContextMentionSuggestion {
    /** Unique identifier */
    id: string;
    /** The provider id */
    providerId: string;
    /** Display label */
    label: string;
    /** Description shown in autocomplete */
    description: string;
    /** Icon class */
    iconClass?: string;
    /** Text to insert when selected */
    insertText: string;
    /** Sort priority (higher = first) */
    sortPriority: number;
    /** Whether this is a path/argument suggestion */
    isArgumentSuggestion?: boolean;
    /** Detail text */
    detail?: string;
}

/**
 * Enhanced context provider interface
 */
export interface EnhancedContextProvider {
    /** Unique provider identifier */
    readonly id: string;
    /** Provider name (used after @) */
    readonly name: string;
    /** Human-readable label */
    readonly label: string;
    /** Description of what this provider does */
    readonly description: string;
    /** Category for organization */
    readonly category: ContextProviderCategory;
    /** Icon class for display */
    readonly iconClass?: string;
    /** Whether this provider accepts arguments */
    readonly acceptsArguments: boolean;
    /** Argument description */
    readonly argumentDescription?: string;
    /** Example usages */
    readonly examples?: string[];

    /**
     * Check if this provider can resolve the given argument
     */
    canResolve(arg?: string): Promise<boolean>;

    /**
     * Resolve the context for the given argument
     */
    resolve(arg?: string, options?: ContextResolutionOptions): Promise<ResolvedContextMention | undefined>;

    /**
     * Get autocomplete suggestions for arguments
     */
    getSuggestions?(partial: string): Promise<ContextMentionSuggestion[]>;

    /**
     * Validate the argument before resolution
     */
    validateArgument?(arg: string): Promise<{ valid: boolean; error?: string }>;
}

/**
 * Registry for managing context providers
 */
export const ContextMentionRegistry = Symbol('ContextMentionRegistry');
export interface ContextMentionRegistry {
    /**
     * Register a context provider
     */
    registerProvider(provider: EnhancedContextProvider): void;

    /**
     * Unregister a provider by id
     */
    unregisterProvider(id: string): void;

    /**
     * Get a provider by name
     */
    getProvider(name: string): EnhancedContextProvider | undefined;

    /**
     * Get all registered providers
     */
    getAllProviders(): EnhancedContextProvider[];

    /**
     * Get providers by category
     */
    getProvidersByCategory(category: ContextProviderCategory): EnhancedContextProvider[];

    /**
     * Resolve a context mention
     */
    resolve(
        providerName: string,
        arg?: string,
        options?: ContextResolutionOptions
    ): Promise<ResolvedContextMention | undefined>;

    /**
     * Get autocomplete suggestions for the given input
     */
    getSuggestions(input: string, cursorPosition: number): Promise<ContextMentionSuggestion[]>;

    /**
     * Event fired when providers change
     */
    readonly onProvidersChanged: Event<void>;
}

/**
 * Contribution interface for registering context providers
 */
export const ContextMentionContribution = Symbol('ContextMentionContribution');
export interface ContextMentionContribution {
    /**
     * Register context providers
     */
    registerContextProviders(registry: ContextMentionRegistry): void;
}

/**
 * Utility functions for context mentions
 */
export namespace ContextMentionUtils {
    /**
     * Estimate token count for text (rough approximation)
     */
    export function estimateTokens(text: string): number {
        // Rough estimate: ~4 characters per token for English text
        // Code tends to have more tokens due to symbols
        return Math.ceil(text.length / 3.5);
    }

    /**
     * Truncate content to fit within token limit
     */
    export function truncateToTokenLimit(content: string, maxTokens: number): { content: string; truncated: boolean } {
        const estimated = estimateTokens(content);
        if (estimated <= maxTokens) {
            return { content, truncated: false };
        }

        // Calculate approximate character limit
        const targetChars = Math.floor(maxTokens * 3.5);
        const truncated = content.slice(0, targetChars);

        // Try to truncate at a line break
        const lastNewline = truncated.lastIndexOf('\n');
        if (lastNewline > targetChars * 0.8) {
            return {
                content: truncated.slice(0, lastNewline) + '\n... [truncated]',
                truncated: true
            };
        }

        return {
            content: truncated + '\n... [truncated]',
            truncated: true
        };
    }

    /**
     * Format file content with optional line numbers
     */
    export function formatFileContent(
        content: string,
        options?: { lineNumbers?: boolean; language?: string; filePath?: string }
    ): string {
        const lines = content.split('\n');
        let result = '';

        if (options?.filePath) {
            result += `// File: ${options.filePath}\n`;
        }

        if (options?.lineNumbers) {
            const padWidth = String(lines.length).length;
            result += lines.map((line, i) =>
                `${String(i + 1).padStart(padWidth, ' ')} | ${line}`
            ).join('\n');
        } else {
            result += content;
        }

        return result;
    }

    /**
     * Parse a mention string like "@file:path/to/file.ts"
     */
    export function parseMention(input: string): { provider: string; arg?: string } | undefined {
        const match = input.match(/^@([a-zA-Z][a-zA-Z0-9_-]*)(?::(.+))?$/);
        if (!match) {
            return undefined;
        }
        return {
            provider: match[1],
            arg: match[2]
        };
    }

    /**
     * Format bytes to human readable string
     */
    export function formatBytes(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
}
