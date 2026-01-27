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

export namespace PlannerCommands {

    const AI_PLANNER_CATEGORY = 'AI: Planner';

    export const SHOW_PLANNER: Command = {
        id: 'ai-planner.show',
        label: 'Show AI Planner',
        category: AI_PLANNER_CATEGORY
    };

    export const NEW_PLAN: Command = {
        id: 'ai-planner.new-plan',
        label: 'Create New Plan',
        category: AI_PLANNER_CATEGORY
    };

    export const EXECUTE_PLAN: Command = {
        id: 'ai-planner.execute',
        label: 'Execute Current Plan',
        category: AI_PLANNER_CATEGORY
    };

    export const PAUSE_PLAN: Command = {
        id: 'ai-planner.pause',
        label: 'Pause Execution',
        category: AI_PLANNER_CATEGORY
    };

    export const RESUME_PLAN: Command = {
        id: 'ai-planner.resume',
        label: 'Resume Execution',
        category: AI_PLANNER_CATEGORY
    };

    export const CANCEL_PLAN: Command = {
        id: 'ai-planner.cancel',
        label: 'Cancel Execution',
        category: AI_PLANNER_CATEGORY
    };
}
