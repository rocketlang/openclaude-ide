// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core';
import { OpenClaudeBackendService, SkillInfo } from '../../common/openclaude-protocol';

export const SKILLS_EXPLORER_WIDGET_ID = 'openclaude-skills-explorer';
export const SKILLS_EXPLORER_WIDGET_LABEL = 'Skills Explorer';

@injectable()
export class SkillsExplorerWidget extends ReactWidget {

    static readonly ID = SKILLS_EXPLORER_WIDGET_ID;
    static readonly LABEL = SKILLS_EXPLORER_WIDGET_LABEL;

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    protected skills: SkillInfo[] = [];
    protected loading = false;
    protected error: string | undefined;

    @postConstruct()
    protected init(): void {
        this.id = SkillsExplorerWidget.ID;
        this.title.label = SkillsExplorerWidget.LABEL;
        this.title.caption = SkillsExplorerWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-extensions';
        this.loadSkills();
    }

    async loadSkills(): Promise<void> {
        this.loading = true;
        this.error = undefined;
        this.update();

        try {
            this.skills = await this.backendService.getLoadedSkills();
        } catch (err) {
            this.error = `${err}`;
        } finally {
            this.loading = false;
            this.update();
        }
    }

    protected handleReload = async (): Promise<void> => {
        try {
            const count = await this.backendService.reloadSkills();
            this.messageService.info(`Reloaded ${count} skill(s)`);
            await this.loadSkills();
        } catch (err) {
            this.messageService.error(`Failed to reload skills: ${err}`);
        }
    };

    protected render(): React.ReactNode {
        return (
            <div className='openclaude-skills-explorer'>
                <div className='openclaude-skills-explorer-header'>
                    <h3>Skills Explorer</h3>
                    <button
                        className='openclaude-skills-explorer-reload theia-button'
                        onClick={this.handleReload}
                        title='Reload skills from disk'
                    >
                        Reload
                    </button>
                </div>

                {this.loading && (
                    <div className='openclaude-skills-explorer-loading'>
                        Loading skills...
                    </div>
                )}

                {this.error && (
                    <div className='openclaude-skills-explorer-error'>
                        {this.error}
                    </div>
                )}

                {!this.loading && !this.error && this.skills.length === 0 && (
                    <div className='openclaude-skills-explorer-empty'>
                        <p>No skills installed.</p>
                        <p className='openclaude-skills-explorer-hint'>
                            Add SKILL.md files to <code>.openclaude/skills/</code> or <code>skills/</code> in your workspace.
                        </p>
                    </div>
                )}

                {!this.loading && this.skills.length > 0 && (
                    <div className='openclaude-skills-explorer-list'>
                        <div className='openclaude-skills-explorer-count'>
                            {this.skills.length} skill{this.skills.length !== 1 ? 's' : ''} loaded
                        </div>
                        {this.skills.map(skill => this.renderSkillCard(skill))}
                    </div>
                )}
            </div>
        );
    }

    protected renderSkillCard(skill: SkillInfo): React.ReactNode {
        return (
            <div key={skill.name} className='openclaude-skills-explorer-card'>
                <div className='openclaude-skills-explorer-card-header'>
                    <span className='openclaude-skills-explorer-card-name'>{skill.name}</span>
                    <span className={`openclaude-skills-explorer-card-scope openclaude-scope-${skill.scope}`}>
                        {skill.scope}
                    </span>
                </div>
                <div className='openclaude-skills-explorer-card-description'>
                    {skill.description}
                </div>
                <div className='openclaude-skills-explorer-card-path'>
                    {skill.sourcePath}
                </div>
            </div>
        );
    }
}
