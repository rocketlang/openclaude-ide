// *****************************************************************************
// Copyright (C) 2026 ANKR Labs and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import {
    CommandContribution,
    MenuContribution
} from '@theia/core/lib/common';
import { WidgetFactory, KeybindingContribution } from '@theia/core/lib/browser';
import {
    MCPAppsService,
    ConsentService,
    AppRenderer
} from '../common';
import { MCPAppsServiceImpl } from './mcp-apps-service';
import { ConsentServiceImpl } from './consent-service';
import { AppRendererImpl } from './app-renderer';
import { MCPAppsWidget } from './mcp-apps-widget';
import { MCPAppsContribution } from './mcp-apps-contribution';

export default new ContainerModule(bind => {
    // Services
    bind(MCPAppsServiceImpl).toSelf().inSingletonScope();
    bind(MCPAppsService).toService(MCPAppsServiceImpl);

    bind(ConsentServiceImpl).toSelf().inSingletonScope();
    bind(ConsentService).toService(ConsentServiceImpl);

    bind(AppRendererImpl).toSelf().inSingletonScope();
    bind(AppRenderer).toService(AppRendererImpl);

    // Widget
    bind(MCPAppsWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: MCPAppsWidget.ID,
        createWidget: () => ctx.container.get(MCPAppsWidget)
    })).inSingletonScope();

    // Contributions
    bind(MCPAppsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(MCPAppsContribution);
    bind(MenuContribution).toService(MCPAppsContribution);
    bind(KeybindingContribution).toService(MCPAppsContribution);
});
