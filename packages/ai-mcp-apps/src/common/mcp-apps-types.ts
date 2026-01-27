// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// MCP Apps Protocol - Based on Anthropic's MCP Apps Extension (Jan 2026)
// Interactive UI widgets for AI chat interfaces
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * MCP App definition
 */
export interface MCPApp {
    /** Unique app identifier */
    id: string;
    /** App name */
    name: string;
    /** App description */
    description: string;
    /** App version */
    version: string;
    /** App icon URL */
    iconUrl?: string;
    /** Publisher/vendor */
    publisher: string;
    /** Capabilities required */
    capabilities?: AppCapability[];
    /** UI resources */
    ui: AppUIResource;
    /** Tools provided by this app */
    tools: AppTool[];
    /** Permissions required */
    permissions: AppPermission[];
}

/**
 * App capability
 */
export enum AppCapability {
    ReadFiles = 'read_files',
    WriteFiles = 'write_files',
    ExecuteCommands = 'execute_commands',
    NetworkAccess = 'network_access',
    ClipboardAccess = 'clipboard_access',
    NotificationAccess = 'notification_access'
}

/**
 * App UI resource
 */
export interface AppUIResource {
    /** HTML content or URL */
    html?: string;
    /** URL to fetch HTML from */
    url?: string;
    /** JavaScript content */
    script?: string;
    /** CSS styles */
    styles?: string;
    /** Preferred dimensions */
    dimensions?: AppDimensions;
    /** Sandbox restrictions (defaults to DEFAULT_SANDBOX_CONFIG) */
    sandbox?: SandboxConfig;
}

/**
 * App dimensions
 */
export interface AppDimensions {
    width?: number | string;
    height?: number | string;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    resizable?: boolean;
}

/**
 * Sandbox configuration for iframe
 */
export interface SandboxConfig {
    /** Allow scripts */
    allowScripts: boolean;
    /** Allow forms */
    allowForms: boolean;
    /** Allow popups */
    allowPopups: boolean;
    /** Allow same origin */
    allowSameOrigin: boolean;
    /** Allow modals */
    allowModals: boolean;
    /** Custom sandbox attributes */
    customAttributes?: string[];
}

/**
 * Default sandbox config (restrictive)
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
    allowScripts: true,
    allowForms: false,
    allowPopups: false,
    allowSameOrigin: false,
    allowModals: false
};

/**
 * App tool definition
 */
export interface AppTool {
    /** Tool name */
    name: string;
    /** Tool description */
    description: string;
    /** Input schema */
    inputSchema: Record<string, unknown>;
    /** Whether tool requires user consent */
    requiresConsent: boolean;
    /** Consent message to show */
    consentMessage?: string;
}

/**
 * App permission
 */
export interface AppPermission {
    /** Permission type */
    type: PermissionType;
    /** Resource pattern (glob) */
    resource?: string;
    /** Permission description */
    description: string;
    /** Whether required or optional */
    required: boolean;
}

/**
 * Permission types
 */
export enum PermissionType {
    ReadFile = 'read_file',
    WriteFile = 'write_file',
    DeleteFile = 'delete_file',
    ExecuteCommand = 'execute_command',
    NetworkRequest = 'network_request',
    Clipboard = 'clipboard',
    Notification = 'notification',
    Storage = 'storage'
}

/**
 * User consent request
 */
export interface ConsentRequest {
    /** Request ID */
    id: string;
    /** App making the request */
    appId: string;
    /** Tool being invoked */
    toolName: string;
    /** Tool parameters */
    parameters: Record<string, unknown>;
    /** Consent message */
    message: string;
    /** Risk level */
    riskLevel: RiskLevel;
    /** Timestamp */
    timestamp: number;
    /** Expiry (optional) */
    expiresAt?: number;
}

/**
 * Risk level for consent
 */
export enum RiskLevel {
    Low = 'low',
    Medium = 'medium',
    High = 'high',
    Critical = 'critical'
}

/**
 * Consent response
 */
export interface ConsentResponse {
    /** Request ID */
    requestId: string;
    /** Whether approved */
    approved: boolean;
    /** Remember for this session */
    rememberSession?: boolean;
    /** Remember permanently */
    rememberPermanent?: boolean;
    /** Timestamp */
    timestamp: number;
}

/**
 * App instance (running app)
 */
export interface AppInstance {
    /** Instance ID */
    instanceId: string;
    /** App definition */
    app: MCPApp;
    /** Current state */
    state: AppState;
    /** Iframe element */
    iframe?: HTMLIFrameElement;
    /** Message handler */
    messageHandler?: (event: MessageEvent) => void;
    /** Created timestamp */
    createdAt: number;
    /** Last activity */
    lastActivity: number;
}

/**
 * App state
 */
export enum AppState {
    Loading = 'loading',
    Ready = 'ready',
    Active = 'active',
    Suspended = 'suspended',
    Error = 'error',
    Closed = 'closed'
}

/**
 * Host-to-App message
 */
export interface HostToAppMessage {
    type: 'init' | 'tool_result' | 'context_update' | 'theme_change' | 'close';
    payload: unknown;
    requestId?: string;
}

/**
 * App-to-Host message
 */
export interface AppToHostMessage {
    type: 'ready' | 'tool_call' | 'resize' | 'error' | 'log';
    payload: unknown;
    requestId?: string;
}

/**
 * Tool call from app
 */
export interface AppToolCall {
    /** Tool name */
    tool: string;
    /** Tool parameters */
    parameters: Record<string, unknown>;
    /** Request ID for response correlation */
    requestId: string;
}

/**
 * Tool result to app
 */
export interface AppToolResult {
    /** Request ID */
    requestId: string;
    /** Success flag */
    success: boolean;
    /** Result data */
    result?: unknown;
    /** Error message */
    error?: string;
}

/**
 * MCP Apps Service interface
 */
export const MCPAppsService = Symbol('MCPAppsService');
export interface MCPAppsService {
    /** Register an app */
    registerApp(app: MCPApp): void;
    /** Unregister an app */
    unregisterApp(appId: string): void;
    /** Get registered apps */
    getApps(): MCPApp[];
    /** Get app by ID */
    getApp(appId: string): MCPApp | undefined;
    /** Launch app instance */
    launchApp(appId: string, context?: Record<string, unknown>): Promise<AppInstance>;
    /** Close app instance */
    closeApp(instanceId: string): void;
    /** Get running instances */
    getInstances(): AppInstance[];
    /** Handle tool call from app */
    handleToolCall(instanceId: string, toolCall: AppToolCall): Promise<AppToolResult>;
    /** Subscribe to consent requests */
    onConsentRequired(callback: (request: ConsentRequest) => void): void;
}

/**
 * Consent Service interface
 */
export const ConsentService = Symbol('ConsentService');
export interface ConsentService {
    /** Request user consent */
    requestConsent(request: ConsentRequest): Promise<ConsentResponse>;
    /** Check if consent exists */
    hasConsent(appId: string, toolName: string): boolean;
    /** Get consent history */
    getConsentHistory(): ConsentResponse[];
    /** Revoke consent */
    revokeConsent(appId: string, toolName?: string): void;
    /** Clear all consents */
    clearAllConsents(): void;
}

/**
 * App Renderer interface
 */
export const AppRenderer = Symbol('AppRenderer');
export interface AppRenderer {
    /** Render app in container */
    render(instance: AppInstance, container: HTMLElement): void;
    /** Destroy rendered app */
    destroy(instanceId: string): void;
    /** Send message to app */
    sendMessage(instanceId: string, message: HostToAppMessage): void;
    /** Update app theme */
    updateTheme(instanceId: string, theme: 'light' | 'dark'): void;
}

/**
 * Built-in app IDs
 */
export const BuiltInApps = {
    FILE_BROWSER: 'builtin:file-browser',
    CODE_PREVIEW: 'builtin:code-preview',
    GIT_STATUS: 'builtin:git-status',
    TERMINAL_OUTPUT: 'builtin:terminal-output',
    IMAGE_VIEWER: 'builtin:image-viewer',
    DIFF_VIEWER: 'builtin:diff-viewer'
};
