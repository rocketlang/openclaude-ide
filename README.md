# OpenClaude IDE

An open-source, AI-native development environment built on [Eclipse Theia](https://theia-ide.org/).

Named "OpenClaude" because the custom code was written with Claude AI. The project is a fork of Eclipse Theia with additional AI feature packages and an integration layer on top.

## What is this?

OpenClaude IDE = **Eclipse Theia** (the open-source IDE framework) + **custom AI packages and integration** written by Claude AI.

### What Theia provides (the foundation)

[Eclipse Theia](https://github.com/eclipse-theia/theia) is an open-source IDE framework maintained by the Eclipse Foundation. It provides:

- **The IDE itself** — editor (Monaco, same as VS Code), file explorer, terminal, git, debugger, extensions
- **22 upstream AI packages** — `ai-core`, `ai-chat`, `ai-chat-ui`, `ai-code-completion`, `ai-mcp`, `ai-terminal`, `ai-history`, `ai-editor`, `ai-ide`, and provider integrations for Anthropic, OpenAI, Google, Ollama, Hugging Face, Vercel AI SDK, Llamafile
- **Multi-provider AI support** — switch between Claude, GPT, Gemini, and local models at runtime
- **MCP integration** — Model Context Protocol for tool use
- **Extension system** — InversifyJS dependency injection, contribution points, VS Code extension compatibility
- **76 total packages** — the full IDE stack

This is all upstream Theia. Any Theia-based IDE gets these features.

### What OpenClaude adds (custom code)

Built on top of Theia by Claude AI:

**1. Integration Package** (`packages/openclaude-integration/`, 8,538 LOC) — the only package scoped as `@ankr/openclaude`:
- 8 React widgets: code review, test preview, documentation, chat, code comments, collaboration, review workflow, team dashboard
- 37 backend RPC methods (GraphQL protocol)
- 21 IDE commands
- Skill loader service (294 LOC, 29 unit tests passing)

**2. 25 Additional AI Packages** (~60K LOC) — extending Theia's AI capabilities:
- `ai-swarm` (8,998 LOC) — multi-agent orchestration
- `ai-memory` (5,382 LOC) — persistent AI memory and learning
- `ai-code-intelligence` (3,043 LOC) — symbol resolution, dependency analysis
- `ai-provider-manager` (2,960 LOC) — BYOK model routing
- `ai-refactor` (2,247 LOC) — AI-powered refactoring
- `ai-codebase-index` (2,288 LOC) — semantic search indexing
- `ai-mcp-apps` (2,244 LOC) — interactive MCP widgets
- `ai-context-mentions` (2,035 LOC) — @ mention providers
- `ai-planner` (2,018 LOC) — multi-step task planning
- `ai-streaming` (2,014 LOC) — streaming response handling
- `ai-explain` (1,900 LOC) — code explanation
- `ai-test-gen` (1,916 LOC) — test generation for 7 frameworks
- `ai-multi-edit` (1,888 LOC) — coordinated multi-file edits
- `ai-slash-commands` (1,858 LOC) — extensible command system
- `ai-error-recovery` (1,756 LOC) — smart error recovery
- `ai-debugging` (1,678 LOC) — AI debugging assistance
- `ai-comments` (1,676 LOC) — threaded code comments
- `ai-code-review` (1,582 LOC) — code review with severity levels
- `ai-inline-edit` (1,576 LOC) — inline ghost text suggestions
- `ai-autonomous-agent` (1,549 LOC) — self-directing agent
- `ai-search` (1,545 LOC) — natural language file search
- `ai-team-chat` (1,523 LOC) — team messaging
- `ai-diff-preview` (1,470 LOC) — change previews
- `ai-commit` (1,426 LOC) — commit message generation
- `ai-monitoring` (345 LOC) — performance metrics

**3. Skills Ecosystem** (genuinely novel — see [deep dive](#skills-ecosystem)):
- Skill loader backend service scanning 7 directories
- 4 built-in skills teaching agents Theia development patterns
- Agent registration in the [open skills ecosystem](https://skills.sh) alongside Claude Code, Cursor, Codex, and 30+ agents

**4. Branding** — renamed `@theia/example-browser` to `@openclaude/ide`

### Transparency

- The 25 custom AI packages were written by Claude AI in 1-2 sessions. They compile and type-check, but most lack unit tests. Their runtime behavior is unvalidated beyond compilation.
- The skill loader service is the most thoroughly tested component (29 passing Mocha tests).
- The 22 upstream Theia AI packages are maintained by the Eclipse Foundation and its community, not by this project.

---

## Skills Ecosystem

This is the most genuinely novel part of OpenClaude. Theia doesn't have this.

### What are Skills?

Skills are `SKILL.md` files with YAML frontmatter that teach AI agents how to handle specific tasks. They're portable — a skill written for Claude Code also works in OpenClaude and vice versa.

```yaml
---
name: my-skill
description: What this skill teaches the AI
---

# Markdown body with instructions, code examples, checklists...
```

### Built-in Skills

OpenClaude ships 4 built-in skills in `/skills/`:

| Skill | What it Teaches |
|-------|----------------|
| **openclaude-architecture** | Navigate the monorepo. Which packages matter, where custom code lives vs upstream Theia, dependency graph. |
| **openclaude-code-review** | PR review standards. InversifyJS DI rules, naming conventions, 7 common pitfalls, checklist. |
| **theia-widget-creation** | Full widget lifecycle: ReactWidget class, DI bindings, WidgetFactory, CSS, command registration. |
| **openclaude-ai-feature** | End-to-end AI feature pipeline: protocol types, GraphQL backend, polling pattern, widget display. |

### Skill Loader Service

The skill loader (`packages/openclaude-integration/src/node/skill-loader-service.ts`, 294 LOC) is a backend service that:

1. **Scans 7 directories** in priority order:
   - Project: `.openclaude/skills/`, `.agents/skills/`, `.claude/skills/`, `skills/`
   - Global: `~/.openclaude/skills/`, `~/.agents/skills/`, `~/.claude/skills/`
2. **Parses YAML frontmatter** — extracts name, description, metadata
3. **Deduplicates by name** — first found wins (project overrides global)
4. **Injects into AI context** — concatenates skill content for AI prompts

**Tested:** 29 unit tests covering YAML parsing, file loading, deduplication, context generation, and reload behavior.

### IDE Commands

- `OpenClaude: List Installed Skills` — shows loaded skills with scope
- `OpenClaude: Reload Skills` — re-scans directories from disk

### Cross-Agent Compatibility

```bash
# Install community skills
npx skills add vercel-labs/agent-skills -a openclaude
npx skills add vercel-labs/agent-skills -a claude-code  # also discovered by OpenClaude
```

---

## Architecture

```
openclaude-ide/
  packages/
    core, editor, monaco, ...           76 upstream Theia packages (IDE foundation)
    ai-core, ai-chat, ai-openai, ...   22 upstream Theia AI packages
    ai-swarm, ai-memory, ...            25 custom AI packages (Claude-generated)
    openclaude-integration/             Custom integration (8,538 LOC, @ankr/openclaude)
      src/
        browser/                        8 React widgets, 21 commands, DI bindings
        common/                         Protocol types (964 lines, 37 RPC methods)
        node/                           GraphQL backend client + skill loader (29 tests)
  skills/                               4 built-in agent skills
  examples/
    browser/                            Web IDE (localhost:3000)
    electron/                           Desktop app
```

### How it Connects

```
Browser (localhost:3000)
  └── 8 React Widgets + 21 Commands
        │ WebSocket JSON-RPC
        ▼
  Backend (Node.js)
  ├── openclaude-backend-client.ts → GraphQL → AI services
  └── skill-loader-service.ts → File system → SKILL.md files
```

### Comparison

| | OpenClaude | Cursor / Windsurf |
|--|-----------|-------------------|
| Base | Eclipse Theia (open) | VS Code fork (proprietary) |
| Source | Open (EPL-2.0 + MIT) | Closed |
| Self-hostable | Yes | No |
| AI providers | 7 swappable + MCP (via Theia) | Single provider |
| Skills ecosystem | Yes (unique) | No |
| Custom AI packages | 25 (Claude-generated, partially tested) | Unknown |

---

## Test Status

| Component | Tests | Status |
|-----------|-------|--------|
| Skill loader service | 29 tests (Mocha + Chai) | All passing |
| 25 custom AI packages | 0 tests | Untested |
| 8 custom widgets | 0 tests | Untested |
| 22 upstream Theia AI packages | Upstream test suite | Maintained by Eclipse |

Run tests:

```bash
# Skill loader tests
npx lerna run compile --scope @ankr/openclaude
cd packages/openclaude-integration
npx mocha --require reflect-metadata/Reflect lib/node/skill-loader-service.spec.js

# Full Theia test suite
npm run test
```

---

## Quick Start

**Requirements:** Node.js >= 18.17.0

```bash
git clone https://github.com/rocketlang/openclaude-ide.git
cd openclaude-ide

# Install dependencies
npm install

# Build
npm run compile && npm run build:browser

# Start web IDE
npm run start:browser
# Open http://localhost:3000
```

### Development

```bash
npm run watch                                        # Watch mode
npx lerna run compile --scope @ankr/openclaude       # Build custom package
npm run test                                         # Run tests
npm run lint                                         # Lint
```

### Install Skills

```bash
npx skills add ./skills -a openclaude -a claude-code   # Built-in skills
npx skills add vercel-labs/agent-skills -a openclaude   # Community skills
```

## Tech Stack

| Layer | Technology | Source |
|-------|-----------|--------|
| IDE Framework | Eclipse Theia 1.67.0 | Upstream |
| Editor | Monaco | Upstream (via Theia) |
| Language | TypeScript ~5.4.5 | — |
| UI | React 18.2.0 | — |
| DI | InversifyJS | Upstream (via Theia) |
| Backend | Express.js + WebSocket RPC | Upstream (via Theia) |
| AI Foundation | 22 Theia AI packages | Upstream |
| Custom AI | 25 packages (~60K LOC) | Claude-generated |
| Integration | 8,538 LOC, 37 RPC methods | Claude-generated |
| Skills | 4 built-in + skill loader (29 tests) | Claude-generated |
| Build | Lerna + Webpack | Upstream |

## Contributing

OpenClaude follows the Theia coding guidelines:

- Property injection (`@inject` + `@postConstruct`), not constructor injection
- `inSingletonScope()` for services, not for widgets
- `kebab-case` file names, `openclaude-` CSS class prefix
- `undefined` over `null`
- Platform separation: `common/` (shared), `browser/` (DOM), `node/` (Node.js)

See [CLAUDE.md](./CLAUDE.md) for the full guide.

## License

- **Eclipse Theia core (76 packages):** EPL-2.0 / GPL-2.0 with Classpath Exception
- **Custom OpenClaude additions (26 packages):** MIT
- **Third-party dependencies:** Various (see individual packages)

## Credits

Built on [Eclipse Theia](https://theia-ide.org/) by the Eclipse Foundation.

Custom code generated by [Claude AI](https://claude.ai/) (Anthropic).

Maintained by [Ankr Labs](https://ankr.in).
