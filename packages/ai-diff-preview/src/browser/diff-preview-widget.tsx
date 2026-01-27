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

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, Message } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core';
import {
    ChangeTrackerService,
    PendingChange,
    DiffHunk,
    DiffLine,
    DiffLineType,
    HunkStatus,
    DiffStatus
} from '../common';

interface DiffPreviewState {
    changes: PendingChange[];
    selectedDiffId?: string;
    expandedHunks: Set<string>;
}

/**
 * Widget for previewing and managing AI-suggested changes
 */
@injectable()
export class DiffPreviewWidget extends ReactWidget {

    static readonly ID = 'diff-preview-widget';
    static readonly LABEL = 'AI Changes';

    @inject(ChangeTrackerService)
    protected readonly changeTracker: ChangeTrackerService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected state: DiffPreviewState = {
        changes: [],
        expandedHunks: new Set()
    };

    @postConstruct()
    protected init(): void {
        this.id = DiffPreviewWidget.ID;
        this.title.label = DiffPreviewWidget.LABEL;
        this.title.caption = 'Preview AI-suggested changes';
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-diff';
        this.addClass('diff-preview-widget');

        // Subscribe to change updates
        this.changeTracker.onChangesUpdated(changes => {
            this.state.changes = changes;
            this.update();
        });

        // Load initial changes
        this.state.changes = this.changeTracker.getPendingChanges();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        return (
            <div className="diff-preview-container">
                {this.renderHeader()}
                {this.state.changes.length === 0 ? (
                    this.renderEmptyState()
                ) : (
                    this.renderChangeList()
                )}
            </div>
        );
    }

    protected renderHeader(): React.ReactNode {
        const pendingCount = this.changeTracker.getPendingCount();

        return (
            <div className="diff-header">
                <div className="diff-header-title">
                    <span className="codicon codicon-diff" />
                    <span>Pending Changes</span>
                    {pendingCount > 0 && (
                        <span className="badge">{pendingCount}</span>
                    )}
                </div>
                <div className="diff-header-actions">
                    {this.state.changes.length > 0 && (
                        <>
                            <button
                                className="theia-button"
                                onClick={() => this.acceptAllChanges()}
                                title="Accept all changes"
                            >
                                <span className="codicon codicon-check-all" />
                            </button>
                            <button
                                className="theia-button secondary"
                                onClick={() => this.rejectAllChanges()}
                                title="Reject all changes"
                            >
                                <span className="codicon codicon-close-all" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    protected renderEmptyState(): React.ReactNode {
        return (
            <div className="diff-empty-state">
                <span className="codicon codicon-check" />
                <p>No pending changes</p>
                <p className="description">
                    AI-suggested changes will appear here for review
                </p>
            </div>
        );
    }

    protected renderChangeList(): React.ReactNode {
        return (
            <div className="diff-change-list">
                {this.state.changes.map(change =>
                    this.renderChange(change)
                )}
            </div>
        );
    }

    protected renderChange(change: PendingChange): React.ReactNode {
        const { diff } = change;
        const isSelected = this.state.selectedDiffId === diff.id;
        const fileName = diff.filePath.split('/').pop() || diff.filePath;

        return (
            <div
                key={diff.id}
                className={`diff-change ${isSelected ? 'selected' : ''} ${diff.status}`}
            >
                <div
                    className="diff-change-header"
                    onClick={() => this.selectDiff(diff.id)}
                >
                    <div className="diff-file-info">
                        <span className={`diff-status-icon ${diff.status}`}>
                            {this.getStatusIcon(diff.status)}
                        </span>
                        <span className="diff-file-name" title={diff.filePath}>
                            {fileName}
                        </span>
                        <span className="diff-hunk-count">
                            {diff.hunks.length} {diff.hunks.length === 1 ? 'change' : 'changes'}
                        </span>
                    </div>
                    <div className="diff-change-actions">
                        <button
                            className="action-button accept"
                            onClick={e => { e.stopPropagation(); this.handleAcceptAll(diff.id); }}
                            title="Accept all"
                        >
                            <span className="codicon codicon-check" />
                        </button>
                        <button
                            className="action-button reject"
                            onClick={e => { e.stopPropagation(); this.handleRejectAll(diff.id); }}
                            title="Reject all"
                        >
                            <span className="codicon codicon-close" />
                        </button>
                        <button
                            className="action-button apply"
                            onClick={e => { e.stopPropagation(); this.handleApply(diff.id); }}
                            title="Apply changes"
                            disabled={diff.status === DiffStatus.Pending}
                        >
                            <span className="codicon codicon-save" />
                        </button>
                    </div>
                </div>

                {isSelected && (
                    <div className="diff-hunks">
                        {diff.hunks.map(hunk =>
                            this.renderHunk(diff.id, hunk)
                        )}
                    </div>
                )}

                {diff.description && (
                    <div className="diff-description">
                        <span className="codicon codicon-info" />
                        {diff.description}
                    </div>
                )}
            </div>
        );
    }

    protected renderHunk(diffId: string, hunk: DiffHunk): React.ReactNode {
        const isExpanded = this.state.expandedHunks.has(hunk.id);
        const addedLines = hunk.lines.filter(l => l.type === DiffLineType.Added).length;
        const removedLines = hunk.lines.filter(l => l.type === DiffLineType.Removed).length;

        return (
            <div key={hunk.id} className={`diff-hunk ${hunk.status}`}>
                <div
                    className="hunk-header"
                    onClick={() => this.toggleHunk(hunk.id)}
                >
                    <div className="hunk-info">
                        <span className="codicon codicon-chevron-right expand-icon"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }} />
                        <span className="hunk-location">
                            Lines {hunk.originalStart}-{hunk.originalStart + hunk.originalLength - 1}
                        </span>
                        <span className="hunk-stats">
                            <span className="added">+{addedLines}</span>
                            <span className="removed">-{removedLines}</span>
                        </span>
                    </div>
                    <div className="hunk-actions">
                        <button
                            className={`hunk-button accept ${hunk.status === HunkStatus.Accepted ? 'active' : ''}`}
                            onClick={e => { e.stopPropagation(); this.handleAcceptHunk(diffId, hunk.id); }}
                            title="Accept this change"
                        >
                            <span className="codicon codicon-check" />
                        </button>
                        <button
                            className={`hunk-button reject ${hunk.status === HunkStatus.Rejected ? 'active' : ''}`}
                            onClick={e => { e.stopPropagation(); this.handleRejectHunk(diffId, hunk.id); }}
                            title="Reject this change"
                        >
                            <span className="codicon codicon-close" />
                        </button>
                    </div>
                </div>

                {isExpanded && (
                    <div className="hunk-lines">
                        {hunk.lines.map((line, index) =>
                            this.renderLine(line, index)
                        )}
                    </div>
                )}
            </div>
        );
    }

    protected renderLine(line: DiffLine, index: number): React.ReactNode {
        const lineNumber = line.type === DiffLineType.Added
            ? line.modifiedLineNumber
            : line.originalLineNumber;

        return (
            <div key={index} className={`diff-line ${line.type}`}>
                <span className="line-number">
                    {lineNumber || ''}
                </span>
                <span className="line-marker">
                    {line.type === DiffLineType.Added ? '+' :
                     line.type === DiffLineType.Removed ? '-' : ' '}
                </span>
                <span className="line-content">
                    {line.content || ' '}
                </span>
            </div>
        );
    }

    protected getStatusIcon(status: DiffStatus): React.ReactNode {
        switch (status) {
            case DiffStatus.Accepted:
                return <span className="codicon codicon-pass-filled" />;
            case DiffStatus.Rejected:
                return <span className="codicon codicon-error" />;
            case DiffStatus.PartiallyAccepted:
                return <span className="codicon codicon-pass" />;
            case DiffStatus.Applied:
                return <span className="codicon codicon-check-all" />;
            default:
                return <span className="codicon codicon-circle-outline" />;
        }
    }

    protected selectDiff(diffId: string): void {
        if (this.state.selectedDiffId === diffId) {
            this.state.selectedDiffId = undefined;
        } else {
            this.state.selectedDiffId = diffId;
        }
        this.update();
    }

    protected toggleHunk(hunkId: string): void {
        if (this.state.expandedHunks.has(hunkId)) {
            this.state.expandedHunks.delete(hunkId);
        } else {
            this.state.expandedHunks.add(hunkId);
        }
        this.update();
    }

    protected handleAcceptHunk(diffId: string, hunkId: string): void {
        this.changeTracker.acceptHunk(diffId, hunkId);
    }

    protected handleRejectHunk(diffId: string, hunkId: string): void {
        this.changeTracker.rejectHunk(diffId, hunkId);
    }

    protected handleAcceptAll(diffId: string): void {
        this.changeTracker.acceptAll(diffId);
    }

    protected handleRejectAll(diffId: string): void {
        this.changeTracker.rejectAll(diffId);
    }

    protected async handleApply(diffId: string): Promise<void> {
        try {
            await this.changeTracker.applyChanges(diffId);
            this.messageService.info('Changes applied successfully');
        } catch (error) {
            this.messageService.error(`Failed to apply changes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    protected acceptAllChanges(): void {
        for (const change of this.state.changes) {
            this.changeTracker.acceptAll(change.diff.id);
        }
    }

    protected rejectAllChanges(): void {
        for (const change of this.state.changes) {
            this.changeTracker.rejectAll(change.diff.id);
        }
    }
}
