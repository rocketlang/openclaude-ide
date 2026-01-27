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

import * as React from 'react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import {
    AutonomousAgentService,
    AgentTask,
    AgentTaskStatus,
    AgentAction,
    AgentThought,
    ActionStatus,
    ThoughtType
} from '../common';

@injectable()
export class AgentWidget extends ReactWidget {

    static readonly ID = 'ai-autonomous-agent-widget';
    static readonly LABEL = 'AI Agent';

    @inject(AutonomousAgentService)
    protected readonly agentService: AutonomousAgentService;

    protected tasks: AgentTask[] = [];
    protected selectedTaskId?: string;
    protected goalInput: string = '';
    protected showThoughts: boolean = true;

    @postConstruct()
    protected init(): void {
        this.id = AgentWidget.ID;
        this.title.label = AgentWidget.LABEL;
        this.title.caption = AgentWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-robot';
        this.addClass('ai-agent-widget');

        // Subscribe to updates
        this.agentService.onTaskUpdated(task => {
            this.updateTask(task);
            this.update();
        });

        this.agentService.onThought(() => {
            this.update();
        });

        this.agentService.onApprovalRequired((action, task) => {
            this.selectedTaskId = task.id;
            this.update();
        });

        // Load existing tasks
        this.tasks = this.agentService.getAllTasks();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected updateTask(task: AgentTask): void {
        const index = this.tasks.findIndex(t => t.id === task.id);
        if (index >= 0) {
            this.tasks[index] = task;
        } else {
            this.tasks.unshift(task);
        }
    }

    protected render(): React.ReactNode {
        return (
            <div className="agent-container">
                <div className="agent-header">
                    <h3>Autonomous Agent</h3>
                    <div className="agent-controls">
                        <label>
                            <input
                                type="checkbox"
                                checked={this.showThoughts}
                                onChange={e => {
                                    this.showThoughts = e.target.checked;
                                    this.update();
                                }}
                            />
                            Show Thinking
                        </label>
                    </div>
                </div>

                {this.renderTaskInput()}

                <div className="agent-content">
                    <div className="task-list">
                        <h4>Tasks</h4>
                        {this.tasks.length === 0 ? (
                            <div className="empty-state">No tasks yet</div>
                        ) : (
                            this.tasks.map(task => this.renderTaskItem(task))
                        )}
                    </div>

                    <div className="task-detail">
                        {this.selectedTaskId && this.renderTaskDetail()}
                    </div>
                </div>
            </div>
        );
    }

    protected renderTaskInput(): React.ReactNode {
        return (
            <div className="task-input">
                <input
                    type="text"
                    placeholder="Describe what you want the agent to do..."
                    value={this.goalInput}
                    onChange={e => {
                        this.goalInput = e.target.value;
                        this.update();
                    }}
                    onKeyPress={e => {
                        if (e.key === 'Enter' && this.goalInput.trim()) {
                            this.startTask();
                        }
                    }}
                />
                <button
                    className="start-button"
                    onClick={() => this.startTask()}
                    disabled={!this.goalInput.trim()}
                >
                    Start Task
                </button>
            </div>
        );
    }

    protected renderTaskItem(task: AgentTask): React.ReactNode {
        const isSelected = task.id === this.selectedTaskId;
        const statusClass = this.getStatusClass(task.status);

        return (
            <div
                key={task.id}
                className={`task-item ${isSelected ? 'selected' : ''} ${statusClass}`}
                onClick={() => {
                    this.selectedTaskId = task.id;
                    this.update();
                }}
            >
                <div className="task-status-icon">{this.getStatusIcon(task.status)}</div>
                <div className="task-info">
                    <div className="task-goal">{task.goal}</div>
                    <div className="task-meta">
                        {task.actions.length} actions
                        {task.status === AgentTaskStatus.Executing && ' - Running...'}
                    </div>
                </div>
                <div className="task-actions">
                    {this.agentService.isRunning(task.id) ? (
                        <button
                            className="icon-button"
                            onClick={e => {
                                e.stopPropagation();
                                this.agentService.pauseTask(task.id);
                            }}
                            title="Pause"
                        >
                            <i className="codicon codicon-debug-pause" />
                        </button>
                    ) : task.status === AgentTaskStatus.Paused ? (
                        <button
                            className="icon-button"
                            onClick={e => {
                                e.stopPropagation();
                                this.agentService.resumeTask(task.id);
                            }}
                            title="Resume"
                        >
                            <i className="codicon codicon-play" />
                        </button>
                    ) : null}
                    {task.status !== AgentTaskStatus.Completed &&
                     task.status !== AgentTaskStatus.Cancelled && (
                        <button
                            className="icon-button"
                            onClick={e => {
                                e.stopPropagation();
                                this.agentService.cancelTask(task.id);
                            }}
                            title="Cancel"
                        >
                            <i className="codicon codicon-close" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    protected renderTaskDetail(): React.ReactNode {
        const task = this.tasks.find(t => t.id === this.selectedTaskId);
        if (!task) {
            return <div className="empty-state">Select a task</div>;
        }

        return (
            <div className="task-detail-content">
                <div className="task-header">
                    <h4>{task.goal}</h4>
                    <span className={`status-badge ${this.getStatusClass(task.status)}`}>
                        {task.status}
                    </span>
                </div>

                {task.status === AgentTaskStatus.WaitingForApproval && this.renderApprovalRequest(task)}

                {this.showThoughts && task.thoughts.length > 0 && (
                    <div className="thoughts-section">
                        <h5>Agent Thinking</h5>
                        <div className="thoughts-list">
                            {task.thoughts.slice(-10).map(thought => this.renderThought(thought))}
                        </div>
                    </div>
                )}

                <div className="actions-section">
                    <h5>Actions ({task.actions.length})</h5>
                    <div className="actions-list">
                        {task.actions.map(action => this.renderAction(action))}
                    </div>
                </div>

                {task.result && (
                    <div className="result-section">
                        <h5>Result</h5>
                        <div className={`result-box ${task.result.success ? 'success' : 'failure'}`}>
                            <div className="result-summary">{task.result.summary}</div>
                            {task.result.filesModified.length > 0 && (
                                <div className="result-files">
                                    <strong>Modified files:</strong>
                                    <ul>
                                        {task.result.filesModified.map(f => <li key={f}>{f}</li>)}
                                    </ul>
                                </div>
                            )}
                            {task.result.nextSteps && task.result.nextSteps.length > 0 && (
                                <div className="result-next-steps">
                                    <strong>Suggested next steps:</strong>
                                    <ul>
                                        {task.result.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    protected renderApprovalRequest(task: AgentTask): React.ReactNode {
        const pendingAction = task.actions.find(
            a => a.requiresApproval && a.status === ActionStatus.Pending
        );

        if (!pendingAction) {
            return null;
        }

        return (
            <div className="approval-request">
                <div className="approval-header">
                    <i className="codicon codicon-warning" />
                    <span>Approval Required</span>
                </div>
                <div className="approval-content">
                    <p><strong>Action:</strong> {pendingAction.description}</p>
                    <p><strong>Type:</strong> {pendingAction.type}</p>
                </div>
                <div className="approval-buttons">
                    <button
                        className="approve-button"
                        onClick={() => this.agentService.approveAction(task.id, pendingAction.id)}
                    >
                        <i className="codicon codicon-check" /> Approve
                    </button>
                    <button
                        className="reject-button"
                        onClick={() => this.agentService.rejectAction(task.id, pendingAction.id)}
                    >
                        <i className="codicon codicon-x" /> Reject
                    </button>
                </div>
            </div>
        );
    }

    protected renderThought(thought: AgentThought): React.ReactNode {
        const iconClass = this.getThoughtIcon(thought.type);

        return (
            <div key={thought.id} className={`thought-item ${thought.type}`}>
                <i className={`codicon ${iconClass}`} />
                <span className="thought-content">{thought.content}</span>
            </div>
        );
    }

    protected renderAction(action: AgentAction): React.ReactNode {
        const statusIcon = this.getActionStatusIcon(action.status);

        return (
            <div key={action.id} className={`action-item ${action.status}`}>
                <div className="action-status">{statusIcon}</div>
                <div className="action-info">
                    <div className="action-type">{action.type}</div>
                    <div className="action-description">{action.description}</div>
                    {action.error && <div className="action-error">{action.error}</div>}
                    {action.duration && (
                        <div className="action-duration">{action.duration}ms</div>
                    )}
                </div>
            </div>
        );
    }

    protected async startTask(): Promise<void> {
        if (!this.goalInput.trim()) {
            return;
        }

        const task = await this.agentService.startTask(this.goalInput.trim());
        this.selectedTaskId = task.id;
        this.goalInput = '';
        this.update();
    }

    protected getStatusIcon(status: AgentTaskStatus): string {
        switch (status) {
            case AgentTaskStatus.Pending: return '○';
            case AgentTaskStatus.Planning: return '◐';
            case AgentTaskStatus.Executing: return '◑';
            case AgentTaskStatus.WaitingForApproval: return '⚠';
            case AgentTaskStatus.WaitingForInput: return '?';
            case AgentTaskStatus.Paused: return '⏸';
            case AgentTaskStatus.Completed: return '✓';
            case AgentTaskStatus.Failed: return '✗';
            case AgentTaskStatus.Cancelled: return '⊘';
            default: return '○';
        }
    }

    protected getStatusClass(status: AgentTaskStatus): string {
        switch (status) {
            case AgentTaskStatus.Completed: return 'status-success';
            case AgentTaskStatus.Failed: return 'status-error';
            case AgentTaskStatus.Cancelled: return 'status-cancelled';
            case AgentTaskStatus.Executing:
            case AgentTaskStatus.Planning: return 'status-running';
            case AgentTaskStatus.WaitingForApproval:
            case AgentTaskStatus.WaitingForInput: return 'status-waiting';
            case AgentTaskStatus.Paused: return 'status-paused';
            default: return 'status-pending';
        }
    }

    protected getThoughtIcon(type: ThoughtType): string {
        switch (type) {
            case ThoughtType.Planning: return 'codicon-compass';
            case ThoughtType.Reasoning: return 'codicon-lightbulb';
            case ThoughtType.Analysis: return 'codicon-search';
            case ThoughtType.Decision: return 'codicon-check';
            case ThoughtType.Observation: return 'codicon-eye';
            case ThoughtType.Reflection: return 'codicon-mirror';
            case ThoughtType.Error: return 'codicon-error';
            default: return 'codicon-comment';
        }
    }

    protected getActionStatusIcon(status: ActionStatus): string {
        switch (status) {
            case ActionStatus.Pending: return '○';
            case ActionStatus.Running: return '◐';
            case ActionStatus.Completed: return '✓';
            case ActionStatus.Failed: return '✗';
            case ActionStatus.Skipped: return '⊘';
            case ActionStatus.Cancelled: return '⊘';
            default: return '○';
        }
    }
}
