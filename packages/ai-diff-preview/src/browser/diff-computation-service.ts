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
    DiffComputationService,
    FileDiff,
    DiffHunk,
    DiffLine,
    DiffLineType,
    HunkStatus,
    DiffStatus,
    DiffOptions,
    DEFAULT_DIFF_OPTIONS
} from '../common';

/**
 * Service for computing diffs between text content
 * Uses a modified Myers diff algorithm
 */
@injectable()
export class DiffComputationServiceImpl implements DiffComputationService {

    computeDiff(original: string, modified: string, options?: DiffOptions): FileDiff {
        const opts = { ...DEFAULT_DIFF_OPTIONS, ...options };

        // Preprocess content
        let origLines = this.splitLines(original);
        let modLines = this.splitLines(modified);

        if (opts.trimTrailingWhitespace) {
            origLines = origLines.map(l => l.trimEnd());
            modLines = modLines.map(l => l.trimEnd());
        }

        if (opts.ignoreWhitespace) {
            // Normalize whitespace for comparison
            origLines = origLines.map(l => l.replace(/\s+/g, ' ').trim());
            modLines = modLines.map(l => l.replace(/\s+/g, ' ').trim());
        }

        // Compute LCS-based diff
        const diffLines = this.computeLCSDiff(origLines, modLines);

        // Group into hunks
        const hunks = this.groupIntoHunks(diffLines, opts.contextLines || 3);

        const diffId = this.generateId();

        return {
            id: diffId,
            filePath: '',
            originalContent: original,
            modifiedContent: modified,
            hunks,
            status: DiffStatus.Pending,
            createdAt: Date.now(),
            source: 'ai'
        };
    }

    applyHunks(original: string, hunks: DiffHunk[]): string {
        const origLines = this.splitLines(original);
        const result: string[] = [];

        // Sort hunks by original start line
        const sortedHunks = [...hunks]
            .filter(h => h.status === HunkStatus.Accepted)
            .sort((a, b) => a.originalStart - b.originalStart);

        let currentLine = 0;

        for (const hunk of sortedHunks) {
            // Add unchanged lines before this hunk
            while (currentLine < hunk.originalStart - 1) {
                result.push(origLines[currentLine]);
                currentLine++;
            }

            // Add lines from the hunk
            for (const line of hunk.lines) {
                if (line.type === DiffLineType.Added || line.type === DiffLineType.Unchanged) {
                    result.push(line.content);
                }
                if (line.type === DiffLineType.Removed || line.type === DiffLineType.Unchanged) {
                    currentLine++;
                }
            }
        }

        // Add remaining unchanged lines
        while (currentLine < origLines.length) {
            result.push(origLines[currentLine]);
            currentLine++;
        }

        return result.join('\n');
    }

    getResultContent(diff: FileDiff): string {
        const acceptedHunks = diff.hunks.filter(h => h.status === HunkStatus.Accepted);

        if (acceptedHunks.length === 0) {
            return diff.originalContent;
        }

        if (acceptedHunks.length === diff.hunks.length) {
            return diff.modifiedContent;
        }

        return this.applyHunks(diff.originalContent, diff.hunks);
    }

    protected splitLines(content: string): string[] {
        return content.split('\n');
    }

    protected computeLCSDiff(origLines: string[], modLines: string[]): DiffLine[] {
        const m = origLines.length;
        const n = modLines.length;

        // Build LCS table
        const dp: number[][] = Array(m + 1).fill(null)
            .map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (origLines[i - 1] === modLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to build diff
        const diffLines: DiffLine[] = [];
        let i = m;
        let j = n;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
                diffLines.unshift({
                    originalLineNumber: i,
                    modifiedLineNumber: j,
                    content: origLines[i - 1],
                    type: DiffLineType.Unchanged
                });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                diffLines.unshift({
                    modifiedLineNumber: j,
                    content: modLines[j - 1],
                    type: DiffLineType.Added
                });
                j--;
            } else {
                diffLines.unshift({
                    originalLineNumber: i,
                    content: origLines[i - 1],
                    type: DiffLineType.Removed
                });
                i--;
            }
        }

        return diffLines;
    }

    protected groupIntoHunks(diffLines: DiffLine[], contextLines: number): DiffHunk[] {
        const hunks: DiffHunk[] = [];
        let currentHunk: DiffLine[] = [];
        let hunkStartOrig = 0;
        let hunkStartMod = 0;
        let unchangedCount = 0;
        let inHunk = false;

        for (let i = 0; i < diffLines.length; i++) {
            const line = diffLines[i];

            if (line.type !== DiffLineType.Unchanged) {
                // Found a change
                if (!inHunk) {
                    // Start a new hunk with context
                    inHunk = true;
                    const contextStart = Math.max(0, i - contextLines);

                    // Add context lines before
                    for (let c = contextStart; c < i; c++) {
                        if (currentHunk.length === 0) {
                            hunkStartOrig = diffLines[c].originalLineNumber || 1;
                            hunkStartMod = diffLines[c].modifiedLineNumber || 1;
                        }
                        currentHunk.push(diffLines[c]);
                    }
                }

                currentHunk.push(line);
                unchangedCount = 0;
            } else {
                // Unchanged line
                if (inHunk) {
                    currentHunk.push(line);
                    unchangedCount++;

                    // If we've seen enough unchanged lines, end the hunk
                    if (unchangedCount > contextLines * 2) {
                        // Remove extra context lines from the end
                        const trimCount = unchangedCount - contextLines;
                        for (let t = 0; t < trimCount; t++) {
                            currentHunk.pop();
                        }

                        // Create hunk
                        if (currentHunk.length > 0) {
                            hunks.push(this.createHunk(currentHunk, hunkStartOrig, hunkStartMod));
                        }

                        currentHunk = [];
                        inHunk = false;
                        unchangedCount = 0;
                    }
                }
            }
        }

        // Handle remaining lines
        if (currentHunk.length > 0) {
            // Trim excess context from end
            while (currentHunk.length > 0 &&
                   currentHunk[currentHunk.length - 1].type === DiffLineType.Unchanged &&
                   unchangedCount > contextLines) {
                currentHunk.pop();
                unchangedCount--;
            }

            if (currentHunk.some(l => l.type !== DiffLineType.Unchanged)) {
                hunks.push(this.createHunk(currentHunk, hunkStartOrig, hunkStartMod));
            }
        }

        return hunks;
    }

    protected createHunk(lines: DiffLine[], startOrig: number, startMod: number): DiffHunk {
        const origLines = lines.filter(l =>
            l.type === DiffLineType.Unchanged || l.type === DiffLineType.Removed
        ).length;

        const modLines = lines.filter(l =>
            l.type === DiffLineType.Unchanged || l.type === DiffLineType.Added
        ).length;

        return {
            id: this.generateId(),
            originalStart: startOrig || 1,
            originalLength: origLines,
            modifiedStart: startMod || 1,
            modifiedLength: modLines,
            lines,
            status: HunkStatus.Pending
        };
    }

    protected generateId(): string {
        return `diff-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}
