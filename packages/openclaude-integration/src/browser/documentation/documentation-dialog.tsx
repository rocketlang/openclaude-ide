// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { Message } from '@theia/core/lib/browser';
import { DocumentationOptions, DocumentationFormat, DocumentationStyle } from '../../common/openclaude-protocol';

/**
 * Dialog for configuring documentation generation
 */
@injectable()
export class DocumentationDialog extends ReactDialog<DocumentationOptions> {

    protected filePath: string = '';
    protected targetSymbol: string = '';
    protected format: DocumentationFormat = 'jsdoc';
    protected style: DocumentationStyle = 'detailed';
    protected includeExamples: boolean = true;

    constructor() {
        super({
            title: 'Generate Documentation'
        });
        this.appendAcceptButton('Generate');
        this.appendCloseButton('Cancel');
    }

    /**
     * Set initial file path
     */
    setFilePath(path: string): void {
        this.filePath = path;
        this.update();
    }

    /**
     * Get the configured options
     */
    get value(): DocumentationOptions {
        // Get full content from file (will be done by caller)
        return {
            filePath: this.filePath,
            content: '', // Will be filled by caller
            targetSymbol: this.targetSymbol || undefined,
            format: this.format,
            style: this.style,
            includeExamples: this.includeExamples
        };
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected override render(): React.ReactNode {
        return (
            <div className='openclaude-documentation-dialog'>
                <div className='dialog-section'>
                    <label htmlFor='filePath'>Target File:</label>
                    <input
                        type='text'
                        id='filePath'
                        className='theia-input'
                        value={this.filePath}
                        onChange={e => this.handleFilePathChange(e.target.value)}
                        placeholder='/path/to/source.ts'
                    />
                </div>

                <div className='dialog-section'>
                    <label htmlFor='targetSymbol'>
                        Specific Function/Class (optional):
                    </label>
                    <input
                        type='text'
                        id='targetSymbol'
                        className='theia-input'
                        value={this.targetSymbol}
                        onChange={e => this.handleTargetSymbolChange(e.target.value)}
                        placeholder='Leave empty to document entire file'
                    />
                </div>

                <div className='dialog-section'>
                    <label htmlFor='format'>Documentation Format:</label>
                    <select
                        id='format'
                        className='theia-select'
                        value={this.format}
                        onChange={e => this.handleFormatChange(e.target.value as DocumentationFormat)}
                    >
                        <option value='jsdoc'>JSDoc (JavaScript/TypeScript)</option>
                        <option value='tsdoc'>TSDoc (TypeScript)</option>
                        <option value='markdown'>Markdown (README)</option>
                        <option value='rst'>reStructuredText (Python)</option>
                    </select>
                </div>

                <div className='dialog-section'>
                    <label htmlFor='style'>Documentation Style:</label>
                    <select
                        id='style'
                        className='theia-select'
                        value={this.style}
                        onChange={e => this.handleStyleChange(e.target.value as DocumentationStyle)}
                    >
                        <option value='brief'>Brief (Summary only)</option>
                        <option value='detailed'>Detailed (Recommended)</option>
                        <option value='comprehensive'>Comprehensive (Full details)</option>
                    </select>
                </div>

                <div className='dialog-section checkbox-section'>
                    <label>
                        <input
                            type='checkbox'
                            checked={this.includeExamples}
                            onChange={e => this.handleIncludeExamplesChange(e.target.checked)}
                        />
                        <span>Include usage examples</span>
                    </label>
                </div>

                <div className='dialog-info'>
                    <i className='fa fa-info-circle'></i>
                    <span>
                        AI will generate {this.style} {this.format} documentation
                        {this.includeExamples ? ' with examples' : ''}.
                    </span>
                </div>
            </div>
        );
    }

    protected handleFilePathChange(value: string): void {
        this.filePath = value;
        this.update();
    }

    protected handleTargetSymbolChange(value: string): void {
        this.targetSymbol = value;
        this.update();
    }

    protected handleFormatChange(value: DocumentationFormat): void {
        this.format = value;
        this.update();
    }

    protected handleStyleChange(value: DocumentationStyle): void {
        this.style = value;
        this.update();
    }

    protected handleIncludeExamplesChange(value: boolean): void {
        this.includeExamples = value;
        this.update();
    }

    protected override isValid(value: DocumentationOptions): boolean {
        return value.filePath.length > 0;
    }
}
