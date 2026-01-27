// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CancellationToken } from '@theia/core';

/**
 * Search result source type
 */
export type SearchResultSource = 'file' | 'content' | 'symbol' | 'recent' | 'ai';

/**
 * Symbol kind for symbol search results
 */
export type SymbolKind =
    | 'class'
    | 'interface'
    | 'function'
    | 'method'
    | 'property'
    | 'variable'
    | 'constant'
    | 'enum'
    | 'type'
    | 'module'
    | 'namespace'
    | 'unknown';

/**
 * Individual search result
 */
export interface AISearchResult {
    /** Unique result ID */
    id: string;
    /** Result source */
    source: SearchResultSource;
    /** File URI */
    uri: string;
    /** File path (relative to workspace) */
    path: string;
    /** File name */
    name: string;
    /** File extension */
    extension?: string;
    /** Relevance score (0-1, higher is better) */
    score: number;
    /** Match highlights for display */
    highlights: SearchHighlight[];
    /** Preview text (for content matches) */
    preview?: string;
    /** Line number (for content/symbol matches) */
    line?: number;
    /** Column number */
    column?: number;
    /** Symbol kind (for symbol matches) */
    symbolKind?: SymbolKind;
    /** Symbol container (e.g., class name for methods) */
    symbolContainer?: string;
    /** Why this result matched (for AI explanations) */
    matchReason?: string;
    /** Icon identifier */
    icon?: string;
}

/**
 * Highlight range in text
 */
export interface SearchHighlight {
    /** Start offset in text */
    start: number;
    /** End offset in text */
    end: number;
    /** The highlighted text */
    text: string;
}

/**
 * Search options
 */
export interface AISearchOptions {
    /** Search query (natural language) */
    query: string;
    /** Root URIs to search in */
    rootUris?: string[];
    /** Maximum results to return */
    limit?: number;
    /** Search sources to include */
    sources?: SearchResultSource[];
    /** Use fuzzy matching */
    fuzzyMatch?: boolean;
    /** Include gitignored files */
    includeIgnored?: boolean;
    /** File patterns to include */
    includePatterns?: string[];
    /** File patterns to exclude */
    excludePatterns?: string[];
    /** Use AI for semantic understanding */
    useAI?: boolean;
    /** Include recent files in results */
    includeRecent?: boolean;
    /** Minimum score threshold (0-1) */
    minScore?: number;
}

/**
 * Search result set with metadata
 */
export interface AISearchResults {
    /** Search query */
    query: string;
    /** Results sorted by relevance */
    results: AISearchResult[];
    /** Total number of matches (may be more than returned) */
    totalMatches: number;
    /** Search duration in ms */
    duration: number;
    /** Whether results were truncated */
    truncated: boolean;
    /** Query interpretation (for AI queries) */
    interpretation?: string;
    /** Suggested refinements */
    suggestions?: string[];
}

/**
 * Query interpretation result
 */
export interface QueryInterpretation {
    /** Original query */
    original: string;
    /** Interpreted intent */
    intent: 'find_file' | 'find_content' | 'find_symbol' | 'find_related' | 'unknown';
    /** Extracted keywords */
    keywords: string[];
    /** File type hints */
    fileTypes?: string[];
    /** Symbol type hints */
    symbolTypes?: SymbolKind[];
    /** Suggested search patterns */
    patterns: string[];
    /** Confidence score */
    confidence: number;
}

/**
 * Service path for RPC
 */
export const aiSearchServicePath = '/services/ai-search';

/**
 * AI Search Service - Backend service for semantic file search
 */
export const AISearchService = Symbol('AISearchService');

export interface AISearchService {
    /**
     * Perform a search with the given query
     */
    search(options: AISearchOptions, token?: CancellationToken): Promise<AISearchResults>;

    /**
     * Interpret a natural language query
     */
    interpretQuery(query: string): Promise<QueryInterpretation>;

    /**
     * Get search suggestions based on partial input
     */
    getSuggestions(partial: string, limit?: number): Promise<string[]>;

    /**
     * Index a workspace for better search results
     */
    indexWorkspace(rootUri: string): Promise<void>;

    /**
     * Get indexing status
     */
    getIndexStatus(rootUri: string): Promise<{
        indexed: boolean;
        fileCount: number;
        lastIndexed?: number;
    }>;

    /**
     * Record a search result selection for learning
     */
    recordSelection(query: string, selectedUri: string): Promise<void>;
}

/**
 * Calculate relevance score for a result
 */
export function calculateScore(
    query: string,
    result: Partial<AISearchResult>,
    factors: {
        nameMatch?: number;
        pathMatch?: number;
        contentMatch?: number;
        recentBonus?: number;
        exactMatch?: number;
    } = {}
): number {
    const {
        nameMatch = 0,
        pathMatch = 0,
        contentMatch = 0,
        recentBonus = 0,
        exactMatch = 0
    } = factors;

    // Base scoring weights
    const weights = {
        name: 0.4,
        path: 0.2,
        content: 0.3,
        recent: 0.1,
        exact: 0.5
    };

    let score = 0;
    score += nameMatch * weights.name;
    score += pathMatch * weights.path;
    score += contentMatch * weights.content;
    score += recentBonus * weights.recent;

    // Bonus for exact matches
    if (exactMatch > 0) {
        score = Math.min(1, score + exactMatch * weights.exact);
    }

    return Math.min(1, Math.max(0, score));
}

/**
 * Highlight matches in text
 */
export function highlightMatches(text: string, query: string): SearchHighlight[] {
    const highlights: SearchHighlight[] = [];
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Find all occurrences
    let pos = 0;
    while (pos < text.length) {
        const index = textLower.indexOf(queryLower, pos);
        if (index === -1) break;

        highlights.push({
            start: index,
            end: index + query.length,
            text: text.substring(index, index + query.length)
        });

        pos = index + 1;
    }

    return highlights;
}

/**
 * Get icon for a file based on extension
 */
export function getFileIcon(extension: string | undefined): string {
    if (!extension) return 'file';

    const iconMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'react',
        js: 'javascript',
        jsx: 'react',
        json: 'json',
        md: 'markdown',
        css: 'css',
        scss: 'sass',
        html: 'html',
        py: 'python',
        java: 'java',
        go: 'go',
        rs: 'rust',
        c: 'c',
        cpp: 'cpp',
        h: 'c',
        hpp: 'cpp',
        sh: 'shell',
        yaml: 'yaml',
        yml: 'yaml',
        xml: 'xml',
        sql: 'database',
        graphql: 'graphql',
        vue: 'vue',
        svelte: 'svelte'
    };

    return iconMap[extension.toLowerCase()] || 'file';
}

/**
 * Get icon for a symbol kind
 */
export function getSymbolIcon(kind: SymbolKind): string {
    const iconMap: Record<SymbolKind, string> = {
        class: 'symbol-class',
        interface: 'symbol-interface',
        function: 'symbol-function',
        method: 'symbol-method',
        property: 'symbol-property',
        variable: 'symbol-variable',
        constant: 'symbol-constant',
        enum: 'symbol-enum',
        type: 'symbol-type',
        module: 'symbol-module',
        namespace: 'symbol-namespace',
        unknown: 'symbol-misc'
    };

    return iconMap[kind] || 'symbol-misc';
}
