// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import {
    Agent,
    getJsonOfResponse,
    isLanguageModelParsedResponse,
    LanguageModelRegistry,
    LanguageModelRequirement,
    PromptService,
    UserRequest
} from '@theia/ai-core/lib/common';
import { LanguageModelService } from '@theia/ai-core/lib/browser';
import { Emitter, Event, generateUuid, ILogger, nls } from '@theia/core';
import { terminalPrompts } from './ai-terminal-prompt-template';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { TerminalExecutor, ExecutionResult, ExecuteOptions, ExecutionProgress } from './terminal-executor';
import { TerminalSafetyService, SafetyCheckResult, SafetyMode } from './terminal-safety-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';

const Commands = z.object({
    commands: z.array(z.string()),
});
type Commands = z.infer<typeof Commands>;

const TaskPlan = z.object({
    steps: z.array(z.object({
        description: z.string(),
        command: z.string(),
        continueOnError: z.boolean().optional(),
    })),
    summary: z.string(),
});
type TaskPlan = z.infer<typeof TaskPlan>;

const ErrorAnalysis = z.object({
    cause: z.string(),
    suggestedFix: z.string().optional(),
    correctedCommand: z.string().optional(),
    shouldRetry: z.boolean(),
});
type ErrorAnalysis = z.infer<typeof ErrorAnalysis>;

/**
 * Execution mode for the terminal agent
 */
export enum ExecutionMode {
    /** Only suggest commands, don't execute (default) */
    SUGGEST = 'suggest',
    /** Execute with user confirmation */
    CONFIRM = 'confirm',
    /** Execute automatically (requires explicit opt-in) */
    AUTO = 'auto'
}

/**
 * Result of a task execution
 */
export interface TaskResult {
    /** Whether the task completed successfully */
    success: boolean;
    /** Individual step results */
    steps: {
        description: string;
        command: string;
        result: ExecutionResult;
    }[];
    /** Overall summary */
    summary: string;
    /** Total execution time */
    totalDuration: number;
}

/**
 * Progress event for task execution
 */
export interface TaskProgress {
    /** Current step index (0-based) */
    currentStep: number;
    /** Total number of steps */
    totalSteps: number;
    /** Current step description */
    stepDescription: string;
    /** Current command being executed */
    command: string;
    /** Execution progress for current step */
    executionProgress?: ExecutionProgress;
}

@injectable()
export class AiTerminalAgent implements Agent {

    id = 'Terminal Assistant';
    name = 'Terminal Assistant';
    description = nls.localize('theia/ai/terminal/agent/description', 'This agent provides assistance to write and execute arbitrary terminal commands. \
        Based on the user\'s request, it suggests commands and allows the user to directly paste and execute them in the terminal. \
        It accesses the current directory, environment and the recent terminal output of the terminal session to provide context-aware assistance');
    variables = [];
    functions = [];
    agentSpecificVariables = [
        {
            name: 'userRequest',
            usedInPrompt: true,
            description: nls.localize('theia/ai/terminal/agent/vars/userRequest/description', 'The user\'s question or request.')
        },
        {
            name: 'shell',
            usedInPrompt: true,
            description: nls.localize('theia/ai/terminal/agent/vars/shell/description', 'The shell being used, e.g., /usr/bin/zsh.')
        },
        {
            name: 'cwd',
            usedInPrompt: true,
            description: nls.localize('theia/ai/terminal/agent/vars/cwd/description', 'The current working directory.')
        },
        {
            name: 'recentTerminalContents',
            usedInPrompt: true,
            description: nls.localize('theia/ai/terminal/agent/vars/recentTerminalContents/description', 'The last 0 to 50 recent lines visible in the terminal.')
        }
    ];
    prompts = terminalPrompts;
    languageModelRequirements: LanguageModelRequirement[] = [
        {
            purpose: 'suggest-terminal-commands',
            identifier: 'default/universal',
        },
        {
            purpose: 'plan-terminal-task',
            identifier: 'default/universal',
        },
        {
            purpose: 'analyze-terminal-error',
            identifier: 'default/universal',
        }
    ];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(LanguageModelService)
    protected languageModelService: LanguageModelService;

    @inject(TerminalExecutor)
    protected terminalExecutor: TerminalExecutor;

    @inject(TerminalSafetyService)
    protected safetyService: TerminalSafetyService;

    protected executionMode: ExecutionMode = ExecutionMode.SUGGEST;
    protected maxRetries = 3;

    protected readonly onTaskProgressEmitter = new Emitter<TaskProgress>();
    readonly onTaskProgress: Event<TaskProgress> = this.onTaskProgressEmitter.event;

    @postConstruct()
    protected init(): void {
        // Subscribe to executor progress events
        this.terminalExecutor.onProgress(progress => {
            // Forward execution progress events
        });
    }

    async getCommands(
        userRequest: string,
        cwd: string,
        shell: string,
        recentTerminalContents: string[],
    ): Promise<string[]> {
        const lm = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[0]
        });
        if (!lm) {
            this.logger.error('No language model available for the AI Terminal Agent.');
            return [];
        }

        const parameters = {
            userRequest,
            shell,
            cwd,
            recentTerminalContents
        };

        const systemMessage = await this.promptService.getResolvedPromptFragment('terminal-system', parameters).then(p => p?.text);
        const request = await this.promptService.getResolvedPromptFragment('terminal-user', parameters).then(p => p?.text);
        if (!systemMessage || !request) {
            this.logger.error('The prompt service didn\'t return prompts for the AI Terminal Agent.');
            return [];
        }

        // since we do not actually hold complete conversions, the request/response pair is considered a session
        const sessionId = generateUuid();
        const requestId = generateUuid();
        const llmRequest: UserRequest = {
            messages: [
                {
                    actor: 'ai',
                    type: 'text',
                    text: systemMessage
                },
                {
                    actor: 'user',
                    type: 'text',
                    text: request
                }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'terminal-commands',
                    description: 'Suggested terminal commands based on the user request',
                    schema: zodToJsonSchema(Commands)
                }
            },
            agentId: this.id,
            requestId,
            sessionId
        };

        try {
            const result = await this.languageModelService.sendRequest(lm, llmRequest);

            if (isLanguageModelParsedResponse(result)) {
                // model returned structured output
                const parsedResult = Commands.safeParse(result.parsed);
                if (parsedResult.success) {
                    return parsedResult.data.commands;
                }
            }

            // fall back to agent-based parsing of result
            const jsonResult = await getJsonOfResponse(result);
            const parsedJsonResult = Commands.safeParse(jsonResult);
            if (parsedJsonResult.success) {
                return parsedJsonResult.data.commands;
            }

            return [];

        } catch (error) {
            this.logger.error('Error obtaining the command suggestions.', error);
            return [];
        }
    }

    /**
     * Get the current execution mode
     */
    getExecutionMode(): ExecutionMode {
        return this.executionMode;
    }

    /**
     * Set the execution mode
     */
    setExecutionMode(mode: ExecutionMode): void {
        this.executionMode = mode;
        this.logger.info(`Terminal agent execution mode set to: ${mode}`);
    }

    /**
     * Execute a single command with the configured execution mode
     */
    async executeCommand(
        command: string,
        terminal: TerminalWidget,
        options: ExecuteOptions = {}
    ): Promise<ExecutionResult> {
        // Check safety first
        const safetyCheck = this.safetyService.checkCommand(command);

        if (safetyCheck.blocked) {
            return {
                id: generateUuid(),
                command,
                exitCode: 1,
                stdout: '',
                stderr: `Command blocked: ${safetyCheck.reason}`,
                duration: 0,
                success: false,
                error: safetyCheck.reason
            };
        }

        // Determine if confirmation is needed
        const requireConfirmation = this.executionMode === ExecutionMode.CONFIRM ||
            (this.executionMode === ExecutionMode.AUTO && safetyCheck.requiresConfirmation);

        return this.terminalExecutor.executeCommand(command, {
            ...options,
            terminal,
            requireConfirmation,
            captureOutput: true
        });
    }

    /**
     * Execute a command and automatically retry with corrections on failure
     */
    async executeWithAutoRetry(
        userRequest: string,
        command: string,
        terminal: TerminalWidget,
        cwd: string,
        shell: string,
        recentTerminalContents: string[]
    ): Promise<ExecutionResult> {
        let currentCommand = command;
        let lastResult: ExecutionResult | undefined;
        let attempts = 0;

        while (attempts < this.maxRetries) {
            attempts++;

            // Execute the command
            lastResult = await this.executeCommand(currentCommand, terminal);

            // If successful, return
            if (lastResult.success) {
                return lastResult;
            }

            // If cancelled or timed out, don't retry
            if (lastResult.cancelled || lastResult.timedOut) {
                return lastResult;
            }

            // Analyze the error and get a corrected command
            const analysis = await this.analyzeError(
                userRequest,
                currentCommand,
                lastResult.stdout + lastResult.stderr,
                cwd,
                shell,
                recentTerminalContents
            );

            if (!analysis.shouldRetry || !analysis.correctedCommand) {
                this.logger.info(`Auto-retry: Not retrying after attempt ${attempts}. Reason: ${analysis.cause}`);
                return lastResult;
            }

            this.logger.info(`Auto-retry: Attempting corrected command (attempt ${attempts + 1}): ${analysis.correctedCommand}`);
            currentCommand = analysis.correctedCommand;
        }

        return lastResult!;
    }

    /**
     * Execute a multi-step task
     */
    async executeTask(
        userRequest: string,
        terminal: TerminalWidget,
        cwd: string,
        shell: string,
        recentTerminalContents: string[]
    ): Promise<TaskResult> {
        const startTime = Date.now();

        // Plan the task
        const plan = await this.planTask(userRequest, cwd, shell, recentTerminalContents);
        if (!plan || plan.steps.length === 0) {
            return {
                success: false,
                steps: [],
                summary: 'Failed to create a task plan',
                totalDuration: Date.now() - startTime
            };
        }

        const results: TaskResult['steps'] = [];
        let overallSuccess = true;

        // Execute each step
        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];

            // Emit progress
            this.onTaskProgressEmitter.fire({
                currentStep: i,
                totalSteps: plan.steps.length,
                stepDescription: step.description,
                command: step.command
            });

            const result = await this.executeCommand(step.command, terminal);
            results.push({
                description: step.description,
                command: step.command,
                result
            });

            if (!result.success) {
                overallSuccess = false;
                if (!step.continueOnError) {
                    this.logger.warn(`Task stopped at step ${i + 1}: ${step.description}`);
                    break;
                }
            }
        }

        return {
            success: overallSuccess,
            steps: results,
            summary: plan.summary,
            totalDuration: Date.now() - startTime
        };
    }

    /**
     * Plan a multi-step task
     */
    protected async planTask(
        userRequest: string,
        cwd: string,
        shell: string,
        recentTerminalContents: string[]
    ): Promise<TaskPlan | undefined> {
        const lm = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[1]
        });
        if (!lm) {
            this.logger.error('No language model available for task planning.');
            return undefined;
        }

        const systemPrompt = `You are a terminal task planner. Given a user's request, break it down into a sequence of shell commands.
Each step should have:
- description: A brief description of what this step does
- command: The exact shell command to run
- continueOnError: Whether to continue if this step fails (default: false)

Current directory: ${cwd}
Shell: ${shell}
Recent terminal output:
${recentTerminalContents.slice(-20).join('\n')}`;

        const sessionId = generateUuid();
        const requestId = generateUuid();
        const llmRequest: UserRequest = {
            messages: [
                { actor: 'ai', type: 'text', text: systemPrompt },
                { actor: 'user', type: 'text', text: userRequest }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'task-plan',
                    description: 'A plan for executing a multi-step terminal task',
                    schema: zodToJsonSchema(TaskPlan)
                }
            },
            agentId: this.id,
            requestId,
            sessionId
        };

        try {
            const result = await this.languageModelService.sendRequest(lm, llmRequest);

            if (isLanguageModelParsedResponse(result)) {
                const parsed = TaskPlan.safeParse(result.parsed);
                if (parsed.success) {
                    return parsed.data;
                }
            }

            const jsonResult = await getJsonOfResponse(result);
            const parsedJson = TaskPlan.safeParse(jsonResult);
            if (parsedJson.success) {
                return parsedJson.data;
            }

            return undefined;
        } catch (error) {
            this.logger.error('Error planning task:', error);
            return undefined;
        }
    }

    /**
     * Analyze an error and suggest a fix
     */
    protected async analyzeError(
        userRequest: string,
        command: string,
        errorOutput: string,
        cwd: string,
        shell: string,
        recentTerminalContents: string[]
    ): Promise<ErrorAnalysis> {
        const lm = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[2]
        });
        if (!lm) {
            return {
                cause: 'No language model available for error analysis',
                shouldRetry: false
            };
        }

        const systemPrompt = `You are a terminal error analyzer. Given a failed command and its error output, analyze the error and suggest a fix.

Provide:
- cause: Why the command failed
- suggestedFix: A description of how to fix it
- correctedCommand: The corrected command (if applicable)
- shouldRetry: Whether retrying with the corrected command makes sense

Current directory: ${cwd}
Shell: ${shell}
Recent terminal output:
${recentTerminalContents.slice(-10).join('\n')}`;

        const userMessage = `Original request: ${userRequest}

Failed command: ${command}

Error output:
${errorOutput}`;

        const sessionId = generateUuid();
        const requestId = generateUuid();
        const llmRequest: UserRequest = {
            messages: [
                { actor: 'ai', type: 'text', text: systemPrompt },
                { actor: 'user', type: 'text', text: userMessage }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'error-analysis',
                    description: 'Analysis of a terminal command error',
                    schema: zodToJsonSchema(ErrorAnalysis)
                }
            },
            agentId: this.id,
            requestId,
            sessionId
        };

        try {
            const result = await this.languageModelService.sendRequest(lm, llmRequest);

            if (isLanguageModelParsedResponse(result)) {
                const parsed = ErrorAnalysis.safeParse(result.parsed);
                if (parsed.success) {
                    return parsed.data;
                }
            }

            const jsonResult = await getJsonOfResponse(result);
            const parsedJson = ErrorAnalysis.safeParse(jsonResult);
            if (parsedJson.success) {
                return parsedJson.data;
            }

            return {
                cause: 'Failed to parse error analysis',
                shouldRetry: false
            };
        } catch (error) {
            this.logger.error('Error analyzing command failure:', error);
            return {
                cause: String(error),
                shouldRetry: false
            };
        }
    }

    /**
     * Check if a command is safe to execute
     */
    checkCommandSafety(command: string): SafetyCheckResult {
        return this.safetyService.checkCommand(command);
    }

    /**
     * Get the current safety mode
     */
    getSafetyMode(): SafetyMode {
        return this.safetyService.getSafetyMode();
    }

    /**
     * Set the safety mode
     */
    setSafetyMode(mode: SafetyMode): void {
        this.safetyService.setSafetyMode(mode);
    }
}
