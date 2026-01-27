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
import {
    CommandContribution,
    MenuContribution
} from '@theia/core/lib/common';
import { KeybindingContribution } from '@theia/core/lib/browser';
import {
    InlineEditService,
    InlineSuggestionProvider,
    GhostTextDecorationService
} from '../common';
import { InlineEditServiceImpl } from './inline-edit-service';
import { AIInlineSuggestionProvider } from './inline-suggestion-provider';
import { GhostTextDecorationServiceImpl } from './ghost-text-decoration-service';
import { InlineEditContribution } from './inline-edit-contribution';

export default new ContainerModule(bind => {
    // Services
    bind(InlineEditServiceImpl).toSelf().inSingletonScope();
    bind(InlineEditService).toService(InlineEditServiceImpl);

    bind(AIInlineSuggestionProvider).toSelf().inSingletonScope();
    bind(InlineSuggestionProvider).toService(AIInlineSuggestionProvider);

    bind(GhostTextDecorationServiceImpl).toSelf().inSingletonScope();
    bind(GhostTextDecorationService).toService(GhostTextDecorationServiceImpl);

    // Register provider with service
    bind('InlineEditInitializer').toDynamicValue(ctx => {
        const service = ctx.container.get<InlineEditService>(InlineEditService);
        const provider = ctx.container.get<InlineSuggestionProvider>(InlineSuggestionProvider);
        service.registerProvider(provider);
        return {};
    }).inSingletonScope();

    // Contributions
    bind(InlineEditContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(InlineEditContribution);
    bind(MenuContribution).toService(InlineEditContribution);
    bind(KeybindingContribution).toService(InlineEditContribution);
});
