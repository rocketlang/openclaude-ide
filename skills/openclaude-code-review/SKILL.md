---
name: openclaude-code-review
description: Standards for reviewing and writing code in the OpenClaude IDE repository. Covers InversifyJS patterns, naming conventions, Theia-specific rules, testing expectations, and common pitfalls.
---

# OpenClaude Code Review Standards

Use this skill when reviewing pull requests, writing new code, or checking existing code against project standards. These rules are derived from the Theia coding guidelines and OpenClaude-specific conventions.

## Dependency Injection Rules

### Use Property Injection, Never Constructor Injection

```typescript
// CORRECT
@injectable()
export class MyService {
    @inject(MessageService)
    protected readonly messageService!: MessageService;
}

// WRONG - adding constructor params is a breaking change
@injectable()
export class MyService {
    constructor(@inject(MessageService) private messageService: MessageService) {}
}
```

### Use @postConstruct for Initialization

```typescript
// CORRECT
@postConstruct()
protected init(): void {
    this.shell.activeChanged.connect(() => this.doSomething());
}

// WRONG - constructor can't access injected properties
constructor() {
    this.shell.activeChanged.connect(() => this.doSomething()); // shell is undefined!
}
```

### Singleton Scope for Shared Services

```typescript
// CORRECT
bind(CommandContribution).to(MyContribution).inSingletonScope();

// WRONG - creates new instance on every injection
bind(CommandContribution).to(MyContribution);
```

### WidgetFactory Must Be Singleton, Widget Must Not

```typescript
// CORRECT
bind(MyWidget).toSelf();  // NOT singleton - allows multiple instances
bind(WidgetFactory).toDynamicValue(ctx => ({
    id: MyWidget.ID,
    createWidget: () => ctx.container.get<MyWidget>(MyWidget)
})).inSingletonScope();  // Factory IS singleton
```

## Naming Conventions

### Files

- `lower-case-with-dashes.ts` (kebab-case)
- File name matches main exported type: `code-review-widget.tsx` exports `CodeReviewWidget`
- One large class per file

### Types and Variables

- **PascalCase:** Types, interfaces, enums, classes, enum values
- **camelCase:** Functions, methods, properties, local variables
- Use whole words: `terminalWidgetId` not `termWdgId`
- No `I` prefix on interfaces: `BackendService` not `IBackendService`

### Commands

- ID: `openclaude.<verbNoun>` — e.g., `openclaude.startReview`
- Label: `OpenClaude: <Description>` — e.g., `OpenClaude: Start Code Review`

### CSS Classes

- Prefix with `openclaude-`: e.g., `openclaude-review-header`
- Use `lower-case-with-dashes`
- Never define inline styles in TypeScript

### Backend Protocol Methods

- Start/create operations: `startCodeReview()`, `generateTests()`, `createReviewRequest()`
- Retrieve operations: `getCodeReview()`, `getTestGeneration()`
- Update operations: `updateReviewStatus()`, `resolveComment()`
- All return `Promise<T>`
- RPC methods (if using Main/Ext pattern) must start with `$`

## TypeScript Rules

### General

- 4 spaces indentation, single quotes
- Use `undefined`, never `null`
- Arrow functions preferred
- Explicit return types required on all public/protected methods
- Use `readonly` on injected properties

### Imports

- Import React from `@theia/core/shared/react`, not `react`
- Import InversifyJS from `@theia/core/shared/inversify`, not `inversify`
- Never import from `/src/` paths in runtime code; use `/lib/` paths
- Organize imports (no unused imports)

### Platform Boundaries

- `common/` code must not import from `browser/` or `node/`
- `browser/` code must not import from `node/`
- `node/` code must not import from `browser/`
- Use URIs between frontend and backend, never raw file paths

## React Widget Rules

### Event Handlers

```typescript
// CORRECT - arrow function property
protected onClickDiv = (): void => {
    // can access `this`
}
render(): React.ReactNode {
    return <div onClick={this.onClickDiv} />;
}

// WRONG - creates new function on each render
render(): React.ReactNode {
    return <div onClick={() => this.doStuff()} />;
}

// WRONG - bind in render
render(): React.ReactNode {
    return <div onClick={this.doStuff.bind(this)} />;
}
```

### State Management

- Use class properties for state (not React `useState`)
- Call `this.update()` after state changes to trigger re-render
- Never directly manipulate DOM; use React's `render()` method

### Widget Lifecycle

1. InversifyJS creates widget via `WidgetFactory`
2. `@postConstruct()` `init()` runs — set `id`, `title`, call `update()`
3. `render()` called — return React elements
4. State changes -> set properties -> call `this.update()` -> `render()` called again
5. User closes widget -> `dispose()` called

## Testing Expectations

### File Naming

- Unit tests: `*.spec.ts`
- UI tests: `*.ui-spec.ts`
- Slow/integration tests: `*.slow-spec.ts`

### Test Helpers

- Place mocks and fixtures in `test/test-helper.ts` within the package
- Place test resources in `test-resources/` directory

### Running Tests

```bash
# All tests
npm run test

# Specific package
npx lerna run test --scope @ankr/openclaude
```

## Common Review Pitfalls

### 1. Missing `inSingletonScope()`

Services bound without singleton scope create a new instance per injection. This is almost always a bug for services.

### 2. Hardcoded Colors

Never use hardcoded hex/rgb values in CSS. Use Theia variables:

```css
/* WRONG */
color: #ffffff;

/* CORRECT */
color: var(--theia-editor-foreground);
```

### 3. Not Calling `this.update()`

After changing widget state, you must call `this.update()` or the UI won't re-render.

### 4. Importing from Wrong Platform

Importing a `browser/` module from `node/` code will compile but crash at runtime since DOM APIs aren't available.

### 5. Using `null` Instead of `undefined`

The codebase convention is `undefined`. Use `?` for optional fields, not `| null`.

### 6. Functions Instead of Classes

Don't export standalone functions. Wrap them in injectable classes so they can be overridden:

```typescript
// WRONG
export function createWebSocket(url: string): WebSocket { ... }

// CORRECT
@injectable()
export class WebSocketProvider {
    protected createWebSocket(url: string): WebSocket { ... }
}
```

### 7. Multi-inject

Don't use `@multiInject()`. Use Theia's `ContributionProvider` instead.

## PR Checklist

- [ ] Property injection (not constructor)
- [ ] `@postConstruct()` for initialization
- [ ] `inSingletonScope()` on services
- [ ] kebab-case file names matching exported type
- [ ] `openclaude-` prefix on CSS classes
- [ ] Theia CSS variables for colors
- [ ] Arrow function properties for React event handlers
- [ ] `this.update()` called after state changes
- [ ] No `null` usage (use `undefined`)
- [ ] Explicit return types on public/protected methods
- [ ] No cross-platform imports (browser <-> node)
- [ ] URIs for file paths in cross-process communication
- [ ] Tests added for new logic
