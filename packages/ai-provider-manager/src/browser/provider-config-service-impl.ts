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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ILogger, MessageService } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser';
import {
    BaseProviderConfigService,
    ValidationResult,
    ProviderConfig,
    ProviderType,
    ModelConfig
} from '../common';

/**
 * Storage key prefix for provider configurations
 */
const STORAGE_PREFIX = 'openclaude.providers';
const API_KEY_PREFIX = 'openclaude.apikeys';

/**
 * Simple encryption for API keys (in production, use proper encryption or credential store)
 * This is a basic obfuscation - for production, integrate with OS keychain
 */
function encodeKey(key: string): string {
    return Buffer.from(key).toString('base64');
}

function decodeKey(encoded: string): string {
    return Buffer.from(encoded, 'base64').toString('utf-8');
}

@injectable()
export class ProviderConfigServiceImpl extends BaseProviderConfigService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected apiKeys = new Map<string, string>();
    protected initialized = false;

    @postConstruct()
    protected async init(): Promise<void> {
        await this.loadProviders();
        await this.loadApiKeys();
        if (this.providers.size === 0) {
            await this.initializeDefaults();
        }
        this.initialized = true;
    }

    async setApiKey(providerId: string, apiKey: string): Promise<void> {
        this.apiKeys.set(providerId, apiKey);
        await this.persistApiKeys();

        // Update provider validation status
        const provider = this.providers.get(providerId);
        if (provider) {
            provider.validated = false;
            provider.validationError = undefined;
            await this.persistProviders();
        }

        this.logger.info(`API key set for provider: ${providerId}`);
    }

    async getApiKey(providerId: string): Promise<string | undefined> {
        return this.apiKeys.get(providerId);
    }

    async validateProvider(providerId: string): Promise<ValidationResult> {
        const provider = this.providers.get(providerId);
        if (!provider) {
            return { valid: false, message: 'Provider not found' };
        }

        const apiKey = await this.getApiKey(providerId);
        if (!apiKey && provider.type !== ProviderType.OLLAMA) {
            return { valid: false, message: 'API key not configured' };
        }

        try {
            const result = await this.performValidation(provider, apiKey);

            // Update provider status
            provider.validated = result.valid;
            provider.lastValidated = Date.now();
            provider.validationError = result.valid ? undefined : result.message;

            if (result.models && result.models.length > 0) {
                // Merge discovered models with existing ones
                const existingIds = new Set(provider.models.map(m => m.id));
                for (const model of result.models) {
                    if (!existingIds.has(model.id)) {
                        provider.models.push(model);
                    }
                }
            }

            await this.persistProviders();
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            provider.validated = false;
            provider.validationError = message;
            await this.persistProviders();
            return { valid: false, message };
        }
    }

    protected async performValidation(provider: ProviderConfig, apiKey?: string): Promise<ValidationResult> {
        // Provider-specific validation
        switch (provider.type) {
            case ProviderType.ANTHROPIC:
                return this.validateAnthropic(provider, apiKey!);
            case ProviderType.OPENAI:
                return this.validateOpenAI(provider, apiKey!);
            case ProviderType.GOOGLE:
                return this.validateGoogle(provider, apiKey!);
            case ProviderType.OLLAMA:
                return this.validateOllama(provider);
            case ProviderType.GROQ:
                return this.validateGroq(provider, apiKey!);
            case ProviderType.OPENROUTER:
                return this.validateOpenRouter(provider, apiKey!);
            default:
                return this.validateGeneric(provider, apiKey);
        }
    }

    protected async validateAnthropic(provider: ProviderConfig, apiKey: string): Promise<ValidationResult> {
        try {
            const response = await fetch(`${provider.apiEndpoint}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-haiku-20241022',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'Hi' }]
                })
            });

            if (response.ok || response.status === 400) {
                // 400 with valid auth means the request format was wrong but auth worked
                return { valid: true, message: 'Anthropic API key validated' };
            }

            if (response.status === 401) {
                return { valid: false, message: 'Invalid API key' };
            }

            return { valid: false, message: `Validation failed: ${response.status}` };
        } catch (error) {
            return { valid: false, message: `Connection failed: ${error}` };
        }
    }

    protected async validateOpenAI(provider: ProviderConfig, apiKey: string): Promise<ValidationResult> {
        try {
            const response = await fetch(`${provider.apiEndpoint}/models`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const models: ModelConfig[] = data.data
                    ?.filter((m: { id: string }) => m.id.startsWith('gpt'))
                    ?.map((m: { id: string }) => ({
                        id: m.id,
                        displayName: m.id,
                        contextWindow: 128000,
                        maxOutputTokens: 4096,
                        costPer1kInput: 0.01,
                        costPer1kOutput: 0.03,
                        capabilities: ['text', 'code', 'streaming']
                    })) || [];

                return { valid: true, message: 'OpenAI API key validated', models };
            }

            if (response.status === 401) {
                return { valid: false, message: 'Invalid API key' };
            }

            return { valid: false, message: `Validation failed: ${response.status}` };
        } catch (error) {
            return { valid: false, message: `Connection failed: ${error}` };
        }
    }

    protected async validateGoogle(provider: ProviderConfig, apiKey: string): Promise<ValidationResult> {
        try {
            const response = await fetch(
                `${provider.apiEndpoint}/v1/models?key=${apiKey}`
            );

            if (response.ok) {
                return { valid: true, message: 'Google AI API key validated' };
            }

            if (response.status === 401 || response.status === 403) {
                return { valid: false, message: 'Invalid API key' };
            }

            return { valid: false, message: `Validation failed: ${response.status}` };
        } catch (error) {
            return { valid: false, message: `Connection failed: ${error}` };
        }
    }

    protected async validateOllama(provider: ProviderConfig): Promise<ValidationResult> {
        try {
            const response = await fetch(`${provider.apiEndpoint}/api/tags`);

            if (response.ok) {
                const data = await response.json();
                const models: ModelConfig[] = data.models?.map((m: { name: string }) => ({
                    id: m.name,
                    displayName: m.name,
                    contextWindow: 4096,
                    maxOutputTokens: 4096,
                    costPer1kInput: 0,
                    costPer1kOutput: 0,
                    capabilities: ['text', 'code', 'streaming']
                })) || [];

                return {
                    valid: true,
                    message: `Ollama connected. ${models.length} models available.`,
                    models
                };
            }

            return { valid: false, message: 'Ollama not responding' };
        } catch (error) {
            return { valid: false, message: `Cannot connect to Ollama at ${provider.apiEndpoint}` };
        }
    }

    protected async validateGroq(provider: ProviderConfig, apiKey: string): Promise<ValidationResult> {
        try {
            const response = await fetch(`${provider.apiEndpoint}/models`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (response.ok) {
                return { valid: true, message: 'Groq API key validated' };
            }

            if (response.status === 401) {
                return { valid: false, message: 'Invalid API key' };
            }

            return { valid: false, message: `Validation failed: ${response.status}` };
        } catch (error) {
            return { valid: false, message: `Connection failed: ${error}` };
        }
    }

    protected async validateOpenRouter(provider: ProviderConfig, apiKey: string): Promise<ValidationResult> {
        try {
            const response = await fetch(`${provider.apiEndpoint}/models`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const models: ModelConfig[] = data.data?.slice(0, 50).map((m: {
                    id: string;
                    name: string;
                    context_length: number;
                    pricing: { prompt: string; completion: string };
                }) => ({
                    id: m.id,
                    displayName: m.name || m.id,
                    contextWindow: m.context_length || 4096,
                    maxOutputTokens: 4096,
                    costPer1kInput: parseFloat(m.pricing?.prompt || '0') * 1000,
                    costPer1kOutput: parseFloat(m.pricing?.completion || '0') * 1000,
                    capabilities: ['text', 'code', 'streaming']
                })) || [];

                return {
                    valid: true,
                    message: 'OpenRouter API key validated',
                    models
                };
            }

            if (response.status === 401) {
                return { valid: false, message: 'Invalid API key' };
            }

            return { valid: false, message: `Validation failed: ${response.status}` };
        } catch (error) {
            return { valid: false, message: `Connection failed: ${error}` };
        }
    }

    protected async validateGeneric(provider: ProviderConfig, apiKey?: string): Promise<ValidationResult> {
        // Generic validation - just check if endpoint is reachable
        try {
            const headers: HeadersInit = {};
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(`${provider.apiEndpoint}/models`, { headers });
            return {
                valid: response.ok || response.status === 401, // 401 means endpoint exists
                message: response.ok ? 'Endpoint reachable' : 'Endpoint requires authentication'
            };
        } catch (error) {
            return { valid: false, message: `Connection failed: ${error}` };
        }
    }

    protected async persistProviders(): Promise<void> {
        const configs = this.getProviders().map(p => ({
            ...p,
            apiKey: undefined // Never persist API keys with configs
        }));
        await this.storageService.setData(`${STORAGE_PREFIX}.configs`, configs);
    }

    protected async loadProviders(): Promise<void> {
        try {
            const configs = await this.storageService.getData<ProviderConfig[]>(`${STORAGE_PREFIX}.configs`);
            if (configs) {
                for (const config of configs) {
                    this.providers.set(config.id, config);
                }
            }
        } catch (error) {
            this.logger.warn('Failed to load provider configs:', error);
        }
    }

    protected async persistApiKeys(): Promise<void> {
        // Encode keys before storing
        const encoded: Record<string, string> = {};
        for (const [id, key] of this.apiKeys.entries()) {
            encoded[id] = encodeKey(key);
        }
        await this.storageService.setData(`${API_KEY_PREFIX}.keys`, encoded);
    }

    protected async loadApiKeys(): Promise<void> {
        try {
            const encoded = await this.storageService.getData<Record<string, string>>(`${API_KEY_PREFIX}.keys`);
            if (encoded) {
                for (const [id, key] of Object.entries(encoded)) {
                    this.apiKeys.set(id, decodeKey(key));
                }
            }
        } catch (error) {
            this.logger.warn('Failed to load API keys:', error);
        }
    }

    protected async deleteApiKey(providerId: string): Promise<void> {
        this.apiKeys.delete(providerId);
        await this.persistApiKeys();
    }
}
