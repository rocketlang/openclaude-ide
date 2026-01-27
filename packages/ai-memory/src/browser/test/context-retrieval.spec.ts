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
import { ContextRetrievalServiceImpl } from '../context-retrieval-service';

describe('ContextRetrievalService', () => {

    describe('Language Detection', () => {
        it('should detect TypeScript files', () => {
            const service = new ContextRetrievalServiceImpl();

            expect((service as any).detectLanguage('/path/to/file.ts')).to.equal('typescript');
            expect((service as any).detectLanguage('/path/to/file.tsx')).to.equal('typescript');
        });

        it('should detect JavaScript files', () => {
            const service = new ContextRetrievalServiceImpl();

            expect((service as any).detectLanguage('/path/to/file.js')).to.equal('javascript');
            expect((service as any).detectLanguage('/path/to/file.jsx')).to.equal('javascript');
        });

        it('should detect Python files', () => {
            const service = new ContextRetrievalServiceImpl();

            expect((service as any).detectLanguage('/path/to/file.py')).to.equal('python');
        });

        it('should detect other languages', () => {
            const service = new ContextRetrievalServiceImpl();

            expect((service as any).detectLanguage('/path/to/file.java')).to.equal('java');
            expect((service as any).detectLanguage('/path/to/file.go')).to.equal('go');
            expect((service as any).detectLanguage('/path/to/file.rs')).to.equal('rust');
            expect((service as any).detectLanguage('/path/to/file.cpp')).to.equal('cpp');
        });

        it('should return unknown for unrecognized extensions', () => {
            const service = new ContextRetrievalServiceImpl();

            expect((service as any).detectLanguage('/path/to/file.xyz')).to.equal('unknown');
            expect((service as any).detectLanguage('/path/to/file')).to.equal('unknown');
        });
    });

    describe('Relevance Calculation', () => {
        it('should calculate high relevance for exact matches', () => {
            const service = new ContextRetrievalServiceImpl();

            const relevance = (service as any).calculateRelevance(
                'typescript function',
                'This is a typescript function example'
            );

            expect(relevance).to.be.greaterThan(0.5);
        });

        it('should calculate lower relevance for partial matches', () => {
            const service = new ContextRetrievalServiceImpl();

            const relevance = (service as any).calculateRelevance(
                'typescript function',
                'This is a javascript method'
            );

            expect(relevance).to.be.lessThan(0.5);
        });

        it('should return 0 for no matches', () => {
            const service = new ContextRetrievalServiceImpl();

            const relevance = (service as any).calculateRelevance(
                'typescript function',
                'completely unrelated content'
            );

            expect(relevance).to.equal(0);
        });

        it('should handle empty queries', () => {
            const service = new ContextRetrievalServiceImpl();

            const relevance = (service as any).calculateRelevance(
                '',
                'some text content'
            );

            expect(relevance).to.equal(0);
        });
    });

    describe('Error Similarity Calculation', () => {
        it('should return 1 for identical errors', () => {
            const service = new ContextRetrievalServiceImpl();

            const similarity = (service as any).calculateErrorSimilarity(
                'TypeError: Cannot read property "x" of undefined',
                'TypeError: Cannot read property "x" of undefined'
            );

            expect(similarity).to.equal(1);
        });

        it('should return high similarity for similar errors', () => {
            const service = new ContextRetrievalServiceImpl();

            const similarity = (service as any).calculateErrorSimilarity(
                'TypeError: Cannot read property "foo" of undefined',
                'TypeError: Cannot read property "bar" of undefined'
            );

            expect(similarity).to.be.greaterThan(0.7);
        });

        it('should return low similarity for different errors', () => {
            const service = new ContextRetrievalServiceImpl();

            const similarity = (service as any).calculateErrorSimilarity(
                'TypeError: Cannot read property',
                'SyntaxError: Unexpected token'
            );

            expect(similarity).to.be.lessThan(0.5);
        });

        it('should normalize line numbers in errors', () => {
            const service = new ContextRetrievalServiceImpl();

            const similarity = (service as any).calculateErrorSimilarity(
                'Error at line 10: Something went wrong',
                'Error at line 99: Something went wrong'
            );

            expect(similarity).to.equal(1);
        });
    });

    describe('Token Estimation', () => {
        it('should estimate tokens from conversation turns', () => {
            const service = new ContextRetrievalServiceImpl();

            const turns = [
                { role: 'user', content: 'Hello world', timestamp: Date.now() },
                { role: 'assistant', content: 'Hi there! How can I help?', timestamp: Date.now() }
            ];

            const tokens = (service as any).estimateTokens(turns);

            // ~37 chars / 4 = ~9 tokens
            expect(tokens).to.be.greaterThan(5);
            expect(tokens).to.be.lessThan(20);
        });

        it('should include code context in token estimation', () => {
            const service = new ContextRetrievalServiceImpl();

            const turns = [
                {
                    role: 'user',
                    content: 'Fix this code',
                    codeContext: 'function test() { return 42; }',
                    timestamp: Date.now()
                }
            ];

            const tokens = (service as any).estimateTokens(turns);

            // Should be more than just the content
            expect(tokens).to.be.greaterThan(10);
        });
    });
});
