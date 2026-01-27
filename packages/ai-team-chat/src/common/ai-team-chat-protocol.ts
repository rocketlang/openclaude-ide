// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const AITeamChatService = Symbol('AITeamChatService');
export const aiTeamChatServicePath = '/services/ai-team-chat';

/**
 * Chat channel types
 */
export type ChannelType = 'public' | 'private' | 'direct';

/**
 * Message types
 */
export type MessageType = 'text' | 'code' | 'file' | 'system' | 'ai-suggestion';

/**
 * User presence status
 */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

/**
 * A chat user
 */
export interface ChatUser {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    status: PresenceStatus;
    lastSeen?: string;
    currentFile?: string;
}

/**
 * A chat channel
 */
export interface ChatChannel {
    id: string;
    name: string;
    type: ChannelType;
    description?: string;
    members: string[];
    createdAt: string;
    createdBy: string;
    unreadCount?: number;
    lastMessage?: ChatMessage;
    isPinned?: boolean;
    isMuted?: boolean;
}

/**
 * Code snippet attachment
 */
export interface CodeSnippet {
    language: string;
    code: string;
    fileName?: string;
    startLine?: number;
    endLine?: number;
    uri?: string;
}

/**
 * File attachment
 */
export interface FileAttachment {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    url?: string;
}

/**
 * Message reaction
 */
export interface MessageReaction {
    emoji: string;
    users: string[];
    count: number;
}

/**
 * A chat message
 */
export interface ChatMessage {
    id: string;
    channelId: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    type: MessageType;
    content: string;
    codeSnippet?: CodeSnippet;
    attachments?: FileAttachment[];
    reactions?: MessageReaction[];
    threadId?: string;
    replyCount?: number;
    mentions?: string[];
    createdAt: string;
    updatedAt?: string;
    isEdited?: boolean;
    isPinned?: boolean;
}

/**
 * Thread of messages
 */
export interface MessageThread {
    id: string;
    parentMessage: ChatMessage;
    replies: ChatMessage[];
    participantIds: string[];
    lastReplyAt?: string;
}

/**
 * Typing indicator
 */
export interface TypingIndicator {
    channelId: string;
    userId: string;
    userName: string;
    isTyping: boolean;
}

/**
 * Send message request
 */
export interface SendMessageRequest {
    channelId: string;
    content: string;
    type?: MessageType;
    codeSnippet?: CodeSnippet;
    threadId?: string;
    mentions?: string[];
}

/**
 * Create channel request
 */
export interface CreateChannelRequest {
    name: string;
    type: ChannelType;
    description?: string;
    members?: string[];
}

/**
 * Search messages request
 */
export interface SearchMessagesRequest {
    query: string;
    channelId?: string;
    userId?: string;
    hasCode?: boolean;
    fromDate?: string;
    toDate?: string;
    limit?: number;
}

/**
 * Chat notification
 */
export interface ChatNotification {
    id: string;
    type: 'mention' | 'reply' | 'reaction' | 'channel-invite';
    channelId: string;
    messageId?: string;
    fromUserId: string;
    fromUserName: string;
    preview: string;
    createdAt: string;
    isRead: boolean;
}

/**
 * Team chat service interface
 */
export interface AITeamChatService {
    // User operations
    getCurrentUser(): Promise<ChatUser>;
    getUser(userId: string): Promise<ChatUser | undefined>;
    getOnlineUsers(): Promise<ChatUser[]>;
    updatePresence(status: PresenceStatus): Promise<void>;

    // Channel operations
    getChannels(): Promise<ChatChannel[]>;
    getChannel(channelId: string): Promise<ChatChannel | undefined>;
    createChannel(request: CreateChannelRequest): Promise<ChatChannel>;
    joinChannel(channelId: string): Promise<void>;
    leaveChannel(channelId: string): Promise<void>;
    updateChannel(channelId: string, updates: Partial<ChatChannel>): Promise<ChatChannel>;
    deleteChannel(channelId: string): Promise<void>;

    // Message operations
    getMessages(channelId: string, limit?: number, before?: string): Promise<ChatMessage[]>;
    sendMessage(request: SendMessageRequest): Promise<ChatMessage>;
    editMessage(messageId: string, content: string): Promise<ChatMessage>;
    deleteMessage(messageId: string): Promise<void>;
    pinMessage(messageId: string): Promise<void>;
    unpinMessage(messageId: string): Promise<void>;

    // Thread operations
    getThread(threadId: string): Promise<MessageThread | undefined>;
    replyToThread(threadId: string, content: string): Promise<ChatMessage>;

    // Reaction operations
    addReaction(messageId: string, emoji: string): Promise<void>;
    removeReaction(messageId: string, emoji: string): Promise<void>;

    // Search
    searchMessages(request: SearchMessagesRequest): Promise<ChatMessage[]>;

    // Typing indicator
    setTyping(channelId: string, isTyping: boolean): Promise<void>;
    getTypingUsers(channelId: string): Promise<TypingIndicator[]>;

    // Notifications
    getNotifications(unreadOnly?: boolean): Promise<ChatNotification[]>;
    markNotificationRead(notificationId: string): Promise<void>;
    markAllNotificationsRead(): Promise<void>;

    // Code sharing
    shareCodeToChat(channelId: string, snippet: CodeSnippet, message?: string): Promise<ChatMessage>;

    // Direct messages
    getOrCreateDirectChannel(userId: string): Promise<ChatChannel>;
}

/**
 * Get presence icon
 */
export function getPresenceIcon(status: PresenceStatus): string {
    switch (status) {
        case 'online': return 'circle-filled';
        case 'away': return 'clock';
        case 'busy': return 'circle-slash';
        case 'offline': return 'circle-outline';
        default: return 'circle-outline';
    }
}

/**
 * Get presence color
 */
export function getPresenceColor(status: PresenceStatus): string {
    switch (status) {
        case 'online': return '#22c55e';
        case 'away': return '#f59e0b';
        case 'busy': return '#ef4444';
        case 'offline': return '#6b7280';
        default: return '#6b7280';
    }
}

/**
 * Get message type icon
 */
export function getMessageTypeIcon(type: MessageType): string {
    switch (type) {
        case 'text': return 'comment';
        case 'code': return 'code';
        case 'file': return 'file';
        case 'system': return 'info';
        case 'ai-suggestion': return 'sparkle';
        default: return 'comment';
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
 * Extract mentions from message content
 */
export function extractMentions(content: string): string[] {
    const regex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        mentions.push(match[1]);
    }
    return mentions;
}

/**
 * Format code snippet for display
 */
export function formatCodeSnippet(snippet: CodeSnippet): string {
    const header = snippet.fileName
        ? `// ${snippet.fileName}${snippet.startLine ? `:${snippet.startLine}` : ''}`
        : `// ${snippet.language}`;

    return `${header}\n${snippet.code}`;
}
