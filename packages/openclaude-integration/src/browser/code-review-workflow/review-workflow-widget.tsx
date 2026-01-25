// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core';
import { OpenClaudeBackendService, CodeReviewWorkflow, ReviewStatus, ReviewPriority, Reviewer, ReviewFile, ChatUser } from '../../common/openclaude-protocol';

/**
 * Widget for managing code review workflows
 */
@injectable()
export class ReviewWorkflowWidget extends ReactWidget {

    static readonly ID = 'openclaude-review-workflow';
    static readonly LABEL = 'Code Reviews';

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    protected reviews: CodeReviewWorkflow[] = [];
    protected selectedReview: CodeReviewWorkflow | undefined;
    protected filterStatus: ReviewStatus | 'all' = 'all';
    protected filterPriority: ReviewPriority | 'all' = 'all';

    @postConstruct()
    protected init(): void {
        this.id = ReviewWorkflowWidget.ID;
        this.title.label = ReviewWorkflowWidget.LABEL;
        this.title.caption = ReviewWorkflowWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-code-fork';

        this.loadReviews();
        this.update();
    }

    /**
     * Load reviews
     */
    async loadReviews(): Promise<void> {
        try {
            const filters = {
                status: this.filterStatus !== 'all' ? this.filterStatus : undefined,
                priority: this.filterPriority !== 'all' ? this.filterPriority : undefined
            };

            this.reviews = await this.backendService.getReviews(filters);
            this.update();
        } catch (error) {
            console.error('[OpenClaude] Failed to load reviews:', error);
        }
    }

    /**
     * Select a review
     */
    protected selectReview = async (reviewId: string): Promise<void> => {
        try {
            this.selectedReview = await this.backendService.getReview(reviewId);
            this.update();
        } catch (error) {
            this.messageService.error(`Failed to load review: ${error}`);
        }
    }

    /**
     * Approve review
     */
    protected approveReview = async (reviewId: string): Promise<void> => {
        try {
            const decision = {
                type: 'approve' as const,
                comment: 'Looks good!',
                timestamp: Date.now()
            };

            await this.backendService.submitReview(reviewId, decision);
            await this.loadReviews();
            if (this.selectedReview?.id === reviewId) {
                await this.selectReview(reviewId);
            }
            this.messageService.info('✅ Review approved');
        } catch (error) {
            this.messageService.error(`Failed to approve review: ${error}`);
        }
    }

    /**
     * Request changes
     */
    protected requestChanges = async (reviewId: string, comment: string): Promise<void> => {
        try {
            const decision = {
                type: 'request_changes' as const,
                comment,
                timestamp: Date.now()
            };

            await this.backendService.submitReview(reviewId, decision);
            await this.loadReviews();
            if (this.selectedReview?.id === reviewId) {
                await this.selectReview(reviewId);
            }
            this.messageService.info('🔄 Changes requested');
        } catch (error) {
            this.messageService.error(`Failed to request changes: ${error}`);
        }
    }

    /**
     * Reject review
     */
    protected rejectReview = async (reviewId: string, comment: string): Promise<void> => {
        try {
            const decision = {
                type: 'reject' as const,
                comment,
                timestamp: Date.now()
            };

            await this.backendService.submitReview(reviewId, decision);
            await this.loadReviews();
            if (this.selectedReview?.id === reviewId) {
                await this.selectReview(reviewId);
            }
            this.messageService.info('❌ Review rejected');
        } catch (error) {
            this.messageService.error(`Failed to reject review: ${error}`);
        }
    }

    /**
     * Filter reviews
     */
    protected handleFilterChange = (type: 'status' | 'priority', value: string): void => {
        if (type === 'status') {
            this.filterStatus = value as ReviewStatus | 'all';
        } else {
            this.filterPriority = value as ReviewPriority | 'all';
        }
        this.loadReviews();
    }

    /**
     * Get status icon
     */
    protected getStatusIcon(status: ReviewStatus): string {
        switch (status) {
            case 'pending': return 'fa fa-clock-o';
            case 'in_review': return 'fa fa-eye';
            case 'approved': return 'fa fa-check-circle';
            case 'changes_requested': return 'fa fa-refresh';
            case 'rejected': return 'fa fa-times-circle';
            default: return 'fa fa-question-circle';
        }
    }

    /**
     * Get status color
     */
    protected getStatusColor(status: ReviewStatus): string {
        switch (status) {
            case 'pending': return '#ff9800';
            case 'in_review': return '#2196f3';
            case 'approved': return '#4caf50';
            case 'changes_requested': return '#ff9800';
            case 'rejected': return '#f44336';
            default: return 'var(--theia-foreground)';
        }
    }

    /**
     * Get priority icon
     */
    protected getPriorityIcon(priority: ReviewPriority): string {
        switch (priority) {
            case 'low': return 'fa fa-arrow-down';
            case 'medium': return 'fa fa-minus';
            case 'high': return 'fa fa-arrow-up';
            case 'critical': return 'fa fa-exclamation-triangle';
            default: return 'fa fa-minus';
        }
    }

    /**
     * Get priority color
     */
    protected getPriorityColor(priority: ReviewPriority): string {
        switch (priority) {
            case 'low': return '#9e9e9e';
            case 'medium': return '#2196f3';
            case 'high': return '#ff9800';
            case 'critical': return '#f44336';
            default: return 'var(--theia-foreground)';
        }
    }

    /**
     * Format timestamp
     */
    protected formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    /**
     * Get user initials
     */
    protected getUserInitials(user: ChatUser): string {
        return user.name
            .split(' ')
            .map(part => part[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    protected render(): React.ReactNode {
        return (
            <div className='openclaude-review-workflow'>
                {this.renderHeader()}
                <div className='review-content'>
                    {this.renderSidebar()}
                    {this.selectedReview ? this.renderReviewDetail() : this.renderEmptyState()}
                </div>
            </div>
        );
    }

    protected renderHeader(): React.ReactNode {
        return (
            <div className='review-header'>
                <h3>Code Reviews</h3>
                <div className='review-filters'>
                    <select
                        className='theia-select'
                        value={this.filterStatus}
                        onChange={(e) => this.handleFilterChange('status', e.target.value)}
                    >
                        <option value='all'>All Status</option>
                        <option value='pending'>Pending</option>
                        <option value='in_review'>In Review</option>
                        <option value='approved'>Approved</option>
                        <option value='changes_requested'>Changes Requested</option>
                        <option value='rejected'>Rejected</option>
                    </select>
                    <select
                        className='theia-select'
                        value={this.filterPriority}
                        onChange={(e) => this.handleFilterChange('priority', e.target.value)}
                    >
                        <option value='all'>All Priority</option>
                        <option value='low'>Low</option>
                        <option value='medium'>Medium</option>
                        <option value='high'>High</option>
                        <option value='critical'>Critical</option>
                    </select>
                </div>
            </div>
        );
    }

    protected renderSidebar(): React.ReactNode {
        return (
            <div className='review-sidebar'>
                <div className='sidebar-header'>
                    <span className='review-count'>{this.reviews.length} review{this.reviews.length !== 1 ? 's' : ''}</span>
                </div>
                <div className='review-list'>
                    {this.reviews.length === 0 ? (
                        <div className='no-reviews'>
                            <i className='fa fa-inbox'></i>
                            <p>No reviews found</p>
                        </div>
                    ) : (
                        this.reviews.map(review => this.renderReviewItem(review))
                    )}
                </div>
            </div>
        );
    }

    protected renderReviewItem(review: CodeReviewWorkflow): React.ReactNode {
        const isSelected = this.selectedReview?.id === review.id;

        return (
            <div
                key={review.id}
                className={`review-item ${isSelected ? 'selected' : ''}`}
                onClick={() => this.selectReview(review.id)}
            >
                <div className='review-item-header'>
                    <span className='review-title'>{review.title}</span>
                    <span
                        className='review-status-badge'
                        style={{ color: this.getStatusColor(review.status) }}
                    >
                        <i className={this.getStatusIcon(review.status)}></i>
                    </span>
                </div>
                <div className='review-item-meta'>
                    <span className='review-author'>{review.author.name}</span>
                    <span className='review-date'>{this.formatTimestamp(review.createdAt)}</span>
                </div>
                <div className='review-item-stats'>
                    <span className='stat'>
                        <i className='fa fa-file-code-o'></i>
                        {review.files.length} file{review.files.length !== 1 ? 's' : ''}
                    </span>
                    <span className='stat'>
                        <i className='fa fa-users'></i>
                        {review.reviewers.length} reviewer{review.reviewers.length !== 1 ? 's' : ''}
                    </span>
                    <span
                        className='priority-badge'
                        style={{ color: this.getPriorityColor(review.priority) }}
                    >
                        <i className={this.getPriorityIcon(review.priority)}></i>
                        {review.priority}
                    </span>
                </div>
            </div>
        );
    }

    protected renderReviewDetail(): React.ReactNode {
        if (!this.selectedReview) {
            return null;
        }

        return (
            <div className='review-detail'>
                {this.renderReviewHeader()}
                {this.renderReviewFiles()}
                {this.renderReviewers()}
                {this.renderReviewActions()}
            </div>
        );
    }

    protected renderReviewHeader(): React.ReactNode {
        if (!this.selectedReview) {
            return null;
        }

        const review = this.selectedReview;

        return (
            <div className='review-detail-header'>
                <div className='review-title-section'>
                    <h2>{review.title}</h2>
                    <div className='review-badges'>
                        <span
                            className='status-badge'
                            style={{ background: this.getStatusColor(review.status) }}
                        >
                            <i className={this.getStatusIcon(review.status)}></i>
                            {review.status.replace('_', ' ')}
                        </span>
                        <span
                            className='priority-badge'
                            style={{ color: this.getPriorityColor(review.priority) }}
                        >
                            <i className={this.getPriorityIcon(review.priority)}></i>
                            {review.priority}
                        </span>
                    </div>
                </div>
                <div className='review-description'>{review.description}</div>
                <div className='review-metadata'>
                    <div className='metadata-item'>
                        <i className='fa fa-user'></i>
                        <span>Created by {review.author.name}</span>
                    </div>
                    <div className='metadata-item'>
                        <i className='fa fa-clock-o'></i>
                        <span>{this.formatTimestamp(review.createdAt)}</span>
                    </div>
                    {review.dueDate && (
                        <div className='metadata-item'>
                            <i className='fa fa-calendar'></i>
                            <span>Due {this.formatTimestamp(review.dueDate)}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    protected renderReviewFiles(): React.ReactNode {
        if (!this.selectedReview) {
            return null;
        }

        return (
            <div className='review-files-section'>
                <h4>
                    <i className='fa fa-file-code-o'></i>
                    Files Changed ({this.selectedReview.files.length})
                </h4>
                <div className='files-list'>
                    {this.selectedReview.files.map(file => this.renderFileItem(file))}
                </div>
            </div>
        );
    }

    protected renderFileItem(file: ReviewFile): React.ReactNode {
        return (
            <div key={file.path} className='file-item'>
                <div className='file-path'>{file.path}</div>
                <div className='file-stats'>
                    <span className='stat added'>+{file.linesAdded}</span>
                    <span className='stat removed'>-{file.linesRemoved}</span>
                    <span className='stat changes'>{file.changesCount} changes</span>
                </div>
            </div>
        );
    }

    protected renderReviewers(): React.ReactNode {
        if (!this.selectedReview) {
            return null;
        }

        return (
            <div className='reviewers-section'>
                <h4>
                    <i className='fa fa-users'></i>
                    Reviewers ({this.selectedReview.reviewers.length})
                </h4>
                <div className='reviewers-list'>
                    {this.selectedReview.reviewers.map(reviewer => this.renderReviewerItem(reviewer))}
                </div>
            </div>
        );
    }

    protected renderReviewerItem(reviewer: Reviewer): React.ReactNode {
        return (
            <div key={reviewer.user.id} className='reviewer-item'>
                <div className='reviewer-avatar'>
                    {reviewer.user.avatar ? (
                        <img src={reviewer.user.avatar} alt={reviewer.user.name} />
                    ) : (
                        <div className='avatar-initials'>{this.getUserInitials(reviewer.user)}</div>
                    )}
                </div>
                <div className='reviewer-info'>
                    <div className='reviewer-name'>{reviewer.user.name}</div>
                    {reviewer.decision ? (
                        <div className='reviewer-decision'>
                            {reviewer.decision.type === 'approve' && <span className='approved'>✓ Approved</span>}
                            {reviewer.decision.type === 'request_changes' && <span className='changes'>↻ Changes Requested</span>}
                            {reviewer.decision.type === 'reject' && <span className='rejected'>✕ Rejected</span>}
                        </div>
                    ) : (
                        <div className='reviewer-status'>Pending review</div>
                    )}
                </div>
            </div>
        );
    }

    protected renderReviewActions(): React.ReactNode {
        if (!this.selectedReview) {
            return null;
        }

        const canReview = this.selectedReview.status === 'pending' || this.selectedReview.status === 'in_review';

        return (
            <div className='review-actions'>
                <h4>Review Actions</h4>
                <div className='action-buttons'>
                    <button
                        className='theia-button'
                        onClick={() => this.approveReview(this.selectedReview!.id)}
                        disabled={!canReview}
                    >
                        <i className='fa fa-check'></i>
                        Approve
                    </button>
                    <button
                        className='theia-button secondary'
                        onClick={() => this.requestChanges(this.selectedReview!.id, 'Please make these changes...')}
                        disabled={!canReview}
                    >
                        <i className='fa fa-refresh'></i>
                        Request Changes
                    </button>
                    <button
                        className='theia-button secondary danger'
                        onClick={() => this.rejectReview(this.selectedReview!.id, 'Not approved')}
                        disabled={!canReview}
                    >
                        <i className='fa fa-times'></i>
                        Reject
                    </button>
                </div>
            </div>
        );
    }

    protected renderEmptyState(): React.ReactNode {
        return (
            <div className='review-empty'>
                <i className='fa fa-code-fork fa-4x'></i>
                <h4>No Review Selected</h4>
                <p>Select a review from the list to view details</p>
            </div>
        );
    }
}
