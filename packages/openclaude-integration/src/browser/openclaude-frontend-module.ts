// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { WebSocketConnectionProvider, WidgetFactory } from '@theia/core/lib/browser';
import { OpenClaudeBackendService, OPENCLAUDE_BACKEND_PATH } from '../common/openclaude-protocol';
import { OpenClaudeFrontendContribution } from './openclaude-frontend-contribution';
import { CommandContribution } from '@theia/core';
import { CodeReviewWidget } from './code-review/code-review-widget';
import { CodeReviewDecorationProvider } from './code-review/code-review-decoration-provider';
import { CodeReviewCodeActionProvider } from './code-review/code-review-code-action-provider';
import { TestPreviewWidget } from './test-generation/test-preview-widget';
import { DocumentationWidget } from './documentation/documentation-widget';
import { AICompletionProvider } from './completion/ai-completion-provider';
import { CompletionContextAnalyzer } from './completion/completion-context-analyzer';
import { ChatWidget } from './chat/chat-widget';
import { CodeCommentsWidget } from './code-comments/code-comments-widget';
import { CollaborationWidget } from './collaboration/collaboration-widget';
import { CursorDecoratorProvider } from './collaboration/cursor-decorator-provider';
import { ReviewWorkflowWidget } from './code-review-workflow/review-workflow-widget';
import { TeamDashboardWidget } from './team-dashboard/team-dashboard-widget';
import { SkillsExplorerWidget } from './skills-explorer/skills-explorer-widget';

import '../../src/browser/style/code-review.css';
import '../../src/browser/style/test-generation.css';
import '../../src/browser/style/ai-completion.css';
import '../../src/browser/style/documentation.css';
import '../../src/browser/style/chat.css';
import '../../src/browser/style/code-comments.css';
import '../../src/browser/style/collaboration.css';
import '../../src/browser/style/review-workflow.css';
import '../../src/browser/style/team-dashboard.css';
import '../../src/browser/style/skills-explorer.css';

/**
 * Frontend module for OpenClaude integration
 *
 * This module:
 * - Connects to the backend service via WebSocket
 * - Registers OpenClaude commands and UI contributions
 */
export default new ContainerModule(bind => {
    // Connect to backend service via WebSocket
    bind(OpenClaudeBackendService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<OpenClaudeBackendService>(OPENCLAUDE_BACKEND_PATH);
    }).inSingletonScope();

    // Register frontend contributions
    bind(OpenClaudeFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(OpenClaudeFrontendContribution);

    // Register Code Review services
    bind(CodeReviewDecorationProvider).toSelf().inSingletonScope();
    bind(CodeReviewCodeActionProvider).toSelf().inSingletonScope();

    // Register AI Completion services
    bind(CompletionContextAnalyzer).toSelf().inSingletonScope();
    bind(AICompletionProvider).toSelf().inSingletonScope();

    // Register Code Review Widget
    bind(CodeReviewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: CodeReviewWidget.ID,
        createWidget: () => ctx.container.get<CodeReviewWidget>(CodeReviewWidget)
    })).inSingletonScope();

    // Register Test Preview Widget
    bind(TestPreviewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TestPreviewWidget.ID,
        createWidget: () => ctx.container.get<TestPreviewWidget>(TestPreviewWidget)
    })).inSingletonScope();

    // Register Documentation Widget
    bind(DocumentationWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: DocumentationWidget.ID,
        createWidget: () => ctx.container.get<DocumentationWidget>(DocumentationWidget)
    })).inSingletonScope();

    // Register Chat Widget
    bind(ChatWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: ChatWidget.ID,
        createWidget: () => ctx.container.get<ChatWidget>(ChatWidget)
    })).inSingletonScope();

    // Register Code Comments Widget
    bind(CodeCommentsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: CodeCommentsWidget.ID,
        createWidget: () => ctx.container.get<CodeCommentsWidget>(CodeCommentsWidget)
    })).inSingletonScope();

    // Register Collaboration services
    bind(CursorDecoratorProvider).toSelf().inSingletonScope();

    // Register Collaboration Widget
    bind(CollaborationWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: CollaborationWidget.ID,
        createWidget: () => ctx.container.get<CollaborationWidget>(CollaborationWidget)
    })).inSingletonScope();

    // Register Review Workflow Widget
    bind(ReviewWorkflowWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: ReviewWorkflowWidget.ID,
        createWidget: () => ctx.container.get<ReviewWorkflowWidget>(ReviewWorkflowWidget)
    })).inSingletonScope();

    // Register Team Dashboard Widget
    bind(TeamDashboardWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TeamDashboardWidget.ID,
        createWidget: () => ctx.container.get<TeamDashboardWidget>(TeamDashboardWidget)
    })).inSingletonScope();

    // Register Skills Explorer Widget
    bind(SkillsExplorerWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SkillsExplorerWidget.ID,
        createWidget: () => ctx.container.get<SkillsExplorerWidget>(SkillsExplorerWidget)
    })).inSingletonScope();
});
