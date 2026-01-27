# OpenClaude IDE - Getting Started Guide

Welcome to OpenClaude IDE, an AI-powered IDE built on Eclipse Theia, designed for Indian developers.

## Prerequisites

- **Node.js**: v18.17.0 or higher (but < v21)
- **npm**: v9 or higher
- **Python**: v3.x (for native module compilation)
- **Git**: Latest version
- **C++ Build Tools**: For native module compilation
  - **Linux**: `build-essential`
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/AcmeSoftwareLLC/openclaude-ide.git
cd openclaude-ide
```

### 2. Install Dependencies

```bash
npm install
```

This will install all dependencies and run necessary post-install hooks.

### 3. Build the IDE

```bash
# Development build
npm run build:browser

# Production build
npm run build:browser:production
```

### 4. Start the IDE

```bash
npm run start:browser
```

The IDE will be available at `http://localhost:3000`.

## Development Workflow

### Watch Mode

For active development, use watch mode:

```bash
npm run watch
```

This will:
- Watch TypeScript files for changes
- Automatically recompile on changes
- Rebuild the browser bundle

### Running Tests

```bash
# Run all tests
npm run test

# Run tests for a specific package
npx lerna run test --scope @theia/ai-memory
```

### Linting

```bash
npm run lint
```

## Project Structure

```
openclaude-ide/
├── packages/                    # Runtime packages
│   ├── ai-code-intelligence/   # Code analysis & AI actions
│   ├── ai-memory/              # Memory & learning services
│   ├── integration/            # OpenClaude integrations
│   └── ...                     # Theia packages
├── dev-packages/               # Development tools
├── examples/
│   └── browser/                # Browser application
├── plugins/                    # VS Code plugins
├── docs/                       # Documentation
└── configs/                    # Shared configurations
```

## Configuration

### AI Provider Setup

1. **Anthropic Claude** (Recommended)

   Set your API key in preferences or environment:
   ```bash
   export ANTHROPIC_API_KEY=your-api-key
   ```

   Or in the IDE: `Preferences > AI > Anthropic > API Key`

2. **OpenAI**
   ```bash
   export OPENAI_API_KEY=your-api-key
   ```

3. **Local Models (Ollama)**
   ```bash
   # Start Ollama
   ollama serve

   # Pull a model
   ollama pull codellama
   ```

### Default Preferences

The IDE comes with sensible defaults configured in `examples/browser/package.json`:

```json
{
  "preferences": {
    "ai.anthropic.model": "claude-opus-4",
    "ai.anthropic.enabled": true,
    "editor.fontSize": 14,
    "editor.fontFamily": "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace",
    "editor.fontLigatures": true
  }
}
```

## Creating a New Package

### 1. Create Package Directory

```bash
mkdir -p packages/my-package/src/{common,browser,node}
```

### 2. Create package.json

```json
{
    "name": "@theia/my-package",
    "version": "1.67.0",
    "description": "My Theia Package",
    "main": "lib/common/index.js",
    "typings": "lib/common/index.d.ts",
    "dependencies": {
        "@theia/core": "1.67.0",
        "tslib": "^2.8.1"
    },
    "theiaExtensions": [
        {
            "frontend": "lib/browser/my-package-frontend-module"
        }
    ]
}
```

### 3. Create tsconfig.json

```json
{
    "extends": "../../configs/base.tsconfig.json",
    "compilerOptions": {
        "rootDir": "src",
        "outDir": "lib"
    },
    "include": ["src"]
}
```

### 4. Create Frontend Module

```typescript
// src/browser/my-package-frontend-module.ts
import { ContainerModule } from '@theia/core/shared/inversify';
import { MyService, MyServiceImpl } from './my-service';

export default new ContainerModule(bind => {
    bind(MyServiceImpl).toSelf().inSingletonScope();
    bind(MyService).toService(MyServiceImpl);
});
```

### 5. Add to Application

Add to `examples/browser/package.json`:

```json
{
    "dependencies": {
        "@theia/my-package": "1.67.0"
    }
}
```

## AI Features Development

### Using AI Memory

```typescript
import { inject, injectable } from '@theia/core/shared/inversify';
import { MemoryService, MemoryEntryType } from '@theia/ai-memory';

@injectable()
export class MyFeature {
    @inject(MemoryService)
    protected readonly memoryService: MemoryService;

    async storeKnowledge(): Promise<void> {
        await this.memoryService.store({
            type: MemoryEntryType.CodePattern,
            timestamp: Date.now(),
            importance: 0.8,
            // ... additional fields
        });
    }
}
```

### Using Code Intelligence

```typescript
import { inject, injectable } from '@theia/core/shared/inversify';
import { SemanticContextService } from '@theia/ai-code-intelligence';

@injectable()
export class MyFeature {
    @inject(SemanticContextService)
    protected readonly contextService: SemanticContextService;

    async analyzeCode(): Promise<void> {
        const context = await this.contextService.getCurrentContext();
        console.log('Current file:', context?.fileUri);
        console.log('Symbols:', context?.visibleSymbols);
    }
}
```

## Debugging

### Browser DevTools

1. Start the IDE in debug mode:
   ```bash
   npm run start:browser:debug
   ```

2. Open Chrome DevTools (F12)

3. Use the Sources tab to set breakpoints

### VS Code Debugging

1. Open the project in VS Code

2. Use the provided launch configurations in `.vscode/launch.json`

3. Set breakpoints in TypeScript source files

4. Press F5 to start debugging

### Logging

```typescript
import { ILogger } from '@theia/core';

@injectable()
export class MyService {
    @inject(ILogger)
    protected readonly logger: ILogger;

    async doSomething(): Promise<void> {
        this.logger.info('Starting operation...');
        this.logger.debug('Debug details:', { data });
        this.logger.error('Something went wrong', error);
    }
}
```

## Common Issues

### Build Errors

**Problem**: Native module compilation fails
```bash
# Clear node_modules and rebuild
rm -rf node_modules
npm install
```

**Problem**: TypeScript errors
```bash
# Clean and rebuild
npm run clean
npm run compile
```

### Runtime Errors

**Problem**: Module not found
- Ensure the package is added to application dependencies
- Run `npm install` again
- Check `theiaExtensions` in package.json

**Problem**: Service not available
- Verify the service is bound in the container module
- Check the service is exported from index.ts
- Ensure @injectable() decorator is present

## Resources

- [Theia Documentation](https://theia-ide.org/docs/)
- [InversifyJS Guide](https://inversify.io/)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)
- [Anthropic API Docs](https://docs.anthropic.com/)

## Community

- GitHub Issues: Report bugs and request features
- Discussions: Ask questions and share ideas

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
