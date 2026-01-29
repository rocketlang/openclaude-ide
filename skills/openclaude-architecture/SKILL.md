---
name: openclaude-architecture
description: Navigate the OpenClaude IDE codebase — a 103-package Theia monorepo. Use this skill to understand which packages matter, where custom code lives versus upstream Theia, and how the dependency graph works.
---

# OpenClaude IDE Architecture Guide

Use this skill when you need to understand the codebase structure, find the right file to edit, or understand how packages relate to each other.

## Project Identity

- **Name:** OpenClaude IDE (package: `@openclaude/monorepo`)
- **Base:** Eclipse Theia 1.67.0
- **Runtime:** Node.js >= 18.17.0
- **Language:** TypeScript ~5.4.5
- **UI:** React 18.2.0
- **DI:** InversifyJS
- **Monorepo:** Lerna with npm workspaces

## The Two Codebases

There are really two codebases in one repo:

### 1. Upstream Theia (DO NOT MODIFY unless necessary)

```
packages/core/           # Theia framework core
packages/editor/         # Editor abstraction
packages/monaco/         # Monaco editor integration
packages/filesystem/     # File system service
packages/git/            # Git integration
packages/terminal/       # Terminal
packages/ai-*/           # 46 AI-related Theia packages
dev-packages/            # Build tooling
```

These are standard Theia packages. Modify only when extending Theia itself.

### 2. Custom OpenClaude Code (YOUR CODE)

```
packages/openclaude-integration/    # All custom OpenClaude features
```

This single package contains all 9 widgets, all custom services, all protocol types. This is where almost all development work happens.

## OpenClaude Integration Package Structure

```
packages/openclaude-integration/
  package.json                          # @ankr/openclaude, version 1.0.0
  src/
    browser/                            # Frontend code (runs in browser)
      openclaude-frontend-module.ts     # DI container bindings
      openclaude-frontend-contribution.ts  # Command registrations (18 commands)
      openclaude-preferences.ts         # User preferences
      code-review/                      # AI Code Review widget
        code-review-widget.tsx
        code-review-decoration-provider.ts
        code-review-code-action-provider.ts
      test-generation/                  # Test Generation widget
        test-preview-widget.tsx
        test-generation-dialog.ts
      completion/                       # AI Code Completion
        ai-completion-provider.ts
        completion-context-analyzer.ts
      documentation/                    # Documentation Generator widget
        documentation-widget.tsx
        documentation-dialog.ts
      chat/                             # Real-time Chat widget
        chat-widget.tsx
      code-comments/                    # Code Comments widget
        code-comments-widget.tsx
        add-comment-dialog.ts
      collaboration/                    # Live Collaboration widget
        collaboration-widget.tsx
        cursor-decorator-provider.ts
      code-review-workflow/             # Review Workflow widget
        review-workflow-widget.tsx
        create-review-dialog.ts
      team-dashboard/                   # Team Dashboard widget
        team-dashboard-widget.tsx
      style/                            # CSS for all widgets
        code-review.css
        test-generation.css
        ai-completion.css
        documentation.css
        chat.css
        code-comments.css
        collaboration.css
        review-workflow.css
        team-dashboard.css
    common/                             # Shared types (browser + node)
      openclaude-protocol.ts            # Backend service interface (31 methods, 935 lines)
      openclaude-types.ts               # GraphQL type definitions
    node/                               # Backend code (runs in Node.js)
      openclaude-backend-module.ts      # Backend DI bindings
      openclaude-backend-client.ts      # GraphQL client to API server
```

## Key Entry Points

| What you want to do | File to edit |
|---------------------|-------------|
| Add a new widget | `src/browser/<feature>/<feature>-widget.tsx` (new) + `openclaude-frontend-module.ts` |
| Add a new command | `src/browser/openclaude-frontend-contribution.ts` |
| Add a backend method | `src/common/openclaude-protocol.ts` + `src/node/openclaude-backend-client.ts` |
| Add shared types | `src/common/openclaude-protocol.ts` |
| Change DI bindings | `src/browser/openclaude-frontend-module.ts` |
| Add widget styles | `src/browser/style/<feature>.css` |
| Change preferences | `src/browser/openclaude-preferences.ts` |

## How Packages Connect

```
┌─────────────────────────────────────────┐
│           Browser (localhost:3000)       │
│                                         │
│  openclaude-frontend-module.ts          │
│    ├── Widgets (React)                  │
│    ├── Contributions (Commands)         │
│    └── Services (Completion, Decorations)│
│              │                          │
│              │ WebSocket RPC            │
│              ▼                          │
│  openclaude-backend-module.ts           │
│    └── openclaude-backend-client.ts     │
│              │                          │
│              │ GraphQL                  │
│              ▼                          │
│  OpenClaude API Server (localhost:4000) │
│    └── Claude AI / AI Services          │
└─────────────────────────────────────────┘
```

## Application Entry Points

### Browser App (main development target)

```
examples/browser/
  package.json         # Depends on all Theia packages + openclaude-integration
  webpack.config.js    # Webpack bundling
```

Start with: `npm run start:browser` (serves at `localhost:3000`)

### Electron App (desktop)

```
examples/electron/
  package.json
  electron-main.ts
```

Start with: `npm run start:electron`

## Build System

```bash
# Full build (compile TS + webpack bundle)
npm run build:browser

# TypeScript compile only (faster, no bundle)
npm run compile

# Watch mode for development
npm run watch

# Build specific package
npx lerna run compile --scope @ankr/openclaude

# Run tests
npm run test

# Lint
npm run lint
```

## Theia Extension Registration

The `package.json` in `openclaude-integration` declares entry points:

```json
{
  "theiaExtensions": [
    {
      "frontend": "lib/browser/openclaude-frontend-module",
      "backend": "lib/node/openclaude-backend-module"
    }
  ]
}
```

Theia automatically discovers and loads these modules at startup. The frontend module exports a `ContainerModule` that registers all DI bindings.

## Platform Code Organization Rules

Code in each folder can only import from specific scopes:

| Folder | Can import from |
|--------|----------------|
| `common/` | Only `common/` (no browser or node APIs) |
| `browser/` | `common/` and `browser/` (DOM APIs allowed) |
| `node/` | `common/` and `node/` (Node.js APIs allowed) |

Never import `browser/` from `node/` or vice versa. The `common/` folder is the bridge.

## Known TODOs

1. `openclaude-frontend-contribution.ts` — File paths hardcoded instead of reading from workspace
2. `openclaude-frontend-contribution.ts` — AI completions toggle not implemented
3. `openclaude-frontend-contribution.ts` — User detection hardcoded to `'Current User'`
4. `test-preview-widget.tsx` — Cannot write generated tests to actual files
5. `documentation-widget.tsx` — Cannot insert generated docs into source files

## Package Dependencies (OpenClaude Integration)

```json
{
  "@theia/core": "~1.67.0",
  "@theia/editor": "~1.67.0",
  "@theia/monaco": "~1.67.0",
  "graphql-request": "^7.0.0",
  "graphql": "^16.8.0"
}
```

Peer dependencies: `@theia/core ~1.67.0`, `react ^18.2.0`
