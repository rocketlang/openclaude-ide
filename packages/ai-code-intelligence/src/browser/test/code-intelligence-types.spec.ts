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
import {
    CodeSymbolKind,
    AICodeActionKind,
    DiagnosticSeverity,
    CodeSymbol,
    CodePosition,
    CodeRange,
    CodeLocation,
    SemanticContext,
    ImportInfo
} from '../../common';

describe('Code Intelligence Types', () => {

    describe('CodeSymbolKind', () => {
        it('should have all expected symbol kinds', () => {
            expect(CodeSymbolKind.File).to.equal(1);
            expect(CodeSymbolKind.Module).to.equal(2);
            expect(CodeSymbolKind.Class).to.equal(5);
            expect(CodeSymbolKind.Method).to.equal(6);
            expect(CodeSymbolKind.Function).to.equal(12);
            expect(CodeSymbolKind.Variable).to.equal(13);
            expect(CodeSymbolKind.Interface).to.equal(11);
        });
    });

    describe('AICodeActionKind', () => {
        it('should have all expected action kinds', () => {
            expect(AICodeActionKind.QuickFix).to.equal('quickfix');
            expect(AICodeActionKind.Refactor).to.equal('refactor');
            expect(AICodeActionKind.RefactorExtract).to.equal('refactor.extract');
            expect(AICodeActionKind.RefactorInline).to.equal('refactor.inline');
            expect(AICodeActionKind.RefactorRewrite).to.equal('refactor.rewrite');
            expect(AICodeActionKind.Source).to.equal('source');
            expect(AICodeActionKind.SourceOrganizeImports).to.equal('source.organizeImports');
        });
    });

    describe('DiagnosticSeverity', () => {
        it('should have correct severity levels', () => {
            expect(DiagnosticSeverity.Error).to.equal(1);
            expect(DiagnosticSeverity.Warning).to.equal(2);
            expect(DiagnosticSeverity.Information).to.equal(3);
            expect(DiagnosticSeverity.Hint).to.equal(4);
        });
    });

    describe('CodePosition', () => {
        it('should create valid position', () => {
            const position: CodePosition = {
                line: 10,
                character: 5
            };

            expect(position.line).to.equal(10);
            expect(position.character).to.equal(5);
        });
    });

    describe('CodeRange', () => {
        it('should create valid range', () => {
            const range: CodeRange = {
                start: { line: 0, character: 0 },
                end: { line: 10, character: 20 }
            };

            expect(range.start.line).to.equal(0);
            expect(range.end.line).to.equal(10);
            expect(range.end.character).to.equal(20);
        });
    });

    describe('CodeLocation', () => {
        it('should create valid location', () => {
            const location: CodeLocation = {
                uri: 'file:///path/to/file.ts',
                range: {
                    start: { line: 5, character: 0 },
                    end: { line: 5, character: 30 }
                }
            };

            expect(location.uri).to.include('file.ts');
            expect(location.range.start.line).to.equal(5);
        });
    });

    describe('CodeSymbol', () => {
        it('should create valid symbol', () => {
            const symbol: CodeSymbol = {
                name: 'myFunction',
                kind: CodeSymbolKind.Function,
                location: {
                    uri: 'file:///path/to/file.ts',
                    range: {
                        start: { line: 10, character: 0 },
                        end: { line: 20, character: 1 }
                    }
                },
                documentation: 'A useful function',
                visibility: 'public'
            };

            expect(symbol.name).to.equal('myFunction');
            expect(symbol.kind).to.equal(CodeSymbolKind.Function);
            expect(symbol.documentation).to.equal('A useful function');
            expect(symbol.visibility).to.equal('public');
        });

        it('should support nested children', () => {
            const classSymbol: CodeSymbol = {
                name: 'MyClass',
                kind: CodeSymbolKind.Class,
                location: {
                    uri: 'file:///path/to/file.ts',
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 50, character: 1 }
                    }
                },
                children: [
                    {
                        name: 'constructor',
                        kind: CodeSymbolKind.Constructor,
                        location: {
                            uri: 'file:///path/to/file.ts',
                            range: {
                                start: { line: 5, character: 4 },
                                end: { line: 10, character: 5 }
                            }
                        }
                    },
                    {
                        name: 'getData',
                        kind: CodeSymbolKind.Method,
                        location: {
                            uri: 'file:///path/to/file.ts',
                            range: {
                                start: { line: 12, character: 4 },
                                end: { line: 20, character: 5 }
                            }
                        }
                    }
                ]
            };

            expect(classSymbol.children).to.have.length(2);
            expect(classSymbol.children![0].name).to.equal('constructor');
            expect(classSymbol.children![1].name).to.equal('getData');
        });
    });

    describe('SemanticContext', () => {
        it('should create valid semantic context', () => {
            const importInfo: ImportInfo = {
                module: 'react',
                names: ['useState', 'useEffect'],
                isDefault: false,
                isNamespace: false,
                location: {
                    uri: 'file:///src/app.ts',
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 40 }
                    }
                }
            };

            const context: SemanticContext = {
                fileUri: 'file:///src/app.ts',
                language: 'typescript',
                position: { line: 0, character: 6 },
                currentLine: 'const x = 1;',
                linesBefore: [],
                linesAfter: [],
                visibleSymbols: [],
                imports: [importInfo],
                outline: [],
                relatedFiles: [],
                selection: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 12 }
                }
            };

            expect(context.language).to.equal('typescript');
            expect(context.position.character).to.equal(6);
            expect(context.imports).to.have.length(1);
            expect(context.imports[0].module).to.equal('react');
        });
    });
});
