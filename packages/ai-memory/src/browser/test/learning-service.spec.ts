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
import { LearningServiceImpl } from '../learning-service';
import { CodePatternType } from '../../common';

describe('LearningService', () => {

    describe('Pattern Detection', () => {

        describe('detectNamingConventions', () => {
            it('should detect camelCase function naming', () => {
                const service = new LearningServiceImpl();
                const code = `
                    function getUserName() { return 'test'; }
                    const calculateTotal = () => 0;
                    let processOrder = function() {};
                `;

                // Access protected method for testing
                const patterns = (service as any).detectNamingConventions(code, 'typescript');

                expect(patterns).to.be.an('array');
                const camelCasePattern = patterns.find(
                    (p: any) => p.pattern === 'camelCase for functions'
                );
                expect(camelCasePattern).to.exist;
            });

            it('should detect PascalCase class naming', () => {
                const service = new LearningServiceImpl();
                const code = `
                    class UserService { }
                    class OrderManager { }
                    class DataRepository { }
                `;

                const patterns = (service as any).detectNamingConventions(code, 'typescript');

                const pascalCasePattern = patterns.find(
                    (p: any) => p.pattern === 'PascalCase for classes'
                );
                expect(pascalCasePattern).to.exist;
            });

            it('should detect interface naming conventions', () => {
                const service = new LearningServiceImpl();
                const codeWithIPrefix = `
                    interface IUserService { }
                    interface IOrderManager { }
                `;

                const patterns1 = (service as any).detectNamingConventions(codeWithIPrefix, 'typescript');
                const iPrefixPattern = patterns1.find(
                    (p: any) => p.pattern === 'I-prefix for interfaces'
                );
                expect(iPrefixPattern).to.exist;

                const codeWithoutIPrefix = `
                    interface UserService { }
                    interface OrderManager { }
                `;

                const patterns2 = (service as any).detectNamingConventions(codeWithoutIPrefix, 'typescript');
                const noPrefixPattern = patterns2.find(
                    (p: any) => p.pattern === 'No prefix for interfaces'
                );
                expect(noPrefixPattern).to.exist;
            });
        });

        describe('detectImportStyle', () => {
            it('should detect grouped imports', () => {
                const service = new LearningServiceImpl();
                const code = `
                    import React from 'react';
                    import { useState } from 'react';
                    import axios from 'axios';
                    import { UserService } from './services/user';
                    import { OrderManager } from '../managers/order';
                `;

                const patterns = (service as any).detectImportStyle(code, 'typescript');

                expect(patterns).to.be.an('array');
            });

            it('should detect preference for named imports', () => {
                const service = new LearningServiceImpl();
                const code = `
                    import { Component, OnInit } from '@angular/core';
                    import { HttpClient } from '@angular/common/http';
                    import { Observable, Subject } from 'rxjs';
                    import { map, filter } from 'rxjs/operators';
                `;

                const patterns = (service as any).detectImportStyle(code, 'typescript');

                const namedImportPattern = patterns.find(
                    (p: any) => p.pattern === 'Prefer named imports'
                );
                expect(namedImportPattern).to.exist;
            });
        });

        describe('detectCommentStyle', () => {
            it('should detect JSDoc style comments', () => {
                const service = new LearningServiceImpl();
                const lines = [
                    '/**',
                    ' * Gets the user by ID',
                    ' * @param id - The user ID',
                    ' * @returns The user object',
                    ' */',
                    'function getUser(id: string) { }',
                    '// This is a single line comment'
                ];

                const patterns = (service as any).detectCommentStyle(lines);

                const jsdocPattern = patterns.find(
                    (p: any) => p.pattern === 'JSDoc style comments'
                );
                expect(jsdocPattern).to.exist;
            });
        });

        describe('detectErrorHandling', () => {
            it('should detect try-catch patterns', () => {
                const service = new LearningServiceImpl();
                const code = `
                    async function fetchData() {
                        try {
                            const response = await fetch('/api/data');
                            return response.json();
                        } catch (error) {
                            console.error(error);
                            throw error;
                        }
                    }
                `;

                const patterns = (service as any).detectErrorHandling(code, 'typescript');

                expect(patterns).to.be.an('array');
                const tryCatchPattern = patterns.find(
                    (p: any) => p.patternType === CodePatternType.ErrorHandling
                );
                expect(tryCatchPattern).to.exist;
            });
        });
    });

    describe('Error Type Extraction', () => {
        it('should extract error type from message', () => {
            const service = new LearningServiceImpl();

            expect((service as any).extractErrorType('TypeError: Cannot read property')).to.equal('TypeError');
            expect((service as any).extractErrorType('ReferenceError: x is not defined')).to.equal('ReferenceError');
            expect((service as any).extractErrorType('SyntaxError: Unexpected token')).to.equal('SyntaxError');
            expect((service as any).extractErrorType('Some random error')).to.equal('UnknownError');
        });
    });

    describe('Error Message Normalization', () => {
        it('should normalize error messages for comparison', () => {
            const service = new LearningServiceImpl();

            const msg1 = 'Error at line 42: Cannot find module';
            const msg2 = 'Error at line 100: Cannot find module';

            const normalized1 = (service as any).normalizeErrorMessage(msg1);
            const normalized2 = (service as any).normalizeErrorMessage(msg2);

            expect(normalized1).to.equal(normalized2);
        });

        it('should remove file paths from error messages', () => {
            const service = new LearningServiceImpl();

            const msg = 'Error in /home/user/project/src/file.ts:42:10';
            const normalized = (service as any).normalizeErrorMessage(msg);

            expect(normalized).to.not.include('/home/user/project/src/');
        });
    });
});
