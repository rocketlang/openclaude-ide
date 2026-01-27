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
    AIRefactorService,
    RefactorRequest,
    RefactorSuggestion,
    RefactorContext,
    RefactorResult,
    ExtractParams,
    RenameParams,
    RenameSuggestion,
    CodeSelection,
    CodeSmell,
    FileEdit,
    TextEdit,
    RefactorKind,
    getRefactorLabel
} from '../common/ai-refactor-protocol';

interface UndoEntry {
    id: string;
    timestamp: number;
    edits: FileEdit[];
    description: string;
}

@injectable()
export class AIRefactorServiceImpl implements AIRefactorService {
    protected suggestionCounter = 0;
    protected undoStack: UndoEntry[] = [];
    protected readonly maxUndoEntries = 50;

    async getSuggestions(
        request: RefactorRequest,
        token?: CancellationToken
    ): Promise<RefactorSuggestion[]> {
        const suggestions: RefactorSuggestion[] = [];
        const { context } = request;

        if (token?.isCancellationRequested) {
            return suggestions;
        }

        // Analyze selection for extract suggestions
        if (context.selection && context.selection.text.length > 0) {
            const text = context.selection.text;

            // Extract function suggestion
            if (this.canExtractFunction(text, context.language)) {
                suggestions.push(this.createSuggestion('extract-function', context, {
                    title: 'Extract Function',
                    description: 'Extract selected code into a new function',
                    risk: 'safe',
                    confidence: 0.9,
                    isQuickFix: true,
                    shortcut: 'Ctrl+Shift+M'
                }));
            }

            // Extract variable suggestion
            if (this.canExtractVariable(text, context.language)) {
                suggestions.push(this.createSuggestion('extract-variable', context, {
                    title: 'Extract Variable',
                    description: 'Extract selected expression into a variable',
                    risk: 'safe',
                    confidence: 0.85,
                    isQuickFix: true,
                    shortcut: 'Ctrl+Shift+V'
                }));
            }

            // Extract constant suggestion
            if (this.canExtractConstant(text, context.language)) {
                suggestions.push(this.createSuggestion('extract-constant', context, {
                    title: 'Extract Constant',
                    description: 'Extract selected value into a constant',
                    risk: 'safe',
                    confidence: 0.8,
                    isQuickFix: true
                }));
            }

            // Convert to arrow function
            if (this.isRegularFunction(text)) {
                suggestions.push(this.createSuggestion('convert-to-arrow', context, {
                    title: 'Convert to Arrow Function',
                    description: 'Convert function declaration to arrow function',
                    risk: 'low',
                    confidence: 0.9,
                    isQuickFix: true
                }));
            }

            // Convert to regular function
            if (this.isArrowFunction(text)) {
                suggestions.push(this.createSuggestion('convert-to-function', context, {
                    title: 'Convert to Function',
                    description: 'Convert arrow function to function declaration',
                    risk: 'low',
                    confidence: 0.9,
                    isQuickFix: true
                }));
            }

            // Simplify conditional
            if (this.hasComplexConditional(text)) {
                suggestions.push(this.createSuggestion('simplify-conditional', context, {
                    title: 'Simplify Conditional',
                    description: 'Simplify complex conditional expression',
                    risk: 'low',
                    confidence: 0.75,
                    isQuickFix: false
                }));
            }
        }

        // File-level suggestions
        if (this.hasUnusedImports(context.content, context.language)) {
            suggestions.push(this.createSuggestion('optimize-imports', context, {
                title: 'Optimize Imports',
                description: 'Remove unused imports and organize',
                risk: 'safe',
                confidence: 0.95,
                isQuickFix: true,
                shortcut: 'Ctrl+Shift+O'
            }));
        }

        // Rename suggestion if symbol is selected
        if (context.symbol) {
            suggestions.push(this.createSuggestion('rename', context, {
                title: `Rename '${context.symbol.name}'`,
                description: 'Rename symbol with AI suggestions',
                risk: 'low',
                confidence: 1,
                isQuickFix: true,
                shortcut: 'F2'
            }));
        }

        return suggestions;
    }

    async applyRefactor(
        suggestionId: string,
        context: RefactorContext,
        params?: Record<string, any>,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        // Parse suggestion ID to get kind
        const parts = suggestionId.split('-');
        const kind = parts.slice(0, -1).join('-') as RefactorKind;

        switch (kind) {
            case 'extract-function':
                return this.extractFunction(
                    { selection: context.selection!, ...params },
                    context,
                    token
                );
            case 'extract-variable':
                return this.extractVariable(
                    { selection: context.selection!, ...params },
                    context,
                    token
                );
            case 'extract-constant':
                return this.extractConstant(
                    { selection: context.selection!, ...params },
                    context,
                    token
                );
            case 'convert-to-arrow':
                return this.convertToArrow(context.selection!, context, token);
            case 'convert-to-function':
                return this.convertToFunction(context.selection!, context, token);
            case 'optimize-imports':
                return this.optimizeImports(context.uri, context, token);
            default:
                return {
                    success: false,
                    edits: [],
                    message: `Unknown refactoring: ${kind}`
                };
        }
    }

    async extractFunction(
        params: ExtractParams,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const { selection, suggestedName } = params;
        const funcName = suggestedName || this.suggestFunctionName(selection.text, context.language);

        // Analyze the selection
        const analysis = this.analyzeExtraction(selection.text, context);

        // Build the new function
        const indent = this.detectIndent(context.content, selection.startLine);
        const parameters = analysis.usedVariables.join(', ');
        const returnStatement = analysis.hasReturn ? '' : 'return ';

        let newFunction: string;
        if (context.language === 'typescript' || context.language === 'javascript') {
            newFunction = `\nfunction ${funcName}(${parameters}) {\n${indent}    ${returnStatement}${selection.text.trim()};\n${indent}}\n`;
        } else {
            newFunction = `\ndef ${funcName}(${parameters}):\n${indent}    ${returnStatement}${selection.text.trim()}\n`;
        }

        // Create edits
        const edits: TextEdit[] = [
            // Replace selection with function call
            {
                startLine: selection.startLine,
                startColumn: selection.startColumn,
                endLine: selection.endLine,
                endColumn: selection.endColumn,
                newText: parameters ? `${funcName}(${parameters})` : `${funcName}()`
            }
        ];

        // Find insertion point for new function
        const insertLine = this.findFunctionInsertPoint(context.content, selection.startLine);
        edits.push({
            startLine: insertLine,
            startColumn: 0,
            endLine: insertLine,
            endColumn: 0,
            newText: newFunction
        });

        const undoId = this.saveUndo([{ uri: context.uri, edits }], `Extract function '${funcName}'`);

        return {
            success: true,
            edits: [{ uri: context.uri, edits }],
            message: `Extracted function '${funcName}'`,
            undoId
        };
    }

    async extractVariable(
        params: ExtractParams,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const { selection, suggestedName } = params;
        const varName = suggestedName || this.suggestVariableName(selection.text, context.language);

        const indent = this.detectIndent(context.content, selection.startLine);
        const declaration = `const ${varName} = ${selection.text.trim()};\n${indent}`;

        const edits: TextEdit[] = [
            // Add variable declaration before current line
            {
                startLine: selection.startLine,
                startColumn: 0,
                endLine: selection.startLine,
                endColumn: 0,
                newText: `${indent}${declaration}`
            },
            // Replace selection with variable name
            {
                startLine: selection.startLine,
                startColumn: selection.startColumn + declaration.length,
                endLine: selection.endLine,
                endColumn: selection.endColumn + declaration.length,
                newText: varName
            }
        ];

        const undoId = this.saveUndo([{ uri: context.uri, edits }], `Extract variable '${varName}'`);

        return {
            success: true,
            edits: [{ uri: context.uri, edits }],
            message: `Extracted variable '${varName}'`,
            undoId
        };
    }

    async extractConstant(
        params: ExtractParams,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const { selection, suggestedName, makeExported } = params;
        const constName = suggestedName || this.suggestConstantName(selection.text);

        // Find top of file or module scope
        const insertLine = this.findConstantInsertPoint(context.content);
        const exportPrefix = makeExported ? 'export ' : '';

        const edits: TextEdit[] = [
            // Add constant at top
            {
                startLine: insertLine,
                startColumn: 0,
                endLine: insertLine,
                endColumn: 0,
                newText: `${exportPrefix}const ${constName} = ${selection.text.trim()};\n\n`
            },
            // Replace selection with constant name
            {
                startLine: selection.startLine,
                startColumn: selection.startColumn,
                endLine: selection.endLine,
                endColumn: selection.endColumn,
                newText: constName
            }
        ];

        const undoId = this.saveUndo([{ uri: context.uri, edits }], `Extract constant '${constName}'`);

        return {
            success: true,
            edits: [{ uri: context.uri, edits }],
            message: `Extracted constant '${constName}'`,
            undoId
        };
    }

    async rename(
        params: RenameParams,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const { symbol, newName, renameInComments, renameInStrings } = params;

        // Find all occurrences
        const occurrences = this.findSymbolOccurrences(
            context.content,
            symbol.name,
            { renameInComments, renameInStrings }
        );

        const edits: TextEdit[] = occurrences.map(occ => ({
            startLine: occ.line,
            startColumn: occ.column,
            endLine: occ.line,
            endColumn: occ.column + symbol.name.length,
            newText: newName
        }));

        const undoId = this.saveUndo([{ uri: context.uri, edits }], `Rename '${symbol.name}' to '${newName}'`);

        return {
            success: true,
            edits: [{ uri: context.uri, edits }],
            message: `Renamed ${occurrences.length} occurrence(s) of '${symbol.name}' to '${newName}'`,
            undoId
        };
    }

    async suggestNames(
        symbol: { name: string; kind: string; context: string },
        language: string,
        count: number = 5,
        token?: CancellationToken
    ): Promise<RenameSuggestion[]> {
        const suggestions: RenameSuggestion[] = [];
        const { name, kind } = symbol;

        // Analyze current name
        const parts = this.splitCamelCase(name);

        // Generate suggestions based on kind
        if (kind === 'function' || kind === 'method') {
            // Suggest verb-based names
            const verbs = ['handle', 'process', 'get', 'set', 'create', 'update', 'delete', 'fetch', 'load'];
            for (const verb of verbs.slice(0, 3)) {
                if (!name.toLowerCase().startsWith(verb)) {
                    const suggested = verb + this.capitalize(parts.join(''));
                    suggestions.push({
                        name: suggested,
                        reason: `More descriptive action verb: ${verb}`,
                        confidence: 0.7
                    });
                }
            }
        }

        if (kind === 'variable' || kind === 'parameter') {
            // Suggest more descriptive names
            if (name.length <= 3) {
                suggestions.push({
                    name: name + 'Value',
                    reason: 'More descriptive variable name',
                    confidence: 0.6
                });
                suggestions.push({
                    name: name + 'Data',
                    reason: 'Indicates data container',
                    confidence: 0.5
                });
            }
        }

        // Add camelCase/snake_case conversions
        if (name.includes('_')) {
            suggestions.push({
                name: this.toCamelCase(name),
                reason: 'Convert to camelCase',
                confidence: 0.8
            });
        } else if (/[A-Z]/.test(name)) {
            suggestions.push({
                name: this.toSnakeCase(name),
                reason: 'Convert to snake_case',
                confidence: 0.6
            });
        }

        return suggestions.slice(0, count);
    }

    async convertToArrow(
        selection: CodeSelection,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const text = selection.text;

        // Parse function
        const match = text.match(/function\s+(\w+)?\s*\(([^)]*)\)\s*\{([\s\S]*)\}/);
        if (!match) {
            return { success: false, edits: [], message: 'Could not parse function' };
        }

        const [, funcName, params, body] = match;
        const trimmedBody = body.trim();

        // Determine if we can use concise body
        const canUseConcise = !trimmedBody.includes('\n') &&
            trimmedBody.startsWith('return ') &&
            !trimmedBody.includes(';', trimmedBody.indexOf('return') + 7);

        let arrowFunc: string;
        if (funcName) {
            if (canUseConcise) {
                const returnValue = trimmedBody.replace('return ', '').replace(/;$/, '');
                arrowFunc = `const ${funcName} = (${params}) => ${returnValue};`;
            } else {
                arrowFunc = `const ${funcName} = (${params}) => {${body}};`;
            }
        } else {
            if (canUseConcise) {
                const returnValue = trimmedBody.replace('return ', '').replace(/;$/, '');
                arrowFunc = `(${params}) => ${returnValue}`;
            } else {
                arrowFunc = `(${params}) => {${body}}`;
            }
        }

        const edits: TextEdit[] = [{
            startLine: selection.startLine,
            startColumn: selection.startColumn,
            endLine: selection.endLine,
            endColumn: selection.endColumn,
            newText: arrowFunc
        }];

        const undoId = this.saveUndo([{ uri: context.uri, edits }], 'Convert to arrow function');

        return {
            success: true,
            edits: [{ uri: context.uri, edits }],
            message: 'Converted to arrow function',
            undoId
        };
    }

    async convertToFunction(
        selection: CodeSelection,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const text = selection.text;

        // Parse arrow function
        const match = text.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*(.+)/s);
        if (!match) {
            return { success: false, edits: [], message: 'Could not parse arrow function' };
        }

        const [, funcName, params, body] = match;
        const isAsync = text.includes('async');
        const asyncPrefix = isAsync ? 'async ' : '';

        let funcBody: string;
        if (body.trim().startsWith('{')) {
            funcBody = body;
        } else {
            funcBody = `{\n    return ${body.trim().replace(/;$/, '')};\n}`;
        }

        const func = `${asyncPrefix}function ${funcName}(${params}) ${funcBody}`;

        const edits: TextEdit[] = [{
            startLine: selection.startLine,
            startColumn: selection.startColumn,
            endLine: selection.endLine,
            endColumn: selection.endColumn,
            newText: func
        }];

        const undoId = this.saveUndo([{ uri: context.uri, edits }], 'Convert to function');

        return {
            success: true,
            edits: [{ uri: context.uri, edits }],
            message: 'Converted to function declaration',
            undoId
        };
    }

    async convertToAsync(
        selection: CodeSelection,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const text = selection.text;

        // Check if already async
        if (text.includes('async ')) {
            return { success: false, edits: [], message: 'Function is already async' };
        }

        let newText = text;

        // Add async keyword
        if (text.match(/^function\s/)) {
            newText = text.replace(/^function\s/, 'async function ');
        } else if (text.match(/^\s*\(/)) {
            newText = 'async ' + text;
        } else if (text.match(/^const\s+\w+\s*=\s*\(/)) {
            newText = text.replace(/^(const\s+\w+\s*=\s*)/, '$1async ');
        }

        // Convert .then() to await
        newText = newText.replace(/\.then\s*\(\s*(\w+)\s*=>\s*\{([^}]+)\}\s*\)/g, (_, param, body) => {
            return `;\n    const ${param} = await /* previous expression */;${body}`;
        });

        const edits: TextEdit[] = [{
            startLine: selection.startLine,
            startColumn: selection.startColumn,
            endLine: selection.endLine,
            endColumn: selection.endColumn,
            newText
        }];

        const undoId = this.saveUndo([{ uri: context.uri, edits }], 'Convert to async');

        return {
            success: true,
            edits: [{ uri: context.uri, edits }],
            message: 'Converted to async function',
            undoId
        };
    }

    async simplifyConditional(
        selection: CodeSelection,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        let text = selection.text;

        // Simplify patterns
        // if (x === true) -> if (x)
        text = text.replace(/===?\s*true/g, '');
        // if (x === false) -> if (!x)
        text = text.replace(/===?\s*false/g, '!');
        // if (!x === false) -> if (x)
        text = text.replace(/!\s*(\w+)\s*===?\s*false/g, '$1');
        // x ? true : false -> !!x or Boolean(x)
        text = text.replace(/(\w+)\s*\?\s*true\s*:\s*false/g, 'Boolean($1)');
        // x ? false : true -> !x
        text = text.replace(/(\w+)\s*\?\s*false\s*:\s*true/g, '!$1');

        if (text === selection.text) {
            return { success: false, edits: [], message: 'No simplifications found' };
        }

        const edits: TextEdit[] = [{
            startLine: selection.startLine,
            startColumn: selection.startColumn,
            endLine: selection.endLine,
            endColumn: selection.endColumn,
            newText: text
        }];

        const undoId = this.saveUndo([{ uri: context.uri, edits }], 'Simplify conditional');

        return {
            success: true,
            edits: [{ uri: context.uri, edits }],
            message: 'Simplified conditional expression',
            undoId
        };
    }

    async detectCodeSmells(
        uri: string,
        content: string,
        language: string,
        token?: CancellationToken
    ): Promise<CodeSmell[]> {
        const smells: CodeSmell[] = [];
        const lines = content.split('\n');

        // Detect long functions
        let functionStart = -1;
        let braceCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (/function\s+\w+|=>\s*\{|^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*\{/.test(line)) {
                functionStart = i;
                braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            } else if (functionStart >= 0) {
                braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

                if (braceCount <= 0) {
                    const funcLength = i - functionStart + 1;
                    if (funcLength > 50) {
                        smells.push({
                            type: 'long-function',
                            description: `Function is ${funcLength} lines long (recommended: < 50)`,
                            location: {
                                uri,
                                startLine: functionStart + 1,
                                startColumn: 0,
                                endLine: i + 1,
                                endColumn: lines[i].length,
                                text: ''
                            },
                            severity: funcLength > 100 ? 'warning' : 'hint',
                            suggestedRefactors: ['extract-function']
                        });
                    }
                    functionStart = -1;
                }
            }

            // Detect magic numbers
            const magicMatch = line.match(/[^a-zA-Z_](\d{2,})[^a-zA-Z_\d]/);
            if (magicMatch && !line.includes('const') && !line.includes('//')) {
                smells.push({
                    type: 'magic-number',
                    description: `Magic number '${magicMatch[1]}' should be extracted to a constant`,
                    location: {
                        uri,
                        startLine: i + 1,
                        startColumn: line.indexOf(magicMatch[1]),
                        endLine: i + 1,
                        endColumn: line.indexOf(magicMatch[1]) + magicMatch[1].length,
                        text: magicMatch[1]
                    },
                    severity: 'hint',
                    suggestedRefactors: ['extract-constant']
                });
            }

            // Detect complex conditionals
            const conditionalCount = (line.match(/&&|\|\|/g) || []).length;
            if (conditionalCount >= 3) {
                smells.push({
                    type: 'complex-conditional',
                    description: `Complex conditional with ${conditionalCount + 1} conditions`,
                    location: {
                        uri,
                        startLine: i + 1,
                        startColumn: 0,
                        endLine: i + 1,
                        endColumn: line.length,
                        text: line.trim()
                    },
                    severity: 'warning',
                    suggestedRefactors: ['simplify-conditional', 'extract-function']
                });
            }
        }

        return smells;
    }

    async removeDeadCode(
        uri: string,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const lines = context.content.split('\n');
        const edits: TextEdit[] = [];

        // Find commented-out code blocks
        let inCommentBlock = false;
        let commentStart = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('/*')) {
                inCommentBlock = true;
                commentStart = i;
            }

            if (inCommentBlock && line.endsWith('*/')) {
                // Check if this looks like commented code
                const commentContent = lines.slice(commentStart, i + 1).join('\n');
                if (this.looksLikeCode(commentContent)) {
                    edits.push({
                        startLine: commentStart + 1,
                        startColumn: 0,
                        endLine: i + 2,
                        endColumn: 0,
                        newText: ''
                    });
                }
                inCommentBlock = false;
            }

            // Check for single-line commented code
            if (line.startsWith('//') && this.looksLikeCode(line.slice(2))) {
                edits.push({
                    startLine: i + 1,
                    startColumn: 0,
                    endLine: i + 2,
                    endColumn: 0,
                    newText: ''
                });
            }
        }

        if (edits.length === 0) {
            return { success: true, edits: [], message: 'No dead code found' };
        }

        const undoId = this.saveUndo([{ uri, edits }], 'Remove dead code');

        return {
            success: true,
            edits: [{ uri, edits }],
            message: `Removed ${edits.length} block(s) of dead code`,
            undoId
        };
    }

    async optimizeImports(
        uri: string,
        context: RefactorContext,
        token?: CancellationToken
    ): Promise<RefactorResult> {
        const lines = context.content.split('\n');
        const imports: Array<{ line: number; text: string; source: string }> = [];
        let lastImportLine = 0;

        // Collect imports
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('import ')) {
                const sourceMatch = line.match(/from\s+['"]([^'"]+)['"]/);
                imports.push({
                    line: i,
                    text: line,
                    source: sourceMatch ? sourceMatch[1] : ''
                });
                lastImportLine = i;
            } else if (imports.length > 0 && line.trim() && !line.trim().startsWith('//')) {
                break;
            }
        }

        if (imports.length === 0) {
            return { success: true, edits: [], message: 'No imports to optimize' };
        }

        // Sort imports
        const sorted = [...imports].sort((a, b) => {
            // External imports first
            const aIsExternal = !a.source.startsWith('.');
            const bIsExternal = !b.source.startsWith('.');

            if (aIsExternal !== bIsExternal) {
                return aIsExternal ? -1 : 1;
            }

            return a.source.localeCompare(b.source);
        });

        // Check if already sorted
        const alreadySorted = imports.every((imp, i) => imp.text === sorted[i].text);
        if (alreadySorted) {
            return { success: true, edits: [], message: 'Imports are already optimized' };
        }

        // Create single edit to replace all imports
        const firstImportLine = imports[0].line;
        const newImportsText = sorted.map(i => i.text).join('\n') + '\n';

        const edits: TextEdit[] = [{
            startLine: firstImportLine + 1,
            startColumn: 0,
            endLine: lastImportLine + 2,
            endColumn: 0,
            newText: newImportsText
        }];

        const undoId = this.saveUndo([{ uri, edits }], 'Optimize imports');

        return {
            success: true,
            edits: [{ uri, edits }],
            message: 'Imports optimized and sorted',
            undoId
        };
    }

    async undoRefactor(undoId: string): Promise<boolean> {
        const entry = this.undoStack.find(e => e.id === undoId);
        if (!entry) {
            return false;
        }

        // Remove from stack
        this.undoStack = this.undoStack.filter(e => e.id !== undoId);
        return true;
    }

    async previewRefactor(
        suggestionId: string,
        context: RefactorContext,
        params?: Record<string, any>,
        token?: CancellationToken
    ): Promise<{ before: string; after: string; diff: string }> {
        const result = await this.applyRefactor(suggestionId, context, params, token);

        if (!result.success || result.edits.length === 0) {
            return {
                before: context.content,
                after: context.content,
                diff: ''
            };
        }

        // Apply edits to get after content
        let after = context.content;
        const sortedEdits = [...result.edits[0].edits].sort((a, b) =>
            b.startLine - a.startLine || b.startColumn - a.startColumn
        );

        for (const edit of sortedEdits) {
            const lines = after.split('\n');
            const beforeLines = lines.slice(0, edit.startLine - 1);
            const afterLines = lines.slice(edit.endLine);
            const editLine = lines[edit.startLine - 1] || '';

            const newEditLine =
                editLine.substring(0, edit.startColumn) +
                edit.newText +
                (lines[edit.endLine - 1]?.substring(edit.endColumn) || '');

            after = [...beforeLines, newEditLine, ...afterLines].join('\n');
        }

        // Generate simple diff
        const diff = this.generateDiff(context.content, after);

        return {
            before: context.content,
            after,
            diff
        };
    }

    // Helper methods

    protected createSuggestion(
        kind: RefactorKind,
        context: RefactorContext,
        options: Partial<RefactorSuggestion>
    ): RefactorSuggestion {
        return {
            id: `${kind}-${++this.suggestionCounter}`,
            kind,
            title: options.title || getRefactorLabel(kind),
            description: options.description || '',
            risk: options.risk || 'safe',
            confidence: options.confidence || 0.8,
            preview: options.preview,
            affectedFiles: [context.uri],
            isQuickFix: options.isQuickFix || false,
            shortcut: options.shortcut
        };
    }

    protected canExtractFunction(text: string, language: string): boolean {
        // Must have multiple statements or a complete expression
        return text.trim().length > 10 &&
            (text.includes(';') || text.includes('\n') || /^\s*\{[\s\S]+\}\s*$/.test(text));
    }

    protected canExtractVariable(text: string, language: string): boolean {
        // Must be an expression (not a statement)
        return text.trim().length > 0 &&
            !text.includes(';') &&
            !text.startsWith('if') &&
            !text.startsWith('for') &&
            !text.startsWith('while');
    }

    protected canExtractConstant(text: string, language: string): boolean {
        // Should be a literal value
        return /^['"`].*['"`]$|^\d+$|^true$|^false$|^\[.*\]$|^\{.*\}$/.test(text.trim());
    }

    protected isRegularFunction(text: string): boolean {
        return /^\s*function\s+\w+\s*\(/.test(text) || /^\s*function\s*\(/.test(text);
    }

    protected isArrowFunction(text: string): boolean {
        return /=>\s*(\{|[^{])/.test(text);
    }

    protected hasComplexConditional(text: string): boolean {
        return (text.match(/&&|\|\|/g) || []).length >= 2 ||
            /===?\s*(true|false)/.test(text) ||
            /!\s*!\s*\w+/.test(text);
    }

    protected hasUnusedImports(content: string, language: string): boolean {
        const importMatches = content.matchAll(/import\s+\{([^}]+)\}\s+from/g);
        for (const match of importMatches) {
            const imports = match[1].split(',').map(i => i.trim().split(' as ')[0]);
            for (const imp of imports) {
                const regex = new RegExp(`\\b${imp}\\b`, 'g');
                const occurrences = (content.match(regex) || []).length;
                if (occurrences <= 1) {
                    return true;
                }
            }
        }
        return false;
    }

    protected analyzeExtraction(text: string, context: RefactorContext): {
        usedVariables: string[];
        hasReturn: boolean;
        isExpression: boolean;
    } {
        const usedVariables: string[] = [];
        const variablePattern = /\b([a-z_]\w*)\b/gi;
        const matches = text.matchAll(variablePattern);

        const keywords = new Set(['if', 'else', 'for', 'while', 'return', 'const', 'let', 'var', 'function', 'true', 'false', 'null', 'undefined']);

        for (const match of matches) {
            const name = match[1];
            if (!keywords.has(name) && !usedVariables.includes(name)) {
                // Check if variable is defined in selection or outside
                const definedInside = new RegExp(`(const|let|var)\\s+${name}\\b`).test(text);
                if (!definedInside) {
                    usedVariables.push(name);
                }
            }
        }

        return {
            usedVariables,
            hasReturn: /\breturn\b/.test(text),
            isExpression: !text.includes(';') && !text.includes('\n')
        };
    }

    protected suggestFunctionName(text: string, language: string): string {
        // Analyze the code to suggest a name
        if (/fetch|axios|request/.test(text)) {
            return 'fetchData';
        }
        if (/validate|isValid/.test(text)) {
            return 'validate';
        }
        if (/filter|find|search/.test(text)) {
            return 'filterItems';
        }
        if (/map|transform|convert/.test(text)) {
            return 'transform';
        }
        if (/console|log|print/.test(text)) {
            return 'logOutput';
        }
        return 'extractedFunction';
    }

    protected suggestVariableName(text: string, language: string): string {
        if (/\.length\b/.test(text)) {
            return 'length';
        }
        if (/\.filter\(/.test(text)) {
            return 'filtered';
        }
        if (/\.map\(/.test(text)) {
            return 'mapped';
        }
        if (/\.find\(/.test(text)) {
            return 'found';
        }
        if (/\+/.test(text)) {
            return 'sum';
        }
        return 'extracted';
    }

    protected suggestConstantName(text: string): string {
        // For string literals, use the value (cleaned up)
        const stringMatch = text.match(/^['"`](.+)['"`]$/);
        if (stringMatch) {
            return this.toConstantCase(stringMatch[1].slice(0, 20));
        }

        // For numbers, use a generic name
        if (/^\d+$/.test(text.trim())) {
            return 'VALUE_' + text.trim();
        }

        return 'EXTRACTED_CONSTANT';
    }

    protected toConstantCase(str: string): string {
        return str
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/([a-z])([A-Z])/g, '$1_$2')
            .toUpperCase();
    }

    protected toCamelCase(str: string): string {
        return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    }

    protected toSnakeCase(str: string): string {
        return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    }

    protected splitCamelCase(str: string): string[] {
        return str.split(/(?=[A-Z])|_/).map(s => s.toLowerCase());
    }

    protected capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    protected detectIndent(content: string, line: number): string {
        const lines = content.split('\n');
        const targetLine = lines[line - 1] || '';
        const match = targetLine.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    protected findFunctionInsertPoint(content: string, currentLine: number): number {
        const lines = content.split('\n');

        // Find end of current function
        let braceCount = 0;
        let inFunction = false;

        for (let i = currentLine - 1; i < lines.length; i++) {
            const line = lines[i];
            if (/function\s|=>\s*\{/.test(line)) {
                inFunction = true;
            }

            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;

            if (inFunction && braceCount === 0) {
                return i + 2; // After the closing brace
            }
        }

        return lines.length;
    }

    protected findConstantInsertPoint(content: string): number {
        const lines = content.split('\n');

        // Find after imports
        let lastImport = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ')) {
                lastImport = i;
            }
        }

        return lastImport + 2;
    }

    protected findSymbolOccurrences(
        content: string,
        symbolName: string,
        options: { renameInComments?: boolean; renameInStrings?: boolean }
    ): Array<{ line: number; column: number }> {
        const occurrences: Array<{ line: number; column: number }> = [];
        const lines = content.split('\n');
        const regex = new RegExp(`\\b${symbolName}\\b`, 'g');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match;

            while ((match = regex.exec(line)) !== null) {
                const column = match.index;

                // Skip comments unless requested
                if (!options.renameInComments) {
                    const beforeMatch = line.substring(0, column);
                    if (beforeMatch.includes('//') || beforeMatch.includes('/*')) {
                        continue;
                    }
                }

                // Skip strings unless requested
                if (!options.renameInStrings) {
                    const beforeMatch = line.substring(0, column);
                    const quoteCount = (beforeMatch.match(/['"`]/g) || []).length;
                    if (quoteCount % 2 === 1) {
                        continue;
                    }
                }

                occurrences.push({ line: i + 1, column });
            }
        }

        return occurrences;
    }

    protected looksLikeCode(text: string): boolean {
        // Check if commented text looks like code
        const codePatterns = [
            /\b(const|let|var|function|class|if|for|while|return)\b/,
            /[=;{}()]/,
            /\.(map|filter|forEach|push|pop)\(/
        ];

        return codePatterns.some(p => p.test(text));
    }

    protected generateDiff(before: string, after: string): string {
        const beforeLines = before.split('\n');
        const afterLines = after.split('\n');
        const diff: string[] = [];

        let i = 0;
        let j = 0;

        while (i < beforeLines.length || j < afterLines.length) {
            if (i >= beforeLines.length) {
                diff.push(`+ ${afterLines[j]}`);
                j++;
            } else if (j >= afterLines.length) {
                diff.push(`- ${beforeLines[i]}`);
                i++;
            } else if (beforeLines[i] === afterLines[j]) {
                diff.push(`  ${beforeLines[i]}`);
                i++;
                j++;
            } else {
                diff.push(`- ${beforeLines[i]}`);
                diff.push(`+ ${afterLines[j]}`);
                i++;
                j++;
            }
        }

        return diff.join('\n');
    }

    protected saveUndo(edits: FileEdit[], description: string): string {
        const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        this.undoStack.push({
            id,
            timestamp: Date.now(),
            edits,
            description
        });

        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoEntries) {
            this.undoStack = this.undoStack.slice(-this.maxUndoEntries);
        }

        return id;
    }
}
