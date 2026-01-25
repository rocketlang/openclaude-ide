// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { CodeIssue } from '../../common/openclaude-protocol';
import * as monaco from '@theia/monaco-editor-core';

/**
 * Code Action Provider for OpenClaude code review quick fixes
 *
 * Provides lightbulb quick fixes for code review issues
 */
@injectable()
export class CodeReviewCodeActionProvider implements monaco.languages.CodeActionProvider {

    @postConstruct()
    protected init(): void {
        // Register this provider with Monaco for all languages
        monaco.languages.registerCodeActionProvider('*', this);
    }

    // Store issues for quick access
    protected issuesMap = new Map<string, CodeIssue[]>();

    /**
     * Update issues for code actions
     */
    setIssues(issues: CodeIssue[]): void {
        this.issuesMap.clear();

        // Group issues by file
        for (const issue of issues) {
            if (!this.issuesMap.has(issue.file)) {
                this.issuesMap.set(issue.file, []);
            }
            this.issuesMap.get(issue.file)!.push(issue);
        }
    }

    /**
     * Provide code actions for a given range
     */
    provideCodeActions(
        model: monaco.editor.ITextModel,
        range: monaco.Range,
        context: monaco.languages.CodeActionContext,
        token: monaco.CancellationToken
    ): monaco.languages.ProviderResult<monaco.languages.CodeActionList> {
        const uri = model.uri.toString();
        const issues = this.issuesMap.get(uri) || [];

        // Find issues at the current line
        const lineIssues = issues.filter(issue => {
            return issue.line >= range.startLineNumber && issue.line <= range.endLineNumber;
        });

        if (lineIssues.length === 0) {
            return { actions: [], dispose: () => {} };
        }

        const actions: monaco.languages.CodeAction[] = [];

        // Create code action for each issue with a suggested fix
        for (const issue of lineIssues) {
            if (issue.suggestedFix) {
                actions.push({
                    title: `💡 ${issue.suggestedFix}`,
                    kind: 'quickfix',
                    diagnostics: [],
                    edit: {
                        edits: [{
                            resource: model.uri,
                            textEdit: {
                                range: new monaco.Range(
                                    issue.line,
                                    issue.column || 1,
                                    issue.line,
                                    model.getLineMaxColumn(issue.line)
                                ),
                                text: issue.suggestedFix
                            },
                            versionId: model.getVersionId()
                        }]
                    }
                });
            }

            // Add action to view issue details
            actions.push({
                title: `ℹ️ View details: ${issue.severity} - ${issue.message.substring(0, 50)}...`,
                kind: 'quickfix',
                diagnostics: [],
                command: {
                    id: 'openclaude.showCodeReviewPanel',
                    title: 'Show Code Review Panel'
                }
            });
        }

        return {
            actions,
            dispose: () => {}
        };
    }
}
