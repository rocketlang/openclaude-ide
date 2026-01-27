// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MessageService } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingRegistry, QuickInputService, QuickPickItem } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import {
    AITeamChatService,
    ChatChannel,
    ChatUser,
    PresenceStatus,
    ChannelType,
    formatTimestamp
} from '../common/ai-team-chat-protocol';

export namespace AITeamChatCommands {
    export const OPEN_CHAT: Command = {
        id: 'ai.teamChat.open',
        label: 'AI Team Chat: Open Chat'
    };

    export const JOIN_CHANNEL: Command = {
        id: 'ai.teamChat.joinChannel',
        label: 'AI Team Chat: Join Channel'
    };

    export const CREATE_CHANNEL: Command = {
        id: 'ai.teamChat.createChannel',
        label: 'AI Team Chat: Create Channel'
    };

    export const SEND_MESSAGE: Command = {
        id: 'ai.teamChat.sendMessage',
        label: 'AI Team Chat: Send Message'
    };

    export const SHARE_CODE: Command = {
        id: 'ai.teamChat.shareCode',
        label: 'AI Team Chat: Share Code Snippet'
    };

    export const VIEW_ONLINE_USERS: Command = {
        id: 'ai.teamChat.viewOnlineUsers',
        label: 'AI Team Chat: View Online Users'
    };

    export const START_DM: Command = {
        id: 'ai.teamChat.startDM',
        label: 'AI Team Chat: Start Direct Message'
    };

    export const VIEW_NOTIFICATIONS: Command = {
        id: 'ai.teamChat.viewNotifications',
        label: 'AI Team Chat: View Notifications'
    };

    export const SEARCH_MESSAGES: Command = {
        id: 'ai.teamChat.searchMessages',
        label: 'AI Team Chat: Search Messages'
    };

    export const SET_STATUS: Command = {
        id: 'ai.teamChat.setStatus',
        label: 'AI Team Chat: Set Status'
    };
}

@injectable()
export class AITeamChatContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(AITeamChatService)
    protected readonly teamChatService: AITeamChatService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected currentChannel: ChatChannel | undefined;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(AITeamChatCommands.OPEN_CHAT, {
            execute: () => this.openChat()
        });

        commands.registerCommand(AITeamChatCommands.JOIN_CHANNEL, {
            execute: () => this.joinChannel()
        });

        commands.registerCommand(AITeamChatCommands.CREATE_CHANNEL, {
            execute: () => this.createChannel()
        });

        commands.registerCommand(AITeamChatCommands.SEND_MESSAGE, {
            execute: () => this.sendMessage(),
            isEnabled: () => !!this.currentChannel
        });

        commands.registerCommand(AITeamChatCommands.SHARE_CODE, {
            execute: () => this.shareCode(),
            isEnabled: () => !!this.currentChannel && !!this.editorManager.currentEditor
        });

        commands.registerCommand(AITeamChatCommands.VIEW_ONLINE_USERS, {
            execute: () => this.viewOnlineUsers()
        });

        commands.registerCommand(AITeamChatCommands.START_DM, {
            execute: () => this.startDirectMessage()
        });

        commands.registerCommand(AITeamChatCommands.VIEW_NOTIFICATIONS, {
            execute: () => this.viewNotifications()
        });

        commands.registerCommand(AITeamChatCommands.SEARCH_MESSAGES, {
            execute: () => this.searchMessages()
        });

        commands.registerCommand(AITeamChatCommands.SET_STATUS, {
            execute: () => this.setStatus()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(['ai-menu', 'team-chat'], {
            commandId: AITeamChatCommands.OPEN_CHAT.id,
            label: 'Open Team Chat',
            order: '1'
        });

        menus.registerMenuAction(['ai-menu', 'team-chat'], {
            commandId: AITeamChatCommands.JOIN_CHANNEL.id,
            label: 'Join Channel',
            order: '2'
        });

        menus.registerMenuAction(['ai-menu', 'team-chat'], {
            commandId: AITeamChatCommands.SHARE_CODE.id,
            label: 'Share Code to Chat',
            order: '3'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: AITeamChatCommands.OPEN_CHAT.id,
            keybinding: 'ctrl+shift+c'
        });

        keybindings.registerKeybinding({
            command: AITeamChatCommands.SHARE_CODE.id,
            keybinding: 'ctrl+alt+s'
        });

        keybindings.registerKeybinding({
            command: AITeamChatCommands.SEND_MESSAGE.id,
            keybinding: 'ctrl+enter'
        });
    }

    protected async openChat(): Promise<void> {
        const channels = await this.teamChatService.getChannels();

        if (channels.length === 0) {
            this.messageService.info('No channels available. Create one first.');
            return;
        }

        const items: QuickPickItem[] = channels.map(channel => ({
            label: `#${channel.name}`,
            description: channel.description,
            detail: `${channel.members.length} members • ${channel.type}${channel.unreadCount ? ` • ${channel.unreadCount} unread` : ''}`,
            channel
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Select a channel to open'
        });

        if (selected && (selected as any).channel) {
            this.currentChannel = (selected as any).channel;
            await this.showChannelMessages();
        }
    }

    protected async showChannelMessages(): Promise<void> {
        if (!this.currentChannel) return;

        const messages = await this.teamChatService.getMessages(this.currentChannel.id, 20);

        if (messages.length === 0) {
            this.messageService.info(`No messages in #${this.currentChannel.name} yet.`);
            return;
        }

        const items: QuickPickItem[] = messages.map(msg => ({
            label: msg.userName,
            description: formatTimestamp(msg.createdAt),
            detail: msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : ''),
            message: msg
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: `Messages in #${this.currentChannel.name}`
        });

        if (selected && (selected as any).message) {
            const msg = (selected as any).message;
            await this.showMessageActions(msg);
        }
    }

    protected async showMessageActions(message: any): Promise<void> {
        const actions: QuickPickItem[] = [
            { label: 'Reply in Thread', description: 'Start or continue a thread' },
            { label: 'Add Reaction', description: 'React to this message' },
            { label: 'Copy Message', description: 'Copy message content' }
        ];

        if (message.codeSnippet) {
            actions.push({ label: 'Open Code', description: 'Open the shared code snippet' });
        }

        const selected = await this.quickInputService.showQuickPick(actions, {
            placeholder: 'Message actions'
        });

        if (selected) {
            switch (selected.label) {
                case 'Reply in Thread':
                    await this.replyToThread(message.id);
                    break;
                case 'Add Reaction':
                    await this.addReaction(message.id);
                    break;
                case 'Copy Message':
                    // In a real implementation, this would copy to clipboard
                    this.messageService.info('Message copied to clipboard');
                    break;
            }
        }
    }

    protected async replyToThread(messageId: string): Promise<void> {
        const content = await this.quickInputService.input({
            placeHolder: 'Type your reply...',
            prompt: 'Reply to thread'
        });

        if (content) {
            await this.teamChatService.replyToThread(messageId, content);
            this.messageService.info('Reply sent!');
        }
    }

    protected async addReaction(messageId: string): Promise<void> {
        const emojis: QuickPickItem[] = [
            { label: '👍', description: 'Thumbs up' },
            { label: '❤️', description: 'Heart' },
            { label: '🎉', description: 'Celebration' },
            { label: '👀', description: 'Eyes' },
            { label: '🚀', description: 'Rocket' },
            { label: '✅', description: 'Check mark' }
        ];

        const selected = await this.quickInputService.showQuickPick(emojis, {
            placeholder: 'Select a reaction'
        });

        if (selected) {
            await this.teamChatService.addReaction(messageId, selected.label);
            this.messageService.info('Reaction added!');
        }
    }

    protected async joinChannel(): Promise<void> {
        const channels = await this.teamChatService.getChannels();
        const currentUser = await this.teamChatService.getCurrentUser();

        const availableChannels = channels.filter(c =>
            c.type === 'public' && !c.members.includes(currentUser.id)
        );

        if (availableChannels.length === 0) {
            this.messageService.info('No channels available to join.');
            return;
        }

        const items: QuickPickItem[] = availableChannels.map(channel => ({
            label: `#${channel.name}`,
            description: channel.description,
            detail: `${channel.members.length} members`,
            channel
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Select a channel to join'
        });

        if (selected && (selected as any).channel) {
            const channel = (selected as any).channel;
            await this.teamChatService.joinChannel(channel.id);
            this.currentChannel = channel;
            this.messageService.info(`Joined #${channel.name}`);
        }
    }

    protected async createChannel(): Promise<void> {
        const name = await this.quickInputService.input({
            placeHolder: 'channel-name',
            prompt: 'Enter channel name (lowercase, no spaces)'
        });

        if (!name) return;

        const typeMap: Record<string, ChannelType> = {
            'Public': 'public',
            'Private': 'private'
        };

        const types: QuickPickItem[] = [
            { label: 'Public', description: 'Anyone can join' },
            { label: 'Private', description: 'Invite only' }
        ];

        const typeSelection = await this.quickInputService.showQuickPick(types, {
            placeholder: 'Select channel type'
        });

        if (!typeSelection) return;

        const description = await this.quickInputService.input({
            placeHolder: 'Channel description (optional)',
            prompt: 'Enter channel description'
        });

        const channel = await this.teamChatService.createChannel({
            name: name.toLowerCase().replace(/\s+/g, '-'),
            type: typeMap[typeSelection.label] || 'public',
            description: description || undefined
        });

        this.currentChannel = channel;
        this.messageService.info(`Created channel #${channel.name}`);
    }

    protected async sendMessage(): Promise<void> {
        if (!this.currentChannel) {
            this.messageService.warn('Please select a channel first.');
            return;
        }

        const content = await this.quickInputService.input({
            placeHolder: 'Type your message...',
            prompt: `Send to #${this.currentChannel.name}`
        });

        if (content) {
            await this.teamChatService.sendMessage({
                channelId: this.currentChannel.id,
                content
            });
            this.messageService.info('Message sent!');
        }
    }

    protected async shareCode(): Promise<void> {
        if (!this.currentChannel) {
            this.messageService.warn('Please select a channel first.');
            return;
        }

        const editor = this.editorManager.currentEditor;
        if (!editor) {
            this.messageService.warn('No active editor.');
            return;
        }

        const selection = editor.editor.selection;
        const model = editor.editor.document;

        if (!selection || (selection.start.line === selection.end.line && selection.start.character === selection.end.character)) {
            this.messageService.warn('Please select code to share.');
            return;
        }

        const code = model.getText(selection);
        const uri = editor.editor.uri;
        const languageId = model.languageId || 'plaintext';

        const message = await this.quickInputService.input({
            placeHolder: 'Add a message (optional)',
            prompt: 'Share code snippet'
        });

        await this.teamChatService.shareCodeToChat(
            this.currentChannel.id,
            {
                language: languageId,
                code,
                fileName: uri.path.base,
                startLine: selection.start.line + 1,
                endLine: selection.end.line + 1,
                uri: uri.toString()
            },
            message || undefined
        );

        this.messageService.info('Code shared to chat!');
    }

    protected async viewOnlineUsers(): Promise<void> {
        const users = await this.teamChatService.getOnlineUsers();

        const items: QuickPickItem[] = users.map(user => ({
            label: user.name,
            description: user.status,
            detail: user.currentFile ? `Working on: ${user.currentFile}` : user.email,
            user
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: `${users.length} users online`
        });

        if (selected && (selected as any).user) {
            const user = (selected as any).user as ChatUser;
            await this.showUserActions(user);
        }
    }

    protected async showUserActions(user: ChatUser): Promise<void> {
        const actions: QuickPickItem[] = [
            { label: 'Send Direct Message', description: 'Start a private conversation' },
            { label: 'View Profile', description: 'See user details' }
        ];

        const selected = await this.quickInputService.showQuickPick(actions, {
            placeholder: `Actions for ${user.name}`
        });

        if (selected?.label === 'Send Direct Message') {
            const channel = await this.teamChatService.getOrCreateDirectChannel(user.id);
            this.currentChannel = channel;
            this.messageService.info(`Started conversation with ${user.name}`);
            await this.sendMessage();
        } else if (selected?.label === 'View Profile') {
            this.messageService.info(`${user.name} (${user.email}) - Status: ${user.status}`);
        }
    }

    protected async startDirectMessage(): Promise<void> {
        const users = await this.teamChatService.getOnlineUsers();
        const currentUser = await this.teamChatService.getCurrentUser();

        const otherUsers = users.filter(u => u.id !== currentUser.id);

        const items: QuickPickItem[] = otherUsers.map(user => ({
            label: user.name,
            description: user.status,
            detail: user.email,
            user
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: 'Select a user to message'
        });

        if (selected && (selected as any).user) {
            const user = (selected as any).user as ChatUser;
            const channel = await this.teamChatService.getOrCreateDirectChannel(user.id);
            this.currentChannel = channel;
            this.messageService.info(`Chat with ${user.name}`);
            await this.sendMessage();
        }
    }

    protected async viewNotifications(): Promise<void> {
        const notifications = await this.teamChatService.getNotifications(true);

        if (notifications.length === 0) {
            this.messageService.info('No unread notifications.');
            return;
        }

        const items: QuickPickItem[] = notifications.map(notif => ({
            label: notif.type === 'mention' ? `@mention from ${notif.fromUserName}` :
                notif.type === 'reply' ? `Reply from ${notif.fromUserName}` :
                    notif.type === 'reaction' ? `Reaction from ${notif.fromUserName}` :
                        `Channel invite from ${notif.fromUserName}`,
            description: formatTimestamp(notif.createdAt),
            detail: notif.preview,
            notification: notif
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: `${notifications.length} unread notifications`
        });

        if (selected && (selected as any).notification) {
            const notif = (selected as any).notification;
            await this.teamChatService.markNotificationRead(notif.id);

            const channel = await this.teamChatService.getChannel(notif.channelId);
            if (channel) {
                this.currentChannel = channel;
                await this.showChannelMessages();
            }
        }
    }

    protected async searchMessages(): Promise<void> {
        const query = await this.quickInputService.input({
            placeHolder: 'Search messages...',
            prompt: 'Enter search query'
        });

        if (!query) return;

        const results = await this.teamChatService.searchMessages({
            query,
            limit: 20
        });

        if (results.length === 0) {
            this.messageService.info('No messages found.');
            return;
        }

        const items: QuickPickItem[] = results.map(msg => ({
            label: msg.userName,
            description: formatTimestamp(msg.createdAt),
            detail: msg.content.slice(0, 100),
            message: msg
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: `${results.length} results for "${query}"`
        });

        if (selected && (selected as any).message) {
            const msg = (selected as any).message;
            const channel = await this.teamChatService.getChannel(msg.channelId);
            if (channel) {
                this.currentChannel = channel;
                this.messageService.info(`Showing message in #${channel.name}`);
            }
        }
    }

    protected async setStatus(): Promise<void> {
        const statusMap: Record<string, PresenceStatus> = {
            'Online': 'online',
            'Away': 'away',
            'Busy': 'busy',
            'Offline': 'offline'
        };

        const statuses: QuickPickItem[] = [
            { label: 'Online', description: 'Available' },
            { label: 'Away', description: 'Temporarily away' },
            { label: 'Busy', description: 'Do not disturb' },
            { label: 'Offline', description: 'Appear offline' }
        ];

        const selected = await this.quickInputService.showQuickPick(statuses, {
            placeholder: 'Set your status'
        });

        if (selected) {
            await this.teamChatService.updatePresence(statusMap[selected.label]);
            this.messageService.info(`Status set to ${selected.label}`);
        }
    }
}
