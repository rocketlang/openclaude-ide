// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { Agent } from '@theia/ai-core/lib/common';
import { CommandContribution, MenuContribution } from '@theia/core';
import { KeybindingContribution } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AiTerminalAgent } from './ai-terminal-agent';
import { AiTerminalCommandContribution } from './ai-terminal-contribution';
import { TerminalExecutor, TerminalExecutorImpl } from './terminal-executor';
import { TerminalSafetyService, TerminalSafetyServiceImpl } from './terminal-safety-service';
import { TerminalSessionManager, TerminalSessionManagerImpl } from './terminal-session-manager';

import '../../src/browser/style/ai-terminal.css';

export default new ContainerModule(bind => {
    // Core terminal AI services
    bind(TerminalSafetyServiceImpl).toSelf().inSingletonScope();
    bind(TerminalSafetyService).toService(TerminalSafetyServiceImpl);

    bind(TerminalExecutorImpl).toSelf().inSingletonScope();
    bind(TerminalExecutor).toService(TerminalExecutorImpl);

    bind(TerminalSessionManagerImpl).toSelf().inSingletonScope();
    bind(TerminalSessionManager).toService(TerminalSessionManagerImpl);

    // Terminal AI Agent
    bind(AiTerminalAgent).toSelf().inSingletonScope();
    bind(Agent).toService(AiTerminalAgent);

    // Command contributions
    bind(AiTerminalCommandContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(identifier).toService(AiTerminalCommandContribution);
    }
});
