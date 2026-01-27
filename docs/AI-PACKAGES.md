# OpenClaude IDE - AI Packages Guide

This guide covers the AI-powered packages developed for OpenClaude IDE.

## Package Overview

| Package | Description | Status |
|---------|-------------|--------|
| `@theia/ai-code-intelligence` | Symbol analysis, semantic context, AI code actions | ✅ Complete |
| `@theia/ai-memory` | Memory storage, conversation history, learning | ✅ Complete |
| `@openclaude/integration` | OpenClaude-specific integrations | ✅ Complete |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaude IDE                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  Code Actions    │  │  Chat Interface  │                │
│  │  - Explain       │  │  - Conversations │                │
│  │  - Refactor      │  │  - Context aware │                │
│  │  - Generate      │  │  - Memory recall │                │
│  └────────┬─────────┘  └────────┬─────────┘                │
│           │                      │                          │
│  ┌────────▼──────────────────────▼─────────┐               │
│  │         AI Code Intelligence             │               │
│  │  - Symbol Analysis                       │               │
│  │  - Semantic Context                      │               │
│  │  - Code Actions Service                  │               │
│  └────────────────────┬────────────────────┘               │
│                       │                                     │
│  ┌────────────────────▼────────────────────┐               │
│  │            AI Memory                     │               │
│  │  - Memory Service (IndexedDB)           │               │
│  │  - Conversation History                  │               │
│  │  - Learning Service                      │               │
│  │  - Context Retrieval                     │               │
│  └────────────────────┬────────────────────┘               │
│                       │                                     │
│  ┌────────────────────▼────────────────────┐               │
│  │         Theia AI Core                    │               │
│  │  - Language Model Service               │               │
│  │  - Agent System                          │               │
│  │  - Tool Use                              │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Code Intelligence Flow

```
User selects code → getSymbolAtPosition() → getContext() → AI Action
        ↓                    ↓                    ↓            ↓
   Monaco Editor      Symbol Analysis     Semantic Context   LLM Call
                              ↓                    ↓            ↓
                         Definitions         Imports       Response
                         References          Outline       ↓
                         Hover Info          Visible       Apply Edit
                                            Symbols        or Show
```

### 2. Memory & Learning Flow

```
User interaction → Learn patterns → Store in memory → Retrieve for context
       ↓                 ↓                ↓                   ↓
  Code edits       Pattern analysis   IndexedDB          Query relevant
  Feedback         Error solutions    Importance         memories
  Conversations    Preferences        scoring            Format for AI
```

## Integration Guide

### Adding AI Memory to Your Feature

```typescript
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ContextRetrievalService,
    ConversationHistoryService,
    LearningService
} from '@theia/ai-memory';

@injectable()
export class MyAIFeature {
    @inject(ContextRetrievalService)
    protected readonly contextRetrieval: ContextRetrievalService;

    @inject(ConversationHistoryService)
    protected readonly conversationHistory: ConversationHistoryService;

    @inject(LearningService)
    protected readonly learningService: LearningService;

    async handleUserQuery(query: string): Promise<string> {
        // Get relevant context from memory
        const context = await this.contextRetrieval.getRelevantContext(query, {
            maxTokens: 2000,
            includeConversations: true,
            includePatterns: true
        });

        // Use context in your AI call
        const enrichedPrompt = this.buildPrompt(query, context);

        // ... make AI call

        // Learn from interaction
        await this.learningService.learnFromFeedback(suggestionId, accepted);

        return response;
    }
}
```

### Adding Code Intelligence to Your Feature

```typescript
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    SemanticContextService,
    SymbolAnalysisService,
    AICodeActionsService
} from '@theia/ai-code-intelligence';

@injectable()
export class MyCodeFeature {
    @inject(SemanticContextService)
    protected readonly semanticContext: SemanticContextService;

    @inject(SymbolAnalysisService)
    protected readonly symbolAnalysis: SymbolAnalysisService;

    async analyzeCurrentCode(): Promise<void> {
        // Get current context
        const context = await this.semanticContext.getCurrentContext({
            includeOutline: true,
            includeImports: true,
            linesBefore: 20,
            linesAfter: 10
        });

        if (!context) return;

        // Format for AI
        const formatted = this.semanticContext.formatContextForAI(context);

        // Get symbols
        const symbols = await this.symbolAnalysis.getDocumentSymbols(
            context.fileUri
        );

        // Use in your feature
    }
}
```

## Best Practices

### Memory Management

1. **Set appropriate importance levels**
   - 0.9-1.0: Critical information (project settings, key patterns)
   - 0.6-0.8: Important patterns frequently used
   - 0.3-0.5: Casual information, conversations
   - 0.0-0.2: Low-value, temporary data

2. **Use tags effectively**
   ```typescript
   await memoryService.store({
       // ...
       tags: ['typescript', 'react', 'hooks', 'state-management']
   });
   ```

3. **Clean up old memories**
   ```typescript
   // Query and delete old, low-importance memories
   const oldMemories = await memoryService.query({
       since: Date.now() - 90 * 24 * 60 * 60 * 1000, // 90 days
       minImportance: 0,
       limit: 100
   });

   for (const memory of oldMemories.filter(m => m.importance < 0.3)) {
       await memoryService.delete(memory.id);
   }
   ```

### Context Retrieval

1. **Respect token limits**
   ```typescript
   const context = await contextRetrieval.getRelevantContext(query, {
       maxTokens: 4000  // Leave room for response
   });
   ```

2. **Filter by relevance**
   ```typescript
   // Only include highly relevant memories
   const relevant = context.patterns.filter(p =>
       context.relevanceScores.get(p.id) > 0.5
   );
   ```

### Code Intelligence

1. **Use appropriate options**
   ```typescript
   // For quick lookups
   const symbols = await symbolAnalysis.getDocumentSymbols(uri, {
       maxDepth: 2,
       kinds: [CodeSymbolKind.Class, CodeSymbolKind.Function]
   });

   // For full analysis
   const symbols = await symbolAnalysis.getDocumentSymbols(uri, {
       includePrivate: true,
       includeDocumentation: true,
       maxDepth: 10
   });
   ```

2. **Handle missing providers gracefully**
   ```typescript
   const definitions = await symbolAnalysis.getDefinition(uri, position);
   if (definitions.length === 0) {
       // Fallback behavior
   }
   ```

## Testing

### Unit Testing Memory Services

```typescript
import { expect } from 'chai';
import { MemoryServiceImpl } from '@theia/ai-memory/lib/browser';

describe('MemoryService', () => {
    let service: MemoryServiceImpl;

    beforeEach(() => {
        service = new MemoryServiceImpl();
    });

    it('should store and retrieve memory', async () => {
        const id = await service.store({
            type: MemoryEntryType.CodePattern,
            timestamp: Date.now(),
            importance: 0.5,
            // ...
        });

        const retrieved = await service.retrieve(id);
        expect(retrieved).to.exist;
    });
});
```

### Integration Testing

```typescript
describe('AI Code Actions Integration', () => {
    it('should explain code with context', async () => {
        // Setup context
        const context = await contextService.getContext(uri, position);

        // Get explanation
        const explanation = await codeActions.explainCode(uri, range);

        expect(explanation.summary).to.be.a('string');
        expect(explanation.complexity).to.be.oneOf(['simple', 'moderate', 'complex']);
    });
});
```

## Troubleshooting

### Memory Issues

**Problem**: IndexedDB storage full
```typescript
// Check storage usage
const stats = await memoryService.getStats();
console.log(`Total size: ${stats.totalSize} bytes`);

// Clear old data
await memoryService.clear();
```

**Problem**: Slow queries
```typescript
// Use specific filters
const results = await memoryService.query({
    types: [MemoryEntryType.CodePattern],  // Specific type
    tags: ['typescript'],                   // Specific tags
    limit: 10                               // Limit results
});
```

### Code Intelligence Issues

**Problem**: No symbols returned
- Check if language server is running
- Verify file is saved and valid
- Check file extension matches language

**Problem**: Context too large
```typescript
// Limit context size
const context = await semanticContext.getContext(uri, position, {
    linesBefore: 5,    // Fewer lines
    linesAfter: 3,
    includeOutline: false,
    maxRelatedFiles: 2
});
```

## Performance Considerations

1. **Batch operations** when storing multiple memories
2. **Use indexes** - query by type or projectId when possible
3. **Limit depth** for symbol analysis in large files
4. **Cache results** for frequently accessed context
5. **Debounce** context updates on rapid cursor movements

## Future Enhancements

- [ ] Vector embeddings for semantic search
- [ ] Cross-session memory sync
- [ ] Memory compression and archival
- [ ] Language-specific intelligence providers
- [ ] Real-time collaboration memory
