# AI Swarm Package (@theia/ai-swarm)

Multi-agent swarm orchestration for Theia AI - enables a lead agent to coordinate specialized sub-agents with fresh context windows.

## Overview

This package provides swarm orchestration capabilities for AI-powered development:

- **Lead Agent Orchestrator**: Plans, delegates, and synthesizes work across sub-agents
- **Task Board**: Kanban-style task management with dependencies
- **Sub-Agent Management**: Spawn and manage specialized agents (architect, developer, reviewer, tester)
- **Mailbox System**: Inter-agent communication and coordination

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Theia Frontend                               │
├─────────────────────────────────────────────────────────────────┤
│  SwarmWidget │ TaskBoardWidget │ AgentActivityWidget            │
│                   SwarmService (Frontend)                        │
├──────────────────────────────────────────────────────────────────┤
│                   GraphQL/WebSocket                              │
├──────────────────────────────────────────────────────────────────┤
│                   SwarmService (Backend)                         │
│  LeadAgentOrchestrator │ TaskBoardService │ MailboxService      │
│         SubAgentManager → SubAgent instances                    │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### SwarmSession
- Session lifecycle management
- Status transitions: initializing → planning → delegating → executing → synthesizing → complete
- Metrics tracking (tokens, cost, completion rates)

### TaskBoard
- Kanban columns: Backlog, Ready, In Progress, Review, Done, Failed
- Task dependencies with cycle detection
- Topological sort for execution order
- Priority and complexity estimation

### SubAgents
- Role-based specialization: architect, developer, reviewer, tester, documenter
- Fresh context per agent (isolated from main context)
- Parallel execution support
- Optional git worktree isolation

### Communication
- Direct messages between agents
- Broadcast channel for announcements
- Message types: task_assignment, task_complete, question, code_review_request, etc.

## Usage

```typescript
import { SwarmService } from '@theia/ai-swarm';

// Inject the service
@inject(SwarmService)
protected readonly swarmService: SwarmService;

// Create and start a swarm
const session = await this.swarmService.createSession(
    'Add authentication to the Express API',
    'Auth Implementation'
);

await this.swarmService.startSwarm(session.id);

// Monitor progress
this.swarmService.onTaskUpdate(event => {
    console.log(`Task ${event.task.title}: ${event.task.status}`);
});

// Get results
const finalSession = await this.swarmService.getSession(session.id);
console.log(finalSession.finalReport);
```

## Configuration

Configure via Theia preferences:

```json
{
  "ai.swarm.enabled": true,
  "ai.swarm.maxConcurrentAgents": 5,
  "ai.swarm.defaultLeadModel": "claude-opus-4-5",
  "ai.swarm.defaultWorkerModel": "claude-sonnet-4-5",
  "ai.swarm.tokenBudget.perSession": 1000000
}
```

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
