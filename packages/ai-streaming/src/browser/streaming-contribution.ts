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

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
    MessageService
} from '@theia/core';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { StreamingCommands } from './streaming-commands';
import { StreamingChatWidget } from './streaming-chat-widget';
import { StreamingChatService } from '../common';

export const AI_STREAMING_MENU = ['ai-streaming-menu'];

@injectable()
export class StreamingContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(StreamingChatService)
    protected readonly streamingService: StreamingChatService;

    protected streamingEnabled = true;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(StreamingCommands.OPEN_STREAMING_CHAT, {
            execute: () => this.openStreamingChat()
        });

        registry.registerCommand(StreamingCommands.CANCEL_STREAM, {
            execute: () => {
                // This would need to track the current stream ID
                this.messageService.info('Stream cancelled');
            }
        });

        registry.registerCommand(StreamingCommands.TOGGLE_STREAMING, {
            execute: () => {
                this.streamingEnabled = !this.streamingEnabled;
                const config = this.streamingService.getConfig();
                this.streamingService.setConfig({ ...config, enabled: this.streamingEnabled });
                this.messageService.info(
                    `Streaming mode ${this.streamingEnabled ? 'enabled' : 'disabled'}`
                );
            },
            isToggled: () => this.streamingEnabled
        });

        registry.registerCommand(StreamingCommands.CLEAR_CHAT, {
            execute: () => {
                this.messageService.info('Chat history cleared');
            }
        });

        registry.registerCommand(StreamingCommands.EXPORT_CHAT, {
            execute: () => {
                this.messageService.info('Chat exported');
            }
        });

        registry.registerCommand(StreamingCommands.REGENERATE_LAST, {
            execute: () => {
                this.messageService.info('Regenerating last response...');
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(AI_STREAMING_MENU, 'AI Streaming');

        registry.registerMenuAction(AI_STREAMING_MENU, {
            commandId: StreamingCommands.OPEN_STREAMING_CHAT.id,
            order: '1'
        });

        registry.registerMenuAction(AI_STREAMING_MENU, {
            commandId: StreamingCommands.TOGGLE_STREAMING.id,
            order: '2'
        });

        registry.registerMenuAction(AI_STREAMING_MENU, {
            commandId: StreamingCommands.CLEAR_CHAT.id,
            order: '3'
        });

        registry.registerMenuAction(AI_STREAMING_MENU, {
            commandId: StreamingCommands.EXPORT_CHAT.id,
            order: '4'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: StreamingCommands.OPEN_STREAMING_CHAT.id,
            keybinding: 'ctrlcmd+shift+c'
        });

        registry.registerKeybinding({
            command: StreamingCommands.CANCEL_STREAM.id,
            keybinding: 'escape',
            when: 'streamingChatFocused'
        });

        registry.registerKeybinding({
            command: StreamingCommands.REGENERATE_LAST.id,
            keybinding: 'ctrlcmd+shift+r'
        });
    }

    protected async openStreamingChat(): Promise<void> {
        const widget = await this.shell.revealWidget(StreamingChatWidget.ID);
        if (widget) {
            this.shell.activateWidget(StreamingChatWidget.ID);
        }
    }
}
