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
import { ILogger } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser';
import {
    BaseModelRouter,
    ModelSelectionResult,
    FallbackEntry,
    ProviderConfigService,
    ModelSelectionRequest,
    ProviderConfig,
    ModelConfig,
    ProviderType
} from '../common';

const STORAGE_KEY = 'openclaude.modelRouter';

@injectable()
export class ModelRouterImpl extends BaseModelRouter {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    @inject(ProviderConfigService)
    protected readonly providerConfigService: ProviderConfigService;

    @postConstruct()
    protected async init(): Promise<void> {
        await this.loadSettings();

        // Update fallback chain when providers change
        this.providerConfigService.onProviderConfigChanged(event => {
            if (event.changeType === 'enabled' || event.changeType === 'disabled') {
                this.updateFallbackChainFromProviders();
            }
        });
    }

    async selectModel(request: ModelSelectionRequest): Promise<ModelSelectionResult | undefined> {
        const enabledProviders = this.providerConfigService.getEnabledProviders();
        if (enabledProviders.length === 0) {
            this.emitRoutingFailure(request, 'No enabled providers', []);
            return undefined;
        }

        const preference = this.getTaskPreference(request.taskType);
        const candidates: Array<{
            provider: ProviderConfig;
            model: ModelConfig;
            score: number;
        }> = [];

        // Check if user has a preferred model
        if (request.preferredProvider && request.preferredModel) {
            const provider = this.providerConfigService.getProvider(request.preferredProvider);
            if (provider?.isEnabled) {
                const model = provider.models.find(m => m.id === request.preferredModel);
                if (model) {
                    const score = this.scoreModel(model, request, preference);
                    if (score >= 0) {
                        return {
                            provider,
                            model,
                            reason: 'User preferred model',
                            alternatives: this.getAlternatives(enabledProviders, request, preference, provider.id, model.id)
                        };
                    }
                }
            }
        }

        // Score all available models
        for (const provider of enabledProviders) {
            // Skip if user prefers local and this isn't local
            if (request.preferLocal && provider.type !== ProviderType.OLLAMA) {
                continue;
            }

            for (const model of provider.models) {
                const score = this.scoreModel(model, request, preference);
                if (score >= 0) {
                    candidates.push({ provider, model, score });
                }
            }
        }

        if (candidates.length === 0) {
            this.emitRoutingFailure(
                request,
                'No models match requirements',
                enabledProviders.flatMap(p => p.models.map(m => `${p.id}/${m.id}`))
            );
            return undefined;
        }

        // Sort by score (highest first)
        candidates.sort((a, b) => b.score - a.score);

        const best = candidates[0];
        const alternatives = candidates.slice(1, 4).map(c => ({
            provider: c.provider,
            model: c.model
        }));

        this.logger.info(`Model router selected: ${best.provider.id}/${best.model.id} (score: ${best.score})`);

        return {
            provider: best.provider,
            model: best.model,
            reason: this.getSelectionReason(best, request, preference),
            alternatives
        };
    }

    protected getSelectionReason(
        selection: { provider: ProviderConfig; model: ModelConfig; score: number },
        request: ModelSelectionRequest,
        preference: { preferFast?: boolean; preferAccurate?: boolean; modelFamily?: string }
    ): string {
        const reasons: string[] = [];

        if (preference.preferFast) {
            reasons.push('optimized for speed');
        }
        if (preference.preferAccurate) {
            reasons.push('optimized for accuracy');
        }
        if (preference.modelFamily && selection.model.id.toLowerCase().includes(preference.modelFamily)) {
            reasons.push(`matches preferred family: ${preference.modelFamily}`);
        }
        if (request.preferLocal && selection.provider.type === ProviderType.OLLAMA) {
            reasons.push('local model preferred');
        }
        if (selection.model.isDefault) {
            reasons.push('provider default');
        }

        return reasons.length > 0
            ? `Selected because: ${reasons.join(', ')}`
            : `Best match for ${request.taskType} task`;
    }

    protected getAlternatives(
        providers: ProviderConfig[],
        request: ModelSelectionRequest,
        preference: { preferFast?: boolean; preferAccurate?: boolean },
        excludeProviderId: string,
        excludeModelId: string
    ): Array<{ provider: ProviderConfig; model: ModelConfig }> {
        const alternatives: Array<{ provider: ProviderConfig; model: ModelConfig; score: number }> = [];

        for (const provider of providers) {
            for (const model of provider.models) {
                if (provider.id === excludeProviderId && model.id === excludeModelId) {
                    continue;
                }
                const score = this.scoreModel(model, request, preference);
                if (score >= 0) {
                    alternatives.push({ provider, model, score });
                }
            }
        }

        return alternatives
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(a => ({ provider: a.provider, model: a.model }));
    }

    protected updateFallbackChainFromProviders(): void {
        const enabledProviders = this.providerConfigService.getEnabledProviders();
        const newChain: FallbackEntry[] = [];

        for (const provider of enabledProviders) {
            const defaultModel = this.providerConfigService.getDefaultModel(provider.id);
            if (defaultModel) {
                newChain.push({
                    providerId: provider.id,
                    modelId: defaultModel.id,
                    priority: provider.priority
                });
            }
        }

        // Merge with existing custom entries
        for (const existing of this.fallbackChain) {
            if (!newChain.some(e => e.providerId === existing.providerId && e.modelId === existing.modelId)) {
                // Keep custom entries that aren't auto-generated
                const provider = this.providerConfigService.getProvider(existing.providerId);
                if (provider?.isEnabled) {
                    newChain.push(existing);
                }
            }
        }

        this.fallbackChain = newChain;
        this.persistSettings();
    }

    protected async loadSettings(): Promise<void> {
        try {
            const data = await this.storageService.getData<{
                fallbackChain: FallbackEntry[];
                taskPreferences: Record<string, unknown>;
            }>(STORAGE_KEY);

            if (data?.fallbackChain) {
                this.fallbackChain = data.fallbackChain;
            }
            if (data?.taskPreferences) {
                for (const [key, value] of Object.entries(data.taskPreferences)) {
                    this.taskPreferences.set(key as never, value as never);
                }
            }
        } catch (error) {
            this.logger.warn('Failed to load model router settings:', error);
        }
    }

    protected async persistSettings(): Promise<void> {
        await this.storageService.setData(STORAGE_KEY, {
            fallbackChain: this.fallbackChain,
            taskPreferences: Object.fromEntries(this.taskPreferences.entries())
        });
    }
}
