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

import { expect } from 'chai';
import { SymbolAnalysisServiceImpl } from '../symbol-analysis-service';
import { CodeSymbolKind, CodePosition } from '../../common';

describe('SymbolAnalysisService', () => {

    describe('Position Conversion', () => {
        it('should convert to Monaco position (1-indexed)', () => {
            const service = new SymbolAnalysisServiceImpl();

            // Code positions are 0-indexed, Monaco uses 1-indexed
            const codePosition: CodePosition = { line: 0, character: 0 };
            const monacoPosition = (service as any).toMonacoPosition(codePosition);

            expect(monacoPosition.lineNumber).to.equal(1);
            expect(monacoPosition.column).to.equal(1);
        });

        it('should handle non-zero positions', () => {
            const service = new SymbolAnalysisServiceImpl();

            const codePosition: CodePosition = { line: 10, character: 5 };
            const monacoPosition = (service as any).toMonacoPosition(codePosition);

            expect(monacoPosition.lineNumber).to.equal(11);
            expect(monacoPosition.column).to.equal(6);
        });
    });

    describe('Symbol Kind Conversion', () => {
        it('should convert Monaco symbol kinds to CodeSymbolKind', () => {
            const service = new SymbolAnalysisServiceImpl();

            // Monaco SymbolKind values match our CodeSymbolKind (1-indexed)
            expect((service as any).convertSymbolKind(5)).to.equal(CodeSymbolKind.Class);
            expect((service as any).convertSymbolKind(6)).to.equal(CodeSymbolKind.Method);
            expect((service as any).convertSymbolKind(12)).to.equal(CodeSymbolKind.Function);
            expect((service as any).convertSymbolKind(13)).to.equal(CodeSymbolKind.Variable);
        });
    });

    describe('Symbol Kind Inference', () => {
        it('should infer class from line content', () => {
            const service = new SymbolAnalysisServiceImpl();

            // Mock model with getLineContent and getWordAtPosition
            const mockModel = {
                getLineContent: () => 'export class MyService {',
                getWordAtPosition: () => ({ word: 'MyService' })
            };

            const mockPosition = { lineNumber: 1, column: 14 };
            const kind = (service as any).inferSymbolKindFromLine(mockModel, mockPosition);

            expect(kind).to.equal(CodeSymbolKind.Class);
        });

        it('should infer interface from line content', () => {
            const service = new SymbolAnalysisServiceImpl();

            const mockModel = {
                getLineContent: () => 'interface UserData {',
                getWordAtPosition: () => ({ word: 'UserData' })
            };

            const mockPosition = { lineNumber: 1, column: 11 };
            const kind = (service as any).inferSymbolKindFromLine(mockModel, mockPosition);

            expect(kind).to.equal(CodeSymbolKind.Interface);
        });

        it('should infer function from line content', () => {
            const service = new SymbolAnalysisServiceImpl();

            const mockModel = {
                getLineContent: () => 'function calculateTotal() {',
                getWordAtPosition: () => ({ word: 'calculateTotal' })
            };

            const mockPosition = { lineNumber: 1, column: 10 };
            const kind = (service as any).inferSymbolKindFromLine(mockModel, mockPosition);

            expect(kind).to.equal(CodeSymbolKind.Function);
        });

        it('should infer arrow function from line content', () => {
            const service = new SymbolAnalysisServiceImpl();

            const mockModel = {
                getLineContent: () => 'const handler = () => {',
                getWordAtPosition: () => ({ word: 'handler' })
            };

            const mockPosition = { lineNumber: 1, column: 7 };
            const kind = (service as any).inferSymbolKindFromLine(mockModel, mockPosition);

            expect(kind).to.equal(CodeSymbolKind.Function);
        });

        it('should infer variable from const/let/var', () => {
            const service = new SymbolAnalysisServiceImpl();

            const mockModel = {
                getLineContent: () => 'const myValue = 42;',
                getWordAtPosition: () => ({ word: 'myValue' })
            };

            const mockPosition = { lineNumber: 1, column: 7 };
            const kind = (service as any).inferSymbolKindFromLine(mockModel, mockPosition);

            expect(kind).to.equal(CodeSymbolKind.Variable);
        });

        it('should infer enum from line content', () => {
            const service = new SymbolAnalysisServiceImpl();

            const mockModel = {
                getLineContent: () => 'enum Status {',
                getWordAtPosition: () => ({ word: 'Status' })
            };

            const mockPosition = { lineNumber: 1, column: 6 };
            const kind = (service as any).inferSymbolKindFromLine(mockModel, mockPosition);

            expect(kind).to.equal(CodeSymbolKind.Enum);
        });

        it('should infer class from PascalCase word', () => {
            const service = new SymbolAnalysisServiceImpl();

            const mockModel = {
                getLineContent: () => 'const service = new UserService();',
                getWordAtPosition: () => ({ word: 'UserService' })
            };

            const mockPosition = { lineNumber: 1, column: 21 };
            const kind = (service as any).inferSymbolKindFromLine(mockModel, mockPosition);

            expect(kind).to.equal(CodeSymbolKind.Class);
        });
    });

    describe('Location Conversion', () => {
        it('should convert Monaco location to CodeLocation', () => {
            const service = new SymbolAnalysisServiceImpl();

            const monacoLocation = {
                uri: { toString: () => 'file:///path/to/file.ts' },
                range: {
                    startLineNumber: 10,
                    startColumn: 5,
                    endLineNumber: 10,
                    endColumn: 20
                }
            };

            const codeLocation = (service as any).convertLocation(monacoLocation);

            expect(codeLocation.uri).to.equal('file:///path/to/file.ts');
            expect(codeLocation.range.start.line).to.equal(9); // 0-indexed
            expect(codeLocation.range.start.character).to.equal(4);
            expect(codeLocation.range.end.line).to.equal(9);
            expect(codeLocation.range.end.character).to.equal(19);
        });
    });

    describe('Options Matching', () => {
        it('should match symbol with no options', () => {
            const service = new SymbolAnalysisServiceImpl();

            const symbol = {
                name: 'test',
                kind: CodeSymbolKind.Function,
                location: { uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } }
            };

            expect((service as any).matchesOptions(symbol, undefined)).to.be.true;
            expect((service as any).matchesOptions(symbol, {})).to.be.true;
        });

        it('should filter by symbol kinds', () => {
            const service = new SymbolAnalysisServiceImpl();

            const functionSymbol = {
                name: 'test',
                kind: CodeSymbolKind.Function,
                location: { uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } }
            };

            const classSymbol = {
                name: 'Test',
                kind: CodeSymbolKind.Class,
                location: { uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } }
            };

            const options = { kinds: [CodeSymbolKind.Function] };

            expect((service as any).matchesOptions(functionSymbol, options)).to.be.true;
            expect((service as any).matchesOptions(classSymbol, options)).to.be.false;
        });

        it('should filter private symbols when includePrivate is false', () => {
            const service = new SymbolAnalysisServiceImpl();

            const publicSymbol = {
                name: 'test',
                kind: CodeSymbolKind.Function,
                visibility: 'public',
                location: { uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } }
            };

            const privateSymbol = {
                name: 'test',
                kind: CodeSymbolKind.Function,
                visibility: 'private',
                location: { uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } }
            };

            const options = { includePrivate: false };

            expect((service as any).matchesOptions(publicSymbol, options)).to.be.true;
            expect((service as any).matchesOptions(privateSymbol, options)).to.be.false;
        });
    });

    describe('Hover Content Extraction', () => {
        it('should extract string content', () => {
            const service = new SymbolAnalysisServiceImpl();

            const contents = 'Simple string content';
            const result = (service as any).extractHoverContent(contents);

            expect(result).to.equal('Simple string content');
        });

        it('should extract content from markdown object', () => {
            const service = new SymbolAnalysisServiceImpl();

            const contents = { value: '**Bold text**', language: 'markdown' };
            const result = (service as any).extractHoverContent(contents);

            expect(result).to.equal('**Bold text**');
        });

        it('should handle array of contents', () => {
            const service = new SymbolAnalysisServiceImpl();

            const contents = [
                'First line',
                { value: 'Second line' },
                'Third line'
            ];
            const result = (service as any).extractHoverContent(contents);

            expect(result).to.include('First line');
            expect(result).to.include('Second line');
            expect(result).to.include('Third line');
        });
    });
});
