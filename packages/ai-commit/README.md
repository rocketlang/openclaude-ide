# AI Commit Message Generator

AI-powered commit message generation for Theia IDE using conventional commit format.

## Features

- **Automatic Diff Analysis**: Analyzes staged changes to understand what was modified
- **Smart Type Detection**: Automatically detects commit type (feat, fix, docs, etc.)
- **Conventional Commits**: Generates messages following conventional commit format
- **Scope Inference**: Automatically detects the scope based on changed files
- **Alternative Suggestions**: Provides alternative commit messages
- **Gitmoji Support**: Optional emoji prefixes for commit messages
- **One-Click Accept**: Apply generated message with a single click
- **Learning**: Records user preferences for better future suggestions

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `AI: Generate Commit Message` | `Ctrl+Shift+G` | Generate a commit message for staged changes |
| `AI: Generate Commit Message (with options)` | - | Generate with type/emoji preferences |
| `AI: Accept Generated Commit Message` | - | Accept the last generated message |
| `AI: Show Alternative Commit Messages` | - | Show alternative suggestions |
| `AI: Change Commit Type` | - | Change the type of current message |

## Conventional Commit Types

| Type | Emoji | Description |
|------|-------|-------------|
| `feat` | ✨ | New feature |
| `fix` | 🐛 | Bug fix |
| `docs` | 📝 | Documentation only |
| `style` | 💄 | Code style changes |
| `refactor` | ♻️ | Code refactoring |
| `perf` | ⚡ | Performance improvement |
| `test` | ✅ | Adding/updating tests |
| `build` | 📦 | Build system changes |
| `ci` | 👷 | CI/CD configuration |
| `chore` | 🔧 | Maintenance tasks |
| `revert` | ⏪ | Reverts a previous commit |

## Usage

1. Stage your changes using Git
2. Press `Ctrl+Shift+G` or use the command palette
3. Review the generated message
4. Accept, edit, or select an alternative

## Configuration

The service analyzes:
- File paths and extensions
- Change patterns (additions, deletions, renames)
- Directory structure
- Common patterns (tests, docs, config files)

## API

```typescript
interface AICommitService {
    analyzeDiff(repositoryPath: string, staged?: boolean): Promise<DiffAnalysis>;
    generateCommitMessage(analysis: DiffAnalysis, options?: CommitMessageOptions): Promise<GeneratedCommitMessage>;
    getRecentCommits(repositoryPath: string, count?: number): Promise<string[]>;
    recordCommitMessage(entry: CommitMessageHistoryEntry): Promise<void>;
}
```

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
