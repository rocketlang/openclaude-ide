# OpenClaude IDE - User Manual

Complete guide for using OpenClaude IDE effectively.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Interface Overview](#interface-overview)
3. [Features Guide](#features-guide)
4. [Keyboard Shortcuts](#keyboard-shortcuts)
5. [Settings & Configuration](#settings--configuration)
6. [Team Collaboration](#team-collaboration)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Getting Started

### Installation

**Option 1: NPM (Recommended)**
```bash
npm install -g @openclaude/ide
openclaude start
```

**Option 2: Download Binary**
- Visit: https://openclaude.io/download
- Download for your OS (Windows/Mac/Linux)
- Run installer
- Launch OpenClaude IDE

**Option 3: Docker**
```bash
docker pull openclaude/ide:latest
docker run -p 3000:3000 openclaude/ide
```

### First Launch

1. **Welcome Screen**
   - Click "Get Started"
   - Choose: New Project / Open Existing / Clone from Git

2. **Configure Claude API**
   - File → Preferences → Settings
   - Search "OpenClaude"
   - Enter your Anthropic API key
   - Test connection

3. **Open Your Project**
   - File → Open Folder
   - Select your project directory
   - IDE indexes your code (may take a moment)

---

## Interface Overview

###Main Layout

```
┌─────────────────────────────────────────────────────┐
│  File  Edit  View  Terminal  OpenClaude  Help      │  Menu Bar
├──────┬──────────────────────────────────┬──────────┤
│      │  editor.ts                       │          │
│ File │                                  │ Code     │
│ Tree │    1  function calculate() {     │ Review   │
│      │    2    return 42;               │ Panel    │
│  📁  │    3  }                          │          │
│  src │                                  │ Issues:  │
│  📄  │    AI cursor here ▌              │ • Line 2 │
│ .ts  │                                  │ ...      │
│      │                                  │          │
├──────┴──────────────────────────────────┴──────────┤
│  Terminal / Output / Problems / Team Dashboard     │  Bottom Panel
└─────────────────────────────────────────────────────┘
```

### Key Areas

**1. Menu Bar** (Top)
- File operations
- Edit commands
- View toggles
- OpenClaude commands

**2. Sidebar** (Left)
- File Explorer
- Search
- Git
- Extensions

**3. Editor** (Center)
- Your code
- Multiple tabs
- Split view support

**4. Side Panel** (Right)
- Code Review
- Test Preview
- Documentation
- Chat
- Comments

**5. Bottom Panel**
- Terminal
- Output logs
- Problems list
- Team Dashboard

---

## Features Guide

### 1. AI Code Review

**How to Use:**
1. Open a file in the editor
2. Click "OpenClaude" menu → "Start Code Review"
3. Wait for AI analysis (5-10 seconds)
4. Review panel opens with issues and suggestions

**Review Panel:**
- **Issues Tab:** Bugs, errors, warnings
- **Suggestions Tab:** Improvements, optimizations
- **Files Tab:** All reviewed files

**Actions:**
- Click issue → jumps to code line
- Click "Apply Fix" → AI fixes the issue
- Click "Ignore" → dismisses issue
- Click "Explain" → AI explains the issue

**Keyboard Shortcut:** `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

### 2. Test Generation

**How to Use:**
1. Open file with code to test
2. Click "OpenClaude" → "Generate Tests"
3. Configure:
   - Framework: Jest / Mocha / Vitest
   - Coverage: Basic / Comprehensive / Edge Cases
4. Click "Generate"
5. Review generated tests
6. Click "Accept" to save test file

**Test Preview:**
- See all generated test cases
- Edit before accepting
- See coverage metrics
- Run tests directly

**Keyboard Shortcut:** `Ctrl+Shift+T`

### 3. AI Code Completion

**How to Use:**
1. Enable: "OpenClaude" → "Toggle AI Code Completions"
2. Start typing code
3. AI suggests completions automatically
4. Press `Tab` to accept
5. Press `Esc` to dismiss

**Features:**
- Multi-line completions
- Context-aware suggestions
- Learns from your codebase
- Works offline with cache

**Settings:**
- Trigger delay (default: 300ms)
- Max suggestions (default: 5)
- Cache duration (default: 30s)

**Keyboard Shortcuts:**
- `Tab` - Accept suggestion
- `Esc` - Dismiss
- `Alt+]` - Next suggestion
- `Alt+[` - Previous suggestion

### 4. Documentation Generator

**How to Use:**
1. Select function/class
2. Right-click → "Generate Documentation"
3. Or use command: "OpenClaude: Generate Documentation"
4. Choose format:
   - JSDoc
   - Markdown
   - Plain text
5. Review and edit
6. Click "Insert" to add to code

**Auto-Documentation:**
- Enable in settings
- Generates docs when you save file
- Updates existing docs

### 5. Real-Time Chat

**How to Use:**
1. Click "OpenClaude" → "Show Chat"
2. Click "Join Session" or "Create New Session"
3. Type message and press Enter
4. See team messages in real-time

**Features:**
- Code snippets in chat (use ```code```)
- File mentions (@file.js)
- User mentions (@username)
- Typing indicators
- Read receipts

**Keyboard Shortcut:** `Ctrl+Shift+C`

### 6. Code Comments

**How to Use:**
1. Select code lines
2. Right-click → "Add Code Comment"
3. Write comment
4. Submit
5. Collaborators see comment

**Comment Features:**
- Threading (reply to comments)
- Resolve/Unresolve
- Mentions (@username)
- Code context shown
- Notifications

**Keyboard Shortcut:** `Ctrl+Shift+M`

### 7. Live Collaboration

**How to Use:**
1. Open file
2. Click "OpenClaude" → "Start Live Collaboration"
3. Share session ID with team
4. See collaborators' cursors in real-time

**Features:**
- Multi-cursor editing
- Selection highlighting
- Collaborator names
- Color-coded cursors
- Activity indicators

**Keyboard Shortcut:** `Ctrl+Shift+L`

### 8. Code Review Workflow

**How to Use:**
1. Make changes in files
2. Click "OpenClaude" → "Create Review Request"
3. Fill in:
   - Title
   - Description
   - Files to review
   - Reviewers
   - Priority
   - Due date
4. Submit
5. Reviewers get notified
6. Review → Approve/Request Changes/Reject

**Review Workflow:**
```
Created → In Review → Approved → Merged
                  ↘ Changes Requested → Fixed → In Review
                  ↘ Rejected → Closed
```

### 9. Team Dashboard

**How to Use:**
1. Click "OpenClaude" → "Show Team Dashboard"
2. View metrics:
   - Code reviews completed
   - Tests generated
   - Documentation created
   - Team activity
   - Member contributions

**Features:**
- Auto-refresh (30s)
- Manual refresh button
- Filterable metrics
- Export data
- Date range selector

**Keyboard Shortcut:** `Ctrl+Shift+D`

---

## Keyboard Shortcuts

### General

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+P` | Quick File Open |
| `Ctrl+,` | Settings |
| `Ctrl+B` | Toggle Sidebar |
| `Ctrl+J` | Toggle Panel |
| `Ctrl+`` ` | Toggle Terminal |

### OpenClaude Features

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+R` | Start Code Review |
| `Ctrl+Shift+T` | Generate Tests |
| `Ctrl+Shift+G` | Generate Documentation |
| `Ctrl+Shift+C` | Show Chat |
| `Ctrl+Shift+M` | Add Code Comment |
| `Ctrl+Shift+L` | Start Collaboration |
| `Ctrl+Shift+D` | Show Team Dashboard |

### AI Completion

| Shortcut | Action |
|----------|--------|
| `Tab` | Accept Suggestion |
| `Esc` | Dismiss |
| `Alt+]` | Next Suggestion |
| `Alt+[` | Previous Suggestion |

### Editor

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+F` | Find |
| `Ctrl+H` | Replace |
| `Ctrl+/` | Toggle Comment |
| `Alt+Up` | Move Line Up |
| `Alt+Down` | Move Line Down |

**Mac Users:** Replace `Ctrl` with `Cmd`

---

## Settings & Configuration

### Access Settings

1. File → Preferences → Settings
2. Or: `Ctrl+,`

### OpenClaude Settings

**API Configuration:**
```json
{
  "openclaude.apiKey": "your-anthropic-api-key",
  "openclaude.apiUrl": "https://api.anthropic.com",
  "openclaude.model": "claude-3-opus",
  "openclaude.timeout": 30000
}
```

**Features:**
```json
{
  "openclaude.codeReview.autoReview": false,
  "openclaude.completion.enabled": true,
  "openclaude.completion.delay": 300,
  "openclaude.documentation.format": "jsdoc",
  "openclaude.collaboration.autoJoin": false
}
```

**UI:**
```json
{
  "openclaude.ui.theme": "dark",
  "openclaude.ui.fontSize": 14,
  "openclaude.ui.showNotifications": true
}
```

### Recommended Settings

**For Solo Developers:**
```json
{
  "openclaude.codeReview.autoReview": true,
  "openclaude.completion.enabled": true,
  "openclaude.documentation.autoGenerate": true
}
```

**For Teams:**
```json
{
  "openclaude.collaboration.enabled": true,
  "openclaude.chat.notifications": true,
  "openclaude.reviewWorkflow.enabled": true
}
```

---

## Team Collaboration

### Setting Up Team

1. **Admin Creates Team:**
   - OpenClaude → Team → Create Team
   - Set team name
   - Invite members (email)

2. **Members Join:**
   - Receive email invite
   - Click "Accept Invitation"
   - Configure OpenClaude with team settings

3. **Configure Permissions:**
   - Owner: Full access
   - Admin: Manage users, settings
   - Member: Read/write code
   - Guest: Read-only

### Collaboration Workflow

**Daily Workflow:**
1. Open project
2. Start collaboration session
3. Write code (see teammates' cursors)
4. Add code comments for questions
5. Chat with team
6. Create review request when done
7. Teammates review and approve
8. Merge changes

**Best Practices:**
- Use descriptive commit messages
- Add comments for complex code
- Respond to review comments promptly
- Use chat for quick questions
- Schedule video calls for major discussions

---

## Troubleshooting

### Common Issues

**1. AI Features Not Working**

*Problem:* "Failed to connect to backend"

*Solutions:*
- Check API key is correct
- Verify internet connection
- Check Anthropic API status
- Restart OpenClaude IDE

**2. Code Completion Not Showing**

*Problem:* No suggestions appear

*Solutions:*
- Ensure AI completion is enabled: `Ctrl+Shift+P` → "Toggle AI Completions"
- Check completion delay setting (should be 300ms)
- Verify file language is supported
- Restart language server: `Ctrl+Shift+P` → "Reload Window"

**3. Collaboration Not Working**

*Problem:* Can't see teammate's cursor

*Solutions:*
- Both users must be in same session
- Check WebSocket connection
- Verify firewall allows WebSocket
- Try refreshing: `Ctrl+Shift+P` → "Reload Window"

**4. Slow Performance**

*Problem:* IDE is laggy

*Solutions:*
- Close unused widgets
- Disable unused extensions
- Clear cache: Settings → OpenClaude → Clear Cache
- Reduce completion delay to 500ms
- Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096`

**5. High Memory Usage**

*Problem:* IDE using too much RAM

*Solutions:*
- Close unused tabs
- Disable auto-review
- Reduce cache size
- Restart IDE regularly

### Getting Help

**Documentation:**
- Docs: https://docs.openclaude.io
- FAQ: https://openclaude.io/faq
- Wiki: https://wiki.openclaude.io

**Community:**
- Discord: https://discord.gg/openclaude
- Forum: https://forum.openclaude.io
- GitHub Discussions: https://github.com/openclaude/ide/discussions

**Support:**
- Email: support@openclaude.io
- Bug Reports: https://github.com/openclaude/ide/issues
- Feature Requests: https://openclaude.io/feedback

---

## Best Practices

### Code Review

✅ **Do:**
- Review code daily
- Fix critical issues immediately
- Add comments to explain complex fixes
- Use "Explain" button to learn

❌ **Don't:**
- Blindly accept all suggestions
- Ignore warnings
- Skip manual review
- Rely 100% on AI

### Test Generation

✅ **Do:**
- Generate tests for critical code
- Review and edit generated tests
- Run tests before accepting
- Add edge cases manually

❌ **Don't:**
- Accept tests without review
- Skip testing edge cases
- Generate tests for trivial code
- Forget to run tests

### AI Completion

✅ **Do:**
- Use for boilerplate code
- Review suggestions before accepting
- Learn from suggestions
- Customize trigger delay

❌ **Don't:**
- Accept without reading
- Over-rely on completion
- Ignore your coding style
- Use for sensitive code (passwords, etc.)

### Collaboration

✅ **Do:**
- Communicate via chat
- Use code comments for feedback
- Respect teammates' code
- Sync frequently

❌ **Don't:**
- Edit same lines simultaneously
- Make large changes without notice
- Ignore comments
- Work in isolation

### Team Workflow

✅ **Do:**
- Create review requests for all changes
- Respond to reviews promptly
- Use dashboard to track progress
- Assign reviewers explicitly

❌ **Don't:**
- Merge without approval
- Skip code reviews
- Ignore review comments
- Work on outdated code

---

## Tips & Tricks

### Productivity Hacks

**1. Multi-File Review**
- Select multiple files in explorer
- Right-click → "Review Selected Files"
- Get review for all files at once

**2. Custom Snippets**
- File → Preferences → User Snippets
- Create custom code snippets
- Use with AI completion

**3. Quick Chat**
- Use `Ctrl+Shift+C` to quickly open chat
- Type `/code` to share code snippet
- Type `/file` to share current file

**4. Batch Test Generation**
- Select folder in explorer
- Right-click → "Generate Tests for Folder"
- AI generates tests for all files

**5. Dashboard Filters**
- Use dashboard filters for specific date ranges
- Export data to CSV for reports
- Pin important metrics

### Advanced Features

**1. Custom AI Prompts**
- Settings → OpenClaude → Custom Prompts
- Add your own review checklist
- Customize test generation templates

**2. Integration with CI/CD**
- Use OpenClaude CLI in CI pipeline
- Auto-review PRs
- Generate tests in CI

**3. Custom Themes**
- Settings → Appearance → Custom Theme
- Match your company branding
- Share themes with team

---

## Appendix

### Supported Languages

- JavaScript / TypeScript
- Python
- Java
- C / C++
- Go
- Rust
- Ruby
- PHP
- Swift
- Kotlin
- ...and more

### Supported Test Frameworks

- **JavaScript:** Jest, Mocha, Jasmine, Vitest
- **Python:** pytest, unittest
- **Java:** JUnit, TestNG
- **Go:** testing package
- **Rust:** cargo test

### File Size Limits

- Max file size for review: 10 MB
- Max file size for test generation: 5 MB
- Max lines per file: 10,000
- Max collaboration session size: 100 MB

---

**Version:** 1.0.0
**Last Updated:** January 24, 2026
**Questions?** support@openclaude.io
