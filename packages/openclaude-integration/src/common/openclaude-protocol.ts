// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

/**
 * OpenClaude Backend Protocol
 *
 * Defines the interface for communicating with OpenClaude backend services
 * via GraphQL.
 */

export const OPENCLAUDE_BACKEND_PATH = '/services/openclaude';

export const OpenClaudeBackendService = Symbol('OpenClaudeBackendService');

/**
 * Main service interface for OpenClaude backend communication
 */
export interface OpenClaudeBackendService {
    /**
     * Test backend connection
     */
    ping(): Promise<boolean>;

    /**
     * Get backend service status
     */
    getStatus(): Promise<BackendStatus>;

    /**
     * Start a code review
     * @param files Files to review
     */
    startCodeReview(files: string[]): Promise<CodeReview>;

    /**
     * Get code review by ID
     * @param id Review ID
     */
    getCodeReview(id: string): Promise<CodeReview>;

    /**
     * Generate tests for a file or function
     * @param options Test generation options
     */
    generateTests(options: TestGenerationOptions): Promise<TestGenerationResult>;

    /**
     * Get test generation result by ID
     * @param id Generation ID
     */
    getTestGeneration(id: string): Promise<TestGenerationResult>;

    /**
     * Get AI code completions for a position
     * @param request Completion request
     */
    getCompletions(request: CompletionRequest): Promise<CompletionResult>;

    /**
     * Generate documentation for code
     * @param options Documentation generation options
     */
    generateDocumentation(options: DocumentationOptions): Promise<DocumentationResult>;

    /**
     * Get documentation generation result by ID
     * @param id Generation ID
     */
    getDocumentation(id: string): Promise<DocumentationResult>;

    /**
     * Send a chat message
     * @param sessionId Chat session ID
     * @param message Message to send
     */
    sendChatMessage(sessionId: string, message: string): Promise<ChatMessage>;

    /**
     * Get chat messages for a session
     * @param sessionId Chat session ID
     * @param limit Optional limit on number of messages
     */
    getChatMessages(sessionId: string, limit?: number): Promise<ChatMessage[]>;

    /**
     * Join a chat session
     * @param sessionId Chat session ID
     */
    joinChatSession(sessionId: string): Promise<ChatSession>;

    /**
     * Leave a chat session
     * @param sessionId Chat session ID
     */
    leaveChatSession(sessionId: string): Promise<void>;

    /**
     * Set typing indicator
     * @param sessionId Chat session ID
     * @param isTyping Whether the user is typing
     */
    setTypingIndicator(sessionId: string, isTyping: boolean): Promise<void>;

    /**
     * Add a code comment/annotation
     * @param comment Comment to add
     */
    addCodeComment(comment: CodeComment): Promise<CodeComment>;

    /**
     * Get code comments for a file
     * @param filePath File path
     * @param includeResolved Whether to include resolved comments
     */
    getCodeComments(filePath: string, includeResolved?: boolean): Promise<CodeComment[]>;

    /**
     * Reply to a code comment
     * @param commentId Comment ID
     * @param reply Reply text
     */
    replyToComment(commentId: string, reply: string): Promise<CommentReply>;

    /**
     * Resolve a code comment
     * @param commentId Comment ID
     */
    resolveComment(commentId: string): Promise<void>;

    /**
     * Unresolve a code comment
     * @param commentId Comment ID
     */
    unresolveComment(commentId: string): Promise<void>;

    /**
     * Delete a code comment
     * @param commentId Comment ID
     */
    deleteComment(commentId: string): Promise<void>;

    /**
     * Join a collaboration session for a file
     * @param filePath File path
     */
    joinCollaborationSession(filePath: string): Promise<CollaborationSession>;

    /**
     * Leave a collaboration session
     * @param sessionId Session ID
     */
    leaveCollaborationSession(sessionId: string): Promise<void>;

    /**
     * Update cursor position in collaboration session
     * @param sessionId Session ID
     * @param cursor Cursor position
     */
    updateCursorPosition(sessionId: string, cursor: CursorPosition): Promise<void>;

    /**
     * Update selection in collaboration session
     * @param sessionId Session ID
     * @param selection Selection range
     */
    updateSelection(sessionId: string, selection: SelectionRange): Promise<void>;

    /**
     * Get active collaborators in a session
     * @param sessionId Session ID
     */
    getCollaborators(sessionId: string): Promise<Collaborator[]>;

    /**
     * Send document change for operational transformation
     * @param sessionId Session ID
     * @param change Document change
     */
    sendDocumentChange(sessionId: string, change: DocumentChange): Promise<void>;

    /**
     * Create a code review request
     * @param request Review request
     */
    createReviewRequest(request: ReviewRequest): Promise<CodeReview>;

    /**
     * Get code review workflow by ID
     * @param reviewId Review ID
     */
    getReview(reviewId: string): Promise<CodeReviewWorkflow>;

    /**
     * Get all code review workflows
     * @param filters Optional filters
     */
    getReviews(filters?: ReviewFilters): Promise<CodeReviewWorkflow[]>;

    /**
     * Submit a review
     * @param reviewId Review ID
     * @param decision Review decision
     */
    submitReview(reviewId: string, decision: ReviewDecision): Promise<void>;

    /**
     * Add a review comment
     * @param reviewId Review ID
     * @param comment Review comment
     */
    addReviewComment(reviewId: string, comment: ReviewComment): Promise<ReviewComment>;

    /**
     * Update review status
     * @param reviewId Review ID
     * @param status New status
     */
    updateReviewStatus(reviewId: string, status: ReviewStatus): Promise<void>;

    /**
     * Get team dashboard metrics
     */
    getTeamDashboard(): Promise<TeamDashboard>;

    /**
     * Get team activity feed
     * @param limit Optional limit
     */
    getTeamActivity(limit?: number): Promise<TeamActivity[]>;

    /**
     * Get all loaded skills
     */
    getLoadedSkills(): Promise<SkillInfo[]>;

    /**
     * Get skill context string for AI prompts
     */
    getSkillContext(): Promise<string>;

    /**
     * Reload skills from disk
     */
    reloadSkills(): Promise<number>;
}

/**
 * Loaded skill information (exposed to frontend)
 */
export interface SkillInfo {
    /** Skill name */
    name: string;
    /** Skill description */
    description: string;
    /** Whether project or global scope */
    scope: 'project' | 'global';
    /** Source file path */
    sourcePath: string;
}

/**
 * Backend service status
 */
export interface BackendStatus {
    healthy: boolean;
    services: ServiceStatus[];
    version: string;
}

export interface ServiceStatus {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    responseTime?: number;
}

/**
 * Code review result
 */
export interface CodeReview {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    issues: CodeIssue[];
    summary?: ReviewSummary;
}

/**
 * Individual code issue
 */
export interface CodeIssue {
    file: string;
    line: number;
    column?: number;
    severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
    message: string;
    category?: string;
    suggestedFix?: string;
    ruleId?: string;
}

/**
 * Review summary statistics
 */
export interface ReviewSummary {
    totalIssues: number;
    blockers: number;
    critical: number;
    major: number;
    minor: number;
    info: number;
    filesReviewed: number;
}

/**
 * Test generation options
 */
export interface TestGenerationOptions {
    /** File path to generate tests for */
    filePath: string;
    /** Specific function/class to test (optional) */
    targetSymbol?: string;
    /** Test framework to use */
    framework: TestFramework;
    /** Test type */
    testType: TestType;
    /** Coverage level to achieve */
    coverageLevel: CoverageLevel;
}

/**
 * Test framework
 */
export type TestFramework = 'jest' | 'mocha' | 'vitest' | 'jasmine' | 'ava';

/**
 * Test type
 */
export type TestType = 'unit' | 'integration' | 'e2e' | 'all';

/**
 * Coverage level
 */
export type CoverageLevel = 'basic' | 'standard' | 'comprehensive';

/**
 * Test generation result
 */
export interface TestGenerationResult {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    options: TestGenerationOptions;
    generatedTests?: GeneratedTest[];
    coverage?: CoverageInfo;
    error?: string;
}

/**
 * Generated test
 */
export interface GeneratedTest {
    /** Test name/description */
    name: string;
    /** Test code */
    code: string;
    /** Target file for the test */
    targetFile: string;
    /** Tests this function/class */
    testsSymbol: string;
    /** Test type */
    type: 'unit' | 'integration' | 'e2e';
}

/**
 * Coverage information
 */
export interface CoverageInfo {
    /** Overall coverage percentage */
    overall: number;
    /** Statement coverage */
    statements: number;
    /** Branch coverage */
    branches: number;
    /** Function coverage */
    functions: number;
    /** Lines coverage */
    lines: number;
}

/**
 * Code completion request
 */
export interface CompletionRequest {
    /** File path */
    filePath: string;
    /** File content */
    content: string;
    /** Cursor position (line) */
    line: number;
    /** Cursor position (column) */
    column: number;
    /** Trigger character (if any) */
    triggerCharacter?: string;
    /** Programming language */
    language: string;
}

/**
 * Code completion result
 */
export interface CompletionResult {
    /** Completion items */
    items: CompletionItem[];
    /** Whether this is a complete list */
    isIncomplete: boolean;
}

/**
 * Individual completion item
 */
export interface CompletionItem {
    /** Label to display */
    label: string;
    /** Kind of completion */
    kind: CompletionItemKind;
    /** Detailed description */
    detail?: string;
    /** Documentation */
    documentation?: string;
    /** Text to insert */
    insertText: string;
    /** Sort order */
    sortText?: string;
    /** Filter text */
    filterText?: string;
    /** Whether this is from AI */
    isAI: boolean;
    /** Confidence score (0-100) */
    confidence?: number;
}

/**
 * Completion item kind
 */
export enum CompletionItemKind {
    Text = 1,
    Method = 2,
    Function = 3,
    Constructor = 4,
    Field = 5,
    Variable = 6,
    Class = 7,
    Interface = 8,
    Module = 9,
    Property = 10,
    Unit = 11,
    Value = 12,
    Enum = 13,
    Keyword = 14,
    Snippet = 15,
    Color = 16,
    File = 17,
    Reference = 18,
    Folder = 19,
    EnumMember = 20,
    Constant = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25
}

/**
 * Documentation generation options
 */
export interface DocumentationOptions {
    /** File path */
    filePath: string;
    /** File content */
    content: string;
    /** Specific symbol to document (optional) */
    targetSymbol?: string;
    /** Documentation format */
    format: DocumentationFormat;
    /** Documentation style */
    style: DocumentationStyle;
    /** Include examples */
    includeExamples: boolean;
}

/**
 * Documentation format
 */
export type DocumentationFormat = 'jsdoc' | 'tsdoc' | 'markdown' | 'rst';

/**
 * Documentation style
 */
export type DocumentationStyle = 'brief' | 'detailed' | 'comprehensive';

/**
 * Documentation generation result
 */
export interface DocumentationResult {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    options: DocumentationOptions;
    documentation?: GeneratedDocumentation[];
    error?: string;
}

/**
 * Generated documentation
 */
export interface GeneratedDocumentation {
    /** Symbol name */
    symbolName: string;
    /** Symbol type (function, class, etc.) */
    symbolType: string;
    /** Line number in file */
    line: number;
    /** Generated documentation text */
    documentation: string;
    /** Examples (if requested) */
    examples?: string[];
}

/**
 * Chat message
 */
export interface ChatMessage {
    /** Message ID */
    id: string;
    /** Session ID */
    sessionId: string;
    /** Sender user */
    sender: ChatUser;
    /** Message content */
    content: string;
    /** Message timestamp */
    timestamp: number;
    /** Whether this is from AI */
    isAI?: boolean;
}

/**
 * Chat session
 */
export interface ChatSession {
    /** Session ID */
    id: string;
    /** Session name */
    name: string;
    /** Active users in session */
    users: ChatUser[];
    /** Users currently typing */
    typingUsers: ChatUser[];
    /** Last message timestamp */
    lastMessageTimestamp?: number;
}

/**
 * Chat user
 */
export interface ChatUser {
    /** User ID */
    id: string;
    /** User name */
    name: string;
    /** User avatar URL */
    avatar?: string;
    /** User status */
    status: 'online' | 'away' | 'offline';
    /** User color (for UI) */
    color?: string;
}

/**
 * Code comment/annotation
 */
export interface CodeComment {
    /** Comment ID */
    id: string;
    /** File path */
    filePath: string;
    /** Line number */
    line: number;
    /** Column number (optional) */
    column?: number;
    /** End line number (for range comments) */
    endLine?: number;
    /** End column number (for range comments) */
    endColumn?: number;
    /** Comment author */
    author: ChatUser;
    /** Comment text */
    text: string;
    /** Comment timestamp */
    timestamp: number;
    /** Comment type */
    type: CommentType;
    /** Severity (for issue comments) */
    severity?: 'info' | 'warning' | 'error';
    /** Whether comment is resolved */
    resolved: boolean;
    /** Resolved by user */
    resolvedBy?: ChatUser;
    /** Resolved timestamp */
    resolvedTimestamp?: number;
    /** Replies to this comment */
    replies: CommentReply[];
}

/**
 * Comment type
 */
export type CommentType = 'note' | 'question' | 'issue' | 'suggestion' | 'todo';

/**
 * Comment reply
 */
export interface CommentReply {
    /** Reply ID */
    id: string;
    /** Parent comment ID */
    commentId: string;
    /** Reply author */
    author: ChatUser;
    /** Reply text */
    text: string;
    /** Reply timestamp */
    timestamp: number;
}

/**
 * Collaboration session
 */
export interface CollaborationSession {
    /** Session ID */
    id: string;
    /** File path */
    filePath: string;
    /** Active collaborators */
    collaborators: Collaborator[];
    /** Session start timestamp */
    startedAt: number;
}

/**
 * Collaborator in a session
 */
export interface Collaborator {
    /** User */
    user: ChatUser;
    /** Cursor position */
    cursor: CursorPosition;
    /** Selection range */
    selection?: SelectionRange;
    /** Last activity timestamp */
    lastActivity: number;
    /** Cursor color */
    color: string;
}

/**
 * Cursor position
 */
export interface CursorPosition {
    /** Line number (0-based) */
    line: number;
    /** Column number (0-based) */
    column: number;
}

/**
 * Selection range
 */
export interface SelectionRange {
    /** Start position */
    start: CursorPosition;
    /** End position */
    end: CursorPosition;
}

/**
 * Document change for operational transformation
 */
export interface DocumentChange {
    /** Change ID */
    id: string;
    /** User who made the change */
    userId: string;
    /** Change type */
    type: 'insert' | 'delete' | 'replace';
    /** Start position */
    position: CursorPosition;
    /** End position (for delete/replace) */
    endPosition?: CursorPosition;
    /** Text inserted (for insert/replace) */
    text?: string;
    /** Timestamp */
    timestamp: number;
    /** Vector clock for ordering */
    version: number;
}

/**
 * Review request
 */
export interface ReviewRequest {
    /** Title */
    title: string;
    /** Description */
    description: string;
    /** Files to review */
    files: string[];
    /** Reviewers */
    reviewers: string[];
    /** Priority */
    priority: ReviewPriority;
    /** Due date (optional) */
    dueDate?: number;
}

/**
 * Review priority
 */
export type ReviewPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Review status
 */
export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'changes_requested' | 'rejected';

/**
 * Code review (extends existing CodeReview from line 94)
 */
export interface CodeReviewWorkflow {
    /** Review ID */
    id: string;
    /** Title */
    title: string;
    /** Description */
    description: string;
    /** Author */
    author: ChatUser;
    /** Files under review */
    files: ReviewFile[];
    /** Reviewers */
    reviewers: Reviewer[];
    /** Status */
    status: ReviewStatus;
    /** Priority */
    priority: ReviewPriority;
    /** Created timestamp */
    createdAt: number;
    /** Updated timestamp */
    updatedAt: number;
    /** Due date */
    dueDate?: number;
    /** Review comments */
    comments: ReviewComment[];
    /** Summary statistics */
    summary: ReviewWorkflowSummary;
}

/**
 * Review file
 */
export interface ReviewFile {
    /** File path */
    path: string;
    /** Number of changes */
    changesCount: number;
    /** Lines added */
    linesAdded: number;
    /** Lines removed */
    linesRemoved: number;
    /** Review status for this file */
    status: 'pending' | 'reviewed' | 'approved';
}

/**
 * Reviewer
 */
export interface Reviewer {
    /** User */
    user: ChatUser;
    /** Review decision */
    decision?: ReviewDecision;
    /** Decision timestamp */
    decidedAt?: number;
    /** Review status */
    status: 'pending' | 'reviewing' | 'completed';
}

/**
 * Review decision
 */
export interface ReviewDecision {
    /** Decision type */
    type: 'approve' | 'request_changes' | 'reject';
    /** Comment */
    comment: string;
    /** Timestamp */
    timestamp: number;
}

/**
 * Review comment
 */
export interface ReviewComment {
    /** Comment ID */
    id: string;
    /** Review ID */
    reviewId: string;
    /** File path (optional, for file-specific comments) */
    filePath?: string;
    /** Line number (optional) */
    line?: number;
    /** Author */
    author: ChatUser;
    /** Comment text */
    text: string;
    /** Timestamp */
    timestamp: number;
    /** Is resolved */
    resolved: boolean;
}

/**
 * Review workflow summary
 */
export interface ReviewWorkflowSummary {
    /** Total files */
    totalFiles: number;
    /** Files reviewed */
    filesReviewed: number;
    /** Total reviewers */
    totalReviewers: number;
    /** Approvals */
    approvals: number;
    /** Change requests */
    changeRequests: number;
    /** Rejections */
    rejections: number;
    /** Total comments */
    totalComments: number;
    /** Unresolved comments */
    unresolvedComments: number;
}

/**
 * Review filters
 */
export interface ReviewFilters {
    /** Filter by status */
    status?: ReviewStatus;
    /** Filter by author */
    authorId?: string;
    /** Filter by reviewer */
    reviewerId?: string;
    /** Filter by priority */
    priority?: ReviewPriority;
}

/**
 * Team dashboard metrics
 */
export interface TeamDashboard {
    /** Team statistics */
    stats: TeamStats;
    /** Recent activity */
    recentActivity: TeamActivity[];
    /** Active collaborations */
    activeCollaborations: number;
    /** Pending reviews */
    pendingReviews: number;
    /** Team members */
    teamMembers: TeamMember[];
    /** Period start */
    periodStart: number;
    /** Period end */
    periodEnd: number;
}

/**
 * Team statistics
 */
export interface TeamStats {
    /** Total code reviews completed */
    codeReviewsCompleted: number;
    /** Total tests generated */
    testsGenerated: number;
    /** Total documentation generated */
    documentationGenerated: number;
    /** Total chat messages */
    chatMessages: number;
    /** Total code comments */
    codeComments: number;
    /** Total collaboration sessions */
    collaborationSessions: number;
    /** Average review time (ms) */
    avgReviewTime: number;
    /** Test coverage improvement */
    testCoverageImprovement: number;
}

/**
 * Team activity types
 */
export type TeamActivityType =
    | 'review_started'
    | 'review_completed'
    | 'test_generated'
    | 'documentation_generated'
    | 'chat_session'
    | 'collaboration_session'
    | 'comment_added'
    | 'comment_resolved';

/**
 * Team activity entry
 */
export interface TeamActivity {
    /** Activity ID */
    id: string;
    /** Activity type */
    type: TeamActivityType;
    /** User */
    user: ChatUser;
    /** Description */
    description: string;
    /** Timestamp */
    timestamp: number;
    /** Related resource (optional) */
    resourceUri?: string;
    /** Metadata (optional) */
    metadata?: { [key: string]: any };
}

/**
 * Team member
 */
export interface TeamMember {
    /** User info */
    user: ChatUser;
    /** Role */
    role: 'owner' | 'admin' | 'member' | 'guest';
    /** Activity status */
    activityStatus: 'active' | 'idle' | 'offline';
    /** Last activity timestamp */
    lastActivity: number;
    /** Contributions this period */
    contributions: {
        reviews: number;
        tests: number;
        documentation: number;
        comments: number;
    };
}
