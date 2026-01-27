// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, Command, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/browser/quick-input';
import { MessageService } from '@theia/core/lib/common/message-service';
import { EditorManager } from '@theia/editor/lib/browser';
import {
    AICommentsService,
    CodeComment,
    CommentThread,
    ParsedAnnotation,
    CommentType,
    CommentPriority,
    formatTimestamp
} from '../common/ai-comments-protocol';

/**
 * Extended QuickPickItem with custom data
 */
interface CommentQuickPickItem extends QuickPickItem {
    value?: string;
    action?: string;
    thread?: CommentThread;
    comment?: CodeComment;
    annotation?: ParsedAnnotation;
}

export namespace AICommentsCommands {
    export const ADD_COMMENT: Command = {
        id: 'ai.comments.add',
        label: 'AI Comments: Add Comment',
        category: 'AI Comments'
    };

    export const VIEW_COMMENTS: Command = {
        id: 'ai.comments.view',
        label: 'AI Comments: View File Comments',
        category: 'AI Comments'
    };

    export const SCAN_TODOS: Command = {
        id: 'ai.comments.scanTodos',
        label: 'AI Comments: Scan TODOs/FIXMEs',
        category: 'AI Comments'
    };

    export const VIEW_ALL_TODOS: Command = {
        id: 'ai.comments.viewAllTodos',
        label: 'AI Comments: View All TODOs',
        category: 'AI Comments'
    };

    export const RESOLVE_COMMENT: Command = {
        id: 'ai.comments.resolve',
        label: 'AI Comments: Resolve Comment',
        category: 'AI Comments'
    };

    export const SEARCH_COMMENTS: Command = {
        id: 'ai.comments.search',
        label: 'AI Comments: Search Comments',
        category: 'AI Comments'
    };

    export const FILE_SUMMARY: Command = {
        id: 'ai.comments.fileSummary',
        label: 'AI Comments: File Summary',
        category: 'AI Comments'
    };

    export const WORKSPACE_SUMMARY: Command = {
        id: 'ai.comments.workspaceSummary',
        label: 'AI Comments: Workspace Summary',
        category: 'AI Comments'
    };

    export const REPLY_TO_COMMENT: Command = {
        id: 'ai.comments.reply',
        label: 'AI Comments: Reply to Comment',
        category: 'AI Comments'
    };

    export const CONVERT_TODO: Command = {
        id: 'ai.comments.convertTodo',
        label: 'AI Comments: Convert TODO to Comment',
        category: 'AI Comments'
    };
}

@injectable()
export class AICommentsContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(AICommentsService)
    protected readonly commentsService: AICommentsService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(AICommentsCommands.ADD_COMMENT, {
            execute: () => this.addComment()
        });

        commands.registerCommand(AICommentsCommands.VIEW_COMMENTS, {
            execute: () => this.viewComments()
        });

        commands.registerCommand(AICommentsCommands.SCAN_TODOS, {
            execute: () => this.scanTodos()
        });

        commands.registerCommand(AICommentsCommands.VIEW_ALL_TODOS, {
            execute: () => this.viewAllTodos()
        });

        commands.registerCommand(AICommentsCommands.RESOLVE_COMMENT, {
            execute: () => this.resolveComment()
        });

        commands.registerCommand(AICommentsCommands.SEARCH_COMMENTS, {
            execute: () => this.searchComments()
        });

        commands.registerCommand(AICommentsCommands.FILE_SUMMARY, {
            execute: () => this.showFileSummary()
        });

        commands.registerCommand(AICommentsCommands.WORKSPACE_SUMMARY, {
            execute: () => this.showWorkspaceSummary()
        });

        commands.registerCommand(AICommentsCommands.REPLY_TO_COMMENT, {
            execute: () => this.replyToComment()
        });

        commands.registerCommand(AICommentsCommands.CONVERT_TODO, {
            execute: () => this.convertTodoToComment()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(['ai-menu', 'comments'], {
            commandId: AICommentsCommands.ADD_COMMENT.id,
            label: 'Add Comment',
            order: '1'
        });

        menus.registerMenuAction(['ai-menu', 'comments'], {
            commandId: AICommentsCommands.VIEW_COMMENTS.id,
            label: 'View Comments',
            order: '2'
        });

        menus.registerMenuAction(['ai-menu', 'comments'], {
            commandId: AICommentsCommands.SCAN_TODOS.id,
            label: 'Scan TODOs',
            order: '3'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: AICommentsCommands.ADD_COMMENT.id,
            keybinding: 'ctrl+shift+m'
        });

        keybindings.registerKeybinding({
            command: AICommentsCommands.VIEW_COMMENTS.id,
            keybinding: 'ctrl+alt+m'
        });

        keybindings.registerKeybinding({
            command: AICommentsCommands.SCAN_TODOS.id,
            keybinding: 'ctrl+shift+d'
        });
    }

    protected async addComment(): Promise<void> {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            this.messageService.warn('No active editor');
            return;
        }

        const selection = editor.editor.selection;
        const uri = editor.editor.document.uri.toString();

        const startLine = selection ? selection.start.line + 1 : 1;
        const endLine = selection ? selection.end.line + 1 : 1;

        // Select comment type
        const typeItems: CommentQuickPickItem[] = [
            { label: 'Comment', description: 'General comment', value: 'comment' },
            { label: 'TODO', description: 'Task to complete', value: 'todo' },
            { label: 'FIXME', description: 'Bug or issue to fix', value: 'fixme' },
            { label: 'Note', description: 'Important note', value: 'note' },
            { label: 'Warning', description: 'Warning or caution', value: 'warning' },
            { label: 'Question', description: 'Question for review', value: 'question' },
            { label: 'Review', description: 'Code review comment', value: 'review' }
        ];

        const typeSelection = await this.quickInputService.showQuickPick(typeItems, {
            title: 'Add Comment',
            placeholder: 'Select comment type'
        });

        if (!typeSelection) {
            return;
        }

        const content = await this.quickInputService.input({
            title: 'Comment Content',
            prompt: 'Enter your comment',
            placeHolder: 'What would you like to say?'
        });

        if (!content) {
            return;
        }

        // Select priority
        const priorityItems: CommentQuickPickItem[] = [
            { label: 'Low', value: 'low' },
            { label: 'Medium (Recommended)', value: 'medium' },
            { label: 'High', value: 'high' },
            { label: 'Critical', value: 'critical' }
        ];

        const prioritySelection = await this.quickInputService.showQuickPick(priorityItems, {
            title: 'Priority',
            placeholder: 'Select priority'
        });

        const comment = await this.commentsService.createComment({
            fileUri: uri,
            position: { startLine, endLine },
            content,
            type: (typeSelection as CommentQuickPickItem).value as CommentType,
            priority: prioritySelection
                ? (prioritySelection as CommentQuickPickItem).value as CommentPriority
                : 'medium'
        });

        this.messageService.info(
            'Comment added at line ' + comment.position.startLine + ': ' + comment.content.slice(0, 30) + '...'
        );
    }

    protected async viewComments(): Promise<void> {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            this.messageService.warn('No active editor');
            return;
        }

        const uri = editor.editor.document.uri.toString();
        const threads = await this.commentsService.getThreadsForFile(uri);

        if (threads.length === 0) {
            this.messageService.info('No comments in this file');
            return;
        }

        const items: CommentQuickPickItem[] = threads.map(thread => ({
            label: this.getCommentLabel(thread.comment),
            description: 'Line ' + thread.comment.position.startLine + ' • ' + thread.comment.author.name,
            detail: thread.comment.content.slice(0, 80) + (thread.comment.content.length > 80 ? '...' : ''),
            thread
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            title: 'File Comments (' + threads.length + ')',
            placeholder: 'Select a comment to view'
        });

        if (selected) {
            const thread = (selected as CommentQuickPickItem).thread!;
            await this.showCommentActions(thread);
        }
    }

    protected async scanTodos(): Promise<void> {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            this.messageService.warn('No active editor');
            return;
        }

        const document = editor.editor.document;
        const uri = document.uri.toString();
        const content = document.getText();

        const annotations = await this.commentsService.parseAnnotations(uri, content);

        if (annotations.length === 0) {
            this.messageService.info('No TODOs/FIXMEs found');
            return;
        }

        const items: CommentQuickPickItem[] = annotations.map(ann => ({
            label: this.getAnnotationLabel(ann),
            description: 'Line ' + ann.position.startLine,
            detail: ann.content,
            annotation: ann
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            title: 'TODOs & FIXMEs (' + annotations.length + ')',
            placeholder: 'Select to convert to trackable comment'
        });

        if (selected) {
            const ann = (selected as CommentQuickPickItem).annotation!;
            const converted = await this.commentsService.convertAnnotationToComment(ann);
            this.messageService.info('Converted to trackable comment: ' + converted.id);
        }
    }

    protected async viewAllTodos(): Promise<void> {
        const comments = await this.commentsService.searchComments({
            status: 'open'
        });

        const todos = comments.filter(c => c.type === 'todo' || c.type === 'fixme');

        if (todos.length === 0) {
            this.messageService.info('No open TODOs/FIXMEs');
            return;
        }

        const items: CommentQuickPickItem[] = todos.map(c => ({
            label: this.getCommentLabel(c),
            description: c.fileUri.split('/').pop() + ':' + c.position.startLine,
            detail: c.content,
            comment: c
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            title: 'All TODOs (' + todos.length + ')',
            placeholder: 'Select to view or resolve'
        });

        if (selected) {
            const comment = (selected as CommentQuickPickItem).comment!;
            const thread = await this.commentsService.getThread(comment.id);
            await this.showCommentActions(thread);
        }
    }

    protected async resolveComment(): Promise<void> {
        const comments = await this.commentsService.searchComments({ status: 'open' });

        if (comments.length === 0) {
            this.messageService.info('No open comments');
            return;
        }

        const items: CommentQuickPickItem[] = comments.map(c => ({
            label: this.getCommentLabel(c),
            description: c.fileUri.split('/').pop() + ':' + c.position.startLine,
            detail: c.content,
            comment: c
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            title: 'Resolve Comment',
            placeholder: 'Select a comment to resolve'
        });

        if (selected) {
            const comment = (selected as CommentQuickPickItem).comment!;
            await this.commentsService.resolveComment(comment.id);
            this.messageService.info('Comment resolved');
        }
    }

    protected async searchComments(): Promise<void> {
        const query = await this.quickInputService.input({
            title: 'Search Comments',
            prompt: 'Enter search query',
            placeHolder: 'Search text, @author, #tag...'
        });

        if (!query) {
            return;
        }

        // Check for special filters
        let searchRequest: any = { query };

        if (query.startsWith('@')) {
            searchRequest = { author: query.slice(1) };
        } else if (query.startsWith('#')) {
            searchRequest = { tag: query.slice(1) };
        }

        const results = await this.commentsService.searchComments(searchRequest);

        if (results.length === 0) {
            this.messageService.info('No comments found');
            return;
        }

        const items: CommentQuickPickItem[] = results.map(c => ({
            label: this.getCommentLabel(c),
            description: c.fileUri.split('/').pop() + ':' + c.position.startLine,
            detail: c.content,
            comment: c
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            title: 'Search Results (' + results.length + ')',
            placeholder: 'Select a comment'
        });

        if (selected) {
            const comment = (selected as CommentQuickPickItem).comment!;
            const thread = await this.commentsService.getThread(comment.id);
            await this.showCommentActions(thread);
        }
    }

    protected async showFileSummary(): Promise<void> {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            this.messageService.warn('No active editor');
            return;
        }

        const uri = editor.editor.document.uri.toString();
        const summary = await this.commentsService.getFileSummary(uri);

        const message = [
            'File: ' + summary.fileName,
            'Total: ' + summary.totalComments,
            'Open: ' + summary.openComments,
            'Resolved: ' + summary.resolvedComments,
            'TODOs: ' + summary.todoCount,
            'FIXMEs: ' + summary.fixmeCount
        ].join(' | ');

        this.messageService.info(message);
    }

    protected async showWorkspaceSummary(): Promise<void> {
        const summaries = await this.commentsService.getWorkspaceSummary();

        if (summaries.length === 0) {
            this.messageService.info('No comments in workspace');
            return;
        }

        let totalComments = 0;
        let totalOpen = 0;
        let totalTodos = 0;
        let totalFixmes = 0;

        for (const s of summaries) {
            totalComments += s.totalComments;
            totalOpen += s.openComments;
            totalTodos += s.todoCount;
            totalFixmes += s.fixmeCount;
        }

        const items: QuickPickItem[] = summaries.map(s => ({
            label: s.fileName,
            description: s.totalComments + ' comments • ' + s.openComments + ' open',
            detail: 'TODOs: ' + s.todoCount + ' | FIXMEs: ' + s.fixmeCount
        }));

        items.unshift({
            label: 'WORKSPACE TOTAL',
            description: totalComments + ' comments • ' + totalOpen + ' open',
            detail: 'TODOs: ' + totalTodos + ' | FIXMEs: ' + totalFixmes,
            kind: -1
        } as QuickPickItem);

        await this.quickInputService.showQuickPick(items, {
            title: 'Workspace Comments',
            placeholder: 'Comments by file'
        });
    }

    protected async replyToComment(): Promise<void> {
        const comments = await this.commentsService.searchComments({ status: 'open' });

        if (comments.length === 0) {
            this.messageService.info('No comments to reply to');
            return;
        }

        const items: CommentQuickPickItem[] = comments.map(c => ({
            label: this.getCommentLabel(c),
            description: c.author.name + ' • ' + formatTimestamp(c.createdAt),
            detail: c.content,
            comment: c
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            title: 'Reply to Comment',
            placeholder: 'Select a comment'
        });

        if (!selected) {
            return;
        }

        const comment = (selected as CommentQuickPickItem).comment!;

        const reply = await this.quickInputService.input({
            title: 'Reply to ' + comment.author.name,
            prompt: 'Enter your reply',
            placeHolder: 'Your response...'
        });

        if (reply) {
            await this.commentsService.addReply(comment.id, reply);
            this.messageService.info('Reply added');
        }
    }

    protected async convertTodoToComment(): Promise<void> {
        const editor = this.editorManager.currentEditor;
        if (!editor) {
            this.messageService.warn('No active editor');
            return;
        }

        const document = editor.editor.document;
        const uri = document.uri.toString();
        const content = document.getText();

        const annotations = await this.commentsService.parseAnnotations(uri, content);

        if (annotations.length === 0) {
            this.messageService.info('No annotations to convert');
            return;
        }

        const items: CommentQuickPickItem[] = annotations.map(ann => ({
            label: this.getAnnotationLabel(ann),
            description: 'Line ' + ann.position.startLine,
            detail: ann.content,
            annotation: ann
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            title: 'Convert to Trackable Comment',
            placeholder: 'Select annotation'
        });

        if (selected) {
            const ann = (selected as CommentQuickPickItem).annotation!;
            const theComment = await this.commentsService.convertAnnotationToComment(ann);
            this.messageService.info('Created comment ' + theComment.id + ' from ' + ann.type.toUpperCase());
        }
    }

    protected async showCommentActions(thread: CommentThread): Promise<void> {
        const comment = thread.comment;

        const items: CommentQuickPickItem[] = [
            { label: 'View Details', description: 'Show full comment', action: 'view' },
            { label: 'Reply', description: 'Add a reply', action: 'reply' },
            { label: 'React', description: 'Add reaction', action: 'react' }
        ];

        if (comment.status === 'open') {
            items.push({ label: 'Resolve', description: 'Mark as resolved', action: 'resolve' });
        } else {
            items.push({ label: 'Reopen', description: 'Mark as open', action: 'reopen' });
        }

        items.push(
            { label: 'Change Priority', description: 'Update priority', action: 'priority' },
            { label: 'Delete', description: 'Remove comment', action: 'delete' }
        );

        const selected = await this.quickInputService.showQuickPick(items, {
            title: this.getCommentLabel(comment),
            placeholder: 'Select action'
        });

        if (!selected) {
            return;
        }

        const action = (selected as CommentQuickPickItem).action;

        switch (action) {
            case 'view':
                this.showCommentDetail(thread);
                break;

            case 'reply':
                const reply = await this.quickInputService.input({
                    title: 'Reply',
                    prompt: 'Enter your reply'
                });
                if (reply) {
                    await this.commentsService.addReply(comment.id, reply);
                    this.messageService.info('Reply added');
                }
                break;

            case 'react':
                await this.addReaction(comment.id, false);
                break;

            case 'resolve':
                await this.commentsService.resolveComment(comment.id);
                this.messageService.info('Comment resolved');
                break;

            case 'reopen':
                await this.commentsService.reopenComment(comment.id);
                this.messageService.info('Comment reopened');
                break;

            case 'priority':
                await this.changePriority(comment);
                break;

            case 'delete':
                await this.commentsService.deleteComment(comment.id);
                this.messageService.info('Comment deleted');
                break;
        }
    }

    protected showCommentDetail(thread: CommentThread): void {
        const c = thread.comment;
        const lines = [
            'Type: ' + c.type.toUpperCase() + ' | Status: ' + c.status + ' | Priority: ' + c.priority,
            'Author: ' + c.author.name + ' | ' + formatTimestamp(c.createdAt),
            'Line ' + c.position.startLine + '-' + c.position.endLine,
            '',
            c.content,
            '',
            'Replies: ' + thread.replies.length
        ];

        if (thread.replies.length > 0) {
            lines.push('');
            for (const r of thread.replies) {
                lines.push('- ' + r.author.name + ': ' + r.content);
            }
        }

        this.messageService.info(lines.join('\n'));
    }

    protected async addReaction(targetId: string, isReply: boolean): Promise<void> {
        const emojiItems: QuickPickItem[] = [
            { label: '👍', description: 'Thumbs up' },
            { label: '👎', description: 'Thumbs down' },
            { label: '❤️', description: 'Heart' },
            { label: '✅', description: 'Check' },
            { label: '❓', description: 'Question' },
            { label: '🎉', description: 'Celebrate' }
        ];

        const selected = await this.quickInputService.showQuickPick(emojiItems, {
            title: 'Add Reaction',
            placeholder: 'Select emoji'
        });

        if (selected) {
            await this.commentsService.addReaction(targetId, selected.label!, isReply);
            this.messageService.info('Reaction added');
        }
    }

    protected async changePriority(comment: CodeComment): Promise<void> {
        const items: CommentQuickPickItem[] = [
            { label: 'Low', value: 'low' },
            { label: 'Medium', value: 'medium' },
            { label: 'High', value: 'high' },
            { label: 'Critical', value: 'critical' }
        ];

        const selected = await this.quickInputService.showQuickPick(items, {
            title: 'Change Priority',
            placeholder: 'Current: ' + comment.priority
        });

        if (selected) {
            const priority = (selected as CommentQuickPickItem).value as CommentPriority;
            await this.commentsService.updateComment(comment.id, { priority });
            this.messageService.info('Priority updated to ' + priority);
        }
    }

    protected getCommentLabel(comment: CodeComment): string {
        const statusIcon = comment.status === 'resolved' ? '✓' : '○';
        return statusIcon + ' [' + comment.type.toUpperCase() + '] ' + comment.content.slice(0, 40);
    }

    protected getAnnotationLabel(ann: ParsedAnnotation): string {
        const icons: Record<CommentType, string> = {
            todo: '☐',
            fixme: '🐛',
            hack: '⚠️',
            note: '📝',
            warning: '⚠️',
            question: '❓',
            review: '👀',
            comment: '💬'
        };
        return (icons[ann.type] || '💬') + ' ' + ann.type.toUpperCase();
    }
}
