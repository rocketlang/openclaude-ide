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

// Terminal Executor
export {
    TerminalExecutor,
    TerminalExecutorImpl,
    ExecuteOptions,
    ExecutionResult,
    ExecutionProgress,
    ConfirmationRequest
} from './terminal-executor';

// Terminal Safety Service
export {
    TerminalSafetyService,
    TerminalSafetyServiceImpl,
    SafetyMode,
    RiskLevel,
    SafetyCheckResult
} from './terminal-safety-service';

// Terminal Session Manager
export {
    TerminalSessionManager,
    TerminalSessionManagerImpl,
    TerminalSession,
    SessionTurn,
    SessionSummary
} from './terminal-session-manager';

// Terminal Agent
export {
    AiTerminalAgent,
    ExecutionMode,
    TaskResult,
    TaskProgress
} from './ai-terminal-agent';

// Contribution
export { AiTerminalCommandContribution } from './ai-terminal-contribution';
