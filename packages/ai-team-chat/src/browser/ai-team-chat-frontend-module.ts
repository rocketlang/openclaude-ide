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
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { KeybindingContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { AITeamChatService, aiTeamChatServicePath } from '../common/ai-team-chat-protocol';
import { AITeamChatContribution } from './ai-team-chat-contribution';

export default new ContainerModule(bind => {
    bind(AITeamChatContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AITeamChatContribution);
    bind(MenuContribution).toService(AITeamChatContribution);
    bind(KeybindingContribution).toService(AITeamChatContribution);

    bind(AITeamChatService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<AITeamChatService>(aiTeamChatServicePath);
    }).inSingletonScope();
});
