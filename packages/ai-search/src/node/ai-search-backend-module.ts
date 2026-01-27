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
import { AISearchService, aiSearchServicePath } from '../common/ai-search-protocol';
import { AISearchServiceImpl } from './ai-search-service-impl';

export default new ContainerModule(bind => {
    bind(AISearchService).to(AISearchServiceImpl).inSingletonScope();
    bind(AISearchServiceImpl).toService(AISearchService);

    bind(ConnectionHandler).toDynamicValue(ctx => {
        const service = ctx.container.get<AISearchService>(AISearchService);
        return new RpcConnectionHandler(aiSearchServicePath, () => service);
    }).inSingletonScope();
});
