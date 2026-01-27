# AI Comments for Theia IDE

A comprehensive code comments and discussion system for Theia IDE with TODO/FIXME tracking, threaded discussions, and collaboration features.

## Features

### Comment Types
- **Comment**: General code comments
- **TODO**: Tasks to complete
- **FIXME**: Bugs or issues to fix
- **HACK**: Temporary workarounds
- **Note**: Important notes
- **Warning**: Cautions or alerts
- **Question**: Questions for review
- **Review**: Code review comments

### Threaded Discussions
- Reply to any comment
- Track conversation threads
- Reactions with emojis (👍, ❤️, ✅, etc.)

### TODO/FIXME Scanner
- Automatically parse code annotations
- Convert inline TODOs to trackable comments
- Support for multiple formats:
  - `// TODO: message`
  - `# FIXME: message`
  - `// TODO(@username): message`

### Comment Management
- Priority levels: Low, Medium, High, Critical
- Status tracking: Open, Resolved, Won't Fix, Deferred
- Assignees and tags
- Search and filter

### File & Workspace Summary
- Comments per file
- Open vs resolved counts
- TODOs and FIXMEs breakdown
- Priority distribution

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| Add Comment | `Ctrl+Shift+M` | Add a new comment at cursor |
| View Comments | `Ctrl+Alt+M` | View all comments in current file |
| Scan TODOs | `Ctrl+Shift+D` | Find TODOs/FIXMEs in current file |

## Additional Commands

- **AI Comments: View All TODOs** - List all open TODOs across workspace
- **AI Comments: Resolve Comment** - Mark a comment as resolved
- **AI Comments: Search Comments** - Search by text, author, or tag
- **AI Comments: File Summary** - Show comment statistics for current file
- **AI Comments: Workspace Summary** - Show comment statistics for workspace
- **AI Comments: Reply to Comment** - Add a reply to a comment
- **AI Comments: Convert TODO** - Convert inline TODO to trackable comment

## Usage

### Adding Comments

1. Place cursor on the line you want to comment
2. Press `Ctrl+Shift+M`
3. Select comment type (TODO, FIXME, Note, etc.)
4. Enter your comment content
5. Select priority level

### Scanning TODOs

1. Open a file with TODO/FIXME comments
2. Press `Ctrl+Shift+D`
3. View all found annotations
4. Select one to convert to trackable comment

### Searching Comments

Supports special filters:
- `@username` - Find comments by author
- `#tag` - Find comments with tag
- Plain text - Full text search

## Protocol Types

```typescript
interface CodeComment {
    id: string;
    fileUri: string;
    position: CommentPosition;
    type: CommentType;
    status: CommentStatus;
    priority: CommentPriority;
    content: string;
    author: CommentUser;
    tags?: string[];
    reactions?: CommentReaction[];
    replyCount?: number;
}

interface ParsedAnnotation {
    type: CommentType;
    content: string;
    fileUri: string;
    position: CommentPosition;
    rawLine: string;
    assignee?: string;
    priority?: CommentPriority;
}
```

## Annotation Parsing

The scanner recognizes these patterns:

```javascript
// TODO: Implement feature
// FIXME: Bug in calculation
// HACK: Temporary workaround
// NOTE: Important detail
// WARNING: Be careful here
// ?: Is this correct?
// REVIEW: Needs review

# TODO: Python style
# FIXME(@alice): Assigned to alice
```

## Priority Colors

- **Critical**: Red 🔴
- **High**: Orange 🟠
- **Medium**: Yellow 🟡
- **Low**: Green 🟢

## Status Icons

- **Open**: ○
- **Resolved**: ✓
- **Won't Fix**: ✗
- **Deferred**: ⏰

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
