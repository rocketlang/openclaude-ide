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

import { injectable, inject, named, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, ContributionProvider } from '@theia/core';
import {
    StreamingChatService,
    StreamingProviderAdapter,
    StreamingRequestOptions,
    StreamHandlers,
    StreamingResponse,
    StreamState,
    StreamConfig,
    StreamEvent,
    StreamEventType,
    DEFAULT_STREAM_CONFIG
} from '../common';

/**
 * Implementation of the streaming chat service
 */
@injectable()
export class StreamingChatServiceImpl implements StreamingChatService {

    @inject(ContributionProvider)
    @named(StreamingProviderAdapter)
    protected readonly adapterProvider: ContributionProvider<StreamingProviderAdapter>;

    protected config: StreamConfig = { ...DEFAULT_STREAM_CONFIG };
    protected activeStreams: Map<string, {
        state: StreamState;
        abortController: AbortController;
        response: StreamingResponse;
    }> = new Map();

    protected readonly onStreamStartEmitter = new Emitter<string>();
    protected readonly onStreamEndEmitter = new Emitter<{ id: string; response: StreamingResponse }>();

    readonly onStreamStart: Event<string> = this.onStreamStartEmitter.event;
    readonly onStreamEnd: Event<{ id: string; response: StreamingResponse }> = this.onStreamEndEmitter.event;

    protected adapters: Map<string, StreamingProviderAdapter> = new Map();

    @postConstruct()
    protected init(): void {
        // Register all adapters
        for (const adapter of this.adapterProvider.getContributions()) {
            this.adapters.set(adapter.providerId, adapter);
        }
    }

    async stream(
        options: StreamingRequestOptions,
        handlers: StreamHandlers
    ): Promise<StreamingResponse> {
        const responseId = this.generateId();
        const abortController = new AbortController();

        // Create initial response
        const response: StreamingResponse = {
            id: responseId,
            state: StreamState.Connecting,
            content: '',
            stats: {
                tokensReceived: 0,
                tokensPerSecond: 0,
                timeToFirstToken: 0,
                totalDuration: 0
            }
        };

        // Store active stream
        this.activeStreams.set(responseId, {
            state: StreamState.Connecting,
            abortController,
            response
        });

        this.onStreamStartEmitter.fire(responseId);

        const startTime = performance.now();
        let firstTokenTime: number | undefined;
        let tokenCount = 0;
        let currentCodeBlock: { language: string; content: string } | undefined;

        try {
            // Get the appropriate adapter
            const adapter = this.getAdapter(options.model);
            if (!adapter) {
                throw new Error(`No streaming adapter found for model: ${options.model}`);
            }

            // Update state to streaming
            response.state = StreamState.Streaming;
            this.updateStreamState(responseId, StreamState.Streaming);

            // Create the stream with abort signal
            const streamOptions: StreamingRequestOptions = {
                ...options,
                abortSignal: abortController.signal
            };

            // Process stream events
            for await (const event of adapter.createStream(streamOptions)) {
                // Check for cancellation
                if (abortController.signal.aborted) {
                    response.state = StreamState.Cancelled;
                    handlers.onCancel?.();
                    break;
                }

                // Track first token time
                if (!firstTokenTime && event.type === StreamEventType.TextDelta) {
                    firstTokenTime = performance.now();
                    response.stats.timeToFirstToken = firstTokenTime - startTime;
                }

                // Process event
                this.processEvent(event, response, handlers, currentCodeBlock);

                // Update token count
                if (event.content) {
                    tokenCount += this.estimateTokens(event.content);
                }

                // Fire event handler
                handlers.onEvent?.(event);

                // Handle code blocks
                if (event.type === StreamEventType.CodeBlockStart) {
                    currentCodeBlock = { language: event.language || 'text', content: '' };
                    handlers.onCodeStart?.(currentCodeBlock.language);
                } else if (event.type === StreamEventType.CodeDelta && currentCodeBlock) {
                    currentCodeBlock.content += event.content || '';
                    handlers.onCode?.(event.content || '', currentCodeBlock.content);
                } else if (event.type === StreamEventType.CodeBlockEnd && currentCodeBlock) {
                    handlers.onCodeEnd?.(currentCodeBlock.language, currentCodeBlock.content);
                    response.currentCodeBlock = undefined;
                    currentCodeBlock = undefined;
                }
            }

            // Complete the stream
            if (response.state !== StreamState.Cancelled) {
                response.state = StreamState.Completed;
            }

        } catch (error) {
            if (abortController.signal.aborted) {
                response.state = StreamState.Cancelled;
                handlers.onCancel?.();
            } else {
                response.state = StreamState.Error;
                response.error = error instanceof Error ? error.message : String(error);
                handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
            }
        } finally {
            // Calculate final stats
            const endTime = performance.now();
            response.stats.totalDuration = endTime - startTime;
            response.stats.tokensReceived = tokenCount;
            response.stats.tokensPerSecond = tokenCount / ((endTime - startTime) / 1000);

            // Cleanup
            this.activeStreams.delete(responseId);
            this.onStreamEndEmitter.fire({ id: responseId, response });

            // Call complete handler
            if (response.state === StreamState.Completed) {
                handlers.onComplete?.(response);
            }
        }

        return response;
    }

    cancel(responseId: string): void {
        const stream = this.activeStreams.get(responseId);
        if (stream) {
            stream.abortController.abort();
            stream.state = StreamState.Cancelled;
            stream.response.state = StreamState.Cancelled;
        }
    }

    isStreamingSupported(providerId: string): boolean {
        const adapter = this.adapters.get(providerId);
        return adapter?.supportsStreaming ?? false;
    }

    getStreamState(responseId: string): StreamState | undefined {
        return this.activeStreams.get(responseId)?.state;
    }

    getConfig(): StreamConfig {
        return { ...this.config };
    }

    setConfig(config: Partial<StreamConfig>): void {
        this.config = { ...this.config, ...config };
    }

    protected getAdapter(model?: string): StreamingProviderAdapter | undefined {
        // If model specified, try to find matching adapter
        if (model) {
            // Try anthropic for claude models
            if (model.toLowerCase().includes('claude')) {
                return this.adapters.get('anthropic');
            }
            // Try openai for gpt models
            if (model.toLowerCase().includes('gpt')) {
                return this.adapters.get('openai');
            }
            // Try ollama for local models
            if (this.adapters.has('ollama')) {
                return this.adapters.get('ollama');
            }
        }

        // Return first available adapter
        for (const adapter of this.adapters.values()) {
            if (adapter.supportsStreaming) {
                return adapter;
            }
        }

        return undefined;
    }

    protected processEvent(
        event: StreamEvent,
        response: StreamingResponse,
        handlers: StreamHandlers,
        _currentCodeBlock?: { language: string; content: string }
    ): void {
        switch (event.type) {
            case StreamEventType.TextDelta:
                response.content += event.content || '';
                handlers.onText?.(event.content || '', response.content);
                break;

            case StreamEventType.ThinkingDelta:
                handlers.onThinking?.(event.content || '');
                break;

            case StreamEventType.Error:
                response.error = event.error;
                break;
        }
    }

    protected updateStreamState(responseId: string, state: StreamState): void {
        const stream = this.activeStreams.get(responseId);
        if (stream) {
            stream.state = state;
            stream.response.state = state;
        }
    }

    protected generateId(): string {
        return `stream-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    protected estimateTokens(text: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
}
