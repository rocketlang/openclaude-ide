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
    AIErrorRecoveryService,
    EditorError,
    ErrorContext,
    getCategoryIcon
} from '../common/ai-error-recovery-protocol';

export namespace AIErrorRecoveryCommands {
    export const ANALYZE_ERROR: Command = {
        id: 'ai-error-recovery.analyze',
        label: 'AI: Analyze Error at Cursor',
        category: 'AI'
    };

    export const SHOW_QUICK_FIXES: Command = {
        id: 'ai-error-recovery.quick-fixes',
        label: 'AI: Show Quick Fixes',
        category: 'AI'
    };

    export const FIX_ALL: Command = {
        id: 'ai-error-recovery.fix-all',
        label: 'AI: Fix All Errors in File',
        category: 'AI'
    };

    export const EXPLAIN_ERROR_CODE: Command = {
        id: 'ai-error-recovery.explain-code',
        label: 'AI: Explain Error Code',
        category: 'AI'
    };

    export const ERROR_STATISTICS: Command = {
        id: 'ai-error-recovery.statistics',
        label: 'AI: Show Error Statistics',
        category: 'AI'
    };

    export const EXPLAIN_STACK_TRACE: Command = {
        id: 'ai-error-recovery.explain-stack',
        label: 'AI: Explain Stack Trace',
        category: 'AI'
    };
}

@injectable()
export class AIErrorRecoveryContribution implements CommandContribution, MenuContribution, KeybindingContribution {
    @inject(AIErrorRecoveryService)
    protected readonly errorService: AIErrorRecoveryService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AIErrorRecoveryCommands.ANALYZE_ERROR, {
            execute: () => this.analyzeErrorAtCursor(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AIErrorRecoveryCommands.SHOW_QUICK_FIXES, {
            execute: () => this.showQuickFixes(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AIErrorRecoveryCommands.FIX_ALL, {
            execute: () => this.fixAllInFile(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AIErrorRecoveryCommands.EXPLAIN_ERROR_CODE, {
            execute: () => this.explainErrorCode(),
            isEnabled: () => true
        });

        registry.registerCommand(AIErrorRecoveryCommands.ERROR_STATISTICS, {
            execute: () => this.showStatistics(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AIErrorRecoveryCommands.EXPLAIN_STACK_TRACE, {
            execute: () => this.explainStackTrace(),
            isEnabled: () => true
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AIErrorRecoveryCommands.ANALYZE_ERROR.id,
            label: 'AI: Analyze Error',
            order: '5'
        });

        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AIErrorRecoveryCommands.SHOW_QUICK_FIXES.id,
            label: 'AI: Quick Fix',
            order: '6'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: AIErrorRecoveryCommands.ANALYZE_ERROR.id,
            keybinding: 'ctrlcmd+shift+.'
        });

        registry.registerKeybinding({
            command: AIErrorRecoveryCommands.SHOW_QUICK_FIXES.id,
            keybinding: 'ctrlcmd+.'
        });

        registry.registerKeybinding({
            command: AIErrorRecoveryCommands.FIX_ALL.id,
            keybinding: 'ctrlcmd+shift+alt+.'
        });
    }

    protected async analyzeErrorAtCursor(): Promise<void> {
        const context = await this.getErrorContext();
        if (!context) {
            this.messageService.info('No error found at cursor position');
            return;
        }

        const analysis = await this.errorService.analyzeError(context);

        const items: QuickPickItem[] = [
            {
                label: `$(${getCategoryIcon(analysis.category)}) ${analysis.category.toUpperCase()} Error`,
                description: context.error.message
            },
            {
                label: '$(book) Explanation',
                detail: analysis.explanation
            },
            {
                label: '$(search) Root Cause',
                detail: analysis.rootCause
            },
            {
                label: '$(question) Why it happened',
                detail: analysis.whyItHappened
            }
        ];

        if (analysis.prevention) {
            items.push({
                label: '$(shield) Prevention',
                detail: analysis.prevention
            });
        }

        if (analysis.fixes.length > 0) {
            items.push({
                label: '--- Available Fixes ---',
                description: ''
            });

            for (const fix of analysis.fixes) {
                items.push({
                    label: `$(lightbulb) ${fix.title}`,
                    description: fix.confidence,
                    detail: fix.description,
                    id: fix.id
                });
            }
        }

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Error Analysis'
        });

        if (selected && selected.id) {
            const fix = analysis.fixes.find(f => f.id === selected.id);
            if (fix) {
                await this.applyFix(fix);
            }
        }
    }

    protected async showQuickFixes(): Promise<void> {
        const context = await this.getErrorContext();
        if (!context) {
            this.messageService.info('No error found at cursor position');
            return;
        }

        const fixes = await this.errorService.getQuickFixes(context);

        if (fixes.length === 0) {
            this.messageService.info('No quick fixes available');
            return;
        }

        const items: QuickPickItem[] = fixes.map(fix => ({
            label: `$(lightbulb) ${fix.title}`,
            description: fix.isPreferred ? '(Recommended)' : fix.confidence,
            detail: fix.description,
            id: fix.id
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Select a fix to apply'
        });

        if (selected && selected.id) {
            const fix = fixes.find(f => f.id === selected.id);
            if (fix) {
                await this.applyFix(fix);
            }
        }
    }

    protected async fixAllInFile(): Promise<void> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return;
        }

        const model = editor.getControl().getModel();
        if (!model) {
            return;
        }

        const result = await this.errorService.fixAllInFile(
            model.uri.toString(),
            model.getValue(),
            model.getLanguageId()
        );

        if (result.fixedCount > 0) {
            this.messageService.info(`Fixed ${result.fixedCount} error(s)`);
        } else {
            this.messageService.info('No auto-fixable errors found');
        }
    }

    protected async explainErrorCode(): Promise<void> {
        const code = await this.quickInputService.input({
            prompt: 'Enter error code (e.g., TS2304, ESLint/no-unused-vars)',
            placeHolder: 'Error code'
        });

        if (!code) {
            return;
        }

        const source = code.startsWith('TS') ? 'typescript' : 'eslint';
        const explanation = await this.errorService.explainErrorCode(code, source);

        const items: QuickPickItem[] = [
            {
                label: `$(info) ${explanation.title}`,
                detail: explanation.explanation
            },
            {
                label: '--- Common Causes ---',
                description: ''
            },
            ...explanation.commonCauses.map(cause => ({
                label: `$(warning) ${cause}`
            })),
            {
                label: '--- Solutions ---',
                description: ''
            },
            ...explanation.solutions.map(solution => ({
                label: `$(check) ${solution}`
            }))
        ];

        if (explanation.documentationUrl) {
            items.push({
                label: '$(link-external) Open Documentation',
                description: explanation.documentationUrl,
                id: 'open-docs'
            });
        }

        await this.quickInputService.showQuickPick(items, {
            placeholder: `Error Code: ${code}`
        });
    }

    protected async showStatistics(): Promise<void> {
        const errors = await this.getEditorErrors();

        if (errors.length === 0) {
            this.messageService.info('No errors in the current file');
            return;
        }

        const stats = await this.errorService.getStatistics(errors);

        const items: QuickPickItem[] = [
            {
                label: `$(error) Total Errors: ${stats.totalErrors}`,
                description: `${stats.bySeverity.error} errors, ${stats.bySeverity.warning} warnings`
            },
            {
                label: '--- By Category ---',
                description: ''
            },
            ...Object.entries(stats.byCategory).map(([cat, count]) => ({
                label: `$(${getCategoryIcon(cat as any)}) ${cat}: ${count}`
            })),
            {
                label: '--- Most Common ---',
                description: ''
            },
            ...stats.mostCommon.slice(0, 3).map(item => ({
                label: `$(info) ${item.message.slice(0, 50)}...`,
                description: `${item.count}x`
            }))
        ];

        await this.quickInputService.showQuickPick(items, {
            placeholder: 'Error Statistics'
        });
    }

    protected async explainStackTrace(): Promise<void> {
        const stackTrace = await this.quickInputService.input({
            prompt: 'Paste stack trace',
            placeHolder: 'Error: ...'
        });

        if (!stackTrace) {
            return;
        }

        const explanation = await this.errorService.explainStackTrace(stackTrace, 'javascript');

        const items: QuickPickItem[] = [
            {
                label: '$(error) Summary',
                detail: explanation.summary
            },
            {
                label: '$(search) Root Cause',
                detail: explanation.rootCause
            },
            {
                label: '--- Stack Frames ---',
                description: ''
            },
            ...explanation.relevantFrames.slice(0, 5).map(frame => ({
                label: `$(${frame.isUserCode ? 'file-code' : 'package'}) ${frame.function}`,
                description: `${frame.file}:${frame.line}`,
                detail: frame.explanation
            })),
            {
                label: '--- Suggested Fixes ---',
                description: ''
            },
            ...explanation.suggestedFixes.map(fix => ({
                label: `$(lightbulb) ${fix}`
            }))
        ];

        await this.quickInputService.showQuickPick(items, {
            placeholder: 'Stack Trace Analysis'
        });
    }

    protected async applyFix(fix: { id: string; title: string; edits: any[] }): Promise<void> {
        const result = await this.errorService.applyFix(fix as any);

        if (result.success) {
            this.messageService.info(result.message || `Applied: ${fix.title}`);
        } else {
            this.messageService.warn(result.message || 'Failed to apply fix');
        }
    }

    protected async getErrorContext(): Promise<ErrorContext | undefined> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return undefined;
        }

        const model = editor.getControl().getModel();
        const position = editor.getControl().getPosition();

        if (!model || !position) {
            return undefined;
        }

        const error: EditorError = {
            message: 'Error at cursor',
            severity: 'error',
            uri: model.uri.toString(),
            startLine: position.lineNumber,
            startColumn: position.column,
            endLine: position.lineNumber,
            endColumn: position.column
        };

        const lines = model.getValue().split('\n');
        const idx = position.lineNumber - 1;

        return {
            error,
            fileContent: model.getValue(),
            language: model.getLanguageId(),
            surroundingCode: {
                before: lines.slice(Math.max(0, idx - 3), idx),
                errorLine: lines[idx] || '',
                after: lines.slice(idx + 1, idx + 4)
            }
        };
    }

    protected async getEditorErrors(): Promise<EditorError[]> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return [];
        }

        const model = editor.getControl().getModel();
        if (!model) {
            return [];
        }

        return [];
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
