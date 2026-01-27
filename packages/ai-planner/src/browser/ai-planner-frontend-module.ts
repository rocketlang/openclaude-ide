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
import { KeybindingContribution } from '@theia/core/lib/browser';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import {
    PlanGeneratorService,
    PlanExecutorService,
    PlanStorageService
} from '../common';
import { PlanGeneratorServiceImpl } from './plan-generator-service';
import { PlanExecutorServiceImpl } from './plan-executor-service';
import { PlanStorageServiceImpl } from './plan-storage-service';
import { PlanWidget } from './plan-widget';
import { PlannerContribution } from './planner-contribution';

import '../../src/browser/style/planner.css';

export default new ContainerModule(bind => {
    // Plan generator service
    bind(PlanGeneratorServiceImpl).toSelf().inSingletonScope();
    bind(PlanGeneratorService).toService(PlanGeneratorServiceImpl);

    // Plan storage service (must be bound before executor)
    bind(PlanStorageServiceImpl).toSelf().inSingletonScope();
    bind(PlanStorageService).toService(PlanStorageServiceImpl);

    // Plan executor service
    bind(PlanExecutorServiceImpl).toSelf().inSingletonScope();
    bind(PlanExecutorService).toService(PlanExecutorServiceImpl);

    // Plan widget
    bind(PlanWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: PlanWidget.ID,
        createWidget: () => ctx.container.get(PlanWidget)
    })).inSingletonScope();

    // Contributions
    bind(PlannerContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(PlannerContribution);
    bind(MenuContribution).toService(PlannerContribution);
    bind(KeybindingContribution).toService(PlannerContribution);
});
