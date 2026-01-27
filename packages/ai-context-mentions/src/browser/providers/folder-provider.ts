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
import { Path, URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
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

@injectable()
export class FolderContextProvider implements EnhancedContextProvider {
    readonly id = 'context.folder';
    readonly name = 'folder';
    readonly label = 'Folder Contents';
    readonly description = 'List files and contents of a directory';
    readonly category = ContextProviderCategory.File;
    readonly iconClass = 'codicon codicon-folder-opened';
    readonly acceptsArguments = true;
    readonly argumentDescription = 'Folder path relative to workspace root';
    readonly examples = ['@folder:src', '@folder:src/components', '@folder:tests'];

    protected readonly defaultExcludes = ['node_modules', '.git', 'dist', '__pycache__'];
    protected readonly maxFilesToInclude = 20;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    async canResolve(arg?: string): Promise<boolean> {
        if (!arg) {
            return false;
        }

        const uri = await this.resolveUri(arg);
        if (!uri) {
            return false;
        }

        try {
            const stat = await this.fileService.resolve(uri);
            return stat.isDirectory;
        } catch {
            return false;
        }
    }

    async resolve(arg?: string, options?: ContextResolutionOptions): Promise<ResolvedContextMention | undefined> {
        if (!arg) {
            return undefined;
        }

        const uri = await this.resolveUri(arg);
        if (!uri) {
            return undefined;
        }

        try {
            const stat = await this.fileService.resolve(uri);
            if (!stat.isDirectory || !stat.children) {
                return undefined;
            }

            const sections: string[] = [];
            const folderName = uri.path.base || arg;

            sections.push(`# Folder: ${folderName}`);
            sections.push(`Path: \`${arg}\`\n`);

            // List files and directories
            const files: { name: string; size?: number; isDir: boolean }[] = [];
            const excludes = options?.excludePatterns ?? this.defaultExcludes;

            for (const child of stat.children) {
                const name = child.resource.path.base;
                if (excludes.includes(name) || name.startsWith('.')) {
                    continue;
                }

                files.push({
                    name,
                    size: child.isFile ? child.size : undefined,
                    isDir: child.isDirectory
                });
            }

            // Sort: directories first, then alphabetically
            files.sort((a, b) => {
                if (a.isDir && !b.isDir) {
                    return -1;
                }
                if (!a.isDir && b.isDir) {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });

            // Format file list
            sections.push('## Contents\n');
            sections.push('```');
            for (const file of files) {
                const icon = file.isDir ? '📁' : '📄';
                const size = file.size !== undefined ? ` (${ContextMentionUtils.formatBytes(file.size)})` : '';
                sections.push(`${icon} ${file.name}${file.isDir ? '/' : ''}${size}`);
            }
            sections.push('```');

            // Include content of small text files if requested
            if (options?.includeMetadata !== false) {
                const textFiles = files.filter(f =>
                    !f.isDir &&
                    f.size !== undefined &&
                    f.size < 10000 &&
                    this.isTextFile(f.name)
                ).slice(0, this.maxFilesToInclude);

                if (textFiles.length > 0) {
                    sections.push('\n## File Contents\n');

                    for (const file of textFiles) {
                        const fileUri = uri.resolve(file.name);
                        try {
                            const content = await this.fileService.readFile(fileUri);
                            const text = content.value.toString();
                            const lang = this.getLanguageId(file.name);

                            sections.push(`### ${file.name}\n`);
                            sections.push('```' + lang);
                            sections.push(text);
                            sections.push('```\n');
                        } catch {
                            // Skip files that can't be read
                        }
                    }
                }
            }

            const content = sections.join('\n');

            return {
                providerId: this.id,
                label: `Folder: ${folderName}`,
                content,
                contentType: ContextContentType.Markdown,
                contentSize: content.length,
                tokenEstimate: ContextMentionUtils.estimateTokens(content),
                sourceUri: uri.toString(),
                metadata: {
                    fileCount: files.filter(f => !f.isDir).length,
                    dirCount: files.filter(f => f.isDir).length
                }
            };
        } catch {
            return undefined;
        }
    }

    async getSuggestions(partial: string): Promise<ContextMentionSuggestion[]> {
        const suggestions: ContextMentionSuggestion[] = [];
        const roots = this.workspaceService.tryGetRoots();

        if (roots.length === 0) {
            return suggestions;
        }

        // Parse the partial path
        const pathParts = partial.split('/');
        const searchIn = pathParts.slice(0, -1).join('/');
        const searchFor = pathParts[pathParts.length - 1] || '';

        for (const root of roots) {
            const baseUri = searchIn ? root.resource.resolve(searchIn) : root.resource;

            try {
                const stat = await this.fileService.resolve(baseUri);
                if (!stat.isDirectory || !stat.children) {
                    continue;
                }

                for (const child of stat.children) {
                    if (!child.isDirectory) {
                        continue;
                    }

                    const name = child.resource.path.base;
                    if (this.defaultExcludes.includes(name) || name.startsWith('.')) {
                        continue;
                    }

                    const nameLower = name.toLowerCase();
                    const searchLower = searchFor.toLowerCase();

                    if (searchFor === '' || nameLower.startsWith(searchLower) || nameLower.includes(searchLower)) {
                        const fullPath = searchIn ? `${searchIn}/${name}` : name;
                        suggestions.push({
                            id: `folder-${fullPath}`,
                            providerId: this.id,
                            label: name,
                            description: fullPath,
                            iconClass: 'codicon codicon-folder',
                            insertText: fullPath,
                            sortPriority: nameLower.startsWith(searchLower) ? 100 : 50
                        });
                    }
                }
            } catch {
                // Skip on error
            }
        }

        return suggestions.sort((a, b) => b.sortPriority - a.sortPriority);
    }

    protected async resolveUri(path: string): Promise<URI | undefined> {
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return undefined;
        }

        const normalizedPath = new Path(Path.normalizePathSeparator(path));

        for (const root of roots) {
            const uri = root.resource.resolve(normalizedPath);
            try {
                const exists = await this.fileService.exists(uri);
                if (exists) {
                    return uri;
                }
            } catch {
                // Continue to next root
            }
        }

        return undefined;
    }

    protected isTextFile(filename: string): boolean {
        const textExtensions = [
            '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yaml', '.yml',
            '.html', '.css', '.scss', '.less', '.xml', '.svg', '.py', '.rb', '.go',
            '.java', '.kt', '.swift', '.rs', '.c', '.cpp', '.h', '.hpp', '.sh',
            '.bash', '.zsh', '.fish', '.toml', '.ini', '.cfg', '.conf', '.env',
            '.gitignore', '.editorconfig', 'Dockerfile', 'Makefile'
        ];

        const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
        return textExtensions.includes(ext.toLowerCase()) || textExtensions.includes(filename);
    }

    protected getLanguageId(filename: string): string {
        const extMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescriptreact',
            '.js': 'javascript',
            '.jsx': 'javascriptreact',
            '.json': 'json',
            '.md': 'markdown',
            '.py': 'python',
            '.rb': 'ruby',
            '.go': 'go',
            '.java': 'java',
            '.rs': 'rust',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.sh': 'bash',
            '.bash': 'bash'
        };

        const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
        return extMap[ext.toLowerCase()] || '';
    }
}
