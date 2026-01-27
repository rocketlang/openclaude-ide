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
import { ILogger, CancellationToken } from '@theia/core';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
    AISearchService,
    AISearchOptions,
    AISearchResults,
    AISearchResult,
    QueryInterpretation,
    SymbolKind,
    highlightMatches,
    getFileIcon
} from '../common/ai-search-protocol';

interface FileIndex {
    uri: string;
    path: string;
    name: string;
    extension: string;
    size: number;
    modified: number;
}

interface WorkspaceIndex {
    rootUri: string;
    files: FileIndex[];
    lastIndexed: number;
}

@injectable()
export class AISearchServiceImpl implements AISearchService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected indices: Map<string, WorkspaceIndex> = new Map();
    protected recentSelections: Map<string, string[]> = new Map(); // query -> selected URIs
    protected searchHistory: string[] = [];

    async search(options: AISearchOptions, token?: CancellationToken): Promise<AISearchResults> {
        const startTime = Date.now();
        const {
            query,
            rootUris = [],
            limit = 50,
            sources = ['file', 'content', 'symbol', 'recent'],
            fuzzyMatch = true,
            includePatterns = [],
            excludePatterns = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/lib/**'],
            useAI = true,
            includeRecent = true,
            minScore = 0.1
        } = options;

        this.logger.info(`AI Search: "${query}" in ${rootUris.length} roots`);

        // Interpret the query
        const interpretation = useAI ? await this.interpretQuery(query) : undefined;
        const searchPatterns = interpretation?.patterns || [query];

        const results: AISearchResult[] = [];
        let totalMatches = 0;

        // Search in each root
        for (const rootUri of rootUris) {
            if (token?.isCancellationRequested) break;

            const rootPath = rootUri.replace('file://', '');

            // File name search
            if (sources.includes('file')) {
                const fileResults = await this.searchFiles(
                    rootPath,
                    searchPatterns,
                    { fuzzyMatch, excludePatterns, includePatterns },
                    token
                );
                results.push(...fileResults);
                totalMatches += fileResults.length;
            }

            // Content search (grep-like)
            if (sources.includes('content')) {
                const contentResults = await this.searchContent(
                    rootPath,
                    searchPatterns,
                    { excludePatterns, includePatterns, limit: Math.ceil(limit / 2) },
                    token
                );
                results.push(...contentResults);
                totalMatches += contentResults.length;
            }

            // Symbol search
            if (sources.includes('symbol') && interpretation?.symbolTypes) {
                const symbolResults = await this.searchSymbols(
                    rootPath,
                    searchPatterns,
                    interpretation.symbolTypes,
                    token
                );
                results.push(...symbolResults);
                totalMatches += symbolResults.length;
            }
        }

        // Add recent files if enabled
        if (includeRecent && sources.includes('recent')) {
            const recentResults = this.getRecentResults(query, rootUris);
            results.push(...recentResults);
        }

        // Score and rank results
        const scoredResults = this.rankResults(results, query, interpretation);

        // Filter by minimum score
        const filteredResults = scoredResults.filter(r => r.score >= minScore);

        // Sort by score (descending) and limit
        filteredResults.sort((a, b) => b.score - a.score);
        const finalResults = filteredResults.slice(0, limit);

        const duration = Date.now() - startTime;

        // Record query for suggestions
        this.searchHistory.push(query);
        if (this.searchHistory.length > 100) {
            this.searchHistory = this.searchHistory.slice(-100);
        }

        return {
            query,
            results: finalResults,
            totalMatches,
            duration,
            truncated: filteredResults.length > limit,
            interpretation: interpretation?.intent,
            suggestions: this.generateSuggestions(query, finalResults)
        };
    }

    async interpretQuery(query: string): Promise<QueryInterpretation> {
        const queryLower = query.toLowerCase();
        const words = query.split(/\s+/).filter(w => w.length > 0);

        // Detect intent based on keywords
        let intent: QueryInterpretation['intent'] = 'unknown';
        const keywords: string[] = [];
        const fileTypes: string[] = [];
        const symbolTypes: SymbolKind[] = [];
        const patterns: string[] = [];

        // File finding patterns
        if (/\.(ts|js|py|java|go|rs|c|cpp|css|html|json|md)$/i.test(query)) {
            intent = 'find_file';
            patterns.push(query);
        } else if (/^(find|open|go to|show|where is)\s/i.test(query)) {
            intent = 'find_file';
            keywords.push(...words.slice(1));
        }

        // Content finding patterns
        if (/^(search|grep|find text|look for)\s/i.test(query)) {
            intent = 'find_content';
            keywords.push(...words.slice(1));
        } else if (/["']/.test(query)) {
            // Quoted text suggests content search
            intent = 'find_content';
            const quoted = query.match(/["']([^"']+)["']/);
            if (quoted) {
                patterns.push(quoted[1]);
                keywords.push(quoted[1]);
            }
        }

        // Symbol finding patterns
        const symbolKeywords = {
            'class': 'class' as SymbolKind,
            'interface': 'interface' as SymbolKind,
            'function': 'function' as SymbolKind,
            'method': 'method' as SymbolKind,
            'variable': 'variable' as SymbolKind,
            'const': 'constant' as SymbolKind,
            'enum': 'enum' as SymbolKind,
            'type': 'type' as SymbolKind
        };

        for (const [keyword, symbolKind] of Object.entries(symbolKeywords)) {
            if (queryLower.includes(keyword)) {
                intent = 'find_symbol';
                symbolTypes.push(symbolKind);
            }
        }

        // File type detection
        const fileTypePatterns: Record<string, string[]> = {
            'typescript': ['ts', 'tsx'],
            'javascript': ['js', 'jsx'],
            'python': ['py'],
            'java': ['java'],
            'react': ['tsx', 'jsx'],
            'component': ['tsx', 'jsx', 'vue', 'svelte'],
            'test': ['spec.ts', 'test.ts', 'spec.js', 'test.js'],
            'config': ['json', 'yaml', 'yml', 'toml'],
            'style': ['css', 'scss', 'less']
        };

        for (const [keyword, extensions] of Object.entries(fileTypePatterns)) {
            if (queryLower.includes(keyword)) {
                fileTypes.push(...extensions);
            }
        }

        // Generate search patterns
        if (patterns.length === 0) {
            // Use significant words as patterns
            const significantWords = words.filter(w =>
                w.length > 2 &&
                !['the', 'and', 'for', 'with', 'find', 'show', 'open', 'where', 'is'].includes(w.toLowerCase())
            );
            patterns.push(...significantWords);

            // Also try camelCase and PascalCase variations
            for (const word of significantWords) {
                if (word.length > 3) {
                    patterns.push(word.charAt(0).toUpperCase() + word.slice(1)); // PascalCase
                    patterns.push(word.charAt(0).toLowerCase() + word.slice(1)); // camelCase
                }
            }
        }

        // Add keywords from patterns
        keywords.push(...patterns.filter(p => !keywords.includes(p)));

        return {
            original: query,
            intent: intent === 'unknown' ? 'find_file' : intent,
            keywords: [...new Set(keywords)],
            fileTypes: fileTypes.length > 0 ? [...new Set(fileTypes)] : undefined,
            symbolTypes: symbolTypes.length > 0 ? symbolTypes : undefined,
            patterns: [...new Set(patterns)],
            confidence: patterns.length > 0 ? 0.7 : 0.4
        };
    }

    async getSuggestions(partial: string, limit: number = 10): Promise<string[]> {
        const suggestions: string[] = [];
        const partialLower = partial.toLowerCase();

        // Add from search history
        const historyMatches = this.searchHistory
            .filter(h => h.toLowerCase().includes(partialLower))
            .slice(-5);
        suggestions.push(...historyMatches);

        // Add common search patterns
        const commonPatterns = [
            'find file',
            'search for',
            'class',
            'function',
            'interface',
            'component',
            'test',
            'config'
        ];

        for (const pattern of commonPatterns) {
            if (pattern.includes(partialLower) && !suggestions.includes(pattern)) {
                suggestions.push(`${partial} ${pattern}`);
            }
        }

        return [...new Set(suggestions)].slice(0, limit);
    }

    async indexWorkspace(rootUri: string): Promise<void> {
        const rootPath = rootUri.replace('file://', '');
        this.logger.info(`Indexing workspace: ${rootPath}`);

        const files: FileIndex[] = [];

        const indexDir = async (dir: string): Promise<void> => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.relative(rootPath, fullPath);

                    // Skip ignored directories
                    if (entry.isDirectory()) {
                        if (['node_modules', '.git', 'dist', 'lib', 'build', '.next'].includes(entry.name)) {
                            continue;
                        }
                        await indexDir(fullPath);
                    } else {
                        try {
                            const stat = await fs.stat(fullPath);
                            const ext = path.extname(entry.name).slice(1);

                            files.push({
                                uri: `file://${fullPath}`,
                                path: relativePath,
                                name: entry.name,
                                extension: ext,
                                size: stat.size,
                                modified: stat.mtimeMs
                            });
                        } catch {
                            // Skip files we can't stat
                        }
                    }
                }
            } catch {
                // Skip directories we can't read
            }
        };

        await indexDir(rootPath);

        this.indices.set(rootUri, {
            rootUri,
            files,
            lastIndexed: Date.now()
        });

        this.logger.info(`Indexed ${files.length} files in ${rootPath}`);
    }

    async getIndexStatus(rootUri: string): Promise<{
        indexed: boolean;
        fileCount: number;
        lastIndexed?: number;
    }> {
        const index = this.indices.get(rootUri);
        if (!index) {
            return { indexed: false, fileCount: 0 };
        }

        return {
            indexed: true,
            fileCount: index.files.length,
            lastIndexed: index.lastIndexed
        };
    }

    async recordSelection(query: string, selectedUri: string): Promise<void> {
        const selections = this.recentSelections.get(query) || [];
        selections.unshift(selectedUri);
        this.recentSelections.set(query, selections.slice(0, 10));
    }

    // ============== Private Search Methods ==============

    protected async searchFiles(
        rootPath: string,
        patterns: string[],
        options: { fuzzyMatch: boolean; excludePatterns: string[]; includePatterns: string[] },
        token?: CancellationToken
    ): Promise<AISearchResult[]> {
        const results: AISearchResult[] = [];

        try {
            const files = await this.walkDirectory(rootPath, options.excludePatterns, token);

            for (const file of files) {
                if (token?.isCancellationRequested) break;

                const name = path.basename(file);
                const relativePath = path.relative(rootPath, file);
                const ext = path.extname(name).slice(1);

                for (const pattern of patterns) {
                    const nameLower = name.toLowerCase();
                    const patternLower = pattern.toLowerCase();

                    let matched = false;
                    let score = 0;

                    // Exact match
                    if (nameLower === patternLower) {
                        matched = true;
                        score = 1.0;
                    }
                    // Starts with
                    else if (nameLower.startsWith(patternLower)) {
                        matched = true;
                        score = 0.9;
                    }
                    // Contains
                    else if (nameLower.includes(patternLower)) {
                        matched = true;
                        score = 0.7;
                    }
                    // Fuzzy match
                    else if (options.fuzzyMatch && this.fuzzyMatch(nameLower, patternLower)) {
                        matched = true;
                        score = 0.5;
                    }
                    // Path match
                    else if (relativePath.toLowerCase().includes(patternLower)) {
                        matched = true;
                        score = 0.4;
                    }

                    if (matched) {
                        results.push({
                            id: `file-${file}`,
                            source: 'file',
                            uri: `file://${file}`,
                            path: relativePath,
                            name,
                            extension: ext,
                            score,
                            highlights: highlightMatches(name, pattern),
                            icon: getFileIcon(ext)
                        });
                        break; // Only add once per file
                    }
                }
            }
        } catch (error) {
            this.logger.error(`Error searching files: ${error}`);
        }

        return results;
    }

    protected async searchContent(
        rootPath: string,
        patterns: string[],
        options: { excludePatterns: string[]; includePatterns: string[]; limit: number },
        token?: CancellationToken
    ): Promise<AISearchResult[]> {
        const results: AISearchResult[] = [];
        const files = await this.walkDirectory(rootPath, options.excludePatterns, token);

        // Only search text files
        const textExtensions = ['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'css', 'scss', 'html', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'yaml', 'yml', 'xml', 'txt'];

        for (const file of files) {
            if (token?.isCancellationRequested) break;
            if (results.length >= options.limit) break;

            const ext = path.extname(file).slice(1).toLowerCase();
            if (!textExtensions.includes(ext)) continue;

            try {
                const content = await fs.readFile(file, 'utf-8');
                const lines = content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    for (const pattern of patterns) {
                        if (line.toLowerCase().includes(pattern.toLowerCase())) {
                            const name = path.basename(file);
                            const relativePath = path.relative(rootPath, file);

                            results.push({
                                id: `content-${file}-${i}`,
                                source: 'content',
                                uri: `file://${file}`,
                                path: relativePath,
                                name,
                                extension: ext,
                                score: 0.6,
                                highlights: highlightMatches(line, pattern),
                                preview: line.trim().substring(0, 200),
                                line: i + 1,
                                icon: getFileIcon(ext)
                            });
                            break;
                        }
                    }

                    if (results.length >= options.limit) break;
                }
            } catch {
                // Skip files we can't read
            }
        }

        return results;
    }

    protected async searchSymbols(
        rootPath: string,
        patterns: string[],
        symbolTypes: SymbolKind[],
        token?: CancellationToken
    ): Promise<AISearchResult[]> {
        // Simple symbol search using regex patterns
        const results: AISearchResult[] = [];
        const files = await this.walkDirectory(rootPath, ['**/node_modules/**', '**/.git/**'], token);

        const symbolPatterns: Record<SymbolKind, RegExp> = {
            'class': /\bclass\s+(\w+)/g,
            'interface': /\binterface\s+(\w+)/g,
            'function': /\bfunction\s+(\w+)/g,
            'method': /\b(\w+)\s*\([^)]*\)\s*[:{]/g,
            'property': /\b(\w+)\s*[:=]/g,
            'variable': /\b(const|let|var)\s+(\w+)/g,
            'constant': /\bconst\s+([A-Z_]+)/g,
            'enum': /\benum\s+(\w+)/g,
            'type': /\btype\s+(\w+)/g,
            'module': /\bmodule\s+(\w+)/g,
            'namespace': /\bnamespace\s+(\w+)/g,
            'unknown': /$/g
        };

        const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'));

        for (const file of tsFiles.slice(0, 100)) { // Limit to prevent slowdown
            if (token?.isCancellationRequested) break;

            try {
                const content = await fs.readFile(file, 'utf-8');
                const lines = content.split('\n');

                for (const symbolType of symbolTypes) {
                    const regex = symbolPatterns[symbolType];
                    if (!regex) continue;

                    let match;
                    regex.lastIndex = 0;

                    while ((match = regex.exec(content)) !== null) {
                        const symbolName = match[1] || match[2];
                        if (!symbolName) continue;

                        // Check if symbol matches any pattern
                        for (const pattern of patterns) {
                            if (symbolName.toLowerCase().includes(pattern.toLowerCase())) {
                                const lineIndex = content.substring(0, match.index).split('\n').length - 1;
                                const relativePath = path.relative(rootPath, file);

                                results.push({
                                    id: `symbol-${file}-${symbolName}-${lineIndex}`,
                                    source: 'symbol',
                                    uri: `file://${file}`,
                                    path: relativePath,
                                    name: symbolName,
                                    extension: path.extname(file).slice(1),
                                    score: 0.8,
                                    highlights: highlightMatches(symbolName, pattern),
                                    line: lineIndex + 1,
                                    symbolKind: symbolType,
                                    preview: lines[lineIndex]?.trim(),
                                    icon: `symbol-${symbolType}`
                                });
                                break;
                            }
                        }
                    }
                }
            } catch {
                // Skip files we can't read
            }
        }

        return results;
    }

    protected getRecentResults(query: string, rootUris: string[]): AISearchResult[] {
        const results: AISearchResult[] = [];
        const selections = this.recentSelections.get(query);

        if (selections) {
            for (const uri of selections.slice(0, 3)) {
                const filePath = uri.replace('file://', '');
                const name = path.basename(filePath);

                results.push({
                    id: `recent-${uri}`,
                    source: 'recent',
                    uri,
                    path: filePath,
                    name,
                    extension: path.extname(name).slice(1),
                    score: 0.95, // High score for recently selected
                    highlights: [],
                    matchReason: 'Recently selected for this query',
                    icon: getFileIcon(path.extname(name).slice(1))
                });
            }
        }

        return results;
    }

    protected rankResults(
        results: AISearchResult[],
        query: string,
        interpretation?: QueryInterpretation
    ): AISearchResult[] {
        // Deduplicate by URI
        const seen = new Set<string>();
        const unique = results.filter(r => {
            const key = `${r.source}-${r.uri}-${r.line || 0}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Apply scoring adjustments
        return unique.map(result => {
            let adjustedScore = result.score;

            // Boost exact matches
            if (result.name.toLowerCase() === query.toLowerCase()) {
                adjustedScore = Math.min(1, adjustedScore + 0.3);
            }

            // Boost if matches interpreted keywords
            if (interpretation?.keywords.some(k =>
                result.name.toLowerCase().includes(k.toLowerCase())
            )) {
                adjustedScore = Math.min(1, adjustedScore + 0.1);
            }

            // Boost recent files
            if (result.source === 'recent') {
                adjustedScore = Math.min(1, adjustedScore + 0.2);
            }

            return { ...result, score: adjustedScore };
        });
    }

    protected generateSuggestions(query: string, results: AISearchResult[]): string[] {
        const suggestions: string[] = [];

        if (results.length === 0) {
            suggestions.push(`Try: "${query}" in file names`);
            suggestions.push(`Try: search "${query}" in content`);
        } else if (results.length > 20) {
            // Suggest narrowing
            const extensions = [...new Set(results.map(r => r.extension).filter(e => e))];
            if (extensions.length > 1) {
                suggestions.push(`Narrow to: ${query} .${extensions[0]}`);
            }
        }

        return suggestions;
    }

    protected async walkDirectory(
        dir: string,
        excludePatterns: string[],
        token?: CancellationToken
    ): Promise<string[]> {
        const files: string[] = [];

        const walk = async (currentDir: string): Promise<void> => {
            if (token?.isCancellationRequested) return;

            try {
                const entries = await fs.readdir(currentDir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);

                    // Check exclude patterns
                    const shouldExclude = excludePatterns.some(pattern => {
                        if (pattern.includes('**')) {
                            const simpleName = pattern.replace(/\*\*/g, '').replace(/\//g, '');
                            return fullPath.includes(simpleName);
                        }
                        return entry.name === pattern;
                    });

                    if (shouldExclude) continue;

                    if (entry.isDirectory()) {
                        await walk(fullPath);
                    } else {
                        files.push(fullPath);
                    }
                }
            } catch {
                // Skip inaccessible directories
            }
        };

        await walk(dir);
        return files;
    }

    protected fuzzyMatch(text: string, pattern: string): boolean {
        let patternIdx = 0;
        for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
            if (text[i] === pattern[patternIdx]) {
                patternIdx++;
            }
        }
        return patternIdx === pattern.length;
    }
}
