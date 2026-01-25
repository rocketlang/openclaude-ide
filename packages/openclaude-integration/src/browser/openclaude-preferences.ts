// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { createPreferenceProxy, PreferenceProxy } from '@theia/core/lib/common/preferences/preference-proxy';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';

/**
 * OpenClaude preference schema
 */
export const OpenClaudeConfigSchema: PreferenceSchema = {
    properties: {
        'openclaude.backend.url': {
            type: 'string',
            default: 'http://localhost:4000/graphql',
            description: 'OpenClaude backend GraphQL endpoint URL'
        },
        'openclaude.backend.apiToken': {
            type: 'string',
            default: '',
            description: 'API authentication token for OpenClaude backend (if required)'
        },
        'openclaude.backend.timeout': {
            type: 'number',
            default: 30000,
            description: 'Request timeout in milliseconds',
            minimum: 1000,
            maximum: 120000
        },
        'openclaude.debug': {
            type: 'boolean',
            default: false,
            description: 'Enable debug logging for OpenClaude integration'
        },
        'openclaude.ai.enabled': {
            type: 'boolean',
            default: true,
            description: 'Enable OpenClaude AI features'
        },
        'openclaude.review.autoRun': {
            type: 'boolean',
            default: false,
            description: 'Automatically run code review on file save'
        },
        'openclaude.review.minSeverity': {
            type: 'string',
            enum: ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'],
            default: 'MAJOR',
            description: 'Minimum severity level to display in code review'
        }
    }
};

/**
 * OpenClaude preference configuration interface
 */
export interface OpenClaudeConfiguration {
    'openclaude.backend.url': string;
    'openclaude.backend.apiToken': string;
    'openclaude.backend.timeout': number;
    'openclaude.debug': boolean;
    'openclaude.ai.enabled': boolean;
    'openclaude.review.autoRun': boolean;
    'openclaude.review.minSeverity': 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
}

export const OpenClaudePreferenceContribution = Symbol('OpenClaudePreferenceContribution');
export const OpenClaudePreferences = Symbol('OpenClaudePreferences');
export type OpenClaudePreferences = PreferenceProxy<OpenClaudeConfiguration>;

export function createOpenClaudePreferences(preferences: PreferenceService, schema: PreferenceSchema = OpenClaudeConfigSchema): OpenClaudePreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindOpenClaudePreferences(bind: interfaces.Bind): void {
    bind(OpenClaudePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(OpenClaudePreferenceContribution);
        return createOpenClaudePreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(OpenClaudePreferenceContribution).toConstantValue({ schema: OpenClaudeConfigSchema });
    bind(PreferenceContribution).toService(OpenClaudePreferenceContribution);
}
