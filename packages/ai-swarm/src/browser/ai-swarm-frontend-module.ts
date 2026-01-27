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
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { SwarmService, swarmServicePath, SwarmServiceClient } from '../common/swarm-protocol';
import { SwarmFrontendService } from './swarm-frontend-service';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { SwarmCommandContribution, SwarmMenuContribution } from './swarm-contribution';
import { WidgetFactory } from '@theia/core/lib/browser';
import { SwarmViewWidget, SWARM_VIEW_WIDGET_ID } from './swarm-view-widget';

export default new ContainerModule(bind => {
    // SwarmFrontendService - local frontend service
    bind(SwarmFrontendService).toSelf().inSingletonScope();

    // SwarmService - proxy to backend
    bind(SwarmService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const swarmFrontendService = ctx.container.get(SwarmFrontendService);
        return connection.createProxy<SwarmService>(swarmServicePath, swarmFrontendService as SwarmServiceClient);
    }).inSingletonScope();

    // Commands and menus
    bind(SwarmCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SwarmCommandContribution);
    bind(MenuContribution).toService(SwarmMenuContribution);
    bind(SwarmMenuContribution).toSelf().inSingletonScope();

    // Widget factory
    bind(SwarmViewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SWARM_VIEW_WIDGET_ID,
        createWidget: () => ctx.container.get(SwarmViewWidget)
    })).inSingletonScope();
});
