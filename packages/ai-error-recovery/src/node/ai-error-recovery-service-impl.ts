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
import {
    AIErrorRecoveryService,
    ErrorContext,
    ErrorAnalysis,
    ErrorFix,
    EditorError,
    ErrorCategory,
    ErrorStatistics,
    BatchFixResult,
    FixEdit
} from '../common/ai-error-recovery-protocol';

interface ErrorPattern {
    matcher: RegExp;
    codes?: (string | number)[];
    category: ErrorCategory;
    explanation: (match: RegExpMatchArray, error: EditorError) => string;
    fixes: (match: RegExpMatchArray, error: EditorError, context: ErrorContext) => ErrorFix[];
}

@injectable()
export class AIErrorRecoveryServiceImpl implements AIErrorRecoveryService {
    protected fixCounter = 0;
    protected fixHistory: Map<string, { error: EditorError; fix: ErrorFix }[]> = new Map();

    protected readonly errorPatterns: ErrorPattern[] = [
        // TypeScript: Cannot find name
        {
            matcher: /Cannot find name '(\w+)'/,
            codes: [2304],
            category: 'reference',
            explanation: (match) => `The variable or function '${match[1]}' is used but has not been declared or imported.`,
            fixes: (match, error, context) => {
                const name = match[1];
                return [
                    this.createFix('declare-variable', `Declare '${name}'`, `Add a declaration for ${name}`, error, [
                        {
                            startLine: error.startLine,
                            startColumn: 0,
                            endLine: error.startLine,
                            endColumn: 0,
                            newText: `const ${name} = undefined; // TODO: initialize\n`
                        }
                    ], 'medium'),
                    this.createFix('import-module', `Import '${name}'`, `Add an import statement for ${name}`, error, [
                        {
                            startLine: 1,
                            startColumn: 0,
                            endLine: 1,
                            endColumn: 0,
                            newText: `import { ${name} } from './${name.toLowerCase()}';\n`
                        }
                    ], 'medium')
                ];
            }
        },
        // TypeScript: Property does not exist
        {
            matcher: /Property '(\w+)' does not exist on type '([^']+)'/,
            codes: [2339],
            category: 'type',
            explanation: (match) => `The property '${match[1]}' is not defined on the type '${match[2]}'. This could be a typo or the property needs to be added to the type definition.`,
            fixes: (match, error, context) => {
                const prop = match[1];
                return [
                    this.createFix('add-optional-chain', 'Use optional chaining', `Change to optional access with ?.${prop}`, error, [
                        {
                            startLine: error.startLine,
                            startColumn: error.startColumn - 1,
                            endLine: error.endLine,
                            endColumn: error.startColumn,
                            newText: '?.'
                        }
                    ], 'high', true),
                    this.createFix('add-type-assertion', 'Add type assertion', `Assert the object has this property`, error, [
                        {
                            startLine: error.startLine,
                            startColumn: error.startColumn,
                            endLine: error.endLine,
                            endColumn: error.endColumn,
                            newText: `(${context.surroundingCode?.errorLine?.split('.')[0]} as any).${prop}`
                        }
                    ], 'low')
                ];
            }
        },
        // TypeScript: Type is not assignable
        {
            matcher: /Type '([^']+)' is not assignable to type '([^']+)'/,
            codes: [2322],
            category: 'type',
            explanation: (match) => `You're trying to assign a value of type '${match[1]}' to something that expects type '${match[2]}'. The types are incompatible.`,
            fixes: (match, error, context) => {
                const fromType = match[1];
                const toType = match[2];
                return [
                    this.createFix('add-type-assertion', `Assert as ${toType}`, `Add 'as ${toType}' type assertion`, error, [
                        {
                            startLine: error.startLine,
                            startColumn: error.endColumn,
                            endLine: error.endLine,
                            endColumn: error.endColumn,
                            newText: ` as ${toType}`
                        }
                    ], 'medium'),
                    this.createFix('convert-type', 'Convert the value', `Convert from ${fromType} to ${toType}`, error, [], 'low')
                ];
            }
        },
        // TypeScript: Missing semicolon
        {
            matcher: /';' expected/,
            codes: [1005],
            category: 'syntax',
            explanation: () => `A semicolon is missing at the end of a statement.`,
            fixes: (match, error) => [
                this.createFix('add-semicolon', 'Add semicolon', 'Insert missing semicolon', error, [
                    {
                        startLine: error.startLine,
                        startColumn: error.startColumn,
                        endLine: error.endLine,
                        endColumn: error.endColumn,
                        newText: ';'
                    }
                ], 'high', true)
            ]
        },
        // TypeScript: Missing import
        {
            matcher: /Module '"([^"]+)"' has no exported member '(\w+)'/,
            codes: [2305],
            category: 'import',
            explanation: (match) => `The module '${match[1]}' doesn't export '${match[2]}'. Check the spelling or verify the export exists.`,
            fixes: (match, error) => {
                const moduleName = match[1];
                const member = match[2];
                return [
                    this.createFix('use-default-import', 'Try default import', `Import ${member} as default`, error, [], 'medium'),
                    this.createFix('check-module-exports', 'Check module exports', `Verify what ${moduleName} exports`, error, [], 'low')
                ];
            }
        },
        // ESLint: Unused variable
        {
            matcher: /'(\w+)' is (?:defined but never used|assigned a value but never used)/,
            category: 'style',
            explanation: (match) => `The variable '${match[1]}' is declared but never used in your code.`,
            fixes: (match, error) => {
                const name = match[1];
                return [
                    this.createFix('prefix-underscore', 'Prefix with underscore', `Rename to _${name} to indicate intentionally unused`, error, [
                        {
                            startLine: error.startLine,
                            startColumn: error.startColumn,
                            endLine: error.endLine,
                            endColumn: error.endColumn,
                            newText: `_${name}`
                        }
                    ], 'high', true),
                    this.createFix('remove-variable', 'Remove the variable', 'Delete the unused declaration', error, [
                        {
                            startLine: error.startLine,
                            startColumn: 0,
                            endLine: error.startLine + 1,
                            endColumn: 0,
                            newText: ''
                        }
                    ], 'medium')
                ];
            }
        },
        // Missing closing bracket/brace
        {
            matcher: /'\)' expected|'\}' expected|'\]' expected/,
            category: 'syntax',
            explanation: () => `A closing bracket, brace, or parenthesis is missing.`,
            fixes: (match, error) => {
                const char = match[0].includes(')') ? ')' : match[0].includes('}') ? '}' : ']';
                return [
                    this.createFix('add-closing', `Add closing '${char}'`, `Insert missing ${char}`, error, [
                        {
                            startLine: error.startLine,
                            startColumn: error.startColumn,
                            endLine: error.endLine,
                            endColumn: error.endColumn,
                            newText: char
                        }
                    ], 'high', true)
                ];
            }
        },
        // Unexpected token
        {
            matcher: /Unexpected token[:\s]*'?(\S+)'?/,
            category: 'syntax',
            explanation: (match) => `The parser encountered an unexpected token '${match[1]}'. This usually indicates a syntax error nearby.`,
            fixes: () => []
        },
        // Cannot read property of undefined/null
        {
            matcher: /Cannot read propert(?:y|ies) (?:of |'[^']+' of )(undefined|null)/,
            category: 'runtime',
            explanation: (match) => `You're trying to access a property on a value that is ${match[1]}. The object doesn't exist at runtime.`,
            fixes: (match, error) => [
                this.createFix('add-null-check', 'Add null check', 'Add a check before accessing the property', error, [], 'high'),
                this.createFix('use-optional-chain', 'Use optional chaining (?.)' , 'Replace with optional chaining syntax', error, [], 'high', true)
            ]
        },
        // is not a function
        {
            matcher: /(\w+) is not a function/,
            category: 'runtime',
            explanation: (match) => `'${match[1]}' is not a function but you're trying to call it. Check if it's defined correctly or if there's a typo.`,
            fixes: () => []
        },
        // Argument type mismatch
        {
            matcher: /Argument of type '([^']+)' is not assignable to parameter of type '([^']+)'/,
            codes: [2345],
            category: 'type',
            explanation: (match) => `The function expects a parameter of type '${match[2]}', but you're passing '${match[1]}'.`,
            fixes: (match, error) => {
                const toType = match[2];
                return [
                    this.createFix('type-assertion', `Assert as ${toType}`, `Cast the argument to ${toType}`, error, [], 'medium'),
                    this.createFix('convert-value', 'Convert the value', 'Transform the value to match expected type', error, [], 'low')
                ];
            }
        }
    ];

    async analyzeError(context: ErrorContext, token?: CancellationToken): Promise<ErrorAnalysis> {
        const { error } = context;

        if (token?.isCancellationRequested) {
            return this.createEmptyAnalysis(error);
        }

        // Find matching pattern
        let category: ErrorCategory = 'unknown';
        let explanation = `An error occurred: ${error.message}`;
        let rootCause = 'Unable to determine the exact cause.';
        let fixes: ErrorFix[] = [];

        for (const pattern of this.errorPatterns) {
            const match = error.message.match(pattern.matcher);
            if (match) {
                // Check error code if pattern specifies codes
                if (pattern.codes && error.code && !pattern.codes.includes(error.code)) {
                    continue;
                }

                category = pattern.category;
                explanation = pattern.explanation(match, error);
                rootCause = this.inferRootCause(error, category, context);
                fixes = pattern.fixes(match, error, context);
                break;
            }
        }

        // Add generic fixes if none found
        if (fixes.length === 0) {
            fixes = this.getGenericFixes(error, context);
        }

        return {
            error,
            category,
            explanation,
            rootCause,
            whyItHappened: this.explainWhy(error, category, context),
            prevention: this.suggestPrevention(category),
            fixes,
            documentation: this.getDocumentation(error, category),
            learningResources: this.getLearningResources(category)
        };
    }

    async getQuickFixes(context: ErrorContext, token?: CancellationToken): Promise<ErrorFix[]> {
        const analysis = await this.analyzeError(context, token);
        return analysis.fixes;
    }

    async applyFix(fix: ErrorFix, token?: CancellationToken): Promise<{ success: boolean; message?: string }> {
        if (token?.isCancellationRequested) {
            return { success: false, message: 'Cancelled' };
        }

        // In a full implementation, this would apply the edits
        console.log('Applying fix:', fix.title, fix.edits);

        return {
            success: true,
            message: `Applied fix: ${fix.title}`
        };
    }

    async analyzeErrors(
        errors: EditorError[],
        fileContent: string,
        language: string,
        token?: CancellationToken
    ): Promise<{
        analyses: ErrorAnalysis[];
        commonPatterns: string[];
        suggestedBatchFixes: ErrorFix[];
    }> {
        const analyses: ErrorAnalysis[] = [];
        const patternCounts: Map<string, number> = new Map();

        for (const error of errors) {
            if (token?.isCancellationRequested) {
                break;
            }

            const context: ErrorContext = {
                error,
                fileContent,
                language,
                surroundingCode: this.getSurroundingCode(fileContent, error.startLine)
            };

            const analysis = await this.analyzeError(context, token);
            analyses.push(analysis);

            // Count patterns
            const key = `${analysis.category}:${error.message.split(' ').slice(0, 3).join(' ')}`;
            patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
        }

        // Find common patterns
        const commonPatterns: string[] = [];
        for (const [pattern, count] of patternCounts) {
            if (count >= 2) {
                commonPatterns.push(`${pattern} (${count} occurrences)`);
            }
        }

        // Suggest batch fixes for common issues
        const suggestedBatchFixes: ErrorFix[] = [];
        const uniqueCategories = new Set(analyses.map(a => a.category));

        if (uniqueCategories.has('import')) {
            suggestedBatchFixes.push(this.createFix(
                'fix-all-imports',
                'Fix all import errors',
                'Auto-fix all import-related errors',
                errors[0],
                [],
                'medium'
            ));
        }

        if (uniqueCategories.has('style')) {
            suggestedBatchFixes.push(this.createFix(
                'fix-all-style',
                'Fix all style issues',
                'Run auto-formatter and fix style errors',
                errors[0],
                [],
                'high'
            ));
        }

        return {
            analyses,
            commonPatterns,
            suggestedBatchFixes
        };
    }

    async fixAllInFile(
        uri: string,
        fileContent: string,
        language: string,
        token?: CancellationToken
    ): Promise<BatchFixResult> {
        // In a real implementation, this would:
        // 1. Get all errors in the file
        // 2. Find auto-fixable ones
        // 3. Apply fixes in reverse order (bottom to top)

        return {
            fixedCount: 0,
            failedCount: 0,
            fixedErrors: [],
            failedErrors: [],
            edits: []
        };
    }

    async explainStackTrace(
        stackTrace: string,
        language: string,
        token?: CancellationToken
    ): Promise<{
        summary: string;
        rootCause: string;
        relevantFrames: Array<{
            file: string;
            line: number;
            function: string;
            explanation: string;
            isUserCode: boolean;
        }>;
        suggestedFixes: string[];
    }> {
        const lines = stackTrace.split('\n');
        const frames: Array<{
            file: string;
            line: number;
            function: string;
            explanation: string;
            isUserCode: boolean;
        }> = [];

        // Parse stack trace
        const errorMessage = lines[0] || 'Unknown error';

        for (const line of lines.slice(1)) {
            // Common stack trace format: at functionName (file:line:column)
            const match = line.match(/at\s+(?:(.+?)\s+)?\(?([^:]+):(\d+)(?::\d+)?\)?/);
            if (match) {
                const [, funcName, file, lineNum] = match;
                const isUserCode = !file.includes('node_modules') && !file.startsWith('internal/');

                frames.push({
                    file,
                    line: parseInt(lineNum, 10),
                    function: funcName || '<anonymous>',
                    explanation: isUserCode
                        ? `Your code at line ${lineNum} in ${file}`
                        : `Library code: ${funcName || 'anonymous function'}`,
                    isUserCode
                });
            }
        }

        // Find the first user code frame
        const firstUserFrame = frames.find(f => f.isUserCode);

        return {
            summary: errorMessage,
            rootCause: firstUserFrame
                ? `The error originated in your code at ${firstUserFrame.file}:${firstUserFrame.line}`
                : 'The error occurred in library code',
            relevantFrames: frames.slice(0, 10),
            suggestedFixes: this.suggestStackTraceFixes(errorMessage, frames)
        };
    }

    async getStatistics(errors: EditorError[]): Promise<ErrorStatistics> {
        const bySeverity: Record<string, number> = {
            error: 0,
            warning: 0,
            info: 0,
            hint: 0
        };

        const byCategory: Record<string, number> = {};
        const messageCounts: Map<string, { count: number; category: ErrorCategory }> = new Map();
        const fileCounts: Map<string, number> = new Map();

        for (const error of errors) {
            bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;

            // Categorize
            const category = this.categorizeError(error);
            byCategory[category] = (byCategory[category] || 0) + 1;

            // Count messages
            const normalizedMsg = error.message.replace(/['"][^'"]+['"]/g, "'...'");
            const existing = messageCounts.get(normalizedMsg);
            if (existing) {
                existing.count++;
            } else {
                messageCounts.set(normalizedMsg, { count: 1, category });
            }

            // Count by file
            fileCounts.set(error.uri, (fileCounts.get(error.uri) || 0) + 1);
        }

        // Get most common
        const mostCommon = Array.from(messageCounts.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([message, data]) => ({
                message,
                count: data.count,
                category: data.category
            }));

        // Get files by error count
        const filesByErrorCount = Array.from(fileCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([uri, count]) => ({ uri, count }));

        return {
            totalErrors: errors.length,
            bySeverity: bySeverity as Record<'error' | 'warning' | 'info' | 'hint', number>,
            byCategory: byCategory as Record<ErrorCategory, number>,
            mostCommon,
            filesByErrorCount
        };
    }

    async recordFixChoice(error: EditorError, chosenFix: ErrorFix): Promise<void> {
        const key = this.getErrorKey(error);
        const history = this.fixHistory.get(key) || [];
        history.push({ error, fix: chosenFix });
        this.fixHistory.set(key, history);
    }

    async explainErrorCode(code: string | number, source: string): Promise<{
        title: string;
        explanation: string;
        commonCauses: string[];
        solutions: string[];
        documentationUrl?: string;
    }> {
        const codeStr = String(code);

        // TypeScript error codes
        const tsErrors: Record<string, { title: string; explanation: string; causes: string[]; solutions: string[] }> = {
            '2304': {
                title: 'Cannot find name',
                explanation: 'A variable, function, or type is used but not declared or imported.',
                causes: ['Typo in the identifier name', 'Missing import statement', 'Variable used before declaration'],
                solutions: ['Check spelling', 'Add the missing import', 'Declare the variable before use']
            },
            '2339': {
                title: 'Property does not exist',
                explanation: 'Attempting to access a property that TypeScript cannot verify exists on the type.',
                causes: ['Property not defined on the interface/type', 'Object might be undefined', 'Typo in property name'],
                solutions: ['Add the property to the type', 'Use optional chaining (?.)', 'Check property name spelling']
            },
            '2322': {
                title: 'Type not assignable',
                explanation: 'Trying to assign a value to something of an incompatible type.',
                causes: ['Wrong value type', 'Null/undefined not handled', 'Generic type mismatch'],
                solutions: ['Convert the value to the correct type', 'Use type assertion', 'Fix the type definition']
            }
        };

        const errorInfo = tsErrors[codeStr];

        if (errorInfo) {
            return {
                title: `TS${codeStr}: ${errorInfo.title}`,
                explanation: errorInfo.explanation,
                commonCauses: errorInfo.causes,
                solutions: errorInfo.solutions,
                documentationUrl: `https://typescript.tv/errors/#TS${codeStr}`
            };
        }

        return {
            title: `Error ${code}`,
            explanation: 'No detailed information available for this error code.',
            commonCauses: ['Check the error message for details'],
            solutions: ['Review the code at the error location']
        };
    }

    async suggestPreventiveMeasures(errors: EditorError[]): Promise<{
        suggestions: Array<{
            title: string;
            description: string;
            impact: 'high' | 'medium' | 'low';
            implementation: string;
        }>;
    }> {
        const suggestions: Array<{
            title: string;
            description: string;
            impact: 'high' | 'medium' | 'low';
            implementation: string;
        }> = [];

        const stats = await this.getStatistics(errors);

        // Suggest based on error patterns
        if ((stats.byCategory['type'] || 0) > 3) {
            suggestions.push({
                title: 'Enable stricter TypeScript settings',
                description: 'Many type errors suggest stricter checks could help catch issues earlier.',
                impact: 'high',
                implementation: 'Add "strict": true to tsconfig.json compilerOptions'
            });
        }

        if ((stats.byCategory['import'] || 0) > 2) {
            suggestions.push({
                title: 'Use auto-import IDE feature',
                description: 'Multiple import errors suggest auto-import would save time.',
                impact: 'medium',
                implementation: 'Enable auto-import in IDE settings'
            });
        }

        if ((stats.byCategory['style'] || 0) > 5) {
            suggestions.push({
                title: 'Set up ESLint with auto-fix',
                description: 'Many style errors could be auto-fixed on save.',
                impact: 'medium',
                implementation: 'npm install eslint && npx eslint --init'
            });
        }

        if (stats.totalErrors > 20) {
            suggestions.push({
                title: 'Add pre-commit hooks',
                description: 'Many errors suggest adding checks before commits.',
                impact: 'high',
                implementation: 'npm install husky lint-staged && npx husky init'
            });
        }

        return { suggestions };
    }

    // Helper methods

    protected createFix(
        id: string,
        title: string,
        description: string,
        error: EditorError,
        edits: FixEdit[],
        confidence: 'high' | 'medium' | 'low',
        isPreferred: boolean = false
    ): ErrorFix {
        return {
            id: `${id}-${++this.fixCounter}`,
            title,
            description,
            confidence,
            isPreferred,
            edits,
            affectedFiles: [error.uri],
            hasSideEffects: edits.length === 0
        };
    }

    protected createEmptyAnalysis(error: EditorError): ErrorAnalysis {
        return {
            error,
            category: 'unknown',
            explanation: error.message,
            rootCause: 'Analysis cancelled',
            whyItHappened: '',
            fixes: []
        };
    }

    protected inferRootCause(error: EditorError, category: ErrorCategory, context: ErrorContext): string {
        switch (category) {
            case 'syntax':
                return 'There is a syntax error in your code that prevents it from being parsed correctly.';
            case 'type':
                return 'TypeScript detected a type mismatch in your code.';
            case 'reference':
                return 'A referenced identifier is not defined in the current scope.';
            case 'import':
                return 'There is a problem with an import statement or module resolution.';
            case 'runtime':
                return 'This error would occur when the code runs, not during compilation.';
            default:
                return 'The exact root cause could not be determined automatically.';
        }
    }

    protected explainWhy(error: EditorError, category: ErrorCategory, context: ErrorContext): string {
        const baseExplanation = `This ${category} error occurred because `;

        switch (category) {
            case 'syntax':
                return baseExplanation + 'the code structure does not match the expected grammar.';
            case 'type':
                return baseExplanation + 'TypeScript\'s type system detected incompatible types.';
            case 'reference':
                return baseExplanation + 'you\'re using something that hasn\'t been defined yet.';
            case 'import':
                return baseExplanation + 'the module system couldn\'t resolve the import.';
            default:
                return baseExplanation + 'of an issue in your code.';
        }
    }

    protected suggestPrevention(category: ErrorCategory): string {
        switch (category) {
            case 'syntax':
                return 'Use an IDE with syntax highlighting and auto-formatting to catch these early.';
            case 'type':
                return 'Consider enabling stricter TypeScript settings and using explicit type annotations.';
            case 'reference':
                return 'Use auto-import features and declare variables before use.';
            case 'import':
                return 'Ensure all dependencies are installed and check import paths.';
            default:
                return 'Review the code carefully and add appropriate error handling.';
        }
    }

    protected getDocumentation(error: EditorError, category: ErrorCategory): Array<{ title: string; url: string }> {
        const docs: Array<{ title: string; url: string }> = [];

        if (error.code && error.source === 'typescript') {
            docs.push({
                title: `TypeScript Error TS${error.code}`,
                url: `https://typescript.tv/errors/#TS${error.code}`
            });
        }

        return docs;
    }

    protected getLearningResources(category: ErrorCategory): Array<{
        title: string;
        url: string;
        type: 'docs' | 'tutorial' | 'video' | 'article';
    }> {
        const resources: Array<{
            title: string;
            url: string;
            type: 'docs' | 'tutorial' | 'video' | 'article';
        }> = [];

        switch (category) {
            case 'type':
                resources.push({
                    title: 'TypeScript Handbook',
                    url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
                    type: 'docs'
                });
                break;
            case 'import':
                resources.push({
                    title: 'ES Modules Guide',
                    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules',
                    type: 'docs'
                });
                break;
        }

        return resources;
    }

    protected getGenericFixes(error: EditorError, context: ErrorContext): ErrorFix[] {
        return [
            this.createFix(
                'search-online',
                'Search for this error',
                'Search online for solutions to this error',
                error,
                [],
                'low'
            )
        ];
    }

    protected getSurroundingCode(content: string, line: number): {
        before: string[];
        errorLine: string;
        after: string[];
    } {
        const lines = content.split('\n');
        const idx = line - 1;

        return {
            before: lines.slice(Math.max(0, idx - 3), idx),
            errorLine: lines[idx] || '',
            after: lines.slice(idx + 1, idx + 4)
        };
    }

    protected suggestStackTraceFixes(errorMessage: string, frames: Array<{ file: string; line: number; function: string; isUserCode: boolean }>): string[] {
        const suggestions: string[] = [];

        if (errorMessage.includes('undefined') || errorMessage.includes('null')) {
            suggestions.push('Add null/undefined checks before accessing properties');
            suggestions.push('Use optional chaining (?.) operator');
        }

        if (errorMessage.includes('not a function')) {
            suggestions.push('Check if the variable is properly initialized');
            suggestions.push('Verify the import statement is correct');
        }

        if (frames.some(f => f.isUserCode)) {
            suggestions.push('Add try-catch around the failing code');
            suggestions.push('Add logging to understand the state when error occurs');
        }

        return suggestions;
    }

    protected categorizeError(error: EditorError): ErrorCategory {
        const message = error.message.toLowerCase();

        if (message.includes('syntax') || message.includes('unexpected') || message.includes('expected')) {
            return 'syntax';
        }
        if (message.includes('type') || message.includes('assignable')) {
            return 'type';
        }
        if (message.includes('cannot find') || message.includes('not defined')) {
            return 'reference';
        }
        if (message.includes('import') || message.includes('module')) {
            return 'import';
        }
        if (message.includes('unused') || message.includes('prefer')) {
            return 'style';
        }

        return 'unknown';
    }

    protected getErrorKey(error: EditorError): string {
        return `${error.uri}:${error.startLine}:${error.message.slice(0, 50)}`;
    }
}
