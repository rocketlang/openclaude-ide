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

import * as React from 'react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { codicon, StatefulWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import {
    ProviderConfigService,
    ProviderConfig,
    ModelConfig,
    ProviderType,
    CostTracker,
    UsagePeriod,
    ExportFormat
} from '../common';

export const PROVIDER_SETTINGS_WIDGET_ID = 'ai-provider-settings';

interface ProviderSettingsState {
    providers: ProviderConfig[];
    selectedProviderId: string | null;
    apiKeyInputs: Record<string, string>;
    validating: Record<string, boolean>;
    activeTab: 'providers' | 'usage' | 'budget';
    usageData: {
        today: number;
        thisWeek: number;
        thisMonth: number;
    } | null;
}

@injectable()
export class ProviderSettingsWidget extends ReactWidget implements StatefulWidget {

    static readonly ID = PROVIDER_SETTINGS_WIDGET_ID;
    static readonly LABEL = nls.localize('theia/ai/providerSettings', 'AI Provider Settings');

    @inject(ProviderConfigService)
    protected readonly providerConfigService: ProviderConfigService;

    @inject(CostTracker)
    protected readonly costTracker: CostTracker;

    protected state: ProviderSettingsState = {
        providers: [],
        selectedProviderId: null,
        apiKeyInputs: {},
        validating: {},
        activeTab: 'providers',
        usageData: null
    };

    @postConstruct()
    protected init(): void {
        this.id = ProviderSettingsWidget.ID;
        this.title.label = ProviderSettingsWidget.LABEL;
        this.title.caption = ProviderSettingsWidget.LABEL;
        this.title.iconClass = codicon('settings-gear');
        this.title.closable = true;
        this.addClass('ai-provider-settings-widget');

        this.loadProviders();

        // Listen for provider changes
        this.toDispose.push(
            this.providerConfigService.onProviderConfigChanged(() => {
                this.loadProviders();
            })
        );
    }

    storeState(): object {
        return {
            selectedProviderId: this.state.selectedProviderId,
            activeTab: this.state.activeTab
        };
    }

    restoreState(state: { selectedProviderId?: string; activeTab?: string }): void {
        if (state.selectedProviderId) {
            this.state.selectedProviderId = state.selectedProviderId;
        }
        if (state.activeTab) {
            this.state.activeTab = state.activeTab as 'providers' | 'usage' | 'budget';
        }
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.loadProviders();
        this.loadUsageData();
    }

    protected loadProviders(): void {
        const providers = this.providerConfigService.getProviders();
        this.state.providers = providers;
        if (!this.state.selectedProviderId && providers.length > 0) {
            this.state.selectedProviderId = providers[0].id;
        }
        this.update();
    }

    protected async loadUsageData(): Promise<void> {
        const usageData = await this.costTracker.getCurrentSpending();
        this.state.usageData = usageData;
        this.update();
    }

    protected render(): React.ReactNode {
        return (
            <div className="ai-provider-settings-container">
                <div className="settings-tabs">
                    <button
                        className={`tab-button ${this.state.activeTab === 'providers' ? 'active' : ''}`}
                        onClick={() => this.setActiveTab('providers')}
                    >
                        {nls.localize('theia/ai/providers', 'Providers')}
                    </button>
                    <button
                        className={`tab-button ${this.state.activeTab === 'usage' ? 'active' : ''}`}
                        onClick={() => this.setActiveTab('usage')}
                    >
                        {nls.localize('theia/ai/usage', 'Usage')}
                    </button>
                    <button
                        className={`tab-button ${this.state.activeTab === 'budget' ? 'active' : ''}`}
                        onClick={() => this.setActiveTab('budget')}
                    >
                        {nls.localize('theia/ai/budget', 'Budget')}
                    </button>
                </div>

                <div className="settings-content">
                    {this.state.activeTab === 'providers' && this.renderProvidersTab()}
                    {this.state.activeTab === 'usage' && this.renderUsageTab()}
                    {this.state.activeTab === 'budget' && this.renderBudgetTab()}
                </div>
            </div>
        );
    }

    protected renderProvidersTab(): React.ReactNode {
        const selectedProvider = this.state.providers.find(
            p => p.id === this.state.selectedProviderId
        );

        return (
            <div className="providers-tab">
                <div className="providers-list">
                    <h3>{nls.localize('theia/ai/aiProviders', 'AI Providers')}</h3>
                    {this.state.providers.map(provider => (
                        <div
                            key={provider.id}
                            className={`provider-item ${provider.id === this.state.selectedProviderId ? 'selected' : ''} ${provider.isEnabled ? 'enabled' : 'disabled'}`}
                            onClick={() => this.selectProvider(provider.id)}
                        >
                            <span className={`provider-status ${provider.validated ? 'validated' : ''}`}>
                                {provider.isEnabled ? '\u2713' : '\u2717'}
                            </span>
                            <span className="provider-name">{provider.name}</span>
                            <span className="provider-type">{provider.type}</span>
                        </div>
                    ))}
                </div>

                {selectedProvider && (
                    <div className="provider-details">
                        <h3>{selectedProvider.name}</h3>

                        <div className="form-group">
                            <label>{nls.localize('theia/ai/enabled', 'Enabled')}</label>
                            <input
                                type="checkbox"
                                checked={selectedProvider.isEnabled}
                                onChange={e => this.toggleProvider(selectedProvider.id, e.target.checked)}
                            />
                        </div>

                        {selectedProvider.type !== ProviderType.OLLAMA && (
                            <div className="form-group">
                                <label>{nls.localize('theia/ai/apiKey', 'API Key')}</label>
                                <div className="api-key-input">
                                    <input
                                        type="password"
                                        value={this.state.apiKeyInputs[selectedProvider.id] || ''}
                                        onChange={e => this.updateApiKeyInput(selectedProvider.id, e.target.value)}
                                        placeholder={nls.localize('theia/ai/enterApiKey', 'Enter API key...')}
                                    />
                                    <button
                                        className="save-key-button"
                                        onClick={() => this.saveApiKey(selectedProvider.id)}
                                        disabled={!this.state.apiKeyInputs[selectedProvider.id]}
                                    >
                                        {nls.localize('theia/ai/save', 'Save')}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label>{nls.localize('theia/ai/endpoint', 'API Endpoint')}</label>
                            <input
                                type="text"
                                value={selectedProvider.apiEndpoint || ''}
                                onChange={e => this.updateEndpoint(selectedProvider.id, e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label>{nls.localize('theia/ai/priority', 'Priority')}</label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={selectedProvider.priority}
                                onChange={e => this.updatePriority(selectedProvider.id, parseInt(e.target.value))}
                            />
                        </div>

                        <div className="validation-section">
                            <button
                                className="validate-button"
                                onClick={() => this.validateProvider(selectedProvider.id)}
                                disabled={this.state.validating[selectedProvider.id]}
                            >
                                {this.state.validating[selectedProvider.id]
                                    ? nls.localize('theia/ai/validating', 'Validating...')
                                    : nls.localize('theia/ai/testConnection', 'Test Connection')
                                }
                            </button>
                            {selectedProvider.validated !== undefined && (
                                <span className={`validation-status ${selectedProvider.validated ? 'success' : 'error'}`}>
                                    {selectedProvider.validated
                                        ? nls.localize('theia/ai/connectionValid', 'Connection valid')
                                        : selectedProvider.validationError || nls.localize('theia/ai/connectionFailed', 'Connection failed')
                                    }
                                </span>
                            )}
                        </div>

                        <div className="models-section">
                            <h4>{nls.localize('theia/ai/availableModels', 'Available Models')}</h4>
                            <div className="models-list">
                                {selectedProvider.models.map(model => this.renderModelItem(selectedProvider, model))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    protected renderModelItem(provider: ProviderConfig, model: ModelConfig): React.ReactNode {
        return (
            <div key={model.id} className={`model-item ${model.isDefault ? 'default' : ''}`}>
                <div className="model-header">
                    <span className="model-name">{model.displayName}</span>
                    {model.isDefault && <span className="default-badge">{nls.localize('theia/ai/default', 'Default')}</span>}
                </div>
                <div className="model-details">
                    <span className="model-context">
                        {nls.localize('theia/ai/context', 'Context')}: {(model.contextWindow / 1000).toFixed(0)}K
                    </span>
                    <span className="model-cost">
                        ${model.costPer1kInput.toFixed(4)}/{nls.localize('theia/ai/kInput', '1K in')} |
                        ${model.costPer1kOutput.toFixed(4)}/{nls.localize('theia/ai/kOutput', '1K out')}
                    </span>
                </div>
                <div className="model-capabilities">
                    {model.capabilities.map(cap => (
                        <span key={cap} className="capability-badge">{cap}</span>
                    ))}
                </div>
                {!model.isDefault && (
                    <button
                        className="set-default-button"
                        onClick={() => this.setDefaultModel(provider.id, model.id)}
                    >
                        {nls.localize('theia/ai/setDefault', 'Set as Default')}
                    </button>
                )}
            </div>
        );
    }

    protected renderUsageTab(): React.ReactNode {
        const { usageData } = this.state;

        return (
            <div className="usage-tab">
                <h3>{nls.localize('theia/ai/usageOverview', 'Usage Overview')}</h3>

                {usageData && (
                    <div className="usage-summary">
                        <div className="usage-card">
                            <h4>{nls.localize('theia/ai/today', 'Today')}</h4>
                            <span className="usage-amount">${usageData.today.toFixed(4)}</span>
                        </div>
                        <div className="usage-card">
                            <h4>{nls.localize('theia/ai/thisWeek', 'This Week')}</h4>
                            <span className="usage-amount">${usageData.thisWeek.toFixed(4)}</span>
                        </div>
                        <div className="usage-card">
                            <h4>{nls.localize('theia/ai/thisMonth', 'This Month')}</h4>
                            <span className="usage-amount">${usageData.thisMonth.toFixed(4)}</span>
                        </div>
                    </div>
                )}

                <div className="usage-actions">
                    <button onClick={() => this.exportUsage(UsagePeriod.THIS_MONTH, 'csv')}>
                        {nls.localize('theia/ai/exportCSV', 'Export CSV')}
                    </button>
                    <button onClick={() => this.exportUsage(UsagePeriod.THIS_MONTH, 'json')}>
                        {nls.localize('theia/ai/exportJSON', 'Export JSON')}
                    </button>
                </div>
            </div>
        );
    }

    protected renderBudgetTab(): React.ReactNode {
        const budget = this.costTracker.getBudget();

        return (
            <div className="budget-tab">
                <h3>{nls.localize('theia/ai/budgetSettings', 'Budget Settings')}</h3>

                <div className="form-group">
                    <label>{nls.localize('theia/ai/dailyLimit', 'Daily Limit (USD)')}</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={budget?.dailyLimit || ''}
                        onChange={e => this.updateBudget('dailyLimit', parseFloat(e.target.value))}
                        placeholder={nls.localize('theia/ai/noLimit', 'No limit')}
                    />
                </div>

                <div className="form-group">
                    <label>{nls.localize('theia/ai/weeklyLimit', 'Weekly Limit (USD)')}</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={budget?.weeklyLimit || ''}
                        onChange={e => this.updateBudget('weeklyLimit', parseFloat(e.target.value))}
                        placeholder={nls.localize('theia/ai/noLimit', 'No limit')}
                    />
                </div>

                <div className="form-group">
                    <label>{nls.localize('theia/ai/monthlyLimit', 'Monthly Limit (USD)')}</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={budget?.monthlyLimit || ''}
                        onChange={e => this.updateBudget('monthlyLimit', parseFloat(e.target.value))}
                        placeholder={nls.localize('theia/ai/noLimit', 'No limit')}
                    />
                </div>

                <div className="form-group">
                    <label>{nls.localize('theia/ai/warningThreshold', 'Warning Threshold (%)')}</label>
                    <input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={(budget?.warningThreshold || 0.8) * 100}
                        onChange={e => this.updateBudget('warningThreshold', parseFloat(e.target.value) / 100)}
                    />
                </div>

                <div className="form-group">
                    <label>
                        <input
                            type="checkbox"
                            defaultChecked={budget?.hardLimit || false}
                            onChange={e => this.updateBudget('hardLimit', e.target.checked)}
                        />
                        {nls.localize('theia/ai/hardLimit', 'Block requests when budget exceeded')}
                    </label>
                </div>
            </div>
        );
    }

    // Event handlers
    protected setActiveTab(tab: 'providers' | 'usage' | 'budget'): void {
        this.state.activeTab = tab;
        if (tab === 'usage') {
            this.loadUsageData();
        }
        this.update();
    }

    protected selectProvider(providerId: string): void {
        this.state.selectedProviderId = providerId;
        this.update();
    }

    protected async toggleProvider(providerId: string, enabled: boolean): Promise<void> {
        if (enabled) {
            await this.providerConfigService.enableProvider(providerId);
        } else {
            await this.providerConfigService.disableProvider(providerId);
        }
    }

    protected updateApiKeyInput(providerId: string, value: string): void {
        this.state.apiKeyInputs[providerId] = value;
        this.update();
    }

    protected async saveApiKey(providerId: string): Promise<void> {
        const apiKey = this.state.apiKeyInputs[providerId];
        if (apiKey) {
            await this.providerConfigService.setApiKey(providerId, apiKey);
            this.state.apiKeyInputs[providerId] = '';
            this.update();
        }
    }

    protected async updateEndpoint(providerId: string, endpoint: string): Promise<void> {
        const provider = this.providerConfigService.getProvider(providerId);
        if (provider) {
            await this.providerConfigService.setProvider({
                ...provider,
                apiEndpoint: endpoint
            });
        }
    }

    protected async updatePriority(providerId: string, priority: number): Promise<void> {
        await this.providerConfigService.setPriority(providerId, priority);
    }

    protected async validateProvider(providerId: string): Promise<void> {
        this.state.validating[providerId] = true;
        this.update();

        await this.providerConfigService.validateProvider(providerId);

        this.state.validating[providerId] = false;
        this.update();
    }

    protected async setDefaultModel(providerId: string, modelId: string): Promise<void> {
        await this.providerConfigService.setDefaultModel(providerId, modelId);
    }

    protected async exportUsage(period: UsagePeriod, format: 'csv' | 'json'): Promise<void> {
        const data = await this.costTracker.exportUsage(
            period,
            format === 'csv' ? ExportFormat.CSV : ExportFormat.JSON
        );

        // Download file
        const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-usage-${new Date().toISOString().split('T')[0]}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    protected async updateBudget(field: string, value: number | boolean): Promise<void> {
        const currentBudget = this.costTracker.getBudget() || {
            warningThreshold: 0.8,
            hardLimit: false
        };

        await this.costTracker.setBudget({
            ...currentBudget,
            [field]: value
        });
    }
}
