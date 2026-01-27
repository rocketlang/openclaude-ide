// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// AI-Powered Debugging Types
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const AIDebuggingService = Symbol('AIDebuggingService');
export const AIProfilerService = Symbol('AIProfilerService');

/**
 * Error analysis result from AI
 */
export interface ErrorAnalysis {
    errorType: string;
    errorMessage: string;
    rootCause: string;
    suggestedFixes: SuggestedFix[];
    relatedCode: CodeLocation[];
    confidence: number;
}

/**
 * Suggested fix for an error
 */
export interface SuggestedFix {
    description: string;
    codeChange?: CodeChange;
    priority: 'high' | 'medium' | 'low';
    explanation: string;
}

/**
 * Code change suggestion
 */
export interface CodeChange {
    filePath: string;
    startLine: number;
    endLine: number;
    originalCode: string;
    suggestedCode: string;
}

/**
 * Code location reference
 */
export interface CodeLocation {
    filePath: string;
    line: number;
    column?: number;
    context: string;
}

/**
 * Stack frame with AI-enhanced context
 */
export interface EnhancedStackFrame {
    functionName: string;
    filePath: string;
    line: number;
    column: number;
    isUserCode: boolean;
    aiContext?: string;
    localVariables?: VariableInfo[];
}

/**
 * Variable information
 */
export interface VariableInfo {
    name: string;
    value: string;
    type: string;
    isRelevant: boolean;
}

/**
 * Performance profile result
 */
export interface PerformanceProfile {
    id: string;
    startTime: number;
    endTime: number;
    duration: number;
    metrics: PerformanceMetrics;
    hotspots: Hotspot[];
    aiInsights: AIInsight[];
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
    cpuTime: number;
    memoryPeak: number;
    memoryAverage: number;
    gcTime: number;
    ioWaitTime: number;
    functionCalls: number;
}

/**
 * Performance hotspot
 */
export interface Hotspot {
    location: CodeLocation;
    selfTime: number;
    totalTime: number;
    callCount: number;
    avgTime: number;
    aiSuggestion?: string;
}

/**
 * AI-generated insight
 */
export interface AIInsight {
    type: InsightType;
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    affectedCode?: CodeLocation[];
    recommendation: string;
}

export enum InsightType {
    PerformanceBottleneck = 'performance-bottleneck',
    MemoryLeak = 'memory-leak',
    IneffientAlgorithm = 'inefficient-algorithm',
    ExcessiveIO = 'excessive-io',
    BlockingOperation = 'blocking-operation',
    UnusedCode = 'unused-code',
    SecurityIssue = 'security-issue'
}

/**
 * Debug session with AI assistance
 */
export interface AIDebugSession {
    sessionId: string;
    state: DebugState;
    currentFrame?: EnhancedStackFrame;
    errorAnalysis?: ErrorAnalysis;
    watchSuggestions: string[];
    breakpointSuggestions: CodeLocation[];
}

export enum DebugState {
    Idle = 'idle',
    Running = 'running',
    Paused = 'paused',
    Analyzing = 'analyzing',
    Completed = 'completed'
}

/**
 * AI Debugging Service interface
 */
export interface AIDebuggingService {
    /**
     * Analyze an error with AI
     */
    analyzeError(error: Error | string, context?: DebugContext): Promise<ErrorAnalysis>;

    /**
     * Get AI suggestions for the current debug state
     */
    getSuggestions(session: AIDebugSession): Promise<AIInsight[]>;

    /**
     * Explain the current stack trace
     */
    explainStackTrace(frames: EnhancedStackFrame[]): Promise<string>;

    /**
     * Suggest relevant breakpoints
     */
    suggestBreakpoints(filePath: string): Promise<CodeLocation[]>;

    /**
     * Suggest watch expressions
     */
    suggestWatchExpressions(frame: EnhancedStackFrame): Promise<string[]>;
}

/**
 * Debug context for AI analysis
 */
export interface DebugContext {
    filePath?: string;
    line?: number;
    stackTrace?: string;
    localVariables?: Record<string, unknown>;
    recentChanges?: string[];
}

/**
 * AI Profiler Service interface
 */
export interface AIProfilerService {
    /**
     * Start a profiling session
     */
    startProfile(options?: ProfileOptions): Promise<string>;

    /**
     * Stop the current profiling session
     */
    stopProfile(profileId: string): Promise<PerformanceProfile>;

    /**
     * Get AI insights for a profile
     */
    analyzeProfile(profile: PerformanceProfile): Promise<AIInsight[]>;

    /**
     * Get optimization suggestions
     */
    getOptimizationSuggestions(profile: PerformanceProfile): Promise<SuggestedFix[]>;
}

/**
 * Profiling options
 */
export interface ProfileOptions {
    sampleRate?: number;
    includeMemory?: boolean;
    includeGC?: boolean;
    includeIO?: boolean;
    maxDuration?: number;
}
