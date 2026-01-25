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
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { OpenClaudeBackendService, CodeComment, CommentType, CommentReply, ChatUser } from '../../common/openclaude-protocol';

/**
 * Widget for displaying and managing code comments
 */
@injectable()
export class CodeCommentsWidget extends ReactWidget {

    static readonly ID = 'openclaude-code-comments';
    static readonly LABEL = 'Code Comments';

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    @inject(EditorManager)
    protected readonly editorManager!: EditorManager;

    protected currentFilePath: string | undefined;
    protected comments: CodeComment[] = [];
    protected showResolved: boolean = false;
    protected replyInputs: Map<string, string> = new Map();
    protected expandedComments: Set<string> = new Set();

    @postConstruct()
    protected init(): void {
        this.id = CodeCommentsWidget.ID;
        this.title.label = CodeCommentsWidget.LABEL;
        this.title.caption = CodeCommentsWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-comments';

        // Listen to editor changes
        this.editorManager.onCurrentEditorChanged(() => {
            this.handleEditorChange();
        });

        this.update();
    }

    /**
     * Handle editor change
     */
    protected handleEditorChange(): void {
        const currentEditor = this.editorManager.currentEditor;
        const filePath = currentEditor?.getResourceUri()?.path.toString();

        if (filePath && filePath !== this.currentFilePath) {
            this.currentFilePath = filePath;
            this.loadComments();
        }
    }

    /**
     * Load comments for current file
     */
    async loadComments(): Promise<void> {
        if (!this.currentFilePath) {
            this.comments = [];
            this.update();
            return;
        }

        try {
            this.comments = await this.backendService.getCodeComments(
                this.currentFilePath,
                this.showResolved
            );
            this.update();
        } catch (error) {
            console.error('[OpenClaude] Failed to load comments:', error);
        }
    }

    /**
     * Toggle show resolved comments
     */
    protected toggleShowResolved = (): void => {
        this.showResolved = !this.showResolved;
        this.loadComments();
    }

    /**
     * Toggle comment expansion
     */
    protected toggleComment = (commentId: string): void => {
        if (this.expandedComments.has(commentId)) {
            this.expandedComments.delete(commentId);
        } else {
            this.expandedComments.add(commentId);
        }
        this.update();
    }

    /**
     * Resolve a comment
     */
    protected resolveComment = async (commentId: string): Promise<void> => {
        try {
            await this.backendService.resolveComment(commentId);
            await this.loadComments();
            this.messageService.info('Comment resolved');
        } catch (error) {
            this.messageService.error(`Failed to resolve comment: ${error}`);
        }
    }

    /**
     * Unresolve a comment
     */
    protected unresolveComment = async (commentId: string): Promise<void> => {
        try {
            await this.backendService.unresolveComment(commentId);
            await this.loadComments();
            this.messageService.info('Comment unresolved');
        } catch (error) {
            this.messageService.error(`Failed to unresolve comment: ${error}`);
        }
    }

    /**
     * Delete a comment
     */
    protected deleteComment = async (commentId: string): Promise<void> => {
        try {
            await this.backendService.deleteComment(commentId);
            await this.loadComments();
            this.messageService.info('Comment deleted');
        } catch (error) {
            this.messageService.error(`Failed to delete comment: ${error}`);
        }
    }

    /**
     * Handle reply input change
     */
    protected handleReplyChange = (commentId: string, value: string): void => {
        this.replyInputs.set(commentId, value);
        this.update();
    }

    /**
     * Submit reply
     */
    protected submitReply = async (commentId: string): Promise<void> => {
        const replyText = this.replyInputs.get(commentId);
        if (!replyText?.trim()) {
            return;
        }

        try {
            await this.backendService.replyToComment(commentId, replyText);
            this.replyInputs.delete(commentId);
            await this.loadComments();
        } catch (error) {
            this.messageService.error(`Failed to add reply: ${error}`);
        }
    }

    /**
     * Navigate to comment location
     */
    protected navigateToComment = (comment: CodeComment): void => {
        const currentEditor = this.editorManager.currentEditor;
        if (currentEditor) {
            const range = {
                start: { line: comment.line - 1, character: comment.column || 0 },
                end: { line: comment.endLine ? comment.endLine - 1 : comment.line - 1, character: comment.endColumn || 0 }
            };
            currentEditor.editor.revealRange(range);
            // Set cursor to the start of the comment
            currentEditor.editor.cursor = range.start;
        }
    }

    /**
     * Get comment type icon
     */
    protected getTypeIcon(type: CommentType): string {
        switch (type) {
            case 'note': return 'fa fa-sticky-note';
            case 'question': return 'fa fa-question-circle';
            case 'issue': return 'fa fa-exclamation-triangle';
            case 'suggestion': return 'fa fa-lightbulb-o';
            case 'todo': return 'fa fa-check-square-o';
            default: return 'fa fa-comment';
        }
    }

    /**
     * Get severity color
     */
    protected getSeverityColor(severity?: 'info' | 'warning' | 'error'): string {
        switch (severity) {
            case 'error': return '#f44336';
            case 'warning': return '#ff9800';
            case 'info': return '#2196f3';
            default: return 'var(--theia-icon-foreground)';
        }
    }

    /**
     * Format timestamp
     */
    protected formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
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
            <div className='openclaude-code-comments'>
                {this.renderHeader()}
                {this.currentFilePath ? this.renderComments() : this.renderEmptyState()}
            </div>
        );
    }

    protected renderHeader(): React.ReactNode {
        const unresolvedCount = this.comments.filter(c => !c.resolved).length;

        return (
            <div className='comments-header'>
                <div className='header-info'>
                    <h3>Code Comments</h3>
                    {this.currentFilePath && (
                        <div className='file-info'>
                            <i className='fa fa-file-code-o'></i>
                            <span>{this.currentFilePath.split('/').pop()}</span>
                        </div>
                    )}
                </div>
                <div className='header-actions'>
                    <div className='comment-stats'>
                        <span className='stat unresolved'>
                            <i className='fa fa-circle'></i>
                            {unresolvedCount} Open
                        </span>
                        {this.showResolved && (
                            <span className='stat resolved'>
                                <i className='fa fa-check-circle'></i>
                                {this.comments.length - unresolvedCount} Resolved
                            </span>
                        )}
                    </div>
                    <button
                        className={`theia-button secondary ${this.showResolved ? 'active' : ''}`}
                        onClick={this.toggleShowResolved}
                    >
                        <i className={`fa ${this.showResolved ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                        {this.showResolved ? 'Hide Resolved' : 'Show Resolved'}
                    </button>
                </div>
            </div>
        );
    }

    protected renderComments(): React.ReactNode {
        if (this.comments.length === 0) {
            return (
                <div className='no-comments'>
                    <i className='fa fa-comments-o fa-3x'></i>
                    <h4>No Comments</h4>
                    <p>No comments found for this file</p>
                </div>
            );
        }

        // Group comments by line
        const commentsByLine = new Map<number, CodeComment[]>();
        this.comments.forEach(comment => {
            if (!commentsByLine.has(comment.line)) {
                commentsByLine.set(comment.line, []);
            }
            commentsByLine.get(comment.line)!.push(comment);
        });

        // Sort by line number
        const sortedLines = Array.from(commentsByLine.keys()).sort((a, b) => a - b);

        return (
            <div className='comments-list'>
                {sortedLines.map(line => (
                    <div key={line} className='line-comments'>
                        <div className='line-header'>
                            <span className='line-number'>Line {line}</span>
                            <span className='comment-count'>{commentsByLine.get(line)!.length} comment{commentsByLine.get(line)!.length !== 1 ? 's' : ''}</span>
                        </div>
                        {commentsByLine.get(line)!.map(comment => this.renderComment(comment))}
                    </div>
                ))}
            </div>
        );
    }

    protected renderComment(comment: CodeComment): React.ReactNode {
        const isExpanded = this.expandedComments.has(comment.id);

        return (
            <div
                key={comment.id}
                className={`comment-item ${comment.resolved ? 'resolved' : ''} ${isExpanded ? 'expanded' : ''}`}
            >
                <div className='comment-header' onClick={() => this.toggleComment(comment.id)}>
                    <div className='comment-info'>
                        <div className='author-avatar'>
                            {comment.author.avatar ? (
                                <img src={comment.author.avatar} alt={comment.author.name} />
                            ) : (
                                <div className='avatar-initials'>{this.getUserInitials(comment.author)}</div>
                            )}
                        </div>
                        <div className='comment-meta'>
                            <div className='author-name'>{comment.author.name}</div>
                            <div className='comment-timestamp'>{this.formatTimestamp(comment.timestamp)}</div>
                        </div>
                        <div className='comment-badges'>
                            <span
                                className='type-badge'
                                style={{ color: this.getSeverityColor(comment.severity) }}
                            >
                                <i className={this.getTypeIcon(comment.type)}></i>
                                {comment.type}
                            </span>
                            {comment.resolved && (
                                <span className='resolved-badge'>
                                    <i className='fa fa-check'></i>
                                    Resolved
                                </span>
                            )}
                        </div>
                    </div>
                    <i className={`fa fa-chevron-${isExpanded ? 'down' : 'right'}`}></i>
                </div>

                {isExpanded && (
                    <div className='comment-body'>
                        <div className='comment-text'>{comment.text}</div>

                        {comment.replies.length > 0 && (
                            <div className='comment-replies'>
                                {comment.replies.map(reply => this.renderReply(reply))}
                            </div>
                        )}

                        <div className='comment-reply-input'>
                            <input
                                type='text'
                                className='theia-input'
                                placeholder='Add a reply...'
                                value={this.replyInputs.get(comment.id) || ''}
                                onChange={(e) => this.handleReplyChange(comment.id, e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        this.submitReply(comment.id);
                                    }
                                }}
                            />
                            <button
                                className='theia-button'
                                onClick={() => this.submitReply(comment.id)}
                                disabled={!this.replyInputs.get(comment.id)?.trim()}
                            >
                                Reply
                            </button>
                        </div>

                        <div className='comment-actions'>
                            <button
                                className='theia-button secondary'
                                onClick={() => this.navigateToComment(comment)}
                            >
                                <i className='fa fa-crosshairs'></i>
                                Go to Code
                            </button>
                            {!comment.resolved ? (
                                <button
                                    className='theia-button secondary'
                                    onClick={() => this.resolveComment(comment.id)}
                                >
                                    <i className='fa fa-check'></i>
                                    Resolve
                                </button>
                            ) : (
                                <button
                                    className='theia-button secondary'
                                    onClick={() => this.unresolveComment(comment.id)}
                                >
                                    <i className='fa fa-undo'></i>
                                    Unresolve
                                </button>
                            )}
                            <button
                                className='theia-button secondary danger'
                                onClick={() => this.deleteComment(comment.id)}
                            >
                                <i className='fa fa-trash'></i>
                                Delete
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    protected renderReply(reply: CommentReply): React.ReactNode {
        return (
            <div key={reply.id} className='comment-reply'>
                <div className='reply-author-avatar'>
                    {reply.author.avatar ? (
                        <img src={reply.author.avatar} alt={reply.author.name} />
                    ) : (
                        <div className='avatar-initials'>{this.getUserInitials(reply.author)}</div>
                    )}
                </div>
                <div className='reply-content'>
                    <div className='reply-header'>
                        <span className='reply-author'>{reply.author.name}</span>
                        <span className='reply-timestamp'>{this.formatTimestamp(reply.timestamp)}</span>
                    </div>
                    <div className='reply-text'>{reply.text}</div>
                </div>
            </div>
        );
    }

    protected renderEmptyState(): React.ReactNode {
        return (
            <div className='comments-empty'>
                <i className='fa fa-file-code-o fa-4x'></i>
                <h4>No File Selected</h4>
                <p>Open a file to view and add comments</p>
            </div>
        );
    }
}
