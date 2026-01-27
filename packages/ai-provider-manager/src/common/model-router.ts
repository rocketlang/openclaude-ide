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
import {
    ModelConfig,
    ModelCapability,
    ModelSelectionRequest,
    ProviderConfig,
    TaskType,
    DEFAULT_TASK_MODEL_MAPPING,
    ModelPreference
} from './provider-types';

export const ModelRouter = Symbol('ModelRouter');

/**
 * Result of model selection
 */
export interface ModelSelectionResult {
    /** Selected provider */
    provider: ProviderConfig;
    /** Selected model */
    model: ModelConfig;
    /** Reason for selection */
    reason: string;
    /** Alternative models if fallback is needed */
    alternatives: Array<{ provider: ProviderConfig; model: ModelConfig }>;
}

/**
 * Fallback chain entry
 */
export interface FallbackEntry {
    providerId: string;
    modelId: string;
    priority: number;
}

/**
 * Event fired when model routing fails
 */
export interface ModelRoutingFailure {
    request: ModelSelectionRequest;
    reason: string;
    attemptedModels: string[];
}

/**
 * Service for intelligent model routing and selection
 */
export interface ModelRouter extends Disposable {
    /**
     * Select the best model for a given request
     */
    selectModel(request: ModelSelectionRequest): Promise<ModelSelectionResult | undefined>;

    /**
     * Get the fallback chain
     */
    getFallbackChain(): FallbackEntry[];

    /**
     * Set the fallback chain
     */
    setFallbackChain(chain: FallbackEntry[]): void;

    /**
     * Add a model to the fallback chain
     */
    addToFallbackChain(entry: FallbackEntry): void;

    /**
     * Remove a model from the fallback chain
     */
    removeFromFallbackChain(providerId: string, modelId: string): void;

    /**
     * Set task-specific model preferences
     */
    setTaskPreference(taskType: TaskType, preference: ModelPreference): void;

    /**
     * Get task-specific model preference
     */
    getTaskPreference(taskType: TaskType): ModelPreference;

    /**
     * Calculate estimated cost for a request
     */
    estimateCost(model: ModelConfig, inputTokens: number, outputTokens: number): number;

    /**
     * Event fired when routing fails
     */
    readonly onRoutingFailure: Event<ModelRoutingFailure>;
}

/**
 * Abstract base implementation of ModelRouter
 */
export abstract class BaseModelRouter implements ModelRouter {

    protected fallbackChain: FallbackEntry[] = [];
    protected taskPreferences: Map<TaskType, ModelPreference> = new Map();

    protected readonly onRoutingFailureEmitter = new Emitter<ModelRoutingFailure>();
    readonly onRoutingFailure = this.onRoutingFailureEmitter.event;

    constructor() {
        // Initialize with default task preferences
        Object.entries(DEFAULT_TASK_MODEL_MAPPING).forEach(([taskType, preference]) => {
            this.taskPreferences.set(taskType as TaskType, preference);
        });
    }

    dispose(): void {
        this.onRoutingFailureEmitter.dispose();
    }

    abstract selectModel(request: ModelSelectionRequest): Promise<ModelSelectionResult | undefined>;

    getFallbackChain(): FallbackEntry[] {
        return [...this.fallbackChain].sort((a, b) => a.priority - b.priority);
    }

    setFallbackChain(chain: FallbackEntry[]): void {
        this.fallbackChain = [...chain];
    }

    addToFallbackChain(entry: FallbackEntry): void {
        // Remove existing entry for same provider/model
        this.fallbackChain = this.fallbackChain.filter(
            e => !(e.providerId === entry.providerId && e.modelId === entry.modelId)
        );
        this.fallbackChain.push(entry);
    }

    removeFromFallbackChain(providerId: string, modelId: string): void {
        this.fallbackChain = this.fallbackChain.filter(
            e => !(e.providerId === providerId && e.modelId === modelId)
        );
    }

    setTaskPreference(taskType: TaskType, preference: ModelPreference): void {
        this.taskPreferences.set(taskType, preference);
    }

    getTaskPreference(taskType: TaskType): ModelPreference {
        return this.taskPreferences.get(taskType) || DEFAULT_TASK_MODEL_MAPPING[taskType] || {};
    }

    estimateCost(model: ModelConfig, inputTokens: number, outputTokens: number): number {
        const inputCost = (inputTokens / 1000) * model.costPer1kInput;
        const outputCost = (outputTokens / 1000) * model.costPer1kOutput;
        return inputCost + outputCost;
    }

    /**
     * Check if a model has all required capabilities
     */
    protected hasRequiredCapabilities(model: ModelConfig, required?: ModelCapability[]): boolean {
        if (!required || required.length === 0) {
            return true;
        }
        return required.every(cap => model.capabilities.includes(cap));
    }

    /**
     * Check if a model fits the context size requirement
     */
    protected fitsContextSize(model: ModelConfig, contextSize?: number): boolean {
        if (!contextSize) {
            return true;
        }
        return model.contextWindow >= contextSize;
    }

    /**
     * Check if a model fits the cost constraint
     */
    protected fitsCostConstraint(model: ModelConfig, maxCost?: number, estimatedTokens?: number): boolean {
        if (!maxCost || !estimatedTokens) {
            return true;
        }
        // Assume roughly equal input/output tokens for estimation
        const estimatedCost = this.estimateCost(model, estimatedTokens / 2, estimatedTokens / 2);
        return estimatedCost <= maxCost;
    }

    /**
     * Score a model for a given request (higher is better)
     */
    protected scoreModel(
        model: ModelConfig,
        request: ModelSelectionRequest,
        preference: ModelPreference
    ): number {
        let score = 100;

        // Capability match
        if (!this.hasRequiredCapabilities(model, request.capabilities)) {
            return -1; // Disqualify
        }
        if (!this.hasRequiredCapabilities(model, preference.requiredCapabilities)) {
            return -1; // Disqualify
        }

        // Context size fit
        if (!this.fitsContextSize(model, request.contextSize)) {
            return -1; // Disqualify
        }

        // Cost constraint
        if (!this.fitsCostConstraint(model, request.maxCost, request.contextSize)) {
            score -= 50;
        }

        // Model family preference
        if (preference.modelFamily) {
            const modelIdLower = model.id.toLowerCase();
            const displayNameLower = model.displayName.toLowerCase();
            if (modelIdLower.includes(preference.modelFamily) ||
                displayNameLower.includes(preference.modelFamily)) {
                score += 30;
            }
        }

        // Speed preference
        if (preference.preferFast) {
            // Prefer models with lower cost (usually faster)
            score += (1 - model.costPer1kInput) * 20;
        }

        // Accuracy preference
        if (preference.preferAccurate) {
            // Prefer models with higher capability count and cost (usually more capable)
            score += model.capabilities.length * 5;
            score += model.costPer1kInput * 10;
        }

        // Prefer non-deprecated models
        if (model.deprecated) {
            score -= 40;
        }

        // Prefer default models
        if (model.isDefault) {
            score += 10;
        }

        // Local preference
        if (request.preferLocal && model.costPer1kInput === 0) {
            score += 50;
        }

        return score;
    }

    /**
     * Emit routing failure event
     */
    protected emitRoutingFailure(request: ModelSelectionRequest, reason: string, attemptedModels: string[]): void {
        this.onRoutingFailureEmitter.fire({
            request,
            reason,
            attemptedModels
        });
    }
}
