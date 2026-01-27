// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const AITestGenService = Symbol('AITestGenService');
export const aiTestGenServicePath = '/services/ai-test-gen';

/**
 * Supported test frameworks
 */
export type TestFramework =
    | 'jest'
    | 'vitest'
    | 'mocha'
    | 'jasmine'
    | 'pytest'
    | 'unittest'
    | 'junit'
    | 'testng'
    | 'go-test'
    | 'rspec'
    | 'minitest'
    | 'phpunit'
    | 'xunit'
    | 'nunit';

/**
 * Test type/category
 */
export type TestType =
    | 'unit'
    | 'integration'
    | 'e2e'
    | 'snapshot'
    | 'performance'
    | 'security';

/**
 * A single test case
 */
export interface TestCase {
    name: string;
    description: string;
    type: TestType;
    code: string;
    assertions: string[];
    mocks?: MockDefinition[];
    setup?: string;
    teardown?: string;
    isEdgeCase?: boolean;
    isErrorCase?: boolean;
}

/**
 * Mock definition for test dependencies
 */
export interface MockDefinition {
    name: string;
    type: 'function' | 'module' | 'class' | 'value';
    implementation?: string;
    returnValue?: string;
}

/**
 * Generated test suite
 */
export interface TestSuite {
    name: string;
    description: string;
    framework: TestFramework;
    language: string;
    imports: string[];
    setup?: string;
    teardown?: string;
    tests: TestCase[];
    mocks: MockDefinition[];
    fullCode: string;
    estimatedCoverage?: number;
}

/**
 * Request for test generation
 */
export interface TestGenRequest {
    uri: string;
    content: string;
    language: string;
    selection?: {
        startLine: number;
        endLine: number;
    };
    options?: TestGenOptions;
}

/**
 * Options for test generation
 */
export interface TestGenOptions {
    framework?: TestFramework;
    testTypes?: TestType[];
    includeEdgeCases?: boolean;
    includeErrorCases?: boolean;
    includeMocks?: boolean;
    includeSetup?: boolean;
    maxTests?: number;
    style?: 'bdd' | 'tdd' | 'spec';
    assertionLibrary?: string;
    coverageTarget?: number;
}

/**
 * Result of test generation
 */
export interface TestGenResult {
    success: boolean;
    suite?: TestSuite;
    error?: string;
    warnings?: string[];
    suggestions?: string[];
}

/**
 * Function/method info extracted from code
 */
export interface FunctionInfo {
    name: string;
    signature: string;
    params: ParameterInfo[];
    returnType?: string;
    isAsync: boolean;
    isExported: boolean;
    docstring?: string;
    complexity?: number;
    startLine: number;
    endLine: number;
}

/**
 * Parameter info
 */
export interface ParameterInfo {
    name: string;
    type?: string;
    defaultValue?: string;
    isOptional: boolean;
    isRest: boolean;
}

/**
 * Test coverage info
 */
export interface CoverageInfo {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
    uncoveredLines?: number[];
}

/**
 * Framework configuration
 */
export interface FrameworkConfig {
    framework: TestFramework;
    language: string;
    fileExtension: string;
    testFilePattern: string;
    importStatement: string;
    describeBlock: string;
    testBlock: string;
    assertImport?: string;
    mockImport?: string;
    setupHook?: string;
    teardownHook?: string;
}

/**
 * Test generation service interface
 */
export interface AITestGenService {
    /**
     * Generate tests for code
     */
    generateTests(request: TestGenRequest): Promise<TestGenResult>;

    /**
     * Generate tests for a specific function
     */
    generateTestsForFunction(
        uri: string,
        content: string,
        functionName: string,
        options?: TestGenOptions
    ): Promise<TestGenResult>;

    /**
     * Detect the best framework for a file
     */
    detectFramework(uri: string, language: string): Promise<TestFramework>;

    /**
     * Get framework configuration
     */
    getFrameworkConfig(framework: TestFramework): FrameworkConfig;

    /**
     * Extract functions from code
     */
    extractFunctions(content: string, language: string): Promise<FunctionInfo[]>;

    /**
     * Generate mock for a dependency
     */
    generateMock(
        dependency: string,
        type: 'function' | 'module' | 'class',
        framework: TestFramework
    ): Promise<MockDefinition>;

    /**
     * Get test file path for source file
     */
    getTestFilePath(sourceUri: string, framework: TestFramework): string;

    /**
     * Estimate coverage for generated tests
     */
    estimateCoverage(
        sourceContent: string,
        testContent: string,
        language: string
    ): Promise<CoverageInfo>;

    /**
     * Get supported frameworks for a language
     */
    getSupportedFrameworks(language: string): TestFramework[];
}

/**
 * Get framework display name
 */
export function getFrameworkDisplayName(framework: TestFramework): string {
    const names: Record<TestFramework, string> = {
        'jest': 'Jest',
        'vitest': 'Vitest',
        'mocha': 'Mocha',
        'jasmine': 'Jasmine',
        'pytest': 'pytest',
        'unittest': 'unittest',
        'junit': 'JUnit',
        'testng': 'TestNG',
        'go-test': 'Go Test',
        'rspec': 'RSpec',
        'minitest': 'Minitest',
        'phpunit': 'PHPUnit',
        'xunit': 'xUnit',
        'nunit': 'NUnit'
    };
    return names[framework] || framework;
}

/**
 * Get framework icon
 */
export function getFrameworkIcon(framework: TestFramework): string {
    switch (framework) {
        case 'jest':
        case 'vitest':
        case 'mocha':
        case 'jasmine':
            return 'beaker';
        case 'pytest':
        case 'unittest':
            return 'symbol-method';
        case 'junit':
        case 'testng':
            return 'coffee';
        case 'go-test':
            return 'go-to-file';
        case 'rspec':
        case 'minitest':
            return 'ruby';
        case 'phpunit':
            return 'symbol-misc';
        case 'xunit':
        case 'nunit':
            return 'symbol-class';
        default:
            return 'beaker';
    }
}

/**
 * Get test type icon
 */
export function getTestTypeIcon(type: TestType): string {
    switch (type) {
        case 'unit': return 'symbol-method';
        case 'integration': return 'plug';
        case 'e2e': return 'browser';
        case 'snapshot': return 'file-media';
        case 'performance': return 'dashboard';
        case 'security': return 'shield';
        default: return 'beaker';
    }
}

/**
 * Get language for framework
 */
export function getFrameworkLanguage(framework: TestFramework): string {
    switch (framework) {
        case 'jest':
        case 'vitest':
        case 'mocha':
        case 'jasmine':
            return 'typescript';
        case 'pytest':
        case 'unittest':
            return 'python';
        case 'junit':
        case 'testng':
            return 'java';
        case 'go-test':
            return 'go';
        case 'rspec':
        case 'minitest':
            return 'ruby';
        case 'phpunit':
            return 'php';
        case 'xunit':
        case 'nunit':
            return 'csharp';
        default:
            return 'plaintext';
    }
}
