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
import { AIRefactorService, aiRefactorServicePath } from '../common/ai-refactor-protocol';
import { AIRefactorServiceImpl } from './ai-refactor-service-impl';

export default new ContainerModule(bind => {
    bind(AIRefactorServiceImpl).toSelf().inSingletonScope();
    bind(AIRefactorService).toService(AIRefactorServiceImpl);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(aiRefactorServicePath, () =>
            ctx.container.get<AIRefactorService>(AIRefactorService)
        )
    ).inSingletonScope();
});
