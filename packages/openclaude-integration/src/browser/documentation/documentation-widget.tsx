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
import { OpenClaudeBackendService, DocumentationResult, GeneratedDocumentation } from '../../common/openclaude-protocol';

export const DOCUMENTATION_WIDGET_ID = 'openclaude-documentation';
export const DOCUMENTATION_WIDGET_LABEL = 'Documentation';

/**
 * Documentation Preview Widget
 *
 * Displays generated documentation with options to:
 * - Preview documentation
 * - Edit documentation before applying
 * - Apply documentation to files
 * - Copy to clipboard
 */
@injectable()
export class DocumentationWidget extends ReactWidget {

    static readonly ID = DOCUMENTATION_WIDGET_ID;
    static readonly LABEL = DOCUMENTATION_WIDGET_LABEL;

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    protected currentGeneration: DocumentationResult | undefined;
    protected loading = false;
    protected selectedDoc: GeneratedDocumentation | undefined;

    @postConstruct()
    protected init(): void {
        this.id = DocumentationWidget.ID;
        this.title.label = DocumentationWidget.LABEL;
        this.title.caption = DocumentationWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-book';

        this.update();
    }

    /**
     * Start documentation generation
     */
    async startGeneration(options: any): Promise<void> {
        this.loading = true;
        this.update();

        try {
            this.currentGeneration = await this.backendService.generateDocumentation(options);
            this.messageService.info(`Documentation generation started: ${this.currentGeneration.id}`);

            // Poll for results
            this.pollGenerationStatus(this.currentGeneration.id);
        } catch (error) {
            this.messageService.error(`Failed to start documentation generation: ${error}`);
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
                this.currentGeneration = await this.backendService.getDocumentation(generationId);

                if (this.currentGeneration.status === 'completed' || this.currentGeneration.status === 'failed') {
                    this.loading = false;
                    this.update();

                    if (this.currentGeneration.status === 'completed') {
                        const count = this.currentGeneration.documentation?.length || 0;
                        this.messageService.info(`Documentation generated for ${count} symbols`);
                    } else {
                        this.messageService.error('Documentation generation failed');
                    }
                    return;
                }

                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, pollInterval);
                } else {
                    this.loading = false;
                    this.messageService.warn('Documentation generation timed out');
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
     * Apply documentation to file
     */
    protected async applyDocumentation(doc: GeneratedDocumentation): Promise<void> {
        try {
            // TODO: Use file service to insert documentation at correct line
            this.messageService.info(`Documentation for "${doc.symbolName}" will be applied at line ${doc.line}`);
        } catch (error) {
            this.messageService.error(`Failed to apply documentation: ${error}`);
        }
    }

    /**
     * Copy documentation to clipboard
     */
    protected async copyToClipboard(doc: GeneratedDocumentation): Promise<void> {
        try {
            await navigator.clipboard.writeText(doc.documentation);
            this.messageService.info('Documentation copied to clipboard');
        } catch (error) {
            this.messageService.error(`Failed to copy to clipboard: ${error}`);
        }
    }

    /**
     * Apply all documentation
     */
    protected async applyAllDocumentation(): Promise<void> {
        if (!this.currentGeneration?.documentation) {
            return;
        }

        try {
            for (const doc of this.currentGeneration.documentation) {
                await this.applyDocumentation(doc);
            }
            this.messageService.info(`Applied ${this.currentGeneration.documentation.length} documentation blocks`);
        } catch (error) {
            this.messageService.error(`Failed to apply documentation: ${error}`);
        }
    }

    /**
     * Render the widget
     */
    protected render(): React.ReactNode {
        return (
            <div className='openclaude-documentation'>
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
            <div className='openclaude-doc-header'>
                <h3>
                    <i className='fa fa-book'></i>
                    {' AI Documentation Generator'}
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
            <div className='openclaude-doc-loading'>
                <div className='spinner'></div>
                <p>Generating documentation...</p>
            </div>
        );
    }

    /**
     * Render empty state
     */
    protected renderEmpty(): React.ReactNode {
        return (
            <div className='openclaude-doc-empty'>
                <i className='fa fa-book fa-3x'></i>
                <h4>No active documentation generation</h4>
                <p>Start documentation generation from the command palette:</p>
                <code>OpenClaude: Generate Documentation</code>
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
            <div className='openclaude-doc-content'>
                {this.renderDocumentationList()}
            </div>
        );
    }

    /**
     * Render documentation list
     */
    protected renderDocumentationList(): React.ReactNode {
        if (!this.currentGeneration?.documentation || this.currentGeneration.documentation.length === 0) {
            return (
                <div className='openclaude-doc-no-docs'>
                    <i className='fa fa-exclamation-triangle fa-2x'></i>
                    <h4>No documentation generated</h4>
                    <p>The AI could not generate documentation for this code.</p>
                </div>
            );
        }

        return (
            <div className='openclaude-doc-list'>
                <div className='doc-list-header'>
                    <h4>Generated Documentation ({this.currentGeneration.documentation.length})</h4>
                    <button
                        className='theia-button'
                        onClick={() => this.applyAllDocumentation()}
                    >
                        <i className='fa fa-check'></i>
                        {' Apply All'}
                    </button>
                </div>
                <div className='docs'>
                    {this.currentGeneration.documentation.map((doc, idx) => this.renderDoc(doc, idx))}
                </div>
            </div>
        );
    }

    /**
     * Render individual documentation
     */
    protected renderDoc(doc: GeneratedDocumentation, index: number): React.ReactNode {
        const isSelected = this.selectedDoc === doc;

        return (
            <div
                key={index}
                className={`doc-item ${isSelected ? 'selected' : ''}`}
                onClick={() => this.handleDocSelect(doc)}
            >
                <div className='doc-header'>
                    <div className='doc-info'>
                        <i className={this.getSymbolIcon(doc.symbolType)}></i>
                        <span className='doc-name'>{doc.symbolName}</span>
                        <span className='doc-type'>{doc.symbolType}</span>
                        <span className='doc-line'>Line {doc.line}</span>
                    </div>
                    <div className='doc-actions'>
                        <button
                            className='theia-button secondary'
                            onClick={(e) => {
                                e.stopPropagation();
                                this.copyToClipboard(doc);
                            }}
                        >
                            <i className='fa fa-clipboard'></i>
                        </button>
                        <button
                            className='theia-button secondary'
                            onClick={(e) => {
                                e.stopPropagation();
                                this.applyDocumentation(doc);
                            }}
                        >
                            <i className='fa fa-save'></i>
                            {' Apply'}
                        </button>
                    </div>
                </div>
                {isSelected && (
                    <div className='doc-content'>
                        <pre>
                            <code>{doc.documentation}</code>
                        </pre>
                        {doc.examples && doc.examples.length > 0 && (
                            <div className='doc-examples'>
                                <h5>Examples:</h5>
                                {doc.examples.map((example, idx) => (
                                    <pre key={idx}>
                                        <code>{example}</code>
                                    </pre>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    /**
     * Get icon for symbol type
     */
    protected getSymbolIcon(symbolType: string): string {
        switch (symbolType.toLowerCase()) {
            case 'function':
                return 'fa fa-code';
            case 'class':
                return 'fa fa-cube';
            case 'interface':
                return 'fa fa-sitemap';
            case 'method':
                return 'fa fa-cog';
            case 'property':
                return 'fa fa-tag';
            case 'variable':
                return 'fa fa-database';
            default:
                return 'fa fa-file-code-o';
        }
    }

    /**
     * Handle documentation selection
     */
    protected handleDocSelect(doc: GeneratedDocumentation): void {
        this.selectedDoc = this.selectedDoc === doc ? undefined : doc;
        this.update();
    }
}
