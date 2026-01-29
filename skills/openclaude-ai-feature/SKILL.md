---
name: openclaude-ai-feature
description: Add a new AI-powered feature to OpenClaude IDE, covering the full pipeline from GraphQL backend service method through to a frontend widget with loading states, polling, and result display.
---

# Adding an AI-Powered Feature to OpenClaude

Use this skill when adding a new AI capability (code analysis, generation, suggestions, etc.) that requires backend AI processing and frontend result display.

## Pipeline Overview

Every AI feature follows this flow:

```
User triggers command
  -> Frontend sends request to backend via WebSocket RPC
  -> Backend calls AI service (GraphQL -> Claude API)
  -> Backend returns job ID with status "pending"
  -> Frontend polls for completion
  -> Frontend displays results in widget
```

## Step 1: Define Types in the Protocol

Edit `packages/openclaude-integration/src/common/openclaude-protocol.ts`.

Add your feature's request options, result type, and any sub-types:

```typescript
/**
 * Options for my AI feature
 */
export interface MyAIFeatureOptions {
    /** File path to analyze */
    filePath: string;
    /** File content */
    content: string;
    /** Feature-specific settings */
    mode: 'basic' | 'advanced';
}

/**
 * Result from my AI feature
 */
export interface MyAIFeatureResult {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    options: MyAIFeatureOptions;
    output?: MyAIOutput[];
    error?: string;
}

/**
 * Individual output item
 */
export interface MyAIOutput {
    label: string;
    content: string;
    confidence?: number;
}
```

### Type Conventions

- Always include `id` and `status` fields on result types (needed for polling).
- Status values: `'pending' | 'in_progress' | 'completed' | 'failed'`.
- Use `undefined` not `null`. Mark optional fields with `?`.
- Include an `error?: string` field on results.
- Use JSDoc comments on all interfaces and fields.

## Step 2: Add Backend Service Methods

Still in `openclaude-protocol.ts`, add methods to the `OpenClaudeBackendService` interface:

```typescript
export interface OpenClaudeBackendService {
    // ... existing methods ...

    /**
     * Start my AI feature processing
     */
    startMyAIFeature(options: MyAIFeatureOptions): Promise<MyAIFeatureResult>;

    /**
     * Get my AI feature result by ID
     */
    getMyAIFeatureResult(id: string): Promise<MyAIFeatureResult>;
}
```

### Method Naming

- Start method: `start<Feature>` or `generate<Feature>` — returns result with `status: 'pending'`
- Get method: `get<Feature>` or `get<Feature>Result` — returns current state for polling

## Step 3: Implement the Backend Client

Edit `packages/openclaude-integration/src/node/openclaude-backend-client.ts`.

The backend client makes GraphQL calls to the OpenClaude API server running on `localhost:4000/graphql`:

```typescript
async startMyAIFeature(options: MyAIFeatureOptions): Promise<MyAIFeatureResult> {
    const query = gql`
        mutation StartMyAIFeature($input: MyAIFeatureInput!) {
            startMyAIFeature(input: $input) {
                id
                status
            }
        }
    `;
    const result = await this.client.request(query, { input: options });
    return result.startMyAIFeature;
}

async getMyAIFeatureResult(id: string): Promise<MyAIFeatureResult> {
    const query = gql`
        query GetMyAIFeatureResult($id: ID!) {
            myAIFeatureResult(id: $id) {
                id
                status
                output { label content confidence }
                error
            }
        }
    `;
    const result = await this.client.request(query, { id });
    return result.myAIFeatureResult;
}
```

## Step 4: Create the Widget with Polling

Create `packages/openclaude-integration/src/browser/my-feature/my-feature-widget.tsx`:

```typescript
import * as React from '@theia/core/shared/react';
import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core';
import { OpenClaudeBackendService, MyAIFeatureResult } from '../../common/openclaude-protocol';

@injectable()
export class MyAIFeatureWidget extends ReactWidget {

    static readonly ID = 'openclaude-my-ai-feature';
    static readonly LABEL = 'My AI Feature';

    @inject(OpenClaudeBackendService)
    protected readonly backendService!: OpenClaudeBackendService;

    @inject(MessageService)
    protected readonly messageService!: MessageService;

    protected currentResult: MyAIFeatureResult | undefined;
    protected loading = false;

    @postConstruct()
    protected init(): void {
        this.id = MyAIFeatureWidget.ID;
        this.title.label = MyAIFeatureWidget.LABEL;
        this.title.caption = MyAIFeatureWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-magic';
        this.update();
    }

    /**
     * Start the AI feature processing
     */
    async startProcessing(options: MyAIFeatureOptions): Promise<void> {
        this.loading = true;
        this.update();

        try {
            this.currentResult = await this.backendService.startMyAIFeature(options);
            this.pollForCompletion(this.currentResult.id);
        } catch (error) {
            this.messageService.error(`Failed to start: ${error}`);
            this.loading = false;
            this.update();
        }
    }

    /**
     * Poll backend until processing completes or fails
     */
    protected async pollForCompletion(id: string): Promise<void> {
        const POLL_INTERVAL = 2000;
        const MAX_ATTEMPTS = 30;
        let attempts = 0;

        const poll = async (): Promise<void> => {
            try {
                this.currentResult = await this.backendService.getMyAIFeatureResult(id);

                if (this.currentResult.status === 'completed' || this.currentResult.status === 'failed') {
                    this.loading = false;
                    this.update();

                    if (this.currentResult.status === 'completed') {
                        this.messageService.info('AI processing completed');
                    } else {
                        this.messageService.error(`Processing failed: ${this.currentResult.error}`);
                    }
                    return;
                }

                attempts++;
                if (attempts < MAX_ATTEMPTS) {
                    setTimeout(poll, POLL_INTERVAL);
                } else {
                    this.loading = false;
                    this.messageService.warn('Processing timed out');
                    this.update();
                }
            } catch (error) {
                this.loading = false;
                this.messageService.error(`Polling error: ${error}`);
                this.update();
            }
        };

        poll();
    }

    protected render(): React.ReactNode {
        return (
            <div className='openclaude-my-ai-feature'>
                {this.loading && <div className='spinner'><p>Processing...</p></div>}
                {!this.loading && this.currentResult?.output && this.renderOutput()}
                {!this.loading && !this.currentResult && this.renderEmpty()}
            </div>
        );
    }

    protected renderOutput(): React.ReactNode {
        // Render your AI results here
    }

    protected renderEmpty(): React.ReactNode {
        return (
            <div className='openclaude-empty-state'>
                <p>Run this feature from the command palette.</p>
            </div>
        );
    }
}
```

### Polling Pattern

This is the standard pattern used by all AI features in OpenClaude:
- Poll every 2 seconds, max 30 attempts (1 minute timeout).
- Check `status === 'completed' | 'failed'` to stop polling.
- Always set `this.loading = false` and call `this.update()` when done.
- Show user-facing messages via `this.messageService`.

## Step 5: Wire Up the Command

In `openclaude-frontend-contribution.ts`, the command should:
1. Get the current editor context (file path, content, selection).
2. Optionally show a dialog for user configuration.
3. Create/activate the widget.
4. Call the widget's start method.

```typescript
commands.registerCommand(OpenClaudeCommands.START_MY_AI_FEATURE, {
    execute: async () => {
        try {
            const currentEditor = this.editorManager.currentEditor;
            const filePath = currentEditor?.getResourceUri()?.path.toString() || '';

            // Get file content from Monaco editor
            let content = '';
            if (currentEditor && currentEditor instanceof MonacoEditor) {
                content = currentEditor.getControl().getModel()?.getValue() || '';
            }

            const widget = await this.widgetManager.getOrCreateWidget<MyAIFeatureWidget>(
                MyAIFeatureWidget.ID
            );
            widget.activate();

            await widget.startProcessing({ filePath, content, mode: 'basic' });
        } catch (error) {
            this.messageService.error(`Failed: ${error}`);
        }
    }
});
```

### Getting Editor Context

- `this.editorManager.currentEditor` — the active editor tab
- `.getResourceUri()?.path.toString()` — the file path
- Cast to `MonacoEditor` to access `.getControl().getModel()?.getValue()` for file content
- `.editor.selection` — the current text selection (start/end line/column)

## Step 6: Register DI and CSS

Follow the standard widget registration in `openclaude-frontend-module.ts` (see theia-widget-creation skill).

## Existing AI Features to Reference

| Feature | Widget File | Lines |
|---------|------------|-------|
| Code Review | `code-review/code-review-widget.tsx` | ~355 |
| Test Generation | `test-generation/test-preview-widget.tsx` | ~410 |
| Documentation | `documentation/documentation-widget.tsx` | ~420 |
| AI Completion | `completion/ai-completion-provider.ts` | ~280 |

All follow the same polling + result display pattern.
