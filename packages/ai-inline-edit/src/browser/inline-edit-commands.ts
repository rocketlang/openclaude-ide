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

export namespace InlineEditCommands {
    export const TRIGGER_SUGGESTION: Command = {
        id: 'ai-inline-edit.trigger',
        label: 'AI: Trigger Inline Suggestion',
        category: 'AI'
    };

    export const ACCEPT_SUGGESTION: Command = {
        id: 'ai-inline-edit.accept',
        label: 'AI: Accept Inline Suggestion',
        category: 'AI'
    };

    export const ACCEPT_WORD: Command = {
        id: 'ai-inline-edit.acceptWord',
        label: 'AI: Accept Word',
        category: 'AI'
    };

    export const ACCEPT_LINE: Command = {
        id: 'ai-inline-edit.acceptLine',
        label: 'AI: Accept Line',
        category: 'AI'
    };

    export const DISMISS_SUGGESTION: Command = {
        id: 'ai-inline-edit.dismiss',
        label: 'AI: Dismiss Suggestion',
        category: 'AI'
    };

    export const NEXT_SUGGESTION: Command = {
        id: 'ai-inline-edit.next',
        label: 'AI: Next Suggestion',
        category: 'AI'
    };

    export const PREVIOUS_SUGGESTION: Command = {
        id: 'ai-inline-edit.previous',
        label: 'AI: Previous Suggestion',
        category: 'AI'
    };

    export const TOGGLE_INLINE_SUGGESTIONS: Command = {
        id: 'ai-inline-edit.toggle',
        label: 'AI: Toggle Inline Suggestions',
        category: 'AI'
    };
}
