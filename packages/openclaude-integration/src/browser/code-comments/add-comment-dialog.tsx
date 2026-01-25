// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { CommentType } from '../../common/openclaude-protocol';

export interface AddCommentOptions {
    filePath: string;
    line: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    text: string;
    type: CommentType;
    severity?: 'info' | 'warning' | 'error';
}

/**
 * Dialog for adding a new code comment
 */
@injectable()
export class AddCommentDialog extends ReactDialog<AddCommentOptions> {

    protected filePath: string = '';
    protected line: number = 1;
    protected column?: number;
    protected endLine?: number;
    protected endColumn?: number;
    protected commentText: string = '';
    protected commentType: CommentType = 'note';
    protected severity?: 'info' | 'warning' | 'error';

    constructor() {
        super({
            title: 'Add Code Comment'
        });
        this.appendAcceptButton('Add Comment');
        this.appendCloseButton('Cancel');
    }

    /**
     * Set file path and location
     */
    setLocation(filePath: string, line: number, column?: number, endLine?: number, endColumn?: number): void {
        this.filePath = filePath;
        this.line = line;
        this.column = column;
        this.endLine = endLine;
        this.endColumn = endColumn;
        this.update();
    }

    get value(): AddCommentOptions {
        return {
            filePath: this.filePath,
            line: this.line,
            column: this.column,
            endLine: this.endLine,
            endColumn: this.endColumn,
            text: this.commentText,
            type: this.commentType,
            severity: this.commentType === 'issue' ? this.severity : undefined
        };
    }

    protected override isValid(value: AddCommentOptions): string {
        if (!value.text.trim()) {
            return 'Comment text is required';
        }
        if (value.type === 'issue' && !value.severity) {
            return 'Severity is required for issues';
        }
        return '';
    }

    protected render(): React.ReactNode {
        return (
            <div className='openclaude-add-comment-dialog'>
                {/* Location Info */}
                <div className='dialog-section'>
                    <label>Location</label>
                    <div className='location-info'>
                        <i className='fa fa-file-code-o'></i>
                        <span>{this.filePath.split('/').pop()}</span>
                        <span className='location-line'>Line {this.line}</span>
                        {this.endLine && this.endLine !== this.line && (
                            <span className='location-range'>- {this.endLine}</span>
                        )}
                    </div>
                </div>

                {/* Comment Type */}
                <div className='dialog-section'>
                    <label htmlFor='comment-type'>Comment Type</label>
                    <select
                        id='comment-type'
                        className='theia-select'
                        value={this.commentType}
                        onChange={(e) => {
                            this.commentType = e.target.value as CommentType;
                            this.update();
                        }}
                    >
                        <option value='note'>📝 Note</option>
                        <option value='question'>❓ Question</option>
                        <option value='issue'>⚠️ Issue</option>
                        <option value='suggestion'>💡 Suggestion</option>
                        <option value='todo'>✅ To-Do</option>
                    </select>
                </div>

                {/* Severity (for issues only) */}
                {this.commentType === 'issue' && (
                    <div className='dialog-section'>
                        <label htmlFor='comment-severity'>Severity</label>
                        <select
                            id='comment-severity'
                            className='theia-select'
                            value={this.severity || 'warning'}
                            onChange={(e) => {
                                this.severity = e.target.value as 'info' | 'warning' | 'error';
                                this.update();
                            }}
                        >
                            <option value='info'>ℹ️ Info</option>
                            <option value='warning'>⚠️ Warning</option>
                            <option value='error'>❌ Error</option>
                        </select>
                    </div>
                )}

                {/* Comment Text */}
                <div className='dialog-section'>
                    <label htmlFor='comment-text'>Comment</label>
                    <textarea
                        id='comment-text'
                        className='theia-input'
                        rows={5}
                        placeholder='Enter your comment...'
                        value={this.commentText}
                        onChange={(e) => {
                            this.commentText = e.target.value;
                            this.update();
                        }}
                    />
                </div>

                {/* Help Text */}
                <div className='dialog-info'>
                    <i className='fa fa-info-circle'></i>
                    <span>
                        This comment will be visible to all collaborators working on this file.
                    </span>
                </div>
            </div>
        );
    }
}
