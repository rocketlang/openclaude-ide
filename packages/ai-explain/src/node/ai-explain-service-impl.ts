// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { CancellationToken } from '@theia/core/lib/common';
import * as crypto from 'crypto';
import {
    AIExplainService,
    ExplainRequest,
    CodeExplanation,
    HoverExplanation,
    CachedExplanation,
    UsageExample,
    CodeElementType,
    ComplexityLevel,
    detectElementType,
    estimateComplexity
} from '../common/ai-explain-protocol';

interface ExplanationCache {
    [hash: string]: CachedExplanation;
}

interface FeedbackEntry {
    codeHash: string;
    rating: 'helpful' | 'not-helpful' | 'wrong';
    comment?: string;
    timestamp: number;
}

@injectable()
export class AIExplainServiceImpl implements AIExplainService {
    protected cache: ExplanationCache = {};
    protected feedback: FeedbackEntry[] = [];
    protected readonly cacheMaxAge = 24 * 60 * 60 * 1000; // 24 hours
    protected readonly cacheMaxSize = 1000;

    async explainCode(
        request: ExplainRequest,
        token?: CancellationToken
    ): Promise<CodeExplanation> {
        const codeHash = this.hashCode(request.code);

        // Check cache first
        const cached = await this.getCachedExplanation(request.code, request.language);
        if (cached) {
            cached.accessCount++;
            return cached.explanation;
        }

        if (token?.isCancellationRequested) {
            return this.createEmptyExplanation();
        }

        const elementType = detectElementType(request.code, request.language);
        const complexity = estimateComplexity(request.code);

        // Generate explanation based on code analysis
        const explanation = await this.generateExplanation(request, elementType, complexity);

        // Cache the result
        this.cache[codeHash] = {
            explanation,
            timestamp: Date.now(),
            language: request.language,
            codeHash,
            accessCount: 1
        };

        // Cleanup old cache entries
        this.cleanupCache();

        return explanation;
    }

    async getHoverExplanation(
        request: ExplainRequest,
        token?: CancellationToken
    ): Promise<HoverExplanation> {
        const elementType = detectElementType(request.code, request.language);

        // For hover, we want a quick, brief explanation
        const briefRequest: ExplainRequest = {
            ...request,
            detailLevel: 'brief',
            includeExamples: false,
            includeRelated: false,
            maxLength: 300
        };

        if (token?.isCancellationRequested) {
            return {
                contents: '',
                hasMoreDetails: true,
                elementType
            };
        }

        const explanation = await this.explainCode(briefRequest, token);

        // Format for hover display
        const contents = this.formatForHover(explanation, request);

        return {
            contents,
            hasMoreDetails: true,
            elementType,
            range: request.startLine !== undefined ? {
                startLine: request.startLine,
                startColumn: request.startColumn || 0,
                endLine: request.startLine,
                endColumn: (request.startColumn || 0) + request.code.length
            } : undefined
        };
    }

    async explainSymbol(
        symbolName: string,
        language: string,
        context?: string,
        token?: CancellationToken
    ): Promise<CodeExplanation> {
        if (token?.isCancellationRequested) {
            return this.createEmptyExplanation();
        }

        // Try to find the symbol in known patterns
        const builtinExplanation = this.getBuiltinSymbolExplanation(symbolName, language);
        if (builtinExplanation) {
            return builtinExplanation;
        }

        // Generate explanation from context
        const request: ExplainRequest = {
            code: context || symbolName,
            language,
            symbolName,
            detailLevel: 'normal'
        };

        return this.explainCode(request, token);
    }

    async explainError(
        errorMessage: string,
        code: string,
        language: string,
        token?: CancellationToken
    ): Promise<{
        explanation: string;
        cause: string;
        solutions: string[];
        examples?: UsageExample[];
    }> {
        if (token?.isCancellationRequested) {
            return {
                explanation: '',
                cause: '',
                solutions: []
            };
        }

        // Common error patterns and solutions
        const errorAnalysis = this.analyzeError(errorMessage, code, language);

        return errorAnalysis;
    }

    async explainDiff(
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
    }> {
        if (token?.isCancellationRequested) {
            return {
                summary: '',
                changes: [],
                overallImpact: ''
            };
        }

        const oldLines = oldCode.split('\n');
        const newLines = newCode.split('\n');

        const changes: Array<{
            type: 'added' | 'removed' | 'modified';
            description: string;
            impact: string;
        }> = [];

        // Simple diff analysis
        const addedLines = newLines.filter(line => !oldLines.includes(line));
        const removedLines = oldLines.filter(line => !newLines.includes(line));

        if (addedLines.length > 0) {
            changes.push({
                type: 'added',
                description: `Added ${addedLines.length} line(s)`,
                impact: this.assessChangeImpact(addedLines, language)
            });
        }

        if (removedLines.length > 0) {
            changes.push({
                type: 'removed',
                description: `Removed ${removedLines.length} line(s)`,
                impact: this.assessChangeImpact(removedLines, language)
            });
        }

        const summary = this.generateDiffSummary(oldCode, newCode, changes);
        const overallImpact = this.assessOverallImpact(changes);

        return {
            summary,
            changes,
            overallImpact
        };
    }

    async getCachedExplanation(
        code: string,
        language: string
    ): Promise<CachedExplanation | undefined> {
        const hash = this.hashCode(code);
        const cached = this.cache[hash];

        if (!cached) {
            return undefined;
        }

        // Check if expired
        if (Date.now() - cached.timestamp > this.cacheMaxAge) {
            delete this.cache[hash];
            return undefined;
        }

        // Check language match
        if (cached.language !== language) {
            return undefined;
        }

        return cached;
    }

    async clearCache(): Promise<void> {
        this.cache = {};
    }

    async recordFeedback(
        codeHash: string,
        rating: 'helpful' | 'not-helpful' | 'wrong',
        comment?: string
    ): Promise<void> {
        this.feedback.push({
            codeHash,
            rating,
            comment,
            timestamp: Date.now()
        });

        // Keep only last 1000 feedback entries
        if (this.feedback.length > 1000) {
            this.feedback = this.feedback.slice(-1000);
        }
    }

    protected async generateExplanation(
        request: ExplainRequest,
        elementType: CodeElementType,
        complexity: ComplexityLevel
    ): Promise<CodeExplanation> {
        const { code, language, detailLevel = 'normal' } = request;

        // Analyze the code structure
        const analysis = this.analyzeCodeStructure(code, language, elementType);

        // Generate explanation parts
        const summary = this.generateSummary(code, elementType, analysis);
        const purpose = this.detectPurpose(code, elementType, analysis);
        const mechanism = this.explainMechanism(code, elementType, analysis);

        // Build the full explanation
        let explanation = `## ${this.getElementTypeLabel(elementType)}\n\n`;
        explanation += `${summary}\n\n`;

        if (purpose && detailLevel !== 'brief') {
            explanation += `### Purpose\n${purpose}\n\n`;
        }

        if (mechanism && detailLevel === 'detailed') {
            explanation += `### How it works\n${mechanism}\n\n`;
        }

        // Add warnings for complex code
        const warnings = this.detectWarnings(code, language);

        // Add examples if requested
        let examples: UsageExample[] | undefined;
        if (request.includeExamples && detailLevel !== 'brief') {
            examples = this.generateExamples(code, language, elementType);
        }

        // Add best practices
        const bestPractices = detailLevel === 'detailed'
            ? this.suggestBestPractices(code, language, elementType)
            : undefined;

        return {
            explanation,
            summary,
            elementType,
            complexity,
            purpose,
            mechanism,
            warnings: warnings.length > 0 ? warnings : undefined,
            examples,
            bestPractices,
            confidence: this.calculateConfidence(code, elementType),
            source: 'ai'
        };
    }

    protected analyzeCodeStructure(
        code: string,
        language: string,
        elementType: CodeElementType
    ): Record<string, any> {
        const analysis: Record<string, any> = {
            hasAsync: /\b(async|await)\b/.test(code),
            hasError: /\b(try|catch|throw|Error)\b/.test(code),
            hasLoop: /\b(for|while|do|forEach|map|filter|reduce)\b/.test(code),
            hasConditional: /\b(if|else|switch|case|\?)\b/.test(code),
            hasReturn: /\breturn\b/.test(code),
            parameters: this.extractParameters(code, language),
            returnType: this.extractReturnType(code, language),
            dependencies: this.extractDependencies(code, language)
        };

        return analysis;
    }

    protected extractParameters(code: string, language: string): string[] {
        const params: string[] = [];
        const match = code.match(/\(([^)]*)\)/);
        if (match && match[1]) {
            const paramStr = match[1];
            paramStr.split(',').forEach(p => {
                const trimmed = p.trim();
                if (trimmed) {
                    const name = trimmed.split(/[:\s=]/)[0].trim();
                    if (name && name !== '...') {
                        params.push(name);
                    }
                }
            });
        }
        return params;
    }

    protected extractReturnType(code: string, language: string): string | undefined {
        const match = code.match(/\):\s*([^{=]+)/);
        if (match) {
            return match[1].trim();
        }
        return undefined;
    }

    protected extractDependencies(code: string, language: string): string[] {
        const deps: string[] = [];
        const importMatch = code.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
        for (const match of importMatch) {
            deps.push(match[1]);
        }
        const requireMatch = code.matchAll(/require\s*\(['"]([^'"]+)['"]\)/g);
        for (const match of requireMatch) {
            deps.push(match[1]);
        }
        return deps;
    }

    protected generateSummary(
        code: string,
        elementType: CodeElementType,
        analysis: Record<string, any>
    ): string {
        const typeLabel = this.getElementTypeLabel(elementType);

        switch (elementType) {
            case 'function':
            case 'method': {
                const params = analysis.parameters as string[];
                const asyncLabel = analysis.hasAsync ? 'async ' : '';
                const paramDesc = params.length > 0 ? ` with ${params.length} parameter(s)` : '';
                return `An ${asyncLabel}${typeLabel.toLowerCase()}${paramDesc} that ${this.inferAction(code)}.`;
            }
            case 'class':
                return `A class that represents ${this.inferClassPurpose(code)}.`;
            case 'interface':
                return `An interface that defines ${this.inferInterfacePurpose(code)}.`;
            case 'variable':
                return `A variable that stores ${this.inferVariablePurpose(code)}.`;
            case 'import':
                return `Imports ${this.describeImports(code)}.`;
            default:
                return `A ${typeLabel.toLowerCase()} construct.`;
        }
    }

    protected inferAction(code: string): string {
        if (/\bfetch\b|\baxios\b|\brequest\b/.test(code)) {
            return 'makes an HTTP request';
        }
        if (/\breadFile\b|\bwriteFile\b|\bfs\./.test(code)) {
            return 'performs file operations';
        }
        if (/\bvalidate\b|\bisValid\b/.test(code)) {
            return 'validates data';
        }
        if (/\bparse\b|\bJSON\.parse\b/.test(code)) {
            return 'parses data';
        }
        if (/\bformat\b|\btoString\b/.test(code)) {
            return 'formats data';
        }
        if (/\bcreate\b|\binit\b|\bsetup\b/.test(code)) {
            return 'creates or initializes something';
        }
        if (/\bupdate\b|\bmodify\b|\bset\b/.test(code)) {
            return 'updates or modifies data';
        }
        if (/\bdelete\b|\bremove\b/.test(code)) {
            return 'removes or deletes data';
        }
        if (/\bget\b|\bfetch\b|\bread\b/.test(code)) {
            return 'retrieves data';
        }
        if (/\bhandle\b|\bprocess\b/.test(code)) {
            return 'handles or processes events';
        }
        return 'performs an operation';
    }

    protected inferClassPurpose(code: string): string {
        const className = code.match(/class\s+(\w+)/)?.[1] || 'entity';
        if (/Service|Provider|Manager/.test(className)) {
            return 'a service providing specific functionality';
        }
        if (/Controller|Handler/.test(className)) {
            return 'a controller handling requests or events';
        }
        if (/Repository|Store/.test(className)) {
            return 'a data storage abstraction';
        }
        if (/Factory|Builder/.test(className)) {
            return 'an object construction pattern';
        }
        if (/Component|Widget/.test(className)) {
            return 'a UI component';
        }
        return `a ${className} entity`;
    }

    protected inferInterfacePurpose(code: string): string {
        const interfaceName = code.match(/interface\s+(\w+)/)?.[1] || 'contract';
        return `the shape of ${interfaceName} objects`;
    }

    protected inferVariablePurpose(code: string): string {
        if (/\[\s*\]/.test(code) || /Array/.test(code)) {
            return 'a collection of items';
        }
        if (/\{\s*\}/.test(code) || /Object|Record/.test(code)) {
            return 'structured data';
        }
        if (/true|false|boolean/i.test(code)) {
            return 'a boolean flag';
        }
        if (/\d+/.test(code)) {
            return 'a numeric value';
        }
        if (/'|"/.test(code)) {
            return 'a text string';
        }
        return 'data';
    }

    protected describeImports(code: string): string {
        const match = code.match(/from\s+['"]([^'"]+)['"]/);
        if (match) {
            const module = match[1];
            if (module.startsWith('.')) {
                return 'local module exports';
            }
            if (module.startsWith('@')) {
                return `components from the ${module} package`;
            }
            return `components from the '${module}' module`;
        }
        return 'external dependencies';
    }

    protected detectPurpose(
        code: string,
        elementType: CodeElementType,
        analysis: Record<string, any>
    ): string {
        const purposes: string[] = [];

        if (analysis.hasAsync) {
            purposes.push('Handles asynchronous operations');
        }
        if (analysis.hasError) {
            purposes.push('Includes error handling');
        }
        if (analysis.hasLoop) {
            purposes.push('Iterates over data');
        }
        if (analysis.hasConditional) {
            purposes.push('Contains conditional logic');
        }

        return purposes.join('. ') || 'General-purpose code block.';
    }

    protected explainMechanism(
        code: string,
        elementType: CodeElementType,
        analysis: Record<string, any>
    ): string {
        const steps: string[] = [];

        if (analysis.parameters.length > 0) {
            steps.push(`Accepts ${analysis.parameters.length} parameter(s): ${analysis.parameters.join(', ')}`);
        }

        if (analysis.hasAsync) {
            steps.push('Executes asynchronously, returning a Promise');
        }

        if (analysis.hasError) {
            steps.push('Wraps operations in try-catch for error handling');
        }

        if (analysis.returnType) {
            steps.push(`Returns: ${analysis.returnType}`);
        }

        return steps.join('\n') || 'Executes the contained logic.';
    }

    protected detectWarnings(code: string, language: string): string[] {
        const warnings: string[] = [];

        if (/eval\s*\(/.test(code)) {
            warnings.push('⚠️ Uses eval() which can be a security risk');
        }

        if (/innerHTML/.test(code)) {
            warnings.push('⚠️ Sets innerHTML directly, consider using textContent for plain text');
        }

        if (/any\b/.test(code) && (language === 'typescript' || language === 'ts')) {
            warnings.push('⚠️ Uses `any` type which bypasses type checking');
        }

        if (/console\.log/.test(code)) {
            warnings.push('💡 Contains console.log statements - remember to remove in production');
        }

        if (/TODO|FIXME|HACK/i.test(code)) {
            warnings.push('📝 Contains TODO/FIXME comments');
        }

        return warnings;
    }

    protected generateExamples(
        code: string,
        language: string,
        elementType: CodeElementType
    ): UsageExample[] {
        const examples: UsageExample[] = [];

        // Generate a basic usage example
        if (elementType === 'function' || elementType === 'method') {
            const funcName = code.match(/(?:function\s+|const\s+|let\s+|var\s+)?(\w+)\s*(?:=\s*)?(?:\([^)]*\)|=>)/)?.[1];
            if (funcName) {
                examples.push({
                    description: `Basic usage of ${funcName}`,
                    code: `const result = ${funcName}(/* parameters */);`
                });
            }
        }

        if (elementType === 'class') {
            const className = code.match(/class\s+(\w+)/)?.[1];
            if (className) {
                examples.push({
                    description: `Creating an instance of ${className}`,
                    code: `const instance = new ${className}();`
                });
            }
        }

        return examples;
    }

    protected suggestBestPractices(
        code: string,
        language: string,
        elementType: CodeElementType
    ): string[] {
        const practices: string[] = [];

        if (elementType === 'function' && code.length > 200) {
            practices.push('Consider breaking down into smaller, focused functions');
        }

        if (!/\b(try|catch)\b/.test(code) && /\b(await|fetch|axios)\b/.test(code)) {
            practices.push('Add error handling for async operations');
        }

        if ((language === 'typescript' || language === 'ts') && /function/.test(code) && !/:.*=>/.test(code)) {
            practices.push('Add explicit return type annotation');
        }

        return practices;
    }

    protected calculateConfidence(code: string, elementType: CodeElementType): number {
        // Higher confidence for well-structured code
        let confidence = 0.7;

        if (elementType !== 'unknown') {
            confidence += 0.1;
        }

        if (code.includes('//') || code.includes('/*')) {
            confidence += 0.1; // Has comments
        }

        if (/^(export|const|function|class|interface)/.test(code.trim())) {
            confidence += 0.1; // Standard declaration
        }

        return Math.min(1, confidence);
    }

    protected analyzeError(
        errorMessage: string,
        code: string,
        language: string
    ): {
        explanation: string;
        cause: string;
        solutions: string[];
        examples?: UsageExample[];
    } {
        const solutions: string[] = [];
        let cause = '';
        let explanation = '';

        // Common error patterns
        if (/undefined is not a function/i.test(errorMessage)) {
            explanation = 'This error occurs when you try to call something as a function that is undefined.';
            cause = 'The variable or property you are trying to call does not exist or has not been assigned.';
            solutions.push('Check if the function is properly imported');
            solutions.push('Verify the function name is spelled correctly');
            solutions.push('Ensure the function is defined before calling it');
        } else if (/cannot read propert/i.test(errorMessage)) {
            explanation = 'This error occurs when trying to access a property on undefined or null.';
            cause = 'The object you are trying to access does not exist.';
            solutions.push('Add null/undefined checks before accessing properties');
            solutions.push('Use optional chaining (?.) operator');
            solutions.push('Verify the object is properly initialized');
        } else if (/is not defined/i.test(errorMessage)) {
            explanation = 'This error occurs when using a variable that has not been declared.';
            cause = 'The variable has not been declared in the current scope.';
            solutions.push('Declare the variable with const, let, or var');
            solutions.push('Check for typos in the variable name');
            solutions.push('Verify the import statement is correct');
        } else if (/type.*is not assignable/i.test(errorMessage)) {
            explanation = 'This TypeScript error occurs when types do not match.';
            cause = 'You are trying to assign a value of one type to a variable of an incompatible type.';
            solutions.push('Check the expected type and adjust the value');
            solutions.push('Use type assertion if you are certain of the type');
            solutions.push('Update the type definition to accept the value');
        } else {
            explanation = `An error occurred: ${errorMessage}`;
            cause = 'The exact cause requires further analysis.';
            solutions.push('Check the stack trace for more details');
            solutions.push('Review the code around the error location');
            solutions.push('Search for similar error messages online');
        }

        return {
            explanation,
            cause,
            solutions
        };
    }

    protected assessChangeImpact(lines: string[], language: string): string {
        const hasFunction = lines.some(l => /function|const\s+\w+\s*=/.test(l));
        const hasImport = lines.some(l => /import/.test(l));
        const hasExport = lines.some(l => /export/.test(l));

        if (hasExport) {
            return 'May affect other modules that import from this file';
        }
        if (hasFunction) {
            return 'Modifies functionality within the file';
        }
        if (hasImport) {
            return 'Changes dependencies';
        }
        return 'Minor change';
    }

    protected generateDiffSummary(
        oldCode: string,
        newCode: string,
        changes: Array<{ type: string; description: string }>
    ): string {
        if (changes.length === 0) {
            return 'No significant changes detected.';
        }

        const parts = changes.map(c => c.description.toLowerCase());
        return `This diff ${parts.join(' and ')}.`;
    }

    protected assessOverallImpact(
        changes: Array<{ type: string; impact: string }>
    ): string {
        if (changes.some(c => c.impact.includes('affect other modules'))) {
            return 'High - may require updates in dependent code';
        }
        if (changes.some(c => c.impact.includes('functionality'))) {
            return 'Medium - changes behavior of this module';
        }
        return 'Low - localized changes';
    }

    protected formatForHover(explanation: CodeExplanation, request: ExplainRequest): string {
        let content = '';

        // Add type badge
        content += `**${this.getElementTypeLabel(explanation.elementType)}**`;

        if (explanation.complexity !== 'simple') {
            content += ` _(${explanation.complexity})_`;
        }

        content += '\n\n';

        // Add summary
        content += explanation.summary;

        // Add warnings if any
        if (explanation.warnings && explanation.warnings.length > 0) {
            content += '\n\n---\n';
            content += explanation.warnings[0];
        }

        return content;
    }

    protected getElementTypeLabel(elementType: CodeElementType): string {
        const labels: Record<CodeElementType, string> = {
            'function': '⚡ Function',
            'class': '📦 Class',
            'method': '🔧 Method',
            'variable': '📌 Variable',
            'import': '📥 Import',
            'interface': '📋 Interface',
            'type': '🏷️ Type',
            'enum': '📊 Enum',
            'property': '🔑 Property',
            'parameter': '📥 Parameter',
            'expression': '💭 Expression',
            'statement': '📝 Statement',
            'comment': '💬 Comment',
            'decorator': '🎀 Decorator',
            'unknown': '❓ Code'
        };
        return labels[elementType] || '❓ Code';
    }

    protected getBuiltinSymbolExplanation(
        symbolName: string,
        language: string
    ): CodeExplanation | undefined {
        // Common JS/TS built-in explanations
        const builtins: Record<string, { summary: string; purpose: string }> = {
            'console': {
                summary: 'Browser/Node.js console object for debugging output',
                purpose: 'Used to log messages, warnings, and errors to the console'
            },
            'Promise': {
                summary: 'Represents the eventual completion of an async operation',
                purpose: 'Handles asynchronous operations with then/catch/finally methods'
            },
            'async': {
                summary: 'Keyword for declaring asynchronous functions',
                purpose: 'Makes functions return a Promise and enables await keyword'
            },
            'await': {
                summary: 'Pauses async function execution until Promise resolves',
                purpose: 'Simplifies working with Promises by allowing sequential-style code'
            },
            'Map': {
                summary: 'Key-value collection with any type of keys',
                purpose: 'Stores and retrieves values by key, maintains insertion order'
            },
            'Set': {
                summary: 'Collection of unique values',
                purpose: 'Stores unique values of any type'
            },
            'Array': {
                summary: 'Ordered collection of elements',
                purpose: 'Stores and manipulates lists of items'
            }
        };

        const builtin = builtins[symbolName];
        if (builtin) {
            return {
                explanation: `## ${symbolName}\n\n${builtin.summary}`,
                summary: builtin.summary,
                elementType: 'unknown',
                complexity: 'simple',
                purpose: builtin.purpose,
                confidence: 1,
                source: 'docs'
            };
        }

        return undefined;
    }

    protected createEmptyExplanation(): CodeExplanation {
        return {
            explanation: '',
            summary: 'Explanation cancelled',
            elementType: 'unknown',
            complexity: 'simple',
            confidence: 0,
            source: 'ai'
        };
    }

    protected hashCode(code: string): string {
        return crypto.createHash('md5').update(code).digest('hex');
    }

    protected cleanupCache(): void {
        const entries = Object.entries(this.cache);

        if (entries.length <= this.cacheMaxSize) {
            return;
        }

        // Sort by access count and timestamp
        entries.sort((a, b) => {
            const scoreA = a[1].accessCount + (Date.now() - a[1].timestamp) / this.cacheMaxAge;
            const scoreB = b[1].accessCount + (Date.now() - b[1].timestamp) / this.cacheMaxAge;
            return scoreA - scoreB;
        });

        // Remove least valuable entries
        const toRemove = entries.slice(0, entries.length - this.cacheMaxSize);
        toRemove.forEach(([hash]) => {
            delete this.cache[hash];
        });
    }
}
