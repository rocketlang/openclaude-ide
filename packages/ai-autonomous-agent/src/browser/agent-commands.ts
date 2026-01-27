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

export namespace AgentCommands {
    export const OPEN_AGENT: Command = {
        id: 'ai-agent.open',
        label: 'AI: Open Agent Panel',
        category: 'AI'
    };

    export const START_TASK: Command = {
        id: 'ai-agent.startTask',
        label: 'AI: Start Agent Task',
        category: 'AI'
    };

    export const PAUSE_TASK: Command = {
        id: 'ai-agent.pauseTask',
        label: 'AI: Pause Agent Task',
        category: 'AI'
    };

    export const RESUME_TASK: Command = {
        id: 'ai-agent.resumeTask',
        label: 'AI: Resume Agent Task',
        category: 'AI'
    };

    export const CANCEL_TASK: Command = {
        id: 'ai-agent.cancelTask',
        label: 'AI: Cancel Agent Task',
        category: 'AI'
    };

    export const TOGGLE_AUTONOMOUS: Command = {
        id: 'ai-agent.toggleAutonomous',
        label: 'AI: Toggle Autonomous Mode',
        category: 'AI'
    };
}
