# OpenClaude IDE Wiki

**The AI-Native Development Environment**

Built on Eclipse Theia | Powered by Claude AI | 47 AI Packages

---

## Quick Links

| Page | Description |
|------|-------------|
| [[Deep-Dive-Analysis]] | Complete technical architecture and analysis |
| [[Code-Wiki]] | Developer documentation and code patterns |
| [[Investor-Slides]] | 18-slide investor presentation |
| [[Documentation-Index]] | Index of all documentation |

---

## What is OpenClaude IDE?

OpenClaude IDE is an AI-native development environment that integrates 47 AI packages into Eclipse Theia, providing:

- **Claude Native Integration** - Extended thinking, tool use, streaming
- **Multi-Model Support** - 6 providers (Anthropic, OpenAI, Google, Ollama, etc.)
- **MCP Apps Framework** - Interactive widgets in AI chat
- **AI Debugging & Profiler** - Intelligent error analysis
- **Code Review** - Real-time AI-powered reviews
- **Test Generation** - Auto-generate tests for 4 frameworks

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAUDE IDE                            │
├─────────────────────────────────────────────────────────────┤
│  47 AI PACKAGES                                              │
│  ├─ Code Intelligence (9 packages)                          │
│  ├─ Chat & Communication (5 packages)                       │
│  ├─ Code Generation (6 packages)                            │
│  └─ Planning & Agents (2 packages)                          │
├─────────────────────────────────────────────────────────────┤
│  MODEL LAYER                                                 │
│  ├─ Anthropic (Claude 3, 3.5, Opus 4)                       │
│  ├─ OpenAI (GPT-4, GPT-4o, o1)                              │
│  ├─ Google (Gemini Pro, Ultra)                              │
│  └─ Local (Ollama, Llamafile)                               │
├─────────────────────────────────────────────────────────────┤
│  PLATFORM: Eclipse Theia 1.67.0 (113 packages)              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. AI Chat with MCP Apps
Interactive widgets embedded in chat responses - Git status, file browsers, data visualizations.

### 2. Multi-Model Architecture
Switch between Claude, GPT-4, Gemini, or local models. BYOK (Bring Your Own Key) supported.

### 3. AI-Powered Debugging
Automatic error analysis with root cause detection and fix suggestions.

### 4. Code Review
Real-time AI review with inline decorations and severity indicators.

### 5. Test Generation
Generate unit tests for Jest, Pytest, JUnit, and Go testing frameworks.

### 6. Autonomous Agent
Self-directing task execution with plan mode and tool use.

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/rocketlang/openclaude-ide.git

# Install dependencies
cd openclaude-ide
npm install

# Build browser application
npm run build:browser

# Start the IDE
npm run start:browser
# Opens at http://localhost:3000
```

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Platform | Eclipse Theia 1.67.0 |
| Editor | Monaco (same as VS Code) |
| Frontend | TypeScript, React 18 |
| Backend | Node.js, Express |
| DI | InversifyJS |
| Bundler | Webpack |

---

## Links

- **Repository**: https://github.com/rocketlang/openclaude-ide
- **Documentation Portal**: https://ankr.in/project/documents/
- **Eclipse Theia**: https://theia-ide.org

---

*OpenClaude IDE - ANKR Labs 2026*
