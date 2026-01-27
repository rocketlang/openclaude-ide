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
import { FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { MultiEditService } from '../common';
import { MultiEditServiceImpl } from './multi-edit-service-impl';
import { MultiEditWidget, MULTI_EDIT_WIDGET_ID } from './multi-edit-widget';
import { MultiEditContribution } from './multi-edit-contribution';
import '../../src/browser/style/multi-edit.css';

export default new ContainerModule(bind => {
    // Service
    bind(MultiEditServiceImpl).toSelf().inSingletonScope();
    bind(MultiEditService).toService(MultiEditServiceImpl);

    // Widget
    bind(MultiEditWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: MULTI_EDIT_WIDGET_ID,
        createWidget: () => ctx.container.get<MultiEditWidget>(MultiEditWidget)
    })).inSingletonScope();

    // Contribution
    bind(MultiEditContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MultiEditContribution);
    bind(CommandContribution).toService(MultiEditContribution);
    bind(MenuContribution).toService(MultiEditContribution);
    bind(TabBarToolbarContribution).toService(MultiEditContribution);
});
