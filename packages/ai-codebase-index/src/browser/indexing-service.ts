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
import { Emitter, Event } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import {
    CodebaseIndexService,
    CodeChunk,
    SearchResult,
    SearchOptions,
    IndexStats,
    IndexingProgress,
    IndexingPhase,
    IndexConfig,
    IndexedFile,
    SymbolType,
    VectorStore,
    EmbeddingProvider,
    DEFAULT_INDEX_CONFIG
} from '../common';

const INDEX_VERSION = '1.0.0';

/**
 * Main codebase indexing service
 */
@injectable()
export class IndexingServiceImpl implements CodebaseIndexService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(VectorStore)
    protected readonly vectorStore: VectorStore;

    @inject(EmbeddingProvider)
    protected readonly embeddingProvider: EmbeddingProvider;

    protected config: IndexConfig = { ...DEFAULT_INDEX_CONFIG };
    protected indexedFiles: Map<string, IndexedFile> = new Map();
    protected progress: IndexingProgress = {
        phase: IndexingPhase.Idle,
        filesProcessed: 0,
        totalFiles: 0,
        chunksGenerated: 0,
        embeddingsComputed: 0,
        percentComplete: 0
    };

    protected isIndexing = false;
    protected debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    protected readonly onProgressEmitter = new Emitter<IndexingProgress>();
    readonly onProgress: Event<IndexingProgress> = this.onProgressEmitter.event;

    @postConstruct()
    protected async init(): Promise<void> {
        // Load persisted index
        await this.vectorStore.load();

        // Set up file watchers for auto-indexing
        if (this.config.autoIndex) {
            this.setupFileWatchers();
        }
    }

    async indexWorkspace(): Promise<void> {
        if (this.isIndexing) {
            console.log('Indexing already in progress');
            return;
        }

        this.isIndexing = true;
        const startTime = performance.now();

        try {
            // Reset progress
            this.updateProgress({
                phase: IndexingPhase.Scanning,
                filesProcessed: 0,
                totalFiles: 0,
                chunksGenerated: 0,
                embeddingsComputed: 0,
                percentComplete: 0
            });

            // Get workspace roots
            const roots = await this.workspaceService.roots;
            if (roots.length === 0) {
                throw new Error('No workspace open');
            }

            // Scan for files
            const files: string[] = [];
            for (const root of roots) {
                const rootUri = new URI(root.resource.toString());
                await this.scanDirectory(rootUri, files);
            }

            this.updateProgress({
                phase: IndexingPhase.Parsing,
                totalFiles: files.length
            });

            // Process files
            for (let i = 0; i < files.length; i++) {
                const filePath = files[i];
                this.updateProgress({
                    filesProcessed: i + 1,
                    currentFile: filePath,
                    percentComplete: Math.round(((i + 1) / files.length) * 100)
                });

                await this.indexFile(filePath);
            }

            // Persist the index
            this.updateProgress({ phase: IndexingPhase.Storing });
            await this.vectorStore.persist();

            const duration = performance.now() - startTime;
            console.log(`Indexing complete: ${files.length} files in ${(duration / 1000).toFixed(2)}s`);

            this.updateProgress({
                phase: IndexingPhase.Complete,
                percentComplete: 100
            });

        } catch (error) {
            console.error('Indexing error:', error);
            this.updateProgress({
                phase: IndexingPhase.Error,
                error: error instanceof Error ? error.message : String(error)
            });
        } finally {
            this.isIndexing = false;
        }
    }

    async indexFile(filePath: string): Promise<void> {
        try {
            // Remove old chunks for this file
            await this.vectorStore.removeByFile(filePath);
            this.indexedFiles.delete(filePath);

            // Read file content
            const roots = await this.workspaceService.roots;
            if (roots.length === 0) {
                return;
            }

            const rootUri = new URI(roots[0].resource.toString());
            const fileUri = rootUri.resolve(filePath);

            const stat = await this.fileService.resolve(fileUri);
            if (!stat || stat.isDirectory) {
                return;
            }

            // Check file size
            if (stat.size && stat.size > this.config.maxFileSize) {
                return;
            }

            const content = await this.fileService.read(fileUri);
            const text = content.value;

            if (!text || text.trim().length === 0) {
                return;
            }

            // Determine language
            const language = this.getLanguage(filePath);

            // Generate chunks
            const chunks = this.chunkContent(text, filePath, language);

            if (chunks.length === 0) {
                return;
            }

            this.updateProgress({
                phase: IndexingPhase.Chunking,
                chunksGenerated: this.progress.chunksGenerated + chunks.length
            });

            // Generate embeddings
            this.updateProgress({ phase: IndexingPhase.Embedding });
            const texts = chunks.map(c => this.prepareTextForEmbedding(c));
            const embeddings = await this.embeddingProvider.embed(texts);

            // Attach embeddings to chunks
            for (let i = 0; i < chunks.length; i++) {
                chunks[i].embedding = embeddings[i];
            }

            this.updateProgress({
                embeddingsComputed: this.progress.embeddingsComputed + chunks.length
            });

            // Store chunks
            await this.vectorStore.add(chunks);

            // Update indexed files
            const indexedFile: IndexedFile = {
                filePath,
                language,
                size: text.length,
                lastModified: stat.mtime || Date.now(),
                contentHash: this.hashContent(text),
                chunkIds: chunks.map(c => c.id),
                lineCount: text.split('\n').length
            };
            this.indexedFiles.set(filePath, indexedFile);

        } catch (error) {
            console.error(`Error indexing file ${filePath}:`, error);
        }
    }

    async removeFile(filePath: string): Promise<void> {
        await this.vectorStore.removeByFile(filePath);
        this.indexedFiles.delete(filePath);
    }

    async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
        // Generate query embedding
        const embeddings = await this.embeddingProvider.embed([query]);
        const queryEmbedding = embeddings[0];

        // Search vector store
        let results = await this.vectorStore.search(queryEmbedding, {
            ...options,
            includeContent: true
        });

        // If hybrid search enabled, also do keyword search
        if (options?.hybridSearch) {
            const keywordResults = this.keywordSearch(query, options);
            results = this.mergeResults(results, keywordResults, options?.keywordWeight ?? 0.3);
        }

        return results;
    }

    getStats(): IndexStats {
        const languages = new Map<string, number>();
        let totalCharacters = 0;

        for (const file of this.indexedFiles.values()) {
            const count = languages.get(file.language) || 0;
            languages.set(file.language, count + 1);
            totalCharacters += file.size;
        }

        return {
            totalFiles: this.indexedFiles.size,
            totalChunks: this.vectorStore.getCount(),
            totalCharacters,
            languages,
            indexSizeBytes: this.estimateIndexSize(),
            lastUpdateTime: Date.now(),
            version: INDEX_VERSION
        };
    }

    getProgress(): IndexingProgress {
        return { ...this.progress };
    }

    async clearIndex(): Promise<void> {
        await this.vectorStore.clear();
        this.indexedFiles.clear();
        this.updateProgress({
            phase: IndexingPhase.Idle,
            filesProcessed: 0,
            totalFiles: 0,
            chunksGenerated: 0,
            embeddingsComputed: 0,
            percentComplete: 0
        });
    }

    isFileIndexed(filePath: string): boolean {
        return this.indexedFiles.has(filePath);
    }

    getConfig(): IndexConfig {
        return { ...this.config };
    }

    setConfig(config: Partial<IndexConfig>): void {
        this.config = { ...this.config, ...config };
    }

    protected setupFileWatchers(): void {
        // Watch for file changes in workspace
        this.fileService.onDidFilesChange(event => {
            for (const change of event.changes) {
                const filePath = this.getRelativePath(change.resource.toString());
                if (filePath && this.shouldIndex(filePath)) {
                    this.debouncedIndex(filePath);
                }
            }
        });
    }

    protected debouncedIndex(filePath: string): void {
        // Clear existing timer
        const existingTimer = this.debounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new timer
        const timer = setTimeout(() => {
            this.indexFile(filePath);
            this.debounceTimers.delete(filePath);
        }, this.config.debounceDelay);

        this.debounceTimers.set(filePath, timer);
    }

    protected async scanDirectory(uri: URI, files: string[]): Promise<void> {
        try {
            const stat = await this.fileService.resolve(uri);
            if (!stat) {
                return;
            }

            if (stat.isDirectory && stat.children) {
                for (const child of stat.children) {
                    const childUri = uri.resolve(child.name);
                    const relativePath = this.getRelativePath(childUri.toString());

                    if (child.isDirectory) {
                        if (relativePath && !this.isExcluded(relativePath)) {
                            await this.scanDirectory(childUri, files);
                        }
                    } else {
                        if (relativePath && this.shouldIndex(relativePath)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${uri.toString()}:`, error);
        }
    }

    protected shouldIndex(filePath: string): boolean {
        if (this.isExcluded(filePath)) {
            return false;
        }

        return this.config.includePatterns.some(pattern =>
            this.matchGlob(filePath, pattern)
        );
    }

    protected isExcluded(filePath: string): boolean {
        return this.config.excludePatterns.some(pattern =>
            this.matchGlob(filePath, pattern)
        );
    }

    protected matchGlob(filePath: string, pattern: string): boolean {
        const regex = new RegExp(
            '^' + pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '.')
                .replace(/\./g, '\\.') + '$'
        );
        return regex.test(filePath);
    }

    protected getRelativePath(uriString: string): string | undefined {
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return undefined;
        }

        const rootUri = roots[0].resource.toString();
        if (uriString.startsWith(rootUri)) {
            return uriString.substring(rootUri.length + 1);
        }

        return undefined;
    }

    protected chunkContent(content: string, filePath: string, language: string): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        const lines = content.split('\n');
        const chunkSize = this.config.chunkSize;
        const overlap = this.config.chunkOverlap;

        let currentChunk = '';
        let startLine = 1;
        let endLine = 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if ((currentChunk + line).length > chunkSize && currentChunk.length > 0) {
                // Save current chunk
                chunks.push(this.createChunk(
                    currentChunk,
                    filePath,
                    language,
                    startLine,
                    endLine
                ));

                // Start new chunk with overlap
                const overlapText = currentChunk.slice(-overlap);
                currentChunk = overlapText + line + '\n';
                startLine = Math.max(1, endLine - Math.floor(overlap / 50));
            } else {
                currentChunk += line + '\n';
            }

            endLine = i + 1;
        }

        // Don't forget the last chunk
        if (currentChunk.trim().length > 0) {
            chunks.push(this.createChunk(
                currentChunk,
                filePath,
                language,
                startLine,
                endLine
            ));
        }

        return chunks;
    }

    protected createChunk(
        content: string,
        filePath: string,
        language: string,
        startLine: number,
        endLine: number
    ): CodeChunk {
        const symbolInfo = this.extractSymbolInfo(content, language);

        return {
            id: `${filePath}:${startLine}-${endLine}-${Date.now()}`,
            filePath,
            startLine,
            endLine,
            content,
            language,
            symbolName: symbolInfo?.name,
            symbolType: symbolInfo?.type,
            lastModified: Date.now(),
            contentHash: this.hashContent(content)
        };
    }

    protected extractSymbolInfo(content: string, language: string): { name: string; type: SymbolType } | undefined {
        // Simple regex-based symbol extraction
        const patterns: Record<string, Array<{ regex: RegExp; type: SymbolType }>> = {
            typescript: [
                { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, type: SymbolType.Function },
                { regex: /(?:export\s+)?class\s+(\w+)/m, type: SymbolType.Class },
                { regex: /(?:export\s+)?interface\s+(\w+)/m, type: SymbolType.Interface },
                { regex: /(?:export\s+)?type\s+(\w+)/m, type: SymbolType.Type },
                { regex: /(?:export\s+)?enum\s+(\w+)/m, type: SymbolType.Enum },
                { regex: /(?:const|let|var)\s+(\w+)\s*=/m, type: SymbolType.Variable }
            ],
            python: [
                { regex: /(?:async\s+)?def\s+(\w+)/m, type: SymbolType.Function },
                { regex: /class\s+(\w+)/m, type: SymbolType.Class }
            ],
            java: [
                { regex: /(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(\w+)\s*\(/m, type: SymbolType.Method },
                { regex: /(?:public|private|protected)?\s*class\s+(\w+)/m, type: SymbolType.Class },
                { regex: /(?:public|private|protected)?\s*interface\s+(\w+)/m, type: SymbolType.Interface }
            ]
        };

        const langPatterns = patterns[language] || patterns['typescript'];

        for (const { regex, type } of langPatterns) {
            const match = content.match(regex);
            if (match && match[1]) {
                return { name: match[1], type };
            }
        }

        return undefined;
    }

    protected prepareTextForEmbedding(chunk: CodeChunk): string {
        // Create a descriptive text for embedding
        let text = `File: ${chunk.filePath}\n`;
        text += `Language: ${chunk.language}\n`;
        if (chunk.symbolName) {
            text += `Symbol: ${chunk.symbolName} (${chunk.symbolType})\n`;
        }
        text += `Lines: ${chunk.startLine}-${chunk.endLine}\n\n`;
        text += chunk.content;
        return text;
    }

    protected getLanguage(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
            'ts': 'typescript', 'tsx': 'typescript',
            'js': 'javascript', 'jsx': 'javascript',
            'py': 'python',
            'java': 'java',
            'go': 'go',
            'rs': 'rust',
            'c': 'c', 'h': 'c',
            'cpp': 'cpp', 'hpp': 'cpp', 'cc': 'cpp',
            'cs': 'csharp',
            'rb': 'ruby',
            'php': 'php',
            'swift': 'swift',
            'kt': 'kotlin',
            'scala': 'scala',
            'vue': 'vue',
            'svelte': 'svelte',
            'json': 'json',
            'yaml': 'yaml', 'yml': 'yaml',
            'md': 'markdown'
        };
        return langMap[ext] || ext;
    }

    protected hashContent(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    protected keywordSearch(query: string, options?: SearchOptions): SearchResult[] {
        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        const results: SearchResult[] = [];

        for (const file of this.indexedFiles.values()) {
            const chunks = this.vectorStore.getChunksByFile(file.filePath);
            for (const chunk of chunks) {
                const contentLower = chunk.content.toLowerCase();
                const matchedKeywords = keywords.filter(k => contentLower.includes(k));

                if (matchedKeywords.length > 0) {
                    const score = matchedKeywords.length / keywords.length;
                    results.push({
                        chunk,
                        score,
                        matchedKeywords
                    });
                }
            }
        }

        return results;
    }

    protected mergeResults(
        vectorResults: SearchResult[],
        keywordResults: SearchResult[],
        keywordWeight: number
    ): SearchResult[] {
        const merged = new Map<string, SearchResult>();

        // Add vector results
        for (const result of vectorResults) {
            const existing = merged.get(result.chunk.id);
            if (existing) {
                existing.score = existing.score * (1 - keywordWeight) + result.score * keywordWeight;
            } else {
                merged.set(result.chunk.id, {
                    ...result,
                    score: result.score * (1 - keywordWeight)
                });
            }
        }

        // Add keyword results
        for (const result of keywordResults) {
            const existing = merged.get(result.chunk.id);
            if (existing) {
                existing.score += result.score * keywordWeight;
                existing.matchedKeywords = result.matchedKeywords;
            } else {
                merged.set(result.chunk.id, {
                    ...result,
                    score: result.score * keywordWeight
                });
            }
        }

        // Sort by combined score
        const sortedResults = Array.from(merged.values());
        sortedResults.sort((a, b) => b.score - a.score);

        return sortedResults;
    }

    protected estimateIndexSize(): number {
        // Rough estimate: each chunk with embedding ~4KB
        return this.vectorStore.getCount() * 4096;
    }

    protected updateProgress(update: Partial<IndexingProgress>): void {
        this.progress = { ...this.progress, ...update };
        this.onProgressEmitter.fire(this.progress);
    }
}
