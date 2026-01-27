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
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { URI } from '@theia/core';
import {
    EnhancedContextProvider,
    ContextProviderCategory,
    ContextContentType,
    ContextResolutionOptions,
    ResolvedContextMention,
    ContextMentionUtils
} from '../../common';

interface FileTreeNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: FileTreeNode[];
    size?: number;
}

@injectable()
export class CodebaseContextProvider implements EnhancedContextProvider {
    readonly id = 'context.codebase';
    readonly name = 'codebase';
    readonly label = 'Codebase Overview';
    readonly description = 'Project structure and file tree overview';
    readonly category = ContextProviderCategory.File;
    readonly iconClass = 'codicon codicon-folder-library';
    readonly acceptsArguments = true;
    readonly argumentDescription = 'Optional: depth limit (default: 3) or "full" for complete tree';
    readonly examples = ['@codebase', '@codebase:2', '@codebase:full'];

    protected readonly defaultExcludes = [
        'node_modules', '.git', 'dist', 'build', 'out', 'target',
        '.next', '.nuxt', 'coverage', '__pycache__', '.cache',
        'vendor', 'bower_components', '.idea', '.vscode'
    ];

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    async canResolve(_arg?: string): Promise<boolean> {
        const roots = this.workspaceService.tryGetRoots();
        return roots.length > 0;
    }

    async resolve(arg?: string, options?: ContextResolutionOptions): Promise<ResolvedContextMention | undefined> {
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return undefined;
        }

        // Parse depth from argument
        let maxDepth = options?.maxDepth ?? 3;
        if (arg === 'full') {
            maxDepth = 10;
        } else if (arg && !isNaN(parseInt(arg, 10))) {
            maxDepth = parseInt(arg, 10);
        }

        const excludePatterns = options?.excludePatterns ?? this.defaultExcludes;
        const trees: string[] = [];

        for (const root of roots) {
            const tree = await this.buildFileTree(root.resource, maxDepth, excludePatterns);
            const treeString = this.formatFileTree(tree, root.name);
            trees.push(treeString);
        }

        const content = trees.join('\n\n');

        // Add summary
        const summary = this.generateSummary(trees.join('\n'));
        const fullContent = `# Codebase Structure\n\n${summary}\n\n## File Tree\n\n\`\`\`\n${content}\n\`\`\``;

        return {
            providerId: this.id,
            label: `Codebase (depth: ${maxDepth})`,
            content: fullContent,
            contentType: ContextContentType.Markdown,
            contentSize: fullContent.length,
            tokenEstimate: ContextMentionUtils.estimateTokens(fullContent),
            metadata: {
                depth: maxDepth,
                rootCount: roots.length
            }
        };
    }

    protected async buildFileTree(
        uri: URI,
        maxDepth: number,
        excludes: string[],
        currentDepth: number = 0
    ): Promise<FileTreeNode> {
        const stat = await this.fileService.resolve(uri);
        const name = uri.path.base || uri.path.toString();

        const node: FileTreeNode = {
            name,
            path: uri.path.toString(),
            isDirectory: stat.isDirectory
        };

        if (!stat.isDirectory) {
            node.size = stat.size;
            return node;
        }

        if (currentDepth >= maxDepth) {
            node.children = [{ name: '...', path: '', isDirectory: false }];
            return node;
        }

        if (stat.children) {
            const children: FileTreeNode[] = [];

            for (const child of stat.children) {
                const childName = child.resource.path.base;

                // Skip excluded directories
                if (excludes.includes(childName)) {
                    continue;
                }

                // Skip hidden files (optional)
                if (childName.startsWith('.') && childName !== '.env.example') {
                    continue;
                }

                const childNode = await this.buildFileTree(
                    child.resource,
                    maxDepth,
                    excludes,
                    currentDepth + 1
                );
                children.push(childNode);
            }

            // Sort: directories first, then alphabetically
            children.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) {
                    return -1;
                }
                if (!a.isDirectory && b.isDirectory) {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });

            node.children = children;
        }

        return node;
    }

    protected formatFileTree(node: FileTreeNode, rootName?: string, prefix: string = '', isLast: boolean = true): string {
        const lines: string[] = [];
        const displayName = rootName || node.name;

        if (prefix === '') {
            // Root node
            lines.push(displayName + '/');
        } else {
            const connector = isLast ? '└── ' : '├── ';
            const suffix = node.isDirectory ? '/' : '';
            lines.push(prefix + connector + node.name + suffix);
        }

        if (node.children) {
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            node.children.forEach((child, index) => {
                const childIsLast = index === node.children!.length - 1;
                lines.push(this.formatFileTree(child, undefined, childPrefix, childIsLast));
            });
        }

        return lines.join('\n');
    }

    protected generateSummary(treeContent: string): string {
        const lines = treeContent.split('\n');
        let fileCount = 0;
        let dirCount = 0;

        for (const line of lines) {
            if (line.endsWith('/')) {
                dirCount++;
            } else if (line.includes('──') && !line.includes('...')) {
                fileCount++;
            }
        }

        const languageStats = this.detectLanguages(treeContent);
        let summary = `**${dirCount} directories, ${fileCount} files**\n\n`;

        if (languageStats.length > 0) {
            summary += '**Languages detected:** ' + languageStats.slice(0, 5).join(', ');
        }

        return summary;
    }

    protected detectLanguages(treeContent: string): string[] {
        const extensionMap: Record<string, string> = {
            '.ts': 'TypeScript',
            '.tsx': 'TypeScript/React',
            '.js': 'JavaScript',
            '.jsx': 'JavaScript/React',
            '.py': 'Python',
            '.java': 'Java',
            '.go': 'Go',
            '.rs': 'Rust',
            '.rb': 'Ruby',
            '.php': 'PHP',
            '.cs': 'C#',
            '.cpp': 'C++',
            '.c': 'C',
            '.swift': 'Swift',
            '.kt': 'Kotlin',
            '.vue': 'Vue',
            '.svelte': 'Svelte'
        };

        const detected = new Set<string>();

        for (const [ext, lang] of Object.entries(extensionMap)) {
            if (treeContent.includes(ext)) {
                detected.add(lang);
            }
        }

        return Array.from(detected);
    }
}
