// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// MCP App Renderer - Sandboxed iframe rendering for MCP Apps
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import {
    AppRenderer,
    AppInstance,
    AppState,
    HostToAppMessage,
    AppToHostMessage,
    AppToolCall,
    MCPAppsService,
    DEFAULT_SANDBOX_CONFIG
} from '../common';

@injectable()
export class AppRendererImpl implements AppRenderer {

    @inject(MCPAppsService)
    protected readonly appsService: MCPAppsService;

    protected renderedApps: Map<string, {
        iframe: HTMLIFrameElement;
        container: HTMLElement;
        messageHandler: (event: MessageEvent) => void;
    }> = new Map();

    protected readonly onAppMessageEmitter = new Emitter<{ instanceId: string; message: AppToHostMessage }>();
    readonly onAppMessage = this.onAppMessageEmitter.event;

    render(instance: AppInstance, container: HTMLElement): void {
        // Clean up existing render
        if (this.renderedApps.has(instance.instanceId)) {
            this.destroy(instance.instanceId);
        }

        const iframe = document.createElement('iframe');

        // Build sandbox attribute
        const sandbox = instance.app.ui.sandbox || DEFAULT_SANDBOX_CONFIG;
        const sandboxAttrs: string[] = [];
        if (sandbox.allowScripts) { sandboxAttrs.push('allow-scripts'); }
        if (sandbox.allowForms) { sandboxAttrs.push('allow-forms'); }
        if (sandbox.allowPopups) { sandboxAttrs.push('allow-popups'); }
        if (sandbox.allowSameOrigin) { sandboxAttrs.push('allow-same-origin'); }
        if (sandbox.allowModals) { sandboxAttrs.push('allow-modals'); }
        if (sandbox.customAttributes) { sandboxAttrs.push(...sandbox.customAttributes); }

        iframe.setAttribute('sandbox', sandboxAttrs.join(' '));

        // Set dimensions
        const dims = instance.app.ui.dimensions;
        if (dims) {
            iframe.style.width = typeof dims.width === 'number' ? `${dims.width}px` : dims.width || '100%';
            iframe.style.height = typeof dims.height === 'number' ? `${dims.height}px` : dims.height || '300px';
            if (dims.minWidth) { iframe.style.minWidth = `${dims.minWidth}px`; }
            if (dims.minHeight) { iframe.style.minHeight = `${dims.minHeight}px`; }
            if (dims.maxWidth) { iframe.style.maxWidth = `${dims.maxWidth}px`; }
            if (dims.maxHeight) { iframe.style.maxHeight = `${dims.maxHeight}px`; }
        } else {
            iframe.style.width = '100%';
            iframe.style.height = '300px';
        }

        iframe.style.border = 'none';
        iframe.style.borderRadius = '6px';
        iframe.style.backgroundColor = 'var(--theia-editor-background)';

        // Create message handler
        const messageHandler = (event: MessageEvent) => {
            // Only accept messages from our iframe
            if (event.source !== iframe.contentWindow) {
                return;
            }

            const message = event.data as AppToHostMessage;
            this.handleAppMessage(instance.instanceId, message);
        };

        window.addEventListener('message', messageHandler);

        // Store render info
        this.renderedApps.set(instance.instanceId, {
            iframe,
            container,
            messageHandler
        });

        instance.iframe = iframe;

        // Load content
        if (instance.app.ui.url) {
            iframe.src = instance.app.ui.url;
        } else if (instance.app.ui.html) {
            const blob = new Blob([instance.app.ui.html], { type: 'text/html' });
            iframe.src = URL.createObjectURL(blob);
        }

        container.appendChild(iframe);
        instance.state = AppState.Loading;
    }

    destroy(instanceId: string): void {
        const rendered = this.renderedApps.get(instanceId);
        if (rendered) {
            window.removeEventListener('message', rendered.messageHandler);
            rendered.iframe.remove();
            this.renderedApps.delete(instanceId);
        }
    }

    sendMessage(instanceId: string, message: HostToAppMessage): void {
        const rendered = this.renderedApps.get(instanceId);
        if (rendered && rendered.iframe.contentWindow) {
            rendered.iframe.contentWindow.postMessage(message, '*');
        }
    }

    updateTheme(instanceId: string, theme: 'light' | 'dark'): void {
        this.sendMessage(instanceId, {
            type: 'theme_change',
            payload: { theme }
        });
    }

    protected handleAppMessage(instanceId: string, message: AppToHostMessage): void {
        this.onAppMessageEmitter.fire({ instanceId, message });

        switch (message.type) {
            case 'ready':
                this.handleAppReady(instanceId);
                break;
            case 'tool_call':
                this.handleToolCall(instanceId, message.payload as AppToolCall);
                break;
            case 'resize':
                this.handleResize(instanceId, message.payload as { width?: number; height?: number });
                break;
            case 'error':
                this.handleAppError(instanceId, message.payload as { error: string });
                break;
            case 'log':
                this.handleAppLog(instanceId, message.payload as { level: string; message: string });
                break;
        }
    }

    protected handleAppReady(instanceId: string): void {
        const instance = this.appsService.getInstances().find(i => i.instanceId === instanceId);
        if (instance) {
            instance.state = AppState.Ready;

            // Send init message with context
            this.sendMessage(instanceId, {
                type: 'init',
                payload: {
                    theme: this.getCurrentTheme(),
                    appId: instance.app.id,
                    instanceId
                }
            });
        }
    }

    protected async handleToolCall(instanceId: string, toolCall: AppToolCall): Promise<void> {
        const result = await this.appsService.handleToolCall(instanceId, toolCall);

        this.sendMessage(instanceId, {
            type: 'tool_result',
            payload: result,
            requestId: toolCall.requestId
        });
    }

    protected handleResize(instanceId: string, dimensions: { width?: number; height?: number }): void {
        const rendered = this.renderedApps.get(instanceId);
        if (rendered) {
            if (dimensions.width) {
                rendered.iframe.style.width = `${dimensions.width}px`;
            }
            if (dimensions.height) {
                rendered.iframe.style.height = `${dimensions.height}px`;
            }
        }
    }

    protected handleAppError(instanceId: string, error: { error: string }): void {
        console.error(`MCP App error (${instanceId}):`, error.error);
        const instance = this.appsService.getInstances().find(i => i.instanceId === instanceId);
        if (instance) {
            instance.state = AppState.Error;
        }
    }

    protected handleAppLog(instanceId: string, log: { level: string; message: string }): void {
        const prefix = `[MCP App ${instanceId}]`;
        switch (log.level) {
            case 'error':
                console.error(prefix, log.message);
                break;
            case 'warn':
                console.warn(prefix, log.message);
                break;
            case 'info':
                console.info(prefix, log.message);
                break;
            default:
                console.log(prefix, log.message);
        }
    }

    protected getCurrentTheme(): 'light' | 'dark' {
        // Detect current theme from body class or CSS variable
        const isDark = document.body.classList.contains('theia-dark') ||
            getComputedStyle(document.body).getPropertyValue('--theia-editor-background').includes('1e1e1e');
        return isDark ? 'dark' : 'light';
    }
}
