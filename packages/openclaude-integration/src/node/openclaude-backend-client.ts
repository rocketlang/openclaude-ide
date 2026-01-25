// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { GraphQLClient, gql } from 'graphql-request';
import {
    OpenClaudeBackendService,
    BackendStatus,
    CodeReview,
    CodeIssue,
    TestGenerationOptions,
    TestGenerationResult,
    CompletionRequest,
    CompletionResult,
    DocumentationOptions,
    DocumentationResult
} from '../common/openclaude-protocol';
import {
    OpenClaudeConfig,
    DEFAULT_OPENCLAUDE_CONFIG,
    StartReviewMutationResult,
    GetReviewQueryResult
} from '../common/openclaude-types';

/**
 * GraphQL client for OpenClaude backend services
 */
@injectable()
export class OpenClaudeBackendClient implements OpenClaudeBackendService {

    protected client!: GraphQLClient;
    protected config: OpenClaudeConfig = DEFAULT_OPENCLAUDE_CONFIG;

    @postConstruct()
    protected init(): void {
        // Initialize GraphQL client
        this.client = new GraphQLClient(this.config.backendUrl, {
            headers: {
                'Content-Type': 'application/json',
                ...(this.config.apiToken && {
                    'Authorization': `Bearer ${this.config.apiToken}`
                })
            }
        });

        if (this.config.debug) {
            console.log('[OpenClaude] Backend client initialized:', this.config.backendUrl);
        }
    }

    /**
     * Test connection to backend
     */
    async ping(): Promise<boolean> {
        try {
            const query = gql`
                query Ping {
                    ping
                }
            `;

            const result = await this.client.request<{ ping: boolean }>(query);
            return result.ping || false;
        } catch (error) {
            console.error('[OpenClaude] Ping failed:', error);
            return false;
        }
    }

    /**
     * Get backend service status
     */
    async getStatus(): Promise<BackendStatus> {
        try {
            const query = gql`
                query GetStatus {
                    status {
                        healthy
                        version
                        services {
                            name
                            status
                            responseTime
                        }
                    }
                }
            `;

            const result = await this.client.request<{ status: BackendStatus }>(query);
            return result.status;
        } catch (error) {
            console.error('[OpenClaude] Get status failed:', error);
            return {
                healthy: false,
                services: [],
                version: 'unknown'
            };
        }
    }

    /**
     * Start a code review
     */
    async startCodeReview(files: string[]): Promise<CodeReview> {
        try {
            const mutation = gql`
                mutation StartReview($files: [String!]!) {
                    startReview(files: $files) {
                        id
                        status
                    }
                }
            `;

            const result = await this.client.request<StartReviewMutationResult>(
                mutation,
                { files }
            );

            return {
                id: result.startReview.id,
                status: result.startReview.status as CodeReview['status'],
                issues: []
            };
        } catch (error) {
            console.error('[OpenClaude] Start review failed:', error);
            throw new Error(`Failed to start code review: ${error}`);
        }
    }

    /**
     * Get code review by ID
     */
    async getCodeReview(id: string): Promise<CodeReview> {
        try {
            const query = gql`
                query GetReview($id: ID!) {
                    review(id: $id) {
                        id
                        status
                        issues {
                            file
                            line
                            column
                            severity
                            message
                            category
                            suggestedFix
                            ruleId
                        }
                        summary {
                            totalIssues
                            blockers
                            critical
                            major
                            minor
                            info
                            filesReviewed
                        }
                    }
                }
            `;

            const result = await this.client.request<GetReviewQueryResult>(
                query,
                { id }
            );

            const review = result.review;
            return {
                id: review.id,
                status: review.status as CodeReview['status'],
                issues: review.issues.map((issue: any) => ({
                    ...issue,
                    severity: issue.severity as CodeIssue['severity']
                })),
                summary: review.summary
            };
        } catch (error) {
            console.error('[OpenClaude] Get review failed:', error);
            throw new Error(`Failed to get code review: ${error}`);
        }
    }

    /**
     * Generate tests for a file
     */
    async generateTests(options: TestGenerationOptions): Promise<TestGenerationResult> {
        try {
            const mutation = gql`
                mutation GenerateTests($options: TestGenerationInput!) {
                    generateTests(options: $options) {
                        id
                        status
                    }
                }
            `;

            const result = await this.client.request<{ generateTests: { id: string; status: string } }>(
                mutation,
                { options }
            );

            return {
                id: result.generateTests.id,
                status: result.generateTests.status as TestGenerationResult['status'],
                options
            };
        } catch (error) {
            console.error('[OpenClaude] Generate tests failed:', error);
            throw new Error(`Failed to generate tests: ${error}`);
        }
    }

    /**
     * Get test generation result by ID
     */
    async getTestGeneration(id: string): Promise<TestGenerationResult> {
        try {
            const query = gql`
                query GetTestGeneration($id: ID!) {
                    testGeneration(id: $id) {
                        id
                        status
                        options {
                            filePath
                            targetSymbol
                            framework
                            testType
                            coverageLevel
                        }
                        generatedTests {
                            name
                            code
                            targetFile
                            testsSymbol
                            type
                        }
                        coverage {
                            overall
                            statements
                            branches
                            functions
                            lines
                        }
                        error
                    }
                }
            `;

            const result = await this.client.request<{ testGeneration: any }>(
                query,
                { id }
            );

            const generation = result.testGeneration;
            return {
                id: generation.id,
                status: generation.status as TestGenerationResult['status'],
                options: generation.options,
                generatedTests: generation.generatedTests,
                coverage: generation.coverage,
                error: generation.error
            };
        } catch (error) {
            console.error('[OpenClaude] Get test generation failed:', error);
            throw new Error(`Failed to get test generation: ${error}`);
        }
    }

    /**
     * Get AI code completions
     */
    async getCompletions(request: CompletionRequest): Promise<CompletionResult> {
        try {
            const query = gql`
                query GetCompletions($request: CompletionRequestInput!) {
                    completions(request: $request) {
                        items {
                            label
                            kind
                            detail
                            documentation
                            insertText
                            sortText
                            filterText
                            isAI
                            confidence
                        }
                        isIncomplete
                    }
                }
            `;

            const result = await this.client.request<{ completions: CompletionResult }>(
                query,
                { request }
            );

            return result.completions;
        } catch (error) {
            console.error('[OpenClaude] Get completions failed:', error);
            // Return empty result on error
            return {
                items: [],
                isIncomplete: false
            };
        }
    }

    /**
     * Generate documentation
     */
    async generateDocumentation(options: DocumentationOptions): Promise<DocumentationResult> {
        try {
            const mutation = gql`
                mutation GenerateDocumentation($options: DocumentationOptionsInput!) {
                    generateDocumentation(options: $options) {
                        id
                        status
                    }
                }
            `;

            const result = await this.client.request<{ generateDocumentation: { id: string; status: string } }>(
                mutation,
                { options }
            );

            return {
                id: result.generateDocumentation.id,
                status: result.generateDocumentation.status as DocumentationResult['status'],
                options
            };
        } catch (error) {
            console.error('[OpenClaude] Generate documentation failed:', error);
            throw new Error(`Failed to generate documentation: ${error}`);
        }
    }

    /**
     * Get documentation generation result by ID
     */
    async getDocumentation(id: string): Promise<DocumentationResult> {
        try {
            const query = gql`
                query GetDocumentation($id: ID!) {
                    documentation(id: $id) {
                        id
                        status
                        options {
                            filePath
                            targetSymbol
                            format
                            style
                            includeExamples
                        }
                        documentation {
                            symbolName
                            symbolType
                            line
                            documentation
                            examples
                        }
                        error
                    }
                }
            `;

            const result = await this.client.request<{ documentation: any }>(
                query,
                { id }
            );

            const doc = result.documentation;
            return {
                id: doc.id,
                status: doc.status as DocumentationResult['status'],
                options: doc.options,
                documentation: doc.documentation,
                error: doc.error
            };
        } catch (error) {
            console.error('[OpenClaude] Get documentation failed:', error);
            throw new Error(`Failed to get documentation: ${error}`);
        }
    }

    /**
     * Send a chat message
     */
    async sendChatMessage(sessionId: string, message: string): Promise<import('../common/openclaude-protocol').ChatMessage> {
        try {
            const mutation = gql`
                mutation SendChatMessage($sessionId: ID!, $message: String!) {
                    sendChatMessage(sessionId: $sessionId, message: $message) {
                        id
                        sessionId
                        sender {
                            id
                            name
                            avatar
                            status
                        }
                        content
                        timestamp
                        isAI
                    }
                }
            `;

            const result = await this.client.request<{ sendChatMessage: any }>(
                mutation,
                { sessionId, message }
            );

            return result.sendChatMessage;
        } catch (error) {
            console.error('[OpenClaude] Send chat message failed:', error);
            throw new Error(`Failed to send chat message: ${error}`);
        }
    }

    /**
     * Get chat messages for a session
     */
    async getChatMessages(sessionId: string, limit?: number): Promise<import('../common/openclaude-protocol').ChatMessage[]> {
        try {
            const query = gql`
                query GetChatMessages($sessionId: ID!, $limit: Int) {
                    chatMessages(sessionId: $sessionId, limit: $limit) {
                        id
                        sessionId
                        sender {
                            id
                            name
                            avatar
                            status
                        }
                        content
                        timestamp
                        isAI
                    }
                }
            `;

            const result = await this.client.request<{ chatMessages: any[] }>(
                query,
                { sessionId, limit }
            );

            return result.chatMessages;
        } catch (error) {
            console.error('[OpenClaude] Get chat messages failed:', error);
            return [];
        }
    }

    /**
     * Join a chat session
     */
    async joinChatSession(sessionId: string): Promise<import('../common/openclaude-protocol').ChatSession> {
        try {
            const mutation = gql`
                mutation JoinChatSession($sessionId: ID!) {
                    joinChatSession(sessionId: $sessionId) {
                        id
                        name
                        users {
                            id
                            name
                            avatar
                            status
                        }
                        typingUsers {
                            id
                            name
                            avatar
                            status
                        }
                        lastMessageTimestamp
                    }
                }
            `;

            const result = await this.client.request<{ joinChatSession: any }>(
                mutation,
                { sessionId }
            );

            return result.joinChatSession;
        } catch (error) {
            console.error('[OpenClaude] Join chat session failed:', error);
            throw new Error(`Failed to join chat session: ${error}`);
        }
    }

    /**
     * Leave a chat session
     */
    async leaveChatSession(sessionId: string): Promise<void> {
        try {
            const mutation = gql`
                mutation LeaveChatSession($sessionId: ID!) {
                    leaveChatSession(sessionId: $sessionId)
                }
            `;

            await this.client.request(mutation, { sessionId });
        } catch (error) {
            console.error('[OpenClaude] Leave chat session failed:', error);
            throw new Error(`Failed to leave chat session: ${error}`);
        }
    }

    /**
     * Set typing indicator
     */
    async setTypingIndicator(sessionId: string, isTyping: boolean): Promise<void> {
        try {
            const mutation = gql`
                mutation SetTypingIndicator($sessionId: ID!, $isTyping: Boolean!) {
                    setTypingIndicator(sessionId: $sessionId, isTyping: $isTyping)
                }
            `;

            await this.client.request(mutation, { sessionId, isTyping });
        } catch (error) {
            console.error('[OpenClaude] Set typing indicator failed:', error);
            // Don't throw, typing indicators are non-critical
        }
    }

    /**
     * Add a code comment
     */
    async addCodeComment(comment: import('../common/openclaude-protocol').CodeComment): Promise<import('../common/openclaude-protocol').CodeComment> {
        try {
            const mutation = gql`
                mutation AddCodeComment($comment: CodeCommentInput!) {
                    addCodeComment(comment: $comment) {
                        id
                        filePath
                        line
                        column
                        endLine
                        endColumn
                        author {
                            id
                            name
                            avatar
                            status
                        }
                        text
                        timestamp
                        type
                        severity
                        resolved
                        replies {
                            id
                            commentId
                            author {
                                id
                                name
                                avatar
                                status
                            }
                            text
                            timestamp
                        }
                    }
                }
            `;

            const result = await this.client.request<{ addCodeComment: any }>(mutation, { comment });
            return result.addCodeComment;
        } catch (error) {
            console.error('[OpenClaude] Add code comment failed:', error);
            throw new Error(`Failed to add code comment: ${error}`);
        }
    }

    /**
     * Get code comments for a file
     */
    async getCodeComments(filePath: string, includeResolved?: boolean): Promise<import('../common/openclaude-protocol').CodeComment[]> {
        try {
            const query = gql`
                query GetCodeComments($filePath: String!, $includeResolved: Boolean) {
                    codeComments(filePath: $filePath, includeResolved: $includeResolved) {
                        id
                        filePath
                        line
                        column
                        endLine
                        endColumn
                        author {
                            id
                            name
                            avatar
                            status
                        }
                        text
                        timestamp
                        type
                        severity
                        resolved
                        resolvedBy {
                            id
                            name
                            avatar
                            status
                        }
                        resolvedTimestamp
                        replies {
                            id
                            commentId
                            author {
                                id
                                name
                                avatar
                                status
                            }
                            text
                            timestamp
                        }
                    }
                }
            `;

            const result = await this.client.request<{ codeComments: any[] }>(query, { filePath, includeResolved });
            return result.codeComments;
        } catch (error) {
            console.error('[OpenClaude] Get code comments failed:', error);
            return [];
        }
    }

    /**
     * Reply to a code comment
     */
    async replyToComment(commentId: string, reply: string): Promise<import('../common/openclaude-protocol').CommentReply> {
        try {
            const mutation = gql`
                mutation ReplyToComment($commentId: ID!, $reply: String!) {
                    replyToComment(commentId: $commentId, reply: $reply) {
                        id
                        commentId
                        author {
                            id
                            name
                            avatar
                            status
                        }
                        text
                        timestamp
                    }
                }
            `;

            const result = await this.client.request<{ replyToComment: any }>(mutation, { commentId, reply });
            return result.replyToComment;
        } catch (error) {
            console.error('[OpenClaude] Reply to comment failed:', error);
            throw new Error(`Failed to reply to comment: ${error}`);
        }
    }

    /**
     * Resolve a code comment
     */
    async resolveComment(commentId: string): Promise<void> {
        try {
            const mutation = gql`
                mutation ResolveComment($commentId: ID!) {
                    resolveComment(commentId: $commentId)
                }
            `;

            await this.client.request(mutation, { commentId });
        } catch (error) {
            console.error('[OpenClaude] Resolve comment failed:', error);
            throw new Error(`Failed to resolve comment: ${error}`);
        }
    }

    /**
     * Unresolve a code comment
     */
    async unresolveComment(commentId: string): Promise<void> {
        try {
            const mutation = gql`
                mutation UnresolveComment($commentId: ID!) {
                    unresolveComment(commentId: $commentId)
                }
            `;

            await this.client.request(mutation, { commentId });
        } catch (error) {
            console.error('[OpenClaude] Unresolve comment failed:', error);
            throw new Error(`Failed to unresolve comment: ${error}`);
        }
    }

    /**
     * Delete a code comment
     */
    async deleteComment(commentId: string): Promise<void> {
        try {
            const mutation = gql`
                mutation DeleteComment($commentId: ID!) {
                    deleteComment(commentId: $commentId)
                }
            `;

            await this.client.request(mutation, { commentId });
        } catch (error) {
            console.error('[OpenClaude] Delete comment failed:', error);
            throw new Error(`Failed to delete comment: ${error}`);
        }
    }

    /**
     * Join a collaboration session
     */
    async joinCollaborationSession(filePath: string): Promise<import('../common/openclaude-protocol').CollaborationSession> {
        try {
            const mutation = gql`
                mutation JoinCollaborationSession($filePath: String!) {
                    joinCollaborationSession(filePath: $filePath) {
                        id
                        filePath
                        collaborators {
                            user {
                                id
                                name
                                avatar
                                status
                            }
                            cursor {
                                line
                                column
                            }
                            selection {
                                start {
                                    line
                                    column
                                }
                                end {
                                    line
                                    column
                                }
                            }
                            lastActivity
                            color
                        }
                        startedAt
                    }
                }
            `;

            const result = await this.client.request<{ joinCollaborationSession: any }>(mutation, { filePath });
            return result.joinCollaborationSession;
        } catch (error) {
            console.error('[OpenClaude] Join collaboration session failed:', error);
            throw new Error(`Failed to join collaboration session: ${error}`);
        }
    }

    /**
     * Leave a collaboration session
     */
    async leaveCollaborationSession(sessionId: string): Promise<void> {
        try {
            const mutation = gql`
                mutation LeaveCollaborationSession($sessionId: ID!) {
                    leaveCollaborationSession(sessionId: $sessionId)
                }
            `;

            await this.client.request(mutation, { sessionId });
        } catch (error) {
            console.error('[OpenClaude] Leave collaboration session failed:', error);
            throw new Error(`Failed to leave collaboration session: ${error}`);
        }
    }

    /**
     * Update cursor position
     */
    async updateCursorPosition(sessionId: string, cursor: import('../common/openclaude-protocol').CursorPosition): Promise<void> {
        try {
            const mutation = gql`
                mutation UpdateCursorPosition($sessionId: ID!, $cursor: CursorPositionInput!) {
                    updateCursorPosition(sessionId: $sessionId, cursor: $cursor)
                }
            `;

            await this.client.request(mutation, { sessionId, cursor });
        } catch (error) {
            console.error('[OpenClaude] Update cursor position failed:', error);
            // Don't throw, cursor updates are non-critical
        }
    }

    /**
     * Update selection
     */
    async updateSelection(sessionId: string, selection: import('../common/openclaude-protocol').SelectionRange): Promise<void> {
        try {
            const mutation = gql`
                mutation UpdateSelection($sessionId: ID!, $selection: SelectionRangeInput!) {
                    updateSelection(sessionId: $sessionId, selection: $selection)
                }
            `;

            await this.client.request(mutation, { sessionId, selection });
        } catch (error) {
            console.error('[OpenClaude] Update selection failed:', error);
            // Don't throw, selection updates are non-critical
        }
    }

    /**
     * Get collaborators in a session
     */
    async getCollaborators(sessionId: string): Promise<import('../common/openclaude-protocol').Collaborator[]> {
        try {
            const query = gql`
                query GetCollaborators($sessionId: ID!) {
                    collaborators(sessionId: $sessionId) {
                        user {
                            id
                            name
                            avatar
                            status
                        }
                        cursor {
                            line
                            column
                        }
                        selection {
                            start {
                                line
                                column
                            }
                            end {
                                line
                                column
                            }
                        }
                        lastActivity
                        color
                    }
                }
            `;

            const result = await this.client.request<{ collaborators: any[] }>(query, { sessionId });
            return result.collaborators;
        } catch (error) {
            console.error('[OpenClaude] Get collaborators failed:', error);
            return [];
        }
    }

    /**
     * Send document change
     */
    async sendDocumentChange(sessionId: string, change: import('../common/openclaude-protocol').DocumentChange): Promise<void> {
        try {
            const mutation = gql`
                mutation SendDocumentChange($sessionId: ID!, $change: DocumentChangeInput!) {
                    sendDocumentChange(sessionId: $sessionId, change: $change)
                }
            `;

            await this.client.request(mutation, { sessionId, change });
        } catch (error) {
            console.error('[OpenClaude] Send document change failed:', error);
            throw new Error(`Failed to send document change: ${error}`);
        }
    }

    /**
     * Create a review request
     */
    async createReviewRequest(request: import('../common/openclaude-protocol').ReviewRequest): Promise<import('../common/openclaude-protocol').CodeReview> {
        try {
            const mutation = gql`
                mutation CreateReviewRequest($request: ReviewRequestInput!) {
                    createReviewRequest(request: $request) {
                        id
                        status
                        issues
                    }
                }
            `;

            const result = await this.client.request<{ createReviewRequest: any }>(mutation, { request });
            return result.createReviewRequest;
        } catch (error) {
            console.error('[OpenClaude] Create review request failed:', error);
            throw new Error(`Failed to create review request: ${error}`);
        }
    }

    /**
     * Get a specific review
     */
    async getReview(reviewId: string): Promise<import('../common/openclaude-protocol').CodeReviewWorkflow> {
        try {
            const query = gql`
                query GetReview($reviewId: ID!) {
                    reviewWorkflow(id: $reviewId) {
                        id
                        title
                        description
                        author {
                            id
                            name
                            avatar
                            status
                        }
                        files {
                            path
                            changesCount
                            linesAdded
                            linesRemoved
                            status
                        }
                        reviewers {
                            user {
                                id
                                name
                                avatar
                                status
                            }
                            decision {
                                type
                                comment
                                timestamp
                            }
                            decidedAt
                            status
                        }
                        status
                        priority
                        createdAt
                        updatedAt
                        dueDate
                        comments {
                            id
                            reviewId
                            filePath
                            line
                            author {
                                id
                                name
                                avatar
                                status
                            }
                            text
                            timestamp
                            resolved
                        }
                        summary {
                            totalFiles
                            filesReviewed
                            totalReviewers
                            approvals
                            changeRequests
                            rejections
                            totalComments
                            unresolvedComments
                        }
                    }
                }
            `;

            const result = await this.client.request<{ reviewWorkflow: any }>(query, { reviewId });
            return result.reviewWorkflow;
        } catch (error) {
            console.error('[OpenClaude] Get review failed:', error);
            throw new Error(`Failed to get review: ${error}`);
        }
    }

    /**
     * Get all reviews with optional filters
     */
    async getReviews(filters?: import('../common/openclaude-protocol').ReviewFilters): Promise<import('../common/openclaude-protocol').CodeReviewWorkflow[]> {
        try {
            const query = gql`
                query GetReviews($filters: ReviewFiltersInput) {
                    reviewWorkflows(filters: $filters) {
                        id
                        title
                        description
                        author {
                            id
                            name
                            avatar
                            status
                        }
                        files {
                            path
                            changesCount
                            linesAdded
                            linesRemoved
                            status
                        }
                        reviewers {
                            user {
                                id
                                name
                                avatar
                                status
                            }
                            decision {
                                type
                                comment
                                timestamp
                            }
                            decidedAt
                            status
                        }
                        status
                        priority
                        createdAt
                        updatedAt
                        dueDate
                        comments {
                            id
                            reviewId
                            filePath
                            line
                            author {
                                id
                                name
                                avatar
                                status
                            }
                            text
                            timestamp
                            resolved
                        }
                        summary {
                            totalFiles
                            filesReviewed
                            totalReviewers
                            approvals
                            changeRequests
                            rejections
                            totalComments
                            unresolvedComments
                        }
                    }
                }
            `;

            const result = await this.client.request<{ reviewWorkflows: any[] }>(query, { filters });
            return result.reviewWorkflows;
        } catch (error) {
            console.error('[OpenClaude] Get reviews failed:', error);
            return [];
        }
    }

    /**
     * Submit a review decision
     */
    async submitReview(reviewId: string, decision: import('../common/openclaude-protocol').ReviewDecision): Promise<void> {
        try {
            const mutation = gql`
                mutation SubmitReview($reviewId: ID!, $decision: ReviewDecisionInput!) {
                    submitReview(reviewId: $reviewId, decision: $decision)
                }
            `;

            await this.client.request(mutation, { reviewId, decision });
        } catch (error) {
            console.error('[OpenClaude] Submit review failed:', error);
            throw new Error(`Failed to submit review: ${error}`);
        }
    }

    /**
     * Add a review comment
     */
    async addReviewComment(reviewId: string, comment: import('../common/openclaude-protocol').ReviewComment): Promise<import('../common/openclaude-protocol').ReviewComment> {
        try {
            const mutation = gql`
                mutation AddReviewComment($reviewId: ID!, $comment: ReviewCommentInput!) {
                    addReviewComment(reviewId: $reviewId, comment: $comment) {
                        id
                        reviewId
                        filePath
                        line
                        author {
                            id
                            name
                            avatar
                            status
                        }
                        text
                        timestamp
                        resolved
                    }
                }
            `;

            const result = await this.client.request<{ addReviewComment: any }>(mutation, { reviewId, comment });
            return result.addReviewComment;
        } catch (error) {
            console.error('[OpenClaude] Add review comment failed:', error);
            throw new Error(`Failed to add review comment: ${error}`);
        }
    }

    /**
     * Update review status
     */
    async updateReviewStatus(reviewId: string, status: import('../common/openclaude-protocol').ReviewStatus): Promise<void> {
        try {
            const mutation = gql`
                mutation UpdateReviewStatus($reviewId: ID!, $status: ReviewStatus!) {
                    updateReviewStatus(reviewId: $reviewId, status: $status)
                }
            `;

            await this.client.request(mutation, { reviewId, status });
        } catch (error) {
            console.error('[OpenClaude] Update review status failed:', error);
            throw new Error(`Failed to update review status: ${error}`);
        }
    }

    /**
     * Get team dashboard metrics
     */
    async getTeamDashboard(): Promise<import('../common/openclaude-protocol').TeamDashboard> {
        try {
            const query = gql`
                query GetTeamDashboard {
                    teamDashboard {
                        stats {
                            codeReviewsCompleted
                            testsGenerated
                            documentationGenerated
                            chatMessages
                            codeComments
                            collaborationSessions
                            avgReviewTime
                            testCoverageImprovement
                        }
                        recentActivity {
                            id
                            type
                            user {
                                id
                                name
                                avatar
                                status
                                color
                            }
                            description
                            timestamp
                            resourceUri
                            metadata
                        }
                        activeCollaborations
                        pendingReviews
                        teamMembers {
                            user {
                                id
                                name
                                avatar
                                status
                                color
                            }
                            role
                            activityStatus
                            lastActivity
                            contributions {
                                reviews
                                tests
                                documentation
                                comments
                            }
                        }
                        periodStart
                        periodEnd
                    }
                }
            `;

            const result = await this.client.request<{ teamDashboard: any }>(query);
            return result.teamDashboard;
        } catch (error) {
            console.error('[OpenClaude] Get team dashboard failed:', error);
            throw new Error(`Failed to get team dashboard: ${error}`);
        }
    }

    /**
     * Get team activity feed
     */
    async getTeamActivity(limit?: number): Promise<import('../common/openclaude-protocol').TeamActivity[]> {
        try {
            const query = gql`
                query GetTeamActivity($limit: Int) {
                    teamActivity(limit: $limit) {
                        id
                        type
                        user {
                            id
                            name
                            avatar
                            status
                            color
                        }
                        description
                        timestamp
                        resourceUri
                        metadata
                    }
                }
            `;

            const result = await this.client.request<{ teamActivity: any[] }>(query, { limit });
            return result.teamActivity;
        } catch (error) {
            console.error('[OpenClaude] Get team activity failed:', error);
            throw new Error(`Failed to get team activity: ${error}`);
        }
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<OpenClaudeConfig>): void {
        this.config = { ...this.config, ...config };

        // Reinitialize client with new config
        this.client = new GraphQLClient(this.config.backendUrl, {
            headers: {
                'Content-Type': 'application/json',
                ...(this.config.apiToken && {
                    'Authorization': `Bearer ${this.config.apiToken}`
                })
            }
        });

        if (this.config.debug) {
            console.log('[OpenClaude] Configuration updated:', this.config);
        }
    }
}
