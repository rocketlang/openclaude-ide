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

import { injectable } from '@theia/core/shared/inversify';
import {
    StreamingProviderAdapter,
    StreamingRequestOptions,
    StreamEvent,
    StreamEventType
} from '../common';

/**
 * Streaming adapter for Anthropic Claude models
 * Uses Server-Sent Events (SSE) for streaming
 */
@injectable()
export class AnthropicStreamingAdapter implements StreamingProviderAdapter {

    readonly providerId = 'anthropic';
    readonly supportsStreaming = true;

    protected apiKey: string | undefined;
    protected apiEndpoint = 'https://api.anthropic.com/v1/messages';

    async *createStream(options: StreamingRequestOptions): AsyncIterable<StreamEvent> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            yield this.createErrorEvent('Anthropic API key not configured');
            return;
        }

        let index = 0;

        // Build messages array
        const messages: Array<{ role: string; content: string }> = [];

        // Add conversation history
        if (options.conversationHistory) {
            for (const msg of options.conversationHistory) {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            }
        }

        // Add current prompt
        messages.push({
            role: 'user',
            content: options.prompt
        });

        // Build request body
        const body: Record<string, unknown> = {
            model: options.model || 'claude-sonnet-4-20250514',
            max_tokens: options.maxTokens || 4096,
            messages,
            stream: true
        };

        if (options.systemPrompt) {
            body.system = options.systemPrompt;
        }

        if (options.temperature !== undefined) {
            body.temperature = options.temperature;
        }

        if (options.stopSequences) {
            body.stop_sequences = options.stopSequences;
        }

        // Emit stream start
        yield {
            type: StreamEventType.StreamStart,
            timestamp: Date.now(),
            index: index++
        };

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(body),
                signal: options.abortSignal
            });

            if (!response.ok) {
                const errorText = await response.text();
                yield this.createErrorEvent(`API error: ${response.status} - ${errorText}`);
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                yield this.createErrorEvent('No response body');
                return;
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let inCodeBlock = false;
            let codeLanguage = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // Process SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);

                        if (data === '[DONE]') {
                            continue;
                        }

                        try {
                            const event = JSON.parse(data);
                            const streamEvents = this.processAnthropicEvent(
                                event,
                                index,
                                inCodeBlock,
                                codeLanguage
                            );

                            for (const streamEvent of streamEvents) {
                                // Track code block state
                                if (streamEvent.type === StreamEventType.CodeBlockStart) {
                                    inCodeBlock = true;
                                    codeLanguage = streamEvent.language || '';
                                } else if (streamEvent.type === StreamEventType.CodeBlockEnd) {
                                    inCodeBlock = false;
                                    codeLanguage = '';
                                }

                                yield streamEvent;
                                index++;
                            }
                        } catch {
                            // Ignore JSON parse errors for incomplete data
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                // Stream was cancelled
                return;
            }
            yield this.createErrorEvent(error instanceof Error ? error.message : String(error));
        }

        // Emit stream end
        yield {
            type: StreamEventType.StreamEnd,
            timestamp: Date.now(),
            index: index++
        };
    }

    protected processAnthropicEvent(
        event: Record<string, unknown>,
        index: number,
        inCodeBlock: boolean,
        _codeLanguage: string
    ): StreamEvent[] {
        const events: StreamEvent[] = [];
        const timestamp = Date.now();

        const eventType = event.type as string;

        switch (eventType) {
            case 'content_block_start': {
                const contentBlock = event.content_block as Record<string, unknown> | undefined;
                if (contentBlock?.type === 'thinking') {
                    // Extended thinking block started
                }
                break;
            }

            case 'content_block_delta': {
                const delta = event.delta as Record<string, unknown> | undefined;
                if (delta) {
                    const deltaType = delta.type as string;

                    if (deltaType === 'text_delta') {
                        const text = delta.text as string;

                        // Check for code block markers in the text
                        const codeBlockEvents = this.detectCodeBlocks(text, index, timestamp, inCodeBlock);
                        if (codeBlockEvents.length > 0) {
                            events.push(...codeBlockEvents);
                        } else {
                            events.push({
                                type: inCodeBlock ? StreamEventType.CodeDelta : StreamEventType.TextDelta,
                                content: text,
                                timestamp,
                                index
                            });
                        }
                    } else if (deltaType === 'thinking_delta') {
                        events.push({
                            type: StreamEventType.ThinkingDelta,
                            content: delta.thinking as string,
                            timestamp,
                            index
                        });
                    }
                }
                break;
            }

            case 'message_start': {
                // Message metadata
                break;
            }

            case 'message_delta': {
                // Message completion stats
                break;
            }

            case 'message_stop': {
                // Message completed
                break;
            }

            case 'error': {
                const error = event.error as Record<string, unknown> | undefined;
                events.push({
                    type: StreamEventType.Error,
                    error: error?.message as string || 'Unknown error',
                    timestamp,
                    index
                });
                break;
            }
        }

        return events;
    }

    protected detectCodeBlocks(
        text: string,
        index: number,
        timestamp: number,
        _inCodeBlock: boolean
    ): StreamEvent[] {
        const events: StreamEvent[] = [];

        // Check for code block start: ```language
        const codeStartMatch = text.match(/```(\w*)\n?/);
        if (codeStartMatch) {
            const language = codeStartMatch[1] || 'text';
            const beforeCode = text.slice(0, codeStartMatch.index);
            const afterCode = text.slice((codeStartMatch.index || 0) + codeStartMatch[0].length);

            if (beforeCode) {
                events.push({
                    type: StreamEventType.TextDelta,
                    content: beforeCode,
                    timestamp,
                    index
                });
            }

            events.push({
                type: StreamEventType.CodeBlockStart,
                language,
                timestamp,
                index: index + 1
            });

            if (afterCode) {
                events.push({
                    type: StreamEventType.CodeDelta,
                    content: afterCode,
                    timestamp,
                    index: index + 2
                });
            }

            return events;
        }

        // Check for code block end: ```
        if (text.includes('```')) {
            const parts = text.split('```');
            if (parts.length >= 2) {
                if (parts[0]) {
                    events.push({
                        type: StreamEventType.CodeDelta,
                        content: parts[0],
                        timestamp,
                        index
                    });
                }

                events.push({
                    type: StreamEventType.CodeBlockEnd,
                    timestamp,
                    index: index + 1
                });

                if (parts[1]) {
                    events.push({
                        type: StreamEventType.TextDelta,
                        content: parts[1],
                        timestamp,
                        index: index + 2
                    });
                }

                return events;
            }
        }

        return events;
    }

    protected createErrorEvent(message: string): StreamEvent {
        return {
            type: StreamEventType.Error,
            error: message,
            timestamp: Date.now(),
            index: 0
        };
    }

    protected getApiKey(): string | undefined {
        // Try to get from environment or configuration
        if (this.apiKey) {
            return this.apiKey;
        }

        // Check localStorage for stored key
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('anthropic-api-key');
            if (stored) {
                return stored;
            }
        }

        return undefined;
    }

    setApiKey(key: string): void {
        this.apiKey = key;
    }

    setEndpoint(endpoint: string): void {
        this.apiEndpoint = endpoint;
    }
}
