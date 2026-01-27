# AI Code Review - Smart Code Analysis

AI-powered code review with severity levels, categorization, and fix suggestions for Theia IDE.

## Features

- **Severity Levels**: Blocker, Critical, Major, Minor, Info
- **Issue Categories**: Security, Performance, Reliability, Maintainability, and more
- **Inline Markers**: Visual indicators in the editor gutter
- **Fix Suggestions**: AI-generated fixes with confidence levels
- **Review Summary**: Grade (A-F), score, and recommendations
- **Navigation**: Jump between issues with F8/Shift+F8

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Ctrl+Shift+R` | Review File | Review current file |
| `Ctrl+Shift+I` | Show Issues | Display all issues |
| `F8` | Next Issue | Go to next issue |
| `Shift+F8` | Previous Issue | Go to previous issue |

## Severity Levels

| Severity | Icon | Description |
|----------|------|-------------|
| Blocker | :x: | Must fix before release |
| Critical | :fire: | High priority fix needed |
| Major | :warning: | Should be addressed |
| Minor | :information_source: | Low priority improvements |
| Info | :bulb: | Suggestions and tips |

## Categories

| Category | Description |
|----------|-------------|
| Security | XSS, injection, credentials |
| Performance | Inefficient code patterns |
| Reliability | Error handling, null checks |
| Maintainability | Code complexity, TODOs |
| Style | Formatting, naming |
| Best Practice | Modern patterns, idioms |
| Bug | Potential bugs |
| Code Smell | Anti-patterns |
| Testing | Test issues |
| Documentation | Missing docs |

## Issue Detection

Detects issues including:

### Security
- `eval()` usage
- `innerHTML` assignment
- Hardcoded passwords/API keys
- SQL injection patterns

### Performance
- Async in forEach
- Inefficient deep cloning
- Dynamic RegExp in loops

### Reliability
- Empty catch blocks
- Unhandled Promise rejections
- Loose null comparisons

### Best Practices
- `var` declarations
- Loose equality operators
- Array/Object constructors

## Review Summary

Each review includes:
- **Grade**: A, B, C, D, or F
- **Score**: 0-100 based on issue severity
- **Files Reviewed**: Count and lines
- **Issues by Severity**: Breakdown
- **Issues by Category**: Breakdown
- **Recommendations**: Action items

## Commands

| Command | Description |
|---------|-------------|
| `ai-code-review.review-file` | Review current file |
| `ai-code-review.review-selection` | Review selected code |
| `ai-code-review.review-all` | Review all open files |
| `ai-code-review.show-issues` | Show issue list |
| `ai-code-review.next-issue` | Navigate to next |
| `ai-code-review.prev-issue` | Navigate to previous |
| `ai-code-review.summary` | Show review summary |
| `ai-code-review.dismiss` | Dismiss current issue |

## API

```typescript
interface AICodeReviewService {
    startReview(request: ReviewRequest): Promise<ReviewResult>;
    reviewFile(uri: string, content: string, language: string): Promise<ReviewIssue[]>;
    reviewSelection(uri: string, content: string, start: number, end: number): Promise<ReviewIssue[]>;
    applyFix(issue: ReviewIssue): Promise<ApplyFixResult>;
    dismissIssue(issueId: string): Promise<void>;
    getReviewHistory(limit?: number): Promise<ReviewResult[]>;
}
```

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
