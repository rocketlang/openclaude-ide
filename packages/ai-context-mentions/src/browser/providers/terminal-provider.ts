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

import { injectable, inject } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import {
    EnhancedContextProvider,
    ContextProviderCategory,
    ContextContentType,
    ContextResolutionOptions,
    ResolvedContextMention,
    ContextMentionSuggestion,
    ContextMentionUtils
} from '../../common';

@injectable()
export class TerminalContextProvider implements EnhancedContextProvider {
    readonly id = 'context.terminal';
    readonly name = 'terminal';
    readonly label = 'Terminal Output';
    readonly description = 'Recent terminal output from active or specified terminal';
    readonly category = ContextProviderCategory.Terminal;
    readonly iconClass = 'codicon codicon-terminal';
    readonly acceptsArguments = true;
    readonly argumentDescription = 'Optional: terminal number or "all" for all terminals, and line count (e.g., "1:50" for terminal 1, last 50 lines)';
    readonly examples = ['@terminal', '@terminal:100', '@terminal:1', '@terminal:all'];

    protected readonly defaultLineCount = 50;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    async canResolve(_arg?: string): Promise<boolean> {
        const terminals = this.terminalService.all;
        return terminals.length > 0;
    }

    async resolve(arg?: string, options?: ContextResolutionOptions): Promise<ResolvedContextMention | undefined> {
        const terminals = this.terminalService.all;
        if (terminals.length === 0) {
            return undefined;
        }

        const { terminalIndex, lineCount, all } = this.parseArg(arg);
        const sections: string[] = [];

        if (all) {
            // Get output from all terminals
            for (let i = 0; i < terminals.length; i++) {
                const terminal = terminals[i];
                const output = await this.getTerminalOutput(terminal, lineCount);
                if (output) {
                    sections.push(`## Terminal ${i + 1}: ${terminal.title.label}\n\n\`\`\`\n${output}\n\`\`\``);
                }
            }
        } else {
            // Get output from specific terminal or active terminal
            let terminal: TerminalWidget | undefined;

            if (terminalIndex !== undefined && terminalIndex >= 0 && terminalIndex < terminals.length) {
                terminal = terminals[terminalIndex];
            } else {
                // Try to get current/active terminal
                terminal = this.terminalService.currentTerminal || terminals[0];
            }

            if (terminal) {
                const output = await this.getTerminalOutput(terminal, lineCount);
                if (output) {
                    sections.push(`## Terminal: ${terminal.title.label}\n\n\`\`\`\n${output}\n\`\`\``);
                }
            }
        }

        if (sections.length === 0) {
            return {
                providerId: this.id,
                label: 'Terminal Output',
                content: '# Terminal Output\n\nNo terminal output available.',
                contentType: ContextContentType.Markdown,
                contentSize: 50,
                tokenEstimate: 15
            };
        }

        const content = `# Terminal Output\n\n${sections.join('\n\n')}`;

        return {
            providerId: this.id,
            label: `Terminal (${all ? 'all' : lineCount} lines)`,
            content,
            contentType: ContextContentType.Markdown,
            contentSize: content.length,
            tokenEstimate: ContextMentionUtils.estimateTokens(content),
            metadata: {
                terminalCount: all ? terminals.length : 1,
                lineCount
            }
        };
    }

    async getSuggestions(partial: string): Promise<ContextMentionSuggestion[]> {
        const suggestions: ContextMentionSuggestion[] = [];
        const terminals = this.terminalService.all;

        // Suggest line counts
        const lineCounts = ['50', '100', '200', 'all'];
        for (const count of lineCounts) {
            if (count.startsWith(partial) || partial === '') {
                suggestions.push({
                    id: `terminal-${count}`,
                    providerId: this.id,
                    label: count,
                    description: count === 'all' ? 'Output from all terminals' : `Last ${count} lines`,
                    insertText: count,
                    sortPriority: count === 'all' ? 90 : 100
                });
            }
        }

        // Suggest specific terminals
        for (let i = 0; i < terminals.length; i++) {
            const terminalNum = String(i + 1);
            if (terminalNum.startsWith(partial) || partial === '') {
                suggestions.push({
                    id: `terminal-${i}`,
                    providerId: this.id,
                    label: terminalNum,
                    description: terminals[i].title.label,
                    insertText: terminalNum,
                    sortPriority: 80 - i
                });
            }
        }

        return suggestions;
    }

    protected parseArg(arg?: string): { terminalIndex?: number; lineCount: number; all: boolean } {
        if (!arg) {
            return { lineCount: this.defaultLineCount, all: false };
        }

        if (arg === 'all') {
            return { lineCount: this.defaultLineCount, all: true };
        }

        // Check for format "terminalIndex:lineCount" or just a number
        const parts = arg.split(':');

        if (parts.length === 2) {
            const terminalIndex = parseInt(parts[0], 10) - 1; // Convert to 0-based
            const lineCount = parseInt(parts[1], 10) || this.defaultLineCount;
            return { terminalIndex, lineCount, all: false };
        }

        const num = parseInt(arg, 10);
        if (!isNaN(num)) {
            // If small number, treat as terminal index; if large, treat as line count
            if (num <= 10) {
                return { terminalIndex: num - 1, lineCount: this.defaultLineCount, all: false };
            } else {
                return { lineCount: num, all: false };
            }
        }

        return { lineCount: this.defaultLineCount, all: false };
    }

    protected async getTerminalOutput(terminal: TerminalWidget, lineCount: number): Promise<string | undefined> {
        try {
            // Access terminal buffer if available
            const terminalInstance = terminal as unknown as {
                term?: {
                    buffer?: {
                        active?: {
                            length: number;
                            getLine(y: number): { translateToString(trimRight?: boolean): string } | undefined;
                        };
                    };
                };
            };

            const buffer = terminalInstance.term?.buffer?.active;
            if (!buffer) {
                return undefined;
            }

            const lines: string[] = [];
            const startLine = Math.max(0, buffer.length - lineCount);

            for (let i = startLine; i < buffer.length; i++) {
                const line = buffer.getLine(i);
                if (line) {
                    const text = line.translateToString(true);
                    if (text.trim()) {
                        lines.push(text);
                    }
                }
            }

            return lines.join('\n') || undefined;
        } catch {
            return undefined;
        }
    }
}
