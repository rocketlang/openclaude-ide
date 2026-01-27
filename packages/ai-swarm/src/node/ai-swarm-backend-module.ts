// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { SwarmService, swarmServicePath, SwarmServiceClient } from '../common/swarm-protocol';
import { SwarmSessionManager, SwarmSessionManagerImpl } from './swarm-session-manager';
import { TaskBoardService, TaskBoardServiceImpl } from './task-board-service';
import { SubAgentManager, SubAgentManagerImpl } from './sub-agent-manager';
import { MailboxService, MailboxServiceImpl } from './mailbox-service';
import { SwarmServiceImpl } from './swarm-service-impl';
import { LeadAgentOrchestrator, LeadAgentOrchestratorImpl } from './lead-agent-orchestrator';
import { AgentTaskExecutor, AgentTaskExecutorImpl } from './agent-task-executor';
import { SwarmToolProvider, SwarmToolProviderImpl } from './swarm-tool-provider';
import { GitWorktreeService, GitWorktreeServiceImpl } from './git-worktree-service';
import { CostTrackingService, CostTrackingServiceImpl } from './cost-tracking-service';
import { SessionPersistenceService, SessionPersistenceServiceImpl } from './session-persistence-service';
import { AIProxyIntegration, AIProxyIntegrationImpl } from './ai-proxy-integration';
import { AIProxyKeyManager, AIProxyKeyManagerImpl } from './ai-proxy-key-manager';

export default new ContainerModule(bind => {
    // Core session manager - singleton
    bind(SwarmSessionManager).to(SwarmSessionManagerImpl).inSingletonScope();
    bind(SwarmSessionManagerImpl).toService(SwarmSessionManager);

    // Task board service - singleton
    bind(TaskBoardService).to(TaskBoardServiceImpl).inSingletonScope();
    bind(TaskBoardServiceImpl).toService(TaskBoardService);

    // Sub-agent manager - singleton
    bind(SubAgentManager).to(SubAgentManagerImpl).inSingletonScope();
    bind(SubAgentManagerImpl).toService(SubAgentManager);

    // Mailbox service - singleton
    bind(MailboxService).to(MailboxServiceImpl).inSingletonScope();
    bind(MailboxServiceImpl).toService(MailboxService);

    // Lead agent orchestrator - singleton
    bind(LeadAgentOrchestrator).to(LeadAgentOrchestratorImpl).inSingletonScope();
    bind(LeadAgentOrchestratorImpl).toService(LeadAgentOrchestrator);

    // Agent task executor - singleton
    bind(AgentTaskExecutor).to(AgentTaskExecutorImpl).inSingletonScope();
    bind(AgentTaskExecutorImpl).toService(AgentTaskExecutor);

    // Tool provider - singleton
    bind(SwarmToolProvider).to(SwarmToolProviderImpl).inSingletonScope();
    bind(SwarmToolProviderImpl).toService(SwarmToolProvider);

    // Git worktree service - singleton
    bind(GitWorktreeService).to(GitWorktreeServiceImpl).inSingletonScope();
    bind(GitWorktreeServiceImpl).toService(GitWorktreeService);

    // Cost tracking service - singleton
    bind(CostTrackingService).to(CostTrackingServiceImpl).inSingletonScope();
    bind(CostTrackingServiceImpl).toService(CostTrackingService);

    // Session persistence service - singleton
    bind(SessionPersistenceService).to(SessionPersistenceServiceImpl).inSingletonScope();
    bind(SessionPersistenceServiceImpl).toService(SessionPersistenceService);

    // AI Proxy integration - singleton
    bind(AIProxyIntegration).to(AIProxyIntegrationImpl).inSingletonScope();
    bind(AIProxyIntegrationImpl).toService(AIProxyIntegration);

    // AI Proxy key manager - singleton
    bind(AIProxyKeyManager).to(AIProxyKeyManagerImpl).inSingletonScope();
    bind(AIProxyKeyManagerImpl).toService(AIProxyKeyManager);

    // Main swarm service - singleton
    bind(SwarmService).to(SwarmServiceImpl).inSingletonScope();
    bind(SwarmServiceImpl).toService(SwarmService);

    // RPC connection for frontend-backend communication
    bind(ConnectionHandler).toDynamicValue(ctx => {
        const swarmService = ctx.container.get<SwarmService>(SwarmService);
        return new RpcConnectionHandler<SwarmServiceClient>(
            swarmServicePath,
            client => {
                if (swarmService.setClient) {
                    swarmService.setClient(client);
                }
                return swarmService;
            }
        );
    }).inSingletonScope();
});
