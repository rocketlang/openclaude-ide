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

import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import URI from '@theia/core/lib/common/uri';
import {
    ChangeTrackerService,
    DiffComputationService,
    FileDiff,
    PendingChange,
    HunkStatus,
    DiffStatus
} from '../common';

/**
 * Service for tracking pending AI-suggested changes
 */
@injectable()
export class ChangeTrackerServiceImpl implements ChangeTrackerService {

    @inject(DiffComputationService)
    protected readonly diffService: DiffComputationService;

    @inject(FileService)
    protected readonly fileService: FileService;

    protected pendingChanges: Map<string, PendingChange> = new Map();

    protected readonly onChangesUpdatedEmitter = new Emitter<PendingChange[]>();
    readonly onChangesUpdated: Event<PendingChange[]> = this.onChangesUpdatedEmitter.event;

    addChange(
        filePath: string,
        originalContent: string,
        modifiedContent: string,
        source: string,
        description?: string
    ): FileDiff {
        // Compute the diff
        const diff = this.diffService.computeDiff(originalContent, modifiedContent);
        diff.filePath = filePath;
        diff.source = source;
        diff.description = description;

        // Store as pending change
        const pendingChange: PendingChange = {
            diff
        };

        this.pendingChanges.set(diff.id, pendingChange);
        this.fireUpdate();

        return diff;
    }

    getPendingChanges(): PendingChange[] {
        return Array.from(this.pendingChanges.values());
    }

    getChangeForFile(filePath: string): PendingChange | undefined {
        for (const change of this.pendingChanges.values()) {
            if (change.diff.filePath === filePath) {
                return change;
            }
        }
        return undefined;
    }

    acceptHunk(diffId: string, hunkId: string): void {
        const change = this.pendingChanges.get(diffId);
        if (!change) {
            return;
        }

        const hunk = change.diff.hunks.find(h => h.id === hunkId);
        if (hunk) {
            hunk.status = HunkStatus.Accepted;
            this.updateDiffStatus(change.diff);
            this.fireUpdate();
        }
    }

    rejectHunk(diffId: string, hunkId: string): void {
        const change = this.pendingChanges.get(diffId);
        if (!change) {
            return;
        }

        const hunk = change.diff.hunks.find(h => h.id === hunkId);
        if (hunk) {
            hunk.status = HunkStatus.Rejected;
            this.updateDiffStatus(change.diff);
            this.fireUpdate();
        }
    }

    acceptAll(diffId: string): void {
        const change = this.pendingChanges.get(diffId);
        if (!change) {
            return;
        }

        for (const hunk of change.diff.hunks) {
            hunk.status = HunkStatus.Accepted;
        }
        change.diff.status = DiffStatus.Accepted;
        this.fireUpdate();
    }

    rejectAll(diffId: string): void {
        const change = this.pendingChanges.get(diffId);
        if (!change) {
            return;
        }

        for (const hunk of change.diff.hunks) {
            hunk.status = HunkStatus.Rejected;
        }
        change.diff.status = DiffStatus.Rejected;
        this.fireUpdate();
    }

    async applyChanges(diffId: string): Promise<void> {
        const change = this.pendingChanges.get(diffId);
        if (!change) {
            throw new Error(`No change found with id: ${diffId}`);
        }

        // Get the result content based on accepted hunks
        const resultContent = this.diffService.getResultContent(change.diff);

        // Write to file
        const uri = new URI(change.diff.filePath);
        await this.fileService.write(uri, resultContent);

        // Mark as applied
        change.diff.status = DiffStatus.Applied;

        // Remove from pending
        this.pendingChanges.delete(diffId);
        this.fireUpdate();
    }

    discardChange(diffId: string): void {
        this.pendingChanges.delete(diffId);
        this.fireUpdate();
    }

    clearAll(): void {
        this.pendingChanges.clear();
        this.fireUpdate();
    }

    getPendingCount(): number {
        let count = 0;
        for (const change of this.pendingChanges.values()) {
            if (change.diff.status === DiffStatus.Pending ||
                change.diff.status === DiffStatus.PartiallyAccepted) {
                count++;
            }
        }
        return count;
    }

    protected updateDiffStatus(diff: FileDiff): void {
        const accepted = diff.hunks.filter(h => h.status === HunkStatus.Accepted).length;
        const rejected = diff.hunks.filter(h => h.status === HunkStatus.Rejected).length;
        const total = diff.hunks.length;

        if (accepted === total) {
            diff.status = DiffStatus.Accepted;
        } else if (rejected === total) {
            diff.status = DiffStatus.Rejected;
        } else if (accepted > 0 || rejected > 0) {
            diff.status = DiffStatus.PartiallyAccepted;
        } else {
            diff.status = DiffStatus.Pending;
        }
    }

    protected fireUpdate(): void {
        this.onChangesUpdatedEmitter.fire(this.getPendingChanges());
    }
}
