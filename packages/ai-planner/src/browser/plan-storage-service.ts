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

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    PlanStorageService,
    ExecutionPlan,
    StepCheckpoint
} from '../common';

const PLANS_STORAGE_KEY = 'openclaude-execution-plans';
const DB_NAME = 'openclaude-planner';
const STORE_NAME = 'plans';

/**
 * Service for persisting execution plans
 */
@injectable()
export class PlanStorageServiceImpl implements PlanStorageService {

    protected plans: Map<string, ExecutionPlan> = new Map();
    protected db: IDBDatabase | undefined;

    @postConstruct()
    protected async init(): Promise<void> {
        await this.loadFromStorage();
    }

    async savePlan(plan: ExecutionPlan): Promise<void> {
        plan.updatedAt = Date.now();
        this.plans.set(plan.id, plan);
        await this.persistToStorage();
    }

    async loadPlan(planId: string): Promise<ExecutionPlan | undefined> {
        return this.plans.get(planId);
    }

    async listPlans(): Promise<ExecutionPlan[]> {
        return Array.from(this.plans.values())
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async deletePlan(planId: string): Promise<void> {
        this.plans.delete(planId);
        await this.persistToStorage();
    }

    async saveCheckpoint(planId: string, stepId: string, checkpoint: StepCheckpoint): Promise<void> {
        const plan = this.plans.get(planId);
        if (plan) {
            const step = plan.steps.find(s => s.id === stepId);
            if (step) {
                step.checkpoint = checkpoint;
                plan.updatedAt = Date.now();
                await this.persistToStorage();
            }
        }
    }

    protected async loadFromStorage(): Promise<void> {
        try {
            // Try IndexedDB first
            const loaded = await this.loadFromIndexedDB();
            if (loaded) {
                return;
            }

            // Fall back to localStorage
            this.loadFromLocalStorage();
        } catch (error) {
            console.error('Failed to load plans:', error);
        }
    }

    protected async persistToStorage(): Promise<void> {
        try {
            // Try IndexedDB first
            await this.persistToIndexedDB();
        } catch (error) {
            console.warn('IndexedDB persist failed, using localStorage:', error);
            this.persistToLocalStorage();
        }
    }

    protected async openDB(): Promise<IDBDatabase> {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    protected async loadFromIndexedDB(): Promise<boolean> {
        try {
            const db = await this.openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const plans = request.result as ExecutionPlan[];
                    if (plans && plans.length > 0) {
                        this.plans.clear();
                        for (const plan of plans) {
                            this.plans.set(plan.id, plan);
                        }
                        console.log(`Loaded ${plans.length} plans from IndexedDB`);
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch {
            return false;
        }
    }

    protected async persistToIndexedDB(): Promise<void> {
        const db = await this.openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Clear and re-add all
        store.clear();

        for (const plan of this.plans.values()) {
            store.put(plan);
        }

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    protected loadFromLocalStorage(): void {
        try {
            const stored = localStorage.getItem(PLANS_STORAGE_KEY);
            if (stored) {
                const plans = JSON.parse(stored) as ExecutionPlan[];
                this.plans.clear();
                for (const plan of plans) {
                    this.plans.set(plan.id, plan);
                }
                console.log(`Loaded ${plans.length} plans from localStorage`);
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
    }

    protected persistToLocalStorage(): void {
        try {
            const plans = Array.from(this.plans.values());
            // Limit to recent plans for localStorage
            const recentPlans = plans
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 50);
            localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(recentPlans));
        } catch (error) {
            console.error('Failed to persist to localStorage:', error);
        }
    }
}
