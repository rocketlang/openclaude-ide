// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import {
    ToolRequest,
    ToolCallResult
} from '@theia/ai-core/lib/common/language-model';
import { CodeChange, SubAgentInstance } from '../common/swarm-protocol';
import { getDefaultRoleConfig } from '../common/swarm-configuration';

export const SwarmToolProvider = Symbol('SwarmToolProvider');

export interface SwarmToolProvider {
    getToolsForAgent(agent: SubAgentInstance, onCodeChange: (change: CodeChange) => void): ToolRequest[];
}

export interface ToolContext {
    workspaceRoot: string;
    onCodeChange: (change: CodeChange) => void;
}

@injectable()
export class SwarmToolProviderImpl implements SwarmToolProvider {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileService) @optional()
    protected readonly fileService: FileService | undefined;

    @inject(WorkspaceService) @optional()
    protected readonly workspaceService: WorkspaceService | undefined;

    getToolsForAgent(agent: SubAgentInstance, onCodeChange: (change: CodeChange) => void): ToolRequest[] {
        const roleConfig = getDefaultRoleConfig(agent.role);
        const allowedTools = roleConfig.allowedTools || ['read', 'glob', 'grep'];
        const tools: ToolRequest[] = [];

        const context: ToolContext = {
            workspaceRoot: this.getWorkspaceRoot(),
            onCodeChange
        };

        if (allowedTools.includes('read')) {
            tools.push(this.createReadFileTool(context));
        }

        if (allowedTools.includes('write')) {
            tools.push(this.createWriteFileTool(context));
        }

        if (allowedTools.includes('edit')) {
            tools.push(this.createEditFileTool(context));
        }

        if (allowedTools.includes('glob')) {
            tools.push(this.createGlobTool(context));
        }

        if (allowedTools.includes('grep')) {
            tools.push(this.createGrepTool(context));
        }

        if (allowedTools.includes('bash')) {
            tools.push(this.createBashTool(context));
        }

        // Always include task completion tool
        tools.push(this.createTaskCompleteTool());

        return tools;
    }

    private getWorkspaceRoot(): string {
        if (this.workspaceService) {
            const roots = this.workspaceService.tryGetRoots();
            if (roots.length > 0) {
                return roots[0].resource.path.toString();
            }
        }
        return process.cwd();
    }

    private resolvePath(path: string, context: ToolContext): string {
        if (path.startsWith('/')) {
            return path;
        }
        return `${context.workspaceRoot}/${path}`;
    }

    private createReadFileTool(context: ToolContext): ToolRequest {
        return {
            id: 'read_file',
            name: 'read_file',
            description: 'Read the contents of a file. Returns the file content as text.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The file path to read (relative to workspace or absolute)'
                    },
                    startLine: {
                        type: 'number',
                        description: 'Optional: Start reading from this line number (1-based)'
                    },
                    endLine: {
                        type: 'number',
                        description: 'Optional: Stop reading at this line number (inclusive)'
                    }
                },
                required: ['path']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                try {
                    const args = JSON.parse(argsStr);
                    const fullPath = this.resolvePath(args.path, context);

                    if (this.fileService) {
                        const uri = new URI(`file://${fullPath}`);
                        const content = await this.fileService.read(uri);
                        let text = content.value;

                        // Apply line filtering if specified
                        if (args.startLine || args.endLine) {
                            const lines = text.split('\n');
                            const start = (args.startLine || 1) - 1;
                            const end = args.endLine || lines.length;
                            text = lines.slice(start, end).join('\n');
                        }

                        return {
                            content: [{
                                type: 'text',
                                text: text
                            }]
                        };
                    } else {
                        // Fallback to Node.js fs
                        const fs = await import('fs/promises');
                        let text = await fs.readFile(fullPath, 'utf-8');

                        if (args.startLine || args.endLine) {
                            const lines = text.split('\n');
                            const start = (args.startLine || 1) - 1;
                            const end = args.endLine || lines.length;
                            text = lines.slice(start, end).join('\n');
                        }

                        return {
                            content: [{
                                type: 'text',
                                text: text
                            }]
                        };
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    return {
                        content: [{
                            type: 'error',
                            data: `Failed to read file: ${msg}`
                        }]
                    };
                }
            }
        };
    }

    private createWriteFileTool(context: ToolContext): ToolRequest {
        return {
            id: 'write_file',
            name: 'write_file',
            description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The file path to write (relative to workspace or absolute)'
                    },
                    content: {
                        type: 'string',
                        description: 'The content to write to the file'
                    }
                },
                required: ['path', 'content']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                try {
                    const args = JSON.parse(argsStr);
                    const fullPath = this.resolvePath(args.path, context);

                    // Check if file exists to determine change type
                    let changeType: 'create' | 'modify' = 'create';
                    try {
                        const fs = await import('fs/promises');
                        await fs.access(fullPath);
                        changeType = 'modify';
                    } catch {
                        changeType = 'create';
                    }

                    // Use Node.js fs for backend file operations
                    const fs = await import('fs/promises');
                    const path = await import('path');
                    // Ensure directory exists
                    await fs.mkdir(path.dirname(fullPath), { recursive: true });
                    await fs.writeFile(fullPath, args.content, 'utf-8');

                    // Track the code change
                    context.onCodeChange({
                        filePath: args.path,
                        changeType,
                        newContent: args.content,
                        diff: changeType === 'create'
                            ? `+++ ${args.path}\n${args.content.substring(0, 1000)}${args.content.length > 1000 ? '...' : ''}`
                            : `Modified: ${args.path}`
                    });

                    return {
                        content: [{
                            type: 'text',
                            text: `Successfully wrote ${args.content.length} bytes to ${args.path}`
                        }]
                    };
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    return {
                        content: [{
                            type: 'error',
                            data: `Failed to write file: ${msg}`
                        }]
                    };
                }
            }
        };
    }

    private createEditFileTool(context: ToolContext): ToolRequest {
        return {
            id: 'edit_file',
            name: 'edit_file',
            description: 'Edit a file by finding and replacing text. The old_text must match exactly.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The file path to edit'
                    },
                    old_text: {
                        type: 'string',
                        description: 'The exact text to find and replace'
                    },
                    new_text: {
                        type: 'string',
                        description: 'The text to replace it with'
                    }
                },
                required: ['path', 'old_text', 'new_text']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                try {
                    const args = JSON.parse(argsStr);
                    const fullPath = this.resolvePath(args.path, context);

                    // Read existing content
                    const fs = await import('fs/promises');
                    const content = await fs.readFile(fullPath, 'utf-8');

                    // Check if old_text exists
                    if (!content.includes(args.old_text)) {
                        return {
                            content: [{
                                type: 'error',
                                data: `Could not find the specified text in ${args.path}. Make sure old_text matches exactly.`
                            }]
                        };
                    }

                    // Replace text
                    const newContent = content.replace(args.old_text, args.new_text);

                    // Write back
                    await fs.writeFile(fullPath, newContent, 'utf-8');

                    // Track the code change
                    context.onCodeChange({
                        filePath: args.path,
                        changeType: 'modify',
                        diff: `--- ${args.path}\n+++ ${args.path}\n@@ edit @@\n-${args.old_text.substring(0, 200)}\n+${args.new_text.substring(0, 200)}`
                    });

                    return {
                        content: [{
                            type: 'text',
                            text: `Successfully edited ${args.path}`
                        }]
                    };
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    return {
                        content: [{
                            type: 'error',
                            data: `Failed to edit file: ${msg}`
                        }]
                    };
                }
            }
        };
    }

    private createGlobTool(context: ToolContext): ToolRequest {
        return {
            id: 'glob',
            name: 'glob',
            description: 'Find files matching a glob pattern. Returns a list of matching file paths.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'Glob pattern to match (e.g., "**/*.ts", "src/**/*.js")'
                    },
                    path: {
                        type: 'string',
                        description: 'Optional: Base directory to search in (defaults to workspace root)'
                    }
                },
                required: ['pattern']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                try {
                    const args = JSON.parse(argsStr);
                    const basePath = args.path ? this.resolvePath(args.path, context) : context.workspaceRoot;

                    // Use fast-glob for pattern matching
                    const fg = await import('fast-glob');
                    const files = await fg.glob(args.pattern, {
                        cwd: basePath,
                        onlyFiles: true,
                        ignore: ['**/node_modules/**', '**/.git/**'],
                        followSymbolicLinks: false
                    });

                    if (files.length === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: `No files found matching pattern: ${args.pattern}`
                            }]
                        };
                    }

                    // Limit results to prevent overwhelming output
                    const maxResults = 100;
                    const truncated = files.length > maxResults;
                    const resultFiles = files.slice(0, maxResults);

                    return {
                        content: [{
                            type: 'text',
                            text: `Found ${files.length} files${truncated ? ` (showing first ${maxResults})` : ''}:\n${resultFiles.join('\n')}`
                        }]
                    };
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    return {
                        content: [{
                            type: 'error',
                            data: `Glob failed: ${msg}`
                        }]
                    };
                }
            }
        };
    }

    private createGrepTool(context: ToolContext): ToolRequest {
        return {
            id: 'grep',
            name: 'grep',
            description: 'Search for text patterns in files. Returns matching lines with file paths and line numbers.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'Regular expression pattern to search for'
                    },
                    path: {
                        type: 'string',
                        description: 'Optional: Directory or file to search in (defaults to workspace root)'
                    },
                    file_pattern: {
                        type: 'string',
                        description: 'Optional: Glob pattern to filter files (e.g., "*.ts")'
                    },
                    case_insensitive: {
                        type: 'boolean',
                        description: 'Optional: Case insensitive search (default: false)'
                    }
                },
                required: ['pattern']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                try {
                    const args = JSON.parse(argsStr);
                    const basePath = args.path ? this.resolvePath(args.path, context) : context.workspaceRoot;
                    const filePattern = args.file_pattern || '**/*';

                    // Get files to search
                    const fg = await import('fast-glob');
                    const files = await fg.glob(filePattern, {
                        cwd: basePath,
                        onlyFiles: true,
                        ignore: ['**/node_modules/**', '**/.git/**', '**/*.min.js'],
                        followSymbolicLinks: false
                    });

                    const regex = new RegExp(args.pattern, args.case_insensitive ? 'gi' : 'g');
                    const fs = await import('fs/promises');
                    const path = await import('path');

                    const results: string[] = [];
                    const maxMatches = 50;
                    let totalMatches = 0;

                    for (const file of files) {
                        if (totalMatches >= maxMatches) break;

                        try {
                            const fullPath = path.join(basePath, file);
                            const content = await fs.readFile(fullPath, 'utf-8');
                            const lines = content.split('\n');

                            for (let i = 0; i < lines.length && totalMatches < maxMatches; i++) {
                                if (regex.test(lines[i])) {
                                    results.push(`${file}:${i + 1}: ${lines[i].substring(0, 200)}`);
                                    totalMatches++;
                                }
                                regex.lastIndex = 0; // Reset regex state
                            }
                        } catch {
                            // Skip files that can't be read (binary, etc.)
                        }
                    }

                    if (results.length === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: `No matches found for pattern: ${args.pattern}`
                            }]
                        };
                    }

                    return {
                        content: [{
                            type: 'text',
                            text: `Found ${totalMatches} matches${totalMatches >= maxMatches ? ' (limit reached)' : ''}:\n${results.join('\n')}`
                        }]
                    };
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    return {
                        content: [{
                            type: 'error',
                            data: `Grep failed: ${msg}`
                        }]
                    };
                }
            }
        };
    }

    private createBashTool(context: ToolContext): ToolRequest {
        return {
            id: 'bash',
            name: 'bash',
            description: 'Execute a shell command. Only safe commands are allowed (npm, yarn, git, tsc, eslint, etc.).',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The command to execute'
                    },
                    working_dir: {
                        type: 'string',
                        description: 'Optional: Working directory for the command'
                    },
                    timeout: {
                        type: 'number',
                        description: 'Optional: Timeout in milliseconds (default: 30000)'
                    }
                },
                required: ['command']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                try {
                    const args = JSON.parse(argsStr);
                    const cwd = args.working_dir
                        ? this.resolvePath(args.working_dir, context)
                        : context.workspaceRoot;

                    // Safety check - only allow safe commands
                    const safeCommands = [
                        'npm', 'npx', 'yarn', 'pnpm',
                        'node', 'tsc', 'eslint', 'prettier',
                        'git', 'ls', 'cat', 'echo', 'pwd',
                        'mkdir', 'cp', 'mv', 'rm',
                        'grep', 'find', 'head', 'tail', 'wc'
                    ];

                    const firstWord = args.command.trim().split(/\s+/)[0];
                    if (!safeCommands.includes(firstWord)) {
                        return {
                            content: [{
                                type: 'error',
                                data: `Command not allowed: ${firstWord}. Allowed commands: ${safeCommands.join(', ')}`
                            }]
                        };
                    }

                    // Prevent dangerous patterns
                    const dangerousPatterns = [
                        /rm\s+-rf?\s+[\/~]/,
                        />\s*\/dev\/sd/,
                        /mkfs/,
                        /dd\s+if=/,
                        /:(){ :|:& };:/
                    ];

                    for (const pattern of dangerousPatterns) {
                        if (pattern.test(args.command)) {
                            return {
                                content: [{
                                    type: 'error',
                                    data: 'Command contains dangerous patterns and was blocked.'
                                }]
                            };
                        }
                    }

                    const { exec } = await import('child_process');
                    const { promisify } = await import('util');
                    const execAsync = promisify(exec);

                    const timeout = args.timeout || 30000;
                    const { stdout, stderr } = await execAsync(args.command, {
                        cwd,
                        timeout,
                        maxBuffer: 1024 * 1024 // 1MB
                    });

                    let output = '';
                    if (stdout) output += stdout;
                    if (stderr) output += `\nSTDERR:\n${stderr}`;

                    // Truncate if too long
                    if (output.length > 10000) {
                        output = output.substring(0, 10000) + '\n... (output truncated)';
                    }

                    return {
                        content: [{
                            type: 'text',
                            text: output || '(command completed with no output)'
                        }]
                    };
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    return {
                        content: [{
                            type: 'error',
                            data: `Command failed: ${msg}`
                        }]
                    };
                }
            }
        };
    }

    private createTaskCompleteTool(): ToolRequest {
        return {
            id: 'task_complete',
            name: 'task_complete',
            description: 'Signal that the task is complete and provide a summary of what was accomplished.',
            parameters: {
                type: 'object',
                properties: {
                    summary: {
                        type: 'string',
                        description: 'A summary of what was accomplished'
                    },
                    files_changed: {
                        type: 'array',
                        description: 'Optional: List of files that were modified'
                    },
                    notes: {
                        type: 'string',
                        description: 'Optional: Any additional notes or follow-up suggestions'
                    }
                },
                required: ['summary']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                const args = JSON.parse(argsStr);
                return {
                    content: [{
                        type: 'text',
                        text: `Task completed.\nSummary: ${args.summary}${args.notes ? `\nNotes: ${args.notes}` : ''}`
                    }]
                };
            }
        };
    }
}
