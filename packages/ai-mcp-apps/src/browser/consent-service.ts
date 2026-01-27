// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// User Consent Service for MCP Apps
// Handles approval/denial of tool actions with remember options
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser';
import {
    ConsentService,
    ConsentRequest,
    ConsentResponse,
    RiskLevel
} from '../common';

interface StoredConsent {
    appId: string;
    toolName: string;
    approved: boolean;
    permanent: boolean;
    createdAt: number;
    expiresAt?: number;
}

@injectable()
export class ConsentServiceImpl implements ConsentService {

    @inject(StorageService)
    protected readonly storageService: StorageService;

    protected readonly STORAGE_KEY = 'mcp-apps-consents';

    protected sessionConsents: Map<string, boolean> = new Map();
    protected permanentConsents: Map<string, StoredConsent> = new Map();
    protected consentHistory: ConsentResponse[] = [];

    protected pendingRequests: Map<string, {
        resolve: (response: ConsentResponse) => void;
        request: ConsentRequest;
    }> = new Map();

    protected readonly onConsentRequestEmitter = new Emitter<ConsentRequest>();
    readonly onConsentRequest = this.onConsentRequestEmitter.event;

    @postConstruct()
    protected async init(): Promise<void> {
        await this.loadStoredConsents();
    }

    async requestConsent(request: ConsentRequest): Promise<ConsentResponse> {
        // Check if we already have consent
        const key = this.getConsentKey(request.appId, request.toolName);

        // Check permanent consents
        const permanent = this.permanentConsents.get(key);
        if (permanent && permanent.approved) {
            return {
                requestId: request.id,
                approved: true,
                timestamp: Date.now()
            };
        }

        // Check session consents
        if (this.sessionConsents.has(key)) {
            return {
                requestId: request.id,
                approved: this.sessionConsents.get(key)!,
                timestamp: Date.now()
            };
        }

        // Fire event for UI to handle
        this.onConsentRequestEmitter.fire(request);

        // Wait for user response
        return new Promise(resolve => {
            this.pendingRequests.set(request.id, { resolve, request });

            // Timeout after 5 minutes
            setTimeout(() => {
                if (this.pendingRequests.has(request.id)) {
                    this.pendingRequests.delete(request.id);
                    resolve({
                        requestId: request.id,
                        approved: false,
                        timestamp: Date.now()
                    });
                }
            }, 5 * 60 * 1000);
        });
    }

    /**
     * Called by UI when user responds to consent request
     */
    respondToConsent(requestId: string, approved: boolean, remember?: 'session' | 'permanent'): void {
        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
            return;
        }

        const { resolve, request } = pending;
        const key = this.getConsentKey(request.appId, request.toolName);

        // Store consent based on remember option
        if (remember === 'session') {
            this.sessionConsents.set(key, approved);
        } else if (remember === 'permanent') {
            const stored: StoredConsent = {
                appId: request.appId,
                toolName: request.toolName,
                approved,
                permanent: true,
                createdAt: Date.now()
            };
            this.permanentConsents.set(key, stored);
            this.saveStoredConsents();
        }

        const response: ConsentResponse = {
            requestId,
            approved,
            rememberSession: remember === 'session',
            rememberPermanent: remember === 'permanent',
            timestamp: Date.now()
        };

        this.consentHistory.push(response);
        this.pendingRequests.delete(requestId);
        resolve(response);
    }

    hasConsent(appId: string, toolName: string): boolean {
        const key = this.getConsentKey(appId, toolName);

        // Check permanent first
        const permanent = this.permanentConsents.get(key);
        if (permanent) {
            return permanent.approved;
        }

        // Check session
        return this.sessionConsents.get(key) === true;
    }

    getConsentHistory(): ConsentResponse[] {
        return [...this.consentHistory];
    }

    revokeConsent(appId: string, toolName?: string): void {
        if (toolName) {
            const key = this.getConsentKey(appId, toolName);
            this.sessionConsents.delete(key);
            this.permanentConsents.delete(key);
        } else {
            // Revoke all consents for this app
            for (const key of this.sessionConsents.keys()) {
                if (key.startsWith(`${appId}:`)) {
                    this.sessionConsents.delete(key);
                }
            }
            for (const key of this.permanentConsents.keys()) {
                if (key.startsWith(`${appId}:`)) {
                    this.permanentConsents.delete(key);
                }
            }
        }
        this.saveStoredConsents();
    }

    clearAllConsents(): void {
        this.sessionConsents.clear();
        this.permanentConsents.clear();
        this.saveStoredConsents();
    }

    /**
     * Get pending consent request (for UI)
     */
    getPendingRequest(requestId: string): ConsentRequest | undefined {
        return this.pendingRequests.get(requestId)?.request;
    }

    /**
     * Get all pending requests
     */
    getPendingRequests(): ConsentRequest[] {
        return Array.from(this.pendingRequests.values()).map(p => p.request);
    }

    protected getConsentKey(appId: string, toolName: string): string {
        return `${appId}:${toolName}`;
    }

    protected async loadStoredConsents(): Promise<void> {
        try {
            const stored = await this.storageService.getData<StoredConsent[]>(this.STORAGE_KEY);
            if (stored) {
                for (const consent of stored) {
                    const key = this.getConsentKey(consent.appId, consent.toolName);
                    this.permanentConsents.set(key, consent);
                }
            }
        } catch (error) {
            console.error('Failed to load stored consents:', error);
        }
    }

    protected async saveStoredConsents(): Promise<void> {
        try {
            const consents = Array.from(this.permanentConsents.values());
            await this.storageService.setData(this.STORAGE_KEY, consents);
        } catch (error) {
            console.error('Failed to save consents:', error);
        }
    }
}

/**
 * Get risk level display info
 */
export function getRiskLevelInfo(level: RiskLevel): { color: string; label: string; icon: string } {
    switch (level) {
        case RiskLevel.Low:
            return { color: '#4caf50', label: 'Low Risk', icon: 'check-circle' };
        case RiskLevel.Medium:
            return { color: '#ff9800', label: 'Medium Risk', icon: 'warning' };
        case RiskLevel.High:
            return { color: '#f44336', label: 'High Risk', icon: 'error' };
        case RiskLevel.Critical:
            return { color: '#9c27b0', label: 'Critical', icon: 'dangerous' };
        default:
            return { color: '#9e9e9e', label: 'Unknown', icon: 'help' };
    }
}
