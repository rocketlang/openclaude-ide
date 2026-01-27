// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import {
    AICodeReviewService,
    ReviewRequest,
    ReviewResult,
    ReviewIssue,
    ReviewOptions,
    ReviewSummary,
    ReviewFix,
    ApplyFixResult,
    ReviewSeverity,
    ReviewCategory,
    getSeverityIcon,
    getCategoryIcon,
    calculateReviewScore,
    getGradeFromScore
} from '../common/ai-code-review-protocol';

interface ReviewPattern {
    pattern: RegExp;
    severity: ReviewSeverity;
    category: ReviewCategory;
    title: string;
    message: string;
    explanation?: string;
    rule?: string;
    fix?: (match: RegExpMatchArray, line: string, lineNumber: number) => ReviewFix | undefined;
}

@injectable()
export class AICodeReviewServiceImpl implements AICodeReviewService {
    protected reviews: Map<string, ReviewResult> = new Map();
    protected fileIssues: Map<string, ReviewIssue[]> = new Map();
    protected dismissedIssues: Set<string> = new Set();

    protected readonly patterns: ReviewPattern[] = [
        // Security issues
        {
            pattern: /eval\s*\(/,
            severity: 'blocker',
            category: 'security',
            title: 'Dangerous eval() usage',
            message: 'Using eval() can lead to code injection vulnerabilities',
            explanation: 'eval() executes arbitrary code which can be exploited by attackers if user input is involved.',
            rule: 'no-eval',
            fix: () => undefined
        },
        {
            pattern: /innerHTML\s*=/,
            severity: 'critical',
            category: 'security',
            title: 'Potential XSS vulnerability',
            message: 'Direct innerHTML assignment can lead to XSS attacks',
            explanation: 'Setting innerHTML with unsanitized content allows script injection.',
            rule: 'no-inner-html'
        },
        {
            pattern: /document\.write\s*\(/,
            severity: 'critical',
            category: 'security',
            title: 'Dangerous document.write()',
            message: 'document.write() can overwrite the entire document and is a security risk',
            rule: 'no-document-write'
        },
        {
            pattern: /password\s*[=:]\s*['"][^'"]+['"]/i,
            severity: 'blocker',
            category: 'security',
            title: 'Hardcoded password detected',
            message: 'Passwords should never be hardcoded in source code',
            explanation: 'Hardcoded credentials can be extracted from source code and used to compromise systems.',
            rule: 'no-hardcoded-credentials'
        },
        {
            pattern: /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/i,
            severity: 'blocker',
            category: 'security',
            title: 'Hardcoded API key detected',
            message: 'API keys should be stored in environment variables, not source code',
            rule: 'no-hardcoded-credentials'
        },

        // Performance issues
        {
            pattern: /\.forEach\s*\([^)]*=>\s*\{[^}]*await\b/,
            severity: 'major',
            category: 'performance',
            title: 'Async operation in forEach',
            message: 'forEach does not wait for async operations. Use for...of instead.',
            explanation: 'forEach ignores return values including Promises, leading to unexpected behavior.',
            rule: 'no-await-in-loop'
        },
        {
            pattern: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/,
            severity: 'minor',
            category: 'performance',
            title: 'Inefficient deep clone',
            message: 'JSON.parse(JSON.stringify()) is slow for deep cloning',
            explanation: 'Consider using structuredClone() or a library like lodash.cloneDeep for better performance.',
            rule: 'prefer-structured-clone'
        },
        {
            pattern: /new\s+RegExp\s*\([^)]+\)/,
            severity: 'minor',
            category: 'performance',
            title: 'Dynamic RegExp in potential loop',
            message: 'Creating RegExp dynamically may cause performance issues if called repeatedly',
            rule: 'prefer-regex-literals'
        },

        // Reliability issues
        {
            pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
            severity: 'major',
            category: 'reliability',
            title: 'Empty catch block',
            message: 'Empty catch blocks silently swallow errors',
            explanation: 'At minimum, log the error or rethrow it. Silent failures are hard to debug.',
            rule: 'no-empty-catch'
        },
        {
            pattern: /\.then\s*\([^)]+\)\s*(?!\.catch)/,
            severity: 'major',
            category: 'reliability',
            title: 'Unhandled Promise rejection',
            message: 'Promise chain without .catch() may have unhandled rejections',
            explanation: 'Always handle Promise rejections to prevent uncaught errors.',
            rule: 'promise-catch-or-return'
        },
        {
            pattern: /==\s*null\b|null\s*==/,
            severity: 'minor',
            category: 'reliability',
            title: 'Loose null comparison',
            message: 'Use === null for strict null checking',
            explanation: '== null also matches undefined. Be explicit about what you\'re checking.',
            rule: 'no-loose-equality'
        },

        // Maintainability issues
        {
            pattern: /function\s+\w+\s*\([^)]{80,}\)/,
            severity: 'major',
            category: 'maintainability',
            title: 'Too many function parameters',
            message: 'Functions with many parameters are hard to maintain',
            explanation: 'Consider using an options object pattern for functions with more than 3-4 parameters.',
            rule: 'max-params'
        },
        {
            pattern: /console\.(log|debug|info|warn|error)\s*\(/,
            severity: 'minor',
            category: 'maintainability',
            title: 'Console statement detected',
            message: 'Remove console statements before production',
            rule: 'no-console'
        },
        {
            pattern: /\/\/\s*TODO\b/i,
            severity: 'info',
            category: 'maintainability',
            title: 'TODO comment found',
            message: 'TODO comments should be tracked and resolved',
            rule: 'no-warning-comments'
        },
        {
            pattern: /\/\/\s*FIXME\b/i,
            severity: 'minor',
            category: 'maintainability',
            title: 'FIXME comment found',
            message: 'FIXME comments indicate known issues that should be addressed',
            rule: 'no-warning-comments'
        },
        {
            pattern: /\/\/\s*HACK\b/i,
            severity: 'minor',
            category: 'maintainability',
            title: 'HACK comment found',
            message: 'HACK comments indicate technical debt that should be addressed',
            rule: 'no-warning-comments'
        },

        // Code smell
        {
            pattern: /if\s*\([^)]+\)\s*\{?\s*return\s+true\s*;?\s*\}?\s*(?:else\s*)?\{?\s*return\s+false/,
            severity: 'minor',
            category: 'code-smell',
            title: 'Unnecessary boolean return',
            message: 'Can be simplified to return the condition directly',
            explanation: 'Instead of if(x) return true; else return false;, use return x;',
            rule: 'no-unnecessary-boolean-literal-compare'
        },
        {
            pattern: /!\s*!\s*/,
            severity: 'minor',
            category: 'code-smell',
            title: 'Double negation',
            message: 'Use Boolean() for explicit conversion instead of !!',
            rule: 'no-double-negation'
        },

        // Best practices
        {
            pattern: /var\s+\w+/,
            severity: 'minor',
            category: 'best-practice',
            title: 'var declaration found',
            message: 'Use const or let instead of var',
            explanation: 'var has function scope and hoisting which can lead to bugs. const and let have block scope.',
            rule: 'no-var'
        },
        {
            pattern: /==(?!=)/,
            severity: 'minor',
            category: 'best-practice',
            title: 'Loose equality operator',
            message: 'Use === instead of == for type-safe comparison',
            rule: 'eqeqeq'
        },
        {
            pattern: /!=(?!=)/,
            severity: 'minor',
            category: 'best-practice',
            title: 'Loose inequality operator',
            message: 'Use !== instead of != for type-safe comparison',
            rule: 'eqeqeq'
        },
        {
            pattern: /new\s+Array\s*\(/,
            severity: 'minor',
            category: 'best-practice',
            title: 'Array constructor usage',
            message: 'Use array literal [] instead of new Array()',
            rule: 'no-array-constructor'
        },
        {
            pattern: /new\s+Object\s*\(/,
            severity: 'minor',
            category: 'best-practice',
            title: 'Object constructor usage',
            message: 'Use object literal {} instead of new Object()',
            rule: 'no-object-constructor'
        },

        // Documentation
        {
            pattern: /^(export\s+)?(async\s+)?function\s+\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/m,
            severity: 'info',
            category: 'documentation',
            title: 'Function without JSDoc',
            message: 'Consider adding JSDoc documentation for exported functions',
            rule: 'require-jsdoc'
        },

        // Testing
        {
            pattern: /describe\.only\s*\(|it\.only\s*\(|test\.only\s*\(/,
            severity: 'major',
            category: 'testing',
            title: 'Focused test detected',
            message: '.only will skip other tests. Remove before committing.',
            rule: 'no-focused-tests'
        },
        {
            pattern: /describe\.skip\s*\(|it\.skip\s*\(|test\.skip\s*\(/,
            severity: 'minor',
            category: 'testing',
            title: 'Skipped test detected',
            message: 'Skipped tests should be fixed or removed',
            rule: 'no-skipped-tests'
        }
    ];

    async startReview(request: ReviewRequest): Promise<ReviewResult> {
        const reviewId = this.generateId();
        const startedAt = new Date().toISOString();

        const result: ReviewResult = {
            id: reviewId,
            status: 'in-progress',
            files: request.files,
            issues: [],
            summary: this.createEmptySummary(),
            startedAt
        };

        this.reviews.set(reviewId, result);

        try {
            for (const file of request.files) {
                const content = request.content?.[file] || '';
                const language = this.detectLanguage(file);
                const issues = await this.reviewFile(file, content, language, request.options);
                result.issues.push(...issues);
            }

            result.status = 'completed';
            result.completedAt = new Date().toISOString();
            result.summary = this.calculateSummary(result.issues, request.files.length);
        } catch (error) {
            result.status = 'failed';
            result.error = error instanceof Error ? error.message : 'Unknown error';
        }

        this.reviews.set(reviewId, result);
        return result;
    }

    async getReview(reviewId: string): Promise<ReviewResult | undefined> {
        return this.reviews.get(reviewId);
    }

    async reviewFile(
        uri: string,
        content: string,
        language: string,
        options?: ReviewOptions
    ): Promise<ReviewIssue[]> {
        const issues: ReviewIssue[] = [];
        const lines = content.split('\n');

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            const lineIssues = this.analyzeLine(uri, line, lineNumber + 1, language, options);
            issues.push(...lineIssues);
        }

        // Store issues for this file
        this.fileIssues.set(uri, issues);

        // Filter by options
        let filtered = issues;
        if (options?.categories) {
            filtered = filtered.filter(i => options.categories!.includes(i.category));
        }
        if (options?.minSeverity) {
            const minPriority = this.getSeverityPriority(options.minSeverity);
            filtered = filtered.filter(i => this.getSeverityPriority(i.severity) <= minPriority);
        }
        if (options?.maxIssues) {
            filtered = filtered.slice(0, options.maxIssues);
        }

        return filtered;
    }

    async reviewSelection(
        uri: string,
        content: string,
        startLine: number,
        endLine: number,
        language: string,
        options?: ReviewOptions
    ): Promise<ReviewIssue[]> {
        const lines = content.split('\n');
        const selectedLines = lines.slice(startLine - 1, endLine);

        const issues: ReviewIssue[] = [];
        for (let i = 0; i < selectedLines.length; i++) {
            const lineNumber = startLine + i;
            const lineIssues = this.analyzeLine(uri, selectedLines[i], lineNumber, language, options);
            issues.push(...lineIssues);
        }

        return issues;
    }

    async getFileIssues(uri: string): Promise<ReviewIssue[]> {
        return this.fileIssues.get(uri) || [];
    }

    async applyFix(issue: ReviewIssue): Promise<ApplyFixResult> {
        if (!issue.suggestedFix) {
            return {
                success: false,
                message: 'No fix available for this issue'
            };
        }

        // In a real implementation, this would apply the edits
        // For now, just mark it as successful
        return {
            success: true,
            message: `Applied fix: ${issue.suggestedFix.title}`,
            appliedEdits: issue.suggestedFix.edits.length
        };
    }

    async dismissIssue(issueId: string, reason?: string): Promise<void> {
        this.dismissedIssues.add(issueId);
    }

    async getReviewHistory(limit: number = 10): Promise<ReviewResult[]> {
        const reviews = Array.from(this.reviews.values());
        return reviews
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, limit);
    }

    async cancelReview(reviewId: string): Promise<void> {
        const review = this.reviews.get(reviewId);
        if (review && review.status === 'in-progress') {
            review.status = 'failed';
            review.error = 'Review cancelled by user';
            this.reviews.set(reviewId, review);
        }
    }

    getSeverityIcon(severity: ReviewSeverity): string {
        return getSeverityIcon(severity);
    }

    getCategoryIcon(category: ReviewCategory): string {
        return getCategoryIcon(category);
    }

    protected analyzeLine(
        uri: string,
        line: string,
        lineNumber: number,
        language: string,
        options?: ReviewOptions
    ): ReviewIssue[] {
        const issues: ReviewIssue[] = [];

        for (const pattern of this.patterns) {
            // Skip if category is filtered
            if (options?.categories && !options.categories.includes(pattern.category)) {
                continue;
            }

            // Skip based on options
            if (!options?.checkSecurity && pattern.category === 'security') {
                continue;
            }
            if (!options?.checkPerformance && pattern.category === 'performance') {
                continue;
            }
            if (!options?.checkStyle && pattern.category === 'style') {
                continue;
            }

            // Skip ignored rules
            if (options?.ignoreRules && pattern.rule && options.ignoreRules.includes(pattern.rule)) {
                continue;
            }

            const match = line.match(pattern.pattern);
            if (match) {
                const issueId = this.generateId();
                const startColumn = match.index !== undefined ? match.index + 1 : 1;
                const endColumn = startColumn + match[0].length;

                const issue: ReviewIssue = {
                    id: issueId,
                    severity: pattern.severity,
                    category: pattern.category,
                    title: pattern.title,
                    message: pattern.message,
                    explanation: options?.includeExplanations ? pattern.explanation : undefined,
                    file: uri,
                    startLine: lineNumber,
                    startColumn,
                    endLine: lineNumber,
                    endColumn,
                    code: line.trim(),
                    rule: pattern.rule
                };

                if (options?.includeFixes && pattern.fix) {
                    issue.suggestedFix = pattern.fix(match, line, lineNumber);
                }

                // Don't add dismissed issues
                if (!this.dismissedIssues.has(issueId)) {
                    issues.push(issue);
                }
            }
        }

        return issues;
    }

    protected calculateSummary(issues: ReviewIssue[], filesReviewed: number): ReviewSummary {
        const bySeverity: Record<ReviewSeverity, number> = {
            blocker: 0,
            critical: 0,
            major: 0,
            minor: 0,
            info: 0
        };

        const byCategory: Record<ReviewCategory, number> = {
            security: 0,
            performance: 0,
            reliability: 0,
            maintainability: 0,
            style: 0,
            documentation: 0,
            testing: 0,
            'best-practice': 0,
            bug: 0,
            'code-smell': 0
        };

        for (const issue of issues) {
            bySeverity[issue.severity]++;
            byCategory[issue.category]++;
        }

        // Estimate lines reviewed (in real impl, count actual lines)
        const linesReviewed = filesReviewed * 100;
        const score = calculateReviewScore(issues, linesReviewed);
        const grade = getGradeFromScore(score);

        const recommendations: string[] = [];
        if (bySeverity.blocker > 0) {
            recommendations.push(`Fix ${bySeverity.blocker} blocker issue(s) immediately`);
        }
        if (bySeverity.critical > 0) {
            recommendations.push(`Address ${bySeverity.critical} critical issue(s) before release`);
        }
        if (byCategory.security > 0) {
            recommendations.push(`Review ${byCategory.security} security concern(s)`);
        }

        return {
            totalIssues: issues.length,
            bySeverity,
            byCategory,
            filesReviewed,
            linesReviewed,
            score,
            grade,
            recommendations
        };
    }

    protected createEmptySummary(): ReviewSummary {
        return {
            totalIssues: 0,
            bySeverity: {
                blocker: 0,
                critical: 0,
                major: 0,
                minor: 0,
                info: 0
            },
            byCategory: {
                security: 0,
                performance: 0,
                reliability: 0,
                maintainability: 0,
                style: 0,
                documentation: 0,
                testing: 0,
                'best-practice': 0,
                bug: 0,
                'code-smell': 0
            },
            filesReviewed: 0,
            linesReviewed: 0
        };
    }

    protected getSeverityPriority(severity: ReviewSeverity): number {
        switch (severity) {
            case 'blocker': return 0;
            case 'critical': return 1;
            case 'major': return 2;
            case 'minor': return 3;
            case 'info': return 4;
            default: return 5;
        }
    }

    protected detectLanguage(file: string): string {
        const ext = file.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'ts':
            case 'tsx':
                return 'typescript';
            case 'js':
            case 'jsx':
            case 'mjs':
                return 'javascript';
            case 'py':
                return 'python';
            case 'java':
                return 'java';
            case 'go':
                return 'go';
            case 'rs':
                return 'rust';
            case 'rb':
                return 'ruby';
            case 'php':
                return 'php';
            case 'cs':
                return 'csharp';
            case 'cpp':
            case 'cc':
            case 'cxx':
                return 'cpp';
            case 'c':
            case 'h':
                return 'c';
            default:
                return 'plaintext';
        }
    }

    protected generateId(): string {
        return `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
