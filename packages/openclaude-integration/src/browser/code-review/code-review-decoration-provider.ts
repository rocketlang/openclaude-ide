// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import URI from '@theia/core/lib/common/uri';
import { CodeIssue } from '../../common/openclaude-protocol';
import { CodeReviewCodeActionProvider } from './code-review-code-action-provider';
import * as monaco from '@theia/monaco-editor-core';

/**
 * Severity level for decorations
 */
export enum DecorationSeverity {
    BLOCKER = 'blocker',
    CRITICAL = 'critical',
    MAJOR = 'major',
    MINOR = 'minor',
    INFO = 'info'
}

/**
 * Service for applying code review decorations to Monaco editor
 *
 * Provides:
 * - Squiggly underlines for issues
 * - Gutter icons for severity
 * - Hover tooltips with details
 */
@injectable()
export class CodeReviewDecorationProvider {

    @inject(EditorManager)
    protected readonly editorManager!: EditorManager;

    @inject(CodeReviewCodeActionProvider)
    @optional()
    protected readonly codeActionProvider?: CodeReviewCodeActionProvider;

    // Store decorations per file URI
    protected decorationsMap = new Map<string, string[]>();

    /**
     * Apply code review issues as decorations to editors
     */
    applyIssues(issues: CodeIssue[]): void {
        // Clear existing decorations
        this.clearAllDecorations();

        // Update code action provider with new issues
        if (this.codeActionProvider) {
            this.codeActionProvider.setIssues(issues);
        }

        // Group issues by file
        const issuesByFile = this.groupIssuesByFile(issues);

        // Apply decorations to each file
        for (const [filePath, fileIssues] of Object.entries(issuesByFile)) {
            this.applyDecorationsToFile(filePath, fileIssues);
        }
    }

    /**
     * Clear all decorations
     */
    clearAllDecorations(): void {
        for (const [uri, decorationIds] of this.decorationsMap.entries()) {
            const editor = this.getEditorForUri(uri);
            if (editor) {
                editor.getControl().deltaDecorations(decorationIds, []);
            }
        }
        this.decorationsMap.clear();
    }

    /**
     * Apply decorations to a specific file
     */
    protected applyDecorationsToFile(filePath: string, issues: CodeIssue[]): void {
        const editor = this.getEditorForUri(filePath);
        if (!editor) {
            // Editor not open, will apply when opened
            return;
        }

        const decorations = issues.map(issue => this.createDecoration(issue));
        const decorationIds = editor.getControl().deltaDecorations([], decorations);

        this.decorationsMap.set(filePath, decorationIds);
    }

    /**
     * Create Monaco decoration from code issue
     */
    protected createDecoration(issue: CodeIssue): monaco.editor.IModelDeltaDecoration {
        const severity = this.mapSeverity(issue.severity);
        const className = this.getDecorationClassName(severity);
        const glyphMarginClassName = this.getGlyphMarginClassName(severity);

        return {
            range: new monaco.Range(
                issue.line,
                issue.column || 1,
                issue.line,
                Number.MAX_SAFE_INTEGER // Extend to end of line
            ),
            options: {
                isWholeLine: false,
                className,
                glyphMarginClassName,
                glyphMarginHoverMessage: { value: this.createHoverMessage(issue) },
                hoverMessage: { value: this.createHoverMessage(issue) },
                minimap: {
                    color: this.getMinimapColor(severity),
                    position: monaco.editor.MinimapPosition.Inline
                },
                overviewRuler: {
                    color: this.getOverviewRulerColor(severity),
                    position: monaco.editor.OverviewRulerLane.Right
                }
            }
        };
    }

    /**
     * Create hover message for issue
     */
    protected createHoverMessage(issue: CodeIssue): string {
        let message = `**${issue.severity}**: ${issue.message}`;

        if (issue.category) {
            message += `\n\n*Category:* ${issue.category}`;
        }

        if (issue.suggestedFix) {
            message += `\n\n💡 **Suggested Fix:**\n${issue.suggestedFix}`;
        }

        if (issue.ruleId) {
            message += `\n\n*Rule:* \`${issue.ruleId}\``;
        }

        return message;
    }

    /**
     * Get CSS class name for decoration
     */
    protected getDecorationClassName(severity: DecorationSeverity): string {
        return `openclaude-code-review-decoration-${severity}`;
    }

    /**
     * Get CSS class name for gutter icon
     */
    protected getGlyphMarginClassName(severity: DecorationSeverity): string {
        return `openclaude-code-review-glyph-${severity}`;
    }

    /**
     * Get minimap color for severity
     */
    protected getMinimapColor(severity: DecorationSeverity): string {
        switch (severity) {
            case DecorationSeverity.BLOCKER:
            case DecorationSeverity.CRITICAL:
                return '#ff4444';
            case DecorationSeverity.MAJOR:
                return '#ffc800';
            case DecorationSeverity.MINOR:
                return '#64c8ff';
            case DecorationSeverity.INFO:
                return '#999999';
            default:
                return '#999999';
        }
    }

    /**
     * Get overview ruler color for severity
     */
    protected getOverviewRulerColor(severity: DecorationSeverity): string {
        return this.getMinimapColor(severity);
    }

    /**
     * Map API severity to decoration severity
     */
    protected mapSeverity(severity: string): DecorationSeverity {
        switch (severity) {
            case 'BLOCKER':
                return DecorationSeverity.BLOCKER;
            case 'CRITICAL':
                return DecorationSeverity.CRITICAL;
            case 'MAJOR':
                return DecorationSeverity.MAJOR;
            case 'MINOR':
                return DecorationSeverity.MINOR;
            case 'INFO':
                return DecorationSeverity.INFO;
            default:
                return DecorationSeverity.INFO;
        }
    }

    /**
     * Group issues by file path
     */
    protected groupIssuesByFile(issues: CodeIssue[]): Record<string, CodeIssue[]> {
        return issues.reduce((acc, issue) => {
            if (!acc[issue.file]) {
                acc[issue.file] = [];
            }
            acc[issue.file].push(issue);
            return acc;
        }, {} as Record<string, CodeIssue[]>);
    }

    /**
     * Get Monaco editor for URI
     */
    protected getEditorForUri(uri: string): MonacoEditor | undefined {
        const theiaUri = new URI(uri);
        const editors = this.editorManager.all;

        for (const editor of editors) {
            if (editor instanceof MonacoEditor && editor.uri.toString() === theiaUri.toString()) {
                return editor;
            }
        }

        return undefined;
    }
}
