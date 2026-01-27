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
import { bindContributionProvider } from '@theia/core';
import {
    StreamingChatService,
    StreamingProviderAdapter
} from '../common';
import { StreamingChatServiceImpl } from './streaming-chat-service';
import { AnthropicStreamingAdapter } from './anthropic-streaming-adapter';
import { OpenAIStreamingAdapter } from './openai-streaming-adapter';
import { OllamaStreamingAdapter } from './ollama-streaming-adapter';
import { StreamingChatWidget } from './streaming-chat-widget';
import { StreamingContribution } from './streaming-contribution';

import '../../src/browser/style/streaming-chat.css';

export default new ContainerModule(bind => {
    // Bind contribution provider for streaming adapters
    bindContributionProvider(bind, StreamingProviderAdapter);

    // Streaming adapters - Anthropic
    bind(AnthropicStreamingAdapter).toSelf().inSingletonScope();
    bind(StreamingProviderAdapter).toService(AnthropicStreamingAdapter);

    // Streaming adapters - OpenAI
    bind(OpenAIStreamingAdapter).toSelf().inSingletonScope();
    bind(StreamingProviderAdapter).toService(OpenAIStreamingAdapter);

    // Streaming adapters - Ollama (local models)
    bind(OllamaStreamingAdapter).toSelf().inSingletonScope();
    bind(StreamingProviderAdapter).toService(OllamaStreamingAdapter);

    // Streaming chat service
    bind(StreamingChatServiceImpl).toSelf().inSingletonScope();
    bind(StreamingChatService).toService(StreamingChatServiceImpl);

    // Streaming chat widget
    bind(StreamingChatWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: StreamingChatWidget.ID,
        createWidget: () => ctx.container.get(StreamingChatWidget)
    })).inSingletonScope();

    // Contributions
    bind(StreamingContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(StreamingContribution);
    bind(MenuContribution).toService(StreamingContribution);
    bind(KeybindingContribution).toService(StreamingContribution);
});
