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

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, MenuContribution } from '@theia/core';
import { WidgetFactory, bindViewContribution } from '@theia/core/lib/browser';
import { ProviderConfigService, ModelRouter, CostTracker } from '../common';
import { ProviderConfigServiceImpl } from './provider-config-service-impl';
import { ModelRouterImpl } from './model-router-impl';
import { CostTrackerImpl } from './cost-tracker-impl';
import { ProviderSettingsWidget, PROVIDER_SETTINGS_WIDGET_ID } from './provider-settings-widget';
import { ProviderSettingsContribution } from './provider-settings-contribution';

import '../../src/browser/style/provider-settings.css';

export default new ContainerModule(bind => {
    // Provider Configuration Service
    bind(ProviderConfigServiceImpl).toSelf().inSingletonScope();
    bind(ProviderConfigService).toService(ProviderConfigServiceImpl);

    // Model Router
    bind(ModelRouterImpl).toSelf().inSingletonScope();
    bind(ModelRouter).toService(ModelRouterImpl);

    // Cost Tracker
    bind(CostTrackerImpl).toSelf().inSingletonScope();
    bind(CostTracker).toService(CostTrackerImpl);

    // Provider Settings Widget
    bind(ProviderSettingsWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: PROVIDER_SETTINGS_WIDGET_ID,
        createWidget: () => ctx.container.get(ProviderSettingsWidget)
    })).inSingletonScope();

    // Contributions
    bindViewContribution(bind, ProviderSettingsContribution);
    bind(CommandContribution).toService(ProviderSettingsContribution);
    bind(MenuContribution).toService(ProviderSettingsContribution);
});
