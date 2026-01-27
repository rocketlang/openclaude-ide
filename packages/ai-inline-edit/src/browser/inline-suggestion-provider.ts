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

import { injectable } from '@theia/core/shared/inversify';
import {
    InlineSuggestionProvider,
    EditContext,
    GhostTextSuggestion,
    SuggestionSource
} from '../common';

/**
 * AI-powered inline suggestion provider
 */
@injectable()
export class AIInlineSuggestionProvider implements InlineSuggestionProvider {

    readonly id = 'ai-inline-provider';
    readonly priority = 100;

    protected abortController?: AbortController;

    async provideSuggestions(context: EditContext): Promise<GhostTextSuggestion[]> {
        this.cancel();
        this.abortController = new AbortController();

        try {
            const suggestions: GhostTextSuggestion[] = [];

            // Generate completion based on context
            const completion = await this.generateCompletion(context);
            if (completion) {
                suggestions.push(completion);
            }

            return suggestions;

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return [];
            }
            console.error('Error generating suggestions:', error);
            return [];
        }
    }

    cancel(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = undefined;
        }
    }

    protected async generateCompletion(context: EditContext): Promise<GhostTextSuggestion | undefined> {
        const { prefix, currentLine, languageId, cursorPosition } = context;

        // Simple pattern-based suggestions for common cases
        // In production, this would call an AI model
        const suggestion = this.getPatternBasedSuggestion(prefix, currentLine, languageId);

        if (!suggestion) {
            // Fall back to AI generation (simulated)
            return this.generateAISuggestion(context);
        }

        return {
            id: this.generateId(),
            text: suggestion,
            position: cursorPosition,
            confidence: 0.85,
            source: SuggestionSource.Completion,
            timestamp: Date.now(),
            isMultiLine: suggestion.includes('\n'),
            previewLines: suggestion.split('\n').slice(0, 5)
        };
    }

    protected getPatternBasedSuggestion(prefix: string, currentLine: string, languageId: string): string | undefined {
        const trimmedLine = currentLine.trim();
        const trimmedPrefix = prefix.trim();

        // TypeScript/JavaScript patterns
        if (languageId === 'typescript' || languageId === 'javascript') {
            return this.getJSTSSuggestion(trimmedLine, trimmedPrefix);
        }

        // Python patterns
        if (languageId === 'python') {
            return this.getPythonSuggestion(trimmedLine, trimmedPrefix);
        }

        // Java patterns
        if (languageId === 'java') {
            return this.getJavaSuggestion(trimmedLine, trimmedPrefix);
        }

        return undefined;
    }

    protected getJSTSSuggestion(line: string, prefix: string): string | undefined {
        // Function definition patterns
        if (line.startsWith('function ') && line.includes('(') && !line.includes(')')) {
            return ') {\n    \n}';
        }

        // Arrow function patterns
        if (line.includes('=>') && !line.includes('{')) {
            if (line.endsWith('=>')) {
                return ' {\n    \n}';
            }
        }

        // If statement
        if (line.startsWith('if ') && line.includes('(') && !line.includes(')')) {
            return ') {\n    \n}';
        }

        // For loop
        if (line.startsWith('for ') && line.includes('(') && !line.includes(')')) {
            if (line.includes('let i')) {
                return '; i < length; i++) {\n    \n}';
            }
            return ') {\n    \n}';
        }

        // Class definition
        if (line.startsWith('class ') && !line.includes('{')) {
            return ` {\n    constructor() {\n        \n    }\n}`;
        }

        // Interface definition
        if (line.startsWith('interface ') && !line.includes('{')) {
            return ' {\n    \n}';
        }

        // Console.log
        if (line === 'console.') {
            return 'log()';
        }

        // Import statement
        if (line.startsWith('import ') && line.includes('from') && !line.includes("'") && !line.includes('"')) {
            return " '';";
        }

        // Async function
        if (line.startsWith('async function') && !line.includes(')')) {
            return ') {\n    \n}';
        }

        // Try-catch
        if (line === 'try') {
            return ' {\n    \n} catch (error) {\n    console.error(error);\n}';
        }

        return undefined;
    }

    protected getPythonSuggestion(line: string, prefix: string): string | undefined {
        // Function definition
        if (line.startsWith('def ') && !line.includes(':')) {
            if (!line.includes(')')) {
                return '):\n    pass';
            }
            return ':\n    pass';
        }

        // Class definition
        if (line.startsWith('class ') && !line.includes(':')) {
            return ':\n    def __init__(self):\n        pass';
        }

        // If statement
        if (line.startsWith('if ') && !line.includes(':')) {
            return ':\n    pass';
        }

        // For loop
        if (line.startsWith('for ') && !line.includes(':')) {
            if (line.includes(' in ')) {
                return ':\n    pass';
            }
            return ' in range():\n    pass';
        }

        // While loop
        if (line.startsWith('while ') && !line.includes(':')) {
            return ':\n    pass';
        }

        // Try-except
        if (line === 'try') {
            return ':\n    pass\nexcept Exception as e:\n    print(e)';
        }

        // Print statement
        if (line === 'print') {
            return '()';
        }

        return undefined;
    }

    protected getJavaSuggestion(line: string, prefix: string): string | undefined {
        // Public class
        if (line.startsWith('public class') && !line.includes('{')) {
            return ' {\n    \n}';
        }

        // Public method
        if (line.includes('public ') && line.includes('(') && !line.includes(')')) {
            return ') {\n        \n    }';
        }

        // Main method
        if (line.includes('public static void main')) {
            return '(String[] args) {\n        \n    }';
        }

        // For loop
        if (line.startsWith('for ') && line.includes('(') && !line.includes(')')) {
            if (line.includes('int i')) {
                return '; i < length; i++) {\n            \n        }';
            }
        }

        // Try-catch
        if (line === 'try') {
            return ' {\n            \n        } catch (Exception e) {\n            e.printStackTrace();\n        }';
        }

        // System.out.println
        if (line === 'System.out.') {
            return 'println()';
        }

        return undefined;
    }

    protected async generateAISuggestion(context: EditContext): Promise<GhostTextSuggestion | undefined> {
        // Simulate AI generation delay
        await this.delay(100);

        if (this.abortController?.signal.aborted) {
            return undefined;
        }

        // In production, this would call the AI model
        // For now, return undefined to indicate no AI suggestion available
        return undefined;
    }

    protected generateId(): string {
        return `suggestion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
