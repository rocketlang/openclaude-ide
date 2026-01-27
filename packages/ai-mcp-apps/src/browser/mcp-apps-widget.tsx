// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// MCP Apps Widget - Display and manage MCP Apps
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import {
    MCPAppsService,
    MCPApp,
    AppInstance,
    AppRenderer
} from '../common';

@injectable()
export class MCPAppsWidget extends ReactWidget {

    static readonly ID = 'mcp-apps-widget';
    static readonly LABEL = 'MCP Apps';

    @inject(MCPAppsService)
    protected readonly appsService: MCPAppsService;

    @inject(AppRenderer)
    protected readonly appRenderer: AppRenderer;

    protected apps: MCPApp[] = [];
    protected instances: AppInstance[] = [];
    protected selectedAppId?: string;

    @postConstruct()
    protected init(): void {
        this.id = MCPAppsWidget.ID;
        this.title.label = MCPAppsWidget.LABEL;
        this.title.caption = 'MCP Apps - Interactive Widgets';
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-extensions';
        this.addClass('mcp-apps-widget');

        this.loadApps();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected loadApps(): void {
        this.apps = this.appsService.getApps();
        this.instances = this.appsService.getInstances();
        this.update();
    }

    protected render(): React.ReactNode {
        return (
            <div className="mcp-apps-container">
                <div className="mcp-apps-header">
                    <h3>MCP Apps</h3>
                    <span className="mcp-apps-count">{this.apps.length} apps available</span>
                </div>

                <div className="mcp-apps-content">
                    <div className="mcp-apps-list">
                        {this.apps.map(app => this.renderAppCard(app))}
                    </div>

                    {this.selectedAppId && (
                        <div className="mcp-app-preview">
                            {this.renderAppPreview()}
                        </div>
                    )}
                </div>

                {this.instances.length > 0 && (
                    <div className="mcp-apps-instances">
                        <h4>Running Apps</h4>
                        {this.instances.map(instance => this.renderInstance(instance))}
                    </div>
                )}

                <style>{this.getStyles()}</style>
            </div>
        );
    }

    protected renderAppCard(app: MCPApp): React.ReactNode {
        const isSelected = app.id === this.selectedAppId;
        const isRunning = this.instances.some(i => i.app.id === app.id);

        return (
            <div
                key={app.id}
                className={`mcp-app-card ${isSelected ? 'selected' : ''} ${isRunning ? 'running' : ''}`}
                onClick={() => this.selectApp(app.id)}
            >
                <div className="mcp-app-icon">
                    {app.iconUrl ? (
                        <img src={app.iconUrl} alt={app.name} />
                    ) : (
                        <i className="codicon codicon-extensions" />
                    )}
                </div>
                <div className="mcp-app-info">
                    <div className="mcp-app-name">{app.name}</div>
                    <div className="mcp-app-description">{app.description}</div>
                    <div className="mcp-app-publisher">{app.publisher}</div>
                </div>
                <div className="mcp-app-actions">
                    {isRunning ? (
                        <span className="mcp-app-status running">Running</span>
                    ) : (
                        <button
                            className="mcp-app-launch"
                            onClick={e => {
                                e.stopPropagation();
                                this.launchApp(app.id);
                            }}
                        >
                            Launch
                        </button>
                    )}
                </div>
            </div>
        );
    }

    protected renderAppPreview(): React.ReactNode {
        const app = this.apps.find(a => a.id === this.selectedAppId);
        if (!app) {
            return null;
        }

        return (
            <div className="mcp-app-detail">
                <div className="mcp-app-detail-header">
                    <h4>{app.name}</h4>
                    <span className="mcp-app-version">v{app.version}</span>
                </div>
                <p>{app.description}</p>

                {app.tools.length > 0 && (
                    <div className="mcp-app-tools">
                        <h5>Available Tools</h5>
                        <ul>
                            {app.tools.map(tool => (
                                <li key={tool.name}>
                                    <strong>{tool.name}</strong>
                                    {tool.requiresConsent && (
                                        <span className="requires-consent">Requires consent</span>
                                    )}
                                    <p>{tool.description}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {app.permissions.length > 0 && (
                    <div className="mcp-app-permissions">
                        <h5>Permissions</h5>
                        <ul>
                            {app.permissions.map((perm, i) => (
                                <li key={i}>
                                    {perm.description}
                                    {perm.required && <span className="required">Required</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <button
                    className="mcp-app-launch-btn"
                    onClick={() => this.launchApp(app.id)}
                >
                    Launch App
                </button>
            </div>
        );
    }

    protected renderInstance(instance: AppInstance): React.ReactNode {
        const stateClass = instance.state.toLowerCase().replace('_', '-');

        return (
            <div key={instance.instanceId} className={`mcp-app-instance ${stateClass}`}>
                <span className="instance-name">{instance.app.name}</span>
                <span className={`instance-state ${stateClass}`}>{instance.state}</span>
                <button
                    className="instance-close"
                    onClick={() => this.closeInstance(instance.instanceId)}
                >
                    <i className="codicon codicon-close" />
                </button>
            </div>
        );
    }

    protected selectApp(appId: string): void {
        this.selectedAppId = this.selectedAppId === appId ? undefined : appId;
        this.update();
    }

    protected async launchApp(appId: string): Promise<void> {
        try {
            await this.appsService.launchApp(appId);
            this.loadApps();
        } catch (error) {
            console.error('Failed to launch app:', error);
        }
    }

    protected closeInstance(instanceId: string): void {
        this.appsService.closeApp(instanceId);
        this.loadApps();
    }

    protected getStyles(): string {
        return `
            .mcp-apps-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                padding: 12px;
            }
            .mcp-apps-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }
            .mcp-apps-header h3 {
                margin: 0;
                font-size: 14px;
            }
            .mcp-apps-count {
                font-size: 12px;
                color: var(--theia-descriptionForeground);
            }
            .mcp-apps-content {
                display: flex;
                gap: 16px;
                flex: 1;
                min-height: 0;
            }
            .mcp-apps-list {
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .mcp-app-card {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: var(--theia-sideBar-background);
                border: 1px solid var(--theia-widget-border);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.15s;
            }
            .mcp-app-card:hover {
                border-color: var(--theia-focusBorder);
            }
            .mcp-app-card.selected {
                border-color: var(--theia-button-background);
                background: var(--theia-list-activeSelectionBackground);
            }
            .mcp-app-card.running {
                border-left: 3px solid #4caf50;
            }
            .mcp-app-icon {
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--theia-editor-background);
                border-radius: 8px;
                font-size: 20px;
            }
            .mcp-app-icon img {
                width: 24px;
                height: 24px;
            }
            .mcp-app-info {
                flex: 1;
            }
            .mcp-app-name {
                font-weight: 600;
                font-size: 13px;
            }
            .mcp-app-description {
                font-size: 12px;
                color: var(--theia-descriptionForeground);
                margin-top: 2px;
            }
            .mcp-app-publisher {
                font-size: 11px;
                color: var(--theia-descriptionForeground);
                margin-top: 4px;
            }
            .mcp-app-launch {
                padding: 6px 12px;
                background: var(--theia-button-background);
                color: var(--theia-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            .mcp-app-launch:hover {
                background: var(--theia-button-hoverBackground);
            }
            .mcp-app-status.running {
                color: #4caf50;
                font-size: 12px;
            }
            .mcp-app-preview {
                width: 300px;
                border: 1px solid var(--theia-widget-border);
                border-radius: 6px;
                padding: 16px;
                overflow-y: auto;
            }
            .mcp-app-detail h4 {
                margin: 0 0 4px 0;
            }
            .mcp-app-version {
                font-size: 12px;
                color: var(--theia-descriptionForeground);
            }
            .mcp-app-detail p {
                font-size: 13px;
                margin: 8px 0;
            }
            .mcp-app-tools h5,
            .mcp-app-permissions h5 {
                font-size: 12px;
                margin: 12px 0 8px;
            }
            .mcp-app-tools ul,
            .mcp-app-permissions ul {
                margin: 0;
                padding-left: 16px;
                font-size: 12px;
            }
            .mcp-app-tools li,
            .mcp-app-permissions li {
                margin: 4px 0;
            }
            .requires-consent,
            .required {
                font-size: 10px;
                padding: 2px 6px;
                background: rgba(255, 152, 0, 0.2);
                color: #ff9800;
                border-radius: 3px;
                margin-left: 8px;
            }
            .mcp-app-launch-btn {
                width: 100%;
                padding: 10px;
                margin-top: 16px;
                background: var(--theia-button-background);
                color: var(--theia-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
            }
            .mcp-apps-instances {
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid var(--theia-widget-border);
            }
            .mcp-apps-instances h4 {
                margin: 0 0 8px 0;
                font-size: 12px;
            }
            .mcp-app-instance {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                background: var(--theia-sideBar-background);
                border-radius: 4px;
                margin-bottom: 4px;
            }
            .instance-name {
                flex: 1;
                font-size: 12px;
            }
            .instance-state {
                font-size: 11px;
                padding: 2px 6px;
                border-radius: 3px;
            }
            .instance-state.ready,
            .instance-state.active {
                background: rgba(76, 175, 80, 0.2);
                color: #4caf50;
            }
            .instance-state.loading {
                background: rgba(33, 150, 243, 0.2);
                color: #2196f3;
            }
            .instance-state.error {
                background: rgba(244, 67, 54, 0.2);
                color: #f44336;
            }
            .instance-close {
                background: none;
                border: none;
                cursor: pointer;
                color: var(--theia-foreground);
                opacity: 0.6;
            }
            .instance-close:hover {
                opacity: 1;
            }
        `;
    }
}
