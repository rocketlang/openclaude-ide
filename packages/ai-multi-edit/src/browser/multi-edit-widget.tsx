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
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { codicon, StatefulWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import {
    MultiEditService,
    EditSession,
    EditOperation,
    EditOperationStatus,
    FileChangeType,
    EditSessionStatus,
    DiffHunk
} from '../common';

export const MULTI_EDIT_WIDGET_ID = 'ai-multi-edit-review';

interface MultiEditWidgetState {
    currentSession: EditSession | null;
    expandedOperations: Set<string>;
    selectedOperationId: string | null;
}

@injectable()
export class MultiEditWidget extends ReactWidget implements StatefulWidget {

    static readonly ID = MULTI_EDIT_WIDGET_ID;

    @inject(MultiEditService)
    protected readonly multiEditService: MultiEditService;

    protected state: MultiEditWidgetState = {
        currentSession: null,
        expandedOperations: new Set(),
        selectedOperationId: null
    };

    @postConstruct()
    protected init(): void {
        this.id = MULTI_EDIT_WIDGET_ID;
        this.title.label = nls.localize('theia/ai/multiEdit', 'Multi-File Edit Review');
        this.title.caption = this.title.label;
        this.title.iconClass = codicon('diff-multiple');
        this.title.closable = true;

        this.multiEditService.onSessionChanged(event => {
            if (this.state.currentSession?.id === event.session.id) {
                this.state.currentSession = event.session;
                this.update();
            }
        });
    }

    setSession(session: EditSession): void {
        this.state.currentSession = session;
        this.state.expandedOperations = new Set();
        this.state.selectedOperationId = null;
        this.update();
    }

    storeState(): object {
        return {
            sessionId: this.state.currentSession?.id
        };
    }

    restoreState(oldState: object): void {
        const state = oldState as { sessionId?: string };
        if (state.sessionId) {
            const session = this.multiEditService.getSession(state.sessionId);
            if (session) {
                this.setSession(session);
            }
        }
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        const { currentSession } = this.state;

        if (!currentSession) {
            return this.renderEmptyState();
        }

        return (
            <div className="multi-edit-widget">
                {this.renderHeader(currentSession)}
                {this.renderOperationsList(currentSession)}
                {this.renderFooter(currentSession)}
            </div>
        );
    }

    protected renderEmptyState(): React.ReactNode {
        return (
            <div className="multi-edit-widget empty">
                <div className="empty-message">
                    <span className={codicon('diff-multiple')} />
                    <p>No edit session to review</p>
                    <p className="hint">AI-generated code changes will appear here for review</p>
                </div>
            </div>
        );
    }

    protected renderHeader(session: EditSession): React.ReactNode {
        const stats = this.getSessionStats(session);

        return (
            <div className="multi-edit-header">
                <div className="session-info">
                    <h3>{session.title}</h3>
                    {session.description && (
                        <p className="description">{session.description}</p>
                    )}
                </div>
                <div className="session-stats">
                    <span className="stat">
                        <span className={codicon('file')} /> {stats.total} files
                    </span>
                    <span className="stat create">
                        <span className={codicon('add')} /> {stats.created}
                    </span>
                    <span className="stat modify">
                        <span className={codicon('edit')} /> {stats.modified}
                    </span>
                    <span className="stat delete">
                        <span className={codicon('trash')} /> {stats.deleted}
                    </span>
                </div>
                <div className="session-status">
                    <span className={`status-badge ${session.status}`}>
                        {this.getStatusLabel(session.status)}
                    </span>
                </div>
            </div>
        );
    }

    protected renderOperationsList(session: EditSession): React.ReactNode {
        return (
            <div className="operations-list">
                {session.operations.map(op => this.renderOperation(op))}
            </div>
        );
    }

    protected renderOperation(operation: EditOperation): React.ReactNode {
        const isExpanded = this.state.expandedOperations.has(operation.id);
        const isSelected = this.state.selectedOperationId === operation.id;
        const change = operation.change;

        return (
            <div
                key={operation.id}
                className={`operation-item ${isSelected ? 'selected' : ''} ${operation.status}`}
            >
                <div
                    className="operation-header"
                    onClick={() => this.toggleOperation(operation.id)}
                >
                    <span className={codicon(isExpanded ? 'chevron-down' : 'chevron-right')} />
                    <span className={`change-type-icon ${change.type}`}>
                        {this.getChangeTypeIcon(change.type)}
                    </span>
                    <span className="file-path">{change.filePath}</span>
                    {change.type === FileChangeType.Rename && change.newFilePath && (
                        <span className="rename-arrow">
                            → {change.newFilePath}
                        </span>
                    )}
                    <span className={`status-indicator ${operation.status}`}>
                        {this.getOperationStatusIcon(operation.status)}
                    </span>
                    <div className="operation-actions">
                        {operation.status === EditOperationStatus.Pending && (
                            <>
                                <button
                                    className="action-button accept"
                                    onClick={e => this.acceptOperation(e, operation)}
                                    title="Accept changes"
                                >
                                    <span className={codicon('check')} />
                                </button>
                                <button
                                    className="action-button reject"
                                    onClick={e => this.rejectOperation(e, operation)}
                                    title="Reject changes"
                                >
                                    <span className={codicon('close')} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {isExpanded && (
                    <div className="operation-content">
                        {operation.description && (
                            <p className="operation-description">{operation.description}</p>
                        )}
                        {this.renderDiff(operation)}
                        {change.hunks && change.hunks.length > 0 && (
                            this.renderHunks(operation, change.hunks)
                        )}
                    </div>
                )}
            </div>
        );
    }

    protected renderDiff(operation: EditOperation): React.ReactNode {
        const diff = this.multiEditService.generateDiff(operation);
        if (!diff) {
            return null;
        }

        return (
            <div className="diff-view">
                <pre className="diff-content">
                    {diff.split('\n').map((line, i) => (
                        <div key={i} className={this.getDiffLineClass(line)}>
                            {line}
                        </div>
                    ))}
                </pre>
            </div>
        );
    }

    protected renderHunks(operation: EditOperation, hunks: DiffHunk[]): React.ReactNode {
        return (
            <div className="hunks-list">
                <div className="hunks-header">
                    <span>Individual Changes ({hunks.length})</span>
                    <div className="hunks-actions">
                        <button
                            className="action-button"
                            onClick={() => this.acceptAllHunks(operation)}
                        >
                            Accept All
                        </button>
                        <button
                            className="action-button"
                            onClick={() => this.rejectAllHunks(operation)}
                        >
                            Reject All
                        </button>
                    </div>
                </div>
                {hunks.map(hunk => (
                    <div key={hunk.id} className={`hunk-item ${hunk.accepted ? 'accepted' : 'rejected'}`}>
                        <div className="hunk-header">
                            <span className="hunk-location">
                                Lines {hunk.originalRange.startLine}-{hunk.originalRange.endLine}
                            </span>
                            <label className="hunk-toggle">
                                <input
                                    type="checkbox"
                                    checked={hunk.accepted}
                                    onChange={e => this.toggleHunk(operation.id, hunk.id, e.target.checked)}
                                />
                                Include this change
                            </label>
                        </div>
                        <div className="hunk-diff">
                            {hunk.contextBefore.map((line, i) => (
                                <div key={`ctx-before-${i}`} className="diff-line context"> {line}</div>
                            ))}
                            {hunk.removedLines.map((line, i) => (
                                <div key={`removed-${i}`} className="diff-line removed">-{line}</div>
                            ))}
                            {hunk.addedLines.map((line, i) => (
                                <div key={`added-${i}`} className="diff-line added">+{line}</div>
                            ))}
                            {hunk.contextAfter.map((line, i) => (
                                <div key={`ctx-after-${i}`} className="diff-line context"> {line}</div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    protected renderFooter(session: EditSession): React.ReactNode {
        const canApply = session.status === EditSessionStatus.PendingReview ||
                         session.status === EditSessionStatus.Building;
        const canRevert = session.status === EditSessionStatus.Completed ||
                          session.status === EditSessionStatus.PartiallyCompleted;
        const pendingCount = session.operations.filter(
            op => op.status === EditOperationStatus.Pending
        ).length;

        return (
            <div className="multi-edit-footer">
                <div className="footer-info">
                    {pendingCount > 0 && (
                        <span>{pendingCount} changes pending review</span>
                    )}
                </div>
                <div className="footer-actions">
                    <button
                        className="action-button secondary"
                        onClick={() => this.cancelSession()}
                        disabled={session.status === EditSessionStatus.Completed}
                    >
                        Cancel
                    </button>
                    {canRevert && (
                        <button
                            className="action-button secondary"
                            onClick={() => this.revertSession()}
                        >
                            Revert All
                        </button>
                    )}
                    {canApply && (
                        <button
                            className="action-button primary"
                            onClick={() => this.applySession()}
                            disabled={pendingCount === 0}
                        >
                            Apply {pendingCount} Changes
                        </button>
                    )}
                </div>
            </div>
        );
    }

    protected toggleOperation(operationId: string): void {
        const expanded = this.state.expandedOperations;
        if (expanded.has(operationId)) {
            expanded.delete(operationId);
        } else {
            expanded.add(operationId);
        }
        this.state.selectedOperationId = operationId;
        this.update();
    }

    protected acceptOperation(e: React.MouseEvent, operation: EditOperation): void {
        e.stopPropagation();
        // Keep as pending but mark all hunks as accepted
        if (operation.change.hunks) {
            for (const hunk of operation.change.hunks) {
                hunk.accepted = true;
            }
        }
        this.update();
    }

    protected rejectOperation(e: React.MouseEvent, operation: EditOperation): void {
        e.stopPropagation();
        if (this.state.currentSession) {
            this.multiEditService.updateOperationStatus(
                this.state.currentSession.id,
                operation.id,
                EditOperationStatus.Rejected
            );
        }
    }

    protected toggleHunk(operationId: string, hunkId: string, accepted: boolean): void {
        if (this.state.currentSession) {
            this.multiEditService.setHunkAccepted(
                this.state.currentSession.id,
                operationId,
                hunkId,
                accepted
            );
        }
    }

    protected acceptAllHunks(operation: EditOperation): void {
        if (operation.change.hunks && this.state.currentSession) {
            for (const hunk of operation.change.hunks) {
                this.multiEditService.setHunkAccepted(
                    this.state.currentSession.id,
                    operation.id,
                    hunk.id,
                    true
                );
            }
        }
    }

    protected rejectAllHunks(operation: EditOperation): void {
        if (operation.change.hunks && this.state.currentSession) {
            for (const hunk of operation.change.hunks) {
                this.multiEditService.setHunkAccepted(
                    this.state.currentSession.id,
                    operation.id,
                    hunk.id,
                    false
                );
            }
        }
    }

    protected async applySession(): Promise<void> {
        if (!this.state.currentSession) {
            return;
        }

        const result = await this.multiEditService.apply(this.state.currentSession.id, {
            createBackup: true,
            saveAfterApply: true
        });

        if (result.success) {
            // Show success notification
        } else {
            // Show error notification
        }
    }

    protected async revertSession(): Promise<void> {
        if (!this.state.currentSession) {
            return;
        }

        await this.multiEditService.revert(this.state.currentSession.id);
    }

    protected cancelSession(): void {
        if (!this.state.currentSession) {
            return;
        }

        this.multiEditService.cancel(this.state.currentSession.id);
        this.state.currentSession = null;
        this.update();
    }

    protected getSessionStats(session: EditSession): {
        total: number;
        created: number;
        modified: number;
        deleted: number;
        renamed: number;
    } {
        return {
            total: session.operations.length,
            created: session.operations.filter(op => op.change.type === FileChangeType.Create).length,
            modified: session.operations.filter(op => op.change.type === FileChangeType.Modify).length,
            deleted: session.operations.filter(op => op.change.type === FileChangeType.Delete).length,
            renamed: session.operations.filter(op => op.change.type === FileChangeType.Rename).length
        };
    }

    protected getChangeTypeIcon(type: FileChangeType): React.ReactNode {
        switch (type) {
            case FileChangeType.Create:
                return <span className={codicon('add')} />;
            case FileChangeType.Modify:
                return <span className={codicon('edit')} />;
            case FileChangeType.Delete:
                return <span className={codicon('trash')} />;
            case FileChangeType.Rename:
                return <span className={codicon('arrow-right')} />;
        }
    }

    protected getOperationStatusIcon(status: EditOperationStatus): React.ReactNode {
        switch (status) {
            case EditOperationStatus.Pending:
                return <span className={codicon('circle-outline')} title="Pending" />;
            case EditOperationStatus.Applied:
                return <span className={codicon('check')} title="Applied" />;
            case EditOperationStatus.Rejected:
                return <span className={codicon('close')} title="Rejected" />;
            case EditOperationStatus.Failed:
                return <span className={codicon('error')} title="Failed" />;
            case EditOperationStatus.Reverted:
                return <span className={codicon('discard')} title="Reverted" />;
            case EditOperationStatus.Conflict:
                return <span className={codicon('warning')} title="Conflict" />;
        }
    }

    protected getStatusLabel(status: EditSessionStatus): string {
        const labels: Record<EditSessionStatus, string> = {
            [EditSessionStatus.Building]: 'Building',
            [EditSessionStatus.PendingReview]: 'Ready for Review',
            [EditSessionStatus.Applying]: 'Applying...',
            [EditSessionStatus.Completed]: 'Completed',
            [EditSessionStatus.PartiallyCompleted]: 'Partially Completed',
            [EditSessionStatus.Cancelled]: 'Cancelled',
            [EditSessionStatus.Reverted]: 'Reverted'
        };
        return labels[status];
    }

    protected getDiffLineClass(line: string): string {
        if (line.startsWith('+') && !line.startsWith('+++')) {
            return 'diff-line added';
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
            return 'diff-line removed';
        }
        if (line.startsWith('@@')) {
            return 'diff-line hunk-header';
        }
        if (line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++')) {
            return 'diff-line file-header';
        }
        return 'diff-line context';
    }
}
