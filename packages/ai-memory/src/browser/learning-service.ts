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

import { injectable, inject } from '@theia/core/shared/inversify';
import { URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    LearningService,
    MemoryService,
    MemoryEntryType,
    CodePatternMemory,
    CodePatternType,
    UserPreferenceMemory,
    PreferenceCategory,
    ProjectContextMemory,
    ProjectConvention,
    ProjectStructure,
    ErrorSolutionMemory,
    LearnedBehaviorMemory,
    BehaviorType
} from '../common';

@injectable()
export class LearningServiceImpl implements LearningService {

    @inject(MemoryService)
    protected readonly memoryService: MemoryService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    async learnFromCode(uri: string, content: string, language: string): Promise<void> {
        const patterns = this.analyzeCodePatterns(content, language);

        for (const pattern of patterns) {
            // Skip patterns without required fields
            if (!pattern.pattern || !pattern.patternType || !pattern.examples || pattern.examples.length === 0) {
                continue;
            }

            // Check if similar pattern exists
            const existing = await this.findExistingPattern(pattern.pattern, pattern.patternType, language);

            if (existing) {
                // Update existing pattern
                await this.memoryService.update(existing.id, {
                    frequency: existing.frequency + 1,
                    importance: Math.min(1, existing.importance + 0.05),
                    examples: [...existing.examples.slice(-4), pattern.examples[0]]
                });
            } else {
                // Store new pattern
                await this.memoryService.store({
                    type: MemoryEntryType.CodePattern,
                    timestamp: Date.now(),
                    importance: 0.3,
                    language,
                    patternType: pattern.patternType,
                    pattern: pattern.pattern,
                    frequency: 1,
                    examples: pattern.examples,
                    tags: [language, pattern.patternType]
                } as Omit<CodePatternMemory, 'id' | 'accessCount' | 'lastAccessed'>);
            }
        }
    }

    async learnFromFeedback(suggestionId: string, accepted: boolean, modification?: string): Promise<void> {
        const behaviorType = accepted
            ? (modification ? BehaviorType.ModifiedSuggestion : BehaviorType.AcceptedSuggestion)
            : BehaviorType.RejectedSuggestion;

        const memory: Omit<LearnedBehaviorMemory, 'id' | 'accessCount' | 'lastAccessed'> = {
            type: MemoryEntryType.LearnedBehavior,
            timestamp: Date.now(),
            importance: accepted ? 0.7 : 0.5,
            behaviorType,
            trigger: suggestionId,
            action: modification || (accepted ? 'accepted' : 'rejected'),
            confidence: 0.6,
            observations: 1,
            tags: [behaviorType]
        };

        await this.memoryService.store(memory);
    }

    async learnFromErrorResolution(errorMessage: string, solution: string, successful: boolean): Promise<void> {
        // Extract error type from message
        const errorType = this.extractErrorType(errorMessage);

        // Check for existing solution
        const existing = await this.findExistingErrorSolution(errorMessage);

        if (existing) {
            // Update success rate
            const newApplications = existing.applications + 1;
            const newSuccessRate = successful
                ? (existing.successRate * existing.applications + 1) / newApplications
                : (existing.successRate * existing.applications) / newApplications;

            await this.memoryService.update(existing.id, {
                applications: newApplications,
                successRate: newSuccessRate,
                importance: Math.min(1, existing.importance + (successful ? 0.1 : -0.05))
            });
        } else {
            const memory: Omit<ErrorSolutionMemory, 'id' | 'accessCount' | 'lastAccessed'> = {
                type: MemoryEntryType.ErrorSolution,
                timestamp: Date.now(),
                importance: successful ? 0.6 : 0.3,
                errorMessage,
                errorType,
                solution,
                successRate: successful ? 1 : 0,
                applications: 1,
                tags: ['error', errorType]
            };

            await this.memoryService.store(memory);
        }
    }

    async getPatterns(language: string): Promise<CodePatternMemory[]> {
        const memories = await this.memoryService.query({
            types: [MemoryEntryType.CodePattern],
            tags: [language]
        });

        return memories as CodePatternMemory[];
    }

    async getPreferences(category?: PreferenceCategory): Promise<UserPreferenceMemory[]> {
        const options: { types: MemoryEntryType[]; tags?: string[] } = {
            types: [MemoryEntryType.UserPreference]
        };

        if (category) {
            options.tags = [category];
        }

        const memories = await this.memoryService.query(options);
        return memories as UserPreferenceMemory[];
    }

    async getProjectContext(projectRoot: string): Promise<ProjectContextMemory | undefined> {
        const memories = await this.memoryService.query({
            types: [MemoryEntryType.ProjectContext]
        });

        for (const memory of memories) {
            const ctx = memory as ProjectContextMemory;
            if (ctx.projectRoot === projectRoot) {
                return ctx;
            }
        }

        return undefined;
    }

    async analyzeProject(projectRoot: string): Promise<ProjectContextMemory> {
        const rootUri = new URI(projectRoot);
        const projectName = rootUri.path.base;

        // Detect languages and frameworks
        const { languages, framework, dependencies } = await this.detectProjectStack(projectRoot);

        // Analyze project structure
        const structure = await this.analyzeProjectStructure(projectRoot);

        // Extract conventions
        const conventions = await this.extractConventions(projectRoot, languages);

        const memory: Omit<ProjectContextMemory, 'id' | 'accessCount' | 'lastAccessed'> = {
            type: MemoryEntryType.ProjectContext,
            timestamp: Date.now(),
            importance: 0.9,
            projectRoot,
            projectName,
            framework,
            languages,
            conventions,
            dependencies,
            structure,
            tags: ['project', ...languages]
        };

        const id = await this.memoryService.store(memory);

        return {
            ...memory,
            id,
            accessCount: 0,
            lastAccessed: Date.now()
        };
    }

    protected analyzeCodePatterns(content: string, language: string): Partial<CodePatternMemory>[] {
        const patterns: Partial<CodePatternMemory>[] = [];
        const lines = content.split('\n');

        // Analyze naming conventions
        const namingPatterns = this.detectNamingConventions(content, language);
        patterns.push(...namingPatterns);

        // Analyze import style
        const importPatterns = this.detectImportStyle(content, language);
        patterns.push(...importPatterns);

        // Analyze comment style
        const commentPatterns = this.detectCommentStyle(lines);
        patterns.push(...commentPatterns);

        // Analyze error handling patterns
        const errorPatterns = this.detectErrorHandling(content, language);
        patterns.push(...errorPatterns);

        return patterns;
    }

    protected detectNamingConventions(content: string, language: string): Partial<CodePatternMemory>[] {
        const patterns: Partial<CodePatternMemory>[] = [];

        if (['typescript', 'javascript'].includes(language)) {
            // Function naming
            const functionMatch = content.match(/(?:function|const|let)\s+([a-zA-Z_]\w*)\s*[=(]/g);
            if (functionMatch) {
                const isCamelCase = functionMatch.every(m => /^[a-z]/.test(m.split(/\s+/)[1] || ''));
                if (isCamelCase) {
                    patterns.push({
                        patternType: CodePatternType.NamingConvention,
                        pattern: 'camelCase for functions',
                        examples: functionMatch.slice(0, 3)
                    });
                }
            }

            // Class naming
            const classMatch = content.match(/class\s+([A-Z]\w*)/g);
            if (classMatch) {
                patterns.push({
                    patternType: CodePatternType.NamingConvention,
                    pattern: 'PascalCase for classes',
                    examples: classMatch.slice(0, 3)
                });
            }

            // Interface naming
            const interfaceMatch = content.match(/interface\s+([A-Z]\w*)/g);
            if (interfaceMatch) {
                const hasIPrefix = interfaceMatch.every(m => m.includes('interface I'));
                patterns.push({
                    patternType: CodePatternType.NamingConvention,
                    pattern: hasIPrefix ? 'I-prefix for interfaces' : 'No prefix for interfaces',
                    examples: interfaceMatch.slice(0, 3)
                });
            }
        }

        return patterns;
    }

    protected detectImportStyle(content: string, language: string): Partial<CodePatternMemory>[] {
        const patterns: Partial<CodePatternMemory>[] = [];

        if (['typescript', 'javascript'].includes(language)) {
            const importLines = content.match(/^import .+$/gm) || [];

            if (importLines.length > 0) {
                // Check for grouped imports
                const hasGroupedImports = this.hasGroupedImports(importLines);
                if (hasGroupedImports) {
                    patterns.push({
                        patternType: CodePatternType.ImportStyle,
                        pattern: 'Grouped imports by source type',
                        examples: importLines.slice(0, 3)
                    });
                }

                // Check for named vs default imports
                const namedImports = importLines.filter(l => l.includes('{')).length;
                const defaultImports = importLines.filter(l => !l.includes('{')).length;

                if (namedImports > defaultImports) {
                    patterns.push({
                        patternType: CodePatternType.ImportStyle,
                        pattern: 'Prefer named imports',
                        examples: importLines.filter(l => l.includes('{')).slice(0, 3)
                    });
                }
            }
        }

        return patterns;
    }

    protected hasGroupedImports(importLines: string[]): boolean {
        if (importLines.length < 3) {
            return false;
        }

        // Check if imports are grouped (e.g., external first, then internal)
        const isExternal = (line: string) => !line.includes("'./") && !line.includes("'../");
        const externalImports = importLines.filter(isExternal);
        const internalImports = importLines.filter(l => !isExternal(l));

        // If all external come before all internal, it's grouped
        if (externalImports.length > 0 && internalImports.length > 0) {
            const lastExternalIndex = importLines.lastIndexOf(externalImports[externalImports.length - 1]);
            const firstInternalIndex = importLines.indexOf(internalImports[0]);
            return lastExternalIndex < firstInternalIndex;
        }

        return false;
    }

    protected detectCommentStyle(lines: string[]): Partial<CodePatternMemory>[] {
        const patterns: Partial<CodePatternMemory>[] = [];

        const jsdocComments = lines.filter(l => l.trim().startsWith('/**') || l.trim().startsWith('*'));
        const singleLineComments = lines.filter(l => l.trim().startsWith('//'));

        if (jsdocComments.length > singleLineComments.length) {
            patterns.push({
                patternType: CodePatternType.CommentStyle,
                pattern: 'JSDoc style comments',
                examples: jsdocComments.slice(0, 3)
            });
        }

        return patterns;
    }

    protected detectErrorHandling(content: string, _language: string): Partial<CodePatternMemory>[] {
        const patterns: Partial<CodePatternMemory>[] = [];

        // Detect try-catch patterns
        const tryCatchMatches = content.match(/try\s*\{[\s\S]*?\}\s*catch/g);
        if (tryCatchMatches && tryCatchMatches.length > 0) {
            patterns.push({
                patternType: CodePatternType.ErrorHandling,
                pattern: 'Try-catch error handling',
                examples: tryCatchMatches.slice(0, 2)
            });
        }

        // Detect async error handling
        const asyncAwaitMatches = content.match(/async[\s\S]*?try[\s\S]*?await/g);
        if (asyncAwaitMatches && asyncAwaitMatches.length > 0) {
            patterns.push({
                patternType: CodePatternType.ErrorHandling,
                pattern: 'Async-await with try-catch',
                examples: asyncAwaitMatches.slice(0, 2)
            });
        }

        return patterns;
    }

    protected async findExistingPattern(
        pattern: string,
        patternType: CodePatternType,
        language: string
    ): Promise<CodePatternMemory | undefined> {
        const memories = await this.memoryService.query({
            types: [MemoryEntryType.CodePattern],
            tags: [language]
        });

        for (const memory of memories) {
            const codePattern = memory as CodePatternMemory;
            if (codePattern.patternType === patternType && codePattern.pattern === pattern) {
                return codePattern;
            }
        }

        return undefined;
    }

    protected async findExistingErrorSolution(errorMessage: string): Promise<ErrorSolutionMemory | undefined> {
        const memories = await this.memoryService.query({
            types: [MemoryEntryType.ErrorSolution]
        });

        // Find similar error message
        const errorKey = this.normalizeErrorMessage(errorMessage);

        for (const memory of memories) {
            const solution = memory as ErrorSolutionMemory;
            if (this.normalizeErrorMessage(solution.errorMessage) === errorKey) {
                return solution;
            }
        }

        return undefined;
    }

    protected normalizeErrorMessage(message: string): string {
        // Remove variable parts like line numbers, paths, etc.
        return message
            .replace(/at line \d+/gi, '')
            .replace(/:\d+:\d+/g, '')
            .replace(/\/[\w/-]+\//g, '/')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    protected extractErrorType(message: string): string {
        // Common error type patterns
        const patterns = [
            /^(\w+Error):/,
            /^(TypeError|ReferenceError|SyntaxError|RangeError)/,
            /error:\s*(\w+)/i,
            /(\w+Exception)/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return 'UnknownError';
    }

    protected async detectProjectStack(projectRoot: string): Promise<{
        languages: string[];
        framework?: string;
        dependencies: string[];
    }> {
        const languages = new Set<string>();
        const dependencies: string[] = [];
        let framework: string | undefined;

        try {
            // Check for package.json
            const packageJsonUri = new URI(projectRoot).resolve('package.json');
            const packageJsonStat = await this.fileService.resolve(packageJsonUri);
            if (packageJsonStat && !packageJsonStat.isDirectory) {
                languages.add('javascript');
                languages.add('typescript');

                const content = await this.fileService.read(packageJsonUri);
                const packageJson = JSON.parse(content.value);

                // Detect framework
                const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
                if (deps.react) {
                    framework = 'React';
                } else if (deps.vue) {
                    framework = 'Vue';
                } else if (deps['@angular/core']) {
                    framework = 'Angular';
                } else if (deps.express) {
                    framework = 'Express';
                } else if (deps.next) {
                    framework = 'Next.js';
                }

                dependencies.push(...Object.keys(deps).slice(0, 20));
            }
        } catch {
            // No package.json
        }

        try {
            // Check for requirements.txt (Python)
            const requirementsUri = new URI(projectRoot).resolve('requirements.txt');
            const requirementsStat = await this.fileService.resolve(requirementsUri);
            if (requirementsStat && !requirementsStat.isDirectory) {
                languages.add('python');
            }
        } catch {
            // No requirements.txt
        }

        try {
            // Check for go.mod (Go)
            const goModUri = new URI(projectRoot).resolve('go.mod');
            const goModStat = await this.fileService.resolve(goModUri);
            if (goModStat && !goModStat.isDirectory) {
                languages.add('go');
            }
        } catch {
            // No go.mod
        }

        return {
            languages: Array.from(languages),
            framework,
            dependencies
        };
    }

    protected async analyzeProjectStructure(projectRoot: string): Promise<ProjectStructure> {
        const structure: ProjectStructure = {
            configFiles: [],
            entryPoints: []
        };

        const commonSrcDirs = ['src', 'lib', 'app', 'source'];
        const commonTestDirs = ['test', 'tests', '__tests__', 'spec'];
        const configFiles = ['package.json', 'tsconfig.json', '.eslintrc', 'webpack.config.js', 'vite.config.ts'];
        const entryPoints = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js'];

        try {
            const rootUri = new URI(projectRoot);
            const children = await this.fileService.resolve(rootUri);

            if (children.children) {
                for (const child of children.children) {
                    const name = child.name;

                    if (child.isDirectory) {
                        if (commonSrcDirs.includes(name)) {
                            structure.srcDir = name;
                        }
                        if (commonTestDirs.includes(name)) {
                            structure.testDir = name;
                        }
                    } else {
                        if (configFiles.includes(name)) {
                            structure.configFiles.push(name);
                        }
                        if (entryPoints.includes(name)) {
                            structure.entryPoints.push(name);
                        }
                    }
                }
            }
        } catch {
            // Unable to analyze
        }

        return structure;
    }

    protected async extractConventions(projectRoot: string, languages: string[]): Promise<ProjectConvention[]> {
        const conventions: ProjectConvention[] = [];

        // Check for linting config
        try {
            const eslintUri = new URI(projectRoot).resolve('.eslintrc.json');
            const eslintStat = await this.fileService.resolve(eslintUri);
            if (eslintStat && !eslintStat.isDirectory) {
                conventions.push({
                    type: 'linting',
                    description: 'ESLint configuration present',
                    examples: ['.eslintrc.json']
                });
            }
        } catch {
            // No eslint config
        }

        // Check for prettier config
        try {
            const prettierUri = new URI(projectRoot).resolve('.prettierrc');
            const prettierStat = await this.fileService.resolve(prettierUri);
            if (prettierStat && !prettierStat.isDirectory) {
                conventions.push({
                    type: 'formatting',
                    description: 'Prettier configuration present',
                    examples: ['.prettierrc']
                });
            }
        } catch {
            // No prettier config
        }

        // Check for TypeScript strict mode
        if (languages.includes('typescript')) {
            try {
                const tsconfigUri = new URI(projectRoot).resolve('tsconfig.json');
                const content = await this.fileService.read(tsconfigUri);
                const tsconfig = JSON.parse(content.value);

                if (tsconfig.compilerOptions?.strict) {
                    conventions.push({
                        type: 'typescript',
                        description: 'Strict TypeScript mode enabled',
                        examples: ['strict: true']
                    });
                }
            } catch {
                // No tsconfig or invalid
            }
        }

        return conventions;
    }
}
