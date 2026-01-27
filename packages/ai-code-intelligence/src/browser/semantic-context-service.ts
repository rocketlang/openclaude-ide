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

import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import {
    SemanticContextService,
    SymbolAnalysisService,
    SemanticContext,
    CodePosition,
    CodeSymbol,
    CodeSymbolKind,
    ImportInfo,
    SemanticContextOptions
} from '../common';

const DEFAULT_LINES_BEFORE = 50;
const DEFAULT_LINES_AFTER = 20;
const DEFAULT_MAX_RELATED_FILES = 10;

@injectable()
export class SemanticContextServiceImpl implements SemanticContextService {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(SymbolAnalysisService)
    protected readonly symbolAnalysis: SymbolAnalysisService;

    protected readonly onContextChangedEmitter = new Emitter<SemanticContext>();
    readonly onContextChanged: Event<SemanticContext> = this.onContextChangedEmitter.event;

    async getContext(uri: string, position: CodePosition, options?: SemanticContextOptions): Promise<SemanticContext> {
        const model = this.getModel(uri);
        if (!model) {
            throw new Error(`No model found for ${uri}`);
        }

        const linesBefore = options?.linesBefore ?? DEFAULT_LINES_BEFORE;
        const linesAfter = options?.linesAfter ?? DEFAULT_LINES_AFTER;

        // Get current line
        const currentLine = model.getLineContent(position.line + 1);

        // Get lines before cursor
        const startLine = Math.max(1, position.line + 1 - linesBefore);
        const beforeLines: string[] = [];
        for (let i = startLine; i <= position.line; i++) {
            beforeLines.push(model.getLineContent(i));
        }

        // Get lines after cursor
        const endLine = Math.min(model.getLineCount(), position.line + 1 + linesAfter);
        const afterLines: string[] = [];
        for (let i = position.line + 2; i <= endLine; i++) {
            afterLines.push(model.getLineContent(i));
        }

        // Get language
        const language = model.getLanguageId();

        // Get symbol at cursor
        const symbolAtCursor = await this.symbolAnalysis.getSymbolAtPosition(uri, position);

        // Get enclosing symbol
        const enclosingSymbol = await this.findEnclosingSymbol(uri, position);

        // Get visible symbols
        const visibleSymbols = options?.includeVisibleSymbols !== false
            ? await this.getVisibleSymbols(uri, position)
            : [];

        // Get imports
        const imports = options?.includeImports !== false
            ? this.extractImports(model, language)
            : [];

        // Get outline
        const outline = options?.includeOutline !== false
            ? await this.symbolAnalysis.getDocumentSymbols(uri, { maxDepth: 2 })
            : [];

        // Get related files
        const relatedFiles = options?.includeRelatedFiles !== false
            ? this.findRelatedFiles(imports, options?.maxRelatedFiles ?? DEFAULT_MAX_RELATED_FILES)
            : [];

        // Get selection if any
        const editor = this.editorManager.currentEditor?.editor;
        let selection: SemanticContext['selection'];
        let selectedText: string | undefined;

        if (editor && editor instanceof MonacoEditor) {
            const monacoSelection = editor.getControl().getSelection();
            if (monacoSelection && !monacoSelection.isEmpty()) {
                selection = {
                    start: {
                        line: monacoSelection.startLineNumber - 1,
                        character: monacoSelection.startColumn - 1
                    },
                    end: {
                        line: monacoSelection.endLineNumber - 1,
                        character: monacoSelection.endColumn - 1
                    }
                };
                selectedText = model.getValueInRange(monacoSelection);
            }
        }

        return {
            fileUri: uri,
            language,
            position,
            currentLine,
            linesBefore: beforeLines,
            linesAfter: afterLines,
            symbolAtCursor,
            enclosingSymbol,
            visibleSymbols,
            imports,
            outline,
            relatedFiles,
            selection,
            selectedText
        };
    }

    async getCurrentContext(options?: SemanticContextOptions): Promise<SemanticContext | undefined> {
        const editor = this.editorManager.currentEditor?.editor;
        if (!editor || !(editor instanceof MonacoEditor)) {
            return undefined;
        }

        const uri = editor.uri.toString();
        const monacoPosition = editor.getControl().getPosition();
        if (!monacoPosition) {
            return undefined;
        }

        const position: CodePosition = {
            line: monacoPosition.lineNumber - 1,
            character: monacoPosition.column - 1
        };

        return this.getContext(uri, position, options);
    }

    formatContextForAI(context: SemanticContext): string {
        const parts: string[] = [];

        // File info
        parts.push(`## File: ${this.getFileName(context.fileUri)}`);
        parts.push(`Language: ${context.language}`);
        parts.push(`Position: Line ${context.position.line + 1}, Column ${context.position.character + 1}`);
        parts.push('');

        // Current symbol
        if (context.symbolAtCursor) {
            parts.push(`### Current Symbol`);
            parts.push(`Name: ${context.symbolAtCursor.name}`);
            parts.push(`Kind: ${CodeSymbolKind[context.symbolAtCursor.kind]}`);
            if (context.symbolAtCursor.documentation) {
                parts.push(`Documentation: ${context.symbolAtCursor.documentation}`);
            }
            parts.push('');
        }

        // Enclosing context
        if (context.enclosingSymbol) {
            parts.push(`### Enclosing Context`);
            parts.push(`${CodeSymbolKind[context.enclosingSymbol.kind]}: ${context.enclosingSymbol.name}`);
            if (context.enclosingSymbol.signature) {
                parts.push(`Signature: ${context.enclosingSymbol.signature}`);
            }
            parts.push('');
        }

        // Selection
        if (context.selectedText) {
            parts.push(`### Selected Code`);
            parts.push('```' + context.language);
            parts.push(context.selectedText);
            parts.push('```');
            parts.push('');
        }

        // Imports
        if (context.imports.length > 0) {
            parts.push(`### Imports (${context.imports.length})`);
            for (const imp of context.imports.slice(0, 10)) {
                const names = imp.names.length > 3
                    ? `${imp.names.slice(0, 3).join(', ')}...`
                    : imp.names.join(', ');
                parts.push(`- ${imp.module}: ${names}`);
            }
            if (context.imports.length > 10) {
                parts.push(`  ... and ${context.imports.length - 10} more`);
            }
            parts.push('');
        }

        // Visible symbols
        if (context.visibleSymbols.length > 0) {
            parts.push(`### Visible Symbols (${context.visibleSymbols.length})`);
            const grouped = this.groupSymbolsByKind(context.visibleSymbols);
            for (const [kind, symbols] of Object.entries(grouped)) {
                const names = symbols.slice(0, 5).map(s => s.name).join(', ');
                const extra = symbols.length > 5 ? ` (+${symbols.length - 5} more)` : '';
                parts.push(`- ${kind}: ${names}${extra}`);
            }
            parts.push('');
        }

        // Code context
        parts.push(`### Code Context`);
        parts.push('```' + context.language);

        // Lines before
        if (context.linesBefore.length > 0) {
            const startLine = context.position.line - context.linesBefore.length + 1;
            context.linesBefore.forEach((line, i) => {
                parts.push(`${startLine + i + 1}: ${line}`);
            });
        }

        // Current line with cursor marker
        parts.push(`${context.position.line + 1}: ${context.currentLine}  // <-- cursor`);

        // Lines after
        if (context.linesAfter.length > 0) {
            context.linesAfter.forEach((line, i) => {
                parts.push(`${context.position.line + 2 + i}: ${line}`);
            });
        }

        parts.push('```');

        // File outline (condensed)
        if (context.outline.length > 0) {
            parts.push('');
            parts.push(`### File Structure`);
            this.formatOutline(context.outline, parts, 0, 2);
        }

        return parts.join('\n');
    }

    protected getModel(uri: string): monaco.editor.ITextModel | undefined {
        const monacoUri = monaco.Uri.parse(uri);
        return monaco.editor.getModel(monacoUri) ?? undefined;
    }

    protected getFileName(uri: string): string {
        return uri.split('/').pop() ?? uri;
    }

    protected async findEnclosingSymbol(uri: string, position: CodePosition): Promise<CodeSymbol | undefined> {
        const symbols = await this.symbolAnalysis.getDocumentSymbols(uri);
        return this.findSymbolContaining(symbols, position);
    }

    protected findSymbolContaining(symbols: CodeSymbol[], position: CodePosition): CodeSymbol | undefined {
        for (const symbol of symbols) {
            if (this.rangeContains(symbol.location.range, position)) {
                // Check children first for more specific match
                if (symbol.children) {
                    const child = this.findSymbolContaining(symbol.children, position);
                    if (child) {
                        return child;
                    }
                }
                return symbol;
            }
        }
        return undefined;
    }

    protected rangeContains(range: { start: CodePosition; end: CodePosition }, position: CodePosition): boolean {
        if (position.line < range.start.line || position.line > range.end.line) {
            return false;
        }
        if (position.line === range.start.line && position.character < range.start.character) {
            return false;
        }
        if (position.line === range.end.line && position.character > range.end.character) {
            return false;
        }
        return true;
    }

    protected async getVisibleSymbols(uri: string, position: CodePosition): Promise<CodeSymbol[]> {
        const allSymbols = await this.symbolAnalysis.getDocumentSymbols(uri);
        const visible: CodeSymbol[] = [];

        this.collectVisibleSymbols(allSymbols, position, visible);

        return visible;
    }

    protected collectVisibleSymbols(symbols: CodeSymbol[], position: CodePosition, result: CodeSymbol[]): void {
        for (const symbol of symbols) {
            const isBeforePosition = symbol.location.range.start.line <= position.line;
            const isAlwaysVisible = [
                CodeSymbolKind.Class,
                CodeSymbolKind.Interface,
                CodeSymbolKind.Enum,
                CodeSymbolKind.Function
            ].includes(symbol.kind);

            if (isBeforePosition || isAlwaysVisible) {
                result.push(symbol);
            }

            if (symbol.children && this.rangeContains(symbol.location.range, position)) {
                this.collectVisibleSymbols(symbol.children, position, result);
            }
        }
    }

    protected extractImports(model: monaco.editor.ITextModel, language: string): ImportInfo[] {
        const imports: ImportInfo[] = [];
        const lineCount = Math.min(model.getLineCount(), 100);

        for (let i = 1; i <= lineCount; i++) {
            const line = model.getLineContent(i);
            const importInfo = this.parseImportLine(line, language, i);
            if (importInfo) {
                imports.push(importInfo);
            }
        }

        return imports;
    }

    protected parseImportLine(line: string, language: string, lineNumber: number): ImportInfo | undefined {
        // TypeScript/JavaScript imports
        if (language === 'typescript' || language === 'javascript' || language === 'typescriptreact' || language === 'javascriptreact') {
            // import { a, b } from 'module'
            const namedMatch = line.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
            if (namedMatch) {
                return {
                    module: namedMatch[2],
                    names: namedMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]),
                    isDefault: false,
                    isNamespace: false,
                    location: {
                        uri: '',
                        range: {
                            start: { line: lineNumber - 1, character: 0 },
                            end: { line: lineNumber - 1, character: line.length }
                        }
                    }
                };
            }

            // import name from 'module'
            const defaultMatch = line.match(/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);
            if (defaultMatch) {
                return {
                    module: defaultMatch[2],
                    names: [defaultMatch[1]],
                    isDefault: true,
                    isNamespace: false,
                    location: {
                        uri: '',
                        range: {
                            start: { line: lineNumber - 1, character: 0 },
                            end: { line: lineNumber - 1, character: line.length }
                        }
                    }
                };
            }

            // import * as name from 'module'
            const namespaceMatch = line.match(/import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);
            if (namespaceMatch) {
                return {
                    module: namespaceMatch[2],
                    names: [namespaceMatch[1]],
                    isDefault: false,
                    isNamespace: true,
                    alias: namespaceMatch[1],
                    location: {
                        uri: '',
                        range: {
                            start: { line: lineNumber - 1, character: 0 },
                            end: { line: lineNumber - 1, character: line.length }
                        }
                    }
                };
            }
        }

        // Python imports
        if (language === 'python') {
            // from module import a, b
            const fromMatch = line.match(/from\s+(\S+)\s+import\s+(.+)/);
            if (fromMatch) {
                return {
                    module: fromMatch[1],
                    names: fromMatch[2].split(',').map(n => n.trim().split(/\s+as\s+/)[0]),
                    isDefault: false,
                    isNamespace: false,
                    location: {
                        uri: '',
                        range: {
                            start: { line: lineNumber - 1, character: 0 },
                            end: { line: lineNumber - 1, character: line.length }
                        }
                    }
                };
            }

            // import module
            const importMatch = line.match(/^import\s+(\S+)/);
            if (importMatch) {
                return {
                    module: importMatch[1],
                    names: [importMatch[1]],
                    isDefault: false,
                    isNamespace: true,
                    location: {
                        uri: '',
                        range: {
                            start: { line: lineNumber - 1, character: 0 },
                            end: { line: lineNumber - 1, character: line.length }
                        }
                    }
                };
            }
        }

        return undefined;
    }

    protected findRelatedFiles(imports: ImportInfo[], maxFiles: number): string[] {
        const relatedFiles: string[] = [];

        for (const imp of imports) {
            if (relatedFiles.length >= maxFiles) {
                break;
            }

            if (imp.module.startsWith('.') || imp.module.startsWith('/')) {
                relatedFiles.push(imp.module);
            }
        }

        return relatedFiles;
    }

    protected groupSymbolsByKind(symbols: CodeSymbol[]): Record<string, CodeSymbol[]> {
        const grouped: Record<string, CodeSymbol[]> = {};

        for (const symbol of symbols) {
            const kindName = CodeSymbolKind[symbol.kind];
            if (!grouped[kindName]) {
                grouped[kindName] = [];
            }
            grouped[kindName].push(symbol);
        }

        return grouped;
    }

    protected formatOutline(symbols: CodeSymbol[], parts: string[], indent: number, maxDepth: number): void {
        if (indent >= maxDepth) {
            return;
        }

        const prefix = '  '.repeat(indent);
        for (const symbol of symbols.slice(0, 20)) {
            const kindChar = this.getKindChar(symbol.kind);
            parts.push(`${prefix}${kindChar} ${symbol.name}`);

            if (symbol.children && indent < maxDepth - 1) {
                this.formatOutline(symbol.children, parts, indent + 1, maxDepth);
            }
        }

        if (symbols.length > 20) {
            parts.push(`${prefix}... and ${symbols.length - 20} more`);
        }
    }

    protected getKindChar(kind: CodeSymbolKind): string {
        const kindChars: Partial<Record<CodeSymbolKind, string>> = {
            [CodeSymbolKind.Class]: 'C',
            [CodeSymbolKind.Interface]: 'I',
            [CodeSymbolKind.Function]: 'F',
            [CodeSymbolKind.Method]: 'M',
            [CodeSymbolKind.Property]: 'P',
            [CodeSymbolKind.Variable]: 'V',
            [CodeSymbolKind.Constant]: 'K',
            [CodeSymbolKind.Enum]: 'E',
            [CodeSymbolKind.Module]: 'N',
            [CodeSymbolKind.Constructor]: '+'
        };
        return kindChars[kind] ?? '·';
    }
}
