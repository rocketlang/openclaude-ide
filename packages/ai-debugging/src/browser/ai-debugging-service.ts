// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// AI Debugging Service Implementation
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import {
    AIDebuggingService,
    ErrorAnalysis,
    AIDebugSession,
    AIInsight,
    EnhancedStackFrame,
    CodeLocation,
    DebugContext,
    InsightType
} from '../common';

@injectable()
export class AIDebuggingServiceImpl implements AIDebuggingService {

    async analyzeError(error: Error | string, _context?: DebugContext): Promise<ErrorAnalysis> {
        const errorMessage = typeof error === 'string' ? error : error.message;
        const errorStack = typeof error === 'string' ? '' : error.stack || '';

        // Basic error pattern matching
        const analysis = this.performBasicAnalysis(errorMessage, errorStack);
        return analysis;
    }

    async getSuggestions(session: AIDebugSession): Promise<AIInsight[]> {
        const insights: AIInsight[] = [];

        if (session.errorAnalysis) {
            insights.push({
                type: InsightType.PerformanceBottleneck,
                title: 'Error Detected',
                description: session.errorAnalysis.rootCause,
                severity: 'critical',
                recommendation: session.errorAnalysis.suggestedFixes[0]?.description || 'Review the error details'
            });
        }

        if (session.currentFrame) {
            insights.push({
                type: InsightType.BlockingOperation,
                title: 'Current Execution Point',
                description: `Paused at ${session.currentFrame.functionName}`,
                severity: 'info',
                recommendation: 'Inspect local variables and step through the code'
            });
        }

        return insights;
    }

    async explainStackTrace(frames: EnhancedStackFrame[]): Promise<string> {
        if (frames.length === 0) {
            return 'No stack frames available.';
        }

        const userFrames = frames.filter(f => f.isUserCode);
        const firstFrame = frames[0];

        let explanation = `The error originated in "${firstFrame.functionName}" at ${firstFrame.filePath}:${firstFrame.line}.\n\n`;

        if (userFrames.length > 0) {
            explanation += 'Call path through your code:\n';
            userFrames.forEach((frame, i) => {
                explanation += `${i + 1}. ${frame.functionName} (${frame.filePath}:${frame.line})\n`;
            });
        }

        explanation += `\nTotal frames: ${frames.length}`;

        return explanation;
    }

    async suggestBreakpoints(filePath: string): Promise<CodeLocation[]> {
        const suggestions: CodeLocation[] = [];

        if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
            suggestions.push(
                { filePath, line: 1, context: 'Module entry point' }
            );
        }

        return suggestions;
    }

    async suggestWatchExpressions(frame: EnhancedStackFrame): Promise<string[]> {
        const suggestions: string[] = [];

        if (frame.localVariables) {
            frame.localVariables.forEach(v => {
                if (v.isRelevant) {
                    suggestions.push(v.name);
                }
            });
        }

        suggestions.push('this');

        return suggestions;
    }

    private performBasicAnalysis(errorMessage: string, errorStack: string): ErrorAnalysis {
        let errorType = 'Error';
        let rootCause = 'Unknown error';
        const suggestedFixes = [];

        // Pattern matching for common errors
        if (errorMessage.includes('undefined')) {
            errorType = 'TypeError';
            rootCause = 'Attempting to access a property of undefined';
            suggestedFixes.push({
                description: 'Add null/undefined checks before accessing the property',
                priority: 'high' as const,
                explanation: 'Use optional chaining (?.) or explicit null checks'
            });
        } else if (errorMessage.includes('null')) {
            errorType = 'TypeError';
            rootCause = 'Attempting to access a property of null';
            suggestedFixes.push({
                description: 'Ensure the variable is initialized before use',
                priority: 'high' as const,
                explanation: 'Check the initialization flow of the variable'
            });
        } else if (errorMessage.includes('is not a function')) {
            errorType = 'TypeError';
            rootCause = 'Trying to call something that is not a function';
            suggestedFixes.push({
                description: 'Check the variable type and ensure it is a function',
                priority: 'high' as const,
                explanation: 'The variable may be undefined or of a different type than expected'
            });
        } else if (errorMessage.includes('SyntaxError')) {
            errorType = 'SyntaxError';
            rootCause = 'Invalid JavaScript/TypeScript syntax';
            suggestedFixes.push({
                description: 'Check for missing brackets, quotes, or semicolons',
                priority: 'high' as const,
                explanation: 'Review the code syntax near the error location'
            });
        } else if (errorMessage.includes('ReferenceError')) {
            errorType = 'ReferenceError';
            rootCause = 'Accessing a variable that has not been declared';
            suggestedFixes.push({
                description: 'Ensure the variable is declared before use',
                priority: 'high' as const,
                explanation: 'Check variable scope and imports'
            });
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('CORS')) {
            errorType = 'NetworkError';
            rootCause = 'Network request failed';
            suggestedFixes.push({
                description: 'Check network connectivity and server status',
                priority: 'high' as const,
                explanation: 'Verify the URL, CORS settings, and network connection'
            });
        } else if (errorMessage.includes('timeout')) {
            errorType = 'TimeoutError';
            rootCause = 'Operation timed out';
            suggestedFixes.push({
                description: 'Increase timeout duration or optimize the operation',
                priority: 'medium' as const,
                explanation: 'The operation took longer than the allowed time'
            });
        } else {
            suggestedFixes.push({
                description: 'Review the error message and stack trace for more details',
                priority: 'medium' as const,
                explanation: 'Manual investigation required'
            });
        }

        // Extract file location from stack if available
        const relatedCode: CodeLocation[] = [];
        const stackLines = errorStack.split('\n');
        for (const line of stackLines.slice(0, 5)) {
            const match = line.match(/at\s+(\S+)\s+\((.+):(\d+):\d+\)/);
            if (match) {
                relatedCode.push({
                    filePath: match[2],
                    line: parseInt(match[3], 10),
                    context: match[1]
                });
            }
        }

        return {
            errorType,
            errorMessage,
            rootCause,
            suggestedFixes,
            relatedCode,
            confidence: 0.6
        };
    }
}
