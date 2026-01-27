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
    DiffComputationService,
    ChangeTrackerService
} from '../common';
import { DiffComputationServiceImpl } from './diff-computation-service';
import { ChangeTrackerServiceImpl } from './change-tracker-service';
import { DiffPreviewWidget } from './diff-preview-widget';
import { PendingChangesStatusBar } from './pending-changes-status-bar';
import { DiffContribution } from './diff-contribution';

import '../../src/browser/style/diff-preview.css';

export default new ContainerModule(bind => {
    // Diff computation service
    bind(DiffComputationServiceImpl).toSelf().inSingletonScope();
    bind(DiffComputationService).toService(DiffComputationServiceImpl);

    // Change tracker service
    bind(ChangeTrackerServiceImpl).toSelf().inSingletonScope();
    bind(ChangeTrackerService).toService(ChangeTrackerServiceImpl);

    // Diff preview widget
    bind(DiffPreviewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: DiffPreviewWidget.ID,
        createWidget: () => ctx.container.get(DiffPreviewWidget)
    })).inSingletonScope();

    // Status bar
    bind(PendingChangesStatusBar).toSelf().inSingletonScope();

    // Contributions
    bind(DiffContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(DiffContribution);
    bind(MenuContribution).toService(DiffContribution);
    bind(KeybindingContribution).toService(DiffContribution);
});
