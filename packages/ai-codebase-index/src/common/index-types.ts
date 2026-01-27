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

/**
 * Represents a chunk of code with its embedding
 */
export interface CodeChunk {
    /** Unique identifier for this chunk */
    id: string;
    /** File path relative to workspace root */
    filePath: string;
    /** Start line number (1-indexed) */
    startLine: number;
    /** End line number (1-indexed) */
    endLine: number;
    /** The actual code content */
    content: string;
    /** Programming language */
    language: string;
    /** Optional symbol name (function, class, etc.) */
    symbolName?: string;
    /** Symbol type (function, class, interface, etc.) */
    symbolType?: SymbolType;
    /** Vector embedding */
    embedding?: number[];
    /** Last modified timestamp */
    lastModified: number;
    /** Content hash for change detection */
    contentHash: string;
}

/**
 * Type of code symbol
 */
export enum SymbolType {
    Function = 'function',
    Method = 'method',
    Class = 'class',
    Interface = 'interface',
    Variable = 'variable',
    Constant = 'constant',
    Type = 'type',
    Enum = 'enum',
    Module = 'module',
    File = 'file',
    Unknown = 'unknown'
}

/**
 * A file in the codebase index
 */
export interface IndexedFile {
    /** File path relative to workspace root */
    filePath: string;
    /** Programming language */
    language: string;
    /** File size in bytes */
    size: number;
    /** Last modified timestamp */
    lastModified: number;
    /** Content hash */
    contentHash: string;
    /** Chunk IDs in this file */
    chunkIds: string[];
    /** Number of lines */
    lineCount: number;
}

/**
 * Search result from semantic search
 */
export interface SearchResult {
    /** The matching chunk */
    chunk: CodeChunk;
    /** Similarity score (0-1, higher is better) */
    score: number;
    /** Highlighted snippet with match context */
    snippet?: string;
    /** Matched keywords if any */
    matchedKeywords?: string[];
}

/**
 * Index statistics
 */
export interface IndexStats {
    /** Total number of indexed files */
    totalFiles: number;
    /** Total number of chunks */
    totalChunks: number;
    /** Total characters indexed */
    totalCharacters: number;
    /** Languages in the index */
    languages: Map<string, number>;
    /** Index size in bytes (estimated) */
    indexSizeBytes: number;
    /** Last full index time */
    lastFullIndexTime?: number;
    /** Last incremental update time */
    lastUpdateTime?: number;
    /** Index version */
    version: string;
}

/**
 * Indexing progress event
 */
export interface IndexingProgress {
    /** Current phase */
    phase: IndexingPhase;
    /** Files processed */
    filesProcessed: number;
    /** Total files to process */
    totalFiles: number;
    /** Current file being processed */
    currentFile?: string;
    /** Chunks generated */
    chunksGenerated: number;
    /** Embeddings computed */
    embeddingsComputed: number;
    /** Percentage complete (0-100) */
    percentComplete: number;
    /** Estimated time remaining in ms */
    estimatedTimeRemaining?: number;
    /** Error message if any */
    error?: string;
}

/**
 * Indexing phases
 */
export enum IndexingPhase {
    Scanning = 'scanning',
    Parsing = 'parsing',
    Chunking = 'chunking',
    Embedding = 'embedding',
    Storing = 'storing',
    Complete = 'complete',
    Error = 'error',
    Idle = 'idle'
}

/**
 * Search options
 */
export interface SearchOptions {
    /** Maximum number of results */
    maxResults?: number;
    /** Minimum similarity score (0-1) */
    minScore?: number;
    /** Filter by file path patterns */
    filePatterns?: string[];
    /** Filter by languages */
    languages?: string[];
    /** Filter by symbol types */
    symbolTypes?: SymbolType[];
    /** Include file content in results */
    includeContent?: boolean;
    /** Use hybrid search (vector + keyword) */
    hybridSearch?: boolean;
    /** Keyword weight for hybrid search (0-1) */
    keywordWeight?: number;
}

/**
 * Index configuration
 */
export interface IndexConfig {
    /** File patterns to include */
    includePatterns: string[];
    /** File patterns to exclude */
    excludePatterns: string[];
    /** Maximum file size to index (bytes) */
    maxFileSize: number;
    /** Chunk size (characters) */
    chunkSize: number;
    /** Chunk overlap (characters) */
    chunkOverlap: number;
    /** Embedding provider to use */
    embeddingProvider: EmbeddingProviderType;
    /** Embedding model name */
    embeddingModel: string;
    /** Enable auto-indexing on file save */
    autoIndex: boolean;
    /** Index debounce delay (ms) */
    debounceDelay: number;
    /** Persist index to disk */
    persistIndex: boolean;
}

/**
 * Embedding provider types
 */
export enum EmbeddingProviderType {
    Ollama = 'ollama',
    OpenAI = 'openai',
    Voyage = 'voyage',
    Local = 'local'
}

/**
 * Default index configuration
 */
export const DEFAULT_INDEX_CONFIG: IndexConfig = {
    includePatterns: [
        '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
        '**/*.py', '**/*.java', '**/*.go', '**/*.rs',
        '**/*.c', '**/*.cpp', '**/*.h', '**/*.hpp',
        '**/*.cs', '**/*.rb', '**/*.php', '**/*.swift',
        '**/*.kt', '**/*.scala', '**/*.vue', '**/*.svelte',
        '**/*.json', '**/*.yaml', '**/*.yml', '**/*.md'
    ],
    excludePatterns: [
        '**/node_modules/**', '**/dist/**', '**/build/**',
        '**/.git/**', '**/coverage/**', '**/*.min.js',
        '**/vendor/**', '**/target/**', '**/__pycache__/**',
        '**/.next/**', '**/.nuxt/**', '**/out/**'
    ],
    maxFileSize: 1024 * 1024, // 1MB
    chunkSize: 1500,
    chunkOverlap: 200,
    embeddingProvider: EmbeddingProviderType.Ollama,
    embeddingModel: 'nomic-embed-text',
    autoIndex: true,
    debounceDelay: 2000,
    persistIndex: true
};

/**
 * Embedding provider interface
 */
export const EmbeddingProvider = Symbol('EmbeddingProvider');
export interface EmbeddingProvider {
    /** Provider ID */
    readonly providerId: EmbeddingProviderType;
    /** Check if provider is available */
    isAvailable(): Promise<boolean>;
    /** Generate embeddings for texts */
    embed(texts: string[]): Promise<number[][]>;
    /** Get embedding dimension */
    getDimension(): number;
}

/**
 * Codebase index service interface
 */
export const CodebaseIndexService = Symbol('CodebaseIndexService');
export interface CodebaseIndexService {
    /** Start full indexing */
    indexWorkspace(): Promise<void>;
    /** Index a single file */
    indexFile(filePath: string): Promise<void>;
    /** Remove file from index */
    removeFile(filePath: string): Promise<void>;
    /** Semantic search */
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /** Get index statistics */
    getStats(): IndexStats;
    /** Get indexing progress */
    getProgress(): IndexingProgress;
    /** Clear the entire index */
    clearIndex(): Promise<void>;
    /** Check if file is indexed */
    isFileIndexed(filePath: string): boolean;
    /** Get configuration */
    getConfig(): IndexConfig;
    /** Update configuration */
    setConfig(config: Partial<IndexConfig>): void;
    /** Subscribe to progress updates */
    onProgress(callback: (progress: IndexingProgress) => void): void;
}

/**
 * Vector store interface
 */
export const VectorStore = Symbol('VectorStore');
export interface VectorStore {
    /** Add chunks to the store */
    add(chunks: CodeChunk[]): Promise<void>;
    /** Remove chunks by file path */
    removeByFile(filePath: string): Promise<void>;
    /** Search for similar chunks */
    search(embedding: number[], options?: SearchOptions): Promise<SearchResult[]>;
    /** Get chunk by ID */
    getChunk(id: string): CodeChunk | undefined;
    /** Get all chunks for a file */
    getChunksByFile(filePath: string): CodeChunk[];
    /** Get total count */
    getCount(): number;
    /** Clear the store */
    clear(): Promise<void>;
    /** Persist to storage */
    persist(): Promise<void>;
    /** Load from storage */
    load(): Promise<void>;
}
