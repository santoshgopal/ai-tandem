# ai-tandem

> Multi-repo agent orchestrator. Backend builds first, writes a typed contract, frontend builds on top. Zero human interaction until a ticket is done.

---

## What is this?

**ai-tandem** drives two Claude Code agents — one per repo — through a backend-first → contract handoff → frontend pipeline, ticket by ticket, with no human intervention until a feature is complete on both sides.

```
ticket.json
    │
    ▼
[Backend Agent] ──builds──▶ commit + contract.json
                                      │
                                      ▼
                           [Frontend Agent] ──builds──▶ commit
                                                          │
                                                          ▼
                                                        done ✓
```

The **contract** is the only communication channel between agents. The backend agent writes it after implementation. The frontend agent reads it before writing a single line of code. No shared state, no hallucinated APIs.

---

## How it works

### 1. Write a ticket

```json
{
  "id": "PROJ-42",
  "title": "Add user profile endpoint and profile page",
  "status": "queued",
  "priority": 10,
  "user_story": "As a registered user, I want to view my profile...",
  "acceptance": ["User can view their profile", "User can edit name and bio"],
  "be_scope": "Create GET /users/:id/profile and PATCH /users/:id/profile...",
  "fe_scope": "Create /profile/:id page with ProfileCard component..."
}
```

### 2. Run tandem

```bash
tandem run
```

### 3. Tandem drives both agents

1. Reads the highest-priority `queued` ticket
2. Launches Claude Code headless in the backend repo with a structured prompt
3. Backend agent implements the feature, commits, and writes `contract.json`
4. Tandem detects `contract.json` and launches the frontend agent
5. Frontend agent reads the contract, implements the UI, commits
6. Ticket status set to `done`
7. (Optional) PRs opened in both repos

---

## Quick start

```bash
# Install
npm install -g @ai-tandem/cli

# Initialise a project
tandem init

# Create a new ticket
tandem new-ticket

# Validate tickets and config
tandem validate

# Run the next queued ticket
tandem run

# Check status of all tickets
tandem status
```

---

## Project structure

```
ai-tandem/
├── schemas/          JSON Schemas + TypeScript types for all data structures
├── templates/        Agent prompt templates (rendered at runtime)
├── orchestrator/     Core loop, state machine, agent runner (Phase 1+)
├── cli/              CLI commands (Phase 1+)
├── git/              Git branch management and platform adapters (Phase 1+)
├── tests/            Unit, integration, and fixture files
├── examples/         Complete example ticket (DEMO-1) showing a full run
└── docs/             Extended documentation
```

---

## Ticket lifecycle

```
queued → be-working → contract-ready → fe-working → done
                                  ↘              ↗
                               error / blocked
```

| Status           | Meaning                                                |
| ---------------- | ------------------------------------------------------ |
| `queued`         | Ready to run. Orchestrator will pick this up next.     |
| `be-working`     | Backend agent is running.                              |
| `contract-ready` | Backend agent finished and wrote `contract.json`.      |
| `fe-working`     | Frontend agent is running.                             |
| `done`           | Both agents finished. Feature is complete.             |
| `error`          | Agent failed after max retries. Inspect `status.json`. |
| `blocked`        | A dependency ticket is not yet `done`.                 |

---

## Configuration

Create `.tandem/config.json` in your workspace root (or run `tandem init`):

```json
{
  "ticket_prefix": "PROJ",
  "be_repo": "../my-api",
  "fe_repo": "../my-frontend",
  "tickets_dir": "./tickets",
  "loop": true,
  "max_retries": 2,
  "open_prs": false,
  "claude_model": "claude-sonnet-4-20250514"
}
```

See [schemas/config.schema.json](schemas/config.schema.json) for all options.

---

## The contract

The backend agent writes `contract.json` after it finishes. It describes the actual API surface — not what was planned. It includes:

- Every HTTP endpoint (method, path, request shape, response shape, error codes)
- TypeScript type definitions for all bodies
- Frontend guidance (loading states, pagination, gotchas)

See [schemas/contract.schema.json](schemas/contract.schema.json) and [examples/tickets/DEMO-1/contract.json](examples/tickets/DEMO-1/contract.json).

---

## Examples

See [examples/tickets/DEMO-1/](examples/tickets/DEMO-1/) for a complete example of a ticket that has gone through the full pipeline, including:

- `ticket.json` — the input
- `contract.json` — written by the backend agent
- `be_audit.md` — backend agent's implementation log
- `fe_audit.md` — frontend agent's implementation log
- `status.json` — full state transition history

---

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Run tests
npm test

# Validate fixture files against schemas
npm run validate-schemas

# Build
npm run build
```

---

## License

MIT — see [LICENSE](LICENSE).
