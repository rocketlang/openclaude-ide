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
import { Emitter, Event, CancellationToken } from '@theia/core';
import { MonacoLanguages } from '@theia/monaco/lib/browser/monaco-languages';
import * as monaco from '@theia/monaco-editor-core';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import {
    SymbolAnalysisService,
    CodeSymbol,
    CodeSymbolKind,
    CodePosition,
    CodeLocation,
    CodeReference,
    SymbolAnalysisOptions
} from '../common';

@injectable()
export class SymbolAnalysisServiceImpl implements SymbolAnalysisService {

    @inject(MonacoLanguages)
    protected readonly monacoLanguages: MonacoLanguages;

    protected readonly onSymbolsChangedEmitter = new Emitter<string>();
    readonly onSymbolsChanged: Event<string> = this.onSymbolsChangedEmitter.event;

    async getDocumentSymbols(uri: string, options?: SymbolAnalysisOptions): Promise<CodeSymbol[]> {
        const model = this.getModel(uri);
        if (!model) {
            return [];
        }

        try {
            const languageFeatures = StandaloneServices.get(ILanguageFeaturesService);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const providers = languageFeatures.documentSymbolProvider.all(model as any);

            const allSymbols: monaco.languages.DocumentSymbol[] = [];
            for (const provider of providers) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const symbols = await provider.provideDocumentSymbols(model as any, CancellationToken.None);
                    if (symbols) {
                        allSymbols.push(...(symbols as unknown as monaco.languages.DocumentSymbol[]));
                    }
                } catch {
                    // Continue with other providers
                }
            }

            return this.convertDocumentSymbols(allSymbols, uri, options);
        } catch {
            return [];
        }
    }

    async getSymbolAtPosition(uri: string, position: CodePosition): Promise<CodeSymbol | undefined> {
        const model = this.getModel(uri);
        if (!model) {
            return undefined;
        }

        try {
            const monacoPosition = this.toMonacoPosition(position);

            // Get word at position
            const wordInfo = model.getWordAtPosition(monacoPosition);
            if (!wordInfo) {
                return undefined;
            }

            // Get hover info for more details
            const documentation = await this.getHoverContent(model, monacoPosition);

            // Infer symbol kind from line content
            const kind = this.inferSymbolKindFromLine(model, monacoPosition);

            return {
                name: wordInfo.word,
                kind,
                location: {
                    uri,
                    range: {
                        start: { line: position.line, character: wordInfo.startColumn - 1 },
                        end: { line: position.line, character: wordInfo.endColumn - 1 }
                    }
                },
                documentation
            };
        } catch {
            return undefined;
        }
    }

    async getDefinition(uri: string, position: CodePosition): Promise<CodeLocation[]> {
        const model = this.getModel(uri);
        if (!model) {
            return [];
        }

        try {
            const monacoPosition = this.toMonacoPosition(position);
            const languageFeatures = StandaloneServices.get(ILanguageFeaturesService);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const providers = languageFeatures.definitionProvider.all(model as any);

            const allDefinitions: monaco.languages.Location[] = [];
            for (const provider of providers) {
                try {
                    const definitions = await provider.provideDefinition(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        model as any,
                        monacoPosition,
                        CancellationToken.None
                    );
                    if (definitions) {
                        if (Array.isArray(definitions)) {
                            for (const def of definitions) {
                                if ('uri' in def && 'range' in def) {
                                    allDefinitions.push(def as monaco.languages.Location);
                                }
                            }
                        } else if ('uri' in definitions && 'range' in definitions) {
                            allDefinitions.push(definitions as monaco.languages.Location);
                        }
                    }
                } catch {
                    // Continue with other providers
                }
            }

            return allDefinitions.map(def => this.convertLocation(def));
        } catch {
            return [];
        }
    }

    async getReferences(uri: string, position: CodePosition, includeDeclaration = true): Promise<CodeReference[]> {
        const model = this.getModel(uri);
        if (!model) {
            return [];
        }

        try {
            const monacoPosition = this.toMonacoPosition(position);
            const languageFeatures = StandaloneServices.get(ILanguageFeaturesService);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const providers = languageFeatures.referenceProvider.all(model as any);

            const allReferences: monaco.languages.Location[] = [];
            for (const provider of providers) {
                try {
                    const references = await provider.provideReferences(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        model as any,
                        monacoPosition,
                        { includeDeclaration },
                        CancellationToken.None
                    );
                    if (references) {
                        allReferences.push(...(references as monaco.languages.Location[]));
                    }
                } catch {
                    // Continue with other providers
                }
            }

            // Get definitions to mark which references are definitions
            const definitions = await this.getDefinition(uri, position);
            const definitionKeys = new Set(
                definitions.map(d =>
                    `${d.uri}:${d.range.start.line}:${d.range.start.character}`
                )
            );

            return allReferences.map(ref => {
                const location = this.convertLocation(ref);
                const key = `${location.uri}:${location.range.start.line}:${location.range.start.character}`;
                const isDefinition = definitionKeys.has(key);

                return {
                    location,
                    isDefinition,
                    isDeclaration: isDefinition,
                    isRead: true,
                    isWrite: false
                };
            });
        } catch {
            return [];
        }
    }

    async getHoverInfo(uri: string, position: CodePosition): Promise<string | undefined> {
        const model = this.getModel(uri);
        if (!model) {
            return undefined;
        }

        try {
            const monacoPosition = this.toMonacoPosition(position);
            return await this.getHoverContent(model, monacoPosition);
        } catch {
            return undefined;
        }
    }

    async getTypeHierarchy(_uri: string, _position: CodePosition): Promise<CodeSymbol[]> {
        // Type hierarchy API requires language server support
        return [];
    }

    async getCallHierarchy(_uri: string, _position: CodePosition): Promise<CodeSymbol[]> {
        // Call hierarchy API requires language server support
        return [];
    }

    async searchSymbols(query: string, options?: SymbolAnalysisOptions): Promise<CodeSymbol[]> {
        try {
            const results: CodeSymbol[] = [];

            // Search through workspace symbol providers
            const providers = this.monacoLanguages.workspaceSymbolProviders;
            for (const provider of providers) {
                const symbols = await provider.provideWorkspaceSymbols(
                    { query },
                    CancellationToken.None
                );
                if (symbols) {
                    for (const symbol of symbols) {
                        const codeSymbol = this.convertWorkspaceSymbol(symbol);
                        if (this.matchesOptions(codeSymbol, options)) {
                            results.push(codeSymbol);
                        }
                    }
                }
            }

            return results;
        } catch {
            return [];
        }
    }

    protected getModel(uri: string): monaco.editor.ITextModel | undefined {
        const monacoUri = monaco.Uri.parse(uri);
        return monaco.editor.getModel(monacoUri) ?? undefined;
    }

    protected toMonacoPosition(position: CodePosition): monaco.Position {
        return new monaco.Position(position.line + 1, position.character + 1);
    }

    protected convertLocation(location: monaco.languages.Location): CodeLocation {
        return {
            uri: location.uri.toString(),
            range: {
                start: {
                    line: location.range.startLineNumber - 1,
                    character: location.range.startColumn - 1
                },
                end: {
                    line: location.range.endLineNumber - 1,
                    character: location.range.endColumn - 1
                }
            }
        };
    }

    protected convertDocumentSymbols(
        symbols: monaco.languages.DocumentSymbol[],
        uri: string,
        options?: SymbolAnalysisOptions,
        depth = 0
    ): CodeSymbol[] {
        const maxDepth = options?.maxDepth ?? 10;
        if (depth >= maxDepth) {
            return [];
        }

        return symbols
            .filter(s => this.matchesKindFilter(s.kind, options))
            .map(symbol => ({
                name: symbol.name,
                kind: this.convertSymbolKind(symbol.kind),
                location: {
                    uri,
                    range: {
                        start: {
                            line: symbol.range.startLineNumber - 1,
                            character: symbol.range.startColumn - 1
                        },
                        end: {
                            line: symbol.range.endLineNumber - 1,
                            character: symbol.range.endColumn - 1
                        }
                    }
                },
                documentation: symbol.detail,
                children: symbol.children
                    ? this.convertDocumentSymbols(symbol.children, uri, options, depth + 1)
                    : undefined
            }));
    }

    protected convertSymbolKind(kind: monaco.languages.SymbolKind): CodeSymbolKind {
        // Direct conversion since the numeric values match
        return kind as unknown as CodeSymbolKind;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected convertWorkspaceSymbol(symbol: any): CodeSymbol {
        return {
            name: symbol.name,
            kind: this.convertSymbolKind(symbol.kind),
            location: this.convertLocation(symbol.location),
            containerName: symbol.containerName
        };
    }

    protected matchesKindFilter(kind: monaco.languages.SymbolKind, options?: SymbolAnalysisOptions): boolean {
        if (!options?.kinds) {
            return true;
        }
        return options.kinds.includes(kind as unknown as CodeSymbolKind);
    }

    protected matchesOptions(symbol: CodeSymbol, options?: SymbolAnalysisOptions): boolean {
        if (!options) {
            return true;
        }

        if (options.kinds && !options.kinds.includes(symbol.kind)) {
            return false;
        }

        if (!options.includePrivate && symbol.visibility === 'private') {
            return false;
        }

        return true;
    }

    protected async getHoverContent(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): Promise<string | undefined> {
        try {
            const languageFeatures = StandaloneServices.get(ILanguageFeaturesService);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const providers = languageFeatures.hoverProvider.all(model as any);

            for (const provider of providers) {
                try {
                    const hover = await provider.provideHover(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        model as any,
                        position,
                        CancellationToken.None
                    );
                    if (hover?.contents) {
                        return this.extractHoverContent(hover.contents as monaco.languages.Hover['contents']);
                    }
                } catch {
                    // Continue with other providers
                }
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    protected extractHoverContent(contents: monaco.languages.Hover['contents']): string {
        const contentArray = Array.isArray(contents) ? contents : [contents];
        return contentArray
            .map(content => {
                if (typeof content === 'string') {
                    return content;
                }
                if (content && typeof content === 'object' && 'value' in content) {
                    return content.value;
                }
                return '';
            })
            .join('\n');
    }

    protected inferSymbolKindFromLine(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): CodeSymbolKind {
        const line = model.getLineContent(position.lineNumber);
        const word = model.getWordAtPosition(position)?.word ?? '';

        if (/\bclass\s+/.test(line)) {
            return CodeSymbolKind.Class;
        }
        if (/\binterface\s+/.test(line)) {
            return CodeSymbolKind.Interface;
        }
        if (/\bfunction\s+/.test(line) || /=>\s*\{/.test(line)) {
            return CodeSymbolKind.Function;
        }
        if (/\b(const|let|var)\s+/.test(line)) {
            return CodeSymbolKind.Variable;
        }
        if (/\benum\s+/.test(line)) {
            return CodeSymbolKind.Enum;
        }
        if (word[0] === word[0]?.toUpperCase()) {
            return CodeSymbolKind.Class;
        }

        return CodeSymbolKind.Variable;
    }
}
