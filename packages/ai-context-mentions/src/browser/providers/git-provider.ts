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
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import {
    EnhancedContextProvider,
    ContextProviderCategory,
    ContextContentType,
    ContextResolutionOptions,
    ResolvedContextMention,
    ContextMentionSuggestion,
    ContextMentionUtils
} from '../../common';

type GitInfoType = 'status' | 'diff' | 'staged' | 'log' | 'branch' | 'all';

@injectable()
export class GitContextProvider implements EnhancedContextProvider {
    readonly id = 'context.git';
    readonly name = 'git';
    readonly label = 'Git Status';
    readonly description = 'Git repository status, changes, and history';
    readonly category = ContextProviderCategory.Git;
    readonly iconClass = 'codicon codicon-git-merge';
    readonly acceptsArguments = true;
    readonly argumentDescription = 'Type: status, diff, staged, log, branch, or all (default: status)';
    readonly examples = ['@git', '@git:status', '@git:diff', '@git:staged', '@git:log'];

    @inject(ScmService)
    protected readonly scmService: ScmService;

    async canResolve(_arg?: string): Promise<boolean> {
        const repos = this.scmService.repositories;
        return repos.length > 0;
    }

    async resolve(arg?: string, _options?: ContextResolutionOptions): Promise<ResolvedContextMention | undefined> {
        const repos = this.scmService.repositories;
        if (repos.length === 0) {
            return undefined;
        }

        const infoType: GitInfoType = this.parseInfoType(arg);
        const results: string[] = [];

        for (const repo of repos) {
            const repoInfo = await this.getRepoInfo(repo, infoType);
            if (repoInfo) {
                results.push(repoInfo);
            }
        }

        if (results.length === 0) {
            return {
                providerId: this.id,
                label: 'Git Status',
                content: '# Git Status\n\nNo changes detected in the repository.',
                contentType: ContextContentType.Markdown,
                contentSize: 50,
                tokenEstimate: 15
            };
        }

        const content = `# Git Information (${infoType})\n\n${results.join('\n\n---\n\n')}`;

        return {
            providerId: this.id,
            label: `Git (${infoType})`,
            content,
            contentType: ContextContentType.Markdown,
            contentSize: content.length,
            tokenEstimate: ContextMentionUtils.estimateTokens(content),
            metadata: {
                infoType,
                repoCount: repos.length
            }
        };
    }

    async getSuggestions(partial: string): Promise<ContextMentionSuggestion[]> {
        const options: GitInfoType[] = ['status', 'diff', 'staged', 'log', 'branch', 'all'];
        const partialLower = partial.toLowerCase();

        return options
            .filter(opt => opt.startsWith(partialLower) || partialLower === '')
            .map((opt, index) => ({
                id: `git-${opt}`,
                providerId: this.id,
                label: opt,
                description: this.getOptionDescription(opt),
                insertText: opt,
                sortPriority: 100 - index
            }));
    }

    protected parseInfoType(arg?: string): GitInfoType {
        const validTypes: GitInfoType[] = ['status', 'diff', 'staged', 'log', 'branch', 'all'];
        if (arg && validTypes.includes(arg as GitInfoType)) {
            return arg as GitInfoType;
        }
        return 'status';
    }

    protected getOptionDescription(type: GitInfoType): string {
        const descriptions: Record<GitInfoType, string> = {
            status: 'Show modified, staged, and untracked files',
            diff: 'Show unstaged changes (diff)',
            staged: 'Show staged changes ready to commit',
            log: 'Show recent commit history',
            branch: 'Show current branch and recent branches',
            all: 'Show comprehensive git status'
        };
        return descriptions[type];
    }

    protected async getRepoInfo(repo: ScmRepository, infoType: GitInfoType): Promise<string | undefined> {
        const sections: string[] = [];
        const rootUri = repo.provider.rootUri;
        const repoName = rootUri ? rootUri.split('/').pop() : 'Repository';

        sections.push(`## ${repoName}`);

        // Get resources from the SCM provider
        const groups = repo.provider.groups;
        const allResources: Array<{ label: string; path: string; status: string }> = [];

        for (const group of groups) {
            for (const resource of group.resources) {
                allResources.push({
                    label: group.label,
                    path: resource.sourceUri.path.toString(),
                    status: this.getStatusLabel(resource.decorations?.letter || '?')
                });
            }
        }

        if (infoType === 'status' || infoType === 'all') {
            sections.push(this.formatStatus(allResources));
        }

        if (infoType === 'staged' || infoType === 'all') {
            const staged = allResources.filter(r => r.label.toLowerCase().includes('staged') || r.label.toLowerCase().includes('index'));
            if (staged.length > 0) {
                sections.push('### Staged Changes\n');
                sections.push(staged.map(r => `- ${r.status} ${r.path}`).join('\n'));
            }
        }

        if (infoType === 'diff' || infoType === 'all') {
            const modified = allResources.filter(r => r.label.toLowerCase().includes('changes') || r.label.toLowerCase().includes('modified'));
            if (modified.length > 0) {
                sections.push('### Unstaged Changes\n');
                sections.push(modified.map(r => `- ${r.status} ${r.path}`).join('\n'));
            }
        }

        if (infoType === 'branch' || infoType === 'all') {
            // SCM doesn't directly expose branch info, but we can show the input value
            const input = repo.input;
            if (input.value) {
                sections.push(`### Commit Message Draft\n\`\`\`\n${input.value}\n\`\`\``);
            }
        }

        if (sections.length <= 1) {
            sections.push('No changes detected.');
        }

        return sections.join('\n\n');
    }

    protected formatStatus(resources: Array<{ label: string; path: string; status: string }>): string {
        if (resources.length === 0) {
            return '### Status\n\nWorking tree clean.';
        }

        const byGroup = new Map<string, typeof resources>();
        for (const resource of resources) {
            if (!byGroup.has(resource.label)) {
                byGroup.set(resource.label, []);
            }
            byGroup.get(resource.label)!.push(resource);
        }

        const lines: string[] = ['### Status\n'];
        for (const [group, items] of byGroup) {
            lines.push(`**${group}:**`);
            for (const item of items) {
                lines.push(`- ${item.status} \`${item.path}\``);
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    protected getStatusLabel(letter: string): string {
        const labels: Record<string, string> = {
            'M': '[Modified]',
            'A': '[Added]',
            'D': '[Deleted]',
            'R': '[Renamed]',
            'C': '[Copied]',
            'U': '[Untracked]',
            '?': '[Untracked]',
            '!': '[Ignored]'
        };
        return labels[letter] || `[${letter}]`;
    }
}
