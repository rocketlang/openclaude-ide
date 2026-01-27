// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CancellationToken } from '@theia/core/lib/common';

export const AIExplainService = Symbol('AIExplainService');
export const aiExplainServicePath = '/services/ai-explain';

/**
 * Type of code element being explained
 */
export type CodeElementType =
    | 'function'
    | 'class'
    | 'method'
    | 'variable'
    | 'import'
    | 'interface'
    | 'type'
    | 'enum'
    | 'property'
    | 'parameter'
    | 'expression'
    | 'statement'
    | 'comment'
    | 'decorator'
    | 'unknown';

/**
 * Complexity level of code
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'expert';

/**
 * Request for code explanation
 */
export interface ExplainRequest {
    /** Source code to explain */
    code: string;
    /** Language of the code */
    language: string;
    /** File path for context */
    filePath?: string;
    /** Line number where the code starts */
    startLine?: number;
    /** Column where the code starts */
    startColumn?: number;
    /** Surrounding context (lines before and after) */
    context?: {
        before: string[];
        after: string[];
    };
    /** Symbol name if known */
    symbolName?: string;
    /** Symbol kind if known */
    symbolKind?: string;
    /** Whether to include usage examples */
    includeExamples?: boolean;
    /** Whether to include related symbols */
    includeRelated?: boolean;
    /** Maximum length of explanation */
    maxLength?: number;
    /** Detail level: brief, normal, detailed */
    detailLevel?: 'brief' | 'normal' | 'detailed';
}

/**
 * Usage example for explained code
 */
export interface UsageExample {
    /** Description of the example */
    description: string;
    /** Example code */
    code: string;
    /** Output or result if applicable */
    output?: string;
}

/**
 * Related symbol reference
 */
export interface RelatedSymbol {
    /** Symbol name */
    name: string;
    /** How it's related */
    relationship: 'calls' | 'called-by' | 'extends' | 'implements' | 'uses' | 'used-by' | 'similar';
    /** File path if known */
    filePath?: string;
    /** Line number if known */
    line?: number;
    /** Brief description */
    description?: string;
}

/**
 * Code explanation result
 */
export interface CodeExplanation {
    /** Main explanation text (markdown supported) */
    explanation: string;
    /** Brief one-line summary */
    summary: string;
    /** Type of code element */
    elementType: CodeElementType;
    /** Detected complexity level */
    complexity: ComplexityLevel;
    /** What the code does (purpose) */
    purpose?: string;
    /** How the code works (mechanism) */
    mechanism?: string;
    /** When to use this code */
    whenToUse?: string;
    /** Potential issues or gotchas */
    warnings?: string[];
    /** Usage examples */
    examples?: UsageExample[];
    /** Related symbols */
    relatedSymbols?: RelatedSymbol[];
    /** Key terms/concepts */
    keyTerms?: Array<{
        term: string;
        definition: string;
    }>;
    /** Performance considerations */
    performance?: string;
    /** Security considerations */
    security?: string;
    /** Best practices */
    bestPractices?: string[];
    /** Documentation link if known */
    documentationUrl?: string;
    /** Confidence level 0-1 */
    confidence: number;
    /** Source of explanation */
    source: 'ai' | 'docs' | 'cache' | 'hybrid';
}

/**
 * Hover explanation (quick tooltip)
 */
export interface HoverExplanation {
    /** Markdown content for hover */
    contents: string;
    /** Range to highlight */
    range?: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
    };
    /** Whether more details are available */
    hasMoreDetails: boolean;
    /** Element type */
    elementType: CodeElementType;
}

/**
 * Explanation cache entry
 */
export interface CachedExplanation {
    /** The cached explanation */
    explanation: CodeExplanation;
    /** When it was cached */
    timestamp: number;
    /** Language of the code */
    language: string;
    /** Hash of the code */
    codeHash: string;
    /** Number of times accessed */
    accessCount: number;
}

/**
 * Service for AI-powered code explanations
 */
export interface AIExplainService {
    /**
     * Get a full explanation of code
     */
    explainCode(request: ExplainRequest, token?: CancellationToken): Promise<CodeExplanation>;

    /**
     * Get a quick hover explanation
     */
    getHoverExplanation(request: ExplainRequest, token?: CancellationToken): Promise<HoverExplanation>;

    /**
     * Explain what a symbol does
     */
    explainSymbol(
        symbolName: string,
        language: string,
        context?: string,
        token?: CancellationToken
    ): Promise<CodeExplanation>;

    /**
     * Explain an error message
     */
    explainError(
        errorMessage: string,
        code: string,
        language: string,
        token?: CancellationToken
    ): Promise<{
        explanation: string;
        cause: string;
        solutions: string[];
        examples?: UsageExample[];
    }>;

    /**
     * Explain differences between two code snippets
     */
    explainDiff(
        oldCode: string,
        newCode: string,
        language: string,
        token?: CancellationToken
    ): Promise<{
        summary: string;
        changes: Array<{
            type: 'added' | 'removed' | 'modified';
            description: string;
            impact: string;
        }>;
        overallImpact: string;
    }>;

    /**
     * Get explanation from cache if available
     */
    getCachedExplanation(code: string, language: string): Promise<CachedExplanation | undefined>;

    /**
     * Clear explanation cache
     */
    clearCache(): Promise<void>;

    /**
     * Record user feedback for explanation quality
     */
    recordFeedback(
        codeHash: string,
        rating: 'helpful' | 'not-helpful' | 'wrong',
        comment?: string
    ): Promise<void>;
}

/**
 * Detect the type of code element
 */
export function detectElementType(code: string, language: string): CodeElementType {
    const trimmed = code.trim();

    // Function patterns
    if (/^(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(async\s+)?(\([^)]*\)|[^=]+)\s*=>|(\w+)\s*\([^)]*\)\s*\{)/.test(trimmed)) {
        return 'function';
    }

    // Class patterns
    if (/^(export\s+)?(abstract\s+)?class\s+\w+/.test(trimmed)) {
        return 'class';
    }

    // Interface patterns
    if (/^(export\s+)?interface\s+\w+/.test(trimmed)) {
        return 'interface';
    }

    // Type patterns
    if (/^(export\s+)?type\s+\w+\s*=/.test(trimmed)) {
        return 'type';
    }

    // Enum patterns
    if (/^(export\s+)?enum\s+\w+/.test(trimmed)) {
        return 'enum';
    }

    // Import patterns
    if (/^import\s+/.test(trimmed)) {
        return 'import';
    }

    // Decorator patterns
    if (/^@\w+/.test(trimmed)) {
        return 'decorator';
    }

    // Variable patterns
    if (/^(const|let|var)\s+\w+/.test(trimmed)) {
        return 'variable';
    }

    // Method patterns (inside class)
    if (/^(public|private|protected|static|async)?\s*\w+\s*\([^)]*\)\s*[\{:]/.test(trimmed)) {
        return 'method';
    }

    // Property patterns
    if (/^\w+\s*[:=]/.test(trimmed)) {
        return 'property';
    }

    // Comment patterns
    if (/^(\/\/|\/\*|\*|#)/.test(trimmed)) {
        return 'comment';
    }

    return 'expression';
}

/**
 * Estimate code complexity
 */
export function estimateComplexity(code: string): ComplexityLevel {
    const lines = code.split('\n').length;
    const nestingDepth = (code.match(/\{/g) || []).length;
    const conditionals = (code.match(/\b(if|else|switch|case|while|for|do)\b/g) || []).length;
    const hasRegex = /\/[^/]+\/[gimsuy]*/.test(code);
    const hasAsync = /\b(async|await|Promise|then|catch)\b/.test(code);
    const hasGenerics = /<[A-Z]\w*>/.test(code);
    const hasRecursion = /\bfunction\s+(\w+)[\s\S]*\1\s*\(/.test(code);

    let score = 0;
    score += lines > 50 ? 3 : lines > 20 ? 2 : lines > 5 ? 1 : 0;
    score += nestingDepth > 5 ? 3 : nestingDepth > 3 ? 2 : nestingDepth > 1 ? 1 : 0;
    score += conditionals > 5 ? 2 : conditionals > 2 ? 1 : 0;
    score += hasRegex ? 1 : 0;
    score += hasAsync ? 1 : 0;
    score += hasGenerics ? 1 : 0;
    score += hasRecursion ? 2 : 0;

    if (score >= 8) {
        return 'expert';
    }
    if (score >= 5) {
        return 'complex';
    }
    if (score >= 2) {
        return 'moderate';
    }
    return 'simple';
}
