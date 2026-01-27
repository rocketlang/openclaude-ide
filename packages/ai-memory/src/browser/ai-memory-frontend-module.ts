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
import { FrontendApplicationContribution, KeybindingContribution } from '@theia/core/lib/browser';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import {
    MemoryService,
    ConversationHistoryService,
    LearningService,
    ContextRetrievalService
} from '../common';
import { MemoryServiceImpl } from './memory-service-impl';
import { ConversationHistoryServiceImpl } from './conversation-history-service';
import { LearningServiceImpl } from './learning-service';
import { ContextRetrievalServiceImpl } from './context-retrieval-service';
import { MemoryIntegrationService } from './memory-integration';
import { ChatMemoryIntegration } from './chat-memory-integration';
import { MemoryWidget } from './memory-widget';
import { MemoryContribution } from './memory-contribution';
import { MemoryStatusBarContribution } from './memory-status-bar';
import { bindAIMemoryPreferences } from './memory-preferences';

import '../../src/browser/style/memory-widget.css';

export default new ContainerModule(bind => {
    // Memory storage service
    bind(MemoryServiceImpl).toSelf().inSingletonScope();
    bind(MemoryService).toService(MemoryServiceImpl);

    // Conversation history service
    bind(ConversationHistoryServiceImpl).toSelf().inSingletonScope();
    bind(ConversationHistoryService).toService(ConversationHistoryServiceImpl);

    // Learning service
    bind(LearningServiceImpl).toSelf().inSingletonScope();
    bind(LearningService).toService(LearningServiceImpl);

    // Context retrieval service
    bind(ContextRetrievalServiceImpl).toSelf().inSingletonScope();
    bind(ContextRetrievalService).toService(ContextRetrievalServiceImpl);

    // Integration services - unified memory management
    bind(MemoryIntegrationService).toSelf().inSingletonScope();
    bind(ChatMemoryIntegration).toSelf().inSingletonScope();

    // Memory widget
    bind(MemoryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: MemoryWidget.ID,
        createWidget: () => ctx.container.get(MemoryWidget)
    })).inSingletonScope();

    // Command, menu, and keybinding contributions
    bind(MemoryContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(MemoryContribution);
    bind(MenuContribution).toService(MemoryContribution);
    bind(KeybindingContribution).toService(MemoryContribution);

    // Status bar contribution
    bind(MemoryStatusBarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MemoryStatusBarContribution);

    // Preferences
    bindAIMemoryPreferences(bind);
});
