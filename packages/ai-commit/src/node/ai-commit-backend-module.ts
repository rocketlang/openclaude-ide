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
import { AICommitService, aiCommitServicePath, AICommitServiceClient } from '../common/ai-commit-protocol';
import { AICommitServiceImpl } from './ai-commit-service-impl';

export default new ContainerModule(bind => {
    bind(AICommitService).to(AICommitServiceImpl).inSingletonScope();
    bind(AICommitServiceImpl).toService(AICommitService);

    bind(ConnectionHandler).toDynamicValue(ctx => {
        const service = ctx.container.get<AICommitService>(AICommitService);
        return new RpcConnectionHandler<AICommitServiceClient>(
            aiCommitServicePath,
            client => {
                // If we need client callbacks, wire them here
                return service;
            }
        );
    }).inSingletonScope();
});
