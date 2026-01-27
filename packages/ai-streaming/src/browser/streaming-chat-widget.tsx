// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, Message } from '@theia/core/lib/browser';
import {
    StreamingChatService,
    StreamingResponse,
    StreamStats
} from '../common';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    isStreaming?: boolean;
    stats?: StreamStats;
}

interface StreamingChatState {
    messages: ChatMessage[];
    inputValue: string;
    isStreaming: boolean;
    currentStreamId?: string;
    error?: string;
}

/**
 * Streaming chat widget with real-time response rendering
 */
@injectable()
export class StreamingChatWidget extends ReactWidget {

    static readonly ID = 'streaming-chat-widget';
    static readonly LABEL = 'AI Chat (Streaming)';

    @inject(StreamingChatService)
    protected readonly streamingService: StreamingChatService;

    protected state: StreamingChatState = {
        messages: [],
        inputValue: '',
        isStreaming: false
    };

    protected messagesEndRef: HTMLDivElement | null = null;
    protected inputRef: HTMLTextAreaElement | null = null;

    @postConstruct()
    protected init(): void {
        this.id = StreamingChatWidget.ID;
        this.title.label = StreamingChatWidget.LABEL;
        this.title.caption = StreamingChatWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-comment-discussion';
        this.addClass('streaming-chat-widget');
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.inputRef?.focus();
    }

    protected render(): React.ReactNode {
        return (
            <div className="streaming-chat-container">
                <div className="streaming-chat-messages">
                    {this.state.messages.map(msg => this.renderMessage(msg))}
                    {this.state.isStreaming && this.renderTypingIndicator()}
                    <div ref={el => this.messagesEndRef = el} />
                </div>

                {this.state.error && (
                    <div className="streaming-chat-error">
                        <span className="codicon codicon-error" />
                        {this.state.error}
                        <button onClick={() => this.clearError()}>Dismiss</button>
                    </div>
                )}

                <div className="streaming-chat-input-area">
                    <textarea
                        ref={el => this.inputRef = el}
                        className="streaming-chat-input"
                        placeholder="Type a message... (Ctrl+Enter to send)"
                        value={this.state.inputValue}
                        onChange={e => this.handleInputChange(e.target.value)}
                        onKeyDown={e => this.handleKeyDown(e)}
                        disabled={this.state.isStreaming}
                        rows={3}
                    />
                    <div className="streaming-chat-actions">
                        {this.state.isStreaming ? (
                            <button
                                className="theia-button secondary"
                                onClick={() => this.handleCancel()}
                            >
                                <span className="codicon codicon-debug-stop" />
                                Cancel
                            </button>
                        ) : (
                            <button
                                className="theia-button"
                                onClick={() => this.handleSend()}
                                disabled={!this.state.inputValue.trim()}
                            >
                                <span className="codicon codicon-send" />
                                Send
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    protected renderMessage(message: ChatMessage): React.ReactNode {
        const isUser = message.role === 'user';

        return (
            <div
                key={message.id}
                className={`streaming-chat-message ${isUser ? 'user' : 'assistant'}`}
            >
                <div className="message-header">
                    <span className={`message-avatar codicon ${isUser ? 'codicon-account' : 'codicon-hubot'}`} />
                    <span className="message-role">{isUser ? 'You' : 'Claude'}</span>
                    <span className="message-time">
                        {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                </div>
                <div className="message-content">
                    {this.renderContent(message.content, message.isStreaming)}
                </div>
                {message.stats && !message.isStreaming && (
                    <div className="message-stats">
                        <span title="Tokens">
                            <span className="codicon codicon-symbol-numeric" />
                            {message.stats.tokensReceived}
                        </span>
                        <span title="Speed">
                            <span className="codicon codicon-dashboard" />
                            {message.stats.tokensPerSecond.toFixed(1)} tok/s
                        </span>
                        <span title="Time to first token">
                            <span className="codicon codicon-clock" />
                            {message.stats.timeToFirstToken.toFixed(0)}ms
                        </span>
                    </div>
                )}
            </div>
        );
    }

    protected renderContent(content: string, isStreaming?: boolean): React.ReactNode {
        // Parse content for code blocks
        const parts = this.parseContent(content);

        return (
            <div className="message-text">
                {parts.map((part, index) => {
                    if (part.type === 'code') {
                        return (
                            <div key={index} className="code-block">
                                <div className="code-header">
                                    <span className="code-language">{part.language}</span>
                                    <button
                                        className="code-copy"
                                        onClick={() => this.copyCode(part.content)}
                                        title="Copy code"
                                    >
                                        <span className="codicon codicon-copy" />
                                    </button>
                                </div>
                                <pre><code>{part.content}</code></pre>
                            </div>
                        );
                    }
                    return <span key={index}>{part.content}</span>;
                })}
                {isStreaming && <span className="streaming-cursor">▌</span>}
            </div>
        );
    }

    protected renderTypingIndicator(): React.ReactNode {
        return (
            <div className="typing-indicator">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-text">Claude is thinking...</span>
            </div>
        );
    }

    protected parseContent(content: string): Array<{ type: 'text' | 'code'; content: string; language?: string }> {
        const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
        const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;

        let lastIndex = 0;
        let match;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            // Add text before code block
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    content: content.slice(lastIndex, match.index)
                });
            }

            // Add code block
            parts.push({
                type: 'code',
                language: match[1] || 'text',
                content: match[2]
            });

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < content.length) {
            parts.push({
                type: 'text',
                content: content.slice(lastIndex)
            });
        }

        return parts.length > 0 ? parts : [{ type: 'text', content }];
    }

    protected handleInputChange(value: string): void {
        this.state.inputValue = value;
        this.update();
    }

    protected handleKeyDown(e: React.KeyboardEvent): void {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.handleSend();
        }
    }

    protected async handleSend(): Promise<void> {
        const content = this.state.inputValue.trim();
        if (!content || this.state.isStreaming) {
            return;
        }

        // Add user message
        const userMessage: ChatMessage = {
            id: this.generateId(),
            role: 'user',
            content,
            timestamp: Date.now()
        };

        // Add placeholder for assistant message
        const assistantMessage: ChatMessage = {
            id: this.generateId(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true
        };

        this.state.messages.push(userMessage, assistantMessage);
        this.state.inputValue = '';
        this.state.isStreaming = true;
        this.state.error = undefined;
        this.update();
        this.scrollToBottom();

        try {
            // Build conversation history
            const history = this.state.messages
                .filter(m => m.id !== assistantMessage.id)
                .slice(-10)
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));

            // Start streaming
            const response = await this.streamingService.stream(
                {
                    prompt: content,
                    conversationHistory: history,
                    model: 'claude-sonnet-4-20250514'
                },
                {
                    onText: (text, fullContent) => {
                        assistantMessage.content = fullContent;
                        this.update();
                        this.scrollToBottom();
                    },
                    onCodeStart: (language) => {
                        assistantMessage.content += `\n\`\`\`${language}\n`;
                        this.update();
                    },
                    onCode: (code, _fullCode) => {
                        assistantMessage.content += code;
                        this.update();
                        this.scrollToBottom();
                    },
                    onCodeEnd: () => {
                        assistantMessage.content += '\n```\n';
                        this.update();
                    },
                    onComplete: (resp: StreamingResponse) => {
                        assistantMessage.isStreaming = false;
                        assistantMessage.stats = resp.stats;
                        this.state.isStreaming = false;
                        this.state.currentStreamId = undefined;
                        this.update();
                    },
                    onError: (error: Error) => {
                        assistantMessage.isStreaming = false;
                        assistantMessage.content = `Error: ${error.message}`;
                        this.state.isStreaming = false;
                        this.state.error = error.message;
                        this.update();
                    },
                    onCancel: () => {
                        assistantMessage.isStreaming = false;
                        assistantMessage.content += '\n\n*[Cancelled]*';
                        this.state.isStreaming = false;
                        this.update();
                    }
                }
            );

            this.state.currentStreamId = response.id;

        } catch (error) {
            this.state.isStreaming = false;
            this.state.error = error instanceof Error ? error.message : String(error);
            assistantMessage.isStreaming = false;
            assistantMessage.content = `Error: ${this.state.error}`;
            this.update();
        }
    }

    protected handleCancel(): void {
        if (this.state.currentStreamId) {
            this.streamingService.cancel(this.state.currentStreamId);
        }
    }

    protected clearError(): void {
        this.state.error = undefined;
        this.update();
    }

    protected copyCode(code: string): void {
        navigator.clipboard.writeText(code).catch(console.error);
    }

    protected scrollToBottom(): void {
        if (this.messagesEndRef && this.streamingService.getConfig().autoScroll) {
            this.messagesEndRef.scrollIntoView({ behavior: 'smooth' });
        }
    }

    protected generateId(): string {
        return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}
