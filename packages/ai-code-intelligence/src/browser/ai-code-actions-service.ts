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

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { CommandService, generateUuid } from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import {
    LanguageModelRegistry,
    LanguageModel,
    LanguageModelService,
    isLanguageModelTextResponse,
    isLanguageModelStreamResponse
} from '@theia/ai-core/lib/common';
import * as monaco from '@theia/monaco-editor-core';
import {
    AICodeActionsService,
    SemanticContextService,
    AICodeAction,
    AICodeActionKind,
    CodeDiagnostic,
    CodeRange,
    CodeExplanation,
    CodeEdit,
    SemanticContext
} from '../common';

@injectable()
export class AICodeActionsServiceImpl implements AICodeActionsService {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(SemanticContextService)
    protected readonly contextService: SemanticContextService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(LanguageModelRegistry) @optional()
    protected readonly languageModelRegistry?: LanguageModelRegistry;

    @inject(LanguageModelService) @optional()
    protected readonly languageModelService?: LanguageModelService;

    async getCodeActions(uri: string, range: CodeRange, diagnostics?: CodeDiagnostic[]): Promise<AICodeAction[]> {
        const actions: AICodeAction[] = [];
        const model = this.getModel(uri);
        if (!model) {
            return actions;
        }

        const language = model.getLanguageId();
        const selectedText = model.getValueInRange(this.toMonacoRange(range));

        // Always available actions
        actions.push({
            id: 'ai.explain',
            title: 'AI: Explain this code',
            kind: AICodeActionKind.Explain,
            description: 'Get an AI explanation of the selected code'
        });

        if (selectedText.trim().length > 0) {
            actions.push({
                id: 'ai.refactor',
                title: 'AI: Suggest refactoring',
                kind: AICodeActionKind.Refactor,
                description: 'Get AI suggestions for refactoring this code'
            });

            actions.push({
                id: 'ai.document',
                title: 'AI: Generate documentation',
                kind: AICodeActionKind.Document,
                description: 'Generate documentation for this code'
            });

            if (this.isTestableLanguage(language)) {
                actions.push({
                    id: 'ai.generateTests',
                    title: 'AI: Generate unit tests',
                    kind: AICodeActionKind.Test,
                    description: 'Generate unit tests for this code'
                });
            }
        }

        if (diagnostics && diagnostics.length > 0) {
            for (const diagnostic of diagnostics) {
                const fixes = await this.getQuickFix(uri, diagnostic);
                actions.push(...fixes);
            }
        }

        return actions;
    }

    async executeAction(action: AICodeAction): Promise<boolean> {
        try {
            if (action.edit) {
                await this.applyEdit(action.edit);
                return true;
            }

            if (action.command) {
                await this.commandService.executeCommand(action.command.id, ...(action.command.arguments ?? []));
                return true;
            }

            const editor = this.editorManager.currentEditor?.editor;
            if (!(editor instanceof MonacoEditor)) {
                return false;
            }

            const selection = editor.getControl().getSelection();
            if (!selection) {
                return false;
            }

            const uri = editor.uri.toString();
            const range = this.fromMonacoRange(selection);

            switch (action.kind) {
                case AICodeActionKind.Explain:
                    await this.handleExplainAction(uri, range);
                    return true;
                case AICodeActionKind.Refactor:
                    await this.handleRefactorAction(uri, range);
                    return true;
                case AICodeActionKind.Document:
                    await this.handleDocumentAction(uri, range);
                    return true;
                case AICodeActionKind.Test:
                    await this.handleTestAction(uri, range);
                    return true;
                default:
                    return false;
            }
        } catch (error) {
            console.error('Failed to execute code action:', error);
            return false;
        }
    }

    async getQuickFix(uri: string, diagnostic: CodeDiagnostic): Promise<AICodeAction[]> {
        const fixes: AICodeAction[] = [];
        const model = this.getModel(uri);
        if (!model) {
            return fixes;
        }

        const aiModel = await this.getAIModel();
        if (!aiModel) {
            return fixes;
        }

        try {
            const context = await this.contextService.getContext(uri, diagnostic.range.start, {
                linesBefore: 10,
                linesAfter: 10
            });

            const prompt = this.buildQuickFixPrompt(diagnostic, context);
            const response = await this.callAIModel(aiModel, prompt);

            if (response) {
                const fix = this.parseQuickFixResponse(response, uri, diagnostic);
                if (fix) {
                    fixes.push(fix);
                }
            }
        } catch (error) {
            console.error('Failed to generate AI quick fix:', error);
        }

        return fixes;
    }

    async explainCode(uri: string, range: CodeRange): Promise<CodeExplanation> {
        const model = this.getModel(uri);
        if (!model) {
            throw new Error('No model found');
        }

        const selectedText = model.getValueInRange(this.toMonacoRange(range));
        const language = model.getLanguageId();

        const aiModel = await this.getAIModel();
        if (!aiModel) {
            return {
                summary: 'AI model not available for code explanation.',
                complexity: 'moderate'
            };
        }

        const context = await this.contextService.getContext(uri, range.start, {
            linesBefore: 20,
            linesAfter: 10,
            includeOutline: true
        });

        const prompt = `Explain the following ${language} code:

\`\`\`${language}
${selectedText}
\`\`\`

Context:
${this.contextService.formatContextForAI(context)}

Provide:
1. A brief summary (1-2 sentences)
2. Detailed explanation
3. Key concepts used
4. Complexity assessment (simple/moderate/complex)
5. Any potential improvements

Format your response as JSON:
{
  "summary": "...",
  "details": "...",
  "concepts": ["..."],
  "complexity": "simple|moderate|complex",
  "suggestions": ["..."]
}`;

        try {
            const response = await this.callAIModel(aiModel, prompt);
            return this.parseExplanationResponse(response);
        } catch (error) {
            console.error('Failed to explain code:', error);
            return {
                summary: 'Failed to generate explanation.',
                complexity: 'moderate'
            };
        }
    }

    async generateDocumentation(uri: string, range: CodeRange): Promise<string> {
        const model = this.getModel(uri);
        if (!model) {
            throw new Error('No model found');
        }

        const selectedText = model.getValueInRange(this.toMonacoRange(range));
        const language = model.getLanguageId();

        const aiModel = await this.getAIModel();
        if (!aiModel) {
            return this.generateBasicDocumentation(selectedText, language);
        }

        const docStyle = this.getDocumentationStyle(language);

        const prompt = `Generate ${docStyle.name} documentation for the following ${language} code:

\`\`\`${language}
${selectedText}
\`\`\`

Requirements:
- Use ${docStyle.format} format
- Include parameter descriptions
- Include return value description
- Include example usage if appropriate
- Be concise but thorough

Return ONLY the documentation comment, no explanation.`;

        try {
            const response = await this.callAIModel(aiModel, prompt);
            return this.cleanDocumentationResponse(response);
        } catch (error) {
            console.error('Failed to generate documentation:', error);
            return this.generateBasicDocumentation(selectedText, language);
        }
    }

    async suggestRefactoring(uri: string, range: CodeRange): Promise<AICodeAction[]> {
        const model = this.getModel(uri);
        if (!model) {
            return [];
        }

        const selectedText = model.getValueInRange(this.toMonacoRange(range));
        const language = model.getLanguageId();

        const aiModel = await this.getAIModel();
        if (!aiModel) {
            return [];
        }

        const context = await this.contextService.getContext(uri, range.start, {
            linesBefore: 30,
            linesAfter: 10,
            includeOutline: true
        });

        const prompt = `Analyze the following ${language} code for potential refactoring:

\`\`\`${language}
${selectedText}
\`\`\`

Context:
${this.contextService.formatContextForAI(context)}

Suggest up to 3 refactoring improvements. For each suggestion, provide:
1. Title (brief description)
2. Description (why this improves the code)
3. The refactored code

Format as JSON:
{
  "suggestions": [
    {
      "title": "...",
      "description": "...",
      "code": "..."
    }
  ]
}`;

        try {
            const response = await this.callAIModel(aiModel, prompt);
            return this.parseRefactoringResponse(response, uri, range);
        } catch (error) {
            console.error('Failed to suggest refactoring:', error);
            return [];
        }
    }

    async generateTests(uri: string, range: CodeRange): Promise<string> {
        const model = this.getModel(uri);
        if (!model) {
            throw new Error('No model found');
        }

        const selectedText = model.getValueInRange(this.toMonacoRange(range));
        const language = model.getLanguageId();

        const aiModel = await this.getAIModel();
        if (!aiModel) {
            return '// AI model not available for test generation';
        }

        const context = await this.contextService.getContext(uri, range.start, {
            linesBefore: 10,
            linesAfter: 10,
            includeImports: true
        });

        const testFramework = this.getTestFramework(language);

        const prompt = `Generate unit tests for the following ${language} code using ${testFramework}:

\`\`\`${language}
${selectedText}
\`\`\`

Context:
- File: ${this.getFileName(uri)}
- Imports: ${context.imports.map(i => i.module).join(', ')}

Requirements:
- Cover main functionality
- Include edge cases
- Include error cases if applicable
- Use descriptive test names
- Add setup/teardown if needed

Return ONLY the test code, properly formatted.`;

        try {
            const response = await this.callAIModel(aiModel, prompt);
            return this.cleanCodeResponse(response, language);
        } catch (error) {
            console.error('Failed to generate tests:', error);
            return '// Failed to generate tests';
        }
    }

    protected getModel(uri: string): monaco.editor.ITextModel | undefined {
        const monacoUri = monaco.Uri.parse(uri);
        return monaco.editor.getModel(monacoUri) ?? undefined;
    }

    protected toMonacoRange(range: CodeRange): monaco.Range {
        return new monaco.Range(
            range.start.line + 1,
            range.start.character + 1,
            range.end.line + 1,
            range.end.character + 1
        );
    }

    protected fromMonacoRange(range: monaco.IRange): CodeRange {
        return {
            start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
            end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
        };
    }

    protected async applyEdit(edit: CodeEdit): Promise<void> {
        const model = this.getModel(edit.uri);
        if (!model) {
            return;
        }

        const monacoEdits = edit.edits.map(e => ({
            range: this.toMonacoRange(e.range),
            text: e.newText
        }));

        model.pushEditOperations([], monacoEdits, () => null);
    }

    protected async getAIModel(): Promise<LanguageModel | undefined> {
        if (!this.languageModelRegistry) {
            return undefined;
        }

        const models = await this.languageModelRegistry.getLanguageModels();
        return models.find(m => m.id.includes('claude') || m.id.includes('gpt'));
    }

    protected async callAIModel(model: LanguageModel, prompt: string): Promise<string> {
        if (!this.languageModelService) {
            return '';
        }

        const sessionId = generateUuid();
        const requestId = generateUuid();

        const response = await this.languageModelService.sendRequest(model, {
            messages: [{ type: 'text', actor: 'user', text: prompt }],
            sessionId,
            requestId
        });

        let text = '';
        if (isLanguageModelTextResponse(response)) {
            text = response.text;
        } else if (isLanguageModelStreamResponse(response)) {
            for await (const chunk of response.stream) {
                if ('content' in chunk && typeof chunk.content === 'string') {
                    text += chunk.content;
                }
            }
        }

        return text;
    }

    protected buildQuickFixPrompt(diagnostic: CodeDiagnostic, context: SemanticContext): string {
        return `Fix the following error in ${context.language} code:

Error: ${diagnostic.message}
Code: ${diagnostic.code ?? 'N/A'}
Location: Line ${diagnostic.range.start.line + 1}

Context:
${this.contextService.formatContextForAI(context)}

Provide a fix. Return JSON:
{
  "title": "Fix description",
  "code": "corrected code"
}`;
    }

    protected parseQuickFixResponse(response: string, uri: string, diagnostic: CodeDiagnostic): AICodeAction | undefined {
        try {
            const json = this.extractJSON(response);
            if (!json) {
                return undefined;
            }

            const data = JSON.parse(json);
            return {
                id: `ai.quickfix.${Date.now()}`,
                title: `AI: ${data.title}`,
                kind: AICodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                    uri,
                    edits: [{
                        range: diagnostic.range,
                        newText: data.code
                    }]
                }
            };
        } catch {
            return undefined;
        }
    }

    protected parseExplanationResponse(response: string): CodeExplanation {
        try {
            const json = this.extractJSON(response);
            if (json) {
                const data = JSON.parse(json);
                return {
                    summary: data.summary || 'No summary available',
                    details: data.details,
                    concepts: data.concepts,
                    complexity: data.complexity || 'moderate',
                    suggestions: data.suggestions
                };
            }
        } catch {
            // Fall through to default
        }

        return {
            summary: response.substring(0, 200),
            complexity: 'moderate'
        };
    }

    protected parseRefactoringResponse(response: string, uri: string, originalRange: CodeRange): AICodeAction[] {
        try {
            const json = this.extractJSON(response);
            if (!json) {
                return [];
            }

            const data = JSON.parse(json);
            return (data.suggestions || []).map((s: { title: string; description: string; code: string }, i: number) => ({
                id: `ai.refactor.${i}.${Date.now()}`,
                title: `AI: ${s.title}`,
                description: s.description,
                kind: AICodeActionKind.Refactor,
                edit: {
                    uri,
                    edits: [{
                        range: originalRange,
                        newText: s.code
                    }]
                }
            }));
        } catch {
            return [];
        }
    }

    protected extractJSON(text: string): string | undefined {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? jsonMatch[0] : undefined;
    }

    protected cleanCodeResponse(response: string, _language: string): string {
        const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }
        return response.trim();
    }

    protected cleanDocumentationResponse(response: string): string {
        let doc = response;
        const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (codeBlockMatch) {
            doc = codeBlockMatch[1];
        }
        return doc.trim();
    }

    protected generateBasicDocumentation(code: string, language: string): string {
        const style = this.getDocumentationStyle(language);

        const funcMatch = code.match(/(?:function|def|fn|func)\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\()/);
        const name = funcMatch ? (funcMatch[1] || funcMatch[2]) : 'unknown';

        if (style.format === 'jsdoc') {
            return `/**
 * Description of ${name}
 * @param {type} param - Description
 * @returns {type} Description
 */`;
        }

        if (style.format === 'docstring') {
            return `"""
Description of ${name}

Args:
    param: Description

Returns:
    Description
"""`;
        }

        return `// Description of ${name}`;
    }

    protected getDocumentationStyle(language: string): { name: string; format: string } {
        const styles: Record<string, { name: string; format: string }> = {
            'typescript': { name: 'JSDoc', format: 'jsdoc' },
            'javascript': { name: 'JSDoc', format: 'jsdoc' },
            'typescriptreact': { name: 'JSDoc', format: 'jsdoc' },
            'javascriptreact': { name: 'JSDoc', format: 'jsdoc' },
            'python': { name: 'Docstring', format: 'docstring' },
            'java': { name: 'Javadoc', format: 'javadoc' },
            'csharp': { name: 'XML Doc', format: 'xmldoc' },
            'rust': { name: 'Rustdoc', format: 'rustdoc' },
            'go': { name: 'Go Doc', format: 'godoc' }
        };

        return styles[language] || { name: 'Comment', format: 'comment' };
    }

    protected getTestFramework(language: string): string {
        const frameworks: Record<string, string> = {
            'typescript': 'Jest',
            'javascript': 'Jest',
            'typescriptreact': 'Jest with React Testing Library',
            'javascriptreact': 'Jest with React Testing Library',
            'python': 'pytest',
            'java': 'JUnit 5',
            'csharp': 'xUnit',
            'rust': 'built-in test framework',
            'go': 'testing package'
        };

        return frameworks[language] || 'appropriate test framework';
    }

    protected isTestableLanguage(language: string): boolean {
        const testable = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact',
            'python', 'java', 'csharp', 'rust', 'go', 'kotlin', 'swift'];
        return testable.includes(language);
    }

    protected getFileName(uri: string): string {
        return uri.split('/').pop() ?? uri;
    }

    protected async handleExplainAction(uri: string, range: CodeRange): Promise<void> {
        const explanation = await this.explainCode(uri, range);
        await this.commandService.executeCommand('ai.showExplanation', explanation);
    }

    protected async handleRefactorAction(uri: string, range: CodeRange): Promise<void> {
        const suggestions = await this.suggestRefactoring(uri, range);
        await this.commandService.executeCommand('ai.showRefactoringSuggestions', suggestions);
    }

    protected async handleDocumentAction(uri: string, range: CodeRange): Promise<void> {
        const documentation = await this.generateDocumentation(uri, range);
        await this.commandService.executeCommand('ai.insertDocumentation', uri, range, documentation);
    }

    protected async handleTestAction(uri: string, range: CodeRange): Promise<void> {
        const tests = await this.generateTests(uri, range);
        await this.commandService.executeCommand('ai.showGeneratedTests', tests);
    }
}
