// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core';
import { WidgetManager } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { OpenClaudeBackendService } from '../common/openclaude-protocol';
import { CodeReviewWidget } from './code-review/code-review-widget';
import { TestPreviewWidget } from './test-generation/test-preview-widget';
import { TestGenerationDialog } from './test-generation/test-generation-dialog';
import { DocumentationWidget } from './documentation/documentation-widget';
import { DocumentationDialog } from './documentation/documentation-dialog';
import { AICompletionProvider } from './completion/ai-completion-provider';
import { ChatWidget } from './chat/chat-widget';
import { CodeCommentsWidget } from './code-comments/code-comments-widget';
import { AddCommentDialog } from './code-comments/add-comment-dialog';
import { CollaborationWidget } from './collaboration/collaboration-widget';
import { CursorDecoratorProvider } from './collaboration/cursor-decorator-provider';
import { ReviewWorkflowWidget } from './code-review-workflow/review-workflow-widget';
import { CreateReviewDialog } from './code-review-workflow/create-review-dialog';
import { TeamDashboardWidget } from './team-dashboard/team-dashboard-widget';

/**
 * OpenClaude commands
 */
export namespace OpenClaudeCommands {
    export const TEST_CONNECTION: Command = {
        id: 'openclaude.testConnection',
        label: 'OpenClaude: Test Backend Connection'
    };

    export const GET_STATUS: Command = {
        id: 'openclaude.getStatus',
        label: 'OpenClaude: Get Backend Status'
    };

    export const START_REVIEW: Command = {
        id: 'openclaude.startReview',
        label: 'OpenClaude: Start Code Review'
    };

    export const SHOW_CODE_REVIEW_PANEL: Command = {
        id: 'openclaude.showCodeReviewPanel',
        label: 'OpenClaude: Show Code Review Panel'
    };

    export const GENERATE_TESTS: Command = {
        id: 'openclaude.generateTests',
        label: 'OpenClaude: Generate Tests'
    };

    export const SHOW_TEST_PREVIEW: Command = {
        id: 'openclaude.showTestPreview',
        label: 'OpenClaude: Show Test Preview'
    };

    export const TOGGLE_AI_COMPLETIONS: Command = {
        id: 'openclaude.toggleAICompletions',
        label: 'OpenClaude: Toggle AI Code Completions'
    };

    export const GENERATE_DOCUMENTATION: Command = {
        id: 'openclaude.generateDocumentation',
        label: 'OpenClaude: Generate Documentation'
    };

    export const SHOW_DOCUMENTATION: Command = {
        id: 'openclaude.showDocumentation',
        label: 'OpenClaude: Show Documentation Panel'
    };

    export const SHOW_CHAT: Command = {
        id: 'openclaude.showChat',
        label: 'OpenClaude: Show Chat Panel'
    };

    export const JOIN_CHAT_SESSION: Command = {
        id: 'openclaude.joinChatSession',
        label: 'OpenClaude: Join Chat Session'
    };

    export const SHOW_CODE_COMMENTS: Command = {
        id: 'openclaude.showCodeComments',
        label: 'OpenClaude: Show Code Comments'
    };

    export const ADD_CODE_COMMENT: Command = {
        id: 'openclaude.addCodeComment',
        label: 'OpenClaude: Add Code Comment'
    };

    export const SHOW_COLLABORATION: Command = {
        id: 'openclaude.showCollaboration',
        label: 'OpenClaude: Show Collaboration Panel'
    };

    export const START_COLLABORATION: Command = {
        id: 'openclaude.startCollaboration',
        label: 'OpenClaude: Start Live Collaboration'
    };

    export const STOP_COLLABORATION: Command = {
        id: 'openclaude.stopCollaboration',
        label: 'OpenClaude: Stop Live Collaboration'
    };

    export const SHOW_REVIEW_WORKFLOW: Command = {
        id: 'openclaude.showReviewWorkflow',
        label: 'OpenClaude: Show Code Reviews'
    };

    export const CREATE_REVIEW_REQUEST: Command = {
        id: 'openclaude.createReviewRequest',
        label: 'OpenClaude: Create Review Request'
    };

    export const SHOW_TEAM_DASHBOARD: Command = {
        id: 'openclaude.showTeamDashboard',
        label: 'OpenClaude: Show Team Dashboard'
    };

    export const LIST_SKILLS: Command = {
        id: 'openclaude.listSkills',
        label: 'OpenClaude: List Installed Skills'
    };

    export const RELOAD_SKILLS: Command = {
        id: 'openclaude.reloadSkills',
        label: 'OpenClaude: Reload Skills'
    };
}

/**
 * Frontend contribution for OpenClaude integration
 *
 * Registers commands for testing and using OpenClaude backend services
 */
@injectable()
export class OpenClaudeFrontendContribution implements CommandContribution {

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    @inject(WidgetManager)
    protected readonly widgetManager!: WidgetManager;

    @inject(EditorManager)
    protected readonly editorManager!: EditorManager;

    @inject(AICompletionProvider)
    protected readonly completionProvider!: AICompletionProvider;

    @inject(CursorDecoratorProvider)
    protected readonly cursorDecorator!: CursorDecoratorProvider;

    /**
     * Register OpenClaude commands
     */
    registerCommands(commands: CommandRegistry): void {
        // Test connection command
        commands.registerCommand(OpenClaudeCommands.TEST_CONNECTION, {
            execute: async () => {
                try {
                    const result = await this.backendService.ping();
                    if (result) {
                        this.messageService.info('✅ OpenClaude backend connection successful!');
                    } else {
                        this.messageService.warn('⚠️ OpenClaude backend ping returned false');
                    }
                } catch (error) {
                    this.messageService.error(`❌ Failed to connect to OpenClaude backend: ${error}`);
                }
            }
        });

        // Get status command
        commands.registerCommand(OpenClaudeCommands.GET_STATUS, {
            execute: async () => {
                try {
                    const status = await this.backendService.getStatus();
                    if (status.healthy) {
                        const serviceCount = status.services.filter(s => s.status === 'healthy').length;
                        this.messageService.info(
                            `✅ Backend healthy: ${serviceCount}/${status.services.length} services running (v${status.version})`
                        );
                    } else {
                        this.messageService.warn('⚠️ Backend is not healthy');
                    }
                    console.log('[OpenClaude] Backend status:', status);
                } catch (error) {
                    this.messageService.error(`❌ Failed to get backend status: ${error}`);
                }
            }
        });

        // Show code review panel command
        commands.registerCommand(OpenClaudeCommands.SHOW_CODE_REVIEW_PANEL, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget<CodeReviewWidget>(CodeReviewWidget.ID);
                if (!widget.isAttached) {
                    await this.widgetManager.getOrCreateWidget(CodeReviewWidget.ID);
                }
                widget.activate();
            }
        });

        // Start code review command
        commands.registerCommand(OpenClaudeCommands.START_REVIEW, {
            execute: async () => {
                try {
                    // Get or create the code review widget
                    const widget = await this.widgetManager.getOrCreateWidget<CodeReviewWidget>(CodeReviewWidget.ID);
                    widget.activate();

                    // TODO: Get actual file paths from selection/workspace
                    const files = ['example.ts', 'test.ts', 'app.ts'];

                    this.messageService.info('🔍 Starting code review...');

                    // Start review in the widget
                    await widget.startReview(files);

                    console.log('[OpenClaude] Review started in panel');
                } catch (error) {
                    this.messageService.error(`❌ Failed to start code review: ${error}`);
                }
            }
        });

        // Show test preview command
        commands.registerCommand(OpenClaudeCommands.SHOW_TEST_PREVIEW, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget<TestPreviewWidget>(TestPreviewWidget.ID);
                widget.activate();
            }
        });

        // Generate tests command
        commands.registerCommand(OpenClaudeCommands.GENERATE_TESTS, {
            execute: async () => {
                try {
                    // Get current file path from active editor
                    const currentEditor = this.editorManager.currentEditor;
                    const filePath = currentEditor?.getResourceUri()?.path.toString() || '';

                    // Create and show dialog
                    const dialog = new TestGenerationDialog();
                    dialog.setFilePath(filePath);

                    const result = await dialog.open();
                    if (!result) {
                        return; // User cancelled
                    }

                    // Get or create the test preview widget
                    const widget = await this.widgetManager.getOrCreateWidget<TestPreviewWidget>(TestPreviewWidget.ID);
                    widget.activate();

                    this.messageService.info('🧪 Starting test generation...');

                    // Start test generation in the widget
                    await widget.startGeneration(result);

                    console.log('[OpenClaude] Test generation started');
                } catch (error) {
                    this.messageService.error(`❌ Failed to generate tests: ${error}`);
                }
            }
        });

        // Toggle AI completions command
        commands.registerCommand(OpenClaudeCommands.TOGGLE_AI_COMPLETIONS, {
            execute: async () => {
                // TODO: Implement toggle functionality
                this.messageService.info('AI Completions are always enabled (toggle feature coming soon)');
            }
        });

        // Show documentation panel command
        commands.registerCommand(OpenClaudeCommands.SHOW_DOCUMENTATION, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget<DocumentationWidget>(DocumentationWidget.ID);
                widget.activate();
            }
        });

        // Generate documentation command
        commands.registerCommand(OpenClaudeCommands.GENERATE_DOCUMENTATION, {
            execute: async () => {
                try {
                    // Get current file path and content from active editor
                    const currentEditor = this.editorManager.currentEditor;
                    const filePath = currentEditor?.getResourceUri()?.path.toString() || '';

                    // Get file content
                    let content = '';
                    if (currentEditor && currentEditor instanceof MonacoEditor) {
                        content = currentEditor.getControl().getModel()?.getValue() || '';
                    }

                    // Create and show dialog
                    const dialog = new DocumentationDialog();
                    dialog.setFilePath(filePath);

                    const result = await dialog.open();
                    if (!result) {
                        return; // User cancelled
                    }

                    // Fill in content
                    result.content = content;

                    // Get or create the documentation widget
                    const widget = await this.widgetManager.getOrCreateWidget<DocumentationWidget>(DocumentationWidget.ID);
                    widget.activate();

                    this.messageService.info('📝 Starting documentation generation...');

                    // Start documentation generation in the widget
                    await widget.startGeneration(result);

                    console.log('[OpenClaude] Documentation generation started');
                } catch (error) {
                    this.messageService.error(`❌ Failed to generate documentation: ${error}`);
                }
            }
        });

        // Show chat panel command
        commands.registerCommand(OpenClaudeCommands.SHOW_CHAT, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget<ChatWidget>(ChatWidget.ID);
                widget.activate();
            }
        });

        // Join chat session command
        commands.registerCommand(OpenClaudeCommands.JOIN_CHAT_SESSION, {
            execute: async (sessionId?: string) => {
                try {
                    // Get or create the chat widget
                    const widget = await this.widgetManager.getOrCreateWidget<ChatWidget>(ChatWidget.ID);
                    widget.activate();

                    // Join the session
                    const id = sessionId || 'default';
                    this.messageService.info(`💬 Joining chat session: ${id}`);
                    await widget.joinSession(id);

                    console.log('[OpenClaude] Joined chat session:', id);
                } catch (error) {
                    this.messageService.error(`❌ Failed to join chat session: ${error}`);
                }
            }
        });

        // Show code comments panel command
        commands.registerCommand(OpenClaudeCommands.SHOW_CODE_COMMENTS, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget<CodeCommentsWidget>(CodeCommentsWidget.ID);
                widget.activate();
            }
        });

        // Add code comment command
        commands.registerCommand(OpenClaudeCommands.ADD_CODE_COMMENT, {
            execute: async () => {
                try {
                    // Get current file and selection
                    const currentEditor = this.editorManager.currentEditor;
                    if (!currentEditor) {
                        this.messageService.warn('No active editor');
                        return;
                    }

                    const filePath = currentEditor.getResourceUri()?.path.toString();
                    if (!filePath) {
                        this.messageService.warn('No file path available');
                        return;
                    }

                    const selection = currentEditor.editor.selection;
                    const line = selection.start.line + 1; // Convert to 1-based
                    const column = selection.start.character;
                    const endLine = selection.end.line !== selection.start.line ? selection.end.line + 1 : undefined;
                    const endColumn = endLine ? selection.end.character : undefined;

                    // Create and show dialog
                    const dialog = new AddCommentDialog();
                    dialog.setLocation(filePath, line, column, endLine, endColumn);

                    const result = await dialog.open();
                    if (!result) {
                        return; // User cancelled
                    }

                    this.messageService.info('💬 Adding code comment...');

                    // Add comment via backend
                    const comment = await this.backendService.addCodeComment({
                        id: '', // Will be assigned by backend
                        filePath: result.filePath,
                        line: result.line,
                        column: result.column,
                        endLine: result.endLine,
                        endColumn: result.endColumn,
                        author: { id: 'current-user', name: 'Current User', status: 'online' }, // TODO: Get actual user
                        text: result.text,
                        timestamp: Date.now(),
                        type: result.type,
                        severity: result.severity,
                        resolved: false,
                        replies: []
                    });

                    // Show comments panel
                    const widget = await this.widgetManager.getOrCreateWidget<CodeCommentsWidget>(CodeCommentsWidget.ID);
                    widget.activate();
                    await widget.loadComments();

                    console.log('[OpenClaude] Code comment added:', comment.id);
                } catch (error) {
                    this.messageService.error(`❌ Failed to add code comment: ${error}`);
                }
            }
        });

        // Show collaboration panel command
        commands.registerCommand(OpenClaudeCommands.SHOW_COLLABORATION, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget<CollaborationWidget>(CollaborationWidget.ID);
                widget.activate();
            }
        });

        // Start collaboration command
        commands.registerCommand(OpenClaudeCommands.START_COLLABORATION, {
            execute: async () => {
                try {
                    // Get or create the collaboration widget
                    const widget = await this.widgetManager.getOrCreateWidget<CollaborationWidget>(CollaborationWidget.ID);
                    widget.activate();

                    // Start collaboration
                    this.messageService.info('🤝 Starting live collaboration...');
                    await widget.startCollaboration();

                    console.log('[OpenClaude] Collaboration started');
                } catch (error) {
                    this.messageService.error(`❌ Failed to start collaboration: ${error}`);
                }
            }
        });

        // Stop collaboration command
        commands.registerCommand(OpenClaudeCommands.STOP_COLLABORATION, {
            execute: async () => {
                try {
                    const widget = await this.widgetManager.getOrCreateWidget<CollaborationWidget>(CollaborationWidget.ID);
                    await widget.leaveSession();

                    this.messageService.info('Collaboration stopped');
                    console.log('[OpenClaude] Collaboration stopped');
                } catch (error) {
                    this.messageService.error(`❌ Failed to stop collaboration: ${error}`);
                }
            }
        });

        // Show review workflow command
        commands.registerCommand(OpenClaudeCommands.SHOW_REVIEW_WORKFLOW, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget<ReviewWorkflowWidget>(ReviewWorkflowWidget.ID);
                widget.activate();
            }
        });

        // Create review request command
        commands.registerCommand(OpenClaudeCommands.CREATE_REVIEW_REQUEST, {
            execute: async () => {
                try {
                    // Get current file
                    const currentEditor = this.editorManager.currentEditor;
                    const filePath = currentEditor?.getResourceUri()?.path.toString();

                    // Create and show dialog
                    const dialog = new CreateReviewDialog();
                    if (filePath) {
                        dialog.setFiles([filePath]);
                    }

                    const result = await dialog.open();
                    if (!result) {
                        return; // User cancelled
                    }

                    this.messageService.info('🔍 Creating review request...');

                    // Create review request
                    const review = await this.backendService.createReviewRequest(result);

                    // Show review workflow widget
                    const widget = await this.widgetManager.getOrCreateWidget<ReviewWorkflowWidget>(ReviewWorkflowWidget.ID);
                    widget.activate();
                    await widget.loadReviews();

                    this.messageService.info('✅ Review request created');
                    console.log('[OpenClaude] Review request created:', review.id);
                } catch (error) {
                    this.messageService.error(`❌ Failed to create review request: ${error}`);
                }
            }
        });

        // Show team dashboard command
        commands.registerCommand(OpenClaudeCommands.SHOW_TEAM_DASHBOARD, {
            execute: async () => {
                const widget = await this.widgetManager.getOrCreateWidget<TeamDashboardWidget>(TeamDashboardWidget.ID);
                widget.activate();
            }
        });

        // List installed skills command
        commands.registerCommand(OpenClaudeCommands.LIST_SKILLS, {
            execute: async () => {
                try {
                    const skills = await this.backendService.getLoadedSkills();
                    if (skills.length === 0) {
                        this.messageService.info('No skills installed. Install skills with: npx skills add <repo> -a openclaude');
                    } else {
                        const skillList = skills.map(s => `${s.name} (${s.scope})`).join(', ');
                        this.messageService.info(`${skills.length} skill(s) loaded: ${skillList}`);
                    }
                    console.log('[OpenClaude] Loaded skills:', skills);
                } catch (error) {
                    this.messageService.error(`Failed to list skills: ${error}`);
                }
            }
        });

        // Reload skills command
        commands.registerCommand(OpenClaudeCommands.RELOAD_SKILLS, {
            execute: async () => {
                try {
                    const count = await this.backendService.reloadSkills();
                    this.messageService.info(`Reloaded ${count} skill(s)`);
                } catch (error) {
                    this.messageService.error(`Failed to reload skills: ${error}`);
                }
            }
        });
    }
}
