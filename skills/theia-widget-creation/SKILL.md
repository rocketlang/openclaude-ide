---
name: theia-widget-creation
description: Create new Theia widgets in the OpenClaude IDE using InversifyJS dependency injection, ReactWidget, WidgetFactory registration, and the contribution point pattern. Use this skill when adding any new panel, view, or UI component.
---

# Theia Widget Creation

Use this skill when you need to add a new panel, view, or sidebar widget to OpenClaude IDE. This covers the full lifecycle: widget class, DI registration, command wiring, and CSS.

## Architecture Context

OpenClaude IDE is built on Eclipse Theia 1.67.0. All custom UI lives in `packages/openclaude-integration/`. Widgets follow a strict pattern using InversifyJS dependency injection and Theia's `ReactWidget` base class.

## File Locations

All new widget code goes under `packages/openclaude-integration/src/browser/`:

```
packages/openclaude-integration/
  src/
    browser/
      <your-feature>/
        <feature>-widget.tsx          # The widget class
        <feature>-dialog.ts           # Optional dialog (if user input needed)
      style/
        <feature>.css                 # Widget styles
      openclaude-frontend-module.ts   # DI bindings (edit this)
      openclaude-frontend-contribution.ts  # Command registration (edit this)
    common/
      openclaude-protocol.ts          # Backend service interface (edit if new backend methods needed)
```

## Step 1: Create the Widget Class

Create `src/browser/<feature>/<feature>-widget.tsx`:

```typescript
import * as React from '@theia/core/shared/react';
import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core';
import { OpenClaudeBackendService } from '../../common/openclaude-protocol';

export const MY_FEATURE_WIDGET_ID = 'openclaude-my-feature';
export const MY_FEATURE_WIDGET_LABEL = 'My Feature';

@injectable()
export class MyFeatureWidget extends ReactWidget {

    static readonly ID = MY_FEATURE_WIDGET_ID;
    static readonly LABEL = MY_FEATURE_WIDGET_LABEL;

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    @postConstruct()
    protected init(): void {
        this.id = MyFeatureWidget.ID;
        this.title.label = MyFeatureWidget.LABEL;
        this.title.caption = MyFeatureWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-puzzle-piece'; // Font Awesome icon
        this.update();
    }

    protected render(): React.ReactNode {
        return (
            <div className='openclaude-my-feature'>
                <h3>My Feature</h3>
            </div>
        );
    }
}
```

### Key Rules

- Use `@injectable()` decorator on the class.
- Use `@inject()` with `!` (non-null assertion) for property injection. Never use constructor injection.
- Use `@postConstruct()` for initialization, not the constructor.
- Extend `ReactWidget` for React-based UI. Override `render()` returning `React.ReactNode`.
- Call `this.update()` to trigger re-render after state changes.
- Define `static readonly ID` and `static readonly LABEL` on the class.
- Import React from `@theia/core/shared/react`, not from `react` directly.

## Step 2: Register in the Frontend Module

Edit `src/browser/openclaude-frontend-module.ts`:

1. Add imports at the top:

```typescript
import { MyFeatureWidget } from './my-feature/my-feature-widget';
import '../../src/browser/style/my-feature.css';
```

2. Inside the `ContainerModule` callback, add the widget binding:

```typescript
// Register My Feature Widget
bind(MyFeatureWidget).toSelf();
bind(WidgetFactory).toDynamicValue(ctx => ({
    id: MyFeatureWidget.ID,
    createWidget: () => ctx.container.get<MyFeatureWidget>(MyFeatureWidget)
})).inSingletonScope();
```

### Binding Pattern Explained

- `bind(MyFeatureWidget).toSelf()` registers the class so InversifyJS can create it.
- `bind(WidgetFactory)` registers a factory that Theia's `WidgetManager` uses to create/retrieve the widget by ID.
- The factory must be `inSingletonScope()` so only one factory exists.
- The widget itself is NOT singleton-scoped (`.toSelf()` without `.inSingletonScope()`), allowing multiple instances if needed.

## Step 3: Add Commands

Edit `src/browser/openclaude-frontend-contribution.ts`:

1. Add the command definition in `OpenClaudeCommands` namespace:

```typescript
export const SHOW_MY_FEATURE: Command = {
    id: 'openclaude.showMyFeature',
    label: 'OpenClaude: Show My Feature'
};
```

2. Register the command handler inside `registerCommands()`:

```typescript
commands.registerCommand(OpenClaudeCommands.SHOW_MY_FEATURE, {
    execute: async () => {
        const widget = await this.widgetManager.getOrCreateWidget<MyFeatureWidget>(MyFeatureWidget.ID);
        widget.activate();
    }
});
```

### Command Naming Convention

- Command IDs: `openclaude.<verbNoun>` in camelCase (e.g., `openclaude.showMyFeature`)
- Command labels: `OpenClaude: <Action Description>` (e.g., `OpenClaude: Show My Feature`)

## Step 4: Create CSS

Create `src/browser/style/my-feature.css`:

```css
.openclaude-my-feature {
    padding: 12px;
    overflow-y: auto;
    height: 100%;
}

.openclaude-my-feature h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
}
```

### CSS Rules

- Prefix all classes with `openclaude-` to avoid global conflicts.
- Use `lower-case-with-dashes` format.
- Never define styles in TypeScript code; always use CSS classes.
- For colors, use Theia CSS variables: `var(--theia-editor-foreground)`, `var(--theia-widget-shadow)`, etc.
- Import the CSS file in `openclaude-frontend-module.ts`.

## Step 5: Add Backend Methods (if needed)

If the widget needs backend data, add the method signature to `src/common/openclaude-protocol.ts`:

```typescript
export interface OpenClaudeBackendService {
    // ... existing methods ...
    myFeatureMethod(options: MyFeatureOptions): Promise<MyFeatureResult>;
}
```

Then implement it in `src/node/openclaude-backend-client.ts`.

## Optional: Add a Dialog

If the feature needs user input before acting, create `src/browser/<feature>/<feature>-dialog.ts`:

```typescript
import { AbstractDialog } from '@theia/core/lib/browser/dialogs';

export class MyFeatureDialog extends AbstractDialog<MyFeatureInput> {
    // Dialog implementation
}
```

## Complete Checklist

- [ ] Widget class in `src/browser/<feature>/<feature>-widget.tsx`
- [ ] CSS in `src/browser/style/<feature>.css`
- [ ] CSS import in `openclaude-frontend-module.ts`
- [ ] Widget binding + WidgetFactory in `openclaude-frontend-module.ts`
- [ ] Command definition in `OpenClaudeCommands` namespace
- [ ] Command handler in `registerCommands()`
- [ ] Backend protocol types in `openclaude-protocol.ts` (if needed)
- [ ] Backend implementation in `openclaude-backend-client.ts` (if needed)
- [ ] Dialog class (if user input needed)
