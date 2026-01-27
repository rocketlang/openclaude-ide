// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const AICommentsService = Symbol('AICommentsService');
export const aiCommentsServicePath = '/services/ai-comments';

/**
 * Comment types
 */
export type CommentType = 'comment' | 'todo' | 'fixme' | 'hack' | 'note' | 'warning' | 'question' | 'review';

/**
 * Comment status
 */
export type CommentStatus = 'open' | 'resolved' | 'wontfix' | 'deferred';

/**
 * Comment priority
 */
export type CommentPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * A user who can comment
 */
export interface CommentUser {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
}

/**
 * A position in a file
 */
export interface CommentPosition {
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
}

/**
 * A code comment
 */
export interface CodeComment {
    id: string;
    fileUri: string;
    position: CommentPosition;
    type: CommentType;
    status: CommentStatus;
    priority: CommentPriority;
    content: string;
    author: CommentUser;
    createdAt: string;
    updatedAt?: string;
    resolvedAt?: string;
    resolvedBy?: CommentUser;
    assignee?: CommentUser;
    tags?: string[];
    reactions?: CommentReaction[];
    replyCount?: number;
    codeContext?: string;
}

/**
 * A reply to a comment
 */
export interface CommentReply {
    id: string;
    commentId: string;
    content: string;
    author: CommentUser;
    createdAt: string;
    updatedAt?: string;
    reactions?: CommentReaction[];
}

/**
 * A reaction to a comment or reply
 */
export interface CommentReaction {
    emoji: string;
    users: string[];
    count: number;
}

/**
 * A comment thread (comment + replies)
 */
export interface CommentThread {
    comment: CodeComment;
    replies: CommentReply[];
}

/**
 * Parsed TODO/FIXME from code
 */
export interface ParsedAnnotation {
    type: CommentType;
    content: string;
    fileUri: string;
    position: CommentPosition;
    rawLine: string;
    assignee?: string;
    priority?: CommentPriority;
    tags?: string[];
}

/**
 * Create comment request
 */
export interface CreateCommentRequest {
    fileUri: string;
    position: CommentPosition;
    content: string;
    type?: CommentType;
    priority?: CommentPriority;
    assignee?: string;
    tags?: string[];
}

/**
 * Update comment request
 */
export interface UpdateCommentRequest {
    content?: string;
    status?: CommentStatus;
    priority?: CommentPriority;
    assignee?: string;
    tags?: string[];
}

/**
 * Search comments request
 */
export interface SearchCommentsRequest {
    query?: string;
    fileUri?: string;
    type?: CommentType;
    status?: CommentStatus;
    priority?: CommentPriority;
    author?: string;
    assignee?: string;
    tag?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
}

/**
 * File comment summary
 */
export interface FileCommentSummary {
    fileUri: string;
    fileName: string;
    totalComments: number;
    openComments: number;
    resolvedComments: number;
    todoCount: number;
    fixmeCount: number;
    byType: Record<CommentType, number>;
    byPriority: Record<CommentPriority, number>;
}

/**
 * Comments service interface
 */
export interface AICommentsService {
    // User
    getCurrentUser(): Promise<CommentUser>;

    // Comment operations
    getComments(fileUri: string): Promise<CodeComment[]>;
    getComment(commentId: string): Promise<CodeComment | undefined>;
    createComment(request: CreateCommentRequest): Promise<CodeComment>;
    updateComment(commentId: string, request: UpdateCommentRequest): Promise<CodeComment>;
    deleteComment(commentId: string): Promise<void>;
    resolveComment(commentId: string): Promise<CodeComment>;
    reopenComment(commentId: string): Promise<CodeComment>;

    // Reply operations
    getReplies(commentId: string): Promise<CommentReply[]>;
    addReply(commentId: string, content: string): Promise<CommentReply>;
    updateReply(replyId: string, content: string): Promise<CommentReply>;
    deleteReply(replyId: string): Promise<void>;

    // Thread operations
    getThread(commentId: string): Promise<CommentThread>;
    getThreadsForFile(fileUri: string): Promise<CommentThread[]>;

    // Reaction operations
    addReaction(targetId: string, emoji: string, isReply: boolean): Promise<void>;
    removeReaction(targetId: string, emoji: string, isReply: boolean): Promise<void>;

    // Annotation parsing
    parseAnnotations(fileUri: string, content: string): Promise<ParsedAnnotation[]>;
    getAllAnnotations(directoryUri?: string): Promise<ParsedAnnotation[]>;
    convertAnnotationToComment(annotation: ParsedAnnotation): Promise<CodeComment>;

    // Search
    searchComments(request: SearchCommentsRequest): Promise<CodeComment[]>;
    getFileSummary(fileUri: string): Promise<FileCommentSummary>;
    getWorkspaceSummary(): Promise<FileCommentSummary[]>;

    // Bulk operations
    resolveAllInFile(fileUri: string): Promise<number>;
    assignComments(commentIds: string[], assignee: string): Promise<void>;
}

/**
 * Get comment type icon
 */
export function getCommentTypeIcon(type: CommentType): string {
    switch (type) {
        case 'comment': return 'comment';
        case 'todo': return 'tasklist';
        case 'fixme': return 'bug';
        case 'hack': return 'warning';
        case 'note': return 'note';
        case 'warning': return 'alert';
        case 'question': return 'question';
        case 'review': return 'git-pull-request';
        default: return 'comment';
    }
}

/**
 * Get comment type color
 */
export function getCommentTypeColor(type: CommentType): string {
    switch (type) {
        case 'comment': return '#6b7280';
        case 'todo': return '#3b82f6';
        case 'fixme': return '#ef4444';
        case 'hack': return '#f59e0b';
        case 'note': return '#10b981';
        case 'warning': return '#f97316';
        case 'question': return '#8b5cf6';
        case 'review': return '#06b6d4';
        default: return '#6b7280';
    }
}

/**
 * Get priority icon
 */
export function getPriorityIcon(priority: CommentPriority): string {
    switch (priority) {
        case 'critical': return 'flame';
        case 'high': return 'arrow-up';
        case 'medium': return 'dash';
        case 'low': return 'arrow-down';
        default: return 'dash';
    }
}

/**
 * Get priority color
 */
export function getPriorityColor(priority: CommentPriority): string {
    switch (priority) {
        case 'critical': return '#dc2626';
        case 'high': return '#ea580c';
        case 'medium': return '#ca8a04';
        case 'low': return '#65a30d';
        default: return '#6b7280';
    }
}

/**
 * Get status icon
 */
export function getStatusIcon(status: CommentStatus): string {
    switch (status) {
        case 'open': return 'circle-outline';
        case 'resolved': return 'check';
        case 'wontfix': return 'x';
        case 'deferred': return 'clock';
        default: return 'circle-outline';
    }
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

/**
 * Extract TODO assignee from content
 * Supports: TODO(@username), TODO(username):, TODO - @username
 */
export function extractAssignee(content: string): string | undefined {
    const patterns = [
        /@(\w+)/,
        /\((\w+)\)/,
        /:\s*(\w+)$/
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return undefined;
}

/**
 * Extract tags from content
 * Supports: #tag format
 */
export function extractTags(content: string): string[] {
    const tagPattern = /#(\w+)/g;
    const tags: string[] = [];
    let match;

    while ((match = tagPattern.exec(content)) !== null) {
        tags.push(match[1]);
    }

    return tags;
}

/**
 * Infer priority from content keywords
 */
export function inferPriority(content: string): CommentPriority {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('critical') || lowerContent.includes('urgent') || lowerContent.includes('asap')) {
        return 'critical';
    }
    if (lowerContent.includes('important') || lowerContent.includes('high') || lowerContent.includes('security')) {
        return 'high';
    }
    if (lowerContent.includes('low') || lowerContent.includes('minor') || lowerContent.includes('eventually')) {
        return 'low';
    }

    return 'medium';
}
