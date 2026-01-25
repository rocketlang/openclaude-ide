// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

/**
 * GraphQL query and mutation types for OpenClaude backend
 */

/**
 * GraphQL query/mutation result wrapper
 */
export interface GraphQLResult<T> {
    data?: T;
    errors?: GraphQLError[];
}

export interface GraphQLError {
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: Record<string, unknown>;
}

/**
 * Code Review GraphQL types
 */
export interface StartReviewMutationVariables {
    files: string[];
}

export interface StartReviewMutationResult {
    startReview: {
        id: string;
        status: string;
    };
}

export interface GetReviewQueryVariables {
    id: string;
}

export interface GetReviewQueryResult {
    review: {
        id: string;
        status: string;
        issues: Array<{
            file: string;
            line: number;
            column?: number;
            severity: string;
            message: string;
            category?: string;
            suggestedFix?: string;
            ruleId?: string;
        }>;
        summary?: {
            totalIssues: number;
            blockers: number;
            critical: number;
            major: number;
            minor: number;
            info: number;
            filesReviewed: number;
        };
    };
}

/**
 * OpenClaude configuration
 */
export interface OpenClaudeConfig {
    /**
     * Backend GraphQL endpoint URL
     */
    backendUrl: string;

    /**
     * API authentication token (if required)
     */
    apiToken?: string;

    /**
     * Request timeout in milliseconds
     */
    timeout?: number;

    /**
     * Enable debug logging
     */
    debug?: boolean;
}

/**
 * Default OpenClaude configuration
 */
export const DEFAULT_OPENCLAUDE_CONFIG: OpenClaudeConfig = {
    backendUrl: 'http://localhost:4000/graphql',
    timeout: 30000,
    debug: false
};
