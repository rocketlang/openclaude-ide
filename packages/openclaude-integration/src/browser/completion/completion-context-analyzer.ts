// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';

/**
 * Context information for code completion
 */
export interface CompletionContext {
    /** Current line content */
    currentLine: string;
    /** Text before cursor */
    textBeforeCursor: string;
    /** Text after cursor */
    textAfterCursor: string;
    /** Previous lines (up to 5) */
    previousLines: string[];
    /** Next lines (up to 3) */
    nextLines: string[];
    /** Current word being typed */
    currentWord: string;
    /** Whether in string literal */
    inString: boolean;
    /** Whether in comment */
    inComment: boolean;
    /** Detected context type */
    contextType: ContextType;
}

/**
 * Type of completion context
 */
export enum ContextType {
    UNKNOWN = 'unknown',
    IMPORT = 'import',
    CLASS_MEMBER = 'class_member',
    FUNCTION_CALL = 'function_call',
    VARIABLE_DECLARATION = 'variable_declaration',
    OBJECT_PROPERTY = 'object_property',
    TYPE_ANNOTATION = 'type_annotation',
    JSX_TAG = 'jsx_tag',
    COMMENT = 'comment',
    STRING = 'string'
}

/**
 * Analyzes code context for intelligent completions
 */
@injectable()
export class CompletionContextAnalyzer {

    /**
     * Analyze context at a given position
     */
    analyzeContext(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): CompletionContext {
        const lineNumber = position.lineNumber;
        const column = position.column;

        // Get current line
        const currentLine = model.getLineContent(lineNumber);
        const textBeforeCursor = currentLine.substring(0, column - 1);
        const textAfterCursor = currentLine.substring(column - 1);

        // Get surrounding lines
        const previousLines = this.getPreviousLines(model, lineNumber, 5);
        const nextLines = this.getNextLines(model, lineNumber, 3);

        // Get current word
        const wordInfo = model.getWordAtPosition(position);
        const currentWord = wordInfo?.word || '';

        // Detect context type
        const inString = this.isInString(currentLine, column);
        const inComment = this.isInComment(model, position);
        const contextType = this.detectContextType(
            textBeforeCursor,
            textAfterCursor,
            previousLines,
            inString,
            inComment
        );

        return {
            currentLine,
            textBeforeCursor,
            textAfterCursor,
            previousLines,
            nextLines,
            currentWord,
            inString,
            inComment,
            contextType
        };
    }

    /**
     * Get previous lines
     */
    protected getPreviousLines(
        model: monaco.editor.ITextModel,
        lineNumber: number,
        count: number
    ): string[] {
        const lines: string[] = [];
        const start = Math.max(1, lineNumber - count);

        for (let i = start; i < lineNumber; i++) {
            lines.push(model.getLineContent(i));
        }

        return lines;
    }

    /**
     * Get next lines
     */
    protected getNextLines(
        model: monaco.editor.ITextModel,
        lineNumber: number,
        count: number
    ): string[] {
        const lines: string[] = [];
        const end = Math.min(model.getLineCount(), lineNumber + count);

        for (let i = lineNumber + 1; i <= end; i++) {
            lines.push(model.getLineContent(i));
        }

        return lines;
    }

    /**
     * Check if cursor is in a string literal
     */
    protected isInString(line: string, column: number): boolean {
        const beforeCursor = line.substring(0, column - 1);

        // Count quotes before cursor
        const singleQuotes = (beforeCursor.match(/'/g) || []).length;
        const doubleQuotes = (beforeCursor.match(/"/g) || []).length;
        const backticks = (beforeCursor.match(/`/g) || []).length;

        return (singleQuotes % 2 !== 0) || (doubleQuotes % 2 !== 0) || (backticks % 2 !== 0);
    }

    /**
     * Check if cursor is in a comment
     */
    protected isInComment(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): boolean {
        const line = model.getLineContent(position.lineNumber);
        const beforeCursor = line.substring(0, position.column - 1);

        // Single line comment
        if (beforeCursor.includes('//')) {
            return true;
        }

        // Multi-line comment - simplified check
        const fullText = model.getValue();
        const offset = model.getOffsetAt(position);
        const textBefore = fullText.substring(0, offset);

        const openComments = (textBefore.match(/\/\*/g) || []).length;
        const closeComments = (textBefore.match(/\*\//g) || []).length;

        return openComments > closeComments;
    }

    /**
     * Detect the type of context
     */
    protected detectContextType(
        textBefore: string,
        textAfter: string,
        previousLines: string[],
        inString: boolean,
        inComment: boolean
    ): ContextType {
        if (inComment) {
            return ContextType.COMMENT;
        }

        if (inString) {
            return ContextType.STRING;
        }

        const trimmedBefore = textBefore.trim();

        // Import statement
        if (trimmedBefore.startsWith('import') || trimmedBefore.includes('from ')) {
            return ContextType.IMPORT;
        }

        // Type annotation
        if (trimmedBefore.endsWith(': ') || trimmedBefore.match(/:\s*$/)) {
            return ContextType.TYPE_ANNOTATION;
        }

        // Object property
        if (trimmedBefore.endsWith('.')) {
            return ContextType.OBJECT_PROPERTY;
        }

        // Function call
        if (trimmedBefore.endsWith('(') || trimmedBefore.match(/\w+\s*\($/)) {
            return ContextType.FUNCTION_CALL;
        }

        // Variable declaration
        if (trimmedBefore.match(/^(const|let|var)\s+\w*$/)) {
            return ContextType.VARIABLE_DECLARATION;
        }

        // Class member (inside class definition)
        const isInClass = previousLines.some(line =>
            line.trim().match(/^(class|interface|type)\s+\w+/)
        );
        if (isInClass && trimmedBefore.match(/^\s*(public|private|protected)?\s*\w*$/)) {
            return ContextType.CLASS_MEMBER;
        }

        // JSX tag
        if (trimmedBefore.endsWith('<') || trimmedBefore.match(/<\w*$/)) {
            return ContextType.JSX_TAG;
        }

        return ContextType.UNKNOWN;
    }

    /**
     * Should show AI completions for this context
     */
    shouldShowAICompletions(context: CompletionContext): boolean {
        // Don't show in comments or strings (unless specific use case)
        if (context.inComment || context.inString) {
            return false;
        }

        // Show for most context types
        return context.contextType !== ContextType.UNKNOWN;
    }

    /**
     * Get priority for AI completions in this context
     */
    getAIPriority(context: CompletionContext): number {
        switch (context.contextType) {
            case ContextType.FUNCTION_CALL:
            case ContextType.OBJECT_PROPERTY:
                return 1; // Highest priority
            case ContextType.VARIABLE_DECLARATION:
            case ContextType.TYPE_ANNOTATION:
                return 2;
            case ContextType.CLASS_MEMBER:
            case ContextType.IMPORT:
                return 3;
            default:
                return 5; // Lowest priority
        }
    }
}
