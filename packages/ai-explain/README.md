# AI Explain - Inline Code Explanations

AI-powered inline code explanations for Theia IDE with hover tooltips and detailed breakdowns.

## Features

- **Hover Explanations**: Get brief explanations when hovering over code
- **Detailed Analysis**: Press `Ctrl+Shift+E` for full code explanation
- **Symbol Lookup**: Explain any symbol or built-in function
- **Error Explanations**: Understand error messages with causes and solutions
- **Diff Analysis**: Understand changes between code versions
- **Smart Caching**: Explanations are cached for performance

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Ctrl+Shift+E` | Explain Code | Explain code at cursor |
| `Ctrl+Shift+/` | Explain Symbol | Look up any symbol |

## Hover Tooltips

Hover over any code element to see:

- **Type badge**: Function, Class, Variable, etc.
- **Complexity indicator**: Simple, Moderate, Complex, Expert
- **Brief explanation**: What the code does
- **Warnings**: Potential issues or considerations

## Explanation Details

Full explanations include:

- **Summary**: One-line description
- **Purpose**: What the code is for
- **Mechanism**: How it works
- **Warnings**: Security or performance concerns
- **Examples**: Usage examples
- **Best Practices**: Improvement suggestions

## Code Element Types

| Type | Icon | Description |
|------|------|-------------|
| Function | ⚡ | Functions and arrow functions |
| Class | 📦 | Class definitions |
| Method | 🔧 | Class methods |
| Variable | 📌 | Variable declarations |
| Import | 📥 | Import statements |
| Interface | 📋 | TypeScript interfaces |
| Type | 🏷️ | Type aliases |
| Enum | 📊 | Enumerations |
| Decorator | 🎀 | Decorators |

## Complexity Levels

- **Simple**: Basic code, few lines, no nesting
- **Moderate**: Some conditionals or loops
- **Complex**: Multiple conditions, async operations
- **Expert**: Advanced patterns, recursion, generics

## API

```typescript
interface AIExplainService {
    explainCode(request: ExplainRequest): Promise<CodeExplanation>;
    getHoverExplanation(request: ExplainRequest): Promise<HoverExplanation>;
    explainSymbol(symbolName: string, language: string): Promise<CodeExplanation>;
    explainError(errorMessage: string, code: string, language: string): Promise<ErrorExplanation>;
    explainDiff(oldCode: string, newCode: string, language: string): Promise<DiffExplanation>;
}
```

## Configuration

Hover explanations can be toggled via the command palette:

- `AI Explain: Toggle Hover Explanations`

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
