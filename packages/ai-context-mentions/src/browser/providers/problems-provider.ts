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
import { URI } from '@theia/core';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import { Marker } from '@theia/markers/lib/common/marker';
import { Diagnostic, DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    EnhancedContextProvider,
    ContextProviderCategory,
    ContextContentType,
    ContextResolutionOptions,
    ResolvedContextMention,
    ContextMentionSuggestion,
    ContextMentionUtils
} from '../../common';

type ProblemSeverity = 'error' | 'warning' | 'info' | 'hint' | 'all';

@injectable()
export class ProblemsContextProvider implements EnhancedContextProvider {
    readonly id = 'context.problems';
    readonly name = 'problems';
    readonly label = 'Problems & Diagnostics';
    readonly description = 'Current errors, warnings, and diagnostics in the workspace';
    readonly category = ContextProviderCategory.Code;
    readonly iconClass = 'codicon codicon-warning';
    readonly acceptsArguments = true;
    readonly argumentDescription = 'Severity filter: error, warning, info, hint, or all (default: all)';
    readonly examples = ['@problems', '@problems:error', '@problems:warning'];

    @inject(ProblemManager)
    protected readonly problemManager: ProblemManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    async canResolve(_arg?: string): Promise<boolean> {
        return true; // Always available, even if no problems
    }

    async resolve(arg?: string, _options?: ContextResolutionOptions): Promise<ResolvedContextMention | undefined> {
        const severity = this.parseSeverity(arg);
        const allMarkers = this.getAllMarkers();

        // Filter by severity
        const filtered = severity === 'all'
            ? allMarkers
            : allMarkers.filter(m => this.matchesSeverity(m.data, severity));

        if (filtered.length === 0) {
            const message = severity === 'all'
                ? 'No problems found in the workspace.'
                : `No ${severity}s found in the workspace.`;

            return {
                providerId: this.id,
                label: 'Problems',
                content: `# Problems\n\n${message}`,
                contentType: ContextContentType.Markdown,
                contentSize: message.length + 20,
                tokenEstimate: 15
            };
        }

        // Group by file
        const byFile = new Map<string, Array<{ marker: Marker<Diagnostic>; relativePath: string }>>();

        for (const marker of filtered) {
            const markerUri = marker.uri;
            if (!byFile.has(markerUri)) {
                byFile.set(markerUri, []);
            }
            const relativePath = await this.getRelativePath(markerUri);
            byFile.get(markerUri)!.push({ marker, relativePath });
        }

        // Format output
        const sections: string[] = [];
        sections.push(`# Problems (${severity})\n`);

        // Summary
        const errorCount = filtered.filter(m => m.data.severity === DiagnosticSeverity.Error).length;
        const warningCount = filtered.filter(m => m.data.severity === DiagnosticSeverity.Warning).length;
        const infoCount = filtered.filter(m =>
            m.data.severity === DiagnosticSeverity.Information ||
            m.data.severity === DiagnosticSeverity.Hint
        ).length;

        sections.push(`**Summary:** ${errorCount} errors, ${warningCount} warnings, ${infoCount} info/hints\n`);

        // By file
        for (const [_fileUri, items] of byFile) {
            const relativePath = items[0].relativePath;
            sections.push(`## ${relativePath}\n`);

            for (const { marker } of items) {
                const diag = marker.data;
                const icon = this.getSeverityIcon(diag.severity);
                const line = diag.range.start.line + 1;
                const col = diag.range.start.character + 1;
                const source = diag.source ? ` [${diag.source}]` : '';

                sections.push(`- ${icon} Line ${line}:${col}${source}: ${diag.message}`);
            }

            sections.push('');
        }

        const content = sections.join('\n');

        return {
            providerId: this.id,
            label: `Problems (${filtered.length})`,
            content,
            contentType: ContextContentType.Markdown,
            contentSize: content.length,
            tokenEstimate: ContextMentionUtils.estimateTokens(content),
            metadata: {
                total: filtered.length,
                errors: errorCount,
                warnings: warningCount,
                info: infoCount
            }
        };
    }

    async getSuggestions(partial: string): Promise<ContextMentionSuggestion[]> {
        const options: ProblemSeverity[] = ['all', 'error', 'warning', 'info', 'hint'];
        const partialLower = partial.toLowerCase();

        return options
            .filter(opt => opt.startsWith(partialLower) || partialLower === '')
            .map((opt, index) => ({
                id: `problems-${opt}`,
                providerId: this.id,
                label: opt,
                description: this.getSeverityDescription(opt),
                insertText: opt,
                sortPriority: 100 - index
            }));
    }

    protected parseSeverity(arg?: string): ProblemSeverity {
        const valid: ProblemSeverity[] = ['error', 'warning', 'info', 'hint', 'all'];
        if (arg && valid.includes(arg.toLowerCase() as ProblemSeverity)) {
            return arg.toLowerCase() as ProblemSeverity;
        }
        return 'all';
    }

    protected getAllMarkers(): Marker<Diagnostic>[] {
        const markers: Marker<Diagnostic>[] = [];
        const uris = this.problemManager.getUris();

        for (const uriString of uris) {
            const uri = new URI(uriString);
            const fileMarkers = this.problemManager.findMarkers({ uri });
            markers.push(...fileMarkers);
        }

        // Sort by severity (errors first) then by file
        markers.sort((a, b) => {
            const severityDiff = (a.data.severity || 4) - (b.data.severity || 4);
            if (severityDiff !== 0) {
                return severityDiff;
            }
            return a.uri.localeCompare(b.uri);
        });

        return markers;
    }

    protected matchesSeverity(diag: Diagnostic, severity: ProblemSeverity): boolean {
        switch (severity) {
            case 'error':
                return diag.severity === DiagnosticSeverity.Error;
            case 'warning':
                return diag.severity === DiagnosticSeverity.Warning;
            case 'info':
                return diag.severity === DiagnosticSeverity.Information;
            case 'hint':
                return diag.severity === DiagnosticSeverity.Hint;
            default:
                return true;
        }
    }

    protected getSeverityIcon(severity?: DiagnosticSeverity): string {
        switch (severity) {
            case DiagnosticSeverity.Error:
                return '❌';
            case DiagnosticSeverity.Warning:
                return '⚠️';
            case DiagnosticSeverity.Information:
                return 'ℹ️';
            case DiagnosticSeverity.Hint:
                return '💡';
            default:
                return '•';
        }
    }

    protected getSeverityDescription(severity: ProblemSeverity): string {
        const descriptions: Record<ProblemSeverity, string> = {
            all: 'Show all problems',
            error: 'Show only errors',
            warning: 'Show only warnings',
            info: 'Show only info messages',
            hint: 'Show only hints'
        };
        return descriptions[severity];
    }

    protected async getRelativePath(uri: string): Promise<string> {
        const roots = this.workspaceService.tryGetRoots();
        for (const root of roots) {
            const rootStr = root.resource.toString();
            if (uri.startsWith(rootStr)) {
                return uri.slice(rootStr.length + 1);
            }
        }
        return uri.split('/').pop() || uri;
    }
}
