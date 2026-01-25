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
import { TestGenerationOptions, TestFramework, TestType, CoverageLevel } from '../../common/openclaude-protocol';

/**
 * Dialog for configuring test generation
 */
@injectable()
export class TestGenerationDialog extends ReactDialog<TestGenerationOptions> {

    protected filePath: string = '';
    protected targetSymbol: string = '';
    protected framework: TestFramework = 'jest';
    protected testType: TestType = 'unit';
    protected coverageLevel: CoverageLevel = 'standard';

    constructor() {
        super({
            title: 'Generate Tests'
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
    get value(): TestGenerationOptions {
        return {
            filePath: this.filePath,
            targetSymbol: this.targetSymbol || undefined,
            framework: this.framework,
            testType: this.testType,
            coverageLevel: this.coverageLevel
        };
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected override render(): React.ReactNode {
        return (
            <div className='openclaude-test-generation-dialog'>
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
                        placeholder='Leave empty to test entire file'
                    />
                </div>

                <div className='dialog-section'>
                    <label htmlFor='framework'>Test Framework:</label>
                    <select
                        id='framework'
                        className='theia-select'
                        value={this.framework}
                        onChange={e => this.handleFrameworkChange(e.target.value as TestFramework)}
                    >
                        <option value='jest'>Jest</option>
                        <option value='mocha'>Mocha</option>
                        <option value='vitest'>Vitest</option>
                        <option value='jasmine'>Jasmine</option>
                        <option value='ava'>AVA</option>
                    </select>
                </div>

                <div className='dialog-section'>
                    <label htmlFor='testType'>Test Type:</label>
                    <select
                        id='testType'
                        className='theia-select'
                        value={this.testType}
                        onChange={e => this.handleTestTypeChange(e.target.value as TestType)}
                    >
                        <option value='unit'>Unit Tests</option>
                        <option value='integration'>Integration Tests</option>
                        <option value='e2e'>End-to-End Tests</option>
                        <option value='all'>All Types</option>
                    </select>
                </div>

                <div className='dialog-section'>
                    <label htmlFor='coverageLevel'>Coverage Level:</label>
                    <select
                        id='coverageLevel'
                        className='theia-select'
                        value={this.coverageLevel}
                        onChange={e => this.handleCoverageLevelChange(e.target.value as CoverageLevel)}
                    >
                        <option value='basic'>Basic (Happy Path)</option>
                        <option value='standard'>Standard (Common Cases)</option>
                        <option value='comprehensive'>Comprehensive (Edge Cases)</option>
                    </select>
                </div>

                <div className='dialog-info'>
                    <i className='fa fa-info-circle'></i>
                    <span>
                        AI will generate {this.testType} tests using {this.framework} with {this.coverageLevel} coverage.
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

    protected handleFrameworkChange(value: TestFramework): void {
        this.framework = value;
        this.update();
    }

    protected handleTestTypeChange(value: TestType): void {
        this.testType = value;
        this.update();
    }

    protected handleCoverageLevelChange(value: CoverageLevel): void {
        this.coverageLevel = value;
        this.update();
    }

    protected override isValid(value: TestGenerationOptions): boolean {
        return value.filePath.length > 0;
    }
}
