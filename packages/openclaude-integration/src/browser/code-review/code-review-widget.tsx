// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core';
import { OpenClaudeBackendService, CodeReview, CodeIssue } from '../../common/openclaude-protocol';
import { CodeReviewDecorationProvider } from './code-review-decoration-provider';

export const CODE_REVIEW_WIDGET_ID = 'openclaude-code-review';
export const CODE_REVIEW_WIDGET_LABEL = 'Code Review';

/**
 * Code Review Panel Widget
 *
 * Displays AI-powered code review results with:
 * - Issue list grouped by severity
 * - File navigation
 * - Inline fix suggestions
 * - Review summary statistics
 */
@injectable()
export class CodeReviewWidget extends ReactWidget {

    static readonly ID = CODE_REVIEW_WIDGET_ID;
    static readonly LABEL = CODE_REVIEW_WIDGET_LABEL;

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    @inject(CodeReviewDecorationProvider)
    protected readonly decorationProvider!: CodeReviewDecorationProvider;

    protected currentReview: CodeReview | undefined;
    protected loading = false;

    @postConstruct()
    protected init(): void {
        this.id = CodeReviewWidget.ID;
        this.title.label = CodeReviewWidget.LABEL;
        this.title.caption = CodeReviewWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-check-circle';

        this.update();
    }

    /**
     * Start a new code review
     */
    async startReview(files: string[]): Promise<void> {
        this.loading = true;
        this.update();

        try {
            this.currentReview = await this.backendService.startCodeReview(files);
            this.messageService.info(`Code review started: ${this.currentReview.id}`);

            // Poll for results
            this.pollReviewStatus(this.currentReview.id);
        } catch (error) {
            this.messageService.error(`Failed to start review: ${error}`);
            this.loading = false;
            this.update();
        }
    }

    /**
     * Poll for review completion
     */
    protected async pollReviewStatus(reviewId: string): Promise<void> {
        const pollInterval = 2000; // 2 seconds
        const maxAttempts = 30; // 1 minute max
        let attempts = 0;

        const poll = async () => {
            try {
                this.currentReview = await this.backendService.getCodeReview(reviewId);

                if (this.currentReview.status === 'completed' || this.currentReview.status === 'failed') {
                    this.loading = false;
                    this.update();

                    if (this.currentReview.status === 'completed') {
                        this.messageService.info(`Code review completed with ${this.currentReview.issues.length} issues`);
                        // Apply decorations to editors
                        this.decorationProvider.applyIssues(this.currentReview.issues);
                    } else {
                        this.messageService.error('Code review failed');
                    }
                    return;
                }

                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, pollInterval);
                } else {
                    this.loading = false;
                    this.messageService.warn('Review timed out');
                    this.update();
                }
            } catch (error) {
                this.loading = false;
                this.messageService.error(`Failed to get review: ${error}`);
                this.update();
            }
        };

        poll();
    }

    /**
     * Render the widget
     */
    protected render(): React.ReactNode {
        return (
            <div className='openclaude-code-review'>
                {this.renderHeader()}
                {this.loading && this.renderLoading()}
                {!this.loading && this.currentReview && this.renderReview()}
                {!this.loading && !this.currentReview && this.renderEmpty()}
            </div>
        );
    }

    /**
     * Render header
     */
    protected renderHeader(): React.ReactNode {
        return (
            <div className='openclaude-review-header'>
                <h3>
                    <i className='fa fa-check-circle'></i>
                    {' AI Code Review'}
                </h3>
                {this.currentReview && (
                    <div className='review-id'>
                        Review #{this.currentReview.id}
                    </div>
                )}
            </div>
        );
    }

    /**
     * Render loading state
     */
    protected renderLoading(): React.ReactNode {
        return (
            <div className='openclaude-review-loading'>
                <div className='spinner'></div>
                <p>Analyzing code...</p>
            </div>
        );
    }

    /**
     * Render empty state
     */
    protected renderEmpty(): React.ReactNode {
        return (
            <div className='openclaude-review-empty'>
                <i className='fa fa-code fa-3x'></i>
                <h4>No active review</h4>
                <p>Start a code review from the command palette:</p>
                <code>OpenClaude: Start Code Review</code>
            </div>
        );
    }

    /**
     * Render review results
     */
    protected renderReview(): React.ReactNode {
        if (!this.currentReview) {
            return null;
        }

        return (
            <div className='openclaude-review-content'>
                {this.renderSummary()}
                {this.renderIssues()}
            </div>
        );
    }

    /**
     * Render review summary
     */
    protected renderSummary(): React.ReactNode {
        if (!this.currentReview?.summary) {
            return null;
        }

        const { summary } = this.currentReview;

        return (
            <div className='openclaude-review-summary'>
                <h4>Summary</h4>
                <div className='summary-stats'>
                    <div className='stat'>
                        <span className='label'>Total Issues:</span>
                        <span className='value'>{summary.totalIssues}</span>
                    </div>
                    <div className='stat'>
                        <span className='label'>Files Reviewed:</span>
                        <span className='value'>{summary.filesReviewed}</span>
                    </div>
                </div>
                <div className='severity-breakdown'>
                    {summary.blockers > 0 && (
                        <div className='severity-item blocker'>
                            <i className='fa fa-exclamation-triangle'></i>
                            {summary.blockers} Blocker{summary.blockers > 1 ? 's' : ''}
                        </div>
                    )}
                    {summary.critical > 0 && (
                        <div className='severity-item critical'>
                            <i className='fa fa-times-circle'></i>
                            {summary.critical} Critical
                        </div>
                    )}
                    {summary.major > 0 && (
                        <div className='severity-item major'>
                            <i className='fa fa-exclamation-circle'></i>
                            {summary.major} Major
                        </div>
                    )}
                    {summary.minor > 0 && (
                        <div className='severity-item minor'>
                            <i className='fa fa-info-circle'></i>
                            {summary.minor} Minor
                        </div>
                    )}
                    {summary.info > 0 && (
                        <div className='severity-item info'>
                            <i className='fa fa-lightbulb-o'></i>
                            {summary.info} Info
                        </div>
                    )}
                </div>
            </div>
        );
    }

    /**
     * Render issues list
     */
    protected renderIssues(): React.ReactNode {
        if (!this.currentReview?.issues || this.currentReview.issues.length === 0) {
            return (
                <div className='openclaude-review-no-issues'>
                    <i className='fa fa-check-circle fa-2x' style={{ color: 'green' }}></i>
                    <h4>No issues found!</h4>
                    <p>Your code looks great!</p>
                </div>
            );
        }

        // Group issues by file
        const issuesByFile = this.groupIssuesByFile(this.currentReview.issues);

        return (
            <div className='openclaude-review-issues'>
                <h4>Issues ({this.currentReview.issues.length})</h4>
                {Object.entries(issuesByFile).map(([file, issues]) => (
                    <div key={file} className='file-issues'>
                        <div className='file-header'>
                            <i className='fa fa-file-code-o'></i>
                            <span className='file-name'>{file}</span>
                            <span className='issue-count'>{issues.length}</span>
                        </div>
                        <div className='issues-list'>
                            {issues.map((issue, idx) => this.renderIssue(issue, idx))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    /**
     * Render individual issue
     */
    protected renderIssue(issue: CodeIssue, index: number): React.ReactNode {
        const severityClass = issue.severity.toLowerCase();
        const severityIcon = this.getSeverityIcon(issue.severity);

        return (
            <div key={index} className={`issue-item severity-${severityClass}`}>
                <div className='issue-header'>
                    <i className={severityIcon}></i>
                    <span className='severity'>{issue.severity}</span>
                    <span className='location'>Line {issue.line}</span>
                    {issue.category && (
                        <span className='category'>{issue.category}</span>
                    )}
                </div>
                <div className='issue-message'>{issue.message}</div>
                {issue.suggestedFix && (
                    <div className='issue-fix'>
                        <i className='fa fa-lightbulb-o'></i>
                        <strong>Suggested fix:</strong> {issue.suggestedFix}
                    </div>
                )}
                {issue.ruleId && (
                    <div className='issue-rule'>
                        Rule: <code>{issue.ruleId}</code>
                    </div>
                )}
            </div>
        );
    }

    /**
     * Get icon for severity
     */
    protected getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'BLOCKER':
                return 'fa fa-ban';
            case 'CRITICAL':
                return 'fa fa-times-circle';
            case 'MAJOR':
                return 'fa fa-exclamation-circle';
            case 'MINOR':
                return 'fa fa-info-circle';
            case 'INFO':
                return 'fa fa-lightbulb-o';
            default:
                return 'fa fa-circle';
        }
    }

    /**
     * Group issues by file
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
}
