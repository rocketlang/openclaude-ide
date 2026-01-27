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
import { Emitter, Event, ILogger, generateUuid } from '@theia/core';
import {
    MultiEditService,
    EditSession,
    EditSessionStatus,
    EditOperation,
    EditOperationStatus,
    FileChange,
    FileChangeType,
    EditSessionResult,
    ApplyOptions,
    EditConflict,
    DiffOptions,
    DiffHunk,
    EditSessionChangeEvent
} from './multi-edit-types';

@injectable()
export abstract class BaseMultiEditService implements MultiEditService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly sessions = new Map<string, EditSession>();
    protected readonly backups = new Map<string, Map<string, string>>(); // sessionId -> (filePath -> content)

    protected readonly onSessionChangedEmitter = new Emitter<EditSessionChangeEvent>();
    readonly onSessionChanged: Event<EditSessionChangeEvent> = this.onSessionChangedEmitter.event;

    createSession(title: string, source: string, description?: string): EditSession {
        const session: EditSession = {
            id: generateUuid(),
            title,
            description,
            operations: [],
            status: EditSessionStatus.Building,
            createdAt: Date.now(),
            source
        };

        this.sessions.set(session.id, session);
        this.fireSessionChange(session, 'created');

        return session;
    }

    getSession(sessionId: string): EditSession | undefined {
        return this.sessions.get(sessionId);
    }

    getActiveSessions(): EditSession[] {
        return Array.from(this.sessions.values()).filter(s =>
            s.status === EditSessionStatus.Building ||
            s.status === EditSessionStatus.PendingReview ||
            s.status === EditSessionStatus.Applying
        );
    }

    addOperation(sessionId: string, change: FileChange, description?: string): EditOperation {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        if (session.status !== EditSessionStatus.Building && session.status !== EditSessionStatus.PendingReview) {
            throw new Error(`Cannot add operations to session in status: ${session.status}`);
        }

        // Generate hunks for modify operations if not provided
        if (change.type === FileChangeType.Modify && !change.hunks && change.originalContent && change.newContent) {
            change.hunks = this.generateHunks(change.originalContent, change.newContent);
        }

        const operation: EditOperation = {
            id: generateUuid(),
            change,
            status: EditOperationStatus.Pending,
            description,
            createdAt: Date.now(),
            source: session.source
        };

        session.operations.push(operation);
        session.status = EditSessionStatus.PendingReview;

        this.fireSessionChange(session, 'operation-added', operation);

        return operation;
    }

    removeOperation(sessionId: string, operationId: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        const index = session.operations.findIndex(op => op.id === operationId);
        if (index >= 0) {
            session.operations.splice(index, 1);
            this.fireSessionChange(session, 'updated');
        }
    }

    updateOperationStatus(sessionId: string, operationId: string, status: EditOperationStatus): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        const operation = session.operations.find(op => op.id === operationId);
        if (operation) {
            operation.status = status;
            if (status === EditOperationStatus.Applied) {
                operation.appliedAt = Date.now();
            }
            this.fireSessionChange(session, 'operation-updated', operation);
        }
    }

    setHunkAccepted(sessionId: string, operationId: string, hunkId: string, accepted: boolean): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        const operation = session.operations.find(op => op.id === operationId);
        if (operation?.change.hunks) {
            const hunk = operation.change.hunks.find(h => h.id === hunkId);
            if (hunk) {
                hunk.accepted = accepted;
                this.fireSessionChange(session, 'operation-updated', operation);
            }
        }
    }

    async preview(sessionId: string): Promise<EditSession> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // Refresh file contents for conflict detection
        for (const operation of session.operations) {
            if (operation.change.type === FileChangeType.Modify ||
                operation.change.type === FileChangeType.Delete) {
                const currentContent = await this.readFile(operation.change.filePath);
                if (currentContent !== operation.change.originalContent) {
                    operation.status = EditOperationStatus.Conflict;
                }
            }
        }

        return session;
    }

    async apply(sessionId: string, options: ApplyOptions = {}): Promise<EditSessionResult> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        session.status = EditSessionStatus.Applying;
        this.fireSessionChange(session, 'updated');

        const result: EditSessionResult = {
            session,
            success: true,
            successCount: 0,
            failedCount: 0,
            skippedCount: 0,
            errors: []
        };

        // Create backups if requested
        if (options.createBackup) {
            await this.createBackups(session);
        }

        // Apply each pending operation
        for (const operation of session.operations) {
            if (operation.status === EditOperationStatus.Rejected) {
                result.skippedCount++;
                continue;
            }

            if (operation.status !== EditOperationStatus.Pending) {
                continue;
            }

            try {
                await this.applyOperation(operation, options);
                operation.status = EditOperationStatus.Applied;
                operation.appliedAt = Date.now();
                result.successCount++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                operation.status = EditOperationStatus.Failed;
                operation.error = errorMessage;
                result.failedCount++;
                result.errors.push({ operationId: operation.id, error: errorMessage });
                result.success = false;

                if (options.stopOnError) {
                    break;
                }
            }
        }

        // Update session status
        if (result.failedCount === 0 && result.skippedCount === 0) {
            session.status = EditSessionStatus.Completed;
        } else if (result.successCount > 0) {
            session.status = EditSessionStatus.PartiallyCompleted;
        } else {
            session.status = EditSessionStatus.Cancelled;
        }

        session.completedAt = Date.now();
        this.fireSessionChange(session, 'completed');

        return result;
    }

    async revert(sessionId: string): Promise<EditSessionResult> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        const result: EditSessionResult = {
            session,
            success: true,
            successCount: 0,
            failedCount: 0,
            skippedCount: 0,
            errors: []
        };

        // Get backups
        const backupMap = this.backups.get(sessionId);

        // Revert applied operations in reverse order
        const appliedOps = session.operations.filter(op => op.status === EditOperationStatus.Applied);

        for (let i = appliedOps.length - 1; i >= 0; i--) {
            const operation = appliedOps[i];

            try {
                await this.revertOperation(operation, backupMap);
                operation.status = EditOperationStatus.Reverted;
                result.successCount++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                operation.error = errorMessage;
                result.failedCount++;
                result.errors.push({ operationId: operation.id, error: errorMessage });
                result.success = false;
            }
        }

        session.status = EditSessionStatus.Reverted;
        this.fireSessionChange(session, 'updated');

        // Clear backups
        this.backups.delete(sessionId);

        return result;
    }

    cancel(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        session.status = EditSessionStatus.Cancelled;
        session.completedAt = Date.now();
        this.fireSessionChange(session, 'cancelled');
    }

    async checkConflicts(sessionId: string): Promise<EditConflict[]> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return [];
        }

        const conflicts: EditConflict[] = [];

        for (const operation of session.operations) {
            if (operation.change.type === FileChangeType.Modify ||
                operation.change.type === FileChangeType.Delete) {

                const currentContent = await this.readFile(operation.change.filePath);

                if (currentContent !== undefined &&
                    operation.change.originalContent !== undefined &&
                    currentContent !== operation.change.originalContent) {

                    conflicts.push({
                        operation,
                        description: `File ${operation.change.filePath} has been modified since the edit was created`,
                        diskContent: currentContent,
                        expectedContent: operation.change.originalContent,
                        resolutions: [
                            {
                                type: 'keep-ours',
                                description: 'Apply our changes, overwriting disk changes',
                                resultContent: operation.change.newContent
                            },
                            {
                                type: 'keep-theirs',
                                description: 'Keep disk changes, discard our changes',
                                resultContent: currentContent
                            },
                            {
                                type: 'manual',
                                description: 'Manually resolve the conflict'
                            }
                        ]
                    });

                    operation.status = EditOperationStatus.Conflict;
                }
            }
        }

        return conflicts;
    }

    generateDiff(operation: EditOperation, options: DiffOptions = {}): string {
        const change = operation.change;

        if (change.type === FileChangeType.Create) {
            return this.formatNewFileDiff(change.filePath, change.newContent || '');
        }

        if (change.type === FileChangeType.Delete) {
            return this.formatDeleteFileDiff(change.filePath, change.originalContent || '');
        }

        if (change.type === FileChangeType.Rename) {
            return this.formatRenameDiff(change.filePath, change.newFilePath || '');
        }

        // Modify operation
        if (!change.originalContent || !change.newContent) {
            return '';
        }

        return this.generateUnifiedDiff(
            change.filePath,
            change.originalContent,
            change.newContent,
            options
        );
    }

    // Abstract methods to be implemented by browser-specific service
    protected abstract readFile(filePath: string): Promise<string | undefined>;
    protected abstract writeFile(filePath: string, content: string): Promise<void>;
    protected abstract deleteFile(filePath: string): Promise<void>;
    protected abstract renameFile(oldPath: string, newPath: string): Promise<void>;
    protected abstract fileExists(filePath: string): Promise<boolean>;

    protected async applyOperation(operation: EditOperation, options: ApplyOptions): Promise<void> {
        const change = operation.change;

        switch (change.type) {
            case FileChangeType.Create:
                if (change.newContent !== undefined) {
                    await this.writeFile(change.filePath, change.newContent);
                }
                break;

            case FileChangeType.Modify:
                if (change.newContent !== undefined) {
                    // If we have hunks, apply only accepted hunks
                    if (change.hunks && change.hunks.length > 0) {
                        const acceptedContent = this.applyAcceptedHunks(
                            change.originalContent || '',
                            change.hunks
                        );
                        await this.writeFile(change.filePath, acceptedContent);
                    } else {
                        await this.writeFile(change.filePath, change.newContent);
                    }
                }
                break;

            case FileChangeType.Delete:
                await this.deleteFile(change.filePath);
                break;

            case FileChangeType.Rename:
                if (change.newFilePath) {
                    await this.renameFile(change.filePath, change.newFilePath);
                }
                break;
        }

        if (options.saveAfterApply) {
            // File is already saved by writeFile
        }
    }

    protected async revertOperation(
        operation: EditOperation,
        backupMap?: Map<string, string>
    ): Promise<void> {
        const change = operation.change;

        switch (change.type) {
            case FileChangeType.Create:
                // Delete the created file
                await this.deleteFile(change.filePath);
                break;

            case FileChangeType.Modify:
                // Restore original content
                if (backupMap?.has(change.filePath)) {
                    await this.writeFile(change.filePath, backupMap.get(change.filePath)!);
                } else if (change.originalContent !== undefined) {
                    await this.writeFile(change.filePath, change.originalContent);
                }
                break;

            case FileChangeType.Delete:
                // Recreate the file
                if (backupMap?.has(change.filePath)) {
                    await this.writeFile(change.filePath, backupMap.get(change.filePath)!);
                } else if (change.originalContent !== undefined) {
                    await this.writeFile(change.filePath, change.originalContent);
                }
                break;

            case FileChangeType.Rename:
                // Rename back
                if (change.newFilePath) {
                    await this.renameFile(change.newFilePath, change.filePath);
                }
                break;
        }
    }

    protected async createBackups(session: EditSession): Promise<void> {
        const backupMap = new Map<string, string>();

        for (const operation of session.operations) {
            if (operation.change.type === FileChangeType.Modify ||
                operation.change.type === FileChangeType.Delete) {

                const content = await this.readFile(operation.change.filePath);
                if (content !== undefined) {
                    backupMap.set(operation.change.filePath, content);
                }
            }
        }

        this.backups.set(session.id, backupMap);
    }

    protected generateHunks(original: string, modified: string): DiffHunk[] {
        // Simple hunk generation - can be enhanced with proper diff algorithm
        const hunks: DiffHunk[] = [];
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');

        // For now, create a single hunk for the entire change
        // In a real implementation, use a proper diff algorithm
        const hunk: DiffHunk = {
            id: generateUuid(),
            originalRange: {
                startLine: 1,
                startColumn: 1,
                endLine: originalLines.length,
                endColumn: (originalLines[originalLines.length - 1]?.length || 0) + 1
            },
            newRange: {
                startLine: 1,
                startColumn: 1,
                endLine: modifiedLines.length,
                endColumn: (modifiedLines[modifiedLines.length - 1]?.length || 0) + 1
            },
            removedLines: originalLines,
            addedLines: modifiedLines,
            contextBefore: [],
            contextAfter: [],
            accepted: true
        };

        hunks.push(hunk);
        return hunks;
    }

    protected applyAcceptedHunks(original: string, hunks: DiffHunk[]): string {
        // Apply only accepted hunks
        const acceptedHunks = hunks.filter(h => h.accepted);

        if (acceptedHunks.length === 0) {
            return original;
        }

        // Simple implementation: if all hunks accepted, return full new content
        // More sophisticated implementation would merge selectively
        const lines = original.split('\n');
        let result = [...lines];

        // Apply hunks in reverse order to maintain line numbers
        const sortedHunks = [...acceptedHunks].sort(
            (a, b) => b.originalRange.startLine - a.originalRange.startLine
        );

        for (const hunk of sortedHunks) {
            const startIdx = hunk.originalRange.startLine - 1;
            const deleteCount = hunk.originalRange.endLine - hunk.originalRange.startLine + 1;
            result.splice(startIdx, deleteCount, ...hunk.addedLines);
        }

        return result.join('\n');
    }

    protected generateUnifiedDiff(
        filePath: string,
        original: string,
        modified: string,
        _options: DiffOptions
    ): string {
        // const contextLines = options.contextLines ?? 3; // TODO: Use for enhanced diff
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');

        const lines: string[] = [
            `--- a/${filePath}`,
            `+++ b/${filePath}`
        ];

        // Simple diff output - in real implementation, use proper algorithm
        lines.push(`@@ -1,${originalLines.length} +1,${modifiedLines.length} @@`);

        for (const line of originalLines) {
            lines.push(`-${line}`);
        }

        for (const line of modifiedLines) {
            lines.push(`+${line}`);
        }

        return lines.join('\n');
    }

    protected formatNewFileDiff(filePath: string, content: string): string {
        const lines = content.split('\n');
        const result = [
            `--- /dev/null`,
            `+++ b/${filePath}`,
            `@@ -0,0 +1,${lines.length} @@`
        ];

        for (const line of lines) {
            result.push(`+${line}`);
        }

        return result.join('\n');
    }

    protected formatDeleteFileDiff(filePath: string, content: string): string {
        const lines = content.split('\n');
        const result = [
            `--- a/${filePath}`,
            `+++ /dev/null`,
            `@@ -1,${lines.length} +0,0 @@`
        ];

        for (const line of lines) {
            result.push(`-${line}`);
        }

        return result.join('\n');
    }

    protected formatRenameDiff(oldPath: string, newPath: string): string {
        return [
            `diff --git a/${oldPath} b/${newPath}`,
            `similarity index 100%`,
            `rename from ${oldPath}`,
            `rename to ${newPath}`
        ].join('\n');
    }

    protected fireSessionChange(
        session: EditSession,
        changeType: EditSessionChangeEvent['changeType'],
        operation?: EditOperation
    ): void {
        this.onSessionChangedEmitter.fire({ session, changeType, operation });
    }
}
