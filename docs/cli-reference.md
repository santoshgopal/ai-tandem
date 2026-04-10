# CLI Reference

All commands share the `--config <path>` option, which overrides config discovery. By default, tandem walks up from the current directory looking for `.tandem/config.json`.

---

## `tandem init`

Set up ai-tandem in a new workspace.

```
tandem init [--config <path>]
```

| Flag | Description |
|------|-------------|
| `--config <path>` | Write `.tandem/config.json` to this explicit path instead of `./.tandem/` |

**What it does:**
- Runs an interactive wizard (ticket prefix, repo paths, tickets directory)
- Writes `.tandem/config.json`
- Creates the tickets directory
- Copies the DEMO-1 example ticket so you have a reference immediately
- Optionally writes `CLAUDE.md` files into both repos with agent context

**Exit codes:** `0` on success, `1` on any error.

---

## `tandem run`

Process tickets through the BE → contract → FE pipeline.

```
tandem run [options]
```

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to `.tandem/config.json` |
| `--tickets <path>` | Override the tickets directory from config |
| `--dry-run` | Validate tickets and render prompts without invoking Claude |
| `--loop` | Override config: keep processing until the queue is empty |
| `--loop-until <ticketId>` | Stop after completing this ticket ID (e.g. `PROJ-5`) |
| `--quiet` | Suppress agent output — show only phase transitions and errors |

**Behaviour:**
- Exits `1` if a PAUSE file is present (run `tandem resume` first)
- Verifies `be_repo`, `fe_repo`, and `tickets_dir` all exist before starting
- Single-ticket mode by default (`loop: false` in config); use `--loop` to drain the queue
- `--dry-run` skips actual Claude invocations and writes no state files; useful in CI

**Exit codes:** `0` on success, `1` on fatal error (config missing, agent exhausted retries when `pause_on_error: true`).

---

## `tandem status`

Show the current status of all tickets in a table.

```
tandem status [options]
```

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to `.tandem/config.json` |
| `--tickets <path>` | Override the tickets directory |
| `--watch` | Refresh the table every N seconds |
| `--interval <seconds>` | Refresh interval when `--watch` is active (default: `5`) |

**Output columns:** ID, TITLE (truncated to 35 chars), STATUS (color-coded), PRIORITY, DURATION (wall time from BE start to FE complete).

**Status colors:**
- Green — `done`
- Yellow — `be-working`, `fe-working`, `contract-ready`
- Red — `error`
- Cyan — `contract-ready`
- Dim — `blocked`
- Default — `queued`

**Exit codes:** `0` always (errors are printed inline, the table still renders).

---

## `tandem validate`

Validate all tickets against the schema and check the dependency graph.

```
tandem validate [options]
```

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to `.tandem/config.json` |
| `--tickets <path>` | Override the tickets directory |

**What it checks:**
- Every `ticket.json` conforms to the ticket schema
- No ticket has a `depends_on` entry that refers to a non-existent ticket
- No circular dependencies exist in the dependency graph

Prints a line per ticket with ID, title, status, and dependency status. Exits `1` if any ticket is invalid or a circular dependency is found.

**Exit codes:** `0` all valid, `1` on any validation failure.

---

## `tandem new-ticket [title]`

Scaffold a new ticket interactively.

```
tandem new-ticket [title] [options]
```

| Argument/Flag | Description |
|---------------|-------------|
| `[title]` | Optional title (skips the title prompt) |
| `--config <path>` | Path to `.tandem/config.json` |
| `--priority <number>` | Set an explicit priority; default is `max_existing + 10` |

**What it does:**
- Auto-assigns the next sequential ID based on existing tickets (e.g. `PROJ-5` if `PROJ-4` exists)
- Auto-assigns priority as `max_existing_priority + 10` unless `--priority` is set
- Prompts for: title, user story, acceptance criteria, BE scope, FE scope
- Validates the result against the ticket schema before writing
- Writes `tickets/<ID>/ticket.json`

**Exit codes:** `0` on success, `1` if the wizard is cancelled or schema validation fails.

---

## `tandem pause`

Write a PAUSE signal file so the running loop stops after the current ticket completes.

```
tandem pause [--config <path>]
```

The PAUSE file is written to `.tandem/PAUSE`. The loop checks for this file between tickets. If the loop is not currently running, the PAUSE file is still written and will block the next `tandem run`.

Prints a warning if already paused. Exits `0` either way.

**Exit codes:** `0` always.

---

## `tandem resume`

Remove the PAUSE file so the loop can continue.

```
tandem resume [--config <path>]
```

Prints a warning if not currently paused. After resuming, run `tandem run` to continue processing.

**Exit codes:** `0` always.

---

## Global flags

| Flag | Description |
|------|-------------|
| `-v, --version` | Print version number and exit |
| `-h, --help` | Display help for any command |

---

## Exit code summary

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Fatal error (see stderr for details) |

tandem never exits with codes other than `0` or `1`.
