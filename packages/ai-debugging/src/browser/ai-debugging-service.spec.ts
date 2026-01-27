// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { AIDebuggingServiceImpl } from './ai-debugging-service';

describe('AIDebuggingService', () => {
    let service: AIDebuggingServiceImpl;

    beforeEach(() => {
        service = new AIDebuggingServiceImpl();
    });

    describe('analyzeError', () => {
        it('should detect TypeError for undefined access', async () => {
            const analysis = await service.analyzeError("Cannot read property 'foo' of undefined");

            expect(analysis.errorType).to.equal('TypeError');
            expect(analysis.rootCause).to.include('undefined');
            expect(analysis.suggestedFixes).to.have.length.greaterThan(0);
        });

        it('should detect TypeError for null access', async () => {
            const analysis = await service.analyzeError("Cannot read property 'bar' of null");

            expect(analysis.errorType).to.equal('TypeError');
            expect(analysis.rootCause).to.include('null');
        });

        it('should detect function call errors', async () => {
            const analysis = await service.analyzeError('foo is not a function');

            expect(analysis.errorType).to.equal('TypeError');
            expect(analysis.rootCause).to.include('function');
        });

        it('should detect SyntaxError', async () => {
            const analysis = await service.analyzeError('SyntaxError: Unexpected token');

            expect(analysis.errorType).to.equal('SyntaxError');
        });

        it('should detect ReferenceError', async () => {
            const analysis = await service.analyzeError('ReferenceError: x is not defined');

            expect(analysis.errorType).to.equal('ReferenceError');
        });

        it('should detect network errors', async () => {
            const analysis = await service.analyzeError('Failed to fetch: network error');

            expect(analysis.errorType).to.equal('NetworkError');
        });

        it('should detect timeout errors', async () => {
            const analysis = await service.analyzeError('Request timeout after 30000ms');

            expect(analysis.errorType).to.equal('TimeoutError');
        });

        it('should handle Error objects', async () => {
            const error = new Error("Cannot read property 'test' of undefined");
            const analysis = await service.analyzeError(error);

            expect(analysis.errorType).to.equal('TypeError');
            expect(analysis.errorMessage).to.include('undefined');
        });

        it('should extract code locations from stack trace', async () => {
            const error = new Error('Test error');
            error.stack = `Error: Test error
    at myFunction (/path/to/file.ts:42:10)
    at anotherFunction (/path/to/other.ts:15:5)`;

            const analysis = await service.analyzeError(error);

            expect(analysis.relatedCode).to.have.length.greaterThan(0);
            expect(analysis.relatedCode[0].filePath).to.equal('/path/to/file.ts');
            expect(analysis.relatedCode[0].line).to.equal(42);
        });
    });

    describe('explainStackTrace', () => {
        it('should explain stack trace with user code', async () => {
            const frames = [
                { functionName: 'handleClick', filePath: '/app/src/button.ts', line: 10, column: 5, isUserCode: true },
                { functionName: 'dispatchEvent', filePath: '/node_modules/react/index.js', line: 100, column: 1, isUserCode: false }
            ];

            const explanation = await service.explainStackTrace(frames);

            expect(explanation).to.include('handleClick');
            expect(explanation).to.include('/app/src/button.ts');
        });

        it('should handle empty stack trace', async () => {
            const explanation = await service.explainStackTrace([]);

            expect(explanation).to.equal('No stack frames available.');
        });
    });

    describe('suggestWatchExpressions', () => {
        it('should suggest relevant variables', async () => {
            const frame = {
                functionName: 'processData',
                filePath: '/app/src/data.ts',
                line: 25,
                column: 1,
                isUserCode: true,
                localVariables: [
                    { name: 'data', value: '{}', type: 'object', isRelevant: true },
                    { name: 'i', value: '0', type: 'number', isRelevant: false }
                ]
            };

            const suggestions = await service.suggestWatchExpressions(frame);

            expect(suggestions).to.include('data');
            expect(suggestions).to.include('this');
            expect(suggestions).to.not.include('i');
        });
    });
});
