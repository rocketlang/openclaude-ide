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
 * Streaming adapter for Ollama local models
 * Supports running LLMs locally without API keys
 */
@injectable()
export class OllamaStreamingAdapter implements StreamingProviderAdapter {

    readonly providerId = 'ollama';
    readonly supportsStreaming = true;

    protected apiEndpoint = 'http://localhost:11434/api/chat';

    async *createStream(options: StreamingRequestOptions): AsyncIterable<StreamEvent> {
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
        const body = {
            model: options.model || 'llama3.2',
            messages,
            stream: true,
            options: {
                num_predict: options.maxTokens || 4096,
                temperature: options.temperature ?? 0.7
            }
        };

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
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal: options.abortSignal
            });

            if (!response.ok) {
                const errorText = await response.text();
                yield this.createErrorEvent(`Ollama API error: ${response.status} - ${errorText}`);
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
            let codeBlockLanguage = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // Process newline-delimited JSON
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) {
                        continue;
                    }

                    try {
                        const event = JSON.parse(line);
                        const content = event.message?.content;

                        if (content) {
                            // Detect code blocks
                            const codeBlockMatch = content.match(/```(\w*)/);
                            if (codeBlockMatch && !inCodeBlock) {
                                inCodeBlock = true;
                                codeBlockLanguage = codeBlockMatch[1] || 'text';
                                yield {
                                    type: StreamEventType.CodeBlockStart,
                                    language: codeBlockLanguage,
                                    timestamp: Date.now(),
                                    index: index++
                                };
                            } else if (content.includes('```') && inCodeBlock) {
                                inCodeBlock = false;
                                yield {
                                    type: StreamEventType.CodeBlockEnd,
                                    language: codeBlockLanguage,
                                    timestamp: Date.now(),
                                    index: index++
                                };
                            } else if (inCodeBlock) {
                                yield {
                                    type: StreamEventType.CodeDelta,
                                    content,
                                    timestamp: Date.now(),
                                    index: index++
                                };
                            } else {
                                yield {
                                    type: StreamEventType.TextDelta,
                                    content,
                                    timestamp: Date.now(),
                                    index: index++
                                };
                            }
                        }

                        // Check for completion
                        if (event.done) {
                            break;
                        }
                    } catch {
                        // Ignore JSON parse errors
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

    setEndpoint(endpoint: string): void {
        this.apiEndpoint = endpoint;
    }
}
