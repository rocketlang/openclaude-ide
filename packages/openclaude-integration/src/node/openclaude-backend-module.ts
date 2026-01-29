// *****************************************************************************
// Copyright (C) 2026 Ankr.in and others.
//
// This program and the accompanying materials are made available under a
// proprietary license. Unauthorized copying or distribution is prohibited.
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { OpenClaudeBackendService, OPENCLAUDE_BACKEND_PATH } from '../common/openclaude-protocol';
import { OpenClaudeBackendClient } from './openclaude-backend-client';
import { SkillLoaderService } from './skill-loader-service';

/**
 * Backend module for OpenClaude integration
 *
 * This module:
 * - Binds the Skill Loader service for discovering SKILL.md files
 * - Binds the OpenClaude backend client implementation
 * - Exposes it via JSON-RPC for frontend access
 */
export default new ContainerModule(bind => {
    // Bind the Skill Loader service (eager startup via BackendApplicationContribution)
    bind(SkillLoaderService).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(SkillLoaderService);

    // Bind the backend service implementation
    bind(OpenClaudeBackendService).to(OpenClaudeBackendClient).inSingletonScope();

    // Expose service to frontend via JSON-RPC
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(OPENCLAUDE_BACKEND_PATH, () =>
            ctx.container.get(OpenClaudeBackendService)
        )
    ).inSingletonScope();
});
