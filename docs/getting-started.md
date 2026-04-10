# Getting Started

This guide walks you from zero to your first completed ticket.

## Prerequisites

- **Node.js 20+** — tandem requires ES2022 and native `fetch`
- **Claude CLI** — installed and authenticated (`claude --version` should work)
- **Two git repositories** — one backend, one frontend, already cloned locally

## Install

```bash
# Global install (recommended)
npm install -g @ai-tandem/cli

# Or run from source
git clone https://github.com/santoshgopal/ai-tandem
cd ai-tandem
npm install && npm run build
```

Verify the install:

```bash
tandem --version
```

## Set up a project

Run `tandem init` in a new directory that will hold your tickets and config. This directory is your **workspace** — it is separate from both repos.

```bash
mkdir my-project-tandem
cd my-project-tandem
tandem init
```

The init wizard will ask:

| Prompt | Example answer |
|--------|---------------|
| Ticket prefix | `PROJ` |
| Path to backend repo | `../my-api` |
| Path to frontend repo | `../my-frontend` |
| Tickets directory | `./tickets` (default) |

It writes `.tandem/config.json` and creates `tickets/` with a sample ticket (DEMO-1) so you can see the structure immediately.

## Write your first ticket

Each ticket lives in `tickets/<ID>/ticket.json`. Use `tandem new-ticket` to scaffold one:

```bash
tandem new-ticket "Add user profile endpoint and profile page"
```

The wizard asks for your user story and acceptance criteria, then writes the file. Open it and fill in `be_scope` and `fe_scope`:

- **`be_scope`** — what the backend agent must build (endpoints, models, migrations)
- **`fe_scope`** — what the frontend agent must build (pages, components, interactions)

Be specific. The agents receive exactly what you write here.

See [ticket-format.md](ticket-format.md) for every field and [examples/tickets/DEMO-1/ticket.json](../examples/tickets/DEMO-1/ticket.json) for a complete example.

## Validate before running

```bash
tandem validate
```

This checks every ticket against the schema and detects circular dependencies. Fix any errors before proceeding.

## Dry run

```bash
tandem run --dry-run
```

A dry run validates prompts and traces the pipeline without invoking Claude. Use this to confirm the queue order and prompt content are correct.

## Full run

```bash
tandem run
```

tandem will:

1. Pick the highest-priority `queued` ticket
2. Launch the backend agent (Claude Code) in your backend repo
3. Wait for `contract.json` to appear in the ticket directory
4. Launch the frontend agent in your frontend repo
5. Mark the ticket `done`

Both agents commit directly to your repos. Watch progress with:

```bash
tandem status --watch
```

## Process all tickets

By default `tandem run` processes one ticket and exits. To drain the queue:

```bash
tandem run --loop
```

Or set `"loop": true` in `.tandem/config.json`.

## Pause and resume

```bash
tandem pause     # writes .tandem/PAUSE — loop stops after current ticket
tandem resume    # removes .tandem/PAUSE
tandem run       # picks up where it left off
```

## What to do when a ticket errors

1. Run `tandem status` — look for `error` status
2. Open `tickets/<ID>/be_audit.md` or `fe_audit.md` to read the agent output
3. Fix the root cause (update ticket scope, fix a repo issue, etc.)
4. Reset the ticket: edit `tickets/<ID>/ticket.json`, set `"status": "queued"`
5. Run `tandem run` again

## Configuration reference

See [`.tandem/config.json` schema](../schemas/config.schema.json) or the full table in the [README](../README.md#configuration).
