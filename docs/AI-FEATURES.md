# OpenClaude IDE - AI Features Documentation

## Overview

OpenClaude IDE includes 20+ AI-powered packages for intelligent development assistance.

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+Shift+A` | Focus AI Chat | Global |
| `Ctrl+Shift+N` | New Chat Session | Global |
| `Ctrl+Shift+T` | Toggle Light/Dark Theme | Global |
| `Ctrl+Shift+E` | Explain Selected Code | Editor |
| `Ctrl+Shift+F` | Fix Selected Code | Editor |
| `Ctrl+Shift+M` | Open MCP Apps Panel | Global |
| `Ctrl+Shift+D` | Open AI Debugger | Global |
| `Ctrl+Alt+A` | Toggle AI Panel | Global |

## MCP Apps Framework

### What are MCP Apps?

MCP Apps are interactive widgets that can be embedded in the AI chat interface. They run in sandboxed iframes for security and communicate with the host via postMessage.

### Creating an MCP App

```typescript
// App definition
const myApp: MCPApp = {
    id: 'my-calculator',
    name: 'Calculator',
    description: 'A simple calculator widget',
    version: '1.0.0',
    publisher: 'ANKR Labs',
    ui: {
        html: `<div id="app">...</div>`,
        dimensions: { width: 300, height: 200 }
    },
    tools: [{
        name: 'calculate',
        description: 'Perform calculation',
        parameters: {
            expression: { type: 'string', required: true }
        },
        requiresConsent: false
    }],
    permissions: []
};
```

### User Consent

Tools marked with `requiresConsent: true` will prompt the user before execution:
- Approve/Deny buttons
- Risk level indicators (low/medium/high/critical)
- Remember choice options (session/permanent)

## AI Debugging & Profiling

### Error Analysis

Paste an error message or stack trace to get:
- Error type identification
- Root cause analysis
- Suggested fixes with priority
- Related code locations

### Performance Profiler

1. Click "Start Profiling"
2. Perform actions to profile
3. Click "Stop Profiling"
4. View metrics and AI insights:
   - Duration
   - Memory usage
   - GC time
   - Hotspots

## AI Agents

### Architect Agent
Plans and designs implementation approaches.

### Coder Agent
Implements code based on specifications.

### Universal Agent
General-purpose assistant for any task.

### Task Context Agent
Manages task context and history.

## Configuration

### AI Model Settings

Configure in Preferences > AI > Models:

```json
{
    "ai.anthropic.model": "claude-opus-4",
    "ai.anthropic.enabled": true
}
```

### API Keys

Set via environment variables:
- `AI_ANTHROPIC_API_KEY`
- `AI_OPENAI_API_KEY`
- `AI_GOOGLE_API_KEY`

## Package Reference

| Package | Description |
|---------|-------------|
| `@theia/ai-core` | Core AI infrastructure |
| `@theia/ai-chat` | Chat agent framework |
| `@theia/ai-chat-ui` | Chat UI components |
| `@theia/ai-mcp-apps` | MCP Apps framework |
| `@theia/ai-debugging` | AI debugger & profiler |
| `@theia/ai-inline-edit` | Ghost text suggestions |
| `@theia/ai-autonomous-agent` | Self-directing agent |
| `@theia/ai-planner` | Task planning |
| `@theia/ai-code-intelligence` | Code analysis |
| `@theia/ai-memory` | Conversation memory |
| `@theia/ai-streaming` | Response streaming |
| `@theia/ai-diff-preview` | Diff visualization |
| `@theia/ai-codebase-index` | Code search indexing |
| `@theia/ai-context-mentions` | @mentions in chat |
| `@theia/ai-slash-commands` | /command support |
