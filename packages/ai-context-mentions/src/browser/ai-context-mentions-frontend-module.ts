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
import { bindContributionProvider } from '@theia/core';
import {
    ContextMentionRegistry,
    ContextMentionContribution
} from '../common';
import { ContextMentionRegistryImpl } from '../common/context-mention-registry';

// Providers
import { SelectionContextProvider } from './providers/selection-provider';
import { CodebaseContextProvider } from './providers/codebase-provider';
import { GitContextProvider } from './providers/git-provider';
import { TerminalContextProvider } from './providers/terminal-provider';
import { FolderContextProvider } from './providers/folder-provider';
import { ProblemsContextProvider } from './providers/problems-provider';

// Contribution
import { BuiltInContextProvidersContribution } from './context-mention-contribution';

export default new ContainerModule(bind => {
    // Bind the contribution provider
    bindContributionProvider(bind, ContextMentionContribution);

    // Bind the registry
    bind(ContextMentionRegistryImpl).toSelf().inSingletonScope();
    bind(ContextMentionRegistry).toService(ContextMentionRegistryImpl);

    // Bind individual providers
    bind(SelectionContextProvider).toSelf().inSingletonScope();
    bind(CodebaseContextProvider).toSelf().inSingletonScope();
    bind(GitContextProvider).toSelf().inSingletonScope();
    bind(TerminalContextProvider).toSelf().inSingletonScope();
    bind(FolderContextProvider).toSelf().inSingletonScope();
    bind(ProblemsContextProvider).toSelf().inSingletonScope();

    // Bind the built-in providers contribution
    bind(BuiltInContextProvidersContribution).toSelf().inSingletonScope();
    bind(ContextMentionContribution).toService(BuiltInContextProvidersContribution);
});
