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
import { OpenClaudeBackendService, ChatMessage, ChatSession, ChatUser } from '../../common/openclaude-protocol';

/**
 * Chat widget for real-time collaboration
 */
@injectable()
export class ChatWidget extends ReactWidget {

    static readonly ID = 'openclaude-chat';
    static readonly LABEL = 'OpenClaude Chat';

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    protected currentSession: ChatSession | undefined;
    protected messages: ChatMessage[] = [];
    protected messageInput: string = '';
    protected isTyping: boolean = false;
    protected typingTimeout: number | undefined;

    @postConstruct()
    protected init(): void {
        this.id = ChatWidget.ID;
        this.title.label = ChatWidget.LABEL;
        this.title.caption = ChatWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-comments';

        this.update();
    }

    /**
     * Join a chat session
     */
    async joinSession(sessionId: string): Promise<void> {
        try {
            this.currentSession = await this.backendService.joinChatSession(sessionId);
            await this.loadMessages();
            this.update();
        } catch (error) {
            this.messageService.error(`Failed to join chat session: ${error}`);
        }
    }

    /**
     * Leave current chat session
     */
    async leaveSession(): Promise<void> {
        if (!this.currentSession) {
            return;
        }

        try {
            await this.backendService.leaveChatSession(this.currentSession.id);
            this.currentSession = undefined;
            this.messages = [];
            this.update();
        } catch (error) {
            this.messageService.error(`Failed to leave chat session: ${error}`);
        }
    }

    /**
     * Load messages for current session
     */
    protected async loadMessages(): Promise<void> {
        if (!this.currentSession) {
            return;
        }

        try {
            this.messages = await this.backendService.getChatMessages(this.currentSession.id, 100);
            this.update();

            // Scroll to bottom after messages load
            setTimeout(() => this.scrollToBottom(), 100);
        } catch (error) {
            console.error('[OpenClaude] Failed to load messages:', error);
        }
    }

    /**
     * Send a message
     */
    protected sendMessage = async (): Promise<void> => {
        if (!this.currentSession || !this.messageInput.trim()) {
            return;
        }

        try {
            const message = await this.backendService.sendChatMessage(
                this.currentSession.id,
                this.messageInput
            );

            this.messages.push(message);
            this.messageInput = '';
            this.setTyping(false);
            this.update();

            // Scroll to bottom after sending
            setTimeout(() => this.scrollToBottom(), 100);
        } catch (error) {
            this.messageService.error(`Failed to send message: ${error}`);
        }
    }

    /**
     * Handle input change
     */
    protected handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.messageInput = event.target.value;
        this.setTyping(true);
        this.update();
    }

    /**
     * Handle key press
     */
    protected handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    /**
     * Set typing indicator
     */
    protected setTyping(typing: boolean): void {
        if (!this.currentSession) {
            return;
        }

        // Clear existing timeout
        if (this.typingTimeout) {
            window.clearTimeout(this.typingTimeout);
        }

        // Set typing indicator
        this.isTyping = typing;

        if (typing) {
            // Send typing indicator
            this.backendService.setTypingIndicator(this.currentSession.id, true);

            // Auto-clear after 3 seconds
            this.typingTimeout = window.setTimeout(() => {
                this.setTyping(false);
            }, 3000);
        } else {
            // Clear typing indicator
            this.backendService.setTypingIndicator(this.currentSession.id, false);
        }
    }

    /**
     * Scroll to bottom of messages
     */
    protected scrollToBottom(): void {
        const messagesContainer = this.node.querySelector('.openclaude-chat-messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    /**
     * Format timestamp
     */
    protected formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Get user initials for avatar
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
            <div className='openclaude-chat'>
                {this.renderHeader()}
                {this.currentSession ? this.renderChatContent() : this.renderEmptyState()}
            </div>
        );
    }

    protected renderHeader(): React.ReactNode {
        if (!this.currentSession) {
            return null;
        }

        const onlineUsers = this.currentSession.users.filter(u => u.status === 'online');

        return (
            <div className='openclaude-chat-header'>
                <div className='session-info'>
                    <h3>{this.currentSession.name}</h3>
                    <div className='users-count'>
                        <i className='fa fa-users'></i>
                        <span>{onlineUsers.length} online</span>
                    </div>
                </div>
                <div className='header-actions'>
                    <button className='theia-button secondary' onClick={() => this.leaveSession()}>
                        <i className='fa fa-sign-out'></i>
                        Leave
                    </button>
                </div>
            </div>
        );
    }

    protected renderChatContent(): React.ReactNode {
        return (
            <>
                {this.renderUsers()}
                {this.renderMessages()}
                {this.renderTypingIndicator()}
                {this.renderMessageInput()}
            </>
        );
    }

    protected renderUsers(): React.ReactNode {
        if (!this.currentSession || this.currentSession.users.length === 0) {
            return null;
        }

        return (
            <div className='openclaude-chat-users'>
                {this.currentSession.users.map(user => (
                    <div key={user.id} className={`user-badge ${user.status}`}>
                        {user.avatar ? (
                            <img src={user.avatar} alt={user.name} />
                        ) : (
                            <div className='user-initials'>{this.getUserInitials(user)}</div>
                        )}
                        <span className='user-name'>{user.name}</span>
                        <span className={`status-indicator ${user.status}`}></span>
                    </div>
                ))}
            </div>
        );
    }

    protected renderMessages(): React.ReactNode {
        return (
            <div className='openclaude-chat-messages'>
                {this.messages.length === 0 ? (
                    <div className='no-messages'>
                        <i className='fa fa-comments-o fa-3x'></i>
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                ) : (
                    this.messages.map(message => this.renderMessage(message))
                )}
            </div>
        );
    }

    protected renderMessage(message: ChatMessage): React.ReactNode {
        const isAI = message.isAI || false;

        return (
            <div key={message.id} className={`chat-message ${isAI ? 'ai-message' : 'user-message'}`}>
                <div className='message-avatar'>
                    {message.sender.avatar ? (
                        <img src={message.sender.avatar} alt={message.sender.name} />
                    ) : (
                        <div className='avatar-initials'>{this.getUserInitials(message.sender)}</div>
                    )}
                </div>
                <div className='message-content'>
                    <div className='message-header'>
                        <span className='sender-name'>{message.sender.name}</span>
                        {isAI && <span className='ai-badge'>AI</span>}
                        <span className='message-time'>{this.formatTime(message.timestamp)}</span>
                    </div>
                    <div className='message-text'>{message.content}</div>
                </div>
            </div>
        );
    }

    protected renderTypingIndicator(): React.ReactNode {
        if (!this.currentSession || this.currentSession.typingUsers.length === 0) {
            return null;
        }

        const typingNames = this.currentSession.typingUsers
            .map(u => u.name)
            .join(', ');

        return (
            <div className='typing-indicator'>
                <div className='typing-dots'>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <span className='typing-text'>{typingNames} {this.currentSession.typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
            </div>
        );
    }

    protected renderMessageInput(): React.ReactNode {
        return (
            <div className='openclaude-chat-input'>
                <input
                    type='text'
                    className='theia-input'
                    placeholder='Type a message...'
                    value={this.messageInput}
                    onChange={this.handleInputChange}
                    onKeyPress={this.handleKeyPress}
                />
                <button
                    className='theia-button'
                    onClick={this.sendMessage}
                    disabled={!this.messageInput.trim()}
                >
                    <i className='fa fa-paper-plane'></i>
                    Send
                </button>
            </div>
        );
    }

    protected renderEmptyState(): React.ReactNode {
        return (
            <div className='openclaude-chat-empty'>
                <i className='fa fa-comments-o fa-4x'></i>
                <h4>No Active Chat Session</h4>
                <p>Join or create a chat session to start collaborating</p>
                <button className='theia-button' onClick={() => this.joinSession('default')}>
                    <i className='fa fa-plus'></i>
                    Join Default Session
                </button>
            </div>
        );
    }
}
