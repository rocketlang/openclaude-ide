# OpenClaude IDE

An open-source, AI-native development environment built on [Eclipse Theia](https://theia-ide.org/).

## Why OpenClaude?

Most AI-powered IDEs (Cursor, Windsurf, etc.) are proprietary forks of VS Code. You can't self-host them, audit their code, or extend their architecture. OpenClaude takes a different approach.

### Open source, not a fork

OpenClaude is built on Eclipse Theia — a vendor-neutral, extensible IDE framework maintained by the Eclipse Foundation. Theia shares VS Code's editor (Monaco) and extension compatibility, but its architecture is fundamentally different: dependency injection via InversifyJS, contribution points for extensibility, and a clean frontend/backend separation over RPC.

This means every AI feature in OpenClaude is a proper extension, not a monkey-patch. You can swap, override, or remove any service without touching the core.

### AI that you control

OpenClaude ships 47 AI packages. Unlike closed IDEs that lock you to a single provider, OpenClaude supports multiple AI backends:

- **Anthropic Claude** (primary)
- **OpenAI** / **Google** / **Ollama** (local) / **Hugging Face** / **Vercel AI SDK**
- **Custom providers** via the Model Context Protocol (MCP)

Switch providers at runtime. Run models locally. No vendor lock-in.

### Skills ecosystem

OpenClaude is a registered agent in the [open skills ecosystem](https://skills.sh) — the same standard used by Claude Code, Cursor, Codex, and 30+ other agents. Install community skills with one command:

```bash
npx skills add vercel-labs/agent-skills -a openclaude
```

Skills are reusable instruction sets (SKILL.md files) that teach the IDE how to handle specific tasks — code review standards, framework patterns, deployment procedures. OpenClaude ships with 4 built-in skills and a backend skill loader that automatically discovers and injects skill context into AI prompts.

## Features

### Implemented

**AI Code Review** — 50+ analysis patterns across security, performance, reliability, and style. Severity levels (blocker/critical/major/minor/info). Suggested fixes. Review history tracking.

- `packages/ai-code-review/` — 1,582 LOC
- `packages/openclaude-integration/src/browser/code-review/` — widget + decorations + code actions

**Test Generation** — Generate tests for 7 frameworks: Jest, Vitest, Mocha, Jasmine, Pytest, JUnit, Go test. AST-based function extraction. Mock generation. Coverage metrics.

- `packages/ai-test-gen/` — 1,916 LOC

**AI Chat** — Multi-provider streaming chat with context management, history, and code snippet support.

- `packages/ai-chat/` — 12,145 LOC

**Team Chat** — Channel-based messaging with presence tracking (online/offline/busy/dnd), code sharing, search, and notifications.

- `packages/ai-team-chat/` — 1,523 LOC

**AI Code Completion** — Hybrid completion engine combining static analysis with AI suggestions. Confidence scores. Multi-provider support.

- `packages/ai-code-completion/` — 1,306 LOC

**Documentation Generator** — Auto-generate JSDoc, TSDoc, Markdown, or RST documentation with optional examples.

- `packages/openclaude-integration/src/browser/documentation/`

**MCP Integration** — Model Context Protocol support with 255+ tools. Server management. RPC bridge.

- `packages/ai-mcp/` — 1,482 LOC

**Skill Loader** — Backend service that discovers SKILL.md files from `.openclaude/skills/`, `.agents/skills/`, and `~/.openclaude/skills/`. Parses YAML frontmatter. Deduplicates. Injects into AI context.

- `packages/openclaude-integration/src/node/skill-loader-service.ts`

### In Progress

- **Inline editing** — AI-powered inline code transformations
- **Code explanation** — Natural language explanations of code blocks
- **Commit generation** — AI-generated commit messages from diffs

### Planned

- **Collaborative editing** — Real-time document sync with OT/CRDT
- **AI debugging** — Breakpoint suggestions, error analysis
- **Multi-agent orchestration** — Swarm-based code review and development

## Architecture

```
openclaude-ide/
  packages/
    core, editor, monaco, ...     97 Theia packages (IDE foundation)
    ai-chat, ai-code-review, ...  47 AI packages
    openclaude-integration/       Custom integration (3,060 LOC)
      src/
        browser/                  9 React widgets, commands, DI bindings
        common/                   Protocol types (935 lines, 31 RPC methods)
        node/                     GraphQL backend client + skill loader
  skills/                         4 built-in agent skills
  examples/
    browser/                      Web IDE (localhost:3000)
    electron/                     Desktop app
```

**Key architectural decisions:**

| Decision | OpenClaude | Cursor / Windsurf |
|----------|-----------|-------------------|
| Base | Eclipse Theia (open) | VS Code fork (proprietary) |
| Extensibility | InversifyJS DI + contribution points | Fixed extension API |
| AI integration | Build-time extensions with full DI | Runtime extensions with limited API |
| Hosting | Self-hostable | SaaS only |
| Source | Open (EPL-2.0) | Closed |
| AI providers | Multi-provider, swappable | Single provider, locked |
| Skills | Open skills ecosystem | None |

Every AI feature follows this structure:

```
packages/ai-<feature>/
  src/
    common/    Shared types + RPC protocol (runs everywhere)
    browser/   Frontend widget + commands (runs in browser)
    node/      Backend service implementation (runs in Node.js)
```

Frontend and backend communicate over WebSocket RPC. Services are registered via InversifyJS `ContainerModule` and discovered automatically by Theia at startup.

## Quick Start

**Requirements:** Node.js >= 18.17.0

```bash
git clone https://github.com/rocketlang/openclaude-ide.git
cd openclaude-ide

# Install dependencies
npm install

# Build (TypeScript compile + Webpack bundle)
npm run compile && npm run build:browser

# Start web IDE
npm run start:browser
# Open http://localhost:3000
```

### Development

```bash
# Watch mode
npm run watch

# Build specific package
npx lerna run compile --scope @ankr/openclaude

# Run tests
npm run test

# Lint
npm run lint
```

### Install Skills

```bash
# Install OpenClaude's built-in skills
npx skills add ./skills -a openclaude -a claude-code

# Install community skills
npx skills add vercel-labs/agent-skills -a openclaude
npx skills add wshobson/agents --skill typescript-advanced-types -a openclaude
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| IDE Framework | Eclipse Theia 1.67.0 |
| Editor | Monaco (VS Code's editor engine) |
| Language | TypeScript ~5.4.5 |
| UI | React 18.2.0 |
| DI | InversifyJS |
| Backend | Express.js + WebSocket RPC |
| AI Communication | GraphQL (31 methods) |
| Build | Lerna + Webpack |
| Package Manager | npm with workspaces |

## Contributing

OpenClaude uses the Theia coding guidelines. Key rules:

- Property injection (`@inject` + `@postConstruct`), not constructor injection
- `inSingletonScope()` for services, not for widgets
- `kebab-case` file names matching the main exported type
- `openclaude-` prefix on CSS classes
- `undefined` over `null`
- Platform code separation: `common/` (shared), `browser/` (DOM), `node/` (Node.js)

See [CLAUDE.md](./CLAUDE.md) for the full development guide, or install the built-in skills for automated guidance:

```bash
npx skills add ./skills -a claude-code
```

## License

- **Eclipse Theia core:** EPL-2.0 / GPL-2.0 with Classpath Exception
- **OpenClaude additions:** MIT
- **Third-party dependencies:** Various (see individual packages)

## Credits

Built on [Eclipse Theia](https://theia-ide.org/) by the Eclipse Foundation.

Developed by [Ankr Labs](https://ankr.in).
