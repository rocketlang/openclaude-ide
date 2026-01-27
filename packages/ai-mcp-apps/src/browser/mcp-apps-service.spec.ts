// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { MCPAppsServiceImpl } from './mcp-apps-service';
import { MCPApp, AppState } from '../common';

describe('MCPAppsService', () => {
    let service: MCPAppsServiceImpl;

    beforeEach(() => {
        service = new MCPAppsServiceImpl();
    });

    describe('registerApp', () => {
        it('should register a new app', () => {
            const app: MCPApp = {
                id: 'test-app',
                name: 'Test App',
                description: 'A test app',
                version: '1.0.0',
                publisher: 'Test',
                ui: { html: '<div>Test</div>' },
                tools: [],
                permissions: []
            };

            service.registerApp(app);
            const apps = service.getApps();

            expect(apps).to.have.lengthOf(1);
            expect(apps[0].id).to.equal('test-app');
        });

        it('should not register duplicate apps', () => {
            const app: MCPApp = {
                id: 'test-app',
                name: 'Test App',
                description: 'A test app',
                version: '1.0.0',
                publisher: 'Test',
                ui: { html: '<div>Test</div>' },
                tools: [],
                permissions: []
            };

            service.registerApp(app);
            service.registerApp(app);
            const apps = service.getApps();

            expect(apps).to.have.lengthOf(1);
        });
    });

    describe('launchApp', () => {
        it('should create an instance when launching an app', async () => {
            const app: MCPApp = {
                id: 'test-app',
                name: 'Test App',
                description: 'A test app',
                version: '1.0.0',
                publisher: 'Test',
                ui: { html: '<div>Test</div>' },
                tools: [],
                permissions: []
            };

            service.registerApp(app);
            const instance = await service.launchApp('test-app');

            expect(instance).to.exist;
            expect(instance.app.id).to.equal('test-app');
            expect(instance.state).to.equal(AppState.Loading);
        });

        it('should throw when launching non-existent app', async () => {
            try {
                await service.launchApp('non-existent');
                expect.fail('Should have thrown');
            } catch (error) {
                expect((error as Error).message).to.include('not found');
            }
        });
    });

    describe('closeApp', () => {
        it('should remove instance when closing an app', async () => {
            const app: MCPApp = {
                id: 'test-app',
                name: 'Test App',
                description: 'A test app',
                version: '1.0.0',
                publisher: 'Test',
                ui: { html: '<div>Test</div>' },
                tools: [],
                permissions: []
            };

            service.registerApp(app);
            const instance = await service.launchApp('test-app');
            service.closeApp(instance.instanceId);

            const instances = service.getInstances();
            expect(instances).to.have.lengthOf(0);
        });
    });

    describe('getApp', () => {
        it('should return app by id', () => {
            const app: MCPApp = {
                id: 'test-app',
                name: 'Test App',
                description: 'A test app',
                version: '1.0.0',
                publisher: 'Test',
                ui: { html: '<div>Test</div>' },
                tools: [],
                permissions: []
            };

            service.registerApp(app);
            const found = service.getApp('test-app');

            expect(found).to.exist;
            expect(found?.name).to.equal('Test App');
        });

        it('should return undefined for non-existent app', () => {
            const found = service.getApp('non-existent');
            expect(found).to.be.undefined;
        });
    });
});
