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
import { CommandContribution } from '@theia/core/lib/common/command';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { AIExplainService, aiExplainServicePath } from '../common/ai-explain-protocol';
import { AIExplainHoverProvider } from './ai-explain-hover-provider';
import { AIExplainContribution } from './ai-explain-contribution';

export default new ContainerModule(bind => {
    // Bind the backend service proxy
    bind(AIExplainService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<AIExplainService>(aiExplainServicePath);
    }).inSingletonScope();

    // Bind the hover provider
    bind(AIExplainHoverProvider).toSelf().inSingletonScope();

    // Bind the contribution
    bind(AIExplainContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AIExplainContribution);
    bind(MenuContribution).toService(AIExplainContribution);
    bind(KeybindingContribution).toService(AIExplainContribution);
});
