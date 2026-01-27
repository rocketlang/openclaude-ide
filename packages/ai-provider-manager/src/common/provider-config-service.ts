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

import { Disposable, Emitter, Event } from '@theia/core';
import { ProviderConfig, ProviderType, ModelConfig, DEFAULT_PROVIDERS } from './provider-types';

export const ProviderConfigService = Symbol('ProviderConfigService');

/**
 * Provider validation result
 */
export interface ValidationResult {
    valid: boolean;
    message?: string;
    models?: ModelConfig[];
}

/**
 * Event fired when provider configuration changes
 */
export interface ProviderConfigChangeEvent {
    providerId: string;
    changeType: 'added' | 'updated' | 'removed' | 'enabled' | 'disabled';
}

/**
 * Service for managing AI provider configurations
 */
export interface ProviderConfigService extends Disposable {
    /**
     * Get all configured providers
     */
    getProviders(): ProviderConfig[];

    /**
     * Get enabled providers sorted by priority
     */
    getEnabledProviders(): ProviderConfig[];

    /**
     * Get a specific provider by ID
     */
    getProvider(providerId: string): ProviderConfig | undefined;

    /**
     * Get provider by type
     */
    getProviderByType(type: ProviderType): ProviderConfig | undefined;

    /**
     * Add or update a provider configuration
     */
    setProvider(config: ProviderConfig): Promise<void>;

    /**
     * Remove a provider configuration
     */
    removeProvider(providerId: string): Promise<void>;

    /**
     * Enable a provider
     */
    enableProvider(providerId: string): Promise<void>;

    /**
     * Disable a provider
     */
    disableProvider(providerId: string): Promise<void>;

    /**
     * Set the API key for a provider
     */
    setApiKey(providerId: string, apiKey: string): Promise<void>;

    /**
     * Get the API key for a provider (decrypted)
     */
    getApiKey(providerId: string): Promise<string | undefined>;

    /**
     * Validate a provider's configuration and connection
     */
    validateProvider(providerId: string): Promise<ValidationResult>;

    /**
     * Set provider priority
     */
    setPriority(providerId: string, priority: number): Promise<void>;

    /**
     * Get available models for a provider
     */
    getModels(providerId: string): ModelConfig[];

    /**
     * Get the default model for a provider
     */
    getDefaultModel(providerId: string): ModelConfig | undefined;

    /**
     * Set the default model for a provider
     */
    setDefaultModel(providerId: string, modelId: string): Promise<void>;

    /**
     * Add a custom model to a provider
     */
    addCustomModel(providerId: string, model: ModelConfig): Promise<void>;

    /**
     * Remove a custom model from a provider
     */
    removeCustomModel(providerId: string, modelId: string): Promise<void>;

    /**
     * Initialize with default providers
     */
    initializeDefaults(): Promise<void>;

    /**
     * Export provider configurations (without API keys)
     */
    exportConfigs(): string;

    /**
     * Import provider configurations
     */
    importConfigs(configJson: string): Promise<void>;

    /**
     * Event fired when provider configuration changes
     */
    readonly onProviderConfigChanged: Event<ProviderConfigChangeEvent>;
}

/**
 * Abstract base implementation of ProviderConfigService
 */
export abstract class BaseProviderConfigService implements ProviderConfigService {

    protected providers = new Map<string, ProviderConfig>();
    protected readonly onProviderConfigChangedEmitter = new Emitter<ProviderConfigChangeEvent>();
    readonly onProviderConfigChanged = this.onProviderConfigChangedEmitter.event;

    dispose(): void {
        this.onProviderConfigChangedEmitter.dispose();
    }

    getProviders(): ProviderConfig[] {
        return Array.from(this.providers.values());
    }

    getEnabledProviders(): ProviderConfig[] {
        return this.getProviders()
            .filter(p => p.isEnabled)
            .sort((a, b) => a.priority - b.priority);
    }

    getProvider(providerId: string): ProviderConfig | undefined {
        return this.providers.get(providerId);
    }

    getProviderByType(type: ProviderType): ProviderConfig | undefined {
        return this.getProviders().find(p => p.type === type);
    }

    async setProvider(config: ProviderConfig): Promise<void> {
        const isNew = !this.providers.has(config.id);
        this.providers.set(config.id, config);
        await this.persistProviders();
        this.onProviderConfigChangedEmitter.fire({
            providerId: config.id,
            changeType: isNew ? 'added' : 'updated'
        });
    }

    async removeProvider(providerId: string): Promise<void> {
        if (this.providers.has(providerId)) {
            this.providers.delete(providerId);
            await this.deleteApiKey(providerId);
            await this.persistProviders();
            this.onProviderConfigChangedEmitter.fire({
                providerId,
                changeType: 'removed'
            });
        }
    }

    async enableProvider(providerId: string): Promise<void> {
        const provider = this.providers.get(providerId);
        if (provider && !provider.isEnabled) {
            provider.isEnabled = true;
            await this.persistProviders();
            this.onProviderConfigChangedEmitter.fire({
                providerId,
                changeType: 'enabled'
            });
        }
    }

    async disableProvider(providerId: string): Promise<void> {
        const provider = this.providers.get(providerId);
        if (provider && provider.isEnabled) {
            provider.isEnabled = false;
            await this.persistProviders();
            this.onProviderConfigChangedEmitter.fire({
                providerId,
                changeType: 'disabled'
            });
        }
    }

    async setPriority(providerId: string, priority: number): Promise<void> {
        const provider = this.providers.get(providerId);
        if (provider) {
            provider.priority = priority;
            await this.persistProviders();
            this.onProviderConfigChangedEmitter.fire({
                providerId,
                changeType: 'updated'
            });
        }
    }

    getModels(providerId: string): ModelConfig[] {
        const provider = this.providers.get(providerId);
        return provider?.models || [];
    }

    getDefaultModel(providerId: string): ModelConfig | undefined {
        const models = this.getModels(providerId);
        return models.find(m => m.isDefault) || models[0];
    }

    async setDefaultModel(providerId: string, modelId: string): Promise<void> {
        const provider = this.providers.get(providerId);
        if (provider) {
            provider.models.forEach(m => {
                m.isDefault = m.id === modelId;
            });
            await this.persistProviders();
            this.onProviderConfigChangedEmitter.fire({
                providerId,
                changeType: 'updated'
            });
        }
    }

    async addCustomModel(providerId: string, model: ModelConfig): Promise<void> {
        const provider = this.providers.get(providerId);
        if (provider) {
            // Remove existing model with same ID if present
            provider.models = provider.models.filter(m => m.id !== model.id);
            provider.models.push(model);
            await this.persistProviders();
            this.onProviderConfigChangedEmitter.fire({
                providerId,
                changeType: 'updated'
            });
        }
    }

    async removeCustomModel(providerId: string, modelId: string): Promise<void> {
        const provider = this.providers.get(providerId);
        if (provider) {
            provider.models = provider.models.filter(m => m.id !== modelId);
            await this.persistProviders();
            this.onProviderConfigChangedEmitter.fire({
                providerId,
                changeType: 'updated'
            });
        }
    }

    async initializeDefaults(): Promise<void> {
        for (const defaultProvider of DEFAULT_PROVIDERS) {
            if (!this.providers.has(defaultProvider.id)) {
                this.providers.set(defaultProvider.id, {
                    ...defaultProvider,
                    apiKey: undefined
                });
            }
        }
        await this.persistProviders();
    }

    exportConfigs(): string {
        const configs = this.getProviders().map(p => ({
            ...p,
            apiKey: undefined // Never export API keys
        }));
        return JSON.stringify(configs, null, 2);
    }

    async importConfigs(configJson: string): Promise<void> {
        try {
            const configs = JSON.parse(configJson) as ProviderConfig[];
            for (const config of configs) {
                // Don't import API keys
                config.apiKey = this.providers.get(config.id)?.apiKey;
                await this.setProvider(config);
            }
        } catch (error) {
            throw new Error(`Failed to import configurations: ${error}`);
        }
    }

    // Abstract methods to be implemented by platform-specific subclasses
    abstract setApiKey(providerId: string, apiKey: string): Promise<void>;
    abstract getApiKey(providerId: string): Promise<string | undefined>;
    abstract validateProvider(providerId: string): Promise<ValidationResult>;
    protected abstract persistProviders(): Promise<void>;
    protected abstract loadProviders(): Promise<void>;
    protected abstract deleteApiKey(providerId: string): Promise<void>;
}
