// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core';
import { OpenClaudeBackendService, TeamDashboard, TeamActivity } from '../../common/openclaude-protocol';

/**
 * Widget for displaying team dashboard with metrics and activity
 */
@injectable()
export class TeamDashboardWidget extends ReactWidget {

    static readonly ID = 'openclaude-team-dashboard';
    static readonly LABEL = 'Team Dashboard';

    @inject(OpenClaudeBackendService)
    protected readonly backendService: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected dashboard: TeamDashboard | undefined;
    protected isLoading = false;
    protected error: string | undefined;
    protected refreshInterval: number | undefined;

    @postConstruct()
    protected init(): void {
        this.id = TeamDashboardWidget.ID;
        this.title.label = TeamDashboardWidget.LABEL;
        this.title.caption = TeamDashboardWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-dashboard';

        this.update();
        this.loadDashboard();
    }

    override dispose(): void {
        this.stopRefreshing();
        super.dispose();
    }

    /**
     * Load dashboard data
     */
    protected async loadDashboard(): Promise<void> {
        try {
            this.isLoading = true;
            this.error = undefined;
            this.update();

            this.dashboard = await this.backendService.getTeamDashboard();

            this.isLoading = false;
            this.update();
        } catch (error) {
            console.error('[OpenClaude] Load dashboard failed:', error);
            this.isLoading = false;
            this.error = 'Failed to load team dashboard';
            this.update();
        }
    }

    /**
     * Refresh dashboard
     */
    protected handleRefresh = (): void => {
        this.loadDashboard();
    }

    /**
     * Start auto-refreshing dashboard
     */
    protected startRefreshing(): void {
        if (!this.refreshInterval) {
            this.refreshInterval = window.setInterval(() => {
                this.loadDashboard();
            }, 30000); // Refresh every 30 seconds
        }
    }

    /**
     * Stop auto-refreshing
     */
    protected stopRefreshing(): void {
        if (this.refreshInterval) {
            window.clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
    }

    /**
     * Toggle auto-refresh
     */
    protected handleToggleAutoRefresh = (): void => {
        if (this.refreshInterval) {
            this.stopRefreshing();
        } else {
            this.startRefreshing();
        }
        this.update();
    }

    /**
     * Format duration
     */
    protected formatDuration(ms: number): string {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Format timestamp
     */
    protected formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffMins < 1440) {
            const hours = Math.floor(diffMins / 60);
            return `${hours}h ago`;
        } else {
            const days = Math.floor(diffMins / 1440);
            return `${days}d ago`;
        }
    }

    /**
     * Get activity type icon
     */
    protected getActivityIcon(type: string): string {
        switch (type) {
            case 'review_started': return 'fa fa-search';
            case 'review_completed': return 'fa fa-check-circle';
            case 'test_generated': return 'fa fa-flask';
            case 'documentation_generated': return 'fa fa-book';
            case 'chat_session': return 'fa fa-comments';
            case 'collaboration_session': return 'fa fa-users';
            case 'comment_added': return 'fa fa-comment';
            case 'comment_resolved': return 'fa fa-check';
            default: return 'fa fa-info-circle';
        }
    }

    /**
     * Get activity type color
     */
    protected getActivityColor(type: string): string {
        switch (type) {
            case 'review_started': return '#3498db';
            case 'review_completed': return '#27ae60';
            case 'test_generated': return '#9b59b6';
            case 'documentation_generated': return '#e67e22';
            case 'chat_session': return '#1abc9c';
            case 'collaboration_session': return '#f39c12';
            case 'comment_added': return '#95a5a6';
            case 'comment_resolved': return '#2ecc71';
            default: return '#7f8c8d';
        }
    }

    /**
     * Get role badge color
     */
    protected getRoleBadgeColor(role: string): string {
        switch (role) {
            case 'owner': return '#e74c3c';
            case 'admin': return '#f39c12';
            case 'member': return '#3498db';
            case 'guest': return '#95a5a6';
            default: return '#7f8c8d';
        }
    }

    /**
     * Render stats card
     */
    protected renderStatsCard(title: string, value: number | string, icon: string, color: string): React.ReactNode {
        return (
            <div className='stats-card' style={{ borderTopColor: color }}>
                <div className='stats-card-icon' style={{ backgroundColor: color }}>
                    <i className={icon}></i>
                </div>
                <div className='stats-card-content'>
                    <div className='stats-card-title'>{title}</div>
                    <div className='stats-card-value'>{value}</div>
                </div>
            </div>
        );
    }

    /**
     * Render team member
     */
    protected renderTeamMember(member: any): React.ReactNode {
        return (
            <div key={member.user.id} className='team-member'>
                <div className='team-member-header'>
                    <div className='team-member-avatar' style={{ backgroundColor: member.user.color }}>
                        {member.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className='team-member-info'>
                        <div className='team-member-name'>{member.user.name}</div>
                        <div className='team-member-role' style={{ color: this.getRoleBadgeColor(member.role) }}>
                            {member.role}
                        </div>
                    </div>
                    <div className={`activity-status ${member.activityStatus}`}>
                        <span className='activity-indicator'></span>
                        {member.activityStatus}
                    </div>
                </div>
                <div className='team-member-stats'>
                    <div className='team-member-stat'>
                        <i className='fa fa-search'></i>
                        <span>{member.contributions.reviews} reviews</span>
                    </div>
                    <div className='team-member-stat'>
                        <i className='fa fa-flask'></i>
                        <span>{member.contributions.tests} tests</span>
                    </div>
                    <div className='team-member-stat'>
                        <i className='fa fa-book'></i>
                        <span>{member.contributions.documentation} docs</span>
                    </div>
                    <div className='team-member-stat'>
                        <i className='fa fa-comment'></i>
                        <span>{member.contributions.comments} comments</span>
                    </div>
                </div>
                <div className='team-member-footer'>
                    Last activity: {this.formatTimestamp(member.lastActivity)}
                </div>
            </div>
        );
    }

    /**
     * Render activity item
     */
    protected renderActivityItem(activity: TeamActivity): React.ReactNode {
        const iconClass = this.getActivityIcon(activity.type);
        const color = this.getActivityColor(activity.type);

        return (
            <div key={activity.id} className='activity-item'>
                <div className='activity-icon' style={{ backgroundColor: color }}>
                    <i className={iconClass}></i>
                </div>
                <div className='activity-content'>
                    <div className='activity-header'>
                        <span className='activity-user' style={{ color: activity.user.color }}>
                            {activity.user.name}
                        </span>
                        <span className='activity-description'>{activity.description}</span>
                    </div>
                    {activity.resourceUri && (
                        <div className='activity-resource'>
                            <i className='fa fa-file-o'></i>
                            {activity.resourceUri}
                        </div>
                    )}
                </div>
                <div className='activity-time'>
                    {this.formatTimestamp(activity.timestamp)}
                </div>
            </div>
        );
    }

    protected render(): React.ReactNode {
        return (
            <div className='openclaude-team-dashboard'>
                {/* Header */}
                <div className='dashboard-header'>
                    <h2>Team Dashboard</h2>
                    <div className='dashboard-actions'>
                        <button
                            className={`theia-button ${this.refreshInterval ? 'active' : ''}`}
                            onClick={this.handleToggleAutoRefresh}
                            title={this.refreshInterval ? 'Disable auto-refresh' : 'Enable auto-refresh'}
                        >
                            <i className='fa fa-refresh'></i>
                            Auto-refresh {this.refreshInterval ? 'ON' : 'OFF'}
                        </button>
                        <button
                            className='theia-button'
                            onClick={this.handleRefresh}
                            disabled={this.isLoading}
                        >
                            <i className='fa fa-refresh'></i>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Loading */}
                {this.isLoading && !this.dashboard && (
                    <div className='dashboard-loading'>
                        <i className='fa fa-spinner fa-spin'></i>
                        Loading dashboard...
                    </div>
                )}

                {/* Error */}
                {this.error && (
                    <div className='dashboard-error'>
                        <i className='fa fa-exclamation-triangle'></i>
                        {this.error}
                    </div>
                )}

                {/* Dashboard content */}
                {this.dashboard && (
                    <div className='dashboard-content'>
                        {/* Period info */}
                        <div className='dashboard-period'>
                            Period: {new Date(this.dashboard.periodStart).toLocaleDateString()} - {new Date(this.dashboard.periodEnd).toLocaleDateString()}
                        </div>

                        {/* Quick stats */}
                        <div className='dashboard-quick-stats'>
                            <div className='quick-stat'>
                                <i className='fa fa-users'></i>
                                <div>
                                    <div className='quick-stat-value'>{this.dashboard.activeCollaborations}</div>
                                    <div className='quick-stat-label'>Active Sessions</div>
                                </div>
                            </div>
                            <div className='quick-stat'>
                                <i className='fa fa-code'></i>
                                <div>
                                    <div className='quick-stat-value'>{this.dashboard.pendingReviews}</div>
                                    <div className='quick-stat-label'>Pending Reviews</div>
                                </div>
                            </div>
                        </div>

                        {/* Stats grid */}
                        <div className='dashboard-section'>
                            <h3>Team Statistics</h3>
                            <div className='stats-grid'>
                                {this.renderStatsCard(
                                    'Code Reviews',
                                    this.dashboard.stats.codeReviewsCompleted,
                                    'fa fa-search',
                                    '#3498db'
                                )}
                                {this.renderStatsCard(
                                    'Tests Generated',
                                    this.dashboard.stats.testsGenerated,
                                    'fa fa-flask',
                                    '#9b59b6'
                                )}
                                {this.renderStatsCard(
                                    'Documentation',
                                    this.dashboard.stats.documentationGenerated,
                                    'fa fa-book',
                                    '#e67e22'
                                )}
                                {this.renderStatsCard(
                                    'Chat Messages',
                                    this.dashboard.stats.chatMessages,
                                    'fa fa-comments',
                                    '#1abc9c'
                                )}
                                {this.renderStatsCard(
                                    'Code Comments',
                                    this.dashboard.stats.codeComments,
                                    'fa fa-comment',
                                    '#95a5a6'
                                )}
                                {this.renderStatsCard(
                                    'Collab Sessions',
                                    this.dashboard.stats.collaborationSessions,
                                    'fa fa-users',
                                    '#f39c12'
                                )}
                                {this.renderStatsCard(
                                    'Avg Review Time',
                                    this.formatDuration(this.dashboard.stats.avgReviewTime),
                                    'fa fa-clock-o',
                                    '#27ae60'
                                )}
                                {this.renderStatsCard(
                                    'Coverage +',
                                    `${this.dashboard.stats.testCoverageImprovement}%`,
                                    'fa fa-line-chart',
                                    '#2ecc71'
                                )}
                            </div>
                        </div>

                        {/* Team members */}
                        <div className='dashboard-section'>
                            <h3>Team Members ({this.dashboard.teamMembers.length})</h3>
                            <div className='team-members-grid'>
                                {this.dashboard.teamMembers.map(member => this.renderTeamMember(member))}
                            </div>
                        </div>

                        {/* Recent activity */}
                        <div className='dashboard-section'>
                            <h3>Recent Activity ({this.dashboard.recentActivity.length})</h3>
                            <div className='activity-feed'>
                                {this.dashboard.recentActivity.length === 0 && (
                                    <div className='activity-empty'>
                                        <i className='fa fa-inbox'></i>
                                        No recent activity
                                    </div>
                                )}
                                {this.dashboard.recentActivity.map(activity => this.renderActivityItem(activity))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
