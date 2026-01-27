# AI Error Recovery - Smart Error Handling

AI-powered error analysis and recovery for Theia IDE with intelligent fixes and explanations.

## Features

- **Error Analysis**: Deep analysis of errors with root cause detection
- **Quick Fixes**: AI-suggested fixes with one-click apply
- **Stack Trace Explanation**: Understand complex stack traces
- **Error Statistics**: Overview of error patterns in your code
- **Preventive Suggestions**: Learn how to avoid common errors

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Ctrl+.` | Quick Fix | Show available fixes for error |
| `Ctrl+Shift+.` | Analyze Error | Deep analysis of error at cursor |
| `Ctrl+Shift+Alt+.` | Fix All | Auto-fix all errors in file |

## Error Categories

| Category | Icon | Description |
|----------|------|-------------|
| Syntax | ❌ | Parsing errors |
| Type | 🔷 | Type mismatches |
| Reference | 🔗 | Undefined references |
| Import | 📦 | Module resolution |
| Runtime | 🐛 | Runtime errors |
| Style | 🎨 | Code style issues |
| Security | 🛡️ | Security concerns |
| Performance | ⚡ | Performance issues |

## Error Analysis

Each error analysis includes:

- **Category**: Type of error
- **Explanation**: Plain English description
- **Root Cause**: Why this happened
- **Prevention**: How to avoid in future
- **Fixes**: Available solutions
- **Documentation**: Related resources

## Quick Fixes

Fixes are rated by confidence:
- **High**: Safe to apply automatically
- **Medium**: Review before applying
- **Low**: May have side effects

## Stack Trace Analysis

Paste a stack trace to get:
- Summary of the error
- Root cause identification
- Relevant stack frames highlighted
- User code vs library code separation
- Suggested fixes

## API

```typescript
interface AIErrorRecoveryService {
    analyzeError(context: ErrorContext): Promise<ErrorAnalysis>;
    getQuickFixes(context: ErrorContext): Promise<ErrorFix[]>;
    applyFix(fix: ErrorFix): Promise<{ success: boolean }>;
    fixAllInFile(uri: string, content: string, language: string): Promise<BatchFixResult>;
    explainStackTrace(stackTrace: string, language: string): Promise<StackTraceExplanation>;
    getStatistics(errors: EditorError[]): Promise<ErrorStatistics>;
    explainErrorCode(code: string, source: string): Promise<ErrorCodeExplanation>;
}
```

## Supported Error Patterns

### TypeScript
- TS2304: Cannot find name
- TS2339: Property does not exist
- TS2322: Type not assignable
- TS2345: Argument type mismatch
- TS1005: Missing semicolon

### ESLint
- Unused variables
- Missing imports
- Style violations

### Runtime
- Cannot read property of undefined
- Is not a function
- Unexpected token

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
