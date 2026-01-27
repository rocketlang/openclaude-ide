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
import { CommandContribution, MenuContribution } from '@theia/core';
import { KeybindingContribution } from '@theia/core/lib/browser';
import {
    SymbolAnalysisService,
    SemanticContextService,
    AICodeActionsService
} from '../common';
import { SymbolAnalysisServiceImpl } from './symbol-analysis-service';
import { SemanticContextServiceImpl } from './semantic-context-service';
import { AICodeActionsServiceImpl } from './ai-code-actions-service';
import { CodeIntelligenceContribution } from './code-intelligence-contribution';

export default new ContainerModule(bind => {
    // Services
    bind(SymbolAnalysisServiceImpl).toSelf().inSingletonScope();
    bind(SymbolAnalysisService).toService(SymbolAnalysisServiceImpl);

    bind(SemanticContextServiceImpl).toSelf().inSingletonScope();
    bind(SemanticContextService).toService(SemanticContextServiceImpl);

    bind(AICodeActionsServiceImpl).toSelf().inSingletonScope();
    bind(AICodeActionsService).toService(AICodeActionsServiceImpl);

    // Contribution
    bind(CodeIntelligenceContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(CodeIntelligenceContribution);
    bind(MenuContribution).toService(CodeIntelligenceContribution);
    bind(KeybindingContribution).toService(CodeIntelligenceContribution);
});
