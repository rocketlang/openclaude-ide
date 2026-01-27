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
import { Emitter, Event, ContributionProvider, ILogger } from '@theia/core';
import {
    ContextMentionRegistry,
    EnhancedContextProvider,
    ContextProviderCategory,
    ContextResolutionOptions,
    ResolvedContextMention,
    ContextMentionSuggestion,
    ContextMentionContribution,
    ContextMentionUtils
} from './context-mention-types';

@injectable()
export class ContextMentionRegistryImpl implements ContextMentionRegistry {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ContributionProvider) @named(ContextMentionContribution)
    protected readonly contributions: ContributionProvider<ContextMentionContribution>;

    protected readonly providers = new Map<string, EnhancedContextProvider>();
    protected readonly nameToId = new Map<string, string>();

    protected readonly onProvidersChangedEmitter = new Emitter<void>();
    readonly onProvidersChanged: Event<void> = this.onProvidersChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        for (const contribution of this.contributions.getContributions()) {
            contribution.registerContextProviders(this);
        }
    }

    registerProvider(provider: EnhancedContextProvider): void {
        if (this.providers.has(provider.id)) {
            this.logger.warn(`Context provider with id '${provider.id}' already registered`);
            return;
        }

        const nameLower = provider.name.toLowerCase();
        if (this.nameToId.has(nameLower)) {
            this.logger.warn(`Context provider name '${provider.name}' conflicts with existing provider`);
            return;
        }

        this.providers.set(provider.id, provider);
        this.nameToId.set(nameLower, provider.id);
        this.onProvidersChangedEmitter.fire();
    }

    unregisterProvider(id: string): void {
        const provider = this.providers.get(id);
        if (provider) {
            this.nameToId.delete(provider.name.toLowerCase());
            this.providers.delete(id);
            this.onProvidersChangedEmitter.fire();
        }
    }

    getProvider(name: string): EnhancedContextProvider | undefined {
        const id = this.nameToId.get(name.toLowerCase());
        return id ? this.providers.get(id) : undefined;
    }

    getAllProviders(): EnhancedContextProvider[] {
        return Array.from(this.providers.values());
    }

    getProvidersByCategory(category: ContextProviderCategory): EnhancedContextProvider[] {
        return this.getAllProviders().filter(p => p.category === category);
    }

    async resolve(
        providerName: string,
        arg?: string,
        options?: ContextResolutionOptions
    ): Promise<ResolvedContextMention | undefined> {
        const provider = this.getProvider(providerName);
        if (!provider) {
            this.logger.warn(`Unknown context provider: @${providerName}`);
            return undefined;
        }

        try {
            const canResolve = await provider.canResolve(arg);
            if (!canResolve) {
                return undefined;
            }

            const result = await provider.resolve(arg, options);
            if (result && options?.maxTokens) {
                // Apply token limit if specified
                const { content, truncated } = ContextMentionUtils.truncateToTokenLimit(
                    result.content,
                    options.maxTokens
                );
                if (truncated) {
                    return {
                        ...result,
                        content,
                        truncated: true,
                        originalSize: result.contentSize,
                        contentSize: content.length,
                        tokenEstimate: ContextMentionUtils.estimateTokens(content)
                    };
                }
            }
            return result;
        } catch (error) {
            this.logger.error(`Error resolving context @${providerName}:${arg || ''}:`, error);
            return undefined;
        }
    }

    async getSuggestions(input: string, cursorPosition: number): Promise<ContextMentionSuggestion[]> {
        const beforeCursor = input.slice(0, cursorPosition);

        // Check if we're in a mention context
        const mentionMatch = beforeCursor.match(/@([a-zA-Z][a-zA-Z0-9_-]*)?(?::([^\s]*))?$/);
        if (!mentionMatch) {
            return [];
        }

        const providerPartial = mentionMatch[1] || '';
        const argPartial = mentionMatch[2];

        // If we have an argument partial, get suggestions from the specific provider
        if (argPartial !== undefined && providerPartial) {
            const provider = this.getProvider(providerPartial);
            if (provider?.getSuggestions) {
                const suggestions = await provider.getSuggestions(argPartial);
                return suggestions.map(s => ({
                    ...s,
                    isArgumentSuggestion: true
                }));
            }
            return [];
        }

        // Otherwise, suggest providers
        return this.getProviderSuggestions(providerPartial);
    }

    protected getProviderSuggestions(partial: string): ContextMentionSuggestion[] {
        const partialLower = partial.toLowerCase();
        const suggestions: ContextMentionSuggestion[] = [];

        for (const provider of this.getAllProviders()) {
            const nameLower = provider.name.toLowerCase();
            let score = 0;

            if (nameLower.startsWith(partialLower)) {
                score = 100 - (provider.name.length - partial.length);
            } else if (nameLower.includes(partialLower)) {
                score = 50;
            } else if (partial === '') {
                score = 50;
            }

            if (score > 0) {
                suggestions.push({
                    id: provider.id,
                    providerId: provider.id,
                    label: `@${provider.name}`,
                    description: provider.description,
                    iconClass: provider.iconClass,
                    insertText: provider.acceptsArguments ? `@${provider.name}:` : `@${provider.name}`,
                    sortPriority: score,
                    detail: provider.argumentDescription
                });
            }
        }

        return suggestions.sort((a, b) => b.sortPriority - a.sortPriority);
    }
}
