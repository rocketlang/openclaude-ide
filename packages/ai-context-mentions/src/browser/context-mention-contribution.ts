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

import { injectable, inject } from '@theia/core/shared/inversify';
import { ContextMentionRegistry, ContextMentionContribution } from '../common';
import { SelectionContextProvider } from './providers/selection-provider';
import { CodebaseContextProvider } from './providers/codebase-provider';
import { GitContextProvider } from './providers/git-provider';
import { TerminalContextProvider } from './providers/terminal-provider';
import { FolderContextProvider } from './providers/folder-provider';
import { ProblemsContextProvider } from './providers/problems-provider';

/**
 * Contribution that registers all built-in context providers
 */
@injectable()
export class BuiltInContextProvidersContribution implements ContextMentionContribution {

    @inject(SelectionContextProvider)
    protected readonly selectionProvider: SelectionContextProvider;

    @inject(CodebaseContextProvider)
    protected readonly codebaseProvider: CodebaseContextProvider;

    @inject(GitContextProvider)
    protected readonly gitProvider: GitContextProvider;

    @inject(TerminalContextProvider)
    protected readonly terminalProvider: TerminalContextProvider;

    @inject(FolderContextProvider)
    protected readonly folderProvider: FolderContextProvider;

    @inject(ProblemsContextProvider)
    protected readonly problemsProvider: ProblemsContextProvider;

    registerContextProviders(registry: ContextMentionRegistry): void {
        registry.registerProvider(this.selectionProvider);
        registry.registerProvider(this.codebaseProvider);
        registry.registerProvider(this.gitProvider);
        registry.registerProvider(this.terminalProvider);
        registry.registerProvider(this.folderProvider);
        registry.registerProvider(this.problemsProvider);
    }
}
