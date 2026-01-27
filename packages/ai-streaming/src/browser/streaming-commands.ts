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

export namespace StreamingCommands {

    const CATEGORY = 'AI Streaming';

    export const OPEN_STREAMING_CHAT: Command = {
        id: 'ai-streaming.openChat',
        label: 'Open Streaming Chat',
        category: CATEGORY
    };

    export const CANCEL_STREAM: Command = {
        id: 'ai-streaming.cancel',
        label: 'Cancel Current Stream',
        category: CATEGORY
    };

    export const TOGGLE_STREAMING: Command = {
        id: 'ai-streaming.toggle',
        label: 'Toggle Streaming Mode',
        category: CATEGORY
    };

    export const CLEAR_CHAT: Command = {
        id: 'ai-streaming.clearChat',
        label: 'Clear Chat History',
        category: CATEGORY
    };

    export const EXPORT_CHAT: Command = {
        id: 'ai-streaming.exportChat',
        label: 'Export Chat as Markdown',
        category: CATEGORY
    };

    export const REGENERATE_LAST: Command = {
        id: 'ai-streaming.regenerate',
        label: 'Regenerate Last Response',
        category: CATEGORY
    };
}
