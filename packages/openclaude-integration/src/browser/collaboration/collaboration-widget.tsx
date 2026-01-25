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
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { OpenClaudeBackendService, CollaborationSession, Collaborator, ChatUser } from '../../common/openclaude-protocol';

/**
 * Widget for managing live collaboration sessions
 */
@injectable()
export class CollaborationWidget extends ReactWidget {

    static readonly ID = 'openclaude-collaboration';
    static readonly LABEL = 'Live Collaboration';

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    @inject(EditorManager)
    protected readonly editorManager!: EditorManager;

    protected currentSession: CollaborationSession | undefined;
    protected refreshInterval: number | undefined;

    @postConstruct()
    protected init(): void {
        this.id = CollaborationWidget.ID;
        this.title.label = CollaborationWidget.LABEL;
        this.title.caption = CollaborationWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-users';

        // Listen to editor changes
        this.editorManager.onCurrentEditorChanged(() => {
            this.handleEditorChange();
        });

        this.update();
    }

    /**
     * Handle editor change
     */
    protected handleEditorChange(): void {
        const currentEditor = this.editorManager.currentEditor;
        const filePath = currentEditor?.getResourceUri()?.path.toString();

        if (filePath && this.currentSession && this.currentSession.filePath !== filePath) {
            // File changed, leave current session
            this.leaveSession();
        }
    }

    /**
     * Start collaboration for current file
     */
    async startCollaboration(): Promise<void> {
        const currentEditor = this.editorManager.currentEditor;
        if (!currentEditor) {
            this.messageService.warn('No active editor');
            return;
        }

        const filePath = currentEditor.getResourceUri()?.path.toString();
        if (!filePath) {
            this.messageService.warn('No file path available');
            return;
        }

        try {
            this.currentSession = await this.backendService.joinCollaborationSession(filePath);
            this.messageService.info(`✅ Collaboration started for ${filePath.split('/').pop()}`);

            // Start refreshing collaborators
            this.startRefreshing();

            this.update();
        } catch (error) {
            this.messageService.error(`Failed to start collaboration: ${error}`);
        }
    }

    /**
     * Leave current collaboration session
     */
    async leaveSession(): Promise<void> {
        if (!this.currentSession) {
            return;
        }

        try {
            await this.backendService.leaveCollaborationSession(this.currentSession.id);
            this.stopRefreshing();
            this.currentSession = undefined;
            this.update();
            this.messageService.info('Left collaboration session');
        } catch (error) {
            this.messageService.error(`Failed to leave session: ${error}`);
        }
    }

    /**
     * Start refreshing collaborators
     */
    protected startRefreshing(): void {
        this.stopRefreshing();
        this.refreshInterval = window.setInterval(() => {
            this.refreshCollaborators();
        }, 2000); // Refresh every 2 seconds
    }

    /**
     * Stop refreshing collaborators
     */
    protected stopRefreshing(): void {
        if (this.refreshInterval) {
            window.clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
    }

    /**
     * Refresh collaborators list
     */
    protected async refreshCollaborators(): Promise<void> {
        if (!this.currentSession) {
            return;
        }

        try {
            const collaborators = await this.backendService.getCollaborators(this.currentSession.id);
            this.currentSession.collaborators = collaborators;
            this.update();
        } catch (error) {
            console.error('[OpenClaude] Failed to refresh collaborators:', error);
        }
    }

    /**
     * Get user initials
     */
    protected getUserInitials(user: ChatUser): string {
        return user.name
            .split(' ')
            .map(part => part[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    /**
     * Format timestamp
     */
    protected formatTimestamp(timestamp: number): string {
        const diffMs = Date.now() - timestamp;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffMs / 60000);

        if (diffSec < 10) return 'active now';
        if (diffSec < 60) return `${diffSec}s ago`;
        if (diffMin < 60) return `${diffMin}m ago`;
        return 'inactive';
    }

    /**
     * Get activity status
     */
    protected getActivityStatus(lastActivity: number): 'active' | 'idle' | 'inactive' {
        const diffMs = Date.now() - lastActivity;
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 1) return 'active';
        if (diffMin < 5) return 'idle';
        return 'inactive';
    }

    override dispose(): void {
        this.stopRefreshing();
        if (this.currentSession) {
            this.leaveSession();
        }
        super.dispose();
    }

    protected render(): React.ReactNode {
        return (
            <div className='openclaude-collaboration'>
                {this.renderHeader()}
                {this.currentSession ? this.renderSessionContent() : this.renderEmptyState()}
            </div>
        );
    }

    protected renderHeader(): React.ReactNode {
        if (!this.currentSession) {
            return (
                <div className='collaboration-header'>
                    <h3>Live Collaboration</h3>
                </div>
            );
        }

        const fileName = this.currentSession.filePath.split('/').pop() || 'Unknown';

        return (
            <div className='collaboration-header'>
                <div className='session-info'>
                    <h3>Live Collaboration</h3>
                    <div className='file-info'>
                        <i className='fa fa-file-code-o'></i>
                        <span>{fileName}</span>
                    </div>
                </div>
                <div className='header-actions'>
                    <button className='theia-button secondary' onClick={() => this.leaveSession()}>
                        <i className='fa fa-sign-out'></i>
                        Leave Session
                    </button>
                </div>
            </div>
        );
    }

    protected renderSessionContent(): React.ReactNode {
        return (
            <>
                {this.renderCollaborators()}
                {this.renderInstructions()}
            </>
        );
    }

    protected renderCollaborators(): React.ReactNode {
        if (!this.currentSession) {
            return null;
        }

        const activeCollaborators = this.currentSession.collaborators.filter(c =>
            this.getActivityStatus(c.lastActivity) !== 'inactive'
        );

        return (
            <div className='collaborators-section'>
                <div className='section-header'>
                    <h4>
                        <i className='fa fa-users'></i>
                        Active Collaborators
                    </h4>
                    <span className='collaborator-count'>{activeCollaborators.length}</span>
                </div>

                {activeCollaborators.length === 0 ? (
                    <div className='no-collaborators'>
                        <i className='fa fa-user-o fa-2x'></i>
                        <p>You're the only one here. Share this file to collaborate!</p>
                    </div>
                ) : (
                    <div className='collaborators-list'>
                        {activeCollaborators.map(collaborator => this.renderCollaborator(collaborator))}
                    </div>
                )}
            </div>
        );
    }

    protected renderCollaborator(collaborator: Collaborator): React.ReactNode {
        const activityStatus = this.getActivityStatus(collaborator.lastActivity);

        return (
            <div key={collaborator.user.id} className={`collaborator-item ${activityStatus}`}>
                <div className='collaborator-avatar' style={{ borderColor: collaborator.color }}>
                    {collaborator.user.avatar ? (
                        <img src={collaborator.user.avatar} alt={collaborator.user.name} />
                    ) : (
                        <div
                            className='avatar-initials'
                            style={{ background: collaborator.color }}
                        >
                            {this.getUserInitials(collaborator.user)}
                        </div>
                    )}
                    <span
                        className={`activity-indicator ${activityStatus}`}
                        style={{ background: activityStatus === 'active' ? collaborator.color : undefined }}
                    ></span>
                </div>
                <div className='collaborator-info'>
                    <div className='collaborator-name'>{collaborator.user.name}</div>
                    <div className='collaborator-status'>
                        {collaborator.cursor && (
                            <span className='cursor-position'>
                                Line {collaborator.cursor.line + 1}, Col {collaborator.cursor.column + 1}
                            </span>
                        )}
                        <span className='activity-time'>{this.formatTimestamp(collaborator.lastActivity)}</span>
                    </div>
                </div>
                <div className='collaborator-color-badge' style={{ background: collaborator.color }}></div>
            </div>
        );
    }

    protected renderInstructions(): React.ReactNode {
        return (
            <div className='instructions-section'>
                <div className='section-header'>
                    <h4>
                        <i className='fa fa-info-circle'></i>
                        How It Works
                    </h4>
                </div>
                <div className='instructions-content'>
                    <div className='instruction-item'>
                        <i className='fa fa-mouse-pointer'></i>
                        <div>
                            <strong>Cursor Tracking</strong>
                            <p>See where other collaborators are editing in real-time</p>
                        </div>
                    </div>
                    <div className='instruction-item'>
                        <i className='fa fa-i-cursor'></i>
                        <div>
                            <strong>Selection Highlights</strong>
                            <p>View text selections made by collaborators</p>
                        </div>
                    </div>
                    <div className='instruction-item'>
                        <i className='fa fa-refresh'></i>
                        <div>
                            <strong>Live Updates</strong>
                            <p>Changes are synchronized automatically</p>
                        </div>
                    </div>
                    <div className='instruction-item'>
                        <i className='fa fa-shield'></i>
                        <div>
                            <strong>Conflict Prevention</strong>
                            <p>Smart merging prevents conflicting edits</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    protected renderEmptyState(): React.ReactNode {
        return (
            <div className='collaboration-empty'>
                <i className='fa fa-users fa-4x'></i>
                <h4>No Active Collaboration</h4>
                <p>Start collaborating on the current file with your team</p>
                <button className='theia-button' onClick={() => this.startCollaboration()}>
                    <i className='fa fa-play'></i>
                    Start Collaboration
                </button>
                <div className='features-list'>
                    <div className='feature'>
                        <i className='fa fa-check-circle'></i>
                        <span>Real-time cursor tracking</span>
                    </div>
                    <div className='feature'>
                        <i className='fa fa-check-circle'></i>
                        <span>Live text selections</span>
                    </div>
                    <div className='feature'>
                        <i className='fa fa-check-circle'></i>
                        <span>Instant change synchronization</span>
                    </div>
                    <div className='feature'>
                        <i className='fa fa-check-circle'></i>
                        <span>Automatic conflict resolution</span>
                    </div>
                </div>
            </div>
        );
    }
}
