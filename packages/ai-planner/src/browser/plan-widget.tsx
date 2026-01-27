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
    PlanGeneratorService,
    PlanExecutorService,
    PlanStorageService,
    ExecutionPlan,
    PlanStep,
    PlanStatus,
    StepStatus,
    StepType,
    PlanProgress
} from '../common';

interface PlanWidgetState {
    plans: ExecutionPlan[];
    selectedPlanId?: string;
    newPlanPrompt: string;
    isGenerating: boolean;
    progress?: PlanProgress;
    expandedSteps: Set<string>;
}

/**
 * Widget for managing and executing AI plans
 */
@injectable()
export class PlanWidget extends ReactWidget {

    static readonly ID = 'ai-planner-widget';
    static readonly LABEL = 'AI Planner';

    @inject(PlanGeneratorService)
    protected readonly generator: PlanGeneratorService;

    @inject(PlanExecutorService)
    protected readonly executor: PlanExecutorService;

    @inject(PlanStorageService)
    protected readonly storage: PlanStorageService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected state: PlanWidgetState = {
        plans: [],
        newPlanPrompt: '',
        isGenerating: false,
        expandedSteps: new Set()
    };

    @postConstruct()
    protected async init(): Promise<void> {
        this.id = PlanWidget.ID;
        this.title.label = PlanWidget.LABEL;
        this.title.caption = 'AI Plan Execution';
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-tasklist';
        this.addClass('plan-widget');

        // Load existing plans
        this.state.plans = await this.storage.listPlans();

        // Subscribe to progress updates
        this.executor.onProgress(progress => {
            this.state.progress = progress;
            this.update();
        });

        this.executor.onStepComplete(({ planId, step }) => {
            this.refreshPlan(planId);
        });

        this.executor.onPlanComplete(plan => {
            this.refreshPlans();
            this.messageService.info(`Plan "${plan.title}" completed`);
        });

        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        return (
            <div className="plan-container">
                {this.renderHeader()}
                {this.renderNewPlanForm()}
                {this.renderPlanList()}
            </div>
        );
    }

    protected renderHeader(): React.ReactNode {
        return (
            <div className="plan-header">
                <div className="plan-header-title">
                    <span className="codicon codicon-tasklist" />
                    <span>Execution Plans</span>
                    <span className="badge">{this.state.plans.length}</span>
                </div>
            </div>
        );
    }

    protected renderNewPlanForm(): React.ReactNode {
        return (
            <div className="new-plan-form">
                <textarea
                    className="plan-prompt-input"
                    placeholder="Describe what you want to accomplish..."
                    value={this.state.newPlanPrompt}
                    onChange={e => {
                        this.state.newPlanPrompt = e.target.value;
                        this.update();
                    }}
                    disabled={this.state.isGenerating}
                    rows={3}
                />
                <div className="plan-form-actions">
                    <button
                        className="theia-button"
                        onClick={() => this.generatePlan()}
                        disabled={!this.state.newPlanPrompt.trim() || this.state.isGenerating}
                    >
                        {this.state.isGenerating ? (
                            <>
                                <span className="codicon codicon-loading codicon-modifier-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <span className="codicon codicon-sparkle" />
                                Generate Plan
                            </>
                        )}
                    </button>
                    <select
                        className="template-select"
                        onChange={e => this.useTemplate(e.target.value)}
                        value=""
                    >
                        <option value="" disabled>Use Template...</option>
                        {this.generator.getTemplates().map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
            </div>
        );
    }

    protected renderPlanList(): React.ReactNode {
        if (this.state.plans.length === 0) {
            return (
                <div className="plan-empty">
                    <span className="codicon codicon-tasklist" />
                    <p>No plans yet</p>
                    <p className="description">Generate a plan to get started</p>
                </div>
            );
        }

        return (
            <div className="plan-list">
                {this.state.plans.map(plan => this.renderPlan(plan))}
            </div>
        );
    }

    protected renderPlan(plan: ExecutionPlan): React.ReactNode {
        const isSelected = this.state.selectedPlanId === plan.id;
        const isExecuting = this.executor.isExecuting(plan.id);
        const progress = isExecuting ? this.state.progress : undefined;

        return (
            <div
                key={plan.id}
                className={`plan-item ${isSelected ? 'selected' : ''} ${plan.status}`}
            >
                <div
                    className="plan-item-header"
                    onClick={() => this.selectPlan(plan.id)}
                >
                    <div className="plan-info">
                        <span className={`plan-status-icon ${plan.status}`}>
                            {this.getStatusIcon(plan.status)}
                        </span>
                        <span className="plan-title">{plan.title}</span>
                    </div>
                    <div className="plan-meta">
                        <span className="plan-step-count">
                            {plan.steps.filter(s => s.status === StepStatus.Completed).length}/{plan.steps.length}
                        </span>
                        <span className="plan-complexity">
                            {this.renderComplexity(plan.totalComplexity)}
                        </span>
                    </div>
                </div>

                {progress && (
                    <div className="plan-progress">
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${progress.percentComplete}%` }}
                            />
                        </div>
                        <span className="progress-text">{progress.percentComplete}%</span>
                    </div>
                )}

                {isSelected && (
                    <>
                        <div className="plan-actions">
                            {plan.status === PlanStatus.Draft || plan.status === PlanStatus.Ready ? (
                                <button
                                    className="theia-button"
                                    onClick={() => this.executePlan(plan)}
                                >
                                    <span className="codicon codicon-play" /> Execute
                                </button>
                            ) : null}
                            {plan.status === PlanStatus.Executing ? (
                                <button
                                    className="theia-button"
                                    onClick={() => this.pausePlan(plan.id)}
                                >
                                    <span className="codicon codicon-debug-pause" /> Pause
                                </button>
                            ) : null}
                            {plan.status === PlanStatus.Paused ? (
                                <button
                                    className="theia-button"
                                    onClick={() => this.resumePlan(plan.id)}
                                >
                                    <span className="codicon codicon-play" /> Resume
                                </button>
                            ) : null}
                            <button
                                className="theia-button secondary"
                                onClick={() => this.deletePlan(plan.id)}
                            >
                                <span className="codicon codicon-trash" />
                            </button>
                        </div>
                        <div className="plan-steps">
                            {plan.steps.map(step => this.renderStep(plan.id, step))}
                        </div>
                    </>
                )}
            </div>
        );
    }

    protected renderStep(planId: string, step: PlanStep): React.ReactNode {
        const isExpanded = this.state.expandedSteps.has(step.id);

        return (
            <div key={step.id} className={`plan-step ${step.status}`}>
                <div
                    className="step-header"
                    onClick={() => this.toggleStep(step.id)}
                >
                    <div className="step-info">
                        <span className={`step-status-icon ${step.status}`}>
                            {this.getStepStatusIcon(step.status)}
                        </span>
                        <span className="step-number">{step.number}.</span>
                        <span className="step-title">{step.title}</span>
                    </div>
                    <div className="step-meta">
                        <span className={`step-type ${step.type}`}>
                            {this.getStepTypeIcon(step.type)}
                        </span>
                        <span className="codicon codicon-chevron-right expand-icon"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }} />
                    </div>
                </div>

                {isExpanded && (
                    <div className="step-details">
                        <p className="step-description">{step.description}</p>
                        {step.affectedFiles && step.affectedFiles.length > 0 && (
                            <div className="step-files">
                                <span className="label">Files:</span>
                                {step.affectedFiles.map(f => (
                                    <span key={f} className="file-badge">{f}</span>
                                ))}
                            </div>
                        )}
                        {step.error && (
                            <div className="step-error">
                                <span className="codicon codicon-error" />
                                {step.error}
                            </div>
                        )}
                        {step.output && (
                            <div className="step-output">
                                <span className="codicon codicon-output" />
                                {step.output}
                            </div>
                        )}
                        <div className="step-actions">
                            {step.status === StepStatus.Ready && (
                                <button
                                    className="step-button"
                                    onClick={() => this.executeStep(planId, step.id)}
                                >
                                    <span className="codicon codicon-play" /> Run
                                </button>
                            )}
                            {step.status === StepStatus.Failed && (
                                <button
                                    className="step-button"
                                    onClick={() => this.retryStep(planId, step.id)}
                                >
                                    <span className="codicon codicon-refresh" /> Retry
                                </button>
                            )}
                            {(step.status === StepStatus.Pending || step.status === StepStatus.Ready) && (
                                <button
                                    className="step-button secondary"
                                    onClick={() => this.skipStep(planId, step.id)}
                                >
                                    <span className="codicon codicon-debug-step-over" /> Skip
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    protected getStatusIcon(status: PlanStatus): React.ReactNode {
        switch (status) {
            case PlanStatus.Completed:
                return <span className="codicon codicon-pass-filled" />;
            case PlanStatus.Failed:
                return <span className="codicon codicon-error" />;
            case PlanStatus.Executing:
                return <span className="codicon codicon-sync codicon-modifier-spin" />;
            case PlanStatus.Paused:
                return <span className="codicon codicon-debug-pause" />;
            case PlanStatus.Cancelled:
                return <span className="codicon codicon-circle-slash" />;
            default:
                return <span className="codicon codicon-circle-outline" />;
        }
    }

    protected getStepStatusIcon(status: StepStatus): React.ReactNode {
        switch (status) {
            case StepStatus.Completed:
                return <span className="codicon codicon-check" />;
            case StepStatus.Failed:
                return <span className="codicon codicon-error" />;
            case StepStatus.InProgress:
                return <span className="codicon codicon-loading codicon-modifier-spin" />;
            case StepStatus.Skipped:
                return <span className="codicon codicon-debug-step-over" />;
            case StepStatus.Ready:
                return <span className="codicon codicon-circle-filled" />;
            default:
                return <span className="codicon codicon-circle-outline" />;
        }
    }

    protected getStepTypeIcon(type: StepType): React.ReactNode {
        switch (type) {
            case StepType.Analysis:
                return <span className="codicon codicon-search" title="Analysis" />;
            case StepType.CodeGeneration:
                return <span className="codicon codicon-code" title="Code Generation" />;
            case StepType.FileCreate:
                return <span className="codicon codicon-new-file" title="Create File" />;
            case StepType.FileModify:
                return <span className="codicon codicon-edit" title="Modify File" />;
            case StepType.FileDelete:
                return <span className="codicon codicon-trash" title="Delete File" />;
            case StepType.Refactor:
                return <span className="codicon codicon-symbol-structure" title="Refactor" />;
            case StepType.Test:
                return <span className="codicon codicon-beaker" title="Test" />;
            case StepType.Documentation:
                return <span className="codicon codicon-book" title="Documentation" />;
            case StepType.Review:
                return <span className="codicon codicon-eye" title="Review" />;
            default:
                return <span className="codicon codicon-gear" title="Custom" />;
        }
    }

    protected renderComplexity(complexity: number): React.ReactNode {
        const stars = Math.min(5, Math.ceil(complexity / 3));
        return (
            <span className="complexity" title={`Complexity: ${complexity}`}>
                {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
            </span>
        );
    }

    protected selectPlan(planId: string): void {
        this.state.selectedPlanId = this.state.selectedPlanId === planId ? undefined : planId;
        this.update();
    }

    protected toggleStep(stepId: string): void {
        if (this.state.expandedSteps.has(stepId)) {
            this.state.expandedSteps.delete(stepId);
        } else {
            this.state.expandedSteps.add(stepId);
        }
        this.update();
    }

    protected async generatePlan(): Promise<void> {
        if (!this.state.newPlanPrompt.trim()) {
            return;
        }

        this.state.isGenerating = true;
        this.update();

        try {
            const plan = await this.generator.generatePlan(this.state.newPlanPrompt, {
                includeTests: true,
                includeDocs: false,
                complexity: 'balanced'
            });

            await this.storage.savePlan(plan);
            this.state.plans.unshift(plan);
            this.state.newPlanPrompt = '';
            this.state.selectedPlanId = plan.id;
            this.messageService.info(`Plan "${plan.title}" created with ${plan.steps.length} steps`);
        } catch (error) {
            this.messageService.error(`Failed to generate plan: ${error}`);
        } finally {
            this.state.isGenerating = false;
            this.update();
        }
    }

    protected useTemplate(templateId: string): void {
        if (!templateId) {
            return;
        }

        try {
            const plan = this.generator.fromTemplate(templateId, {});
            this.storage.savePlan(plan);
            this.state.plans.unshift(plan);
            this.state.selectedPlanId = plan.id;
            this.update();
        } catch (error) {
            this.messageService.error(`Failed to create from template: ${error}`);
        }
    }

    protected async executePlan(plan: ExecutionPlan): Promise<void> {
        try {
            await this.executor.execute(plan, {
                autoApprove: false,
                pauseBeforeEach: false,
                stopOnFailure: true
            });
        } catch (error) {
            this.messageService.error(`Execution failed: ${error}`);
        }
    }

    protected pausePlan(planId: string): void {
        this.executor.pause(planId);
        this.update();
    }

    protected async resumePlan(planId: string): Promise<void> {
        await this.executor.resume(planId);
    }

    protected async deletePlan(planId: string): Promise<void> {
        await this.storage.deletePlan(planId);
        this.state.plans = this.state.plans.filter(p => p.id !== planId);
        if (this.state.selectedPlanId === planId) {
            this.state.selectedPlanId = undefined;
        }
        this.update();
    }

    protected async executeStep(planId: string, stepId: string): Promise<void> {
        try {
            await this.executor.executeStep(planId, stepId);
        } catch (error) {
            this.messageService.error(`Step failed: ${error}`);
        }
    }

    protected skipStep(planId: string, stepId: string): void {
        this.executor.skipStep(planId, stepId);
        this.refreshPlan(planId);
    }

    protected async retryStep(planId: string, stepId: string): Promise<void> {
        try {
            await this.executor.retryStep(planId, stepId);
        } catch (error) {
            this.messageService.error(`Retry failed: ${error}`);
        }
    }

    protected async refreshPlan(planId: string): Promise<void> {
        const plan = await this.storage.loadPlan(planId);
        if (plan) {
            const index = this.state.plans.findIndex(p => p.id === planId);
            if (index >= 0) {
                this.state.plans[index] = plan;
                this.update();
            }
        }
    }

    protected async refreshPlans(): Promise<void> {
        this.state.plans = await this.storage.listPlans();
        this.update();
    }
}
