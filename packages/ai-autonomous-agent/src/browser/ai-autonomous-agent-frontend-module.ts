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
import {
    CommandContribution,
    MenuContribution
} from '@theia/core/lib/common';
import { KeybindingContribution } from '@theia/core/lib/browser';
import { WidgetFactory } from '@theia/core/lib/browser';
import { AutonomousAgentService } from '../common';
import { AutonomousAgentServiceImpl } from './autonomous-agent-service';
import { AgentWidget } from './agent-widget';
import { AgentContribution } from './agent-contribution';
import '../../src/browser/style/agent.css';

export default new ContainerModule(bind => {
    // Services
    bind(AutonomousAgentServiceImpl).toSelf().inSingletonScope();
    bind(AutonomousAgentService).toService(AutonomousAgentServiceImpl);

    // Widget
    bind(AgentWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: AgentWidget.ID,
        createWidget: () => ctx.container.get(AgentWidget)
    })).inSingletonScope();

    // Contributions
    bind(AgentContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AgentContribution);
    bind(MenuContribution).toService(AgentContribution);
    bind(KeybindingContribution).toService(AgentContribution);
});
