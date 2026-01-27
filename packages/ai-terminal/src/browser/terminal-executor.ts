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

import { Disposable, DisposableCollection, Emitter, Event, generateUuid, ILogger } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TerminalSafetyService, SafetyCheckResult } from './terminal-safety-service';

/**
 * Options for executing a command in the terminal
 */
export interface ExecuteOptions {
    /** Require user confirmation before executing */
    requireConfirmation?: boolean;
    /** Timeout in milliseconds (0 = no timeout) */
    timeout?: number;
    /** Working directory for the command */
    cwd?: string;
    /** Environment variables to set */
    env?: Record<string, string>;
    /** Terminal widget to use (uses current if not specified) */
    terminal?: TerminalWidget;
    /** Capture output for result */
    captureOutput?: boolean;
}

/**
 * Result of a command execution
 */
export interface ExecutionResult {
    /** Unique execution ID */
    id: string;
    /** The command that was executed */
    command: string;
    /** Exit code (0 = success, undefined if timed out or cancelled) */
    exitCode?: number;
    /** Standard output captured */
    stdout: string;
    /** Standard error captured */
    stderr: string;
    /** Duration in milliseconds */
    duration: number;
    /** Whether the command completed successfully */
    success: boolean;
    /** Error message if execution failed */
    error?: string;
    /** Whether the command was cancelled */
    cancelled?: boolean;
    /** Whether the command timed out */
    timedOut?: boolean;
}

/**
 * Progress event for command execution
 */
export interface ExecutionProgress {
    id: string;
    command: string;
    status: 'pending' | 'confirming' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timedOut';
    output?: string;
    elapsedMs?: number;
}

/**
 * Request for user confirmation
 */
export interface ConfirmationRequest {
    id: string;
    command: string;
    safetyCheck: SafetyCheckResult;
    resolve: (confirmed: boolean) => void;
}

export const TerminalExecutor = Symbol('TerminalExecutor');

/**
 * Service for executing commands in the terminal with safety checks,
 * output capture, and progress tracking.
 */
export interface TerminalExecutor {
    /**
     * Execute a single command in the terminal
     */
    executeCommand(command: string, options?: ExecuteOptions): Promise<ExecutionResult>;

    /**
     * Execute a command with mandatory confirmation dialog
     */
    executeWithConfirmation(command: string, options?: ExecuteOptions): Promise<ExecutionResult>;

    /**
     * Execute multiple commands in sequence
     */
    executeBatch(commands: string[], options?: ExecuteOptions): Promise<ExecutionResult[]>;

    /**
     * Cancel a running execution by ID
     */
    cancelExecution(executionId: string): boolean;

    /**
     * Get the status of an execution
     */
    getExecutionStatus(executionId: string): ExecutionProgress | undefined;

    /**
     * Event fired when confirmation is needed
     */
    readonly onConfirmationRequired: Event<ConfirmationRequest>;

    /**
     * Event fired on execution progress updates
     */
    readonly onProgress: Event<ExecutionProgress>;

    /**
     * Respond to a confirmation request
     */
    respondToConfirmation(id: string, confirmed: boolean): void;
}

@injectable()
export class TerminalExecutorImpl implements TerminalExecutor, Disposable {

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(TerminalSafetyService)
    protected readonly safetyService: TerminalSafetyService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly disposables = new DisposableCollection();
    protected readonly runningExecutions = new Map<string, {
        command: string;
        startTime: number;
        outputBuffer: string[];
        cancelled: boolean;
        disposables: DisposableCollection;
    }>();
    protected readonly pendingConfirmations = new Map<string, ConfirmationRequest>();

    protected readonly onConfirmationRequiredEmitter = new Emitter<ConfirmationRequest>();
    readonly onConfirmationRequired = this.onConfirmationRequiredEmitter.event;

    protected readonly onProgressEmitter = new Emitter<ExecutionProgress>();
    readonly onProgress = this.onProgressEmitter.event;

    @postConstruct()
    protected init(): void {
        this.disposables.push(this.onConfirmationRequiredEmitter);
        this.disposables.push(this.onProgressEmitter);
    }

    dispose(): void {
        // Cancel all running executions
        for (const [id] of this.runningExecutions) {
            this.cancelExecution(id);
        }
        this.disposables.dispose();
    }

    async executeCommand(command: string, options: ExecuteOptions = {}): Promise<ExecutionResult> {
        const executionId = generateUuid();
        const startTime = Date.now();

        // Perform safety check
        const safetyCheck = this.safetyService.checkCommand(command);

        // If command is dangerous and confirmation is required (or safety mode requires it)
        if (safetyCheck.requiresConfirmation && !options.requireConfirmation) {
            // Upgrade to confirmation mode for dangerous commands
            options = { ...options, requireConfirmation: true };
        }

        if (options.requireConfirmation) {
            const confirmed = await this.requestConfirmation(executionId, command, safetyCheck);
            if (!confirmed) {
                return this.createCancelledResult(executionId, command, startTime);
            }
        }

        // Block dangerous commands in safe mode
        if (safetyCheck.blocked) {
            return {
                id: executionId,
                command,
                exitCode: 1,
                stdout: '',
                stderr: `Command blocked: ${safetyCheck.reason}`,
                duration: Date.now() - startTime,
                success: false,
                error: `Dangerous command blocked: ${safetyCheck.reason}`
            };
        }

        return this.doExecute(executionId, command, options);
    }

    async executeWithConfirmation(command: string, options: ExecuteOptions = {}): Promise<ExecutionResult> {
        return this.executeCommand(command, { ...options, requireConfirmation: true });
    }

    async executeBatch(commands: string[], options: ExecuteOptions = {}): Promise<ExecutionResult[]> {
        const results: ExecutionResult[] = [];

        for (const command of commands) {
            const result = await this.executeCommand(command, options);
            results.push(result);

            // Stop batch execution on failure unless explicitly configured otherwise
            if (!result.success) {
                this.logger.warn(`Batch execution stopped at command: ${command}`);
                break;
            }
        }

        return results;
    }

    cancelExecution(executionId: string): boolean {
        const execution = this.runningExecutions.get(executionId);
        if (execution) {
            execution.cancelled = true;
            execution.disposables.dispose();
            this.runningExecutions.delete(executionId);

            this.emitProgress({
                id: executionId,
                command: execution.command,
                status: 'cancelled',
                elapsedMs: Date.now() - execution.startTime
            });

            return true;
        }

        // Also check pending confirmations
        const confirmation = this.pendingConfirmations.get(executionId);
        if (confirmation) {
            confirmation.resolve(false);
            this.pendingConfirmations.delete(executionId);
            return true;
        }

        return false;
    }

    getExecutionStatus(executionId: string): ExecutionProgress | undefined {
        const execution = this.runningExecutions.get(executionId);
        if (execution) {
            return {
                id: executionId,
                command: execution.command,
                status: execution.cancelled ? 'cancelled' : 'running',
                output: execution.outputBuffer.join('\n'),
                elapsedMs: Date.now() - execution.startTime
            };
        }

        const confirmation = this.pendingConfirmations.get(executionId);
        if (confirmation) {
            return {
                id: executionId,
                command: confirmation.command,
                status: 'confirming'
            };
        }

        return undefined;
    }

    respondToConfirmation(id: string, confirmed: boolean): void {
        const confirmation = this.pendingConfirmations.get(id);
        if (confirmation) {
            confirmation.resolve(confirmed);
            this.pendingConfirmations.delete(id);
        }
    }

    protected async requestConfirmation(
        executionId: string,
        command: string,
        safetyCheck: SafetyCheckResult
    ): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            const request: ConfirmationRequest = {
                id: executionId,
                command,
                safetyCheck,
                resolve
            };

            this.pendingConfirmations.set(executionId, request);
            this.onConfirmationRequiredEmitter.fire(request);

            this.emitProgress({
                id: executionId,
                command,
                status: 'confirming'
            });
        });
    }

    protected async doExecute(
        executionId: string,
        command: string,
        options: ExecuteOptions
    ): Promise<ExecutionResult> {
        const startTime = Date.now();
        const outputBuffer: string[] = [];
        const disposables = new DisposableCollection();

        // Get or create terminal
        const terminal = options.terminal || this.terminalService.currentTerminal;
        if (!terminal || !(terminal instanceof TerminalWidgetImpl)) {
            return {
                id: executionId,
                command,
                exitCode: 1,
                stdout: '',
                stderr: 'No terminal available',
                duration: Date.now() - startTime,
                success: false,
                error: 'No terminal available for command execution'
            };
        }

        // Track execution
        this.runningExecutions.set(executionId, {
            command,
            startTime,
            outputBuffer,
            cancelled: false,
            disposables
        });

        this.emitProgress({
            id: executionId,
            command,
            status: 'running'
        });

        try {
            // Capture output if requested
            if (options.captureOutput !== false) {
                const outputListener = terminal.onOutput(data => {
                    outputBuffer.push(data);
                    this.emitProgress({
                        id: executionId,
                        command,
                        status: 'running',
                        output: outputBuffer.join(''),
                        elapsedMs: Date.now() - startTime
                    });
                });
                disposables.push(outputListener);
            }

            // Create a marker to detect when command completes
            const exitCodeMarker = `__OPENCLAUDE_EXIT_${executionId}__`;

            // Build command with exit code capture
            // This wraps the command to capture its exit code
            const wrappedCommand = `${command}; echo "${exitCodeMarker}$?"`;

            // Send the command
            terminal.sendText(wrappedCommand + '\n');

            // Wait for completion with timeout
            const result = await this.waitForCompletion(
                executionId,
                terminal,
                outputBuffer,
                exitCodeMarker,
                options.timeout || 120000 // Default 2 minute timeout
            );

            const execution = this.runningExecutions.get(executionId);
            if (execution?.cancelled) {
                return this.createCancelledResult(executionId, command, startTime);
            }

            // Parse the output to extract exit code
            const exitCode = this.parseExitCode(outputBuffer, exitCodeMarker);
            const cleanOutput = this.cleanOutput(outputBuffer, exitCodeMarker, command);

            const executionResult: ExecutionResult = {
                id: executionId,
                command,
                exitCode,
                stdout: cleanOutput,
                stderr: '', // Terminal doesn't separate stderr
                duration: Date.now() - startTime,
                success: exitCode === 0,
                timedOut: result.timedOut
            };

            this.emitProgress({
                id: executionId,
                command,
                status: result.timedOut ? 'timedOut' : (exitCode === 0 ? 'completed' : 'failed'),
                output: cleanOutput,
                elapsedMs: executionResult.duration
            });

            return executionResult;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Command execution failed: ${errorMessage}`);

            return {
                id: executionId,
                command,
                exitCode: 1,
                stdout: outputBuffer.join(''),
                stderr: errorMessage,
                duration: Date.now() - startTime,
                success: false,
                error: errorMessage
            };

        } finally {
            disposables.dispose();
            this.runningExecutions.delete(executionId);
        }
    }

    protected async waitForCompletion(
        executionId: string,
        terminal: TerminalWidgetImpl,
        outputBuffer: string[],
        exitCodeMarker: string,
        timeout: number
    ): Promise<{ completed: boolean; timedOut: boolean }> {
        return new Promise(resolve => {
            let timeoutId: NodeJS.Timeout | undefined;
            let resolved = false;

            const checkForCompletion = () => {
                const output = outputBuffer.join('');
                if (output.includes(exitCodeMarker)) {
                    if (!resolved) {
                        resolved = true;
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                        }
                        resolve({ completed: true, timedOut: false });
                    }
                }
            };

            // Check periodically for the exit code marker
            const checkInterval = setInterval(() => {
                const execution = this.runningExecutions.get(executionId);
                if (!execution || execution.cancelled) {
                    clearInterval(checkInterval);
                    if (!resolved) {
                        resolved = true;
                        resolve({ completed: false, timedOut: false });
                    }
                    return;
                }
                checkForCompletion();
            }, 100);

            // Set timeout
            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    clearInterval(checkInterval);
                    if (!resolved) {
                        resolved = true;
                        resolve({ completed: false, timedOut: true });
                    }
                }, timeout);
            }

            // Initial check
            checkForCompletion();
        });
    }

    protected parseExitCode(outputBuffer: string[], exitCodeMarker: string): number {
        const output = outputBuffer.join('');
        const markerIndex = output.lastIndexOf(exitCodeMarker);
        if (markerIndex !== -1) {
            const afterMarker = output.substring(markerIndex + exitCodeMarker.length);
            const exitCodeMatch = afterMarker.match(/^(\d+)/);
            if (exitCodeMatch) {
                return parseInt(exitCodeMatch[1], 10);
            }
        }
        return 0; // Assume success if we can't parse
    }

    protected cleanOutput(outputBuffer: string[], exitCodeMarker: string, command: string): string {
        let output = outputBuffer.join('');

        // Remove the exit code marker line
        const markerRegex = new RegExp(`${exitCodeMarker}\\d+\\r?\\n?`, 'g');
        output = output.replace(markerRegex, '');

        // Remove the echo command itself from output
        output = output.replace(new RegExp(`echo "${exitCodeMarker}\\$\\?"\\r?\\n?`, 'g'), '');

        // Remove the original command echo (first line typically shows the command)
        const lines = output.split('\n');
        if (lines[0]?.includes(command.substring(0, 20))) {
            lines.shift();
        }

        return lines.join('\n').trim();
    }

    protected createCancelledResult(executionId: string, command: string, startTime: number): ExecutionResult {
        return {
            id: executionId,
            command,
            exitCode: undefined,
            stdout: '',
            stderr: '',
            duration: Date.now() - startTime,
            success: false,
            cancelled: true
        };
    }

    protected emitProgress(progress: ExecutionProgress): void {
        this.onProgressEmitter.fire(progress);
    }
}
