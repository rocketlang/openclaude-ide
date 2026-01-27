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
    AICodeReviewService,
    ReviewIssue,
    ReviewResult,
    ReviewOptions,
    getSeverityIcon,
    getCategoryIcon,
    getSeverityColor,
    sortIssuesBySeverity
} from '../common/ai-code-review-protocol';

export namespace AICodeReviewCommands {
    export const REVIEW_FILE: Command = {
        id: 'ai-code-review.review-file',
        label: 'AI: Review Current File',
        category: 'AI'
    };

    export const REVIEW_SELECTION: Command = {
        id: 'ai-code-review.review-selection',
        label: 'AI: Review Selection',
        category: 'AI'
    };

    export const REVIEW_ALL: Command = {
        id: 'ai-code-review.review-all',
        label: 'AI: Review All Open Files',
        category: 'AI'
    };

    export const SHOW_ISSUES: Command = {
        id: 'ai-code-review.show-issues',
        label: 'AI: Show Review Issues',
        category: 'AI'
    };

    export const NEXT_ISSUE: Command = {
        id: 'ai-code-review.next-issue',
        label: 'AI: Go to Next Issue',
        category: 'AI'
    };

    export const PREV_ISSUE: Command = {
        id: 'ai-code-review.prev-issue',
        label: 'AI: Go to Previous Issue',
        category: 'AI'
    };

    export const REVIEW_SUMMARY: Command = {
        id: 'ai-code-review.summary',
        label: 'AI: Show Review Summary',
        category: 'AI'
    };

    export const DISMISS_ISSUE: Command = {
        id: 'ai-code-review.dismiss',
        label: 'AI: Dismiss Issue',
        category: 'AI'
    };
}

@injectable()
export class AICodeReviewContribution implements CommandContribution, MenuContribution, KeybindingContribution {
    @inject(AICodeReviewService)
    protected readonly reviewService: AICodeReviewService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected currentIssues: ReviewIssue[] = [];
    protected currentIssueIndex: number = 0;
    protected lastReview: ReviewResult | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AICodeReviewCommands.REVIEW_FILE, {
            execute: () => this.reviewCurrentFile(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AICodeReviewCommands.REVIEW_SELECTION, {
            execute: () => this.reviewSelection(),
            isEnabled: () => this.hasActiveEditor()
        });

        registry.registerCommand(AICodeReviewCommands.REVIEW_ALL, {
            execute: () => this.reviewAllOpenFiles(),
            isEnabled: () => true
        });

        registry.registerCommand(AICodeReviewCommands.SHOW_ISSUES, {
            execute: () => this.showIssues(),
            isEnabled: () => this.currentIssues.length > 0
        });

        registry.registerCommand(AICodeReviewCommands.NEXT_ISSUE, {
            execute: () => this.goToNextIssue(),
            isEnabled: () => this.currentIssues.length > 0
        });

        registry.registerCommand(AICodeReviewCommands.PREV_ISSUE, {
            execute: () => this.goToPrevIssue(),
            isEnabled: () => this.currentIssues.length > 0
        });

        registry.registerCommand(AICodeReviewCommands.REVIEW_SUMMARY, {
            execute: () => this.showReviewSummary(),
            isEnabled: () => this.lastReview !== undefined
        });

        registry.registerCommand(AICodeReviewCommands.DISMISS_ISSUE, {
            execute: () => this.dismissCurrentIssue(),
            isEnabled: () => this.currentIssues.length > 0
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AICodeReviewCommands.REVIEW_FILE.id,
            label: 'AI: Review File',
            order: '1'
        });

        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AICodeReviewCommands.REVIEW_SELECTION.id,
            label: 'AI: Review Selection',
            order: '2'
        });

        registry.registerMenuAction(['editor_context_menu', 'ai'], {
            commandId: AICodeReviewCommands.SHOW_ISSUES.id,
            label: 'AI: Show Issues',
            order: '3'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: AICodeReviewCommands.REVIEW_FILE.id,
            keybinding: 'ctrlcmd+shift+r'
        });

        registry.registerKeybinding({
            command: AICodeReviewCommands.SHOW_ISSUES.id,
            keybinding: 'ctrlcmd+shift+i'
        });

        registry.registerKeybinding({
            command: AICodeReviewCommands.NEXT_ISSUE.id,
            keybinding: 'f8'
        });

        registry.registerKeybinding({
            command: AICodeReviewCommands.PREV_ISSUE.id,
            keybinding: 'shift+f8'
        });
    }

    protected async reviewCurrentFile(): Promise<void> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return;
        }

        const model = editor.getControl().getModel();
        if (!model) {
            return;
        }

        this.messageService.info('Reviewing file...');

        const options: ReviewOptions = {
            includeExplanations: true,
            includeFixes: true,
            checkSecurity: true,
            checkPerformance: true
        };

        const issues = await this.reviewService.reviewFile(
            model.uri.toString(),
            model.getValue(),
            model.getLanguageId(),
            options
        );

        this.currentIssues = sortIssuesBySeverity(issues);
        this.currentIssueIndex = 0;

        if (issues.length === 0) {
            this.messageService.info('No issues found! Code looks good.');
        } else {
            this.messageService.warn(`Found ${issues.length} issue(s)`);
            await this.showIssues();
        }
    }

    protected async reviewSelection(): Promise<void> {
        const editor = this.getCurrentMonacoEditor();
        if (!editor) {
            return;
        }

        const model = editor.getControl().getModel();
        const selection = editor.getControl().getSelection();

        if (!model || !selection) {
            return;
        }

        const options: ReviewOptions = {
            includeExplanations: true,
            includeFixes: true,
            checkSecurity: true,
            checkPerformance: true
        };

        const issues = await this.reviewService.reviewSelection(
            model.uri.toString(),
            model.getValue(),
            selection.startLineNumber,
            selection.endLineNumber,
            model.getLanguageId(),
            options
        );

        this.currentIssues = sortIssuesBySeverity(issues);
        this.currentIssueIndex = 0;

        if (issues.length === 0) {
            this.messageService.info('No issues in selection!');
        } else {
            this.messageService.warn(`Found ${issues.length} issue(s) in selection`);
            await this.showIssues();
        }
    }

    protected async reviewAllOpenFiles(): Promise<void> {
        const files: string[] = [];
        const content: Record<string, string> = {};

        for (const widget of this.editorManager.all) {
            const editor = widget.editor;
            if (this.isMonacoEditor(editor)) {
                const model = (editor as MonacoEditor).getControl().getModel();
                if (model) {
                    const uri = model.uri.toString();
                    files.push(uri);
                    content[uri] = model.getValue();
                }
            }
        }

        if (files.length === 0) {
            this.messageService.info('No files open to review');
            return;
        }

        this.messageService.info(`Reviewing ${files.length} file(s)...`);

        const result = await this.reviewService.startReview({
            files,
            content,
            options: {
                includeExplanations: true,
                includeFixes: true,
                checkSecurity: true,
                checkPerformance: true
            }
        });

        this.lastReview = result;
        this.currentIssues = sortIssuesBySeverity(result.issues);
        this.currentIssueIndex = 0;

        await this.showReviewSummary();
    }

    protected async showIssues(): Promise<void> {
        if (this.currentIssues.length === 0) {
            this.messageService.info('No issues to display');
            return;
        }

        const items: QuickPickItem[] = this.currentIssues.map((issue, index) => ({
            label: `$(${getSeverityIcon(issue.severity)}) ${issue.title}`,
            description: `${issue.severity.toUpperCase()} - Line ${issue.startLine}`,
            detail: issue.message,
            id: index.toString()
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: `${this.currentIssues.length} issue(s) found`
        });

        if (selected && selected.id) {
            const index = parseInt(selected.id, 10);
            this.currentIssueIndex = index;
            await this.goToIssue(this.currentIssues[index]);
        }
    }

    protected async showReviewSummary(): Promise<void> {
        if (!this.lastReview) {
            this.messageService.info('No review results available');
            return;
        }

        const summary = this.lastReview.summary;

        const items: QuickPickItem[] = [
            {
                label: `$(graph) Grade: ${summary.grade || 'N/A'}`,
                description: `Score: ${summary.score?.toFixed(0) || 'N/A'}/100`
            },
            {
                label: `$(file) Files Reviewed: ${summary.filesReviewed}`,
                description: `${summary.linesReviewed} lines`
            },
            {
                label: '--- Issues by Severity ---',
                description: ''
            },
            {
                label: `$(error) Blocker: ${summary.bySeverity.blocker}`,
                description: getSeverityColor('blocker')
            },
            {
                label: `$(flame) Critical: ${summary.bySeverity.critical}`,
                description: getSeverityColor('critical')
            },
            {
                label: `$(warning) Major: ${summary.bySeverity.major}`,
                description: getSeverityColor('major')
            },
            {
                label: `$(info) Minor: ${summary.bySeverity.minor}`,
                description: getSeverityColor('minor')
            },
            {
                label: `$(lightbulb) Info: ${summary.bySeverity.info}`,
                description: getSeverityColor('info')
            },
            {
                label: '--- Top Categories ---',
                description: ''
            }
        ];

        // Add top categories
        const topCategories = Object.entries(summary.byCategory)
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        for (const [category, count] of topCategories) {
            items.push({
                label: `$(${getCategoryIcon(category as any)}) ${category}: ${count}`,
                description: ''
            });
        }

        // Add recommendations
        if (summary.recommendations && summary.recommendations.length > 0) {
            items.push({
                label: '--- Recommendations ---',
                description: ''
            });

            for (const rec of summary.recommendations) {
                items.push({
                    label: `$(checklist) ${rec}`,
                    description: ''
                });
            }
        }

        await this.quickInputService.showQuickPick(items, {
            placeholder: `Review Summary - ${summary.totalIssues} total issue(s)`
        });
    }

    protected async goToNextIssue(): Promise<void> {
        if (this.currentIssues.length === 0) {
            return;
        }

        this.currentIssueIndex = (this.currentIssueIndex + 1) % this.currentIssues.length;
        await this.goToIssue(this.currentIssues[this.currentIssueIndex]);
    }

    protected async goToPrevIssue(): Promise<void> {
        if (this.currentIssues.length === 0) {
            return;
        }

        this.currentIssueIndex = (this.currentIssueIndex - 1 + this.currentIssues.length) % this.currentIssues.length;
        await this.goToIssue(this.currentIssues[this.currentIssueIndex]);
    }

    protected async goToIssue(issue: ReviewIssue): Promise<void> {
        const items: QuickPickItem[] = [
            {
                label: `$(${getSeverityIcon(issue.severity)}) ${issue.severity.toUpperCase()}: ${issue.title}`,
                description: `${issue.category}`
            },
            {
                label: '$(comment) Message',
                detail: issue.message
            }
        ];

        if (issue.explanation) {
            items.push({
                label: '$(question) Explanation',
                detail: issue.explanation
            });
        }

        if (issue.code) {
            items.push({
                label: '$(code) Code',
                detail: issue.code
            });
        }

        if (issue.rule) {
            items.push({
                label: `$(law) Rule: ${issue.rule}`,
                description: ''
            });
        }

        if (issue.suggestedFix) {
            items.push({
                label: `$(lightbulb) Fix: ${issue.suggestedFix.title}`,
                description: `Confidence: ${issue.suggestedFix.confidence}`,
                detail: issue.suggestedFix.description,
                id: 'apply-fix'
            });
        }

        items.push({
            label: '$(x) Dismiss Issue',
            description: 'Mark as reviewed',
            id: 'dismiss'
        });

        const position = this.currentIssueIndex + 1;
        const total = this.currentIssues.length;

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: `Issue ${position}/${total} at line ${issue.startLine}`
        });

        if (selected) {
            if (selected.id === 'apply-fix' && issue.suggestedFix) {
                const result = await this.reviewService.applyFix(issue);
                if (result.success) {
                    this.messageService.info(result.message || 'Fix applied');
                    this.currentIssues = this.currentIssues.filter(i => i.id !== issue.id);
                } else {
                    this.messageService.warn(result.message || 'Failed to apply fix');
                }
            } else if (selected.id === 'dismiss') {
                await this.dismissCurrentIssue();
            }
        }
    }

    protected async dismissCurrentIssue(): Promise<void> {
        if (this.currentIssues.length === 0) {
            return;
        }

        const issue = this.currentIssues[this.currentIssueIndex];
        await this.reviewService.dismissIssue(issue.id);
        this.currentIssues = this.currentIssues.filter(i => i.id !== issue.id);
        this.messageService.info('Issue dismissed');

        if (this.currentIssueIndex >= this.currentIssues.length) {
            this.currentIssueIndex = Math.max(0, this.currentIssues.length - 1);
        }
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
