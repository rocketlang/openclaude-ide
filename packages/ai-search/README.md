# AI Search - Natural Language File Search

AI-powered semantic search for Theia IDE with natural language query understanding.

## Features

- **Natural Language Queries**: Search using plain English (e.g., "find login component", "class User")
- **Multi-Source Search**: Search across file names, content, and symbols simultaneously
- **Intelligent Ranking**: AI-powered relevance scoring for better results
- **Query Interpretation**: Understands intent (find file, search content, go to symbol)
- **Fuzzy Matching**: Tolerant to typos and partial matches
- **Recent Files**: Prioritizes recently accessed files
- **Learning**: Improves results based on your selections

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Cmd+K` / `Ctrl+K` | AI Search | Open AI-powered search |
| `Cmd+P` / `Ctrl+P` | Find File | Quick file search |
| `Cmd+Shift+O` | Go to Symbol | Search for symbols |
| `Cmd+Shift+F` | Find in Files | Search file contents |

## Query Examples

### Find Files
- `LoginComponent` - Find files containing "LoginComponent"
- `package.json` - Find package.json files
- `*.test.ts` - Find test files

### Find Symbols
- `class User` - Find User class
- `interface Config` - Find Config interface
- `function handleSubmit` - Find handleSubmit function

### Search Content
- `"TODO"` - Find TODO comments
- `console.log` - Find console.log statements
- `import React` - Find React imports

### Combined
- `find react component` - AI interprets and searches
- `where is the login page` - Natural language query

## Search Sources

| Source | Description | Icon |
|--------|-------------|------|
| `file` | File name matches | 📄 |
| `symbol` | Class, function, interface matches | 🔷 |
| `content` | Text content matches | 🔍 |
| `recent` | Recently selected files | ⏱️ |

## API

```typescript
interface AISearchService {
    search(options: AISearchOptions, token?: CancellationToken): Promise<AISearchResults>;
    interpretQuery(query: string): Promise<QueryInterpretation>;
    getSuggestions(partial: string, limit?: number): Promise<string[]>;
    indexWorkspace(rootUri: string): Promise<void>;
    recordSelection(query: string, selectedUri: string): Promise<void>;
}
```

## Query Interpretation

The AI interprets queries to understand intent:

```typescript
interface QueryInterpretation {
    original: string;           // Original query
    intent: 'find_file' | 'find_content' | 'find_symbol' | 'find_related';
    keywords: string[];         // Extracted search terms
    fileTypes?: string[];       // Detected file types
    symbolTypes?: SymbolKind[]; // Detected symbol types
    patterns: string[];         // Generated search patterns
    confidence: number;         // Interpretation confidence
}
```

## Relevance Scoring

Results are ranked by:
- Exact name match (highest)
- Starts with query
- Contains query
- Fuzzy match
- Path match
- Recent selection bonus
- AI interpretation match

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
