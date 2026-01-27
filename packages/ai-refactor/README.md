# AI Refactor - One-Click Code Refactoring

AI-powered code refactoring tools for Theia IDE with intelligent suggestions and one-click application.

## Features

- **Extract Function**: Extract selected code into a new function
- **Extract Variable**: Extract expression into a variable
- **Extract Constant**: Extract literal value into a constant
- **Rename with AI**: Get AI-suggested names when renaming
- **Convert Functions**: Arrow function ↔ Regular function
- **Simplify Conditionals**: Clean up complex boolean expressions
- **Optimize Imports**: Remove unused, sort, and organize imports
- **Code Smell Detection**: Find potential issues in your code

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Ctrl+Shift+R` | Show Refactorings | Show all available refactorings |
| `Ctrl+Shift+M` | Extract Function | Extract selection to function |
| `Ctrl+Shift+L` | Extract Variable | Extract expression to variable |
| `Ctrl+Shift+O` | Optimize Imports | Clean up imports |
| `F2` | Rename with AI | Rename symbol with suggestions |

## Refactoring Types

### Extract Refactorings
- **Extract Function** - Move code block to a new function
- **Extract Variable** - Store expression result in a variable
- **Extract Constant** - Move literal to a named constant
- **Extract Interface** - Create interface from object shape
- **Extract Type** - Create type alias from inline type

### Inline Refactorings
- **Inline Variable** - Replace variable with its value
- **Inline Function** - Replace function call with its body

### Conversion Refactorings
- **Convert to Arrow** - Change function declaration to arrow
- **Convert to Function** - Change arrow to function declaration
- **Convert to Async** - Make function async and add await

### Code Quality
- **Simplify Conditional** - Clean up boolean expressions
- **Remove Dead Code** - Delete unused commented code
- **Optimize Imports** - Sort and remove unused imports

## Risk Levels

| Risk | Meaning |
|------|---------|
| Safe | No behavioral changes possible |
| Low | Minor potential for issues |
| Medium | Review changes carefully |
| High | May affect other code |

## Code Smell Detection

Detects common issues:
- Long functions (>50 lines)
- Magic numbers (unexplained literals)
- Complex conditionals (multiple &&/||)
- Duplicate code blocks
- God classes (too many responsibilities)

## API

```typescript
interface AIRefactorService {
    getSuggestions(request: RefactorRequest): Promise<RefactorSuggestion[]>;
    applyRefactor(id: string, context: RefactorContext): Promise<RefactorResult>;
    extractFunction(params: ExtractParams, context: RefactorContext): Promise<RefactorResult>;
    extractVariable(params: ExtractParams, context: RefactorContext): Promise<RefactorResult>;
    rename(params: RenameParams, context: RefactorContext): Promise<RefactorResult>;
    suggestNames(symbol: SymbolInfo, language: string): Promise<RenameSuggestion[]>;
    detectCodeSmells(uri: string, content: string, language: string): Promise<CodeSmell[]>;
    optimizeImports(uri: string, context: RefactorContext): Promise<RefactorResult>;
}
```

## Usage Examples

### Extract Function
1. Select code block
2. Press `Ctrl+Shift+M`
3. Enter function name
4. Code is extracted with parameters auto-detected

### Rename with AI
1. Place cursor on symbol
2. Press `F2`
3. Choose from AI suggestions or enter custom name
4. All occurrences are renamed

### Optimize Imports
1. Open any file
2. Press `Ctrl+Shift+O`
3. Unused imports removed, remaining sorted

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
