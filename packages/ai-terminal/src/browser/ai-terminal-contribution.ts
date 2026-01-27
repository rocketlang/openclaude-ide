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

import { ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core';
import { ApplicationShell, codicon, KeybindingContribution, KeybindingRegistry, ConfirmDialog } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalMenus } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { AiTerminalAgent, ExecutionMode } from './ai-terminal-agent';
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser/ai-command-handler-factory';
import { AgentService } from '@theia/ai-core';
import { nls } from '@theia/core/lib/common/nls';
import { TerminalExecutor, ConfirmationRequest } from './terminal-executor';
import { TerminalSessionManager } from './terminal-session-manager';
import { RiskLevel } from './terminal-safety-service';

const AI_TERMINAL_COMMAND = Command.toLocalizedCommand({
    id: 'ai-terminal:open',
    label: 'Ask AI',
    iconClass: codicon('sparkle')
}, 'theia/ai/terminal/askAi');

const AI_TERMINAL_EXECUTE_COMMAND = Command.toLocalizedCommand({
    id: 'ai-terminal:execute',
    label: 'Ask AI & Execute',
    iconClass: codicon('play')
}, 'theia/ai/terminal/askAiExecute');

const AI_TERMINAL_TASK_COMMAND = Command.toLocalizedCommand({
    id: 'ai-terminal:task',
    label: 'AI Terminal Task',
    iconClass: codicon('tasklist')
}, 'theia/ai/terminal/aiTask');

const AI_TERMINAL_TOGGLE_MODE = Command.toLocalizedCommand({
    id: 'ai-terminal:toggle-mode',
    label: 'Toggle AI Execution Mode',
    iconClass: codicon('settings-gear')
}, 'theia/ai/terminal/toggleMode');

@injectable()
export class AiTerminalCommandContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(TerminalService)
    protected terminalService: TerminalService;

    @inject(AiTerminalAgent)
    protected terminalAgent: AiTerminalAgent;

    @inject(AICommandHandlerFactory)
    protected commandHandlerFactory: AICommandHandlerFactory;

    @inject(AgentService)
    private readonly agentService: AgentService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(TerminalExecutor)
    protected terminalExecutor: TerminalExecutor;

    @inject(TerminalSessionManager)
    protected sessionManager: TerminalSessionManager;

    @postConstruct()
    protected init(): void {
        // Handle confirmation requests from executor
        this.terminalExecutor.onConfirmationRequired(request => {
            this.handleConfirmationRequest(request);
        });
    }

    protected async handleConfirmationRequest(request: ConfirmationRequest): Promise<void> {
        const riskEmoji = this.getRiskEmoji(request.safetyCheck.riskLevel as RiskLevel);
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/terminal/confirmExecution', 'Confirm Command Execution'),
            msg: `${riskEmoji} ${request.safetyCheck.reason || 'This command requires confirmation.'}\n\nCommand: ${request.command}`,
            ok: nls.localizeByDefault('Execute'),
            cancel: nls.localizeByDefault('Cancel')
        });
        const confirmed = await dialog.open();
        this.terminalExecutor.respondToConfirmation(request.id, !!confirmed);
    }

    protected getRiskEmoji(riskLevel: RiskLevel): string {
        switch (riskLevel) {
            case RiskLevel.CRITICAL: return '\u26A0\uFE0F'; // warning
            case RiskLevel.HIGH: return '\u26A0\uFE0F';
            case RiskLevel.MEDIUM: return '\u2139\uFE0F'; // info
            case RiskLevel.LOW: return '\u2139\uFE0F';
            default: return '';
        }
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: AI_TERMINAL_COMMAND.id,
            keybinding: 'ctrlcmd+i',
            when: `terminalFocus && ${ENABLE_AI_CONTEXT_KEY}`
        });
        keybindings.registerKeybinding({
            command: AI_TERMINAL_EXECUTE_COMMAND.id,
            keybinding: 'ctrlcmd+shift+i',
            when: `terminalFocus && ${ENABLE_AI_CONTEXT_KEY}`
        });
        keybindings.registerKeybinding({
            command: AI_TERMINAL_TASK_COMMAND.id,
            keybinding: 'ctrlcmd+shift+t',
            when: `terminalFocus && ${ENABLE_AI_CONTEXT_KEY}`
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...TerminalMenus.TERMINAL_CONTEXT_MENU, '_5'], {
            when: ENABLE_AI_CONTEXT_KEY,
            commandId: AI_TERMINAL_COMMAND.id,
            icon: AI_TERMINAL_COMMAND.iconClass,
            label: nls.localize('theia/ai/terminal/askAi', 'Ask AI')
        });
        menus.registerMenuAction([...TerminalMenus.TERMINAL_CONTEXT_MENU, '_5'], {
            when: ENABLE_AI_CONTEXT_KEY,
            commandId: AI_TERMINAL_EXECUTE_COMMAND.id,
            icon: AI_TERMINAL_EXECUTE_COMMAND.iconClass,
            label: nls.localize('theia/ai/terminal/askAiExecute', 'Ask AI & Execute')
        });
        menus.registerMenuAction([...TerminalMenus.TERMINAL_CONTEXT_MENU, '_5'], {
            when: ENABLE_AI_CONTEXT_KEY,
            commandId: AI_TERMINAL_TASK_COMMAND.id,
            icon: AI_TERMINAL_TASK_COMMAND.iconClass,
            label: nls.localize('theia/ai/terminal/aiTask', 'AI Terminal Task')
        });
    }
    registerCommands(commands: CommandRegistry): void {
        // Standard ask AI (suggest mode)
        commands.registerCommand(AI_TERMINAL_COMMAND, this.commandHandlerFactory({
            execute: () => {
                const currentTerminal = this.terminalService.currentTerminal;
                if (currentTerminal instanceof TerminalWidgetImpl && currentTerminal.kind === 'user') {
                    new AiTerminalChatWidget(
                        currentTerminal,
                        this.terminalAgent,
                        this.sessionManager,
                        this.terminalExecutor,
                        false // suggest mode
                    );
                }
            },
            isEnabled: () =>
                this.agentService.isEnabled(this.terminalAgent.id)
                && this.shell.currentWidget instanceof TerminalWidgetImpl
                && (this.shell.currentWidget as TerminalWidgetImpl).kind === 'user'
        }));

        // Ask AI and execute
        commands.registerCommand(AI_TERMINAL_EXECUTE_COMMAND, this.commandHandlerFactory({
            execute: () => {
                const currentTerminal = this.terminalService.currentTerminal;
                if (currentTerminal instanceof TerminalWidgetImpl && currentTerminal.kind === 'user') {
                    new AiTerminalChatWidget(
                        currentTerminal,
                        this.terminalAgent,
                        this.sessionManager,
                        this.terminalExecutor,
                        true // execute mode
                    );
                }
            },
            isEnabled: () =>
                this.agentService.isEnabled(this.terminalAgent.id)
                && this.shell.currentWidget instanceof TerminalWidgetImpl
                && (this.shell.currentWidget as TerminalWidgetImpl).kind === 'user'
        }));

        // AI Terminal Task (multi-step)
        commands.registerCommand(AI_TERMINAL_TASK_COMMAND, this.commandHandlerFactory({
            execute: async () => {
                const currentTerminal = this.terminalService.currentTerminal;
                if (currentTerminal instanceof TerminalWidgetImpl && currentTerminal.kind === 'user') {
                    new AiTerminalTaskWidget(
                        currentTerminal,
                        this.terminalAgent,
                        this.sessionManager
                    );
                }
            },
            isEnabled: () =>
                this.agentService.isEnabled(this.terminalAgent.id)
                && this.shell.currentWidget instanceof TerminalWidgetImpl
                && (this.shell.currentWidget as TerminalWidgetImpl).kind === 'user'
        }));

        // Toggle execution mode
        commands.registerCommand(AI_TERMINAL_TOGGLE_MODE, this.commandHandlerFactory({
            execute: () => {
                const modes = [ExecutionMode.SUGGEST, ExecutionMode.CONFIRM, ExecutionMode.AUTO];
                const currentMode = this.terminalAgent.getExecutionMode();
                const currentIndex = modes.indexOf(currentMode);
                const nextMode = modes[(currentIndex + 1) % modes.length];
                this.terminalAgent.setExecutionMode(nextMode);
            },
            isEnabled: () => this.agentService.isEnabled(this.terminalAgent.id)
        }));
    }
}

class AiTerminalChatWidget {

    protected chatContainer: HTMLDivElement;
    protected chatInput: HTMLTextAreaElement;
    protected chatResultParagraph: HTMLParagraphElement;
    protected chatInputContainer: HTMLDivElement;
    protected statusIndicator: HTMLSpanElement;

    protected haveResult = false;
    protected isExecuting = false;
    protected userRequest = '';
    commands: string[];

    constructor(
        protected terminalWidget: TerminalWidgetImpl,
        protected terminalAgent: AiTerminalAgent,
        protected sessionManager: TerminalSessionManager,
        protected terminalExecutor: TerminalExecutor,
        protected executeMode = false
    ) {
        this.chatContainer = document.createElement('div');
        this.chatContainer.className = 'ai-terminal-chat-container';

        // Header with mode indicator and close button
        const headerContainer = document.createElement('div');
        headerContainer.className = 'ai-terminal-chat-header';

        this.statusIndicator = document.createElement('span');
        this.statusIndicator.className = 'ai-terminal-mode-indicator';
        this.statusIndicator.textContent = executeMode
            ? nls.localize('theia/ai/terminal/executeMode', 'Execute Mode')
            : nls.localize('theia/ai/terminal/suggestMode', 'Suggest Mode');
        headerContainer.appendChild(this.statusIndicator);

        const chatCloseButton = document.createElement('span');
        chatCloseButton.className = 'closeButton codicon codicon-close';
        chatCloseButton.onclick = () => this.dispose();
        headerContainer.appendChild(chatCloseButton);

        this.chatContainer.appendChild(headerContainer);

        const chatResultContainer = document.createElement('div');
        chatResultContainer.className = 'ai-terminal-chat-result';
        this.chatResultParagraph = document.createElement('p');
        this.chatResultParagraph.textContent = nls.localize('theia/ai/terminal/howCanIHelp', 'How can I help you?');
        chatResultContainer.appendChild(this.chatResultParagraph);
        this.chatContainer.appendChild(chatResultContainer);

        this.chatInputContainer = document.createElement('div');
        this.chatInputContainer.className = 'ai-terminal-chat-input-container';

        this.chatInput = document.createElement('textarea');
        this.chatInput.className = 'theia-input theia-ChatInput';
        this.chatInput.placeholder = nls.localize('theia/ai/terminal/askTerminalCommand', 'Ask about a terminal command...');
        this.chatInput.onkeydown = event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (this.isExecuting) {
                    return;
                }
                if (!this.haveResult) {
                    this.send();
                } else {
                    this.confirmCommand();
                }
            } else if (event.key === 'Escape') {
                this.dispose();
            } else if (event.key === 'ArrowUp' && this.haveResult && !this.isExecuting) {
                this.updateChatResult(this.getNextCommandIndex(1));
            } else if (event.key === 'ArrowDown' && this.haveResult && !this.isExecuting) {
                this.updateChatResult(this.getNextCommandIndex(-1));
            }
        };
        this.chatInputContainer.appendChild(this.chatInput);

        const chatInputOptionsContainer = document.createElement('div');
        chatInputOptionsContainer.className = 'ai-terminal-chat-options';

        const sendButton = document.createElement('span');
        sendButton.className = 'codicon codicon-send option';
        sendButton.title = nls.localizeByDefault('Send');
        sendButton.onclick = () => this.send();
        chatInputOptionsContainer.appendChild(sendButton);

        if (executeMode) {
            const executeButton = document.createElement('span');
            executeButton.className = 'codicon codicon-play option';
            executeButton.title = nls.localize('theia/ai/terminal/execute', 'Execute');
            executeButton.onclick = () => this.confirmCommand();
            chatInputOptionsContainer.appendChild(executeButton);
        }

        this.chatInputContainer.appendChild(chatInputOptionsContainer);
        this.chatContainer.appendChild(this.chatInputContainer);

        terminalWidget.node.appendChild(this.chatContainer);
        this.chatInput.focus();
    }

    protected async send(): Promise<void> {
        this.userRequest = this.chatInput.value;
        if (this.userRequest) {
            this.chatInput.value = '';

            this.chatResultParagraph.innerText = nls.localize('theia/ai/terminal/loading', 'Loading');
            this.chatResultParagraph.className = 'loading';

            const cwd = (await this.terminalWidget.cwd).toString();
            const processInfo = await this.terminalWidget.processInfo;
            const shell = processInfo.executable;
            const recentTerminalContents = this.getRecentTerminalCommands();

            this.commands = await this.terminalAgent.getCommands(this.userRequest, cwd, shell, recentTerminalContents);

            if (this.commands.length > 0) {
                this.chatResultParagraph.className = 'command';
                this.chatResultParagraph.innerText = this.commands[0];

                if (this.executeMode) {
                    this.chatInput.placeholder = nls.localize('theia/ai/terminal/hitEnterExecute', 'Hit enter to execute');
                } else {
                    this.chatInput.placeholder = nls.localize('theia/ai/terminal/hitEnterConfirm', 'Hit enter to confirm');
                }

                if (this.commands.length > 1) {
                    this.chatInput.placeholder += nls.localize('theia/ai/terminal/useArrowsAlternatives', ' or use arrows to show alternatives...');
                }
                this.haveResult = true;

                // Record in session
                const session = this.sessionManager.getOrCreateSession(this.terminalWidget.id);
                this.sessionManager.addTurn(session.id, {
                    userRequest: this.userRequest,
                    commands: this.commands,
                    cwd
                });
            } else {
                this.chatResultParagraph.className = '';
                this.chatResultParagraph.innerText = nls.localizeByDefault('No results');
                this.chatInput.placeholder = nls.localize('theia/ai/terminal/tryAgain', 'Try again...');
            }
        }
    }

    protected async confirmCommand(): Promise<void> {
        if (!this.haveResult || this.isExecuting) {
            return;
        }

        const command = this.chatResultParagraph.innerText;

        if (this.executeMode) {
            // Execute the command
            this.isExecuting = true;
            this.statusIndicator.textContent = nls.localize('theia/ai/terminal/executing', 'Executing...');
            this.chatResultParagraph.className = 'executing';

            try {
                const result = await this.terminalAgent.executeCommand(
                    command,
                    this.terminalWidget
                );

                if (result.success) {
                    this.statusIndicator.textContent = nls.localize('theia/ai/terminal/success', 'Success');
                    this.chatResultParagraph.className = 'success';
                } else {
                    this.statusIndicator.textContent = nls.localize('theia/ai/terminal/failed', 'Failed');
                    this.chatResultParagraph.className = 'failed';

                    // Offer auto-retry
                    const cwd = (await this.terminalWidget.cwd).toString();
                    const processInfo = await this.terminalWidget.processInfo;
                    const shell = processInfo.executable;
                    const recentTerminalContents = this.getRecentTerminalCommands();

                    const retryResult = await this.terminalAgent.executeWithAutoRetry(
                        this.userRequest,
                        command,
                        this.terminalWidget,
                        cwd,
                        shell,
                        recentTerminalContents
                    );

                    if (retryResult.success) {
                        this.statusIndicator.textContent = nls.localize('theia/ai/terminal/retrySuccess', 'Retry succeeded');
                        this.chatResultParagraph.className = 'success';
                    }
                }

                // Close after a brief delay to show status
                setTimeout(() => this.dispose(), 1500);
            } catch (error) {
                this.statusIndicator.textContent = nls.localize('theia/ai/terminal/error', 'Error');
                this.chatResultParagraph.className = 'error';
                this.isExecuting = false;
            }
        } else {
            // Just paste the command (original behavior)
            this.terminalWidget.sendText(command);
            this.dispose();
        }
    }

    protected getRecentTerminalCommands(): string[] {
        const maxLines = 100;
        return this.terminalWidget.buffer.getLines(0,
            this.terminalWidget.buffer.length > maxLines ? maxLines : this.terminalWidget.buffer.length
        );
    }

    protected getNextCommandIndex(step: number): number {
        const currentIndex = this.commands.indexOf(this.chatResultParagraph.innerText);
        const nextIndex = (currentIndex + step + this.commands.length) % this.commands.length;
        return nextIndex;
    }

    protected updateChatResult(index: number): void {
        this.chatResultParagraph.innerText = this.commands[index];
    }

    protected dispose(): void {
        this.chatInput.value = '';
        this.terminalWidget.node.removeChild(this.chatContainer);
        this.terminalWidget.getTerminal().focus();
    }
}

/**
 * Widget for executing multi-step AI tasks
 */
class AiTerminalTaskWidget {

    protected taskContainer: HTMLDivElement;
    protected taskInput: HTMLTextAreaElement;
    protected taskStatusContainer: HTMLDivElement;
    protected stepsContainer: HTMLDivElement;

    protected isExecuting = false;

    constructor(
        protected terminalWidget: TerminalWidgetImpl,
        protected terminalAgent: AiTerminalAgent,
        protected sessionManager: TerminalSessionManager
    ) {
        this.taskContainer = document.createElement('div');
        this.taskContainer.className = 'ai-terminal-task-container';

        // Header
        const headerContainer = document.createElement('div');
        headerContainer.className = 'ai-terminal-task-header';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'ai-terminal-task-title';
        titleSpan.textContent = nls.localize('theia/ai/terminal/aiTask', 'AI Terminal Task');
        headerContainer.appendChild(titleSpan);

        const closeButton = document.createElement('span');
        closeButton.className = 'closeButton codicon codicon-close';
        closeButton.onclick = () => this.dispose();
        headerContainer.appendChild(closeButton);

        this.taskContainer.appendChild(headerContainer);

        // Status area
        this.taskStatusContainer = document.createElement('div');
        this.taskStatusContainer.className = 'ai-terminal-task-status';
        this.taskStatusContainer.textContent = nls.localize('theia/ai/terminal/describeTask', 'Describe your task and I will break it down into steps');
        this.taskContainer.appendChild(this.taskStatusContainer);

        // Steps area
        this.stepsContainer = document.createElement('div');
        this.stepsContainer.className = 'ai-terminal-task-steps';
        this.taskContainer.appendChild(this.stepsContainer);

        // Input area
        const inputContainer = document.createElement('div');
        inputContainer.className = 'ai-terminal-task-input-container';

        this.taskInput = document.createElement('textarea');
        this.taskInput.className = 'theia-input theia-ChatInput';
        this.taskInput.placeholder = nls.localize('theia/ai/terminal/describeTaskPlaceholder', 'E.g., "Set up a new React project with TypeScript"');
        this.taskInput.onkeydown = event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!this.isExecuting) {
                    this.executeTask();
                }
            } else if (event.key === 'Escape') {
                this.dispose();
            }
        };
        inputContainer.appendChild(this.taskInput);

        const runButton = document.createElement('button');
        runButton.className = 'theia-button ai-terminal-task-run';
        runButton.textContent = nls.localize('theia/ai/terminal/runTask', 'Run Task');
        runButton.onclick = () => this.executeTask();
        inputContainer.appendChild(runButton);

        this.taskContainer.appendChild(inputContainer);

        terminalWidget.node.appendChild(this.taskContainer);
        this.taskInput.focus();

        // Subscribe to task progress
        this.terminalAgent.onTaskProgress(progress => {
            this.updateProgress(progress);
        });
    }

    protected async executeTask(): Promise<void> {
        const taskDescription = this.taskInput.value;
        if (!taskDescription || this.isExecuting) {
            return;
        }

        this.isExecuting = true;
        this.taskInput.disabled = true;
        this.stepsContainer.innerHTML = '';

        this.taskStatusContainer.textContent = nls.localize('theia/ai/terminal/planningTask', 'Planning task...');

        try {
            const cwd = (await this.terminalWidget.cwd).toString();
            const processInfo = await this.terminalWidget.processInfo;
            const shell = processInfo.executable;
            const recentTerminalContents = this.getRecentTerminalCommands();

            const result = await this.terminalAgent.executeTask(
                taskDescription,
                this.terminalWidget,
                cwd,
                shell,
                recentTerminalContents
            );

            // Show final result
            if (result.success) {
                this.taskStatusContainer.textContent = nls.localize(
                    'theia/ai/terminal/taskComplete',
                    'Task completed successfully ({0} steps, {1}ms)',
                    result.steps.length,
                    result.totalDuration
                );
                this.taskStatusContainer.className = 'ai-terminal-task-status success';
            } else {
                this.taskStatusContainer.textContent = nls.localize(
                    'theia/ai/terminal/taskFailed',
                    'Task failed after {0} steps',
                    result.steps.length
                );
                this.taskStatusContainer.className = 'ai-terminal-task-status failed';
            }

            // Record in session
            const session = this.sessionManager.getOrCreateSession(this.terminalWidget.id);
            this.sessionManager.addTurn(session.id, {
                userRequest: taskDescription,
                commands: result.steps.map(s => s.command),
                results: result.steps.map(s => s.result),
                cwd
            });

        } catch (error) {
            this.taskStatusContainer.textContent = nls.localize('theia/ai/terminal/taskError', 'Error: {0}', String(error));
            this.taskStatusContainer.className = 'ai-terminal-task-status error';
        }

        this.isExecuting = false;
        this.taskInput.disabled = false;
    }

    protected updateProgress(progress: { currentStep: number; totalSteps: number; stepDescription: string; command: string }): void {
        this.taskStatusContainer.textContent = nls.localize(
            'theia/ai/terminal/executingStep',
            'Step {0}/{1}: {2}',
            progress.currentStep + 1,
            progress.totalSteps,
            progress.stepDescription
        );

        // Add or update step in UI
        let stepElement = this.stepsContainer.querySelector(`[data-step="${progress.currentStep}"]`);
        if (!stepElement) {
            stepElement = document.createElement('div');
            stepElement.className = 'ai-terminal-task-step';
            stepElement.setAttribute('data-step', String(progress.currentStep));
            this.stepsContainer.appendChild(stepElement);
        }

        stepElement.innerHTML = `
            <span class="step-number">${progress.currentStep + 1}.</span>
            <span class="step-description">${progress.stepDescription}</span>
            <code class="step-command">${progress.command}</code>
            <span class="step-status codicon codicon-loading codicon-modifier-spin"></span>
        `;
    }

    protected getRecentTerminalCommands(): string[] {
        const maxLines = 100;
        return this.terminalWidget.buffer.getLines(0,
            this.terminalWidget.buffer.length > maxLines ? maxLines : this.terminalWidget.buffer.length
        );
    }

    protected dispose(): void {
        this.terminalWidget.node.removeChild(this.taskContainer);
        this.terminalWidget.getTerminal().focus();
    }
}
