// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import * as https from 'https';
import * as http from 'http';

/**
 * Configuration for AI Proxy integration
 */
export interface AIProxyConfig {
    /** Whether to use AI proxy */
    enabled: boolean;
    /** AI Proxy URL (e.g., http://localhost:4444) */
    proxyUrl: string;
    /** API key for proxy authentication (optional) */
    apiKey?: string;
    /** Timeout in ms */
    timeout: number;
    /** Whether to use SLM routing for cost savings */
    useSLMRouter: boolean;
    /** Force specific model (overrides SLM router decision) */
    forceModel?: string;
}

/**
 * Request to AI Proxy
 */
export interface AIProxyRequest {
    /** Model to use (can be overridden by SLM router) */
    model: string;
    /** Messages for the conversation */
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    /** Tools/functions available */
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: object;
        };
    }>;
    /** Maximum tokens to generate */
    max_tokens?: number;
    /** Temperature for generation */
    temperature?: number;
    /** Whether to stream the response */
    stream?: boolean;
    /** Response format */
    response_format?: { type: 'text' | 'json_object' };
    /** Metadata for routing/tracking */
    metadata?: {
        session_id?: string;
        agent_id?: string;
        task_id?: string;
        request_type?: string;
    };
}

/**
 * Response from AI Proxy
 */
export interface AIProxyResponse {
    /** Response ID */
    id: string;
    /** Model that was actually used (may differ from request if SLM routed) */
    model: string;
    /** Generated content */
    choices: Array<{
        index: number;
        message: {
            role: 'assistant';
            content: string | null;
            tool_calls?: Array<{
                id: string;
                type: 'function';
                function: {
                    name: string;
                    arguments: string;
                };
            }>;
        };
        finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
    }>;
    /** Usage statistics */
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    /** Cost in USD */
    cost?: number;
    /** Whether SLM was used */
    slm_used?: boolean;
    /** Original model requested (if different from used) */
    original_model?: string;
}

/**
 * Default AI Proxy configuration
 */
const DEFAULT_AI_PROXY_CONFIG: AIProxyConfig = {
    enabled: false,
    proxyUrl: 'http://localhost:4444',
    timeout: 120000, // 2 minutes
    useSLMRouter: true
};

export const AIProxyIntegration = Symbol('AIProxyIntegration');

/**
 * Service for routing LLM calls through ANKR AI Proxy
 */
export interface AIProxyIntegration {
    /**
     * Check if AI proxy is enabled and available
     */
    isAvailable(): Promise<boolean>;

    /**
     * Get current configuration
     */
    getConfig(): AIProxyConfig;

    /**
     * Update configuration
     */
    setConfig(config: Partial<AIProxyConfig>): void;

    /**
     * Make a request through the AI proxy
     */
    request(request: AIProxyRequest): Promise<AIProxyResponse>;

    /**
     * Make a streaming request through the AI proxy
     */
    streamRequest(
        request: AIProxyRequest,
        onChunk: (chunk: string) => void
    ): Promise<AIProxyResponse>;

    /**
     * Get proxy health status
     */
    healthCheck(): Promise<{
        healthy: boolean;
        latency?: number;
        error?: string;
    }>;

    /**
     * Get usage statistics from proxy
     */
    getUsageStats(): Promise<{
        totalRequests: number;
        totalTokens: number;
        totalCost: number;
        slmSavings: number;
    } | undefined>;
}

@injectable()
export class AIProxyIntegrationImpl implements AIProxyIntegration {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected config: AIProxyConfig = { ...DEFAULT_AI_PROXY_CONFIG };

    async isAvailable(): Promise<boolean> {
        if (!this.config.enabled) {
            return false;
        }

        const health = await this.healthCheck();
        return health.healthy;
    }

    getConfig(): AIProxyConfig {
        return { ...this.config };
    }

    setConfig(config: Partial<AIProxyConfig>): void {
        this.config = { ...this.config, ...config };
        this.logger.info(`AI Proxy config updated: enabled=${this.config.enabled}, url=${this.config.proxyUrl}`);
    }

    async request(request: AIProxyRequest): Promise<AIProxyResponse> {
        if (!this.config.enabled) {
            throw new Error('AI Proxy is not enabled');
        }

        const url = new URL('/v1/chat/completions', this.config.proxyUrl);
        const body = JSON.stringify({
            ...request,
            stream: false,
            // Add SLM routing hint
            ...(this.config.useSLMRouter && { slm_routing: true }),
            ...(this.config.forceModel && { model: this.config.forceModel })
        });

        return new Promise((resolve, reject) => {
            const protocol = url.protocol === 'https:' ? https : http;
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
                },
                timeout: this.config.timeout
            };

            const req = protocol.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 400) {
                            reject(new Error(`AI Proxy error: ${res.statusCode} - ${data}`));
                            return;
                        }

                        const response: AIProxyResponse = JSON.parse(data);
                        this.logger.debug(`AI Proxy response: model=${response.model}, tokens=${response.usage?.total_tokens}`);
                        resolve(response);
                    } catch (error) {
                        reject(new Error(`Failed to parse AI Proxy response: ${error}`));
                    }
                });
            });

            req.on('error', (error) => {
                this.logger.error(`AI Proxy request failed: ${error}`);
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('AI Proxy request timed out'));
            });

            req.write(body);
            req.end();
        });
    }

    async streamRequest(
        request: AIProxyRequest,
        onChunk: (chunk: string) => void
    ): Promise<AIProxyResponse> {
        if (!this.config.enabled) {
            throw new Error('AI Proxy is not enabled');
        }

        const url = new URL('/v1/chat/completions', this.config.proxyUrl);
        const body = JSON.stringify({
            ...request,
            stream: true,
            ...(this.config.useSLMRouter && { slm_routing: true }),
            ...(this.config.forceModel && { model: this.config.forceModel })
        });

        return new Promise((resolve, reject) => {
            const protocol = url.protocol === 'https:' ? https : http;
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
                },
                timeout: this.config.timeout
            };

            let fullContent = '';
            let model = request.model;
            let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

            const req = protocol.request(options, (res) => {
                res.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n').filter((line: string) => line.trim());

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                                continue;
                            }

                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices?.[0]?.delta?.content) {
                                    const content = parsed.choices[0].delta.content;
                                    fullContent += content;
                                    onChunk(content);
                                }
                                if (parsed.model) {
                                    model = parsed.model;
                                }
                                if (parsed.usage) {
                                    usage = parsed.usage;
                                }
                            } catch {
                                // Ignore parse errors for partial chunks
                            }
                        }
                    }
                });

                res.on('end', () => {
                    const response: AIProxyResponse = {
                        id: `stream-${Date.now()}`,
                        model,
                        choices: [{
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: fullContent
                            },
                            finish_reason: 'stop'
                        }],
                        usage
                    };
                    resolve(response);
                });
            });

            req.on('error', (error) => {
                this.logger.error(`AI Proxy stream request failed: ${error}`);
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('AI Proxy stream request timed out'));
            });

            req.write(body);
            req.end();
        });
    }

    async healthCheck(): Promise<{
        healthy: boolean;
        latency?: number;
        error?: string;
    }> {
        const startTime = Date.now();

        try {
            const url = new URL('/health', this.config.proxyUrl);
            const protocol = url.protocol === 'https:' ? https : http;

            return new Promise((resolve) => {
                const req = protocol.get(url.toString(), { timeout: 5000 }, (res) => {
                    const latency = Date.now() - startTime;
                    resolve({
                        healthy: res.statusCode === 200,
                        latency
                    });
                });

                req.on('error', (error) => {
                    resolve({
                        healthy: false,
                        error: error.message
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        healthy: false,
                        error: 'Health check timed out'
                    });
                });
            });
        } catch (error) {
            return {
                healthy: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async getUsageStats(): Promise<{
        totalRequests: number;
        totalTokens: number;
        totalCost: number;
        slmSavings: number;
    } | undefined> {
        if (!this.config.enabled) {
            return undefined;
        }

        try {
            const url = new URL('/stats', this.config.proxyUrl);
            const protocol = url.protocol === 'https:' ? https : http;

            return new Promise((resolve) => {
                const req = protocol.get(url.toString(), { timeout: 5000 }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            resolve(undefined);
                        }
                    });
                });

                req.on('error', () => resolve(undefined));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(undefined);
                });
            });
        } catch {
            return undefined;
        }
    }
}
