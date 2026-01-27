// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import {
    AICommentsService,
    CommentUser,
    CodeComment,
    CommentReply,
    CommentThread,
    ParsedAnnotation,
    CreateCommentRequest,
    UpdateCommentRequest,
    SearchCommentsRequest,
    FileCommentSummary,
    CommentType,
    CommentPriority,
    extractAssignee,
    extractTags,
    inferPriority
} from '../common/ai-comments-protocol';

@injectable()
export class AICommentsServiceImpl implements AICommentsService {
    protected currentUser: CommentUser = {
        id: 'user-1',
        name: 'Current User',
        email: 'user@example.com'
    };

    protected comments: Map<string, CodeComment> = new Map();
    protected replies: Map<string, CommentReply[]> = new Map();
    protected fileComments: Map<string, Set<string>> = new Map();

    async getCurrentUser(): Promise<CommentUser> {
        return this.currentUser;
    }

    async getComments(fileUri: string): Promise<CodeComment[]> {
        const commentIds = this.fileComments.get(fileUri);
        if (!commentIds) {
            return [];
        }

        return Array.from(commentIds)
            .map(id => this.comments.get(id))
            .filter((c): c is CodeComment => c !== undefined)
            .sort((a, b) => a.position.startLine - b.position.startLine);
    }

    async getComment(commentId: string): Promise<CodeComment | undefined> {
        return this.comments.get(commentId);
    }

    async createComment(request: CreateCommentRequest): Promise<CodeComment> {
        const id = 'comment-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        const comment: CodeComment = {
            id,
            fileUri: request.fileUri,
            position: request.position,
            type: request.type || 'comment',
            status: 'open',
            priority: request.priority || 'medium',
            content: request.content,
            author: this.currentUser,
            createdAt: new Date().toISOString(),
            assignee: request.assignee ? { id: request.assignee, name: request.assignee } : undefined,
            tags: request.tags || extractTags(request.content),
            replyCount: 0
        };

        this.comments.set(id, comment);

        if (!this.fileComments.has(request.fileUri)) {
            this.fileComments.set(request.fileUri, new Set());
        }
        this.fileComments.get(request.fileUri)!.add(id);

        this.replies.set(id, []);

        return comment;
    }

    async updateComment(commentId: string, request: UpdateCommentRequest): Promise<CodeComment> {
        const comment = this.comments.get(commentId);
        if (!comment) {
            throw new Error('Comment not found');
        }

        if (request.content !== undefined) {
            comment.content = request.content;
        }
        if (request.status !== undefined) {
            comment.status = request.status;
            if (request.status === 'resolved') {
                comment.resolvedAt = new Date().toISOString();
                comment.resolvedBy = this.currentUser;
            }
        }
        if (request.priority !== undefined) {
            comment.priority = request.priority;
        }
        if (request.assignee !== undefined) {
            comment.assignee = { id: request.assignee, name: request.assignee };
        }
        if (request.tags !== undefined) {
            comment.tags = request.tags;
        }

        comment.updatedAt = new Date().toISOString();
        this.comments.set(commentId, comment);

        return comment;
    }

    async deleteComment(commentId: string): Promise<void> {
        const comment = this.comments.get(commentId);
        if (comment) {
            this.comments.delete(commentId);
            this.replies.delete(commentId);

            const fileSet = this.fileComments.get(comment.fileUri);
            if (fileSet) {
                fileSet.delete(commentId);
            }
        }
    }

    async resolveComment(commentId: string): Promise<CodeComment> {
        return this.updateComment(commentId, { status: 'resolved' });
    }

    async reopenComment(commentId: string): Promise<CodeComment> {
        const comment = this.comments.get(commentId);
        if (!comment) {
            throw new Error('Comment not found');
        }

        comment.status = 'open';
        comment.resolvedAt = undefined;
        comment.resolvedBy = undefined;
        comment.updatedAt = new Date().toISOString();

        this.comments.set(commentId, comment);
        return comment;
    }

    async getReplies(commentId: string): Promise<CommentReply[]> {
        return this.replies.get(commentId) || [];
    }

    async addReply(commentId: string, content: string): Promise<CommentReply> {
        const comment = this.comments.get(commentId);
        if (!comment) {
            throw new Error('Comment not found');
        }

        const reply: CommentReply = {
            id: 'reply-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            commentId,
            content,
            author: this.currentUser,
            createdAt: new Date().toISOString()
        };

        if (!this.replies.has(commentId)) {
            this.replies.set(commentId, []);
        }
        this.replies.get(commentId)!.push(reply);

        comment.replyCount = (comment.replyCount || 0) + 1;
        this.comments.set(commentId, comment);

        return reply;
    }

    async updateReply(replyId: string, content: string): Promise<CommentReply> {
        for (const replies of this.replies.values()) {
            const reply = replies.find(r => r.id === replyId);
            if (reply) {
                reply.content = content;
                reply.updatedAt = new Date().toISOString();
                return reply;
            }
        }
        throw new Error('Reply not found');
    }

    async deleteReply(replyId: string): Promise<void> {
        for (const [commentId, replies] of this.replies.entries()) {
            const index = replies.findIndex(r => r.id === replyId);
            if (index !== -1) {
                replies.splice(index, 1);

                const comment = this.comments.get(commentId);
                if (comment) {
                    comment.replyCount = Math.max(0, (comment.replyCount || 0) - 1);
                    this.comments.set(commentId, comment);
                }
                return;
            }
        }
    }

    async getThread(commentId: string): Promise<CommentThread> {
        const comment = this.comments.get(commentId);
        if (!comment) {
            throw new Error('Comment not found');
        }

        return {
            comment,
            replies: this.replies.get(commentId) || []
        };
    }

    async getThreadsForFile(fileUri: string): Promise<CommentThread[]> {
        const comments = await this.getComments(fileUri);
        return Promise.all(comments.map(c => this.getThread(c.id)));
    }

    async addReaction(targetId: string, emoji: string, isReply: boolean): Promise<void> {
        if (isReply) {
            for (const replies of this.replies.values()) {
                const reply = replies.find(r => r.id === targetId);
                if (reply) {
                    if (!reply.reactions) {
                        reply.reactions = [];
                    }
                    const existing = reply.reactions.find(r => r.emoji === emoji);
                    if (existing) {
                        if (!existing.users.includes(this.currentUser.id)) {
                            existing.users.push(this.currentUser.id);
                            existing.count++;
                        }
                    } else {
                        reply.reactions.push({
                            emoji,
                            users: [this.currentUser.id],
                            count: 1
                        });
                    }
                    return;
                }
            }
        } else {
            const comment = this.comments.get(targetId);
            if (comment) {
                if (!comment.reactions) {
                    comment.reactions = [];
                }
                const existing = comment.reactions.find(r => r.emoji === emoji);
                if (existing) {
                    if (!existing.users.includes(this.currentUser.id)) {
                        existing.users.push(this.currentUser.id);
                        existing.count++;
                    }
                } else {
                    comment.reactions.push({
                        emoji,
                        users: [this.currentUser.id],
                        count: 1
                    });
                }
                this.comments.set(targetId, comment);
            }
        }
    }

    async removeReaction(targetId: string, emoji: string, isReply: boolean): Promise<void> {
        if (isReply) {
            for (const replies of this.replies.values()) {
                const reply = replies.find(r => r.id === targetId);
                if (reply && reply.reactions) {
                    const existing = reply.reactions.find(r => r.emoji === emoji);
                    if (existing) {
                        existing.users = existing.users.filter(u => u !== this.currentUser.id);
                        existing.count = existing.users.length;
                        if (existing.count === 0) {
                            reply.reactions = reply.reactions.filter(r => r.emoji !== emoji);
                        }
                    }
                    return;
                }
            }
        } else {
            const comment = this.comments.get(targetId);
            if (comment && comment.reactions) {
                const existing = comment.reactions.find(r => r.emoji === emoji);
                if (existing) {
                    existing.users = existing.users.filter(u => u !== this.currentUser.id);
                    existing.count = existing.users.length;
                    if (existing.count === 0) {
                        comment.reactions = comment.reactions.filter(r => r.emoji !== emoji);
                    }
                }
                this.comments.set(targetId, comment);
            }
        }
    }

    async parseAnnotations(fileUri: string, content: string): Promise<ParsedAnnotation[]> {
        const annotations: ParsedAnnotation[] = [];
        const lines = content.split('\n');

        const patterns: { type: CommentType; regex: RegExp }[] = [
            { type: 'todo', regex: /\/\/\s*TODO[:\s]*(.*)/i },
            { type: 'todo', regex: /#\s*TODO[:\s]*(.*)/i },
            { type: 'fixme', regex: /\/\/\s*FIXME[:\s]*(.*)/i },
            { type: 'fixme', regex: /#\s*FIXME[:\s]*(.*)/i },
            { type: 'hack', regex: /\/\/\s*HACK[:\s]*(.*)/i },
            { type: 'hack', regex: /#\s*HACK[:\s]*(.*)/i },
            { type: 'note', regex: /\/\/\s*NOTE[:\s]*(.*)/i },
            { type: 'note', regex: /#\s*NOTE[:\s]*(.*)/i },
            { type: 'warning', regex: /\/\/\s*WARNING[:\s]*(.*)/i },
            { type: 'warning', regex: /#\s*WARNING[:\s]*(.*)/i },
            { type: 'question', regex: /\/\/\s*\?[:\s]*(.*)/i },
            { type: 'question', regex: /#\s*\?[:\s]*(.*)/i },
            { type: 'review', regex: /\/\/\s*REVIEW[:\s]*(.*)/i },
            { type: 'review', regex: /#\s*REVIEW[:\s]*(.*)/i }
        ];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            for (const { type, regex } of patterns) {
                const match = line.match(regex);
                if (match) {
                    const annotationContent = match[1].trim();
                    annotations.push({
                        type,
                        content: annotationContent,
                        fileUri,
                        position: {
                            startLine: i + 1,
                            endLine: i + 1
                        },
                        rawLine: line.trim(),
                        assignee: extractAssignee(annotationContent),
                        priority: inferPriority(annotationContent),
                        tags: extractTags(annotationContent)
                    });
                    break;
                }
            }
        }

        return annotations;
    }

    async getAllAnnotations(_directoryUri?: string): Promise<ParsedAnnotation[]> {
        return [];
    }

    async convertAnnotationToComment(annotation: ParsedAnnotation): Promise<CodeComment> {
        return this.createComment({
            fileUri: annotation.fileUri,
            position: annotation.position,
            content: annotation.content,
            type: annotation.type,
            priority: annotation.priority,
            assignee: annotation.assignee,
            tags: annotation.tags
        });
    }

    async searchComments(request: SearchCommentsRequest): Promise<CodeComment[]> {
        let results = Array.from(this.comments.values());

        if (request.fileUri) {
            results = results.filter(c => c.fileUri === request.fileUri);
        }

        if (request.type) {
            results = results.filter(c => c.type === request.type);
        }

        if (request.status) {
            results = results.filter(c => c.status === request.status);
        }

        if (request.priority) {
            results = results.filter(c => c.priority === request.priority);
        }

        if (request.author) {
            results = results.filter(c => c.author.id === request.author || c.author.name === request.author);
        }

        if (request.assignee) {
            results = results.filter(c => c.assignee?.id === request.assignee || c.assignee?.name === request.assignee);
        }

        if (request.tag) {
            results = results.filter(c => c.tags?.includes(request.tag!));
        }

        if (request.query) {
            const query = request.query.toLowerCase();
            results = results.filter(c => c.content.toLowerCase().includes(query));
        }

        if (request.fromDate) {
            const from = new Date(request.fromDate).getTime();
            results = results.filter(c => new Date(c.createdAt).getTime() >= from);
        }

        if (request.toDate) {
            const to = new Date(request.toDate).getTime();
            results = results.filter(c => new Date(c.createdAt).getTime() <= to);
        }

        if (request.limit) {
            results = results.slice(0, request.limit);
        }

        return results;
    }

    async getFileSummary(fileUri: string): Promise<FileCommentSummary> {
        const comments = await this.getComments(fileUri);

        const byType: Record<CommentType, number> = {
            comment: 0, todo: 0, fixme: 0, hack: 0,
            note: 0, warning: 0, question: 0, review: 0
        };

        const byPriority: Record<CommentPriority, number> = {
            low: 0, medium: 0, high: 0, critical: 0
        };

        let openCount = 0;
        let resolvedCount = 0;

        for (const comment of comments) {
            byType[comment.type]++;
            byPriority[comment.priority]++;

            if (comment.status === 'open') {
                openCount++;
            } else if (comment.status === 'resolved') {
                resolvedCount++;
            }
        }

        return {
            fileUri,
            fileName: fileUri.split('/').pop() || fileUri,
            totalComments: comments.length,
            openComments: openCount,
            resolvedComments: resolvedCount,
            todoCount: byType.todo,
            fixmeCount: byType.fixme,
            byType,
            byPriority
        };
    }

    async getWorkspaceSummary(): Promise<FileCommentSummary[]> {
        const summaries: FileCommentSummary[] = [];

        for (const fileUri of this.fileComments.keys()) {
            summaries.push(await this.getFileSummary(fileUri));
        }

        return summaries;
    }

    async resolveAllInFile(fileUri: string): Promise<number> {
        const comments = await this.getComments(fileUri);
        let resolved = 0;

        for (const comment of comments) {
            if (comment.status === 'open') {
                await this.resolveComment(comment.id);
                resolved++;
            }
        }

        return resolved;
    }

    async assignComments(commentIds: string[], assignee: string): Promise<void> {
        for (const id of commentIds) {
            await this.updateComment(id, { assignee });
        }
    }
}
