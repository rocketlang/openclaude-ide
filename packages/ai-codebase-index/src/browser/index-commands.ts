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

import { Command } from '@theia/core';

export namespace IndexCommands {

    const AI_INDEX_CATEGORY = 'AI: Codebase Index';

    export const SHOW_SEARCH: Command = {
        id: 'ai-codebase-index.show-search',
        label: 'Semantic Search',
        category: AI_INDEX_CATEGORY
    };

    export const INDEX_WORKSPACE: Command = {
        id: 'ai-codebase-index.index-workspace',
        label: 'Index Workspace',
        category: AI_INDEX_CATEGORY
    };

    export const INDEX_CURRENT_FILE: Command = {
        id: 'ai-codebase-index.index-current-file',
        label: 'Index Current File',
        category: AI_INDEX_CATEGORY
    };

    export const CLEAR_INDEX: Command = {
        id: 'ai-codebase-index.clear-index',
        label: 'Clear Index',
        category: AI_INDEX_CATEGORY
    };

    export const SHOW_INDEX_STATS: Command = {
        id: 'ai-codebase-index.show-stats',
        label: 'Show Index Statistics',
        category: AI_INDEX_CATEGORY
    };
}
