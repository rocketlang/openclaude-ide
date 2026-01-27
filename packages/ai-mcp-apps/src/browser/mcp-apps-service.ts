// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import {
    MCPAppsService,
    MCPApp,
    AppInstance,
    AppState,
    AppToolCall,
    AppToolResult,
    ConsentRequest,
    ConsentService,
    RiskLevel
} from '../common';

@injectable()
export class MCPAppsServiceImpl implements MCPAppsService {

    @inject(ConsentService)
    protected readonly consentService: ConsentService;

    protected apps: Map<string, MCPApp> = new Map();
    protected instances: Map<string, AppInstance> = new Map();

    protected readonly onConsentRequiredEmitter = new Emitter<ConsentRequest>();

    @postConstruct()
    protected init(): void {
        // Register built-in apps
        this.registerBuiltInApps();
    }

    registerApp(app: MCPApp): void {
        this.apps.set(app.id, app);
    }

    unregisterApp(appId: string): void {
        // Close all instances of this app
        for (const [instanceId, instance] of this.instances) {
            if (instance.app.id === appId) {
                this.closeApp(instanceId);
            }
        }
        this.apps.delete(appId);
    }

    getApps(): MCPApp[] {
        return Array.from(this.apps.values());
    }

    getApp(appId: string): MCPApp | undefined {
        return this.apps.get(appId);
    }

    async launchApp(appId: string, context?: Record<string, unknown>): Promise<AppInstance> {
        const app = this.apps.get(appId);
        if (!app) {
            throw new Error(`App not found: ${appId}`);
        }

        const instanceId = this.generateInstanceId();
        const instance: AppInstance = {
            instanceId,
            app,
            state: AppState.Loading,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        this.instances.set(instanceId, instance);
        return instance;
    }

    closeApp(instanceId: string): void {
        const instance = this.instances.get(instanceId);
        if (instance) {
            instance.state = AppState.Closed;
            if (instance.iframe) {
                instance.iframe.remove();
            }
            this.instances.delete(instanceId);
        }
    }

    getInstances(): AppInstance[] {
        return Array.from(this.instances.values());
    }

    async handleToolCall(instanceId: string, toolCall: AppToolCall): Promise<AppToolResult> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            return {
                requestId: toolCall.requestId,
                success: false,
                error: 'App instance not found'
            };
        }

        const tool = instance.app.tools.find(t => t.name === toolCall.tool);
        if (!tool) {
            return {
                requestId: toolCall.requestId,
                success: false,
                error: `Tool not found: ${toolCall.tool}`
            };
        }

        // Check if consent is required
        if (tool.requiresConsent && !this.consentService.hasConsent(instance.app.id, tool.name)) {
            const consentRequest: ConsentRequest = {
                id: this.generateRequestId(),
                appId: instance.app.id,
                toolName: tool.name,
                parameters: toolCall.parameters,
                message: tool.consentMessage || `${instance.app.name} wants to use ${tool.name}`,
                riskLevel: this.calculateRiskLevel(tool),
                timestamp: Date.now()
            };

            this.onConsentRequiredEmitter.fire(consentRequest);

            const response = await this.consentService.requestConsent(consentRequest);
            if (!response.approved) {
                return {
                    requestId: toolCall.requestId,
                    success: false,
                    error: 'User denied consent'
                };
            }
        }

        // Execute the tool
        try {
            const result = await this.executeTool(instance, tool, toolCall.parameters);
            instance.lastActivity = Date.now();
            return {
                requestId: toolCall.requestId,
                success: true,
                result
            };
        } catch (error) {
            return {
                requestId: toolCall.requestId,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    onConsentRequired(callback: (request: ConsentRequest) => void): void {
        this.onConsentRequiredEmitter.event(callback);
    }

    protected async executeTool(
        instance: AppInstance,
        tool: { name: string },
        parameters: Record<string, unknown>
    ): Promise<unknown> {
        // Tool execution would be implemented here
        // For now, return a simulated result
        return { executed: true, tool: tool.name, parameters };
    }

    protected calculateRiskLevel(tool: { name: string; requiresConsent: boolean }): RiskLevel {
        const name = tool.name.toLowerCase();
        if (name.includes('delete') || name.includes('remove')) {
            return RiskLevel.High;
        }
        if (name.includes('write') || name.includes('modify') || name.includes('execute')) {
            return RiskLevel.Medium;
        }
        return RiskLevel.Low;
    }

    protected registerBuiltInApps(): void {
        // File Browser App
        this.registerApp({
            id: 'builtin:file-browser',
            name: 'File Browser',
            description: 'Browse and preview files',
            version: '1.0.0',
            publisher: 'OpenClaude',
            capabilities: [],
            ui: {
                html: this.getFileBrowserHTML(),
                sandbox: {
                    allowScripts: true,
                    allowForms: false,
                    allowPopups: false,
                    allowSameOrigin: false,
                    allowModals: false
                },
                dimensions: { width: '100%', height: 300 }
            },
            tools: [
                {
                    name: 'list_files',
                    description: 'List files in directory',
                    inputSchema: { path: { type: 'string' } },
                    requiresConsent: false
                },
                {
                    name: 'read_file',
                    description: 'Read file contents',
                    inputSchema: { path: { type: 'string' } },
                    requiresConsent: false
                }
            ],
            permissions: []
        });

        // Code Preview App
        this.registerApp({
            id: 'builtin:code-preview',
            name: 'Code Preview',
            description: 'Preview code with syntax highlighting',
            version: '1.0.0',
            publisher: 'OpenClaude',
            capabilities: [],
            ui: {
                html: this.getCodePreviewHTML(),
                sandbox: {
                    allowScripts: true,
                    allowForms: false,
                    allowPopups: false,
                    allowSameOrigin: false,
                    allowModals: false
                },
                dimensions: { width: '100%', height: 400 }
            },
            tools: [],
            permissions: []
        });

        // Git Status App
        this.registerApp({
            id: 'builtin:git-status',
            name: 'Git Status',
            description: 'View git repository status',
            version: '1.0.0',
            publisher: 'OpenClaude',
            capabilities: [],
            ui: {
                html: this.getGitStatusHTML(),
                sandbox: {
                    allowScripts: true,
                    allowForms: false,
                    allowPopups: false,
                    allowSameOrigin: false,
                    allowModals: false
                },
                dimensions: { width: '100%', height: 250 }
            },
            tools: [
                {
                    name: 'git_status',
                    description: 'Get git status',
                    inputSchema: {},
                    requiresConsent: false
                },
                {
                    name: 'git_commit',
                    description: 'Create a commit',
                    inputSchema: { message: { type: 'string' } },
                    requiresConsent: true,
                    consentMessage: 'Allow Git Status app to create a commit?'
                }
            ],
            permissions: []
        });
    }

    protected getFileBrowserHTML(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: system-ui; margin: 0; padding: 12px; background: var(--bg, #1e1e1e); color: var(--fg, #fff); }
        .file-list { list-style: none; padding: 0; margin: 0; }
        .file-item { padding: 8px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .file-item:hover { background: rgba(255,255,255,0.1); }
        .file-icon { width: 16px; }
        .folder { color: #dcb67a; }
        .file { color: #9cdcfe; }
    </style>
</head>
<body>
    <ul class="file-list" id="files"></ul>
    <script>
        window.addEventListener('message', (e) => {
            if (e.data.type === 'init') {
                renderFiles(e.data.payload.files || []);
            }
        });
        function renderFiles(files) {
            const list = document.getElementById('files');
            list.innerHTML = files.map(f =>
                '<li class="file-item">' +
                '<span class="file-icon ' + (f.isDirectory ? 'folder' : 'file') + '">' + (f.isDirectory ? '📁' : '📄') + '</span>' +
                '<span>' + f.name + '</span>' +
                '</li>'
            ).join('');
        }
        parent.postMessage({ type: 'ready' }, '*');
    </script>
</body>
</html>`;
    }

    protected getCodePreviewHTML(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Fira Code', monospace; margin: 0; padding: 0; background: var(--bg, #1e1e1e); color: var(--fg, #d4d4d4); }
        pre { margin: 0; padding: 12px; overflow: auto; font-size: 13px; line-height: 1.5; }
        .line-number { color: #858585; margin-right: 16px; user-select: none; }
        .keyword { color: #569cd6; }
        .string { color: #ce9178; }
        .comment { color: #6a9955; }
        .function { color: #dcdcaa; }
    </style>
</head>
<body>
    <pre id="code"></pre>
    <script>
        window.addEventListener('message', (e) => {
            if (e.data.type === 'init') {
                renderCode(e.data.payload.code || '', e.data.payload.language || 'text');
            }
        });
        function renderCode(code, lang) {
            const lines = code.split('\\n');
            document.getElementById('code').innerHTML = lines.map((line, i) =>
                '<span class="line-number">' + (i + 1).toString().padStart(3) + '</span>' + escapeHtml(line)
            ).join('\\n');
        }
        function escapeHtml(text) {
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        parent.postMessage({ type: 'ready' }, '*');
    </script>
</body>
</html>`;
    }

    protected getGitStatusHTML(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: system-ui; margin: 0; padding: 12px; background: var(--bg, #1e1e1e); color: var(--fg, #fff); }
        .section { margin-bottom: 16px; }
        .section-title { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 8px; }
        .file { padding: 4px 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
        .staged { color: #89d185; }
        .modified { color: #e2c08d; }
        .untracked { color: #c586c0; }
        .branch { font-weight: bold; color: #4ec9b0; }
    </style>
</head>
<body>
    <div id="status">
        <div class="section">
            <div class="section-title">Branch</div>
            <div class="branch" id="branch">main</div>
        </div>
        <div class="section">
            <div class="section-title">Changes</div>
            <div id="changes"></div>
        </div>
    </div>
    <script>
        window.addEventListener('message', (e) => {
            if (e.data.type === 'init') {
                renderStatus(e.data.payload);
            }
        });
        function renderStatus(status) {
            document.getElementById('branch').textContent = status.branch || 'main';
            const changes = status.changes || [];
            document.getElementById('changes').innerHTML = changes.map(c =>
                '<div class="file ' + c.status + '">' + c.status.charAt(0).toUpperCase() + ' ' + c.file + '</div>'
            ).join('');
        }
        parent.postMessage({ type: 'ready' }, '*');
    </script>
</body>
</html>`;
    }

    protected generateInstanceId(): string {
        return `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    protected generateRequestId(): string {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
