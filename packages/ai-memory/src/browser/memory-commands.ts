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

export namespace MemoryCommands {

    const MEMORY_CATEGORY = 'AI Memory';

    export const SHOW_MEMORY_PANEL: Command = {
        id: 'ai-memory.showPanel',
        label: 'Show AI Memory Panel',
        category: MEMORY_CATEGORY
    };

    export const NEW_SESSION: Command = {
        id: 'ai-memory.newSession',
        label: 'Start New Memory Session',
        category: MEMORY_CATEGORY
    };

    export const EXPORT_MEMORY: Command = {
        id: 'ai-memory.export',
        label: 'Export AI Memory',
        category: MEMORY_CATEGORY
    };

    export const IMPORT_MEMORY: Command = {
        id: 'ai-memory.import',
        label: 'Import AI Memory',
        category: MEMORY_CATEGORY
    };

    export const CLEAR_MEMORY: Command = {
        id: 'ai-memory.clear',
        label: 'Clear All AI Memory',
        category: MEMORY_CATEGORY
    };

    export const LEARN_FROM_FILE: Command = {
        id: 'ai-memory.learnFromFile',
        label: 'Learn from Current File',
        category: MEMORY_CATEGORY
    };

    export const SHOW_MEMORY_STATS: Command = {
        id: 'ai-memory.showStats',
        label: 'Show Memory Statistics',
        category: MEMORY_CATEGORY
    };

    export const TOGGLE_MEMORY_LEARNING: Command = {
        id: 'ai-memory.toggleLearning',
        label: 'Toggle Memory Learning',
        category: MEMORY_CATEGORY
    };
}
