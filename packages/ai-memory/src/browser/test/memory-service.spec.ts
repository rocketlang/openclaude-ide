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

import { expect } from 'chai';
import { MemoryEntryType, MemoryEntry, CodePatternMemory, CodePatternType } from '../../common';

describe('Memory Types', () => {

    describe('MemoryEntryType', () => {
        it('should have all expected entry types', () => {
            expect(MemoryEntryType.Conversation).to.equal('conversation');
            expect(MemoryEntryType.CodePattern).to.equal('codePattern');
            expect(MemoryEntryType.UserPreference).to.equal('userPreference');
            expect(MemoryEntryType.ProjectContext).to.equal('projectContext');
            expect(MemoryEntryType.LearnedBehavior).to.equal('learnedBehavior');
            expect(MemoryEntryType.ErrorSolution).to.equal('errorSolution');
            expect(MemoryEntryType.CodeSnippet).to.equal('codeSnippet');
        });
    });

    describe('CodePatternType', () => {
        it('should have all expected pattern types', () => {
            expect(CodePatternType.NamingConvention).to.equal('namingConvention');
            expect(CodePatternType.CodeStyle).to.equal('codeStyle');
            expect(CodePatternType.ArchitecturePattern).to.equal('architecturePattern');
            expect(CodePatternType.ErrorHandling).to.equal('errorHandling');
            expect(CodePatternType.TestingPattern).to.equal('testingPattern');
            expect(CodePatternType.ImportStyle).to.equal('importStyle');
            expect(CodePatternType.CommentStyle).to.equal('commentStyle');
        });
    });

    describe('MemoryEntry structure', () => {
        it('should create a valid memory entry', () => {
            const entry: MemoryEntry = {
                id: 'test-id',
                type: MemoryEntryType.CodePattern,
                timestamp: Date.now(),
                importance: 0.8,
                accessCount: 5,
                lastAccessed: Date.now(),
                tags: ['typescript', 'naming']
            };

            expect(entry.id).to.equal('test-id');
            expect(entry.type).to.equal(MemoryEntryType.CodePattern);
            expect(entry.importance).to.be.within(0, 1);
            expect(entry.accessCount).to.equal(5);
            expect(entry.tags).to.have.length(2);
        });

        it('should create a valid CodePatternMemory', () => {
            const pattern: CodePatternMemory = {
                id: 'pattern-1',
                type: MemoryEntryType.CodePattern,
                timestamp: Date.now(),
                importance: 0.7,
                accessCount: 3,
                lastAccessed: Date.now(),
                language: 'typescript',
                patternType: CodePatternType.NamingConvention,
                pattern: 'camelCase for functions',
                frequency: 10,
                examples: ['function getUserName', 'function calculateTotal']
            };

            expect(pattern.language).to.equal('typescript');
            expect(pattern.patternType).to.equal(CodePatternType.NamingConvention);
            expect(pattern.frequency).to.equal(10);
            expect(pattern.examples).to.have.length(2);
        });
    });
});

describe('Memory Query Options', () => {
    it('should support filtering by types', () => {
        const options = {
            types: [MemoryEntryType.Conversation, MemoryEntryType.CodePattern],
            limit: 10
        };

        expect(options.types).to.include(MemoryEntryType.Conversation);
        expect(options.types).to.include(MemoryEntryType.CodePattern);
        expect(options.limit).to.equal(10);
    });

    it('should support filtering by importance', () => {
        const options = {
            minImportance: 0.5,
            projectId: 'project-123'
        };

        expect(options.minImportance).to.equal(0.5);
        expect(options.projectId).to.equal('project-123');
    });
});
