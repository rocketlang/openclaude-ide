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
 * Streaming adapter for OpenAI GPT models
 */
@injectable()
export class OpenAIStreamingAdapter implements StreamingProviderAdapter {

    readonly providerId = 'openai';
    readonly supportsStreaming = true;

    protected apiKey: string | undefined;
    protected apiEndpoint = 'https://api.openai.com/v1/chat/completions';

    async *createStream(options: StreamingRequestOptions): AsyncIterable<StreamEvent> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            yield this.createErrorEvent('OpenAI API key not configured');
            return;
        }

        let index = 0;

        // Build messages array
        const messages: Array<{ role: string; content: string }> = [];

        // Add system prompt
        if (options.systemPrompt) {
            messages.push({
                role: 'system',
                content: options.systemPrompt
            });
        }

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
            model: options.model || 'gpt-4',
            messages,
            stream: true,
            max_tokens: options.maxTokens || 4096
        };

        if (options.temperature !== undefined) {
            body.temperature = options.temperature;
        }

        if (options.stopSequences) {
            body.stop = options.stopSequences;
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
                    'Authorization': `Bearer ${apiKey}`
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
                            const content = event.choices?.[0]?.delta?.content;

                            if (content) {
                                yield {
                                    type: StreamEventType.TextDelta,
                                    content,
                                    timestamp: Date.now(),
                                    index: index++
                                };
                            }
                        } catch {
                            // Ignore JSON parse errors
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
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

    protected createErrorEvent(message: string): StreamEvent {
        return {
            type: StreamEventType.Error,
            error: message,
            timestamp: Date.now(),
            index: 0
        };
    }

    protected getApiKey(): string | undefined {
        if (this.apiKey) {
            return this.apiKey;
        }

        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('openai-api-key');
            if (stored) {
                return stored;
            }
        }

        return undefined;
    }

    setApiKey(key: string): void {
        this.apiKey = key;
    }
}
