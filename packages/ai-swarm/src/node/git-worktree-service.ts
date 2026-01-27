// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Represents a git worktree for agent isolation
 */
export interface GitWorktree {
    /** Unique identifier for this worktree */
    id: string;
    /** Session ID this worktree belongs to */
    sessionId: string;
    /** Agent ID using this worktree */
    agentId: string;
    /** Branch name for this worktree */
    branch: string;
    /** Path to the worktree directory */
    worktreePath: string;
    /** Creation timestamp */
    createdAt: number;
    /** Status of the worktree */
    status: WorktreeStatus;
    /** Base branch this was created from */
    baseBranch: string;
    /** Number of commits in this worktree */
    commitCount: number;
}

export type WorktreeStatus = 'active' | 'merged' | 'abandoned' | 'deleted';

/**
 * Result of merging a worktree
 */
export interface MergeResult {
    success: boolean;
    conflicts?: string[];
    mergedFiles?: string[];
    errorMessage?: string;
}

/**
 * Configuration for worktree service
 */
export interface WorktreeConfig {
    /** Base directory for worktrees (default: .swarm-worktrees) */
    worktreeBaseDir: string;
    /** Whether to auto-cleanup abandoned worktrees */
    autoCleanup: boolean;
    /** Maximum age for worktrees before cleanup (ms) */
    maxWorktreeAge: number;
    /** Whether to auto-commit changes before merge */
    autoCommitOnMerge: boolean;
}

const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
    worktreeBaseDir: '.swarm-worktrees',
    autoCleanup: true,
    maxWorktreeAge: 24 * 60 * 60 * 1000, // 24 hours
    autoCommitOnMerge: true
};

export const GitWorktreeService = Symbol('GitWorktreeService');

/**
 * Service for managing git worktrees to isolate agent work
 */
export interface GitWorktreeService {
    /**
     * Check if the workspace is a git repository
     */
    isGitRepository(workspacePath: string): Promise<boolean>;

    /**
     * Create a new worktree for an agent
     */
    createWorktree(
        sessionId: string,
        agentId: string,
        workspacePath: string,
        branchPrefix?: string
    ): Promise<GitWorktree>;

    /**
     * Get a worktree by ID
     */
    getWorktree(worktreeId: string): GitWorktree | undefined;

    /**
     * Get all worktrees for a session
     */
    getWorktreesForSession(sessionId: string): GitWorktree[];

    /**
     * Get worktree for a specific agent
     */
    getWorktreeForAgent(sessionId: string, agentId: string): GitWorktree | undefined;

    /**
     * Merge worktree changes back to base branch
     */
    mergeWorktree(worktreeId: string, commitMessage?: string): Promise<MergeResult>;

    /**
     * Abandon a worktree (mark for cleanup)
     */
    abandonWorktree(worktreeId: string): Promise<void>;

    /**
     * Delete a worktree and its branch
     */
    deleteWorktree(worktreeId: string): Promise<void>;

    /**
     * Cleanup old/abandoned worktrees
     */
    cleanup(workspacePath: string): Promise<number>;

    /**
     * List files changed in a worktree
     */
    getChangedFiles(worktreeId: string): Promise<string[]>;

    /**
     * Get diff of changes in a worktree
     */
    getDiff(worktreeId: string): Promise<string>;
}

@injectable()
export class GitWorktreeServiceImpl implements GitWorktreeService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected config: WorktreeConfig = DEFAULT_WORKTREE_CONFIG;

    protected worktrees: Map<string, GitWorktree> = new Map();

    async isGitRepository(workspacePath: string): Promise<boolean> {
        try {
            const gitDir = path.join(workspacePath, '.git');
            const stats = await fs.stat(gitDir);
            return stats.isDirectory() || stats.isFile(); // .git can be a file for worktrees
        } catch {
            return false;
        }
    }

    async createWorktree(
        sessionId: string,
        agentId: string,
        workspacePath: string,
        branchPrefix: string = 'swarm'
    ): Promise<GitWorktree> {
        // Check if it's a git repo
        const isRepo = await this.isGitRepository(workspacePath);
        if (!isRepo) {
            throw new Error(`Not a git repository: ${workspacePath}`);
        }

        // Get current branch as base
        const { stdout: currentBranch } = await execAsync(
            'git rev-parse --abbrev-ref HEAD',
            { cwd: workspacePath }
        );
        const baseBranch = currentBranch.trim();

        // Generate unique branch name
        const timestamp = Date.now();
        const shortAgentId = agentId.slice(0, 8);
        const branchName = `${branchPrefix}/${sessionId.slice(0, 8)}/${shortAgentId}-${timestamp}`;

        // Create worktree directory
        const worktreeBaseDir = path.join(workspacePath, this.config.worktreeBaseDir);
        await fs.mkdir(worktreeBaseDir, { recursive: true });

        const worktreeDir = path.join(worktreeBaseDir, `${shortAgentId}-${timestamp}`);

        // Create new branch and worktree
        try {
            // Create the worktree with a new branch
            await execAsync(
                `git worktree add -b "${branchName}" "${worktreeDir}"`,
                { cwd: workspacePath }
            );

            const worktreeId = `wt-${sessionId.slice(0, 8)}-${shortAgentId}-${timestamp}`;

            const worktree: GitWorktree = {
                id: worktreeId,
                sessionId,
                agentId,
                branch: branchName,
                worktreePath: worktreeDir,
                createdAt: timestamp,
                status: 'active',
                baseBranch,
                commitCount: 0
            };

            this.worktrees.set(worktreeId, worktree);

            this.logger.info(`Created worktree: ${worktreeId} at ${worktreeDir}`);

            return worktree;
        } catch (error) {
            this.logger.error(`Failed to create worktree: ${error}`);
            throw error;
        }
    }

    getWorktree(worktreeId: string): GitWorktree | undefined {
        return this.worktrees.get(worktreeId);
    }

    getWorktreesForSession(sessionId: string): GitWorktree[] {
        return Array.from(this.worktrees.values())
            .filter(wt => wt.sessionId === sessionId);
    }

    getWorktreeForAgent(sessionId: string, agentId: string): GitWorktree | undefined {
        return Array.from(this.worktrees.values())
            .find(wt => wt.sessionId === sessionId && wt.agentId === agentId && wt.status === 'active');
    }

    async mergeWorktree(worktreeId: string, commitMessage?: string): Promise<MergeResult> {
        const worktree = this.worktrees.get(worktreeId);
        if (!worktree) {
            return { success: false, errorMessage: `Worktree not found: ${worktreeId}` };
        }

        if (worktree.status !== 'active') {
            return { success: false, errorMessage: `Worktree is not active: ${worktree.status}` };
        }

        try {
            // Get the main repo path (parent of worktree base dir)
            const mainRepoPath = path.dirname(path.dirname(worktree.worktreePath));

            // Check for uncommitted changes in worktree
            const { stdout: statusOutput } = await execAsync(
                'git status --porcelain',
                { cwd: worktree.worktreePath }
            );

            // Auto-commit if there are changes and config allows
            if (statusOutput.trim() && this.config.autoCommitOnMerge) {
                const autoMessage = commitMessage ||
                    `[swarm] Auto-commit from agent ${worktree.agentId.slice(0, 8)}`;

                await execAsync('git add -A', { cwd: worktree.worktreePath });
                await execAsync(
                    `git commit -m "${autoMessage}"`,
                    { cwd: worktree.worktreePath }
                );
                worktree.commitCount++;
            }

            // Get list of changed files before merge
            const { stdout: diffFiles } = await execAsync(
                `git diff --name-only ${worktree.baseBranch}...${worktree.branch}`,
                { cwd: mainRepoPath }
            );
            const mergedFiles = diffFiles.trim().split('\n').filter(f => f);

            // Switch to base branch in main repo
            await execAsync(
                `git checkout ${worktree.baseBranch}`,
                { cwd: mainRepoPath }
            );

            // Merge the worktree branch
            try {
                const finalMessage = commitMessage ||
                    `[swarm] Merge changes from agent ${worktree.agentId.slice(0, 8)}`;

                await execAsync(
                    `git merge --no-ff ${worktree.branch} -m "${finalMessage}"`,
                    { cwd: mainRepoPath }
                );

                worktree.status = 'merged';
                this.worktrees.set(worktreeId, worktree);

                this.logger.info(`Merged worktree: ${worktreeId}`);

                return {
                    success: true,
                    mergedFiles
                };
            } catch (mergeError: unknown) {
                // Check for conflicts
                const { stdout: conflictFiles } = await execAsync(
                    'git diff --name-only --diff-filter=U',
                    { cwd: mainRepoPath }
                );

                if (conflictFiles.trim()) {
                    // Abort the merge
                    await execAsync('git merge --abort', { cwd: mainRepoPath });

                    return {
                        success: false,
                        conflicts: conflictFiles.trim().split('\n'),
                        errorMessage: 'Merge conflicts detected'
                    };
                }

                throw mergeError;
            }
        } catch (error) {
            this.logger.error(`Failed to merge worktree: ${error}`);
            return {
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async abandonWorktree(worktreeId: string): Promise<void> {
        const worktree = this.worktrees.get(worktreeId);
        if (!worktree) {
            throw new Error(`Worktree not found: ${worktreeId}`);
        }

        worktree.status = 'abandoned';
        this.worktrees.set(worktreeId, worktree);

        this.logger.info(`Abandoned worktree: ${worktreeId}`);
    }

    async deleteWorktree(worktreeId: string): Promise<void> {
        const worktree = this.worktrees.get(worktreeId);
        if (!worktree) {
            throw new Error(`Worktree not found: ${worktreeId}`);
        }

        try {
            // Get main repo path
            const mainRepoPath = path.dirname(path.dirname(worktree.worktreePath));

            // Remove the worktree
            await execAsync(
                `git worktree remove "${worktree.worktreePath}" --force`,
                { cwd: mainRepoPath }
            );

            // Delete the branch if it wasn't merged
            if (worktree.status !== 'merged') {
                try {
                    await execAsync(
                        `git branch -D "${worktree.branch}"`,
                        { cwd: mainRepoPath }
                    );
                } catch {
                    // Branch might already be deleted, ignore
                }
            }

            worktree.status = 'deleted';
            this.worktrees.delete(worktreeId);

            this.logger.info(`Deleted worktree: ${worktreeId}`);
        } catch (error) {
            this.logger.error(`Failed to delete worktree: ${error}`);
            throw error;
        }
    }

    async cleanup(workspacePath: string): Promise<number> {
        if (!this.config.autoCleanup) {
            return 0;
        }

        const now = Date.now();
        let cleanedCount = 0;

        for (const [worktreeId, worktree] of this.worktrees) {
            const age = now - worktree.createdAt;

            // Check if worktree is old enough to cleanup
            if (age > this.config.maxWorktreeAge) {
                // Only cleanup abandoned or merged worktrees
                if (worktree.status === 'abandoned' || worktree.status === 'merged') {
                    try {
                        await this.deleteWorktree(worktreeId);
                        cleanedCount++;
                    } catch (error) {
                        this.logger.warn(`Failed to cleanup worktree ${worktreeId}: ${error}`);
                    }
                }
            }
        }

        if (cleanedCount > 0) {
            this.logger.info(`Cleaned up ${cleanedCount} worktrees`);
        }

        // Also prune any orphaned worktrees from git
        try {
            await execAsync('git worktree prune', { cwd: workspacePath });
        } catch {
            // Ignore prune errors
        }

        return cleanedCount;
    }

    async getChangedFiles(worktreeId: string): Promise<string[]> {
        const worktree = this.worktrees.get(worktreeId);
        if (!worktree) {
            throw new Error(`Worktree not found: ${worktreeId}`);
        }

        try {
            // Get uncommitted changes
            const { stdout: uncommitted } = await execAsync(
                'git status --porcelain',
                { cwd: worktree.worktreePath }
            );

            // Get committed changes vs base branch
            const { stdout: committed } = await execAsync(
                `git diff --name-only ${worktree.baseBranch}...HEAD`,
                { cwd: worktree.worktreePath }
            );

            const files = new Set<string>();

            // Parse uncommitted
            uncommitted.split('\n').forEach(line => {
                const match = line.match(/^..\s+(.+)$/);
                if (match) {
                    files.add(match[1]);
                }
            });

            // Add committed
            committed.split('\n').forEach(file => {
                if (file.trim()) {
                    files.add(file.trim());
                }
            });

            return Array.from(files);
        } catch (error) {
            this.logger.error(`Failed to get changed files: ${error}`);
            return [];
        }
    }

    async getDiff(worktreeId: string): Promise<string> {
        const worktree = this.worktrees.get(worktreeId);
        if (!worktree) {
            throw new Error(`Worktree not found: ${worktreeId}`);
        }

        try {
            // Get both staged and unstaged changes
            const { stdout: uncommittedDiff } = await execAsync(
                'git diff HEAD',
                { cwd: worktree.worktreePath }
            );

            // Get committed changes vs base branch
            const { stdout: committedDiff } = await execAsync(
                `git diff ${worktree.baseBranch}...HEAD`,
                { cwd: worktree.worktreePath }
            );

            return [
                '=== Uncommitted Changes ===',
                uncommittedDiff || '(none)',
                '',
                '=== Committed Changes (vs base branch) ===',
                committedDiff || '(none)'
            ].join('\n');
        } catch (error) {
            this.logger.error(`Failed to get diff: ${error}`);
            return '';
        }
    }
}
