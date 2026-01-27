// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const AIMonitoringService = Symbol('AIMonitoringService');
export const aiMonitoringServicePath = '/services/ai-monitoring';

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

/**
 * Alert severity
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Alert status
 */
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

/**
 * Time range for queries
 */
export type TimeRange = '5m' | '15m' | '1h' | '6h' | '24h' | '7d' | '30d';

/**
 * A metric data point
 */
export interface MetricDataPoint {
    timestamp: string;
    value: number;
    labels?: Record<string, string>;
}

/**
 * A metric series
 */
export interface MetricSeries {
    name: string;
    type: MetricType;
    unit?: string;
    description?: string;
    dataPoints: MetricDataPoint[];
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
    cpuUsage: number;
    memoryUsage: number;
    memoryTotal: number;
    heapUsed: number;
    heapTotal: number;
    activeConnections: number;
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    uptime: number;
}

/**
 * AI service metrics
 */
export interface AIServiceMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageLatency: number;
    tokensUsed: number;
    costEstimate: number;
    cacheHitRate: number;
    modelUsage: Record<string, number>;
}

/**
 * Editor metrics
 */
export interface EditorMetrics {
    activeEditors: number;
    totalFiles: number;
    linesOfCode: number;
    filesSaved: number;
    autocompletions: number;
    diagnosticsCount: number;
    refactorings: number;
}

/**
 * Error entry
 */
export interface ErrorEntry {
    id: string;
    timestamp: string;
    severity: AlertSeverity;
    source: string;
    message: string;
    stackTrace?: string;
    context?: Record<string, unknown>;
    count: number;
    firstOccurrence: string;
    lastOccurrence: string;
    isResolved: boolean;
}

/**
 * Alert definition
 */
export interface AlertDefinition {
    id: string;
    name: string;
    description?: string;
    metric: string;
    condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    threshold: number;
    severity: AlertSeverity;
    isEnabled: boolean;
    cooldownMinutes: number;
}

/**
 * Active alert
 */
export interface ActiveAlert {
    id: string;
    definitionId: string;
    name: string;
    severity: AlertSeverity;
    status: AlertStatus;
    message: string;
    value: number;
    threshold: number;
    triggeredAt: string;
    acknowledgedAt?: string;
    resolvedAt?: string;
    acknowledgedBy?: string;
}

/**
 * Dashboard widget configuration
 */
export interface DashboardWidget {
    id: string;
    type: 'chart' | 'gauge' | 'counter' | 'table' | 'list';
    title: string;
    metric: string;
    timeRange: TimeRange;
    refreshInterval: number;
    position: { x: number; y: number; w: number; h: number };
}

/**
 * Dashboard configuration
 */
export interface DashboardConfig {
    id: string;
    name: string;
    description?: string;
    widgets: DashboardWidget[];
    refreshInterval: number;
    isDefault: boolean;
}

/**
 * Usage statistics
 */
export interface UsageStatistics {
    sessionDuration: number;
    commandsExecuted: number;
    filesOpened: number;
    searchesPerformed: number;
    buildsRun: number;
    testsRun: number;
    commitsCreated: number;
    aiInteractions: number;
    keystrokes: number;
    mostUsedCommands: Array<{ command: string; count: number }>;
    mostEditedFiles: Array<{ file: string; edits: number }>;
    languageBreakdown: Record<string, number>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    message?: string;
    lastChecked: string;
}

/**
 * System health summary
 */
export interface SystemHealth {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    checks: HealthCheckResult[];
    uptime: number;
    version: string;
}

/**
 * Monitoring service interface
 */
export interface AIMonitoringService {
    // Performance metrics
    getPerformanceMetrics(): Promise<PerformanceMetrics>;
    getMetricSeries(metric: string, timeRange: TimeRange): Promise<MetricSeries>;
    recordMetric(name: string, value: number, labels?: Record<string, string>): Promise<void>;

    // AI service metrics
    getAIServiceMetrics(): Promise<AIServiceMetrics>;
    getModelUsage(timeRange: TimeRange): Promise<Record<string, number>>;

    // Editor metrics
    getEditorMetrics(): Promise<EditorMetrics>;

    // Error tracking
    getErrors(limit?: number, severity?: AlertSeverity): Promise<ErrorEntry[]>;
    getError(errorId: string): Promise<ErrorEntry | undefined>;
    resolveError(errorId: string): Promise<void>;
    clearResolvedErrors(): Promise<number>;

    // Alerts
    getAlertDefinitions(): Promise<AlertDefinition[]>;
    createAlert(alert: Omit<AlertDefinition, 'id'>): Promise<AlertDefinition>;
    updateAlert(alertId: string, updates: Partial<AlertDefinition>): Promise<AlertDefinition>;
    deleteAlert(alertId: string): Promise<void>;
    getActiveAlerts(): Promise<ActiveAlert[]>;
    acknowledgeAlert(alertId: string): Promise<void>;
    resolveAlert(alertId: string): Promise<void>;

    // Dashboard
    getDashboards(): Promise<DashboardConfig[]>;
    getDashboard(dashboardId: string): Promise<DashboardConfig | undefined>;
    createDashboard(config: Omit<DashboardConfig, 'id'>): Promise<DashboardConfig>;
    updateDashboard(dashboardId: string, config: Partial<DashboardConfig>): Promise<DashboardConfig>;
    deleteDashboard(dashboardId: string): Promise<void>;

    // Usage statistics
    getUsageStatistics(timeRange: TimeRange): Promise<UsageStatistics>;
    trackEvent(event: string, data?: Record<string, unknown>): Promise<void>;

    // Health checks
    getSystemHealth(): Promise<SystemHealth>;
    runHealthCheck(): Promise<SystemHealth>;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration to human readable
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
    return Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
}

/**
 * Format uptime
 */
export function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return days + 'd ' + hours + 'h';
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    return minutes + 'm';
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
    return (value * 100).toFixed(1) + '%';
}

/**
 * Get severity color
 */
export function getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
        case 'info': return '#3b82f6';
        case 'warning': return '#f59e0b';
        case 'error': return '#ef4444';
        case 'critical': return '#dc2626';
        default: return '#6b7280';
    }
}

/**
 * Get status color
 */
export function getStatusColor(status: 'healthy' | 'degraded' | 'unhealthy'): string {
    switch (status) {
        case 'healthy': return '#22c55e';
        case 'degraded': return '#f59e0b';
        case 'unhealthy': return '#ef4444';
        default: return '#6b7280';
    }
}

/**
 * Get alert status icon
 */
export function getAlertStatusIcon(status: AlertStatus): string {
    switch (status) {
        case 'active': return 'warning';
        case 'acknowledged': return 'eye';
        case 'resolved': return 'check';
        default: return 'circle-outline';
    }
}
