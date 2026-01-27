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
    AIDebuggingService,
    AIProfilerService
} from '../common';
import { AIDebuggingServiceImpl } from './ai-debugging-service';
import { AIProfilerServiceImpl } from './ai-profiler-service';
import { AIDebuggingWidget } from './ai-debugging-widget';
import { AIDebuggingContribution } from './ai-debugging-contribution';

export default new ContainerModule(bind => {
    // Services
    bind(AIDebuggingServiceImpl).toSelf().inSingletonScope();
    bind(AIDebuggingService).toService(AIDebuggingServiceImpl);

    bind(AIProfilerServiceImpl).toSelf().inSingletonScope();
    bind(AIProfilerService).toService(AIProfilerServiceImpl);

    // Widget
    bind(AIDebuggingWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: AIDebuggingWidget.ID,
        createWidget: () => ctx.container.get(AIDebuggingWidget)
    })).inSingletonScope();

    // Contributions
    bind(AIDebuggingContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AIDebuggingContribution);
    bind(MenuContribution).toService(AIDebuggingContribution);
    bind(KeybindingContribution).toService(AIDebuggingContribution);
});
