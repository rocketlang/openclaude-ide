// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import {
    AICommitService,
    DiffAnalysis,
    FileChange,
    GeneratedCommitMessage,
    CommitMessageOptions,
    CommitMessageHistoryEntry,
    CommitType,
    formatConventionalCommit
} from '../common/ai-commit-protocol';

const execAsync = promisify(exec);

@injectable()
export class AICommitServiceImpl implements AICommitService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected history: CommitMessageHistoryEntry[] = [];

    async analyzeDiff(repositoryPath: string, staged: boolean = true): Promise<DiffAnalysis> {
        this.logger.info(`Analyzing diff in ${repositoryPath} (staged: ${staged})`);

        try {
            // Get file status
            const statusCommand = staged
                ? 'git diff --cached --name-status'
                : 'git diff --name-status';

            const { stdout: statusOutput } = await execAsync(statusCommand, {
                cwd: repositoryPath,
                maxBuffer: 10 * 1024 * 1024
            });

            // Get diff stats
            const statsCommand = staged
                ? 'git diff --cached --numstat'
                : 'git diff --numstat';

            const { stdout: statsOutput } = await execAsync(statsCommand, {
                cwd: repositoryPath,
                maxBuffer: 10 * 1024 * 1024
            });

            // Parse file changes
            const files: FileChange[] = [];
            const statusLines = statusOutput.trim().split('\n').filter(l => l);
            const statsLines = statsOutput.trim().split('\n').filter(l => l);

            const statsMap = new Map<string, { additions: number; deletions: number }>();
            for (const line of statsLines) {
                const [additions, deletions, filePath] = line.split('\t');
                statsMap.set(filePath, {
                    additions: additions === '-' ? 0 : parseInt(additions, 10),
                    deletions: deletions === '-' ? 0 : parseInt(deletions, 10)
                });
            }

            const changeTypes = { added: 0, modified: 0, deleted: 0, renamed: 0 };
            let totalAdditions = 0;
            let totalDeletions = 0;

            for (const line of statusLines) {
                const [statusCode, ...pathParts] = line.split('\t');
                const filePath = pathParts.join('\t');

                let status: FileChange['status'];
                let oldPath: string | undefined;

                switch (statusCode[0]) {
                    case 'A':
                        status = 'added';
                        changeTypes.added++;
                        break;
                    case 'M':
                        status = 'modified';
                        changeTypes.modified++;
                        break;
                    case 'D':
                        status = 'deleted';
                        changeTypes.deleted++;
                        break;
                    case 'R':
                        status = 'renamed';
                        changeTypes.renamed++;
                        oldPath = pathParts[0];
                        break;
                    default:
                        status = 'modified';
                        changeTypes.modified++;
                }

                const stats = statsMap.get(filePath) || { additions: 0, deletions: 0 };
                totalAdditions += stats.additions;
                totalDeletions += stats.deletions;

                files.push({
                    path: filePath,
                    status,
                    additions: stats.additions,
                    deletions: stats.deletions,
                    oldPath
                });
            }

            // Detect patterns
            const patterns = this.detectPatterns(files);

            // Optionally get diff content for important files
            if (files.length <= 10) {
                for (const file of files) {
                    if (file.status !== 'deleted' && file.additions + file.deletions < 500) {
                        try {
                            const diffCommand = staged
                                ? `git diff --cached -- "${file.path}"`
                                : `git diff -- "${file.path}"`;
                            const { stdout: diff } = await execAsync(diffCommand, {
                                cwd: repositoryPath,
                                maxBuffer: 1024 * 1024
                            });
                            file.diff = diff.slice(0, 5000); // Limit diff size
                        } catch {
                            // Ignore diff fetch errors
                        }
                    }
                }
            }

            return {
                repositoryPath,
                files,
                totalAdditions,
                totalDeletions,
                staged,
                changeTypes,
                patterns
            };
        } catch (error) {
            this.logger.error(`Failed to analyze diff: ${error}`);
            throw new Error(`Failed to analyze diff: ${error}`);
        }
    }

    protected detectPatterns(files: FileChange[]): string[] {
        const patterns: string[] = [];

        // Check for test files
        const testFiles = files.filter(f =>
            f.path.includes('test') || f.path.includes('spec') || f.path.includes('__tests__')
        );
        if (testFiles.length > 0) {
            patterns.push(`test files (${testFiles.length})`);
        }

        // Check for documentation
        const docFiles = files.filter(f =>
            f.path.endsWith('.md') || f.path.includes('docs/') || f.path.includes('README')
        );
        if (docFiles.length > 0) {
            patterns.push(`documentation (${docFiles.length})`);
        }

        // Check for config files
        const configFiles = files.filter(f =>
            f.path.includes('config') ||
            f.path.endsWith('.json') ||
            f.path.endsWith('.yaml') ||
            f.path.endsWith('.yml') ||
            f.path.includes('.rc')
        );
        if (configFiles.length > 0) {
            patterns.push(`config files (${configFiles.length})`);
        }

        // Check for package changes
        const packageFiles = files.filter(f =>
            f.path.includes('package.json') || f.path.includes('package-lock')
        );
        if (packageFiles.length > 0) {
            patterns.push('package changes');
        }

        // Check for style/CSS files
        const styleFiles = files.filter(f =>
            f.path.endsWith('.css') || f.path.endsWith('.scss') || f.path.endsWith('.less')
        );
        if (styleFiles.length > 0) {
            patterns.push(`style files (${styleFiles.length})`);
        }

        // Check for CI/CD files
        const ciFiles = files.filter(f =>
            f.path.includes('.github/') || f.path.includes('.gitlab-ci') || f.path.includes('Jenkinsfile')
        );
        if (ciFiles.length > 0) {
            patterns.push('CI/CD configuration');
        }

        // Detect common directories/components
        const directories = new Set(files.map(f => path.dirname(f.path).split('/')[0]).filter(d => d !== '.'));
        if (directories.size === 1) {
            patterns.push(`single component: ${[...directories][0]}`);
        } else if (directories.size <= 3) {
            patterns.push(`components: ${[...directories].join(', ')}`);
        }

        return patterns;
    }

    async generateCommitMessage(
        analysis: DiffAnalysis,
        options: CommitMessageOptions = {}
    ): Promise<GeneratedCommitMessage> {
        this.logger.info(`Generating commit message for ${analysis.files.length} files`);

        const {
            conventionalCommit = true,
            maxSubjectLength = 72,
            includeFileList = false,
            useEmojis = false,
            numAlternatives = 2
        } = options;

        // Determine commit type based on patterns and file changes
        const type = options.preferredType || this.inferCommitType(analysis);
        const scope = options.scope || this.inferScope(analysis);
        const subject = this.generateSubject(analysis, type, maxSubjectLength);
        const body = this.generateBody(analysis, includeFileList);

        const message = conventionalCommit
            ? formatConventionalCommit(type, subject, { scope, body, useEmoji: useEmojis })
            : subject + (body ? `\n\n${body}` : '');

        // Generate alternatives
        const alternatives: string[] = [];
        const altTypes = this.getAlternativeTypes(type, analysis);
        for (let i = 0; i < Math.min(numAlternatives, altTypes.length); i++) {
            const altSubject = this.generateSubject(analysis, altTypes[i], maxSubjectLength);
            alternatives.push(
                conventionalCommit
                    ? formatConventionalCommit(altTypes[i], altSubject, { scope, useEmoji: useEmojis })
                    : altSubject
            );
        }

        return {
            message,
            type,
            scope,
            subject,
            body,
            confidence: this.calculateConfidence(analysis, type),
            alternatives,
            reasoning: this.generateReasoning(analysis, type)
        };
    }

    protected inferCommitType(analysis: DiffAnalysis): CommitType {
        const { patterns, files, changeTypes } = analysis;

        // Check patterns first
        if (patterns.some(p => p.includes('test'))) {
            return 'test';
        }
        if (patterns.some(p => p.includes('documentation'))) {
            return 'docs';
        }
        if (patterns.some(p => p.includes('CI/CD'))) {
            return 'ci';
        }
        if (patterns.some(p => p.includes('style files'))) {
            return 'style';
        }
        if (patterns.some(p => p.includes('config'))) {
            return 'chore';
        }
        if (patterns.some(p => p.includes('package changes'))) {
            return 'build';
        }

        // Check file content patterns
        const hasFix = files.some(f =>
            f.path.toLowerCase().includes('fix') ||
            (f.diff && /\b(fix|bug|issue|error|crash|resolve)\b/i.test(f.diff))
        );
        if (hasFix) {
            return 'fix';
        }

        // Check for refactoring patterns
        const isRefactor = files.every(f => f.status === 'modified') &&
            analysis.totalAdditions > 0 && analysis.totalDeletions > 0 &&
            Math.abs(analysis.totalAdditions - analysis.totalDeletions) < analysis.totalAdditions * 0.3;
        if (isRefactor && files.length > 1) {
            return 'refactor';
        }

        // Default to feat for new files, chore for deletes
        if (changeTypes.added > changeTypes.modified) {
            return 'feat';
        }
        if (changeTypes.deleted > changeTypes.added + changeTypes.modified) {
            return 'chore';
        }

        // Default based on change size
        if (analysis.totalAdditions > 100 || files.length > 5) {
            return 'feat';
        }

        return 'chore';
    }

    protected inferScope(analysis: DiffAnalysis): string | undefined {
        const { files, patterns } = analysis;

        // Check for single component pattern
        const singleComponent = patterns.find(p => p.startsWith('single component:'));
        if (singleComponent) {
            return singleComponent.replace('single component: ', '');
        }

        // Check for common directory
        if (files.length > 0) {
            const firstDir = path.dirname(files[0].path).split('/')[0];
            if (firstDir && firstDir !== '.' && files.every(f => f.path.startsWith(firstDir))) {
                return firstDir;
            }
        }

        // Check for common file type
        const extensions = new Set(files.map(f => path.extname(f.path)).filter(e => e));
        if (extensions.size === 1) {
            const ext = [...extensions][0];
            if (ext === '.test.ts' || ext === '.spec.ts') {
                return 'tests';
            }
            if (ext === '.md') {
                return 'docs';
            }
        }

        return undefined;
    }

    protected generateSubject(analysis: DiffAnalysis, type: CommitType, maxLength: number): string {
        const { files, changeTypes, patterns } = analysis;

        let subject = '';

        // Generate based on type and patterns
        switch (type) {
            case 'feat':
                if (files.length === 1) {
                    subject = `add ${this.getFileName(files[0].path)}`;
                } else if (changeTypes.added > 0) {
                    subject = `add ${this.summarizeFiles(files.filter(f => f.status === 'added'))}`;
                } else {
                    subject = `implement ${this.summarizeChanges(analysis)}`;
                }
                break;

            case 'fix':
                subject = `fix ${this.summarizeChanges(analysis)}`;
                break;

            case 'docs':
                subject = `update documentation${files.length === 1 ? ` for ${this.getFileName(files[0].path)}` : ''}`;
                break;

            case 'test':
                subject = `add tests for ${this.summarizeChanges(analysis)}`;
                break;

            case 'refactor':
                subject = `refactor ${this.summarizeChanges(analysis)}`;
                break;

            case 'style':
                subject = `improve code style${files.length <= 3 ? ` in ${this.summarizeFiles(files)}` : ''}`;
                break;

            case 'chore':
                if (patterns.some(p => p.includes('package'))) {
                    subject = 'update dependencies';
                } else if (changeTypes.deleted > changeTypes.added) {
                    subject = `remove ${this.summarizeFiles(files.filter(f => f.status === 'deleted'))}`;
                } else {
                    subject = `update ${this.summarizeChanges(analysis)}`;
                }
                break;

            case 'build':
                subject = 'update build configuration';
                break;

            case 'ci':
                subject = 'update CI/CD configuration';
                break;

            case 'perf':
                subject = `improve performance of ${this.summarizeChanges(analysis)}`;
                break;

            default:
                subject = this.summarizeChanges(analysis);
        }

        // Trim to max length
        if (subject.length > maxLength) {
            subject = subject.substring(0, maxLength - 3) + '...';
        }

        return subject;
    }

    protected getFileName(filePath: string): string {
        return path.basename(filePath, path.extname(filePath));
    }

    protected summarizeFiles(files: FileChange[]): string {
        if (files.length === 0) {
            return 'changes';
        }
        if (files.length === 1) {
            return this.getFileName(files[0].path);
        }
        if (files.length <= 3) {
            return files.map(f => this.getFileName(f.path)).join(', ');
        }
        return `${files.length} files`;
    }

    protected summarizeChanges(analysis: DiffAnalysis): string {
        const { files, patterns } = analysis;

        // Use patterns if available
        if (patterns.length > 0) {
            const relevantPattern = patterns.find(p => !p.includes('('));
            if (relevantPattern) {
                return relevantPattern;
            }
        }

        // Use file names
        return this.summarizeFiles(files);
    }

    protected generateBody(analysis: DiffAnalysis, includeFileList: boolean): string | undefined {
        const parts: string[] = [];

        // Add summary
        if (analysis.files.length > 3) {
            parts.push(`Changed ${analysis.files.length} files (+${analysis.totalAdditions}/-${analysis.totalDeletions})`);
        }

        // Add patterns as context
        if (analysis.patterns.length > 0) {
            parts.push(`Changes include: ${analysis.patterns.join(', ')}`);
        }

        // Add file list if requested
        if (includeFileList && analysis.files.length <= 20) {
            parts.push('');
            parts.push('Files:');
            for (const file of analysis.files) {
                const prefix = file.status === 'added' ? '+' :
                    file.status === 'deleted' ? '-' :
                    file.status === 'renamed' ? '~' : 'M';
                parts.push(`  ${prefix} ${file.path}`);
            }
        }

        return parts.length > 0 ? parts.join('\n') : undefined;
    }

    protected getAlternativeTypes(primary: CommitType, analysis: DiffAnalysis): CommitType[] {
        const alternatives: CommitType[] = [];

        // Add related types
        if (primary === 'feat') {
            alternatives.push('chore', 'refactor');
        } else if (primary === 'fix') {
            alternatives.push('refactor', 'chore');
        } else if (primary === 'chore') {
            alternatives.push('refactor', 'fix');
        } else if (primary === 'refactor') {
            alternatives.push('chore', 'style');
        } else {
            alternatives.push('chore', 'feat');
        }

        return alternatives.filter(t => t !== primary);
    }

    protected calculateConfidence(analysis: DiffAnalysis, type: CommitType): number {
        let confidence = 0.5;

        // Higher confidence for single-file changes
        if (analysis.files.length === 1) {
            confidence += 0.2;
        }

        // Higher confidence for clear patterns
        if (analysis.patterns.length > 0) {
            confidence += 0.15;
        }

        // Higher confidence for small changes
        if (analysis.totalAdditions + analysis.totalDeletions < 100) {
            confidence += 0.1;
        }

        // Lower confidence for large changes
        if (analysis.files.length > 10) {
            confidence -= 0.2;
        }

        return Math.min(0.95, Math.max(0.2, confidence));
    }

    protected generateReasoning(analysis: DiffAnalysis, type: CommitType): string {
        const reasons: string[] = [];

        reasons.push(`Detected ${analysis.files.length} changed files`);

        if (analysis.patterns.length > 0) {
            reasons.push(`Identified patterns: ${analysis.patterns.join(', ')}`);
        }

        reasons.push(`Selected type '${type}' based on change analysis`);

        return reasons.join('. ');
    }

    async getRecentCommits(repositoryPath: string, count: number = 10): Promise<string[]> {
        try {
            const { stdout } = await execAsync(
                `git log --oneline -${count} --format="%s"`,
                { cwd: repositoryPath }
            );
            return stdout.trim().split('\n').filter(l => l);
        } catch {
            return [];
        }
    }

    async recordCommitMessage(entry: Omit<CommitMessageHistoryEntry, 'id' | 'timestamp'>): Promise<void> {
        const fullEntry: CommitMessageHistoryEntry = {
            ...entry,
            id: `commit-${Date.now()}`,
            timestamp: Date.now()
        };

        this.history.push(fullEntry);

        // Keep only last 100 entries
        if (this.history.length > 100) {
            this.history = this.history.slice(-100);
        }

        this.logger.debug(`Recorded commit message: ${fullEntry.finalMessage.split('\n')[0]}`);
    }

    async getHistorySuggestions(repositoryPath: string): Promise<string[]> {
        // Get suggestions based on history for this repo
        return this.history
            .filter(h => h.repositoryPath === repositoryPath)
            .slice(-5)
            .map(h => h.finalMessage);
    }
}
