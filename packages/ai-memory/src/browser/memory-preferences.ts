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

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema
} from '@theia/core/lib/common/preferences';

export const AI_MEMORY_PREFERENCES_SCOPE = 'ai.memory';

export const aiMemoryPreferenceSchema: PreferenceSchema = {
    properties: {
        'ai.memory.enabled': {
            type: 'boolean',
            default: true,
            description: 'Enable AI memory and learning features.'
        },
        'ai.memory.autoLearn': {
            type: 'boolean',
            default: true,
            description: 'Automatically learn from code as you work.'
        },
        'ai.memory.maxEntries': {
            type: 'number',
            default: 10000,
            minimum: 100,
            maximum: 100000,
            description: 'Maximum number of memory entries to store.'
        },
        'ai.memory.maxCacheSize': {
            type: 'number',
            default: 10,
            minimum: 1,
            maximum: 100,
            description: 'Maximum cache size in megabytes.'
        },
        'ai.memory.cacheTTL': {
            type: 'number',
            default: 30,
            minimum: 1,
            maximum: 1440,
            description: 'Cache time-to-live in minutes.'
        },
        'ai.memory.retentionDays': {
            type: 'number',
            default: 90,
            minimum: 7,
            maximum: 365,
            description: 'Number of days to retain memory entries.'
        },
        'ai.memory.includeConversations': {
            type: 'boolean',
            default: true,
            description: 'Include conversation history in AI context.'
        },
        'ai.memory.includePatterns': {
            type: 'boolean',
            default: true,
            description: 'Include learned coding patterns in AI context.'
        },
        'ai.memory.includeErrorSolutions': {
            type: 'boolean',
            default: true,
            description: 'Include known error solutions in AI context.'
        },
        'ai.memory.maxContextTokens': {
            type: 'number',
            default: 2000,
            minimum: 500,
            maximum: 8000,
            description: 'Maximum tokens to include in AI context.'
        },
        'ai.memory.showStatusBar': {
            type: 'boolean',
            default: true,
            description: 'Show AI memory status in the status bar.'
        },
        'ai.memory.debugMode': {
            type: 'boolean',
            default: false,
            description: 'Enable debug logging for AI memory operations.'
        }
    }
};

export interface AIMemoryConfiguration {
    'ai.memory.enabled': boolean;
    'ai.memory.autoLearn': boolean;
    'ai.memory.maxEntries': number;
    'ai.memory.maxCacheSize': number;
    'ai.memory.cacheTTL': number;
    'ai.memory.retentionDays': number;
    'ai.memory.includeConversations': boolean;
    'ai.memory.includePatterns': boolean;
    'ai.memory.includeErrorSolutions': boolean;
    'ai.memory.maxContextTokens': number;
    'ai.memory.showStatusBar': boolean;
    'ai.memory.debugMode': boolean;
}

export const AIMemoryPreferenceContribution = Symbol('AIMemoryPreferenceContribution');
export const AIMemoryPreferences = Symbol('AIMemoryPreferences');
export type AIMemoryPreferences = PreferenceProxy<AIMemoryConfiguration>;

export function createAIMemoryPreferences(preferences: PreferenceService, schema: PreferenceSchema = aiMemoryPreferenceSchema): AIMemoryPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindAIMemoryPreferences(bind: interfaces.Bind): void {
    bind(AIMemoryPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(AIMemoryPreferenceContribution);
        return createAIMemoryPreferences(preferences, contribution.schema);
    }).inSingletonScope();

    bind(AIMemoryPreferenceContribution).toConstantValue({
        schema: aiMemoryPreferenceSchema
    });

    bind(PreferenceContribution).toService(AIMemoryPreferenceContribution);
}
