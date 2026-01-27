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

/**
 * Stream event types
 */
export enum StreamEventType {
    /** Text content chunk */
    TextDelta = 'text_delta',
    /** Start of a code block */
    CodeBlockStart = 'code_block_start',
    /** Code content chunk */
    CodeDelta = 'code_delta',
    /** End of code block */
    CodeBlockEnd = 'code_block_end',
    /** Tool use started */
    ToolUseStart = 'tool_use_start',
    /** Tool use input */
    ToolUseDelta = 'tool_use_delta',
    /** Tool use completed */
    ToolUseEnd = 'tool_use_end',
    /** Stream started */
    StreamStart = 'stream_start',
    /** Stream completed */
    StreamEnd = 'stream_end',
    /** Error occurred */
    Error = 'error',
    /** Thinking/reasoning content */
    ThinkingDelta = 'thinking_delta'
}

/**
 * A single streaming event
 */
export interface StreamEvent {
    type: StreamEventType;
    /** Text content for delta events */
    content?: string;
    /** Code language for code blocks */
    language?: string;
    /** Tool name for tool use events */
    toolName?: string;
    /** Tool input for tool use */
    toolInput?: Record<string, unknown>;
    /** Error message for error events */
    error?: string;
    /** Timestamp */
    timestamp: number;
    /** Token index in stream */
    index: number;
}

/**
 * Streaming response state
 */
export enum StreamState {
    Idle = 'idle',
    Connecting = 'connecting',
    Streaming = 'streaming',
    Paused = 'paused',
    Completed = 'completed',
    Cancelled = 'cancelled',
    Error = 'error'
}

/**
 * Stream statistics
 */
export interface StreamStats {
    /** Total tokens received */
    tokensReceived: number;
    /** Tokens per second */
    tokensPerSecond: number;
    /** Time to first token (ms) */
    timeToFirstToken: number;
    /** Total stream duration (ms) */
    totalDuration: number;
    /** Input tokens (if known) */
    inputTokens?: number;
    /** Output tokens (if known) */
    outputTokens?: number;
}

/**
 * Stream configuration
 */
export interface StreamConfig {
    /** Enable streaming (default: true) */
    enabled: boolean;
    /** Buffer size before rendering (default: 1) */
    bufferSize: number;
    /** Render interval in ms (default: 50) */
    renderInterval: number;
    /** Show typing indicator (default: true) */
    showTypingIndicator: boolean;
    /** Enable cancel button (default: true) */
    enableCancel: boolean;
    /** Auto-scroll during streaming (default: true) */
    autoScroll: boolean;
}

/**
 * Default stream configuration
 */
export const DEFAULT_STREAM_CONFIG: StreamConfig = {
    enabled: true,
    bufferSize: 1,
    renderInterval: 50,
    showTypingIndicator: true,
    enableCancel: true,
    autoScroll: true
};

/**
 * Streaming request options
 */
export interface StreamingRequestOptions {
    /** The prompt/message to send */
    prompt: string;
    /** Model to use */
    model?: string;
    /** System prompt */
    systemPrompt?: string;
    /** Max tokens */
    maxTokens?: number;
    /** Temperature */
    temperature?: number;
    /** Stop sequences */
    stopSequences?: string[];
    /** Enable thinking/extended thinking */
    enableThinking?: boolean;
    /** Conversation history for context */
    conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    /** Abort signal for cancellation */
    abortSignal?: AbortSignal;
}

/**
 * Streaming response
 */
export interface StreamingResponse {
    /** Unique response ID */
    id: string;
    /** Stream state */
    state: StreamState;
    /** Full accumulated content */
    content: string;
    /** Current code block (if any) */
    currentCodeBlock?: {
        language: string;
        content: string;
    };
    /** Statistics */
    stats: StreamStats;
    /** Error if any */
    error?: string;
}

/**
 * Stream handler callbacks
 */
export interface StreamHandlers {
    /** Called for each stream event */
    onEvent?: (event: StreamEvent) => void;
    /** Called when text content is received */
    onText?: (text: string, fullContent: string) => void;
    /** Called when code block starts */
    onCodeStart?: (language: string) => void;
    /** Called when code content is received */
    onCode?: (code: string, fullCode: string) => void;
    /** Called when code block ends */
    onCodeEnd?: (language: string, fullCode: string) => void;
    /** Called when thinking content is received */
    onThinking?: (thinking: string) => void;
    /** Called when stream completes */
    onComplete?: (response: StreamingResponse) => void;
    /** Called on error */
    onError?: (error: Error) => void;
    /** Called when stream is cancelled */
    onCancel?: () => void;
}

/**
 * Service interface for streaming chat
 */
export const StreamingChatService = Symbol('StreamingChatService');
export interface StreamingChatService {
    /**
     * Start a streaming request
     */
    stream(
        options: StreamingRequestOptions,
        handlers: StreamHandlers
    ): Promise<StreamingResponse>;

    /**
     * Cancel an active stream
     */
    cancel(responseId: string): void;

    /**
     * Check if streaming is supported for a provider
     */
    isStreamingSupported(providerId: string): boolean;

    /**
     * Get current stream state
     */
    getStreamState(responseId: string): StreamState | undefined;

    /**
     * Get stream configuration
     */
    getConfig(): StreamConfig;

    /**
     * Update stream configuration
     */
    setConfig(config: Partial<StreamConfig>): void;
}

/**
 * Provider-specific streaming adapter
 */
export const StreamingProviderAdapter = Symbol('StreamingProviderAdapter');
export interface StreamingProviderAdapter {
    /** Provider ID */
    readonly providerId: string;

    /** Whether this provider supports streaming */
    readonly supportsStreaming: boolean;

    /**
     * Create an async iterator for streaming
     */
    createStream(
        options: StreamingRequestOptions
    ): AsyncIterable<StreamEvent>;
}
