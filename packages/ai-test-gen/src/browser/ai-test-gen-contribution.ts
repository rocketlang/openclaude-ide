// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import {
    AITestGenService,
    TestFramework,
    TestGenOptions,
    TestSuite,
    getFrameworkDisplayName,
    getFrameworkIcon,
    getTestTypeIcon
} from '../common/ai-test-gen-protocol';

export namespace AITestGenCommands {
    export const GENERATE_TESTS: Command = {
        id: 'ai-test-gen.generate',
        label: 'AI: Generate Tests',
        category: 'AI'
    };

    export const GENERATE_TESTS_FOR_FUNCTION: Command = {
        id: 'ai-test-gen.generate-for-function',
        label: 'AI: Generate Tests for Function',
        category: 'AI'
    };

    export const SELECT_FRAMEWORK: Command = {
        id: 'ai-test-gen.select-framework',
        label: 'AI: Select Test Framework',
        category: 'AI'
    };

    export const PREVIEW_TESTS: Command = {
        id: 'ai-test-gen.preview',
        label: 'AI: Preview Generated Tests',
        category: 'AI'
    };

    export const INSERT_TESTS: Command = {
        id: 'ai-test-gen.insert',
        label: 'AI: Insert Tests to File',
        category: 'AI'
    };

    export const SHOW_COVERAGE: Command = {
        id: 'ai-test-gen.coverage',
        label: 'AI: Show Estimated Coverage',
        category: 'AI'
    };
}

@injectable()
export class AITestGenContribution implements CommandContribution, MenuContribution, KeybindingContribution {
    @inject(AITestGenService)
    protected readonly testGenService: AITestGenService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected selectedFramework: TestFramework = 'vitest';
    protected lastGeneratedSuite: TestSuite | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AITestGenCommands.GENERATE_TESTS, {
            execute: () => this.generateTests(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AITestGenCommands.GENERATE_TESTS_FOR_FUNCTION, {
            execute: () => this.generateTestsForFunction(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AITestGenCommands.SELECT_FRAMEWORK, {
            execute: () => this.selectFramework(),
            isEnabled: () => true
        });

        registry.registerCommand(AITestGenCommands.PREVIEW_TESTS, {
            execute: () => this.previewTests(),
            isEnabled: () => this.lastGeneratedSuite !== undefined
        });

        registry.registerCommand(AITestGenCommands.INSERT_TESTS, {
            execute: () => this.insertTests(),
            isEnabled: () => this.lastGeneratedSuite !== undefined
        });

        registry.registerCommand(AITestGenCommands.SHOW_COVERAGE, {
            execute: () => this.showCoverage(),
            isEnabled: () => this.lastGeneratedSuite !== undefined
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AITestGenCommands.GENERATE_TESTS.id,
            label: 'AI: Generate Tests',
            order: '10'
        });

        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AITestGenCommands.GENERATE_TESTS_FOR_FUNCTION.id,
            label: 'AI: Generate Tests for Function',
            order: '11'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: AITestGenCommands.GENERATE_TESTS.id,
            keybinding: 'ctrlcmd+shift+t'
        });

        registry.registerKeybinding({
            command: AITestGenCommands.GENERATE_TESTS_FOR_FUNCTION.id,
            keybinding: 'ctrlcmd+alt+t'
        });
    }

    protected async generateTests(): Promise<void> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return;
        }

        const model = editor.getControl().getModel();
        if (!model) {
            return;
        }

        this.messageService.info('Generating tests...');

        const language = model.getLanguageId();
        const frameworks = this.testGenService.getSupportedFrameworks(language);

        if (frameworks.length > 1 && !this.selectedFramework) {
            await this.selectFramework();
        }

        const options: TestGenOptions = {
            framework: this.selectedFramework,
            includeEdgeCases: true,
            includeErrorCases: true,
            includeMocks: true,
            style: 'bdd'
        };

        const result = await this.testGenService.generateTests({
            uri: model.uri.toString(),
            content: model.getValue(),
            language,
            options
        });

        if (result.success && result.suite) {
            this.lastGeneratedSuite = result.suite;
            await this.showTestSuitePreview(result.suite);

            if (result.suggestions && result.suggestions.length > 0) {
                this.messageService.info(`Suggestions: ${result.suggestions.join(', ')}`);
            }
        } else {
            this.messageService.error(result.error || 'Failed to generate tests');
        }
    }

    protected async generateTestsForFunction(): Promise<void> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return;
        }

        const model = editor.getControl().getModel();
        if (!model) {
            return;
        }

        const content = model.getValue();
        const language = model.getLanguageId();

        // Extract functions
        const functions = await this.testGenService.extractFunctions(content, language);

        if (functions.length === 0) {
            this.messageService.info('No testable functions found');
            return;
        }

        // Let user select function
        const items: QuickPickItem[] = functions.map(func => ({
            label: `$(symbol-method) ${func.name}`,
            description: func.signature,
            detail: func.isAsync ? 'async' : '',
            id: func.name
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Select function to test'
        });

        if (!selected || !selected.id) {
            return;
        }

        this.messageService.info(`Generating tests for ${selected.id}...`);

        const result = await this.testGenService.generateTestsForFunction(
            model.uri.toString(),
            content,
            selected.id,
            {
                framework: this.selectedFramework,
                includeEdgeCases: true,
                includeErrorCases: true
            }
        );

        if (result.success && result.suite) {
            this.lastGeneratedSuite = result.suite;
            await this.showTestSuitePreview(result.suite);
        } else {
            this.messageService.error(result.error || 'Failed to generate tests');
        }
    }

    protected async selectFramework(): Promise<void> {
        const editor = this.getCurrentMonacoEditor();
        let language = 'typescript';

        if (editor) {
            const model = editor.getControl().getModel();
            if (model) {
                language = model.getLanguageId();
            }
        }

        const frameworks = this.testGenService.getSupportedFrameworks(language);

        const items: QuickPickItem[] = frameworks.map(fw => ({
            label: `$(${getFrameworkIcon(fw)}) ${getFrameworkDisplayName(fw)}`,
            description: fw === this.selectedFramework ? '(selected)' : '',
            id: fw
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Select test framework'
        });

        if (selected && selected.id) {
            this.selectedFramework = selected.id as TestFramework;
            this.messageService.info(`Test framework set to ${getFrameworkDisplayName(this.selectedFramework)}`);
        }
    }

    protected async showTestSuitePreview(suite: TestSuite): Promise<void> {
        const items: QuickPickItem[] = [
            {
                label: `$(beaker) ${suite.name}`,
                description: `${suite.tests.length} test(s) - ${getFrameworkDisplayName(suite.framework)}`
            },
            {
                label: `$(dashboard) Estimated Coverage: ${suite.estimatedCoverage?.toFixed(0) || 'N/A'}%`,
                description: ''
            },
            {
                label: '--- Tests ---',
                description: ''
            }
        ];

        for (const test of suite.tests) {
            items.push({
                label: `$(${getTestTypeIcon(test.type)}) ${test.name}`,
                description: test.isEdgeCase ? 'Edge case' : test.isErrorCase ? 'Error case' : 'Basic',
                detail: test.description,
                id: `test-${test.name}`
            });
        }

        items.push({
            label: '--- Actions ---',
            description: ''
        });

        items.push({
            label: '$(output) View Full Code',
            description: 'Show complete test file',
            id: 'view-code'
        });

        items.push({
            label: '$(new-file) Insert Tests',
            description: 'Create test file',
            id: 'insert'
        });

        items.push({
            label: '$(clippy) Copy to Clipboard',
            description: 'Copy test code',
            id: 'copy'
        });

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: `Generated ${suite.tests.length} test(s)`
        });

        if (selected) {
            if (selected.id === 'view-code') {
                await this.showFullCode(suite);
            } else if (selected.id === 'insert') {
                await this.insertTests();
            } else if (selected.id === 'copy') {
                await this.copyToClipboard(suite);
            }
        }
    }

    protected async showFullCode(suite: TestSuite): Promise<void> {
        const lines = suite.fullCode.split('\n');
        const items: QuickPickItem[] = lines.slice(0, 50).map((line, i) => ({
            label: `${i + 1}: ${line}`,
            description: ''
        }));

        if (lines.length > 50) {
            items.push({
                label: `... and ${lines.length - 50} more lines`,
                description: 'Use Copy to Clipboard for full code'
            });
        }

        await this.quickInputService.showQuickPick(items, {
            placeholder: `${suite.name} (${lines.length} lines)`
        });
    }

    protected async previewTests(): Promise<void> {
        if (!this.lastGeneratedSuite) {
            this.messageService.info('No tests generated yet');
            return;
        }

        await this.showTestSuitePreview(this.lastGeneratedSuite);
    }

    protected async insertTests(): Promise<void> {
        if (!this.lastGeneratedSuite) {
            this.messageService.info('No tests to insert');
            return;
        }

        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return;
        }

        const model = editor.getControl().getModel();
        if (!model) {
            return;
        }

        const testFilePath = this.testGenService.getTestFilePath(
            model.uri.toString(),
            this.lastGeneratedSuite.framework
        );

        this.messageService.info(`Tests would be inserted to: ${testFilePath}`);
        this.messageService.info(`Generated ${this.lastGeneratedSuite.tests.length} test(s)`);

        // In a real implementation, this would create/open the test file
        // and insert the generated code
    }

    protected async copyToClipboard(suite: TestSuite): Promise<void> {
        try {
            await navigator.clipboard.writeText(suite.fullCode);
            this.messageService.info('Test code copied to clipboard');
        } catch {
            this.messageService.error('Failed to copy to clipboard');
        }
    }

    protected async showCoverage(): Promise<void> {
        if (!this.lastGeneratedSuite) {
            this.messageService.info('No tests generated yet');
            return;
        }

        const coverage = this.lastGeneratedSuite.estimatedCoverage || 0;

        const items: QuickPickItem[] = [
            {
                label: `$(graph) Estimated Coverage: ${coverage.toFixed(0)}%`,
                description: this.getCoverageGrade(coverage)
            },
            {
                label: `$(symbol-method) Functions Tested: ${this.lastGeneratedSuite.tests.length}`,
                description: ''
            },
            {
                label: `$(check) Basic Tests: ${this.lastGeneratedSuite.tests.filter(t => !t.isEdgeCase && !t.isErrorCase).length}`,
                description: ''
            },
            {
                label: `$(warning) Edge Case Tests: ${this.lastGeneratedSuite.tests.filter(t => t.isEdgeCase).length}`,
                description: ''
            },
            {
                label: `$(error) Error Tests: ${this.lastGeneratedSuite.tests.filter(t => t.isErrorCase).length}`,
                description: ''
            }
        ];

        await this.quickInputService.showQuickPick(items, {
            placeholder: 'Coverage Estimate'
        });
    }

    protected getCoverageGrade(coverage: number): string {
        if (coverage >= 80) return 'Excellent';
        if (coverage >= 60) return 'Good';
        if (coverage >= 40) return 'Fair';
        return 'Needs improvement';
    }

    protected getCurrentMonacoEditor(): MonacoEditor | undefined {
        const current = this.editorManager.currentEditor;
        if (!current) {
            return undefined;
        }

        const editor = current.editor;
        if (this.isMonacoEditor(editor)) {
            return editor as MonacoEditor;
        }

        return undefined;
    }

    protected isMonacoEditor(editor: unknown): boolean {
        return editor !== null &&
            typeof editor === 'object' &&
            'getControl' in editor &&
            typeof (editor as any).getControl === 'function';
    }

    protected hasActiveEditor(): boolean {
        return this.editorManager.currentEditor !== undefined;
    }
}
