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
import { ConversationHistoryServiceImpl } from '../conversation-history-service';

describe('ConversationHistoryService', () => {

    describe('Topic Extraction', () => {
        it('should extract code-related keywords', () => {
            const service = new ConversationHistoryServiceImpl();

            const content = 'How do I create a function that returns an interface?';
            const topics = (service as any).extractTopics(content);

            expect(topics).to.include('function');
            expect(topics).to.include('interface');
        });

        it('should extract programming language mentions', () => {
            const service = new ConversationHistoryServiceImpl();

            const content = 'I need help with TypeScript and React components';
            const topics = (service as any).extractTopics(content);

            expect(topics).to.include('typescript');
            expect(topics).to.include('react');
        });

        it('should extract action keywords', () => {
            const service = new ConversationHistoryServiceImpl();

            const content = 'Can you help me fix this bug and refactor the code?';
            const topics = (service as any).extractTopics(content);

            expect(topics).to.include('bug');
            expect(topics).to.include('fix');
            expect(topics).to.include('refactor');
        });

        it('should extract file references', () => {
            const service = new ConversationHistoryServiceImpl();

            const content = 'Please look at src/components/Header.tsx and utils/helpers.js';
            const topics = (service as any).extractTopics(content);

            expect(topics).to.include('src/components/Header.tsx');
            expect(topics).to.include('utils/helpers.js');
        });

        it('should handle test and database keywords', () => {
            const service = new ConversationHistoryServiceImpl();

            const content = 'Write a test for the database query';
            const topics = (service as any).extractTopics(content);

            expect(topics).to.include('test');
            expect(topics).to.include('database');
            expect(topics).to.include('query');
        });
    });

    describe('Importance Calculation', () => {
        it('should give base importance to new sessions', () => {
            const service = new ConversationHistoryServiceImpl();

            const session = {
                sessionId: 'test-session',
                turns: [],
                startTime: Date.now(),
                topics: new Set<string>()
            };

            const importance = (service as any).calculateImportance(session);

            expect(importance).to.be.greaterThanOrEqual(0.5);
        });

        it('should increase importance for sessions with more turns', () => {
            const service = new ConversationHistoryServiceImpl();

            const shortSession = {
                sessionId: 'test-session',
                turns: [{ role: 'user', content: 'Hi', timestamp: Date.now() }],
                startTime: Date.now(),
                topics: new Set<string>()
            };

            const longSession = {
                sessionId: 'test-session',
                turns: Array(20).fill({ role: 'user', content: 'Message', timestamp: Date.now() }),
                startTime: Date.now(),
                topics: new Set<string>()
            };

            const shortImportance = (service as any).calculateImportance(shortSession);
            const longImportance = (service as any).calculateImportance(longSession);

            expect(longImportance).to.be.greaterThan(shortImportance);
        });

        it('should increase importance for sessions with code context', () => {
            const service = new ConversationHistoryServiceImpl();

            const sessionWithCode = {
                sessionId: 'test-session',
                turns: [
                    { role: 'user', content: 'Fix this code', codeContext: 'const x = 1;', timestamp: Date.now() }
                ],
                startTime: Date.now(),
                topics: new Set<string>()
            };

            const sessionWithoutCode = {
                sessionId: 'test-session',
                turns: [
                    { role: 'user', content: 'Hello', timestamp: Date.now() }
                ],
                startTime: Date.now(),
                topics: new Set<string>()
            };

            const codeImportance = (service as any).calculateImportance(sessionWithCode);
            const noCodeImportance = (service as any).calculateImportance(sessionWithoutCode);

            expect(codeImportance).to.be.greaterThan(noCodeImportance);
        });

        it('should increase importance for technical topics', () => {
            const service = new ConversationHistoryServiceImpl();

            const technicalSession = {
                sessionId: 'test-session',
                turns: [{ role: 'user', content: 'Help', timestamp: Date.now() }],
                startTime: Date.now(),
                topics: new Set(['bug', 'fix', 'implement'])
            };

            const casualSession = {
                sessionId: 'test-session',
                turns: [{ role: 'user', content: 'Help', timestamp: Date.now() }],
                startTime: Date.now(),
                topics: new Set(['greeting', 'thanks'])
            };

            const technicalImportance = (service as any).calculateImportance(technicalSession);
            const casualImportance = (service as any).calculateImportance(casualSession);

            expect(technicalImportance).to.be.greaterThan(casualImportance);
        });

        it('should cap importance at 1', () => {
            const service = new ConversationHistoryServiceImpl();

            const maxSession = {
                sessionId: 'test-session',
                turns: Array(100).fill({
                    role: 'user',
                    content: 'Code question',
                    codeContext: 'const x = 1;',
                    fileUri: 'file.ts',
                    timestamp: Date.now()
                }),
                startTime: Date.now(),
                topics: new Set(['bug', 'fix', 'implement', 'test', 'refactor'])
            };

            const importance = (service as any).calculateImportance(maxSession);

            expect(importance).to.be.at.most(1);
        });
    });

    describe('Session Management', () => {
        it('should start a new session with unique ID', () => {
            const service = new ConversationHistoryServiceImpl();

            const sessionId1 = service.startSession();
            const sessionId2 = service.startSession();

            expect(sessionId1).to.be.a('string');
            expect(sessionId2).to.be.a('string');
            expect(sessionId1).to.not.equal(sessionId2);
        });
    });
});
