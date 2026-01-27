# @theia/ai-code-intelligence

AI-Powered Code Intelligence Extension for Eclipse Theia / OpenClaude IDE.

## Overview

This package provides intelligent code analysis and AI-powered code actions for the IDE. It integrates with Monaco editor's language features to provide smart code understanding, navigation, and AI-assisted coding features.

## Features

### 🔍 Symbol Analysis
- **Document symbols** - Get all symbols (classes, functions, variables) in a file
- **Symbol at position** - Identify what's under the cursor
- **Go to definition** - Navigate to symbol definitions
- **Find references** - Find all usages of a symbol
- **Type hierarchy** - Explore inheritance relationships
- **Call hierarchy** - Trace function call chains

### 🧠 Semantic Context
- **Rich context extraction** - Understand code context around cursor
- **Import analysis** - Track imports and dependencies
- **Scope awareness** - Know what symbols are visible
- **File outline** - Quick overview of file structure
- **Related files** - Find connected files

### ⚡ AI Code Actions
- **Explain code** - Get AI explanations of code sections
- **Generate documentation** - Auto-generate JSDoc/TSDoc
- **Suggest refactoring** - AI-powered refactoring suggestions
- **Generate tests** - Create unit tests for functions
- **Quick fixes** - AI-assisted error resolution

## Installation

```bash
npm install @theia/ai-code-intelligence
```

## Usage

### Symbol Analysis

```typescript
import { SymbolAnalysisService, CodeSymbolKind } from '@theia/ai-code-intelligence';

// Get all symbols in a document
const symbols = await symbolAnalysis.getDocumentSymbols(
    'file:///src/app.ts',
    {
        includePrivate: true,
        maxDepth: 5,
        kinds: [CodeSymbolKind.Class, CodeSymbolKind.Function]
    }
);

// Get symbol at cursor position
const symbol = await symbolAnalysis.getSymbolAtPosition(
    'file:///src/app.ts',
    { line: 10, character: 15 }
);

// Find definition
const definitions = await symbolAnalysis.getDefinition(
    'file:///src/app.ts',
    { line: 10, character: 15 }
);

// Find all references
const references = await symbolAnalysis.getReferences(
    'file:///src/app.ts',
    { line: 10, character: 15 },
    true  // include declaration
);

// Search workspace symbols
const results = await symbolAnalysis.searchSymbols('UserService');
```

### Semantic Context

```typescript
import { SemanticContextService } from '@theia/ai-code-intelligence';

// Get context at a specific position
const context = await semanticContext.getContext(
    'file:///src/app.ts',
    { line: 20, character: 10 },
    {
        linesBefore: 10,
        linesAfter: 5,
        includeOutline: true,
        includeImports: true
    }
);

// Get current editor context
const currentContext = await semanticContext.getCurrentContext();

// Format context for AI consumption
const aiContext = semanticContext.formatContextForAI(context);
console.log(aiContext);
// Output:
// File: src/app.ts (typescript)
// Current line: const result = processData(input);
//
// Visible symbols:
// - processData (Function)
// - input (Variable)
// ...
```

### AI Code Actions

```typescript
import { AICodeActionsService } from '@theia/ai-code-intelligence';

// Explain selected code
const explanation = await codeActions.explainCode(
    'file:///src/app.ts',
    {
        start: { line: 10, character: 0 },
        end: { line: 25, character: 0 }
    }
);

console.log(explanation.summary);
console.log(explanation.complexity);  // 'simple' | 'moderate' | 'complex'
console.log(explanation.concepts);    // ['recursion', 'memoization']

// Generate documentation
const docs = await codeActions.generateDocumentation(
    'file:///src/app.ts',
    { start: { line: 10, character: 0 }, end: { line: 20, character: 0 } }
);
// Returns JSDoc/TSDoc comment

// Suggest refactoring
const suggestions = await codeActions.suggestRefactoring(
    'file:///src/app.ts',
    { start: { line: 10, character: 0 }, end: { line: 50, character: 0 } }
);

for (const suggestion of suggestions) {
    console.log(`${suggestion.title}: ${suggestion.description}`);
}

// Generate tests
const testCode = await codeActions.generateTests(
    'file:///src/utils.ts',
    { start: { line: 5, character: 0 }, end: { line: 15, character: 0 } }
);

// Get quick fix for diagnostic
const fixes = await codeActions.getQuickFix(
    'file:///src/app.ts',
    {
        message: "Property 'foo' does not exist on type 'Bar'",
        severity: DiagnosticSeverity.Error,
        range: { start: { line: 10, character: 5 }, end: { line: 10, character: 8 } }
    }
);
```

## Commands

The package registers the following commands:

| Command | Keybinding | Description |
|---------|------------|-------------|
| `ai.codeIntelligence.explain` | `Ctrl+Shift+E` | Explain selected code |
| `ai.codeIntelligence.generateDocs` | - | Generate documentation |
| `ai.codeIntelligence.refactor` | - | Suggest refactoring |
| `ai.codeIntelligence.generateTests` | - | Generate unit tests |
| `ai.codeIntelligence.showContext` | - | Show semantic context |
| `ai.codeIntelligence.quickFix` | `Ctrl+.` | AI quick fix |

## Types

### CodeSymbolKind

```typescript
enum CodeSymbolKind {
    File = 1,
    Module = 2,
    Namespace = 3,
    Package = 4,
    Class = 5,
    Method = 6,
    Property = 7,
    Field = 8,
    Constructor = 9,
    Enum = 10,
    Interface = 11,
    Function = 12,
    Variable = 13,
    Constant = 14,
    // ... more
}
```

### AICodeActionKind

```typescript
enum AICodeActionKind {
    QuickFix = 'quickfix',
    Refactor = 'refactor',
    RefactorExtract = 'refactor.extract',
    RefactorInline = 'refactor.inline',
    RefactorRewrite = 'refactor.rewrite',
    Source = 'source',
    SourceOrganizeImports = 'source.organizeImports',
    Generate = 'generate',
    Explain = 'explain',
    Document = 'document',
    Test = 'test'
}
```

### SemanticContext

```typescript
interface SemanticContext {
    fileUri: string;
    language: string;
    position: CodePosition;
    currentLine: string;
    linesBefore: string[];
    linesAfter: string[];
    symbolAtCursor?: CodeSymbol;
    enclosingSymbol?: CodeSymbol;
    visibleSymbols: CodeSymbol[];
    imports: ImportInfo[];
    outline: CodeSymbol[];
    relatedFiles: string[];
    selection?: CodeRange;
    selectedText?: string;
}
```

## API Reference

### SymbolAnalysisService

| Method | Description |
|--------|-------------|
| `getDocumentSymbols(uri, options)` | Get all symbols in document |
| `getSymbolAtPosition(uri, position)` | Get symbol at cursor |
| `getDefinition(uri, position)` | Go to definition |
| `getReferences(uri, position, includeDecl)` | Find all references |
| `getHoverInfo(uri, position)` | Get hover information |
| `getTypeHierarchy(uri, position)` | Get type hierarchy |
| `getCallHierarchy(uri, position)` | Get call hierarchy |
| `searchSymbols(query, options)` | Search workspace symbols |

### SemanticContextService

| Method | Description |
|--------|-------------|
| `getContext(uri, position, options)` | Get semantic context |
| `getCurrentContext(options)` | Get current editor context |
| `formatContextForAI(context)` | Format for AI consumption |

### AICodeActionsService

| Method | Description |
|--------|-------------|
| `getCodeActions(uri, range, diagnostics)` | Get available actions |
| `executeAction(action)` | Execute a code action |
| `getQuickFix(uri, diagnostic)` | Get AI quick fix |
| `explainCode(uri, range)` | Explain code section |
| `generateDocumentation(uri, range)` | Generate docs |
| `suggestRefactoring(uri, range)` | Suggest refactoring |
| `generateTests(uri, range)` | Generate tests |

## Extension Points

### CodeIntelligenceContribution

Implement this to add language-specific intelligence:

```typescript
@injectable()
export class MyLanguageContribution implements CodeIntelligenceContribution {
    readonly languages = ['mylang'];
    readonly priority = 10;

    async provideSymbols(uri: string): Promise<CodeSymbol[]> {
        // Return additional symbols
    }

    async enhanceContext(context: SemanticContext): Promise<SemanticContext> {
        // Add language-specific context
        return {
            ...context,
            // additional info
        };
    }

    async provideCodeActions(uri: string, range: CodeRange): Promise<AICodeAction[]> {
        // Return language-specific actions
    }
}
```

## Contributing

See the main repository's contributing guidelines.

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
