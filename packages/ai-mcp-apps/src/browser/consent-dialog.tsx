// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// Consent Dialog Widget - User approval UI for MCP App actions
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { DialogProps } from '@theia/core/lib/browser';
import { ConsentRequest } from '../common';
import { ConsentServiceImpl, getRiskLevelInfo } from './consent-service';

export interface ConsentDialogProps extends DialogProps {
    request: ConsentRequest;
    appName: string;
    consentService: ConsentServiceImpl;
}

export class ConsentDialog extends ReactDialog<'approve' | 'deny' | undefined> {

    protected readonly consentService: ConsentServiceImpl;
    protected readonly request: ConsentRequest;
    protected readonly appName: string;
    protected rememberOption: 'none' | 'session' | 'permanent' = 'none';

    constructor(props: ConsentDialogProps) {
        super(props);
        this.consentService = props.consentService;
        this.request = props.request;
        this.appName = props.appName;
        this.title.label = 'Permission Required';
        this.title.iconClass = 'codicon codicon-shield';
        this.appendCloseButton('Deny');
        this.appendAcceptButton('Approve');
    }

    protected override render(): React.ReactNode {
        const riskInfo = getRiskLevelInfo(this.request.riskLevel);

        return (
            <div className="consent-dialog">
                <div className="consent-header">
                    <div className="consent-app-info">
                        <span className="consent-app-name">{this.appName}</span>
                        <span className="consent-tool-name">wants to use <strong>{this.request.toolName}</strong></span>
                    </div>
                </div>

                <div className="consent-message">
                    {this.request.message}
                </div>

                <div className={`consent-risk risk-${this.request.riskLevel}`}>
                    <i className={`codicon codicon-${riskInfo.icon}`} />
                    <span>{riskInfo.label}</span>
                </div>

                {Object.keys(this.request.parameters).length > 0 && (
                    <div className="consent-parameters">
                        <div className="consent-section-title">Parameters</div>
                        <pre className="consent-params-code">
                            {JSON.stringify(this.request.parameters, null, 2)}
                        </pre>
                    </div>
                )}

                <div className="consent-remember">
                    <div className="consent-section-title">Remember this choice</div>
                    <label className="consent-option">
                        <input
                            type="radio"
                            name="remember"
                            checked={this.rememberOption === 'none'}
                            onChange={() => this.setRememberOption('none')}
                        />
                        <span>Ask every time</span>
                    </label>
                    <label className="consent-option">
                        <input
                            type="radio"
                            name="remember"
                            checked={this.rememberOption === 'session'}
                            onChange={() => this.setRememberOption('session')}
                        />
                        <span>Remember for this session</span>
                    </label>
                    <label className="consent-option">
                        <input
                            type="radio"
                            name="remember"
                            checked={this.rememberOption === 'permanent'}
                            onChange={() => this.setRememberOption('permanent')}
                        />
                        <span>Always allow this action</span>
                    </label>
                </div>

                <style>{this.getStyles()}</style>
            </div>
        );
    }

    protected setRememberOption(option: 'none' | 'session' | 'permanent'): void {
        this.rememberOption = option;
        this.update();
    }

    protected override isValid(value: 'approve' | 'deny' | undefined): boolean {
        return value !== undefined;
    }

    override get value(): 'approve' | 'deny' | undefined {
        return this.acceptButton?.classList.contains('main') ? 'approve' : undefined;
    }

    protected override async accept(): Promise<void> {
        this.consentService.respondToConsent(
            this.request.id,
            true,
            this.rememberOption === 'none' ? undefined : this.rememberOption
        );
        super.accept();
    }

    override async close(): Promise<void> {
        this.consentService.respondToConsent(
            this.request.id,
            false,
            this.rememberOption === 'none' ? undefined : this.rememberOption
        );
        super.close();
    }

    protected getStyles(): string {
        return `
            .consent-dialog {
                min-width: 400px;
                max-width: 500px;
            }
            .consent-header {
                margin-bottom: 16px;
            }
            .consent-app-info {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .consent-app-name {
                font-size: 16px;
                font-weight: 600;
            }
            .consent-tool-name {
                font-size: 13px;
                color: var(--theia-descriptionForeground);
            }
            .consent-message {
                padding: 12px;
                background: var(--theia-editor-background);
                border-radius: 6px;
                margin-bottom: 12px;
                font-size: 13px;
            }
            .consent-risk {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border-radius: 4px;
                margin-bottom: 12px;
                font-size: 12px;
                font-weight: 500;
            }
            .consent-risk.risk-low {
                background: rgba(76, 175, 80, 0.15);
                color: #4caf50;
            }
            .consent-risk.risk-medium {
                background: rgba(255, 152, 0, 0.15);
                color: #ff9800;
            }
            .consent-risk.risk-high {
                background: rgba(244, 67, 54, 0.15);
                color: #f44336;
            }
            .consent-risk.risk-critical {
                background: rgba(156, 39, 176, 0.15);
                color: #9c27b0;
            }
            .consent-parameters {
                margin-bottom: 12px;
            }
            .consent-section-title {
                font-size: 11px;
                text-transform: uppercase;
                color: var(--theia-descriptionForeground);
                margin-bottom: 8px;
            }
            .consent-params-code {
                margin: 0;
                padding: 8px;
                background: var(--theia-editor-background);
                border-radius: 4px;
                font-size: 11px;
                overflow: auto;
                max-height: 100px;
            }
            .consent-remember {
                margin-top: 12px;
            }
            .consent-option {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 0;
                cursor: pointer;
                font-size: 13px;
            }
            .consent-option input {
                margin: 0;
            }
        `;
    }
}
