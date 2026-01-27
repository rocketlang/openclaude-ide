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
    CodebaseIndexService,
    VectorStore,
    EmbeddingProvider
} from '../common';
import { IndexingServiceImpl } from './indexing-service';
import { InMemoryVectorStore } from './in-memory-vector-store';
import { OllamaEmbeddingProvider } from './ollama-embedding-provider';
import { SemanticSearchWidget } from './semantic-search-widget';
import { IndexStatusBar } from './index-status-bar';
import { IndexContribution } from './index-contribution';

import '../../src/browser/style/semantic-search.css';

export default new ContainerModule(bind => {
    // Embedding provider
    bind(OllamaEmbeddingProvider).toSelf().inSingletonScope();
    bind(EmbeddingProvider).toService(OllamaEmbeddingProvider);

    // Vector store
    bind(InMemoryVectorStore).toSelf().inSingletonScope();
    bind(VectorStore).toService(InMemoryVectorStore);

    // Indexing service
    bind(IndexingServiceImpl).toSelf().inSingletonScope();
    bind(CodebaseIndexService).toService(IndexingServiceImpl);

    // Semantic search widget
    bind(SemanticSearchWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SemanticSearchWidget.ID,
        createWidget: () => ctx.container.get(SemanticSearchWidget)
    })).inSingletonScope();

    // Status bar
    bind(IndexStatusBar).toSelf().inSingletonScope();

    // Contributions
    bind(IndexContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(IndexContribution);
    bind(MenuContribution).toService(IndexContribution);
    bind(KeybindingContribution).toService(IndexContribution);
});
