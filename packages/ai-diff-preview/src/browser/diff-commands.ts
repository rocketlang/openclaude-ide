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

export namespace DiffCommands {

    const AI_DIFF_CATEGORY = 'AI: Diff Preview';

    export const SHOW_DIFF_PREVIEW: Command = {
        id: 'ai-diff-preview.show',
        label: 'Show AI Changes',
        category: AI_DIFF_CATEGORY
    };

    export const ACCEPT_ALL_CHANGES: Command = {
        id: 'ai-diff-preview.accept-all',
        label: 'Accept All AI Changes',
        category: AI_DIFF_CATEGORY
    };

    export const REJECT_ALL_CHANGES: Command = {
        id: 'ai-diff-preview.reject-all',
        label: 'Reject All AI Changes',
        category: AI_DIFF_CATEGORY
    };

    export const APPLY_CHANGES: Command = {
        id: 'ai-diff-preview.apply',
        label: 'Apply AI Changes',
        category: AI_DIFF_CATEGORY
    };

    export const CLEAR_ALL_CHANGES: Command = {
        id: 'ai-diff-preview.clear-all',
        label: 'Clear All AI Changes',
        category: AI_DIFF_CATEGORY
    };

    export const NEXT_HUNK: Command = {
        id: 'ai-diff-preview.next-hunk',
        label: 'Go to Next Change',
        category: AI_DIFF_CATEGORY
    };

    export const PREVIOUS_HUNK: Command = {
        id: 'ai-diff-preview.previous-hunk',
        label: 'Go to Previous Change',
        category: AI_DIFF_CATEGORY
    };

    export const ACCEPT_HUNK: Command = {
        id: 'ai-diff-preview.accept-hunk',
        label: 'Accept Current Change',
        category: AI_DIFF_CATEGORY
    };

    export const REJECT_HUNK: Command = {
        id: 'ai-diff-preview.reject-hunk',
        label: 'Reject Current Change',
        category: AI_DIFF_CATEGORY
    };
}
