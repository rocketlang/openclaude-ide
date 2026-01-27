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
 * Supported AI provider types
 */
export enum ProviderType {
    ANTHROPIC = 'anthropic',
    OPENAI = 'openai',
    GOOGLE = 'google',
    OLLAMA = 'ollama',
    OPENROUTER = 'openrouter',
    GROQ = 'groq',
    AZURE_OPENAI = 'azure_openai',
    AWS_BEDROCK = 'aws_bedrock',
    MISTRAL = 'mistral',
    COHERE = 'cohere',
    CUSTOM = 'custom'
}

/**
 * Model capabilities that can be used for routing decisions
 */
export enum ModelCapability {
    TEXT = 'text',
    CODE = 'code',
    VISION = 'vision',
    FUNCTION_CALLING = 'function_calling',
    JSON_MODE = 'json_mode',
    STREAMING = 'streaming',
    EMBEDDINGS = 'embeddings',
    REASONING = 'reasoning'
}

/**
 * Task types for intelligent model routing
 */
export enum TaskType {
    CHAT = 'chat',
    CODE_COMPLETION = 'code_completion',
    CODE_REVIEW = 'code_review',
    TEST_GENERATION = 'test_generation',
    DOCUMENTATION = 'documentation',
    REFACTORING = 'refactoring',
    QUICK_QUESTION = 'quick_question',
    TERMINAL_COMMAND = 'terminal_command',
    COMMIT_MESSAGE = 'commit_message',
    EXPLAIN_CODE = 'explain_code',
    DEBUG = 'debug'
}

/**
 * Configuration for a specific model
 */
export interface ModelConfig {
    /** Unique model identifier (e.g., 'claude-3-5-sonnet-20241022') */
    id: string;
    /** Display name for UI */
    displayName: string;
    /** Maximum context window in tokens */
    contextWindow: number;
    /** Maximum output tokens */
    maxOutputTokens: number;
    /** Cost per 1K input tokens in USD */
    costPer1kInput: number;
    /** Cost per 1K output tokens in USD */
    costPer1kOutput: number;
    /** Model capabilities */
    capabilities: ModelCapability[];
    /** Whether this is the default model for the provider */
    isDefault?: boolean;
    /** Whether the model is deprecated */
    deprecated?: boolean;
    /** Optional description */
    description?: string;
}

/**
 * Configuration for an AI provider
 */
export interface ProviderConfig {
    /** Unique provider identifier */
    id: string;
    /** Display name */
    name: string;
    /** Provider type */
    type: ProviderType;
    /** API key (stored encrypted) */
    apiKey?: string;
    /** Custom API endpoint (for self-hosted or proxies) */
    apiEndpoint?: string;
    /** Available models */
    models: ModelConfig[];
    /** Whether the provider is enabled */
    isEnabled: boolean;
    /** Priority for fallback chain (lower = higher priority) */
    priority: number;
    /** Additional provider-specific settings */
    settings?: Record<string, unknown>;
    /** Whether connection has been validated */
    validated?: boolean;
    /** Last validation timestamp */
    lastValidated?: number;
    /** Validation error message if any */
    validationError?: string;
}

/**
 * Request for model selection
 */
export interface ModelSelectionRequest {
    /** Type of task being performed */
    taskType: TaskType;
    /** Estimated context size in tokens */
    contextSize?: number;
    /** Required capabilities */
    capabilities?: ModelCapability[];
    /** Prefer local models (e.g., Ollama) */
    preferLocal?: boolean;
    /** Maximum cost per request in USD */
    maxCost?: number;
    /** Preferred provider ID */
    preferredProvider?: string;
    /** Preferred model ID */
    preferredModel?: string;
}

/**
 * Model preferences for task-based routing
 */
export interface ModelPreference {
    /** Prefer fast response time */
    preferFast?: boolean;
    /** Prefer accuracy over speed */
    preferAccurate?: boolean;
    /** Suggested model family (e.g., 'haiku', 'sonnet', 'opus') */
    modelFamily?: string;
    /** Minimum required capabilities */
    requiredCapabilities?: ModelCapability[];
}

/**
 * Default task to model mapping
 */
export const DEFAULT_TASK_MODEL_MAPPING: Record<TaskType, ModelPreference> = {
    [TaskType.QUICK_QUESTION]: { preferFast: true, modelFamily: 'haiku' },
    [TaskType.CODE_COMPLETION]: { preferFast: true, modelFamily: 'haiku', requiredCapabilities: [ModelCapability.CODE] },
    [TaskType.CHAT]: { modelFamily: 'sonnet' },
    [TaskType.CODE_REVIEW]: { preferAccurate: true, modelFamily: 'sonnet', requiredCapabilities: [ModelCapability.CODE] },
    [TaskType.TEST_GENERATION]: { preferAccurate: true, modelFamily: 'sonnet', requiredCapabilities: [ModelCapability.CODE] },
    [TaskType.DOCUMENTATION]: { modelFamily: 'sonnet' },
    [TaskType.REFACTORING]: { preferAccurate: true, modelFamily: 'opus', requiredCapabilities: [ModelCapability.CODE, ModelCapability.REASONING] },
    [TaskType.TERMINAL_COMMAND]: { preferFast: true, modelFamily: 'haiku' },
    [TaskType.COMMIT_MESSAGE]: { preferFast: true, modelFamily: 'haiku' },
    [TaskType.EXPLAIN_CODE]: { modelFamily: 'sonnet', requiredCapabilities: [ModelCapability.CODE] },
    [TaskType.DEBUG]: { preferAccurate: true, modelFamily: 'sonnet', requiredCapabilities: [ModelCapability.CODE, ModelCapability.REASONING] }
};

/**
 * Built-in provider configurations with default models
 */
export const DEFAULT_PROVIDERS: Omit<ProviderConfig, 'apiKey'>[] = [
    {
        id: 'anthropic',
        name: 'Anthropic',
        type: ProviderType.ANTHROPIC,
        apiEndpoint: 'https://api.anthropic.com',
        isEnabled: false,
        priority: 1,
        models: [
            {
                id: 'claude-opus-4-20250514',
                displayName: 'Claude Opus 4',
                contextWindow: 200000,
                maxOutputTokens: 32000,
                costPer1kInput: 0.015,
                costPer1kOutput: 0.075,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.VISION, ModelCapability.FUNCTION_CALLING, ModelCapability.JSON_MODE, ModelCapability.STREAMING, ModelCapability.REASONING],
                description: 'Most capable model for complex tasks'
            },
            {
                id: 'claude-sonnet-4-20250514',
                displayName: 'Claude Sonnet 4',
                contextWindow: 200000,
                maxOutputTokens: 64000,
                costPer1kInput: 0.003,
                costPer1kOutput: 0.015,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.VISION, ModelCapability.FUNCTION_CALLING, ModelCapability.JSON_MODE, ModelCapability.STREAMING, ModelCapability.REASONING],
                isDefault: true,
                description: 'Best balance of capability and cost'
            },
            {
                id: 'claude-3-5-haiku-20241022',
                displayName: 'Claude 3.5 Haiku',
                contextWindow: 200000,
                maxOutputTokens: 8192,
                costPer1kInput: 0.001,
                costPer1kOutput: 0.005,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.VISION, ModelCapability.FUNCTION_CALLING, ModelCapability.JSON_MODE, ModelCapability.STREAMING],
                description: 'Fast and cost-effective'
            }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        type: ProviderType.OPENAI,
        apiEndpoint: 'https://api.openai.com/v1',
        isEnabled: false,
        priority: 2,
        models: [
            {
                id: 'gpt-4o',
                displayName: 'GPT-4o',
                contextWindow: 128000,
                maxOutputTokens: 16384,
                costPer1kInput: 0.005,
                costPer1kOutput: 0.015,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.VISION, ModelCapability.FUNCTION_CALLING, ModelCapability.JSON_MODE, ModelCapability.STREAMING],
                isDefault: true
            },
            {
                id: 'gpt-4o-mini',
                displayName: 'GPT-4o Mini',
                contextWindow: 128000,
                maxOutputTokens: 16384,
                costPer1kInput: 0.00015,
                costPer1kOutput: 0.0006,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.VISION, ModelCapability.FUNCTION_CALLING, ModelCapability.JSON_MODE, ModelCapability.STREAMING]
            },
            {
                id: 'o1',
                displayName: 'o1',
                contextWindow: 200000,
                maxOutputTokens: 100000,
                costPer1kInput: 0.015,
                costPer1kOutput: 0.06,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.REASONING, ModelCapability.JSON_MODE],
                description: 'Advanced reasoning model'
            }
        ]
    },
    {
        id: 'google',
        name: 'Google AI',
        type: ProviderType.GOOGLE,
        apiEndpoint: 'https://generativelanguage.googleapis.com',
        isEnabled: false,
        priority: 3,
        models: [
            {
                id: 'gemini-2.0-flash',
                displayName: 'Gemini 2.0 Flash',
                contextWindow: 1000000,
                maxOutputTokens: 8192,
                costPer1kInput: 0.00015,
                costPer1kOutput: 0.0006,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.VISION, ModelCapability.FUNCTION_CALLING, ModelCapability.JSON_MODE, ModelCapability.STREAMING],
                isDefault: true
            },
            {
                id: 'gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                contextWindow: 2000000,
                maxOutputTokens: 8192,
                costPer1kInput: 0.00125,
                costPer1kOutput: 0.005,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.VISION, ModelCapability.FUNCTION_CALLING, ModelCapability.JSON_MODE, ModelCapability.STREAMING]
            }
        ]
    },
    {
        id: 'ollama',
        name: 'Ollama (Local)',
        type: ProviderType.OLLAMA,
        apiEndpoint: 'http://localhost:11434',
        isEnabled: false,
        priority: 10,
        models: [
            {
                id: 'llama3.2',
                displayName: 'Llama 3.2',
                contextWindow: 128000,
                maxOutputTokens: 4096,
                costPer1kInput: 0,
                costPer1kOutput: 0,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.STREAMING],
                isDefault: true
            },
            {
                id: 'codellama',
                displayName: 'Code Llama',
                contextWindow: 16000,
                maxOutputTokens: 4096,
                costPer1kInput: 0,
                costPer1kOutput: 0,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.STREAMING]
            },
            {
                id: 'deepseek-coder-v2',
                displayName: 'DeepSeek Coder V2',
                contextWindow: 128000,
                maxOutputTokens: 4096,
                costPer1kInput: 0,
                costPer1kOutput: 0,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.STREAMING]
            }
        ]
    },
    {
        id: 'groq',
        name: 'Groq',
        type: ProviderType.GROQ,
        apiEndpoint: 'https://api.groq.com/openai/v1',
        isEnabled: false,
        priority: 4,
        models: [
            {
                id: 'llama-3.3-70b-versatile',
                displayName: 'Llama 3.3 70B',
                contextWindow: 128000,
                maxOutputTokens: 32768,
                costPer1kInput: 0.00059,
                costPer1kOutput: 0.00079,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.FUNCTION_CALLING, ModelCapability.JSON_MODE, ModelCapability.STREAMING],
                isDefault: true
            },
            {
                id: 'mixtral-8x7b-32768',
                displayName: 'Mixtral 8x7B',
                contextWindow: 32768,
                maxOutputTokens: 32768,
                costPer1kInput: 0.00024,
                costPer1kOutput: 0.00024,
                capabilities: [ModelCapability.TEXT, ModelCapability.CODE, ModelCapability.STREAMING]
            }
        ]
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        type: ProviderType.OPENROUTER,
        apiEndpoint: 'https://openrouter.ai/api/v1',
        isEnabled: false,
        priority: 5,
        models: [] // Models fetched dynamically
    }
];
