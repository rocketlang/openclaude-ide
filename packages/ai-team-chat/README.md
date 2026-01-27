# AI Team Chat

Real-time team collaboration chat for OpenClaude IDE with code sharing, threads, and presence.

## Features

- **Channel-based Chat**: Public and private channels for team communication
- **Direct Messages**: Private 1:1 conversations
- **Code Sharing**: Share code snippets directly from editor with syntax highlighting
- **Message Threads**: Reply to messages in threads to keep discussions organized
- **Reactions**: React to messages with emojis
- **Mentions**: @mention team members to get their attention
- **Presence**: See who's online, away, busy, or offline
- **Notifications**: Get notified about mentions, replies, and reactions
- **Search**: Search messages across all channels

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| AI Team Chat: Open Chat | `Ctrl+Shift+C` | Open channel selector and view messages |
| AI Team Chat: Share Code Snippet | `Ctrl+Alt+S` | Share selected code to current channel |
| AI Team Chat: Send Message | `Ctrl+Enter` | Send a message to current channel |
| AI Team Chat: Join Channel | - | Join a public channel |
| AI Team Chat: Create Channel | - | Create a new channel |
| AI Team Chat: View Online Users | - | See who's online |
| AI Team Chat: Start Direct Message | - | Start a DM with a team member |
| AI Team Chat: View Notifications | - | View unread notifications |
| AI Team Chat: Search Messages | - | Search messages across channels |
| AI Team Chat: Set Status | - | Set your presence status |

## Channel Types

- **Public**: Anyone can join and view messages
- **Private**: Invite-only, messages only visible to members
- **Direct**: 1:1 private conversations

## Message Types

- **Text**: Regular text messages
- **Code**: Code snippets with syntax highlighting
- **File**: File attachments
- **System**: System notifications
- **AI Suggestion**: AI-generated suggestions

## Usage

### Open Chat
1. Press `Ctrl+Shift+C`
2. Select a channel from the list
3. View recent messages

### Share Code
1. Select code in the editor
2. Press `Ctrl+Alt+S`
3. Optionally add a message
4. Code is shared with file name, line numbers, and syntax highlighting

### React to Messages
1. Open a channel
2. Select a message
3. Choose "Add Reaction"
4. Pick an emoji

### Search Messages
1. Run "AI Team Chat: Search Messages"
2. Enter your search query
3. Browse results across all channels

## API

The `AITeamChatService` interface provides:

```typescript
interface AITeamChatService {
    // User operations
    getCurrentUser(): Promise<ChatUser>;
    getUser(userId: string): Promise<ChatUser | undefined>;
    getOnlineUsers(): Promise<ChatUser[]>;
    updatePresence(status: PresenceStatus): Promise<void>;

    // Channel operations
    getChannels(): Promise<ChatChannel[]>;
    getChannel(channelId: string): Promise<ChatChannel | undefined>;
    createChannel(request: CreateChannelRequest): Promise<ChatChannel>;
    joinChannel(channelId: string): Promise<void>;
    leaveChannel(channelId: string): Promise<void>;

    // Message operations
    getMessages(channelId: string, limit?: number): Promise<ChatMessage[]>;
    sendMessage(request: SendMessageRequest): Promise<ChatMessage>;
    editMessage(messageId: string, content: string): Promise<ChatMessage>;
    deleteMessage(messageId: string): Promise<void>;

    // Thread operations
    getThread(threadId: string): Promise<MessageThread | undefined>;
    replyToThread(threadId: string, content: string): Promise<ChatMessage>;

    // Reaction operations
    addReaction(messageId: string, emoji: string): Promise<void>;
    removeReaction(messageId: string, emoji: string): Promise<void>;

    // Code sharing
    shareCodeToChat(channelId: string, snippet: CodeSnippet): Promise<ChatMessage>;
}
```

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
