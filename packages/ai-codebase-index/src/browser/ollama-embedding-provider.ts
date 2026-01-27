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

import { injectable } from '@theia/core/shared/inversify';
import { EmbeddingProvider, EmbeddingProviderType } from '../common';

/**
 * Embedding provider using Ollama for local embeddings
 */
@injectable()
export class OllamaEmbeddingProvider implements EmbeddingProvider {

    readonly providerId = EmbeddingProviderType.Ollama;

    protected endpoint = 'http://localhost:11434/api/embeddings';
    protected model = 'nomic-embed-text';
    protected dimension = 768; // nomic-embed-text dimension

    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch('http://localhost:11434/api/tags', {
                method: 'GET'
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async embed(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];

        // Process in batches to avoid overwhelming the server
        const batchSize = 10;
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchEmbeddings = await Promise.all(
                batch.map(text => this.embedSingle(text))
            );
            embeddings.push(...batchEmbeddings);
        }

        return embeddings;
    }

    protected async embedSingle(text: string): Promise<number[]> {
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: text
                })
            });

            if (!response.ok) {
                console.error('Ollama embedding error:', await response.text());
                return this.generateFallbackEmbedding(text);
            }

            const data = await response.json();
            return data.embedding;
        } catch (error) {
            console.error('Ollama embedding error:', error);
            return this.generateFallbackEmbedding(text);
        }
    }

    getDimension(): number {
        return this.dimension;
    }

    setModel(model: string, dimension: number): void {
        this.model = model;
        this.dimension = dimension;
    }

    setEndpoint(endpoint: string): void {
        this.endpoint = endpoint;
    }

    /**
     * Generate a simple fallback embedding when Ollama is unavailable
     * Uses basic TF-IDF-like features
     */
    protected generateFallbackEmbedding(text: string): number[] {
        const embedding = new Array(this.dimension).fill(0);
        const words = text.toLowerCase().split(/\s+/);

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            // Simple hash function
            let hash = 0;
            for (let j = 0; j < word.length; j++) {
                hash = ((hash << 5) - hash) + word.charCodeAt(j);
                hash = hash & hash;
            }

            // Distribute across embedding dimensions
            const idx = Math.abs(hash) % this.dimension;
            embedding[idx] += 1 / Math.sqrt(words.length);
        }

        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
        if (norm > 0) {
            for (let i = 0; i < embedding.length; i++) {
                embedding[i] /= norm;
            }
        }

        return embedding;
    }
}
