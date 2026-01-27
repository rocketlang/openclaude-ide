# OpenClaude IDE - Code Wiki

Complete technical documentation for developers who want to understand, modify, or extend OpenClaude IDE.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Data Flow](#data-flow)
5. [API Reference](#api-reference)
6. [Extension Points](#extension-points)
7. [Development Setup](#development-setup)
8. [Contributing](#contributing)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Browser)                    │
│  ┌──────────────┬──────────────┬─────────────────────┐ │
│  │   Monaco     │    Theia     │   React Widgets     │ │
│  │   Editor     │   Framework  │   (UI Components)   │ │
│  └──────────────┴──────────────┴─────────────────────┘ │
│  ┌───────────────────────────────────────────────────┐  │
│  │        OpenClaude Integration Layer               │  │
│  │  - Widget Managers                                │  │
│  │  - Command Handlers                               │  │
│  │  - Service Proxies                                │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕️ WebSocket/RPC
┌─────────────────────────────────────────────────────────┐
│                   Backend (Node.js)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │         OpenClaude Backend Service                │  │
│  │  - GraphQL Client                                 │  │
│  │  - Business Logic                                 │  │
│  │  - State Management                               │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕️ HTTP/GraphQL
┌─────────────────────────────────────────────────────────┐
│              External AI Service (Claude)                │
│                   Anthropic API                          │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- **Framework:** Eclipse Theia 1.67.0
- **UI Library:** React 18.2.0
- **Editor:** Monaco Editor (VS Code's editor)
- **Language:** TypeScript 5.4.5
- **DI Container:** InversifyJS
- **Build:** Webpack 5
- **Styling:** CSS with Theia theming variables

**Backend:**
- **Runtime:** Node.js 20+
- **API Client:** GraphQL Request 7.0
- **Protocol:** GraphQL over HTTP/WebSocket
- **Dependency Injection:** InversifyJS

**Communication:**
- **Frontend ↔ Backend:** JSON-RPC over WebSocket
- **Backend ↔ AI:** GraphQL over HTTPS

---

## Project Structure

```
openclaude-ide/
├── packages/
│   └── openclaude-integration/          # Main package
│       ├── src/
│       │   ├── browser/                 # Frontend code
│       │   │   ├── chat/                # Chat widget
│       │   │   ├── code-comments/       # Code comments widget
│       │   │   ├── code-review/         # Code review widget
│       │   │   ├── code-review-workflow/# Review workflow widget
│       │   │   ├── collaboration/       # Live collaboration
│       │   │   ├── completion/          # AI completion
│       │   │   ├── documentation/       # Documentation generator
│       │   │   ├── test-generation/     # Test generation
│       │   │   ├── team-dashboard/      # Team dashboard
│       │   │   ├── style/               # CSS stylesheets
│       │   │   ├── openclaude-frontend-contribution.ts  # Commands
│       │   │   ├── openclaude-frontend-module.ts        # DI config
│       │   │   └── openclaude-preferences.ts            # Settings
│       │   ├── common/                  # Shared code
│       │   │   ├── openclaude-protocol.ts  # API protocol
│       │   │   └── openclaude-types.ts     # Type definitions
│       │   └── node/                    # Backend code
│       │       ├── openclaude-backend-module.ts   # DI config
│       │       └── openclaude-backend-client.ts   # GraphQL client
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
├── examples/
│   └── browser/                         # Browser example app
└── node_modules/

File Count: 38+ files
Total LOC: ~9,415 lines of code
```

### Key Directories Explained

**`src/browser/`** - Frontend code that runs in the browser
- Each feature has its own subdirectory
- Contains React widgets, UI components, providers
- Uses Monaco Editor APIs for code editing

**`src/common/`** - Shared code between frontend and backend
- Protocol definitions (interfaces, types)
- No platform-specific code (no DOM, no Node APIs)

**`src/node/`** - Backend code that runs in Node.js
- GraphQL client implementation
- Business logic
- State management

**`src/browser/style/`** - CSS stylesheets
- One file per feature
- Uses Theia CSS variables for theming
- Follows BEM naming convention

---

## Core Components

### 1. Frontend Contribution

**File:** `openclaude-frontend-contribution.ts`

Registers commands that users can execute:

```typescript
@injectable()
export class OpenClaudeFrontendContribution implements CommandContribution {
    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(OpenClaudeCommands.START_REVIEW, {
            execute: async () => {
                // Command implementation
            }
        });
    }
}
```

**Commands (19 total):**
- Test connection
- Start code review
- Generate tests
- Toggle AI completions
- Generate documentation
- Show chat
- Add code comment
- Start collaboration
- Create review request
- Show team dashboard
- ...and more

### 2. Frontend Module

**File:** `openclaude-frontend-module.ts`

Configures dependency injection:

```typescript
export default new ContainerModule(bind => {
    // Bind backend service
    bind(OpenClaudeBackendService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<OpenClaudeBackendService>(OPENCLAUDE_BACKEND_PATH);
    }).inSingletonScope();

    // Register widgets
    bind(CodeReviewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: CodeReviewWidget.ID,
        createWidget: () => ctx.container.get<CodeReviewWidget>(CodeReviewWidget)
    })).inSingletonScope();
});
```

### 3. Backend Service

**File:** `openclaude-backend-client.ts`

Implements GraphQL communication:

```typescript
@injectable()
export class OpenClaudeBackendClient implements OpenClaudeBackendService {
    protected client: GraphQLClient;

    async startReview(filePath: string): Promise<CodeReview> {
        const mutation = gql`
            mutation StartReview($filePath: String!) {
                startReview(filePath: $filePath) {
                    id
                    status
                    issues { ... }
                }
            }
        `;
        const result = await this.client.request<{ startReview: any }>(mutation, { filePath });
        return result.startReview;
    }
}
```

### 4. React Widgets

**Example:** `code-review-widget.tsx`

Theia widgets using React:

```typescript
@injectable()
export class CodeReviewWidget extends ReactWidget {
    static readonly ID = 'openclaude-code-review';
    static readonly LABEL = 'Code Review';

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @postConstruct()
    protected init(): void {
        this.id = CodeReviewWidget.ID;
        this.title.label = CodeReviewWidget.LABEL;
        this.title.closable = true;
        this.update();
    }

    protected render(): React.ReactNode {
        return <div>...</div>;
    }
}
```

### 5. Monaco Providers

**Example:** `ai-completion-provider.ts`

Monaco editor integrations:

```typescript
@injectable()
export class AICompletionProvider implements monaco.languages.CompletionItemProvider {
    async provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.CompletionContext
    ): Promise<monaco.languages.CompletionList> {
        // Get AI suggestions
        const suggestions = await this.backendService.getCompletions(...);
        
        // Convert to Monaco completion items
        return {
            suggestions: suggestions.map(s => ({
                label: s.label,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: s.code,
                ...
            }))
        };
    }
}
```

---

## Data Flow

### Command Execution Flow

```
User Action (e.g., "Generate Tests")
    ↓
Command Registry (Theia)
    ↓
OpenClaudeFrontendContribution.execute()
    ↓
Widget Manager (creates/shows widget)
    ↓
Widget calls backendService.generateTests()
    ↓
WebSocket RPC call to backend
    ↓
OpenClaudeBackendClient.generateTests()
    ↓
GraphQL mutation to AI service
    ↓
AI processes request
    ↓
Response flows back through same chain
    ↓
Widget updates UI with results
    ↓
User sees results
```

### Real-Time Collaboration Flow

```
User types in editor
    ↓
Cursor position changes
    ↓
CursorDecoratorProvider detects change
    ↓
Calls backendService.updateCursorPosition()
    ↓
Backend broadcasts to all collaborators
    ↓
Other clients receive cursor update via WebSocket
    ↓
CursorDecoratorProvider renders remote cursor
    ↓
Cursor appears in other users' editors
```

---

## API Reference

### OpenClaudeBackendService Interface

**Location:** `src/common/openclaude-protocol.ts`

```typescript
export interface OpenClaudeBackendService {
    // Connection
    ping(): Promise<string>;
    status(): Promise<BackendStatus>;
    
    // Code Review
    startReview(filePath: string): Promise<CodeReview>;
    getReview(reviewId: string): Promise<CodeReview>;
    
    // Test Generation
    generateTests(request: TestGenerationRequest): Promise<TestGeneration>;
    
    // Documentation
    generateDocumentation(request: DocumentationRequest): Promise<Documentation>;
    
    // AI Completion
    getCompletions(request: CompletionRequest): Promise<CompletionItem[]>;
    
    // Chat
    sendChatMessage(sessionId: string, message: string): Promise<ChatMessage>;
    getChatMessages(sessionId: string): Promise<ChatMessage[]>;
    
    // Code Comments
    addCodeComment(comment: CodeCommentInput): Promise<CodeComment>;
    getCodeComments(fileUri: string): Promise<CodeComment[]>;
    
    // Collaboration
    joinCollaborationSession(filePath: string): Promise<CollaborationSession>;
    updateCursorPosition(sessionId: string, position: CursorPosition): Promise<void>;
    
    // Review Workflow
    createReviewRequest(request: ReviewRequest): Promise<CodeReviewWorkflow>;
    getReviews(filters?: ReviewFilters): Promise<CodeReviewWorkflow[]>;
    
    // Team Dashboard
    getTeamDashboard(): Promise<TeamDashboard>;
    getTeamActivity(limit?: number): Promise<TeamActivity[]>;
}
```

### Type Definitions

**Code Review Types:**
```typescript
interface CodeReview {
    id: string;
    filePath: string;
    status: 'pending' | 'completed' | 'error';
    issues: CodeIssue[];
    suggestions: CodeSuggestion[];
    timestamp: number;
}

interface CodeIssue {
    id: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    line: number;
    column: number;
}
```

**Test Generation Types:**
```typescript
interface TestGenerationRequest {
    filePath: string;
    framework: 'jest' | 'mocha' | 'vitest';
    coverage: 'basic' | 'comprehensive' | 'edge-cases';
}

interface TestGeneration {
    id: string;
    tests: GeneratedTest[];
    coverage: CoverageReport;
}
```

**Collaboration Types:**
```typescript
interface CollaborationSession {
    id: string;
    filePath: string;
    collaborators: Collaborator[];
    startedAt: number;
}

interface Collaborator {
    user: ChatUser;
    cursor: CursorPosition;
    selection?: SelectionRange;
    lastActivity: number;
    color: string;
}
```

---

## Extension Points

### Adding a New Widget

1. **Create widget file:**
```typescript
// src/browser/my-feature/my-widget.tsx
@injectable()
export class MyWidget extends ReactWidget {
    static readonly ID = 'openclaude-my-widget';
    static readonly LABEL = 'My Feature';
    
    protected render(): React.ReactNode {
        return <div>My Widget Content</div>;
    }
}
```

2. **Register in module:**
```typescript
// src/browser/openclaude-frontend-module.ts
bind(MyWidget).toSelf();
bind(WidgetFactory).toDynamicValue(ctx => ({
    id: MyWidget.ID,
    createWidget: () => ctx.container.get<MyWidget>(MyWidget)
})).inSingletonScope();
```

3. **Add command:**
```typescript
// src/browser/openclaude-frontend-contribution.ts
export const SHOW_MY_WIDGET: Command = {
    id: 'openclaude.showMyWidget',
    label: 'OpenClaude: Show My Widget'
};

commands.registerCommand(SHOW_MY_WIDGET, {
    execute: async () => {
        const widget = await this.widgetManager.getOrCreateWidget<MyWidget>(MyWidget.ID);
        widget.activate();
    }
});
```

### Adding a New Backend Method

1. **Extend protocol:**
```typescript
// src/common/openclaude-protocol.ts
export interface OpenClaudeBackendService {
    myNewMethod(param: string): Promise<Result>;
}
```

2. **Implement in client:**
```typescript
// src/node/openclaude-backend-client.ts
async myNewMethod(param: string): Promise<Result> {
    const query = gql`
        query MyQuery($param: String!) {
            myQuery(param: $param) {
                field1
                field2
            }
        }
    `;
    const result = await this.client.request<{ myQuery: any }>(query, { param });
    return result.myQuery;
}
```

### Adding a Monaco Provider

```typescript
// src/browser/my-feature/my-provider.ts
@injectable()
export class MyProvider implements monaco.languages.SomeProvider {
    @inject(MonacoTextModelService)
    protected readonly modelService!: MonacoTextModelService;

    provide...() {
        // Implementation
    }
}

// Register in module
bind(MyProvider).toSelf().inSingletonScope();
// Register with Monaco in @postConstruct of contribution
```

---

## Development Setup

### Prerequisites

```bash
# Required
node >= 18.17.0, < 21
npm >= 9.0.0
git

# Recommended
Visual Studio Code or any code editor
Chrome/Firefox (for debugging)
```

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/openclaude-ide.git
cd openclaude-ide

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Start development server
npm run start:browser
```

### Development Workflow

```bash
# Watch mode (auto-compile on changes)
npm run watch

# In another terminal, start browser
npm run start:browser

# The IDE will be available at http://localhost:3000
```

### Building for Production

```bash
# Clean previous builds
npm run clean

# Build all packages
npm run build:browser

# Output will be in examples/browser/dist/
```

### Running Tests

```bash
# Run all tests
npm run test

# Run tests for specific package
npx lerna run test --scope @openclaude/integration

# Run tests in watch mode
npm run test:watch
```

---

## Architecture Patterns

### Dependency Injection Pattern

All services use InversifyJS for DI:

```typescript
@injectable()
export class MyService {
    @inject(SomeDependency)
    protected readonly dependency!: SomeDependency;

    @postConstruct()
    protected init(): void {
        // Initialize after all dependencies injected
    }
}
```

### Widget Pattern

Widgets are the primary UI components:

```typescript
@injectable()
export class MyWidget extends ReactWidget {
    // Widget ID (must be unique)
    static readonly ID = 'my-widget';
    
    // Widget label (shown in UI)
    static readonly LABEL = 'My Widget';
    
    // React render method
    protected render(): React.ReactNode {
        return <div>...</div>;
    }
    
    // Lifecycle methods
    protected onActivateRequest(): void { }
    protected onCloseRequest(): void { }
    dispose(): void { }
}
```

### Command Pattern

Commands are user-executable actions:

```typescript
export namespace MyCommands {
    export const DO_SOMETHING: Command = {
        id: 'my.doSomething',
        label: 'Do Something',
        iconClass: 'fa fa-icon'
    };
}

// Registration
commands.registerCommand(MyCommands.DO_SOMETHING, {
    execute: () => {
        // Execute command
    },
    isEnabled: () => true,
    isVisible: () => true
});
```

### Provider Pattern

Providers extend Monaco editor functionality:

```typescript
@injectable()
export class MyCompletionProvider implements monaco.languages.CompletionItemProvider {
    provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.CompletionContext
    ): Promise<monaco.languages.CompletionList> {
        // Return completion suggestions
    }
}

// Register
monaco.languages.registerCompletionItemProvider('typescript', provider);
```

---

## Coding Guidelines

### TypeScript Style

```typescript
// Use PascalCase for types/classes
export class MyService { }
export interface MyInterface { }

// Use camelCase for functions/variables
export function doSomething() { }
const myVariable = 123;

// Use arrow functions
const handler = () => { };

// Explicit return types
function getData(): Promise<Data> {
    return ...;
}

// Prefer property injection
@injectable()
export class MyClass {
    @inject(Dependency)
    protected readonly dep!: Dependency;  // NOT constructor injection
}
```

### React Guidelines

```typescript
// Don't bind in render
class MyWidget extends ReactWidget {
    // Bad
    render() {
        return <button onClick={this.handler.bind(this)} />;
    }
    
    // Good
    protected handler = () => { };
    render() {
        return <button onClick={this.handler} />;
    }
}
```

### CSS Guidelines

```css
/* Use Theia variables for theming */
.my-widget {
    background: var(--theia-editor-background);
    color: var(--theia-editor-foreground);
    border: 1px solid var(--theia-panel-border);
}

/* Use BEM naming */
.my-widget__header { }
.my-widget__header--active { }

/* Prefix with openclaude */
.openclaude-code-review { }
```

---

## Debugging

### Frontend Debugging

```typescript
// Add console logs
console.log('[OpenClaude] Debug info:', data);

// Use Chrome DevTools
// Open browser console (F12)
// Set breakpoints in Sources tab
// Inspect React components with React DevTools
```

### Backend Debugging

```typescript
// Add console logs in backend
console.log('[OpenClaude Backend] Request:', request);

// Use Node.js debugger
// Add "debugger;" statement
// Run with --inspect flag
node --inspect dist/backend.js
```

### Network Debugging

```bash
# Monitor WebSocket traffic
# Open DevTools -> Network -> WS tab
# See all RPC messages

# Monitor GraphQL requests
# Open DevTools -> Network -> XHR tab
# See all API calls
```

---

## Performance Optimization

### Widget Performance

```typescript
// Lazy load widgets
bind(WidgetFactory).toDynamicValue(ctx => ({
    id: MyWidget.ID,
    createWidget: () => {
        // Widget created only when needed
        return ctx.container.get<MyWidget>(MyWidget);
    }
}));

// Debounce frequent updates
protected updateDebounced = debounce(() => {
    this.update();
}, 300);
```

### API Performance

```typescript
// Cache responses
protected cache = new Map<string, Result>();

async getData(key: string): Promise<Result> {
    if (this.cache.has(key)) {
        return this.cache.get(key)!;
    }
    const result = await this.fetchData(key);
    this.cache.set(key, result);
    return result;
}

// Batch requests
protected requestQueue: Request[] = [];

async request(req: Request): Promise<Result> {
    this.requestQueue.push(req);
    if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.processBatch(), 100);
    }
}
```

---

## Security Considerations

### Input Validation

```typescript
// Validate all user inputs
function validateFilePath(path: string): boolean {
    // Prevent path traversal
    if (path.includes('..')) return false;
    // Validate format
    if (!/^[a-zA-Z0-9\/\-_.]+$/.test(path)) return false;
    return true;
}
```

### API Key Management

```typescript
// Never hardcode API keys
// Use environment variables
const apiKey = process.env.OPENCLAUDE_API_KEY;

// Store securely in backend only
// Never send to frontend
```

### XSS Prevention

```typescript
// Sanitize HTML
import DOMPurify from 'dompurify';

const sanitized = DOMPurify.sanitize(userInput);

// Use React (auto-escapes)
return <div>{userInput}</div>;  // Safe
```

---

## Common Pitfalls

### 1. Missing @postConstruct

```typescript
// Bad - dependencies not ready in constructor
constructor(@inject(Dep) dep: Dep) {
    dep.doSomething();  // May fail!
}

// Good - use @postConstruct
@postConstruct()
protected init(): void {
    this.dep.doSomething();  // Safe!
}
```

### 2. Forgetting inSingletonScope

```typescript
// Bad - new instance on each injection
bind(MyService).toSelf();

// Good - singleton
bind(MyService).toSelf().inSingletonScope();
```

### 3. Not Cleaning Up

```typescript
// Bad - memory leak
protected startPolling(): void {
    setInterval(() => this.poll(), 1000);
}

// Good - cleanup
protected interval?: number;

protected startPolling(): void {
    this.interval = window.setInterval(() => this.poll(), 1000);
}

dispose(): void {
    if (this.interval) {
        window.clearInterval(this.interval);
    }
    super.dispose();
}
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Code of Conduct
- Pull Request Process
- Issue Reporting
- Development Workflow
- Testing Requirements

---

**Last Updated:** January 24, 2026
**Version:** 1.0.0
**Maintainer:** Ankr.in Development Team
