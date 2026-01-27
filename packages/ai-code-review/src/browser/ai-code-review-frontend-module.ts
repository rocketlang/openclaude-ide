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
import { AICodeReviewService, aiCodeReviewServicePath } from '../common/ai-code-review-protocol';
import { AICodeReviewContribution } from './ai-code-review-contribution';

export default new ContainerModule(bind => {
    // Bind the backend service proxy
    bind(AICodeReviewService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<AICodeReviewService>(aiCodeReviewServicePath);
    }).inSingletonScope();

    // Bind the contribution
    bind(AICodeReviewContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AICodeReviewContribution);
    bind(MenuContribution).toService(AICodeReviewContribution);
    bind(KeybindingContribution).toService(AICodeReviewContribution);
});
