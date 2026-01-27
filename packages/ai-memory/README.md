# @theia/ai-memory

AI Memory and Learning Extension for Eclipse Theia / OpenClaude IDE.

## Overview

This package provides persistent memory and learning capabilities for AI-powered features in the IDE. It enables the AI to remember conversations, learn from user patterns, and provide more contextually relevant assistance over time.

## Features

### 🧠 Memory Storage
- **IndexedDB-based persistence** - All memory data is stored locally in the browser
- **Multiple memory types** - Conversations, code patterns, preferences, project context, error solutions
- **Importance-based retention** - Higher importance memories are prioritized
- **Access tracking** - Frequently accessed memories get higher relevance scores

### 💬 Conversation History
- **Session management** - Start, track, and end conversation sessions
- **Automatic summarization** - Conversations are summarized for efficient retrieval
- **Topic extraction** - Key topics are automatically identified
- **Search capabilities** - Full-text search across conversation history

### 📚 Learning Services
- **Code pattern recognition** - Learns naming conventions, import styles, error handling patterns
- **User preference tracking** - Remembers coding style preferences
- **Error solution memory** - Stores successful error resolutions for future reference
- **Project context analysis** - Understands project structure, frameworks, and conventions

### 🔍 Context Retrieval
- **Relevance-based retrieval** - Get the most relevant context for AI queries
- **Completion context** - Language-specific patterns for code completion
- **Error context** - Historical solutions for similar errors
- **Token-aware** - Respects token limits when building context

## Installation

```bash
npm install @theia/ai-memory
```

## Usage

### Memory Service

```typescript
import { MemoryService, MemoryEntryType } from '@theia/ai-memory';

// Store a memory entry
const id = await memoryService.store({
    type: MemoryEntryType.CodeSnippet,
    timestamp: Date.now(),
    importance: 0.8,
    name: 'React Hook Pattern',
    description: 'Custom hook for API calls',
    code: 'const useApi = () => { ... }',
    language: 'typescript',
    usageContext: 'data fetching',
    usageCount: 0,
    tags: ['react', 'hooks', 'api']
});

// Query memories
const patterns = await memoryService.query({
    types: [MemoryEntryType.CodePattern],
    tags: ['typescript'],
    minImportance: 0.5,
    limit: 10
});

// Get statistics
const stats = await memoryService.getStats();
console.log(`Total entries: ${stats.totalEntries}`);
```

### Conversation History

```typescript
import { ConversationHistoryService } from '@theia/ai-memory';

// Start a new session
const sessionId = conversationHistory.startSession();

// Add conversation turns
await conversationHistory.addTurn(sessionId, {
    role: 'user',
    content: 'How do I implement authentication?',
    codeContext: 'const app = express();'
});

await conversationHistory.addTurn(sessionId, {
    role: 'assistant',
    content: 'You can use passport.js for authentication...'
});

// Search history
const results = await conversationHistory.searchHistory('authentication');

// End and persist session
await conversationHistory.endSession(sessionId);
```

### Learning Service

```typescript
import { LearningService, PreferenceCategory } from '@theia/ai-memory';

// Learn from user code
await learningService.learnFromCode(
    'file:///src/app.ts',
    fileContent,
    'typescript'
);

// Learn from feedback
await learningService.learnFromFeedback(
    suggestionId,
    true,  // accepted
    'Modified version of the suggestion'
);

// Learn from error resolution
await learningService.learnFromErrorResolution(
    'TypeError: Cannot read property "x" of undefined',
    'Added null check before accessing property',
    true  // successful
);

// Get learned patterns
const patterns = await learningService.getPatterns('typescript');

// Analyze project
const projectContext = await learningService.analyzeProject('/path/to/project');
```

### Context Retrieval

```typescript
import { ContextRetrievalService } from '@theia/ai-memory';

// Get relevant context for a query
const context = await contextRetrieval.getRelevantContext(
    'How do I handle errors in async functions?',
    {
        maxTokens: 4000,
        includeConversations: true,
        includePatterns: true
    }
);

// Get completion context
const completionContext = await contextRetrieval.getCompletionContext(
    'file:///src/utils.ts',
    { line: 10, character: 5 }
);

// Get error context
const errorContext = await contextRetrieval.getErrorContext(
    'Module not found: react',
    'file:///src/app.tsx'
);
```

## Memory Types

| Type | Description |
|------|-------------|
| `Conversation` | Chat history with AI assistant |
| `CodePattern` | Learned coding patterns and conventions |
| `UserPreference` | User's coding style preferences |
| `ProjectContext` | Project structure and configuration |
| `LearnedBehavior` | Patterns learned from user feedback |
| `ErrorSolution` | Successful error resolutions |
| `CodeSnippet` | Frequently used code snippets |

## API Reference

### MemoryService

| Method | Description |
|--------|-------------|
| `store(entry)` | Store a new memory entry |
| `retrieve(id)` | Get a memory entry by ID |
| `query(options)` | Query memories with filters |
| `update(id, updates)` | Update an existing entry |
| `delete(id)` | Delete a memory entry |
| `getStats()` | Get memory statistics |
| `clear()` | Clear all memories |
| `export()` | Export memories as JSON |
| `import(data)` | Import memories from JSON |

### ConversationHistoryService

| Method | Description |
|--------|-------------|
| `startSession()` | Start a new conversation session |
| `addTurn(sessionId, turn)` | Add a turn to a session |
| `getHistory(sessionId)` | Get conversation history |
| `getRecentConversations(limit)` | Get recent conversations |
| `searchHistory(query)` | Search conversation history |
| `summarizeConversation(sessionId)` | Generate summary |
| `endSession(sessionId)` | End and persist session |

### LearningService

| Method | Description |
|--------|-------------|
| `learnFromCode(uri, content, language)` | Learn patterns from code |
| `learnFromFeedback(id, accepted, modification)` | Learn from user feedback |
| `learnFromErrorResolution(error, solution, success)` | Learn from error fixes |
| `getPatterns(language)` | Get learned patterns |
| `getPreferences(category)` | Get user preferences |
| `getProjectContext(root)` | Get project context |
| `analyzeProject(root)` | Analyze project structure |

### ContextRetrievalService

| Method | Description |
|--------|-------------|
| `getRelevantContext(query, options)` | Get context for AI query |
| `getCompletionContext(uri, position)` | Get completion context |
| `getErrorContext(error, uri)` | Get error resolution context |

## Contributing

See the main repository's contributing guidelines.

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
