// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { ReviewRequest, ReviewPriority } from '../../common/openclaude-protocol';

/**
 * Dialog for creating a new code review request
 */
@injectable()
export class CreateReviewDialog extends ReactDialog<ReviewRequest> {

    protected reviewTitle: string = '';
    protected reviewDescription: string = '';
    protected files: string[] = [];
    protected reviewers: string[] = [];
    protected priority: ReviewPriority = 'medium';
    protected dueDate: string = '';

    constructor() {
        super({
            title: 'Create Code Review Request'
        });
        this.appendAcceptButton('Create Review');
        this.appendCloseButton('Cancel');
    }

    /**
     * Set initial files
     */
    setFiles(files: string[]): void {
        this.files = files;
        this.update();
    }

    get value(): ReviewRequest {
        return {
            title: this.reviewTitle,
            description: this.reviewDescription,
            files: this.files,
            reviewers: this.reviewers,
            priority: this.priority,
            dueDate: this.dueDate ? new Date(this.dueDate).getTime() : undefined
        };
    }

    protected override isValid(value: ReviewRequest): string {
        if (!value.title.trim()) {
            return 'Title is required';
        }
        if (!value.description.trim()) {
            return 'Description is required';
        }
        if (value.files.length === 0) {
            return 'At least one file is required';
        }
        if (value.reviewers.length === 0) {
            return 'At least one reviewer is required';
        }
        return '';
    }

    protected render(): React.ReactNode {
        return (
            <div className='openclaude-create-review-dialog'>
                {/* Title */}
                <div className='dialog-section'>
                    <label htmlFor='review-title'>Title *</label>
                    <input
                        id='review-title'
                        type='text'
                        className='theia-input'
                        placeholder='Enter review title...'
                        value={this.reviewTitle}
                        onChange={(e) => {
                            this.reviewTitle = e.target.value;
                            this.update();
                        }}
                    />
                </div>

                {/* Description */}
                <div className='dialog-section'>
                    <label htmlFor='review-description'>Description *</label>
                    <textarea
                        id='review-description'
                        className='theia-input'
                        rows={4}
                        placeholder='Describe the changes being reviewed...'
                        value={this.reviewDescription}
                        onChange={(e) => {
                            this.reviewDescription = e.target.value;
                            this.update();
                        }}
                    />
                </div>

                {/* Files */}
                <div className='dialog-section'>
                    <label htmlFor='review-files'>Files to Review *</label>
                    <textarea
                        id='review-files'
                        className='theia-input'
                        rows={3}
                        placeholder='Enter file paths (one per line)...'
                        value={this.files.join('\n')}
                        onChange={(e) => {
                            this.files = e.target.value.split('\n').filter(f => f.trim());
                            this.update();
                        }}
                    />
                    <div className='help-text'>
                        <i className='fa fa-info-circle'></i>
                        Enter one file path per line
                    </div>
                </div>

                {/* Reviewers */}
                <div className='dialog-section'>
                    <label htmlFor='review-reviewers'>Reviewers *</label>
                    <input
                        id='review-reviewers'
                        type='text'
                        className='theia-input'
                        placeholder='Enter reviewer usernames (comma-separated)...'
                        value={this.reviewers.join(', ')}
                        onChange={(e) => {
                            this.reviewers = e.target.value.split(',').map(r => r.trim()).filter(r => r);
                            this.update();
                        }}
                    />
                    <div className='help-text'>
                        <i className='fa fa-info-circle'></i>
                        Separate multiple reviewers with commas
                    </div>
                </div>

                {/* Priority */}
                <div className='dialog-section'>
                    <label htmlFor='review-priority'>Priority</label>
                    <select
                        id='review-priority'
                        className='theia-select'
                        value={this.priority}
                        onChange={(e) => {
                            this.priority = e.target.value as ReviewPriority;
                            this.update();
                        }}
                    >
                        <option value='low'>🔽 Low</option>
                        <option value='medium'>➖ Medium</option>
                        <option value='high'>🔼 High</option>
                        <option value='critical'>⚠️ Critical</option>
                    </select>
                </div>

                {/* Due Date */}
                <div className='dialog-section'>
                    <label htmlFor='review-due-date'>Due Date (Optional)</label>
                    <input
                        id='review-due-date'
                        type='date'
                        className='theia-input'
                        value={this.dueDate}
                        onChange={(e) => {
                            this.dueDate = e.target.value;
                            this.update();
                        }}
                    />
                </div>

                {/* Summary */}
                <div className='dialog-info'>
                    <i className='fa fa-info-circle'></i>
                    <div>
                        <strong>Review will be created with:</strong>
                        <ul>
                            <li>{this.files.length} file(s)</li>
                            <li>{this.reviewers.length} reviewer(s)</li>
                            <li>Priority: {this.priority}</li>
                            {this.dueDate && <li>Due: {new Date(this.dueDate).toLocaleDateString()}</li>}
                        </ul>
                    </div>
                </div>
            </div>
        );
    }
}
