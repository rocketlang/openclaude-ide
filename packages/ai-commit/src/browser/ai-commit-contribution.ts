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
import { MessageService } from '@theia/core';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { QuickPickService, QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { AICommitFrontendService } from './ai-commit-frontend-service';
import { COMMIT_TYPE_LABELS, CommitType, GITMOJI } from '../common/ai-commit-protocol';
import { ScmService } from '@theia/scm/lib/browser/scm-service';

export namespace AICommitCommands {
    export const GENERATE: Command = {
        id: 'ai-commit.generate',
        label: 'AI: Generate Commit Message',
        category: 'AI'
    };

    export const GENERATE_WITH_OPTIONS: Command = {
        id: 'ai-commit.generateWithOptions',
        label: 'AI: Generate Commit Message (with options)',
        category: 'AI'
    };

    export const ACCEPT_MESSAGE: Command = {
        id: 'ai-commit.accept',
        label: 'AI: Accept Generated Commit Message',
        category: 'AI'
    };

    export const SHOW_ALTERNATIVES: Command = {
        id: 'ai-commit.showAlternatives',
        label: 'AI: Show Alternative Commit Messages',
        category: 'AI'
    };

    export const CHANGE_TYPE: Command = {
        id: 'ai-commit.changeType',
        label: 'AI: Change Commit Type',
        category: 'AI'
    };
}

@injectable()
export class AICommitContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(AICommitFrontendService)
    protected readonly aiCommitService: AICommitFrontendService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    protected lastGeneratedMessage?: {
        message: string;
        alternatives?: string[];
    };

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AICommitCommands.GENERATE, {
            execute: () => this.generateCommitMessage(),
            isEnabled: () => !this.aiCommitService.isGenerating
        });

        registry.registerCommand(AICommitCommands.GENERATE_WITH_OPTIONS, {
            execute: () => this.generateWithOptions(),
            isEnabled: () => !this.aiCommitService.isGenerating
        });

        registry.registerCommand(AICommitCommands.ACCEPT_MESSAGE, {
            execute: () => this.acceptMessage(),
            isEnabled: () => this.lastGeneratedMessage !== undefined
        });

        registry.registerCommand(AICommitCommands.SHOW_ALTERNATIVES, {
            execute: () => this.showAlternatives(),
            isEnabled: () => this.lastGeneratedMessage?.alternatives !== undefined &&
                this.lastGeneratedMessage.alternatives.length > 0
        });

        registry.registerCommand(AICommitCommands.CHANGE_TYPE, {
            execute: () => this.changeCommitType(),
            isEnabled: () => !this.aiCommitService.isGenerating
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        // Add to SCM title menu
        menus.registerMenuAction(['scm-title-menu'], {
            commandId: AICommitCommands.GENERATE.id,
            label: '✨ Generate Message',
            order: '0'
        });

        // Add to SCM input menu
        menus.registerMenuAction(['scm-input-menu'], {
            commandId: AICommitCommands.GENERATE.id,
            label: 'AI: Generate Commit Message',
            order: '0'
        });

        menus.registerMenuAction(['scm-input-menu'], {
            commandId: AICommitCommands.GENERATE_WITH_OPTIONS.id,
            label: 'AI: Generate with Options...',
            order: '1'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: AICommitCommands.GENERATE.id,
            keybinding: 'ctrl+shift+g'
        });

        keybindings.registerKeybinding({
            command: AICommitCommands.GENERATE.id,
            keybinding: 'cmd+shift+g',
            when: 'isMac'
        });
    }

    protected async generateCommitMessage(): Promise<void> {
        const hasStagedChanges = await this.aiCommitService.hasStagedChanges();
        if (!hasStagedChanges) {
            this.messageService.info('No staged changes. Stage some changes first.');
            return;
        }

        this.messageService.info('Generating commit message...');

        const result = await this.aiCommitService.generateCommitMessage();
        if (result) {
            this.lastGeneratedMessage = {
                message: result.message,
                alternatives: result.alternatives
            };

            // Show quick pick with options
            const items: QuickPickItem[] = [
                {
                    label: '$(check) Accept',
                    description: result.message.split('\n')[0],
                    detail: `Confidence: ${Math.round(result.confidence * 100)}%`
                }
            ];

            if (result.alternatives && result.alternatives.length > 0) {
                items.push({
                    label: '$(list-unordered) Show Alternatives',
                    description: `${result.alternatives.length} alternative(s) available`
                });
            }

            items.push({
                label: '$(edit) Edit',
                description: 'Edit the message before applying'
            });

            const selected = await this.quickPickService.show(items, {
                placeholder: 'Generated commit message'
            });

            if (selected) {
                if (selected.label.includes('Accept')) {
                    this.aiCommitService.applyCommitMessage(result.message);
                } else if (selected.label.includes('Alternatives')) {
                    this.showAlternatives();
                } else if (selected.label.includes('Edit')) {
                    // Apply and let user edit
                    this.aiCommitService.applyCommitMessage(result.message);
                    this.messageService.info('Message applied - edit as needed');
                }
            }
        }
    }

    protected async generateWithOptions(): Promise<void> {
        // Let user select commit type
        const typeItems: QuickPickItem[] = Object.entries(COMMIT_TYPE_LABELS).map(([type, label]) => ({
            label: `${GITMOJI[type as CommitType]} ${type}`,
            description: label,
            detail: type
        }));

        const selectedType = await this.quickPickService.show(typeItems, {
            placeholder: 'Select commit type (or leave empty for auto-detect)'
        });

        // Ask about emojis
        const useEmojis = await this.quickPickService.show([
            { label: '$(smiley) Yes', description: 'Include gitmoji' },
            { label: '$(circle-slash) No', description: 'Plain text' }
        ], {
            placeholder: 'Include emojis in commit message?'
        });

        const options = {
            preferredType: selectedType?.detail as CommitType | undefined,
            useEmojis: useEmojis?.label.includes('Yes'),
            conventionalCommit: true
        };

        this.messageService.info('Generating commit message with options...');

        const result = await this.aiCommitService.generateCommitMessage(options);
        if (result) {
            this.lastGeneratedMessage = {
                message: result.message,
                alternatives: result.alternatives
            };
            this.aiCommitService.applyCommitMessage(result.message);
        }
    }

    protected acceptMessage(): void {
        if (this.lastGeneratedMessage) {
            this.aiCommitService.applyCommitMessage(this.lastGeneratedMessage.message);
        }
    }

    protected async showAlternatives(): Promise<void> {
        if (!this.lastGeneratedMessage?.alternatives) {
            return;
        }

        const items: QuickPickItem[] = this.lastGeneratedMessage.alternatives.map((alt, index) => ({
            label: `Alternative ${index + 1}`,
            description: alt.split('\n')[0],
            detail: alt
        }));

        // Add original as option
        items.unshift({
            label: 'Original',
            description: this.lastGeneratedMessage.message.split('\n')[0],
            detail: this.lastGeneratedMessage.message
        });

        const selected = await this.quickPickService.show(items, {
            placeholder: 'Select a commit message'
        });

        if (selected && selected.detail) {
            this.aiCommitService.applyCommitMessage(selected.detail);
        }
    }

    protected async changeCommitType(): Promise<void> {
        const selectedRepository = this.scmService.selectedRepository;
        if (!selectedRepository || !selectedRepository.input.value) {
            this.messageService.info('No commit message to change type for');
            return;
        }

        const currentMessage = selectedRepository.input.value;

        // Parse current message
        const conventionalMatch = currentMessage.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);

        const typeItems: QuickPickItem[] = Object.entries(COMMIT_TYPE_LABELS).map(([type, label]) => ({
            label: `${GITMOJI[type as CommitType]} ${type}`,
            description: label,
            detail: type
        }));

        const selectedType = await this.quickPickService.show(typeItems, {
            placeholder: 'Select new commit type'
        });

        if (selectedType && selectedType.detail) {
            const newType = selectedType.detail;

            if (conventionalMatch) {
                // Replace type in conventional commit
                const [, , scope, breaking, subject] = conventionalMatch;
                const newMessage = `${newType}${scope ? `(${scope})` : ''}${breaking || ''}: ${subject}`;
                selectedRepository.input.value = newMessage;
            } else {
                // Prepend type to non-conventional message
                selectedRepository.input.value = `${newType}: ${currentMessage}`;
            }
        }
    }
}
