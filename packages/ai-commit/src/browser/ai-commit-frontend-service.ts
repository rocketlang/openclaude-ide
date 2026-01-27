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
import { Emitter, Event, MessageService } from '@theia/core';
import {
    AICommitService,
    DiffAnalysis,
    GeneratedCommitMessage,
    CommitMessageOptions
} from '../common/ai-commit-protocol';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { GitRepositoryTracker } from '@theia/git/lib/browser/git-repository-tracker';

export const AICommitFrontendService = Symbol('AICommitFrontendService');

export interface AICommitFrontendService {
    /**
     * Generate a commit message for the current repository
     */
    generateCommitMessage(options?: CommitMessageOptions): Promise<GeneratedCommitMessage | undefined>;

    /**
     * Apply a generated message to the SCM input
     */
    applyCommitMessage(message: string): void;

    /**
     * Get the current diff analysis
     */
    getCurrentDiffAnalysis(): Promise<DiffAnalysis | undefined>;

    /**
     * Check if there are staged changes
     */
    hasStagedChanges(): Promise<boolean>;

    /**
     * Event fired when a commit message is generated
     */
    onMessageGenerated: Event<GeneratedCommitMessage>;

    /**
     * Event fired when generation starts
     */
    onGenerationStarted: Event<void>;

    /**
     * Event fired when generation ends
     */
    onGenerationEnded: Event<void>;

    /**
     * Whether generation is in progress
     */
    isGenerating: boolean;
}

@injectable()
export class AICommitFrontendServiceImpl implements AICommitFrontendService {

    @inject(AICommitService)
    protected readonly aiCommitService: AICommitService;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(GitRepositoryTracker)
    protected readonly repositoryTracker: GitRepositoryTracker;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected readonly onMessageGeneratedEmitter = new Emitter<GeneratedCommitMessage>();
    readonly onMessageGenerated = this.onMessageGeneratedEmitter.event;

    protected readonly onGenerationStartedEmitter = new Emitter<void>();
    readonly onGenerationStarted = this.onGenerationStartedEmitter.event;

    protected readonly onGenerationEndedEmitter = new Emitter<void>();
    readonly onGenerationEnded = this.onGenerationEndedEmitter.event;

    protected _isGenerating = false;
    protected lastGeneratedMessage?: GeneratedCommitMessage;
    protected lastDiffAnalysis?: DiffAnalysis;

    get isGenerating(): boolean {
        return this._isGenerating;
    }

    @postConstruct()
    protected init(): void {
        // Watch for repository changes
        this.repositoryTracker.onDidChangeRepository(() => {
            this.lastDiffAnalysis = undefined;
            this.lastGeneratedMessage = undefined;
        });
    }

    async generateCommitMessage(options?: CommitMessageOptions): Promise<GeneratedCommitMessage | undefined> {
        const repository = this.repositoryTracker.selectedRepository;
        if (!repository) {
            this.messageService.warn('No Git repository selected');
            return undefined;
        }

        const repositoryPath = repository.localUri;

        try {
            this._isGenerating = true;
            this.onGenerationStartedEmitter.fire();

            // Analyze the diff
            const analysis = await this.aiCommitService.analyzeDiff(repositoryPath, true);
            this.lastDiffAnalysis = analysis;

            if (analysis.files.length === 0) {
                this.messageService.info('No staged changes to commit');
                return undefined;
            }

            // Generate commit message
            const message = await this.aiCommitService.generateCommitMessage(analysis, options);
            this.lastGeneratedMessage = message;

            this.onMessageGeneratedEmitter.fire(message);

            return message;
        } catch (error) {
            this.messageService.error(`Failed to generate commit message: ${error}`);
            return undefined;
        } finally {
            this._isGenerating = false;
            this.onGenerationEndedEmitter.fire();
        }
    }

    applyCommitMessage(message: string): void {
        const selectedRepository = this.scmService.selectedRepository;
        if (selectedRepository && selectedRepository.input) {
            selectedRepository.input.value = message;
            this.messageService.info('Commit message applied');

            // Record this for learning
            if (this.lastDiffAnalysis && this.lastGeneratedMessage) {
                this.aiCommitService.recordCommitMessage({
                    repositoryPath: this.lastDiffAnalysis.repositoryPath,
                    generatedMessage: this.lastGeneratedMessage.message,
                    finalMessage: message,
                    acceptedAsIs: message === this.lastGeneratedMessage.message,
                    diffAnalysis: this.lastDiffAnalysis
                }).catch(() => {
                    // Ignore recording errors
                });
            }
        } else {
            this.messageService.warn('No SCM repository selected');
        }
    }

    async getCurrentDiffAnalysis(): Promise<DiffAnalysis | undefined> {
        const repository = this.repositoryTracker.selectedRepository;
        if (!repository) {
            return undefined;
        }

        try {
            const analysis = await this.aiCommitService.analyzeDiff(repository.localUri, true);
            this.lastDiffAnalysis = analysis;
            return analysis;
        } catch {
            return undefined;
        }
    }

    async hasStagedChanges(): Promise<boolean> {
        const analysis = await this.getCurrentDiffAnalysis();
        return analysis !== undefined && analysis.files.length > 0;
    }
}
