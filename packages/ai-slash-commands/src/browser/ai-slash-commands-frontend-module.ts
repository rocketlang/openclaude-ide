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
import { CommandContribution, MenuContribution, bindContributionProvider } from '@theia/core';
import { KeybindingContribution } from '@theia/core/lib/browser';
import {
    SlashCommandRegistry,
    SlashCommandContribution
} from '../common';
import { SlashCommandRegistryImpl } from '../common/slash-command-registry';
import {
    SlashCommandParser,
    SlashCommandParserImpl,
    SlashCommandCompletionProvider,
    SlashCommandCompletionProviderImpl
} from './slash-command-parser';
import { BuiltInSlashCommandsContribution } from './built-in-commands';
import { SlashCommandContribution as SlashCommandUiContribution } from './slash-command-contribution';

export default new ContainerModule(bind => {
    // Bind the contribution provider for slash commands
    bindContributionProvider(bind, SlashCommandContribution);

    // Bind the slash command registry
    bind(SlashCommandRegistryImpl).toSelf().inSingletonScope();
    bind(SlashCommandRegistry).toService(SlashCommandRegistryImpl);

    // Bind the slash command parser
    bind(SlashCommandParserImpl).toSelf().inSingletonScope();
    bind(SlashCommandParser).toService(SlashCommandParserImpl);

    // Bind the completion provider
    bind(SlashCommandCompletionProviderImpl).toSelf().inSingletonScope();
    bind(SlashCommandCompletionProvider).toService(SlashCommandCompletionProviderImpl);

    // Register built-in slash commands
    bind(BuiltInSlashCommandsContribution).toSelf().inSingletonScope();
    bind(SlashCommandContribution).toService(BuiltInSlashCommandsContribution);

    // Register UI contributions
    bind(SlashCommandUiContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SlashCommandUiContribution);
    bind(MenuContribution).toService(SlashCommandUiContribution);
    bind(KeybindingContribution).toService(SlashCommandUiContribution);
});
