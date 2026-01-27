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
import { Emitter, Event, CancellationTokenSource, CancellationToken } from '@theia/core';
import { v4 as uuid } from 'uuid';
import {
    SwarmTask,
    SubAgentInstance,
    TaskResult,
    CodeChange,
    AgentRole
} from '../common/swarm-protocol';
import { DEFAULT_SWARM_CONFIGURATION, getDefaultRoleConfig } from '../common/swarm-configuration';
import {
    LanguageModelRegistry,
    UserRequest,
    ToolRequest,
    ToolCallResult,
    isLanguageModelStreamResponse,
    isTextResponsePart,
    isToolCallResponsePart,
    LanguageModelMessage
} from '@theia/ai-core/lib/common/language-model';

export const AgentTaskExecutor = Symbol('AgentTaskExecutor');

export interface AgentTaskExecutor {
    executeTask(
        sessionId: string,
        agent: SubAgentInstance,
        task: SwarmTask,
        cancellationToken?: CancellationToken
    ): Promise<TaskResult>;

    onTaskProgress: Event<TaskProgressEvent>;
    onToolCall: Event<ToolCallEvent>;
}

export interface TaskProgressEvent {
    sessionId: string;
    agentId: string;
    taskId: string;
    progress: number; // 0-100
    message: string;
    tokensUsed: number;
}

export interface ToolCallEvent {
    sessionId: string;
    agentId: string;
    taskId: string;
    toolName: string;
    input: unknown;
    output?: ToolCallResult;
    success: boolean;
}

interface ExecutionContext {
    sessionId: string;
    agent: SubAgentInstance;
    task: SwarmTask;
    messages: LanguageModelMessage[];
    tokensUsed: number;
    codeChanges: CodeChange[];
    artifacts: string[];
    cancellation: CancellationTokenSource;
}

@injectable()
export class AgentTaskExecutorImpl implements AgentTaskExecutor {

    @inject(LanguageModelRegistry) @optional()
    protected readonly languageModelRegistry: LanguageModelRegistry | undefined;

    private readonly onTaskProgressEmitter = new Emitter<TaskProgressEvent>();
    readonly onTaskProgress = this.onTaskProgressEmitter.event;

    private readonly onToolCallEmitter = new Emitter<ToolCallEvent>();
    readonly onToolCall = this.onToolCallEmitter.event;

    async executeTask(
        sessionId: string,
        agent: SubAgentInstance,
        task: SwarmTask,
        cancellationToken?: CancellationToken
    ): Promise<TaskResult> {
        if (!this.languageModelRegistry) {
            return this.createFailedResult(task, 'LanguageModelRegistry not available');
        }

        const roleConfig = getDefaultRoleConfig(agent.role);
        const model = await this.languageModelRegistry.getLanguageModel(
            roleConfig.defaultModel || DEFAULT_SWARM_CONFIGURATION.defaultWorkerModel
        );

        if (!model) {
            return this.createFailedResult(task, `Language model not found for role: ${agent.role}`);
        }

        const cancellation = new CancellationTokenSource();
        if (cancellationToken) {
            cancellationToken.onCancellationRequested(() => cancellation.cancel());
        }

        const context: ExecutionContext = {
            sessionId,
            agent,
            task,
            messages: [],
            tokensUsed: 0,
            codeChanges: [],
            artifacts: [],
            cancellation
        };

        try {
            // Build initial messages
            context.messages = this.buildInitialMessages(agent, task);

            // Create tools based on agent's allowed tools
            const tools = this.createToolsForAgent(agent, context);

            // Execute the agent loop
            const maxIterations = 10;
            let iteration = 0;

            while (iteration < maxIterations && !cancellation.token.isCancellationRequested) {
                iteration++;

                this.emitProgress(context, Math.min(iteration * 10, 90), `Iteration ${iteration}...`);

                const request: UserRequest = {
                    sessionId: uuid(),
                    requestId: uuid(),
                    agentId: agent.id,
                    messages: context.messages,
                    tools: tools.length > 0 ? tools : undefined,
                    cancellationToken: cancellation.token
                };

                const response = await model.request(request, cancellation.token);

                if (!isLanguageModelStreamResponse(response)) {
                    // Non-streaming response - task likely complete
                    break;
                }

                let responseText = '';
                let hasToolCalls = false;
                const toolCalls: Array<{ id: string; name: string; args: string }> = [];

                for await (const part of response.stream) {
                    if (cancellation.token.isCancellationRequested) {
                        break;
                    }

                    if (isTextResponsePart(part)) {
                        responseText += part.content;
                    } else if (isToolCallResponsePart(part)) {
                        hasToolCalls = true;
                        for (const tc of part.tool_calls) {
                            if (tc.finished && tc.function?.name) {
                                toolCalls.push({
                                    id: tc.id || uuid(),
                                    name: tc.function.name,
                                    args: tc.function.arguments || '{}'
                                });
                            }
                        }
                    }
                }

                // Add assistant response to messages
                if (responseText) {
                    context.messages.push({
                        actor: 'ai',
                        type: 'text',
                        text: responseText
                    });
                }

                // Process tool calls
                if (hasToolCalls && toolCalls.length > 0) {
                    for (const tc of toolCalls) {
                        const tool = tools.find(t => t.name === tc.name);
                        if (tool) {
                            try {
                                const result = await tool.handler(tc.args, context);

                                // Add tool use and result to messages
                                context.messages.push({
                                    actor: 'ai',
                                    type: 'tool_use',
                                    id: tc.id,
                                    name: tc.name,
                                    input: JSON.parse(tc.args)
                                });

                                context.messages.push({
                                    actor: 'user',
                                    type: 'tool_result',
                                    tool_use_id: tc.id,
                                    name: tc.name,
                                    content: typeof result === 'string' ? { content: [{ type: 'text', text: result }] } : result
                                });

                                this.onToolCallEmitter.fire({
                                    sessionId,
                                    agentId: agent.id,
                                    taskId: task.id,
                                    toolName: tc.name,
                                    input: JSON.parse(tc.args),
                                    output: result,
                                    success: true
                                });
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : String(error);

                                context.messages.push({
                                    actor: 'user',
                                    type: 'tool_result',
                                    tool_use_id: tc.id,
                                    name: tc.name,
                                    content: { content: [{ type: 'error', data: errorMsg }] },
                                    is_error: true
                                });

                                this.onToolCallEmitter.fire({
                                    sessionId,
                                    agentId: agent.id,
                                    taskId: task.id,
                                    toolName: tc.name,
                                    input: JSON.parse(tc.args),
                                    success: false
                                });
                            }
                        }
                    }
                } else {
                    // No tool calls - agent is done
                    break;
                }
            }

            // Build successful result
            this.emitProgress(context, 100, 'Task complete');

            return {
                success: true,
                summary: this.extractSummary(context),
                codeChanges: context.codeChanges,
                artifacts: context.artifacts
            };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return this.createFailedResult(task, errorMsg);
        }
    }

    private buildInitialMessages(agent: SubAgentInstance, task: SwarmTask): LanguageModelMessage[] {
        const systemPrompt = this.buildSystemPrompt(agent.role, task);

        return [
            {
                actor: 'system',
                type: 'text',
                text: systemPrompt
            },
            {
                actor: 'user',
                type: 'text',
                text: this.buildTaskPrompt(task)
            }
        ];
    }

    private buildSystemPrompt(role: AgentRole, task: SwarmTask): string {
        const rolePrompts: Record<AgentRole, string> = {
            architect: `You are a Software Architect agent. Your expertise is in:
- Analyzing requirements and designing solutions
- Creating system architecture and component diagrams
- Defining interfaces and data models
- Making technology decisions
- Ensuring scalability and maintainability

Focus on high-level design. Delegate implementation details to other agents.`,

            senior_dev: `You are a Senior Developer agent. Your expertise is in:
- Complex implementation tasks
- Code refactoring and optimization
- Debugging difficult issues
- Mentoring patterns and best practices
- Making architectural decisions at the code level

Write clean, maintainable, well-documented code.`,

            developer: `You are a Developer agent. Your job is to:
- Implement features according to specifications
- Write clean, readable code
- Follow existing patterns in the codebase
- Add appropriate error handling
- Document your code

Ask for clarification if requirements are unclear.`,

            junior_dev: `You are a Junior Developer agent. Your job is to:
- Implement simple, well-defined tasks
- Follow existing code patterns exactly
- Write basic tests for your code
- Ask questions when unsure

Focus on correctness over cleverness.`,

            reviewer: `You are a Code Reviewer agent. Your job is to:
- Review code for correctness and bugs
- Check for security vulnerabilities
- Ensure code follows best practices
- Verify proper error handling
- Check test coverage

Provide constructive, actionable feedback.`,

            security: `You are a Security Reviewer agent. Your expertise is in:
- Identifying security vulnerabilities (OWASP Top 10)
- Checking for injection attacks, XSS, CSRF
- Reviewing authentication and authorization
- Auditing sensitive data handling
- Ensuring secure configurations

Flag security issues with severity ratings.`,

            tester: `You are a Test Engineer agent. Your job is to:
- Write comprehensive unit tests
- Create integration tests
- Test edge cases and error conditions
- Ensure good test coverage
- Write clear test descriptions

Use appropriate testing frameworks and patterns.`,

            documenter: `You are a Documentation Writer agent. Your job is to:
- Write clear README files
- Document APIs and interfaces
- Create usage examples
- Write inline code comments
- Maintain changelog entries

Write for your target audience (developers, users, etc).`,

            devops: `You are a DevOps Engineer agent. Your expertise is in:
- CI/CD pipeline configuration
- Docker and container setup
- Infrastructure as code
- Deployment scripts
- Monitoring and logging setup

Focus on automation and reliability.`,

            generalist: `You are a Generalist agent. You can handle various tasks including:
- Implementation
- Testing
- Documentation
- Code review

Adapt your approach based on the specific task requirements.`
        };

        const basePrompt = rolePrompts[role] || rolePrompts.generalist;

        return `${basePrompt}

## Current Task Context
- Task Type: ${task.type}
- Priority: ${task.priority}

## Guidelines
- Complete the task thoroughly
- Report any blockers or issues
- Use available tools to read/write files
- Follow existing code patterns
- Ask for help if stuck

When you have completed the task, summarize what you did.`;
    }

    private buildTaskPrompt(task: SwarmTask): string {
        let prompt = `# Task: ${task.title}

## Description
${task.description}

## Acceptance Criteria
${task.acceptanceCriteria?.map(c => `- ${c}`).join('\n') || 'Not specified'}

Please complete this task. Use the available tools to read and modify files as needed.
`;

        return prompt;
    }

    private createToolsForAgent(agent: SubAgentInstance, context: ExecutionContext): ToolRequest[] {
        const roleConfig = getDefaultRoleConfig(agent.role);
        const allowedTools = roleConfig.allowedTools || ['read', 'glob', 'grep'];
        const tools: ToolRequest[] = [];

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
        tools.push(this.createTaskCompleteTool(context));

        return tools;
    }

    private createReadFileTool(context: ExecutionContext): ToolRequest {
        return {
            id: 'read_file',
            name: 'read_file',
            description: 'Read the contents of a file',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path to read' },
                    startLine: { type: 'number', description: 'Start line (optional)' },
                    endLine: { type: 'number', description: 'End line (optional)' }
                },
                required: ['path']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                const args = JSON.parse(argsStr);
                // In a real implementation, this would use FileService
                // For now, return a placeholder
                return {
                    content: [{
                        type: 'text',
                        text: `[Tool stub] Would read file: ${args.path}`
                    }]
                };
            }
        };
    }

    private createWriteFileTool(context: ExecutionContext): ToolRequest {
        return {
            id: 'write_file',
            name: 'write_file',
            description: 'Write content to a file (creates or overwrites)',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path to write' },
                    content: { type: 'string', description: 'Content to write' }
                },
                required: ['path', 'content']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                const args = JSON.parse(argsStr);
                // Track code change
                context.codeChanges.push({
                    filePath: args.path,
                    changeType: 'create',
                    diff: `+++ ${args.path}\n${args.content.substring(0, 500)}...`,
                    newContent: args.content
                });
                return {
                    content: [{
                        type: 'text',
                        text: `[Tool stub] Would write to file: ${args.path}`
                    }]
                };
            }
        };
    }

    private createEditFileTool(context: ExecutionContext): ToolRequest {
        return {
            id: 'edit_file',
            name: 'edit_file',
            description: 'Edit a file by replacing text',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path to edit' },
                    oldText: { type: 'string', description: 'Text to find and replace' },
                    newText: { type: 'string', description: 'Replacement text' }
                },
                required: ['path', 'oldText', 'newText']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                const args = JSON.parse(argsStr);
                context.codeChanges.push({
                    filePath: args.path,
                    changeType: 'modify',
                    diff: `--- ${args.path}\n+++ ${args.path}\n-${args.oldText}\n+${args.newText}`
                });
                return {
                    content: [{
                        type: 'text',
                        text: `[Tool stub] Would edit file: ${args.path}`
                    }]
                };
            }
        };
    }

    private createGlobTool(context: ExecutionContext): ToolRequest {
        return {
            id: 'glob',
            name: 'glob',
            description: 'Find files matching a glob pattern',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts")' },
                    path: { type: 'string', description: 'Base directory (optional)' }
                },
                required: ['pattern']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                const args = JSON.parse(argsStr);
                return {
                    content: [{
                        type: 'text',
                        text: `[Tool stub] Would glob: ${args.pattern} in ${args.path || '.'}`
                    }]
                };
            }
        };
    }

    private createGrepTool(context: ExecutionContext): ToolRequest {
        return {
            id: 'grep',
            name: 'grep',
            description: 'Search for text in files',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Search pattern (regex)' },
                    path: { type: 'string', description: 'Directory to search' },
                    filePattern: { type: 'string', description: 'File glob pattern (optional)' }
                },
                required: ['pattern']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                const args = JSON.parse(argsStr);
                return {
                    content: [{
                        type: 'text',
                        text: `[Tool stub] Would grep: ${args.pattern} in ${args.path || '.'}`
                    }]
                };
            }
        };
    }

    private createBashTool(context: ExecutionContext): ToolRequest {
        return {
            id: 'bash',
            name: 'bash',
            description: 'Execute a bash command',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to execute' },
                    workingDir: { type: 'string', description: 'Working directory (optional)' }
                },
                required: ['command']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                const args = JSON.parse(argsStr);
                // Safety check - only allow safe commands
                const safeCommands = ['npm', 'yarn', 'pnpm', 'node', 'tsc', 'eslint', 'prettier', 'git', 'ls', 'cat', 'echo'];
                const firstWord = args.command.split(' ')[0];
                if (!safeCommands.includes(firstWord)) {
                    return {
                        content: [{
                            type: 'error',
                            data: `Command not allowed: ${firstWord}`
                        }]
                    };
                }
                return {
                    content: [{
                        type: 'text',
                        text: `[Tool stub] Would execute: ${args.command}`
                    }]
                };
            }
        };
    }

    private createTaskCompleteTool(context: ExecutionContext): ToolRequest {
        return {
            id: 'task_complete',
            name: 'task_complete',
            description: 'Mark the task as complete and provide a summary',
            parameters: {
                type: 'object',
                properties: {
                    summary: { type: 'string', description: 'Summary of what was accomplished' },
                    filesChanged: {
                        type: 'array',
                        description: 'List of files that were modified'
                    }
                },
                required: ['summary']
            },
            handler: async (argsStr: string): Promise<ToolCallResult> => {
                const args = JSON.parse(argsStr);
                context.artifacts.push(`Task Summary: ${args.summary}`);
                return {
                    content: [{
                        type: 'text',
                        text: 'Task marked as complete.'
                    }]
                };
            }
        };
    }

    private emitProgress(context: ExecutionContext, progress: number, message: string): void {
        this.onTaskProgressEmitter.fire({
            sessionId: context.sessionId,
            agentId: context.agent.id,
            taskId: context.task.id,
            progress,
            message,
            tokensUsed: context.tokensUsed
        });
    }

    private extractSummary(context: ExecutionContext): string {
        // Extract summary from the last AI message
        for (let i = context.messages.length - 1; i >= 0; i--) {
            const msg = context.messages[i];
            if (msg.actor === 'ai' && msg.type === 'text') {
                return (msg as { text: string }).text.substring(0, 500);
            }
        }
        return 'Task completed';
    }

    private createFailedResult(_task: SwarmTask, error: string): TaskResult {
        return {
            success: false,
            summary: `Task failed: ${error}`,
            codeChanges: [],
            artifacts: []
        };
    }
}
