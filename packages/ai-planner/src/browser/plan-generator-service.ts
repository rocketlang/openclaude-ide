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

import { injectable } from '@theia/core/shared/inversify';
import {
    PlanGeneratorService,
    ExecutionPlan,
    PlanStep,
    PlanStatus,
    StepStatus,
    StepType,
    PlanGenerationOptions,
    PlanTemplate,
    DEFAULT_PLAN_TEMPLATES
} from '../common';

/**
 * Service for generating execution plans from prompts
 */
@injectable()
export class PlanGeneratorServiceImpl implements PlanGeneratorService {

    protected templates: PlanTemplate[] = [...DEFAULT_PLAN_TEMPLATES];

    async generatePlan(prompt: string, options?: PlanGenerationOptions): Promise<ExecutionPlan> {
        const opts = {
            maxSteps: 10,
            includeTests: true,
            includeDocs: false,
            complexity: 'balanced' as const,
            ...options
        };

        // Analyze the prompt to determine plan type
        const planType = this.analyzePlanType(prompt);
        const steps = await this.generateSteps(prompt, planType, opts);

        const plan: ExecutionPlan = {
            id: this.generateId(),
            title: this.extractTitle(prompt),
            description: prompt,
            prompt,
            steps,
            status: PlanStatus.Draft,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            totalComplexity: steps.reduce((sum, s) => sum + s.complexity, 0),
            tags: this.extractTags(prompt)
        };

        return plan;
    }

    fromTemplate(templateId: string, variables: Record<string, string>): ExecutionPlan {
        const template = this.templates.find(t => t.id === templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }

        // Create steps from template
        const steps: PlanStep[] = template.steps.map((s, index) => ({
            ...s,
            id: this.generateId(),
            number: index + 1,
            title: this.interpolate(s.title, variables),
            description: this.interpolate(s.description, variables),
            status: StepStatus.Pending
        }));

        // Update dependencies based on step numbers
        this.resolveDependencies(steps);

        const plan: ExecutionPlan = {
            id: this.generateId(),
            title: this.interpolate(template.name, variables),
            description: this.interpolate(template.description, variables),
            prompt: `Template: ${template.name}`,
            steps,
            status: PlanStatus.Ready,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            totalComplexity: steps.reduce((sum, s) => sum + s.complexity, 0),
            tags: [template.category]
        };

        return plan;
    }

    getTemplates(): PlanTemplate[] {
        return [...this.templates];
    }

    protected analyzePlanType(prompt: string): string {
        const promptLower = prompt.toLowerCase();

        if (promptLower.includes('bug') || promptLower.includes('fix') || promptLower.includes('error')) {
            return 'bug-fix';
        }
        if (promptLower.includes('refactor') || promptLower.includes('clean up') || promptLower.includes('improve')) {
            return 'refactor';
        }
        if (promptLower.includes('add') || promptLower.includes('create') || promptLower.includes('implement') || promptLower.includes('new')) {
            return 'new-feature';
        }
        if (promptLower.includes('test')) {
            return 'testing';
        }
        if (promptLower.includes('document') || promptLower.includes('readme')) {
            return 'documentation';
        }

        return 'generic';
    }

    protected async generateSteps(
        prompt: string,
        planType: string,
        options: PlanGenerationOptions
    ): Promise<PlanStep[]> {
        const steps: PlanStep[] = [];
        let stepNumber = 1;

        // Analysis step (always first)
        steps.push({
            id: this.generateId(),
            number: stepNumber++,
            title: 'Analyze requirements',
            description: `Analyze the request: "${prompt.slice(0, 100)}..."`,
            status: StepStatus.Pending,
            type: StepType.Analysis,
            dependencies: [],
            complexity: 2
        });

        // Generate type-specific steps
        switch (planType) {
            case 'bug-fix':
                steps.push(
                    {
                        id: this.generateId(),
                        number: stepNumber++,
                        title: 'Identify root cause',
                        description: 'Locate the source of the bug in the codebase',
                        status: StepStatus.Pending,
                        type: StepType.Analysis,
                        dependencies: [steps[0].id],
                        complexity: 3
                    },
                    {
                        id: this.generateId(),
                        number: stepNumber++,
                        title: 'Implement fix',
                        description: 'Apply the necessary code changes to fix the bug',
                        status: StepStatus.Pending,
                        type: StepType.FileModify,
                        dependencies: [steps[1]?.id || steps[0].id],
                        complexity: 3
                    }
                );
                break;

            case 'refactor':
                steps.push(
                    {
                        id: this.generateId(),
                        number: stepNumber++,
                        title: 'Plan refactoring',
                        description: 'Design the refactoring approach and identify affected code',
                        status: StepStatus.Pending,
                        type: StepType.Analysis,
                        dependencies: [steps[0].id],
                        complexity: 3
                    },
                    {
                        id: this.generateId(),
                        number: stepNumber++,
                        title: 'Apply refactoring',
                        description: 'Execute the refactoring changes',
                        status: StepStatus.Pending,
                        type: StepType.Refactor,
                        dependencies: [steps[1]?.id || steps[0].id],
                        complexity: 4
                    }
                );
                break;

            case 'new-feature':
            default:
                steps.push(
                    {
                        id: this.generateId(),
                        number: stepNumber++,
                        title: 'Design solution',
                        description: 'Design the implementation approach',
                        status: StepStatus.Pending,
                        type: StepType.Analysis,
                        dependencies: [steps[0].id],
                        complexity: 3
                    },
                    {
                        id: this.generateId(),
                        number: stepNumber++,
                        title: 'Create/modify files',
                        description: 'Create new files or modify existing ones',
                        status: StepStatus.Pending,
                        type: StepType.CodeGeneration,
                        dependencies: [steps[1]?.id || steps[0].id],
                        complexity: 4
                    }
                );
                break;
        }

        // Add test step if requested
        if (options.includeTests) {
            const lastStep = steps[steps.length - 1];
            steps.push({
                id: this.generateId(),
                number: stepNumber++,
                title: 'Add/update tests',
                description: 'Write or update tests to verify the changes',
                status: StepStatus.Pending,
                type: StepType.Test,
                dependencies: [lastStep.id],
                complexity: 3
            });
        }

        // Add documentation step if requested
        if (options.includeDocs) {
            const lastStep = steps[steps.length - 1];
            steps.push({
                id: this.generateId(),
                number: stepNumber++,
                title: 'Update documentation',
                description: 'Document the changes made',
                status: StepStatus.Pending,
                type: StepType.Documentation,
                dependencies: [lastStep.id],
                complexity: 2
            });
        }

        // Final review step
        const lastStep = steps[steps.length - 1];
        steps.push({
            id: this.generateId(),
            number: stepNumber++,
            title: 'Review changes',
            description: 'Review all changes and ensure quality',
            status: StepStatus.Pending,
            type: StepType.Review,
            dependencies: [lastStep.id],
            complexity: 2
        });

        // Limit steps if needed
        if (steps.length > (options.maxSteps || 10)) {
            return steps.slice(0, options.maxSteps);
        }

        return steps;
    }

    protected extractTitle(prompt: string): string {
        // Try to extract a title from the first line or sentence
        const firstLine = prompt.split('\n')[0];
        const firstSentence = prompt.split(/[.!?]/)[0];

        const title = firstLine.length < 60 ? firstLine : firstSentence;

        if (title.length > 60) {
            return title.slice(0, 57) + '...';
        }

        return title || 'Execution Plan';
    }

    protected extractTags(prompt: string): string[] {
        const tags: string[] = [];
        const promptLower = prompt.toLowerCase();

        const keywords = [
            'typescript', 'javascript', 'python', 'react', 'angular', 'vue',
            'api', 'database', 'frontend', 'backend', 'test', 'documentation',
            'bug', 'feature', 'refactor', 'performance', 'security'
        ];

        for (const keyword of keywords) {
            if (promptLower.includes(keyword)) {
                tags.push(keyword);
            }
        }

        return tags;
    }

    protected interpolate(template: string, variables: Record<string, string>): string {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
            result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
        }
        return result;
    }

    protected resolveDependencies(steps: PlanStep[]): void {
        for (let i = 1; i < steps.length; i++) {
            if (steps[i].dependencies.length === 0) {
                steps[i].dependencies = [steps[i - 1].id];
            }
        }
    }

    protected generateId(): string {
        return `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}
