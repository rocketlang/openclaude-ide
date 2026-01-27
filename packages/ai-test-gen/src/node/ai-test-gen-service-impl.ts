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
import {
    AITestGenService,
    TestGenRequest,
    TestGenResult,
    TestGenOptions,
    TestFramework,
    TestSuite,
    TestCase,
    MockDefinition,
    FunctionInfo,
    ParameterInfo,
    CoverageInfo,
    FrameworkConfig
} from '../common/ai-test-gen-protocol';

@injectable()
export class AITestGenServiceImpl implements AITestGenService {
    protected readonly frameworkConfigs: Map<TestFramework, FrameworkConfig> = new Map([
        ['jest', {
            framework: 'jest',
            language: 'typescript',
            fileExtension: '.test.ts',
            testFilePattern: '**/*.test.{ts,tsx,js,jsx}',
            importStatement: "import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';",
            describeBlock: 'describe',
            testBlock: 'it',
            assertImport: '',
            mockImport: '',
            setupHook: 'beforeEach',
            teardownHook: 'afterEach'
        }],
        ['vitest', {
            framework: 'vitest',
            language: 'typescript',
            fileExtension: '.test.ts',
            testFilePattern: '**/*.test.{ts,tsx,js,jsx}',
            importStatement: "import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';",
            describeBlock: 'describe',
            testBlock: 'it',
            assertImport: '',
            mockImport: '',
            setupHook: 'beforeEach',
            teardownHook: 'afterEach'
        }],
        ['mocha', {
            framework: 'mocha',
            language: 'typescript',
            fileExtension: '.test.ts',
            testFilePattern: '**/*.test.{ts,js}',
            importStatement: "import { describe, it, before, after, beforeEach, afterEach } from 'mocha';\nimport { expect } from 'chai';",
            describeBlock: 'describe',
            testBlock: 'it',
            assertImport: "import { expect } from 'chai';",
            mockImport: "import sinon from 'sinon';",
            setupHook: 'beforeEach',
            teardownHook: 'afterEach'
        }],
        ['pytest', {
            framework: 'pytest',
            language: 'python',
            fileExtension: '_test.py',
            testFilePattern: '**/test_*.py',
            importStatement: 'import pytest',
            describeBlock: 'class Test',
            testBlock: 'def test_',
            assertImport: '',
            mockImport: 'from unittest.mock import Mock, patch, MagicMock',
            setupHook: 'setup_method',
            teardownHook: 'teardown_method'
        }],
        ['unittest', {
            framework: 'unittest',
            language: 'python',
            fileExtension: '_test.py',
            testFilePattern: '**/test_*.py',
            importStatement: 'import unittest',
            describeBlock: 'class Test',
            testBlock: 'def test_',
            assertImport: '',
            mockImport: 'from unittest.mock import Mock, patch',
            setupHook: 'setUp',
            teardownHook: 'tearDown'
        }],
        ['junit', {
            framework: 'junit',
            language: 'java',
            fileExtension: 'Test.java',
            testFilePattern: '**/*Test.java',
            importStatement: 'import org.junit.jupiter.api.*;\nimport static org.junit.jupiter.api.Assertions.*;',
            describeBlock: '@Nested class',
            testBlock: '@Test void',
            assertImport: 'import static org.junit.jupiter.api.Assertions.*;',
            mockImport: 'import org.mockito.Mockito.*;',
            setupHook: '@BeforeEach',
            teardownHook: '@AfterEach'
        }],
        ['go-test', {
            framework: 'go-test',
            language: 'go',
            fileExtension: '_test.go',
            testFilePattern: '**/*_test.go',
            importStatement: 'import "testing"',
            describeBlock: 'func Test',
            testBlock: 't.Run',
            assertImport: '',
            mockImport: '',
            setupHook: '',
            teardownHook: ''
        }]
    ]);

    async generateTests(request: TestGenRequest): Promise<TestGenResult> {
        try {
            const framework = request.options?.framework ||
                await this.detectFramework(request.uri, request.language);

            const functions = await this.extractFunctions(request.content, request.language);

            if (functions.length === 0) {
                return {
                    success: false,
                    error: 'No testable functions found in the code'
                };
            }

            const config = this.getFrameworkConfig(framework);
            const tests: TestCase[] = [];
            const mocks: MockDefinition[] = [];

            for (const func of functions) {
                const funcTests = this.generateTestsForFunctionInfo(func, request, config);
                tests.push(...funcTests);
            }

            const suite = this.buildTestSuite(
                request.uri,
                tests,
                mocks,
                config,
                request.options
            );

            return {
                success: true,
                suite,
                suggestions: this.generateSuggestions(functions, tests)
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async generateTestsForFunction(
        uri: string,
        content: string,
        functionName: string,
        options?: TestGenOptions
    ): Promise<TestGenResult> {
        const functions = await this.extractFunctions(content, this.detectLanguage(uri));
        const func = functions.find(f => f.name === functionName);

        if (!func) {
            return {
                success: false,
                error: `Function '${functionName}' not found`
            };
        }

        const framework = options?.framework ||
            await this.detectFramework(uri, this.detectLanguage(uri));
        const config = this.getFrameworkConfig(framework);

        const request: TestGenRequest = {
            uri,
            content,
            language: this.detectLanguage(uri),
            options
        };

        const tests = this.generateTestsForFunctionInfo(func, request, config);

        const suite = this.buildTestSuite(uri, tests, [], config, options);

        return {
            success: true,
            suite
        };
    }

    async detectFramework(uri: string, language: string): Promise<TestFramework> {
        switch (language) {
            case 'typescript':
            case 'javascript':
                return 'vitest';
            case 'python':
                return 'pytest';
            case 'java':
                return 'junit';
            case 'go':
                return 'go-test';
            case 'ruby':
                return 'rspec';
            case 'php':
                return 'phpunit';
            case 'csharp':
                return 'xunit';
            default:
                return 'jest';
        }
    }

    getFrameworkConfig(framework: TestFramework): FrameworkConfig {
        return this.frameworkConfigs.get(framework) || this.frameworkConfigs.get('jest')!;
    }

    async extractFunctions(content: string, language: string): Promise<FunctionInfo[]> {
        const functions: FunctionInfo[] = [];
        const lines = content.split('\n');

        // TypeScript/JavaScript function patterns
        if (language === 'typescript' || language === 'javascript') {
            const patterns = [
                // export function name(params): type
                /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/,
                // export const name = (params) =>
                /^(\s*)(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/,
                // class method
                /^(\s*)(async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/
            ];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                for (const pattern of patterns) {
                    const match = line.match(pattern);
                    if (match) {
                        const isExported = match[2]?.includes('export') || false;
                        const isAsync = match[3]?.includes('async') || match[4]?.includes('async') || false;
                        const name = match[4] || match[3];
                        const paramsStr = match[5] || match[4] || '';
                        const returnType = match[6]?.trim();

                        if (name && !name.startsWith('_')) {
                            const params = this.parseParameters(paramsStr, language);
                            const endLine = this.findFunctionEnd(lines, i);

                            functions.push({
                                name,
                                signature: `${isAsync ? 'async ' : ''}${name}(${paramsStr})${returnType ? `: ${returnType}` : ''}`,
                                params,
                                returnType,
                                isAsync,
                                isExported,
                                startLine: i + 1,
                                endLine,
                                complexity: this.calculateComplexity(lines.slice(i, endLine).join('\n'))
                            });
                        }
                        break;
                    }
                }
            }
        }

        // Python function patterns
        if (language === 'python') {
            const pattern = /^(\s*)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/;

            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(pattern);
                if (match) {
                    const isAsync = !!match[2];
                    const name = match[3];
                    const paramsStr = match[4];
                    const returnType = match[5]?.trim();

                    if (name && !name.startsWith('_')) {
                        const params = this.parseParameters(paramsStr, language);
                        const endLine = this.findPythonFunctionEnd(lines, i);

                        functions.push({
                            name,
                            signature: `${isAsync ? 'async ' : ''}def ${name}(${paramsStr})${returnType ? ` -> ${returnType}` : ''}`,
                            params,
                            returnType,
                            isAsync,
                            isExported: true,
                            startLine: i + 1,
                            endLine,
                            complexity: this.calculateComplexity(lines.slice(i, endLine).join('\n'))
                        });
                    }
                }
            }
        }

        return functions;
    }

    async generateMock(
        dependency: string,
        type: 'function' | 'module' | 'class',
        framework: TestFramework
    ): Promise<MockDefinition> {
        const mockImpl = this.getMockImplementation(dependency, type, framework);

        return {
            name: dependency,
            type,
            implementation: mockImpl
        };
    }

    getTestFilePath(sourceUri: string, framework: TestFramework): string {
        const config = this.getFrameworkConfig(framework);
        const baseName = sourceUri.replace(/\.[^.]+$/, '');
        return `${baseName}${config.fileExtension}`;
    }

    async estimateCoverage(
        sourceContent: string,
        testContent: string,
        language: string
    ): Promise<CoverageInfo> {
        const functions = await this.extractFunctions(sourceContent, language);
        const testLines = testContent.split('\n');

        let coveredFunctions = 0;
        for (const func of functions) {
            const regex = new RegExp(`\\b${func.name}\\b`);
            if (testLines.some(line => regex.test(line))) {
                coveredFunctions++;
            }
        }

        const functionCoverage = functions.length > 0
            ? (coveredFunctions / functions.length) * 100
            : 0;

        return {
            statements: functionCoverage * 0.8,
            branches: functionCoverage * 0.6,
            functions: functionCoverage,
            lines: functionCoverage * 0.85
        };
    }

    getSupportedFrameworks(language: string): TestFramework[] {
        switch (language) {
            case 'typescript':
            case 'javascript':
                return ['jest', 'vitest', 'mocha', 'jasmine'];
            case 'python':
                return ['pytest', 'unittest'];
            case 'java':
                return ['junit', 'testng'];
            case 'go':
                return ['go-test'];
            case 'ruby':
                return ['rspec', 'minitest'];
            case 'php':
                return ['phpunit'];
            case 'csharp':
                return ['xunit', 'nunit'];
            default:
                return ['jest'];
        }
    }

    protected generateTestsForFunctionInfo(
        func: FunctionInfo,
        request: TestGenRequest,
        config: FrameworkConfig
    ): TestCase[] {
        const tests: TestCase[] = [];
        const options = request.options || {};

        // Basic test
        tests.push(this.generateBasicTest(func, config));

        // Edge case tests
        if (options.includeEdgeCases !== false) {
            tests.push(...this.generateEdgeCaseTests(func, config));
        }

        // Error case tests
        if (options.includeErrorCases !== false) {
            tests.push(...this.generateErrorTests(func, config));
        }

        // Async tests
        if (func.isAsync) {
            tests.push(this.generateAsyncTest(func, config));
        }

        return tests;
    }

    protected generateBasicTest(func: FunctionInfo, config: FrameworkConfig): TestCase {
        const testName = `should ${this.camelToSentence(func.name)}`;
        const assertions = this.generateAssertions(func, config);

        let code: string;
        if (config.framework === 'pytest' || config.framework === 'unittest') {
            code = this.generatePythonTest(func, testName, assertions);
        } else if (config.framework === 'junit') {
            code = this.generateJavaTest(func, testName, assertions);
        } else if (config.framework === 'go-test') {
            code = this.generateGoTest(func, testName, assertions);
        } else {
            code = this.generateJSTest(func, testName, assertions, config);
        }

        return {
            name: testName,
            description: `Tests basic functionality of ${func.name}`,
            type: 'unit',
            code,
            assertions
        };
    }

    protected generateEdgeCaseTests(func: FunctionInfo, config: FrameworkConfig): TestCase[] {
        const tests: TestCase[] = [];

        // Null/undefined parameter tests
        for (const param of func.params) {
            if (!param.type?.includes('undefined') && !param.isOptional) {
                const testName = `should handle null ${param.name}`;
                tests.push({
                    name: testName,
                    description: `Tests ${func.name} with null ${param.name}`,
                    type: 'unit',
                    code: this.generateNullParamTest(func, param, config),
                    assertions: ['throws error or handles gracefully'],
                    isEdgeCase: true
                });
            }
        }

        // Empty input tests
        if (func.params.some(p => p.type?.includes('string') || p.type?.includes('array'))) {
            tests.push({
                name: `should handle empty input`,
                description: `Tests ${func.name} with empty values`,
                type: 'unit',
                code: this.generateEmptyInputTest(func, config),
                assertions: ['handles empty input correctly'],
                isEdgeCase: true
            });
        }

        return tests;
    }

    protected generateErrorTests(func: FunctionInfo, config: FrameworkConfig): TestCase[] {
        const tests: TestCase[] = [];

        tests.push({
            name: `should throw error for invalid input`,
            description: `Tests ${func.name} error handling`,
            type: 'unit',
            code: this.generateErrorTest(func, config),
            assertions: ['throws expected error'],
            isErrorCase: true
        });

        return tests;
    }

    protected generateAsyncTest(func: FunctionInfo, config: FrameworkConfig): TestCase {
        const testName = `should resolve ${this.camelToSentence(func.name)} asynchronously`;

        return {
            name: testName,
            description: `Tests async behavior of ${func.name}`,
            type: 'unit',
            code: this.generateAsyncTestCode(func, config),
            assertions: ['resolves with expected value']
        };
    }

    protected generateJSTest(
        func: FunctionInfo,
        testName: string,
        assertions: string[],
        config: FrameworkConfig
    ): string {
        const asyncKeyword = func.isAsync ? 'async ' : '';
        const awaitKeyword = func.isAsync ? 'await ' : '';

        return `${config.testBlock}('${testName}', ${asyncKeyword}() => {
    // Arrange
    ${func.params.map(p => `const ${p.name} = ${this.generateMockValue(p)};`).join('\n    ')}

    // Act
    const result = ${awaitKeyword}${func.name}(${func.params.map(p => p.name).join(', ')});

    // Assert
    expect(result).toBeDefined();
    ${assertions.map(a => `// ${a}`).join('\n    ')}
});`;
    }

    protected generatePythonTest(
        func: FunctionInfo,
        testName: string,
        assertions: string[]
    ): string {
        const snakeName = this.camelToSnake(testName);

        return `def ${snakeName}():
    # Arrange
    ${func.params.map(p => `${p.name} = ${this.generatePythonMockValue(p)}`).join('\n    ')}

    # Act
    result = ${func.name}(${func.params.map(p => p.name).join(', ')})

    # Assert
    assert result is not None
    ${assertions.map(a => `# ${a}`).join('\n    ')}`;
    }

    protected generateJavaTest(
        func: FunctionInfo,
        testName: string,
        assertions: string[]
    ): string {
        const methodName = this.camelCase(testName.replace(/\s+/g, '_'));

        return `@Test
void ${methodName}() {
    // Arrange
    ${func.params.map(p => `var ${p.name} = ${this.generateJavaMockValue(p)};`).join('\n    ')}

    // Act
    var result = ${func.name}(${func.params.map(p => p.name).join(', ')});

    // Assert
    assertNotNull(result);
    ${assertions.map(a => `// ${a}`).join('\n    ')}
}`;
    }

    protected generateGoTest(
        func: FunctionInfo,
        testName: string,
        assertions: string[]
    ): string {
        const funcName = this.pascalCase(func.name);

        return `func Test${funcName}(t *testing.T) {
    // Arrange
    ${func.params.map(p => `${p.name} := ${this.generateGoMockValue(p)}`).join('\n    ')}

    // Act
    result := ${func.name}(${func.params.map(p => p.name).join(', ')})

    // Assert
    if result == nil {
        t.Error("Expected non-nil result")
    }
    ${assertions.map(a => `// ${a}`).join('\n    ')}
}`;
    }

    protected generateNullParamTest(
        func: FunctionInfo,
        param: ParameterInfo,
        config: FrameworkConfig
    ): string {
        if (config.framework === 'pytest') {
            return `def test_${this.camelToSnake(func.name)}_with_none_${param.name}():
    with pytest.raises(Exception):
        ${func.name}(None)`;
        }

        return `${config.testBlock}('should handle null ${param.name}', () => {
    expect(() => ${func.name}(null)).toThrow();
});`;
    }

    protected generateEmptyInputTest(func: FunctionInfo, config: FrameworkConfig): string {
        if (config.framework === 'pytest') {
            return `def test_${this.camelToSnake(func.name)}_with_empty_input():
    result = ${func.name}('')
    assert result is not None`;
        }

        return `${config.testBlock}('should handle empty input', () => {
    const result = ${func.name}('');
    expect(result).toBeDefined();
});`;
    }

    protected generateErrorTest(func: FunctionInfo, config: FrameworkConfig): string {
        if (config.framework === 'pytest') {
            return `def test_${this.camelToSnake(func.name)}_throws_for_invalid_input():
    with pytest.raises(Exception):
        ${func.name}(None)`;
        }

        return `${config.testBlock}('should throw for invalid input', () => {
    expect(() => ${func.name}(undefined)).toThrow();
});`;
    }

    protected generateAsyncTestCode(func: FunctionInfo, config: FrameworkConfig): string {
        if (config.framework === 'pytest') {
            return `@pytest.mark.asyncio
async def test_${this.camelToSnake(func.name)}_async():
    result = await ${func.name}()
    assert result is not None`;
        }

        return `${config.testBlock}('should resolve asynchronously', async () => {
    const result = await ${func.name}();
    expect(result).toBeDefined();
});`;
    }

    protected buildTestSuite(
        uri: string,
        tests: TestCase[],
        mocks: MockDefinition[],
        config: FrameworkConfig,
        options?: TestGenOptions
    ): TestSuite {
        const fileName = uri.split('/').pop() || 'module';
        const moduleName = fileName.replace(/\.[^.]+$/, '');

        const imports = [config.importStatement];
        if (options?.includeMocks && config.mockImport) {
            imports.push(config.mockImport);
        }

        const fullCode = this.generateFullTestCode(moduleName, tests, imports, config);

        return {
            name: `${moduleName} Tests`,
            description: `Test suite for ${moduleName}`,
            framework: config.framework,
            language: config.language,
            imports,
            tests,
            mocks,
            fullCode,
            estimatedCoverage: this.estimateTestCoverage(tests)
        };
    }

    protected generateFullTestCode(
        moduleName: string,
        tests: TestCase[],
        imports: string[],
        config: FrameworkConfig
    ): string {
        const importBlock = imports.join('\n');
        const testBlock = tests.map(t => t.code).join('\n\n');

        if (config.framework === 'pytest') {
            return `${importBlock}

class Test${this.pascalCase(moduleName)}:
    ${testBlock.split('\n').map(l => '    ' + l).join('\n')}
`;
        }

        if (config.framework === 'junit') {
            return `${importBlock}

class ${this.pascalCase(moduleName)}Test {

${testBlock}

}`;
        }

        return `${importBlock}

${config.describeBlock}('${moduleName}', () => {
${testBlock}
});
`;
    }

    protected generateAssertions(func: FunctionInfo, config: FrameworkConfig): string[] {
        const assertions: string[] = [];

        if (func.returnType) {
            if (func.returnType.includes('void')) {
                assertions.push('function completes without error');
            } else if (func.returnType.includes('boolean')) {
                assertions.push('returns true or false');
            } else if (func.returnType.includes('number')) {
                assertions.push('returns a number');
            } else if (func.returnType.includes('string')) {
                assertions.push('returns a string');
            } else if (func.returnType.includes('[]') || func.returnType.includes('Array')) {
                assertions.push('returns an array');
            } else {
                assertions.push('returns expected type');
            }
        } else {
            assertions.push('returns expected value');
        }

        return assertions;
    }

    protected parseParameters(paramsStr: string, language: string): ParameterInfo[] {
        if (!paramsStr.trim()) {
            return [];
        }

        const params: ParameterInfo[] = [];
        const paramList = paramsStr.split(',');

        for (const param of paramList) {
            const trimmed = param.trim();
            if (!trimmed || trimmed === 'self' || trimmed === 'this') {
                continue;
            }

            let name: string;
            let type: string | undefined;
            let defaultValue: string | undefined;
            let isOptional = false;
            let isRest = false;

            if (language === 'python') {
                const match = trimmed.match(/^(\*{0,2})(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?$/);
                if (match) {
                    isRest = match[1] === '*' || match[1] === '**';
                    name = match[2];
                    type = match[3]?.trim();
                    defaultValue = match[4]?.trim();
                    isOptional = !!defaultValue;
                } else {
                    name = trimmed;
                }
            } else {
                const match = trimmed.match(/^(\.{3})?(\w+)(\?)?(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?$/);
                if (match) {
                    isRest = !!match[1];
                    name = match[2];
                    isOptional = !!match[3] || !!match[5];
                    type = match[4]?.trim();
                    defaultValue = match[5]?.trim();
                } else {
                    name = trimmed;
                }
            }

            params.push({
                name,
                type,
                defaultValue,
                isOptional,
                isRest
            });
        }

        return params;
    }

    protected findFunctionEnd(lines: string[], startIndex: number): number {
        let braceCount = 0;
        let started = false;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            for (const char of line) {
                if (char === '{') {
                    braceCount++;
                    started = true;
                } else if (char === '}') {
                    braceCount--;
                    if (started && braceCount === 0) {
                        return i + 1;
                    }
                }
            }
        }

        return lines.length;
    }

    protected findPythonFunctionEnd(lines: string[], startIndex: number): number {
        const startIndent = lines[startIndex].match(/^(\s*)/)?.[1].length || 0;

        for (let i = startIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === '') {
                continue;
            }

            const indent = line.match(/^(\s*)/)?.[1].length || 0;
            if (indent <= startIndent && line.trim() !== '') {
                return i;
            }
        }

        return lines.length;
    }

    protected calculateComplexity(code: string): number {
        let complexity = 1;

        const patterns = [
            /\bif\b/g,
            /\belse\b/g,
            /\bfor\b/g,
            /\bwhile\b/g,
            /\bcase\b/g,
            /\bcatch\b/g,
            /\&\&/g,
            /\|\|/g,
            /\?\s*[^:]/g
        ];

        for (const pattern of patterns) {
            const matches = code.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        }

        return complexity;
    }

    protected getMockImplementation(
        dependency: string,
        type: 'function' | 'module' | 'class',
        framework: TestFramework
    ): string {
        if (framework === 'jest' || framework === 'vitest') {
            if (type === 'function') {
                return `jest.fn()`;
            } else if (type === 'module') {
                return `jest.mock('${dependency}')`;
            } else {
                return `jest.fn().mockImplementation(() => ({}))`;
            }
        }

        if (framework === 'pytest') {
            return `Mock()`;
        }

        return 'mock()';
    }

    protected generateMockValue(param: ParameterInfo): string {
        if (param.defaultValue) {
            return param.defaultValue;
        }

        const type = param.type?.toLowerCase() || '';

        if (type.includes('string')) return "'test'";
        if (type.includes('number') || type.includes('int')) return '42';
        if (type.includes('boolean') || type.includes('bool')) return 'true';
        if (type.includes('[]') || type.includes('array')) return '[]';
        if (type.includes('object') || type.includes('{}')) return '{}';
        if (type.includes('function')) return '() => {}';
        if (type.includes('null')) return 'null';
        if (type.includes('undefined')) return 'undefined';

        return "'test'";
    }

    protected generatePythonMockValue(param: ParameterInfo): string {
        if (param.defaultValue) {
            return param.defaultValue;
        }

        const type = param.type?.toLowerCase() || '';

        if (type.includes('str')) return "'test'";
        if (type.includes('int')) return '42';
        if (type.includes('float')) return '3.14';
        if (type.includes('bool')) return 'True';
        if (type.includes('list')) return '[]';
        if (type.includes('dict')) return '{}';
        if (type.includes('none')) return 'None';

        return "'test'";
    }

    protected generateJavaMockValue(param: ParameterInfo): string {
        const type = param.type?.toLowerCase() || '';

        if (type.includes('string')) return '"test"';
        if (type.includes('int') || type.includes('integer')) return '42';
        if (type.includes('long')) return '42L';
        if (type.includes('double')) return '3.14';
        if (type.includes('float')) return '3.14f';
        if (type.includes('boolean')) return 'true';
        if (type.includes('list')) return 'new ArrayList<>()';
        if (type.includes('map')) return 'new HashMap<>()';

        return 'null';
    }

    protected generateGoMockValue(param: ParameterInfo): string {
        const type = param.type?.toLowerCase() || '';

        if (type.includes('string')) return '"test"';
        if (type.includes('int')) return '42';
        if (type.includes('float')) return '3.14';
        if (type.includes('bool')) return 'true';
        if (type.includes('[]')) return 'nil';

        return '""';
    }

    protected estimateTestCoverage(tests: TestCase[]): number {
        const baseScore = 50;
        const edgeCaseBonus = tests.filter(t => t.isEdgeCase).length * 10;
        const errorCaseBonus = tests.filter(t => t.isErrorCase).length * 10;

        return Math.min(100, baseScore + edgeCaseBonus + errorCaseBonus);
    }

    protected generateSuggestions(functions: FunctionInfo[], tests: TestCase[]): string[] {
        const suggestions: string[] = [];

        if (functions.some(f => f.isAsync) && !tests.some(t => t.code.includes('async'))) {
            suggestions.push('Consider adding async/await tests for async functions');
        }

        if (functions.some(f => (f.complexity || 0) > 5)) {
            suggestions.push('High complexity functions may need more test cases');
        }

        if (!tests.some(t => t.isEdgeCase)) {
            suggestions.push('Consider adding edge case tests');
        }

        return suggestions;
    }

    protected detectLanguage(uri: string): string {
        const ext = uri.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'ts':
            case 'tsx':
                return 'typescript';
            case 'js':
            case 'jsx':
                return 'javascript';
            case 'py':
                return 'python';
            case 'java':
                return 'java';
            case 'go':
                return 'go';
            case 'rb':
                return 'ruby';
            case 'php':
                return 'php';
            case 'cs':
                return 'csharp';
            default:
                return 'typescript';
        }
    }

    protected camelToSentence(str: string): string {
        return str
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, s => s.toUpperCase())
            .trim()
            .toLowerCase();
    }

    protected camelToSnake(str: string): string {
        return str
            .replace(/\s+/g, '_')
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');
    }

    protected camelCase(str: string): string {
        return str
            .replace(/[_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
            .replace(/^./, s => s.toLowerCase());
    }

    protected pascalCase(str: string): string {
        return str
            .replace(/[_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
            .replace(/^./, s => s.toUpperCase());
    }
}
