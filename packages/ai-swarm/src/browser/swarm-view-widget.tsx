// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/lib/browser/widgets/widget';
import * as React from '@theia/core/shared/react';
import { SwarmFrontendService } from './swarm-frontend-service';
import {
    SwarmSession,
    SwarmTask,
    SubAgentInstance,
    SwarmMetrics
} from '../common/swarm-protocol';

export const SWARM_VIEW_WIDGET_ID = 'swarm-view-widget';
export const SWARM_VIEW_WIDGET_LABEL = 'AI Swarm';

interface ActivityLogEntry {
    id: string;
    timestamp: number;
    type: 'task' | 'agent' | 'system' | 'message';
    message: string;
    details?: string;
    level: 'info' | 'success' | 'warning' | 'error';
}

@injectable()
export class SwarmViewWidget extends ReactWidget {

    static readonly ID = SWARM_VIEW_WIDGET_ID;
    static readonly LABEL = SWARM_VIEW_WIDGET_LABEL;

    @inject(SwarmFrontendService)
    protected readonly swarmService: SwarmFrontendService;

    protected sessions: SwarmSession[] = [];
    protected selectedSessionId: string | undefined;
    protected tasks: SwarmTask[] = [];
    protected agents: SubAgentInstance[] = [];
    protected activityLog: ActivityLogEntry[] = [];
    protected showActivityPanel: boolean = true;
    protected refreshInterval: NodeJS.Timeout | undefined;

    @postConstruct()
    protected init(): void {
        this.id = SWARM_VIEW_WIDGET_ID;
        this.title.label = SWARM_VIEW_WIDGET_LABEL;
        this.title.caption = SWARM_VIEW_WIDGET_LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-network-wired';

        this.addClass('theia-swarm-view');

        // Subscribe to events
        this.swarmService.onSessionCreatedEvent(session => {
            this.sessions = [...this.sessions, session];
            this.update();
        });

        this.swarmService.onSessionUpdatedEvent(session => {
            this.sessions = this.sessions.map(s => s.id === session.id ? session : s);
            this.update();
        });

        this.swarmService.onSessionDeletedEvent(sessionId => {
            this.sessions = this.sessions.filter(s => s.id !== sessionId);
            if (this.selectedSessionId === sessionId) {
                this.selectedSessionId = undefined;
                this.tasks = [];
                this.agents = [];
            }
            this.update();
        });

        this.swarmService.onTaskCreatedEvent(event => {
            if (event.sessionId === this.selectedSessionId) {
                this.tasks = [...this.tasks, event.task];
                this.addActivityEntry({
                    type: 'task',
                    message: `Task created: ${event.task.title}`,
                    details: `Type: ${event.task.type}, Priority: ${event.task.priority}`,
                    level: 'info'
                });
                this.update();
            }
        });

        this.swarmService.onTaskUpdatedEvent(event => {
            if (event.sessionId === this.selectedSessionId) {
                const oldTask = this.tasks.find(t => t.id === event.task.id);
                this.tasks = this.tasks.map(t => t.id === event.task.id ? event.task : t);

                // Log status changes
                if (oldTask && oldTask.column !== event.task.column) {
                    const level = event.task.column === 'done' ? 'success' :
                                  event.task.column === 'failed' ? 'error' : 'info';
                    this.addActivityEntry({
                        type: 'task',
                        message: `Task ${event.task.title}: ${oldTask.column} -> ${event.task.column}`,
                        level
                    });
                }
                this.update();
            }
        });

        this.swarmService.onAgentSpawnedEvent(event => {
            if (event.sessionId === this.selectedSessionId) {
                this.agents = [...this.agents, event.agent];
                this.addActivityEntry({
                    type: 'agent',
                    message: `Agent spawned: ${event.agent.role}`,
                    details: `ID: ${event.agent.id.slice(0, 8)}`,
                    level: 'info'
                });
                this.update();
            }
        });

        this.swarmService.onAgentUpdatedEvent(event => {
            if (event.sessionId === this.selectedSessionId) {
                const oldAgent = this.agents.find(a => a.id === event.agent.id);
                this.agents = this.agents.map(a => a.id === event.agent.id ? event.agent : a);

                // Log status changes
                if (oldAgent && oldAgent.status !== event.agent.status) {
                    this.addActivityEntry({
                        type: 'agent',
                        message: `Agent ${event.agent.role}: ${event.agent.status}`,
                        level: event.agent.status === 'failed' ? 'error' : 'info'
                    });
                }
                this.update();
            }
        });

        this.swarmService.onAgentTerminatedEvent(event => {
            if (event.sessionId === this.selectedSessionId) {
                const agent = this.agents.find(a => a.id === event.agentId);
                this.agents = this.agents.filter(a => a.id !== event.agentId);
                this.addActivityEntry({
                    type: 'agent',
                    message: `Agent terminated: ${agent?.role || event.agentId.slice(0, 8)}`,
                    level: 'warning'
                });
                this.update();
            }
        });

        this.loadSessions();
    }

    protected async loadSessions(): Promise<void> {
        this.sessions = await this.swarmService.getSessions();
        this.update();
    }

    protected async selectSession(sessionId: string): Promise<void> {
        this.selectedSessionId = sessionId;
        this.tasks = await this.swarmService.getTasks(sessionId);
        this.agents = await this.swarmService.getSubAgents(sessionId);
        this.activityLog = [];
        this.addActivityEntry({
            type: 'system',
            message: 'Session selected',
            level: 'info'
        });
        this.update();
    }

    protected addActivityEntry(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): void {
        const newEntry: ActivityLogEntry = {
            id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            timestamp: Date.now(),
            ...entry
        };
        this.activityLog = [newEntry, ...this.activityLog].slice(0, 100); // Keep last 100 entries
    }

    protected formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    protected formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
        return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
    }

    protected formatTokens(tokens: number): string {
        if (tokens < 1000) return tokens.toString();
        if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
        return `${(tokens / 1000000).toFixed(2)}M`;
    }

    protected calculateCost(metrics: SwarmMetrics): string {
        // Use totalCost from metrics if available, otherwise estimate
        if (metrics.totalCost > 0) {
            return `$${metrics.totalCost.toFixed(4)}`;
        }
        // Rough estimate: $3/1M input tokens, $15/1M output tokens (Claude Sonnet pricing)
        const inputCost = (metrics.totalTokensUsed * 0.6) / 1000000 * 3; // Assume 60% input
        const outputCost = (metrics.totalTokensUsed * 0.4) / 1000000 * 15; // Assume 40% output
        const totalCost = inputCost + outputCost;
        return `$${totalCost.toFixed(4)}`;
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        return (
            <div className="swarm-view-container">
                <div className="swarm-view-header">
                    <h3>AI Swarm Orchestration</h3>
                </div>
                <div className="swarm-view-content">
                    {this.renderSessionList()}
                    {this.selectedSessionId && this.renderSessionDetails()}
                </div>
            </div>
        );
    }

    protected renderSessionList(): React.ReactNode {
        return (
            <div className="swarm-sessions-panel">
                <div className="panel-header">
                    <span>Sessions</span>
                    <button
                        className="theia-button"
                        onClick={() => this.createNewSession()}
                    >
                        + New
                    </button>
                </div>
                <div className="sessions-list">
                    {this.sessions.length === 0 ? (
                        <div className="empty-state">No active swarm sessions</div>
                    ) : (
                        this.sessions.map(session => this.renderSessionItem(session))
                    )}
                </div>
            </div>
        );
    }

    protected renderSessionItem(session: SwarmSession): React.ReactNode {
        const isSelected = session.id === this.selectedSessionId;
        return (
            <div
                key={session.id}
                className={`session-item ${isSelected ? 'selected' : ''}`}
                onClick={() => this.selectSession(session.id)}
            >
                <div className="session-name">{session.name}</div>
                <div className="session-status">
                    <span className={`status-badge ${session.status}`}>
                        {session.status}
                    </span>
                </div>
                <div className="session-metrics">
                    <span>{session.metrics.tasksCompleted} / {Object.keys(session.taskBoard.tasks).length} tasks</span>
                    <span>{Object.keys(session.subAgents).length} agents</span>
                </div>
            </div>
        );
    }

    protected renderSessionDetails(): React.ReactNode {
        const session = this.sessions.find(s => s.id === this.selectedSessionId);
        if (!session) {
            return null;
        }

        return (
            <div className="swarm-details-panel">
                <div className="session-controls">
                    <h4>{session.name}</h4>
                    <div className="control-buttons">
                        {this.renderControlButtons(session)}
                    </div>
                </div>

                {this.renderProgressOverview(session)}

                <div className="details-tabs">
                    <div className="tab-content">
                        <div className="details-section">
                            <h5>Task Board</h5>
                            {this.renderTaskBoard()}
                        </div>

                        <div className="details-row">
                            <div className="details-section flex-1">
                                <h5>Agents</h5>
                                {this.renderAgentsList()}
                            </div>

                            <div className="details-section flex-1">
                                <h5>
                                    Activity
                                    <button
                                        className="toggle-btn"
                                        onClick={() => {
                                            this.showActivityPanel = !this.showActivityPanel;
                                            this.update();
                                        }}
                                    >
                                        {this.showActivityPanel ? 'Hide' : 'Show'}
                                    </button>
                                </h5>
                                {this.showActivityPanel && this.renderActivityTimeline()}
                            </div>
                        </div>

                        {this.renderMetricsPanel(session)}
                    </div>
                </div>
            </div>
        );
    }

    protected renderProgressOverview(session: SwarmSession): React.ReactNode {
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(t => t.column === 'done').length;
        const failedTasks = this.tasks.filter(t => t.column === 'failed').length;
        const inProgressTasks = this.tasks.filter(t => t.column === 'in_progress').length;
        const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        const startTime = session.metrics.startTime ?? Date.now();
        const duration = session.metrics.endTime
            ? session.metrics.endTime - startTime
            : Date.now() - startTime;

        return (
            <div className="progress-overview">
                <div className="progress-bar-container">
                    <div className="progress-bar">
                        <div
                            className="progress-fill success"
                            style={{ width: `${(completedTasks / Math.max(totalTasks, 1)) * 100}%` }}
                        />
                        <div
                            className="progress-fill error"
                            style={{ width: `${(failedTasks / Math.max(totalTasks, 1)) * 100}%` }}
                        />
                        <div
                            className="progress-fill active"
                            style={{ width: `${(inProgressTasks / Math.max(totalTasks, 1)) * 100}%` }}
                        />
                    </div>
                    <span className="progress-text">{progress.toFixed(0)}%</span>
                </div>

                <div className="progress-stats">
                    <div className="stat">
                        <span className="stat-value">{completedTasks}</span>
                        <span className="stat-label">Done</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">{inProgressTasks}</span>
                        <span className="stat-label">In Progress</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">{failedTasks}</span>
                        <span className="stat-label">Failed</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">{this.formatDuration(duration)}</span>
                        <span className="stat-label">Duration</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">{this.agents.filter(a => a.status === 'working').length}</span>
                        <span className="stat-label">Active Agents</span>
                    </div>
                </div>
            </div>
        );
    }

    protected renderActivityTimeline(): React.ReactNode {
        if (this.activityLog.length === 0) {
            return <div className="empty-state">No activity yet</div>;
        }

        return (
            <div className="activity-timeline">
                {this.activityLog.slice(0, 20).map(entry => (
                    <div key={entry.id} className={`activity-entry ${entry.level}`}>
                        <span className="activity-time">{this.formatTimestamp(entry.timestamp)}</span>
                        <span className={`activity-icon ${entry.type}`}>
                            {entry.type === 'task' && ''}
                            {entry.type === 'agent' && ''}
                            {entry.type === 'system' && ''}
                            {entry.type === 'message' && ''}
                        </span>
                        <div className="activity-content">
                            <span className="activity-message">{entry.message}</span>
                            {entry.details && (
                                <span className="activity-details">{entry.details}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    protected renderMetricsPanel(session: SwarmSession): React.ReactNode {
        const metrics = session.metrics;
        const duration = metrics.duration ?? (metrics.endTime && metrics.startTime
            ? metrics.endTime - metrics.startTime
            : 0);

        return (
            <div className="metrics-panel">
                <h5>Metrics & Cost</h5>
                <div className="metrics-grid">
                    <div className="metric-card">
                        <div className="metric-value">{this.formatTokens(metrics.totalTokensUsed)}</div>
                        <div className="metric-label">Total Tokens</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-value">{this.calculateCost(metrics)}</div>
                        <div className="metric-label">Est. Cost</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-value">{metrics.tasksCompleted}</div>
                        <div className="metric-label">Tasks Done</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-value">{metrics.tasksFailed}</div>
                        <div className="metric-label">Tasks Failed</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-value">{metrics.agentsSpawned}</div>
                        <div className="metric-label">Agents Used</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-value">{this.formatDuration(duration)}</div>
                        <div className="metric-label">Total Duration</div>
                    </div>
                </div>
            </div>
        );
    }

    protected renderControlButtons(session: SwarmSession): React.ReactNode {
        const status = session.status;

        return (
            <>
                {status === 'initializing' && (
                    <button
                        className="theia-button main"
                        onClick={() => this.startSwarm(session.id)}
                    >
                        Start
                    </button>
                )}

                {['planning', 'delegating', 'executing', 'reviewing', 'synthesizing'].includes(status) && (
                    <>
                        <button
                            className="theia-button secondary"
                            onClick={() => this.pauseSwarm(session.id)}
                        >
                            Pause
                        </button>
                        <button
                            className="theia-button danger"
                            onClick={() => this.cancelSwarm(session.id)}
                        >
                            Cancel
                        </button>
                    </>
                )}

                {status === 'paused' && (
                    <>
                        <button
                            className="theia-button main"
                            onClick={() => this.resumeSwarm(session.id)}
                        >
                            Resume
                        </button>
                        <button
                            className="theia-button danger"
                            onClick={() => this.cancelSwarm(session.id)}
                        >
                            Cancel
                        </button>
                    </>
                )}

                {['complete', 'failed', 'cancelled'].includes(status) && (
                    <button
                        className="theia-button danger"
                        onClick={() => this.deleteSession(session.id)}
                    >
                        Delete
                    </button>
                )}
            </>
        );
    }

    protected renderTaskBoard(): React.ReactNode {
        const columns = ['backlog', 'ready', 'in_progress', 'review', 'done', 'failed'];

        return (
            <div className="task-board">
                {columns.map(column => (
                    <div key={column} className={`task-column ${column}`}>
                        <div className="column-header">{column.replace('_', ' ')}</div>
                        <div className="column-tasks">
                            {this.tasks
                                .filter(t => t.column === column)
                                .map(task => this.renderTaskCard(task))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    protected renderTaskCard(task: SwarmTask): React.ReactNode {
        return (
            <div key={task.id} className={`task-card priority-${task.priority}`}>
                <div className="task-title">{task.title}</div>
                <div className="task-meta">
                    <span className={`task-type ${task.type}`}>{task.type}</span>
                    {task.assignedTo && (
                        <span className="task-assignee">
                            Assigned: {task.assignedRole || 'agent'}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    protected renderAgentsList(): React.ReactNode {
        if (this.agents.length === 0) {
            return <div className="empty-state">No agents spawned yet</div>;
        }

        return (
            <div className="agents-list">
                {this.agents.map(agent => (
                    <div key={agent.id} className={`agent-card status-${agent.status}`}>
                        <div className="agent-role">{agent.role}</div>
                        <div className="agent-status">{agent.status}</div>
                        <div className="agent-stats">
                            <span>Tasks: {agent.completedTasks.length}</span>
                            <span>Tokens: {agent.tokensUsed.toLocaleString()}</span>
                        </div>
                        {agent.currentTaskId && (
                            <div className="agent-current-task">
                                Working on task...
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    // Actions
    protected async createNewSession(): Promise<void> {
        const task = 'New swarm task';  // TODO: prompt user
        await this.swarmService.createSession(task, `Swarm ${new Date().toLocaleString()}`);
    }

    protected async startSwarm(sessionId: string): Promise<void> {
        await this.swarmService.startSwarm(sessionId);
    }

    protected async pauseSwarm(sessionId: string): Promise<void> {
        await this.swarmService.pauseSwarm(sessionId);
    }

    protected async resumeSwarm(sessionId: string): Promise<void> {
        await this.swarmService.resumeSwarm(sessionId);
    }

    protected async cancelSwarm(sessionId: string): Promise<void> {
        await this.swarmService.cancelSwarm(sessionId);
    }

    protected async deleteSession(sessionId: string): Promise<void> {
        await this.swarmService.deleteSession(sessionId);
        this.selectedSessionId = undefined;
        this.tasks = [];
        this.agents = [];
    }
}
