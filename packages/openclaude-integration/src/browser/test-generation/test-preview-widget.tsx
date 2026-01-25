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
import { OpenClaudeBackendService, TestGenerationResult, GeneratedTest } from '../../common/openclaude-protocol';

export const TEST_PREVIEW_WIDGET_ID = 'openclaude-test-preview';
export const TEST_PREVIEW_WIDGET_LABEL = 'Test Preview';

/**
 * Test Preview Widget
 *
 * Displays generated tests with options to:
 * - Preview test code
 * - Edit tests before applying
 * - Apply tests to files
 * - View coverage information
 */
@injectable()
export class TestPreviewWidget extends ReactWidget {

    static readonly ID = TEST_PREVIEW_WIDGET_ID;
    static readonly LABEL = TEST_PREVIEW_WIDGET_LABEL;

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    protected currentGeneration: TestGenerationResult | undefined;
    protected loading = false;
    protected selectedTest: GeneratedTest | undefined;

    @postConstruct()
    protected init(): void {
        this.id = TestPreviewWidget.ID;
        this.title.label = TestPreviewWidget.LABEL;
        this.title.caption = TestPreviewWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-flask';

        this.update();
    }

    /**
     * Start test generation
     */
    async startGeneration(options: any): Promise<void> {
        this.loading = true;
        this.update();

        try {
            this.currentGeneration = await this.backendService.generateTests(options);
            this.messageService.info(`Test generation started: ${this.currentGeneration.id}`);

            // Poll for results
            this.pollGenerationStatus(this.currentGeneration.id);
        } catch (error) {
            this.messageService.error(`Failed to start test generation: ${error}`);
            this.loading = false;
            this.update();
        }
    }

    /**
     * Poll for generation completion
     */
    protected async pollGenerationStatus(generationId: string): Promise<void> {
        const pollInterval = 3000; // 3 seconds
        const maxAttempts = 40; // 2 minutes max
        let attempts = 0;

        const poll = async () => {
            try {
                this.currentGeneration = await this.backendService.getTestGeneration(generationId);

                if (this.currentGeneration.status === 'completed' || this.currentGeneration.status === 'failed') {
                    this.loading = false;
                    this.update();

                    if (this.currentGeneration.status === 'completed') {
                        const count = this.currentGeneration.generatedTests?.length || 0;
                        this.messageService.info(`Test generation completed: ${count} tests generated`);
                    } else {
                        this.messageService.error('Test generation failed');
                    }
                    return;
                }

                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, pollInterval);
                } else {
                    this.loading = false;
                    this.messageService.warn('Test generation timed out');
                    this.update();
                }
            } catch (error) {
                this.loading = false;
                this.messageService.error(`Failed to get generation status: ${error}`);
                this.update();
            }
        };

        poll();
    }

    /**
     * Apply a specific test to file
     */
    protected async applyTest(test: GeneratedTest): Promise<void> {
        try {
            // TODO: Use file service to write test to file
            this.messageService.info(`Test "${test.name}" applied to ${test.targetFile}`);
        } catch (error) {
            this.messageService.error(`Failed to apply test: ${error}`);
        }
    }

    /**
     * Apply all tests to files
     */
    protected async applyAllTests(): Promise<void> {
        if (!this.currentGeneration?.generatedTests) {
            return;
        }

        try {
            for (const test of this.currentGeneration.generatedTests) {
                await this.applyTest(test);
            }
            this.messageService.info(`Applied ${this.currentGeneration.generatedTests.length} tests`);
        } catch (error) {
            this.messageService.error(`Failed to apply tests: ${error}`);
        }
    }

    /**
     * Render the widget
     */
    protected render(): React.ReactNode {
        return (
            <div className='openclaude-test-preview'>
                {this.renderHeader()}
                {this.loading && this.renderLoading()}
                {!this.loading && this.currentGeneration && this.renderGeneration()}
                {!this.loading && !this.currentGeneration && this.renderEmpty()}
            </div>
        );
    }

    /**
     * Render header
     */
    protected renderHeader(): React.ReactNode {
        return (
            <div className='openclaude-test-header'>
                <h3>
                    <i className='fa fa-flask'></i>
                    {' AI Test Generation'}
                </h3>
                {this.currentGeneration && (
                    <div className='generation-id'>
                        Generation #{this.currentGeneration.id}
                    </div>
                )}
            </div>
        );
    }

    /**
     * Render loading state
     */
    protected renderLoading(): React.ReactNode {
        return (
            <div className='openclaude-test-loading'>
                <div className='spinner'></div>
                <p>Generating tests...</p>
            </div>
        );
    }

    /**
     * Render empty state
     */
    protected renderEmpty(): React.ReactNode {
        return (
            <div className='openclaude-test-empty'>
                <i className='fa fa-code fa-3x'></i>
                <h4>No active test generation</h4>
                <p>Start test generation from the command palette:</p>
                <code>OpenClaude: Generate Tests</code>
            </div>
        );
    }

    /**
     * Render generation results
     */
    protected renderGeneration(): React.ReactNode {
        if (!this.currentGeneration) {
            return null;
        }

        return (
            <div className='openclaude-test-content'>
                {this.renderCoverage()}
                {this.renderTests()}
            </div>
        );
    }

    /**
     * Render coverage information
     */
    protected renderCoverage(): React.ReactNode {
        if (!this.currentGeneration?.coverage) {
            return null;
        }

        const { coverage } = this.currentGeneration;

        return (
            <div className='openclaude-test-coverage'>
                <h4>Coverage Analysis</h4>
                <div className='coverage-grid'>
                    <div className='coverage-item'>
                        <div className='coverage-label'>Overall</div>
                        <div className='coverage-bar'>
                            <div
                                className='coverage-fill'
                                style={{ width: `${coverage.overall}%` }}
                            />
                        </div>
                        <div className='coverage-value'>{coverage.overall}%</div>
                    </div>
                    <div className='coverage-item'>
                        <div className='coverage-label'>Statements</div>
                        <div className='coverage-bar'>
                            <div
                                className='coverage-fill'
                                style={{ width: `${coverage.statements}%` }}
                            />
                        </div>
                        <div className='coverage-value'>{coverage.statements}%</div>
                    </div>
                    <div className='coverage-item'>
                        <div className='coverage-label'>Branches</div>
                        <div className='coverage-bar'>
                            <div
                                className='coverage-fill'
                                style={{ width: `${coverage.branches}%` }}
                            />
                        </div>
                        <div className='coverage-value'>{coverage.branches}%</div>
                    </div>
                    <div className='coverage-item'>
                        <div className='coverage-label'>Functions</div>
                        <div className='coverage-bar'>
                            <div
                                className='coverage-fill'
                                style={{ width: `${coverage.functions}%` }}
                            />
                        </div>
                        <div className='coverage-value'>{coverage.functions}%</div>
                    </div>
                </div>
            </div>
        );
    }

    /**
     * Render tests list
     */
    protected renderTests(): React.ReactNode {
        if (!this.currentGeneration?.generatedTests || this.currentGeneration.generatedTests.length === 0) {
            return (
                <div className='openclaude-test-no-tests'>
                    <i className='fa fa-exclamation-triangle fa-2x'></i>
                    <h4>No tests generated</h4>
                    <p>The AI could not generate tests for this code.</p>
                </div>
            );
        }

        return (
            <div className='openclaude-test-list'>
                <div className='test-list-header'>
                    <h4>Generated Tests ({this.currentGeneration.generatedTests.length})</h4>
                    <button
                        className='theia-button'
                        onClick={() => this.applyAllTests()}
                    >
                        <i className='fa fa-check'></i>
                        {' Apply All'}
                    </button>
                </div>
                <div className='tests'>
                    {this.currentGeneration.generatedTests.map((test, idx) => this.renderTest(test, idx))}
                </div>
            </div>
        );
    }

    /**
     * Render individual test
     */
    protected renderTest(test: GeneratedTest, index: number): React.ReactNode {
        const isSelected = this.selectedTest === test;

        return (
            <div
                key={index}
                className={`test-item ${isSelected ? 'selected' : ''}`}
                onClick={() => this.handleTestSelect(test)}
            >
                <div className='test-header'>
                    <div className='test-info'>
                        <i className='fa fa-flask'></i>
                        <span className='test-name'>{test.name}</span>
                        <span className='test-type'>{test.type}</span>
                    </div>
                    <div className='test-actions'>
                        <button
                            className='theia-button secondary'
                            onClick={(e) => {
                                e.stopPropagation();
                                this.applyTest(test);
                            }}
                        >
                            <i className='fa fa-save'></i>
                            {' Apply'}
                        </button>
                    </div>
                </div>
                <div className='test-meta'>
                    <span className='test-target'>
                        <i className='fa fa-file-code-o'></i>
                        {test.targetFile}
                    </span>
                    <span className='test-symbol'>
                        <i className='fa fa-cube'></i>
                        {test.testsSymbol}
                    </span>
                </div>
                {isSelected && (
                    <div className='test-code'>
                        <pre>
                            <code>{test.code}</code>
                        </pre>
                    </div>
                )}
            </div>
        );
    }

    /**
     * Handle test selection
     */
    protected handleTestSelect(test: GeneratedTest): void {
        this.selectedTest = this.selectedTest === test ? undefined : test;
        this.update();
    }
}
