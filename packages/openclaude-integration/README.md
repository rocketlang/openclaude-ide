# OpenClaude Integration for Theia IDE

[![NPM Version](https://img.shields.io/npm/v/@openclaude/integration.svg)](https://www.npmjs.com/package/@openclaude/integration)
[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4.5-blue.svg)](https://www.typescriptlang.org/)
[![Theia](https://img.shields.io/badge/Theia-1.67.0-purple.svg)](https://theia-ide.org/)

AI-powered features integration for Eclipse Theia IDE, powered by Anthropic's Claude.

## 🚀 Features

### AI-Powered Code Review
- Automatic code analysis with AI
- Real-time issue detection
- Intelligent suggestions
- Quick fix actions

### Smart Test Generation
- Auto-generate unit tests
- Support for Jest, Mocha, Vitest
- Coverage visualization
- Edge case detection

### AI Code Completion
- Context-aware suggestions
- Multi-line completions
- Learns from your codebase
- Customizable triggers

### Documentation Generator
- Auto-generate JSDoc/Markdown docs
- Keep documentation in sync
- Support for multiple formats

### Real-Time Collaboration
- Live cursor tracking
- Simultaneous editing
- Team chat integration
- Code comments and annotations

### Code Review Workflow
- Structured review process
- Multi-reviewer support
- Priority management
- Status tracking

### Team Dashboard
- Team productivity metrics
- Activity feed
- Member contributions
- Real-time updates

## 📦 Installation

### NPM
```bash
npm install @openclaude/integration
```

### Yarn
```bash
yarn add @openclaude/integration
```

## 🔧 Configuration

### 1. Add to your Theia application

In your Theia application's `package.json`:

```json
{
  "dependencies": {
    "@openclaude/integration": "^1.0.0"
  },
  "theiaExtensions": [
    {
      "frontend": "@openclaude/integration/lib/browser/openclaude-frontend-module",
      "backend": "@openclaude/integration/lib/node/openclaude-backend-module"
    }
  ]
}
```

### 2. Configure Claude API

Create a `.env` file or set environment variables:

```bash
OPENCLAUDE_API_KEY=your_anthropic_api_key
OPENCLAUDE_API_URL=https://api.anthropic.com
```

### 3. Build and run

```bash
npm install
npm run build
npm start
```

## 🎯 Usage

### Code Review

1. Open a file in the editor
2. Run command: `OpenClaude: Start Code Review`
3. Review AI-generated issues and suggestions
4. Apply fixes with one click

### Test Generation

1. Select code to test
2. Run command: `OpenClaude: Generate Tests`
3. Choose framework and coverage level
4. Review and accept generated tests

### AI Completion

1. Enable: `OpenClaude: Toggle AI Code Completions`
2. Start typing
3. Press `Tab` to accept suggestions

### Team Collaboration

1. Start session: `OpenClaude: Start Live Collaboration`
2. Share session ID with team
3. See real-time cursors and edits
4. Use chat and comments for communication

## 🎨 Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `openclaude.testConnection` | Test backend connection | - |
| `openclaude.startReview` | Start code review | `Ctrl+Shift+R` |
| `openclaude.generateTests` | Generate tests | `Ctrl+Shift+T` |
| `openclaude.toggleAICompletions` | Toggle AI completions | - |
| `openclaude.generateDocumentation` | Generate docs | `Ctrl+Shift+G` |
| `openclaude.showChat` | Show chat panel | `Ctrl+Shift+C` |
| `openclaude.addCodeComment` | Add code comment | `Ctrl+Shift+M` |
| `openclaude.startCollaboration` | Start collaboration | `Ctrl+Shift+L` |
| `openclaude.showTeamDashboard` | Show team dashboard | `Ctrl+Shift+D` |

## ⚙️ Settings

Configure OpenClaude in your Theia preferences:

```json
{
  "openclaude.apiKey": "your-api-key",
  "openclaude.apiUrl": "https://api.anthropic.com",
  "openclaude.codeReview.autoReview": false,
  "openclaude.completion.enabled": true,
  "openclaude.completion.delay": 300,
  "openclaude.documentation.format": "jsdoc",
  "openclaude.collaboration.enabled": true
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│         Frontend (Browser)          │
│  ┌──────────────────────────────┐  │
│  │   React Widgets & UI         │  │
│  │   - Code Review              │  │
│  │   - Test Generation          │  │
│  │   - Collaboration            │  │
│  │   - Team Dashboard           │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │   Monaco Providers           │  │
│  │   - AI Completion            │  │
│  │   - Code Actions             │  │
│  │   - Decorations              │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
              ↕️ WebSocket/RPC
┌─────────────────────────────────────┐
│          Backend (Node.js)          │
│  ┌──────────────────────────────┐  │
│  │   GraphQL Client             │  │
│  │   Business Logic             │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
              ↕️ GraphQL/HTTPS
┌─────────────────────────────────────┐
│      Anthropic Claude API           │
└─────────────────────────────────────┘
```

## 🧩 Extension Points

OpenClaude is highly extensible:

### Add Custom Widgets

```typescript
@injectable()
export class MyCustomWidget extends ReactWidget {
    static readonly ID = 'my-widget';

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    protected render(): React.ReactNode {
        return <div>My Custom Widget</div>;
    }
}
```

### Add Custom Commands

```typescript
commands.registerCommand({
    id: 'my.custom.command',
    label: 'My Custom Command'
}, {
    execute: async () => {
        // Your custom logic
    }
});
```

## 📊 Statistics

- **Lines of Code:** ~9,415
- **React Components:** 50+
- **GraphQL Methods:** 31
- **Commands:** 19
- **Widgets:** 8
- **Supported Languages:** All major languages
- **Test Frameworks:** Jest, Mocha, Vitest
- **Development Time:** 15 days

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) and [Code Wiki](../../CODE-WIKI.md).

### Development Setup

```bash
# Clone repository
git clone https://github.com/ankr-in/openclaude-ide.git
cd openclaude-ide

# Install dependencies
npm install

# Compile
npm run compile

# Start development
npm run watch
# In another terminal:
npm run start:browser
```

## 📚 Documentation

- **[User Manual](../../USER-MANUAL.md)** - Complete user guide
- **[Code Wiki](../../CODE-WIKI.md)** - Technical documentation
- **[Layman's Guide](../../LAYMAN-GUIDE.md)** - Non-technical overview
- **[API Reference](../../CODE-WIKI.md#api-reference)** - Complete API docs
- **[Future Enhancements](../../FUTURE-ENHANCEMENTS.md)** - Roadmap

## 🐛 Bug Reports

Found a bug? Please report it:

- **GitHub Issues:** https://github.com/ankr-in/openclaude-ide/issues
- **Email:** support@openclaude.io

## 💡 Feature Requests

Have an idea? We'd love to hear it:

- **GitHub Discussions:** https://github.com/ankr-in/openclaude-ide/discussions
- **Feedback Form:** https://openclaude.io/feedback

## 🔒 Security

Security issues? Please report privately:

- **Email:** security@openclaude.io
- **PGP Key:** https://openclaude.io/security.asc

## 📄 License

Proprietary License - Copyright © 2026 Ankr.in

See [LICENSE](./LICENSE) file for details.

## 🌟 Acknowledgments

Built with:
- [Eclipse Theia](https://theia-ide.org/) - Modern IDE framework
- [Anthropic Claude](https://www.anthropic.com/) - Best-in-class AI
- [React](https://reactjs.org/) - UI library
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [GraphQL](https://graphql.org/) - API protocol

## 📞 Support

- **Documentation:** https://docs.openclaude.io
- **Discord:** https://discord.gg/openclaude
- **Forum:** https://forum.openclaude.io
- **Email:** support@openclaude.io

## 🚀 Roadmap

### Q1 2026
- ✅ Core features complete
- ✅ AI features complete
- ✅ Collaboration features complete
- Keyboard shortcuts customization
- Git integration enhancements

### Q2 2026
- AI debugging assistant
- Multi-model AI support
- Performance profiler
- Offline mode

### Q3 2026
- Plugin marketplace
- Mobile companion app
- Visual programming interface

See [Future Enhancements](../../FUTURE-ENHANCEMENTS.md) for complete roadmap.

---

**Made with ❤️ by Ankr.in**

**Star us on GitHub:** ⭐ https://github.com/ankr-in/openclaude-ide

**Follow us on Twitter:** [@openclaude](https://twitter.com/openclaude)

**Join our Discord:** https://discord.gg/openclaude
