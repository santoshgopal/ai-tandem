# End-to-End Walkthrough

This walkthrough replays the DEMO-1 ticket — "Add user profile endpoint and profile page" — from start to finish, with annotated log output at each stage.

All source files are in [examples/tickets/DEMO-1/](../examples/tickets/DEMO-1/).

---

## Setup

```
.tandem/
└── config.json

tickets/
└── DEMO-1/
    └── ticket.json   ← status: "queued", priority: 10
```

Config points to `../my-api` (backend) and `../my-frontend` (frontend).

---

## Step 1: Validate

```bash
tandem validate
```

```
Validating tickets in ./tickets...

✓  DEMO-1     Add user profile endpoint and profile page   queued           (no deps)

Queue summary:
  Executable:  1 tickets
  Blocked:     0 tickets
  Done:        0 tickets
  Errored:     0 tickets

All 1 ticket(s) valid.
```

One ticket, no dependencies, schema valid.

---

## Step 2: Dry run

```bash
tandem run --dry-run
```

```
ai-tandem  ▶  run

Config:   /workspace/.tandem/config.json
Tickets:  /workspace/tickets
Mode:     loop=false, dry-run=true

[DRY RUN] Queue: 1 executable, 0 blocked, 0 done, 0 errored

▶ Starting ticket DEMO-1: Add user profile endpoint and profile page

[DRY RUN] Would transition DEMO-1 → be-working
[DRY RUN] Would run backend agent in ../my-api with model claude-sonnet-4-6
[DRY RUN] Would wait for contract.json at tickets/DEMO-1/contract.json (timeout: 35m)

▶ Starting frontend agent for DEMO-1

[DRY RUN] Would run frontend agent in ../my-frontend with model claude-sonnet-4-6

✓ Ticket DEMO-1 complete.

Run complete

Processed:  1 tickets
Failed:     0 tickets
Skipped:    0 tickets
```

The pipeline trace looks correct. No Claude was invoked.

---

## Step 3: Full run

```bash
tandem run
```

```
ai-tandem  ▶  run

Config:   /workspace/.tandem/config.json
Tickets:  /workspace/tickets
Mode:     loop=false, dry-run=false

Queue: 1 executable, 0 blocked, 0 done, 0 errored

▶ Starting ticket DEMO-1: Add user profile endpoint and profile page
```

---

## Step 4: Backend agent runs (11:00 → 11:30)

tandem transitions DEMO-1 to `be-working` and records:

```json
// status.json (partial)
{
  "current": "be-working",
  "be_run": {
    "branch": "tandem/DEMO-1-be",
    "started_at": "2026-01-15T11:00:00Z"
  }
}
```

tandem launches Claude Code headless in the backend repo:

```
[BE] Claude Code v1.x started in ../my-api
[BE] Reading ticket DEMO-1...
[BE] Creating migration 0012_add_profile_fields.sql
[BE] Adding GET /users/:userId/profile
[BE] Adding PATCH /users/:userId/profile
[BE] Adding POST /users/:userId/avatar
[BE] Running tests... all pass
[BE] Writing contract.json
[BE] Committing: feat(DEMO-1): add user profile endpoints
[BE] Done. Exit code 0.
```

The backend agent commits to branch `tandem/DEMO-1-be` in the backend repo and writes `contract.json` to the ticket directory.

---

## Step 5: Contract detected and validated (11:30)

```
⏳ Waiting for contract.json at tickets/DEMO-1/contract.json...
```

`contract-watcher` detects the file via filesystem events and validates it against the contract schema. The contract passes — it has 3 endpoints, a `UserProfile` type, and `frontend_guidance`.

Status transitions to `contract-ready`:

```json
{
  "current": "contract-ready",
  "transitions": [
    { "from": "be-working", "to": "contract-ready", "at": "2026-01-15T11:30:00Z" }
  ],
  "be_run": {
    "completed_at": "2026-01-15T11:30:00Z",
    "exit_code": 0,
    "commit": "a1b2c3d"
  }
}
```

`be_audit.md` is written with the full agent output.

---

## Step 6: Frontend agent runs (12:00 → 12:45)

tandem transitions to `fe-working` and launches Claude Code in the frontend repo. The frontend agent receives the full contract:

```
[FE] Claude Code v1.x started in ../my-frontend
[FE] Reading contract.json for DEMO-1...
[FE] Found 3 endpoints: GET, PATCH, POST /users/:userId/*
[FE] UserProfile type: id, name, bio, avatar_url, created_at
[FE] Frontend guidance: loading states, avatar multipart/form-data gotcha
[FE] Creating /profile/:userId page
[FE] Adding ProfileCard component
[FE] Adding inline edit form with react-hook-form
[FE] Adding avatar upload with preview
[FE] Running type check... pass
[FE] Committing: feat(DEMO-1): add user profile page
[FE] Done. Exit code 0.
```

---

## Step 7: Ticket complete (12:45)

```
✓ Ticket DEMO-1 complete.

Run complete

Processed:  1 tickets
Failed:     0 tickets
Skipped:    0 tickets
```

Final state in `status.json`:

```json
{
  "ticket_id": "DEMO-1",
  "current": "done",
  "transitions": [
    { "from": null,             "to": "queued",         "at": "2026-01-15T10:00:00Z" },
    { "from": "queued",         "to": "be-working",     "at": "2026-01-15T11:00:00Z" },
    { "from": "be-working",     "to": "contract-ready", "at": "2026-01-15T11:30:00Z" },
    { "from": "contract-ready", "to": "fe-working",     "at": "2026-01-15T12:00:00Z" },
    { "from": "fe-working",     "to": "done",           "at": "2026-01-15T12:45:00Z" }
  ],
  "be_run": {
    "started_at":   "2026-01-15T11:00:00Z",
    "completed_at": "2026-01-15T11:30:00Z",
    "exit_code": 0,
    "retry_count": 0,
    "branch": "tandem/DEMO-1-be",
    "commit": "a1b2c3d"
  },
  "fe_run": {
    "started_at":   "2026-01-15T12:00:00Z",
    "completed_at": "2026-01-15T12:45:00Z",
    "exit_code": 0,
    "retry_count": 0,
    "branch": "tandem/DEMO-1-fe",
    "commit": "e4f5g6h"
  }
}
```

Total wall time: 1h 45m (30m BE + 45m FE). Human interaction: zero.

---

## Checking status after the run

```bash
tandem status
```

```
ID         TITLE                                STATUS    PRIORITY  DURATION
──────────────────────────────────────────────────────────────────────────────
DEMO-1     Add user profile endpoint and pr…   done      10        1h 45m
```

---

## What's in the ticket directory now

```
tickets/DEMO-1/
├── ticket.json     ← original input (status still "done" after tandem writes status.json)
├── contract.json   ← written by the backend agent
├── be_audit.md     ← full backend agent session log
├── fe_audit.md     ← full frontend agent session log
└── status.json     ← complete state machine history with timing
```

Read `be_audit.md` to see exactly what the backend agent did. Read `fe_audit.md` for the frontend. These are the primary debugging artifact if something goes wrong.

---

## What to do if the ticket errors

Suppose the backend agent exits non-zero after 2 retries. The status transitions to `error`:

```
[BE] Attempt 1 failed. Exit code 1.
[BE] Retrying (attempt 2/3)...
[BE] Attempt 2 failed. Exit code 1.
[BE] Retrying (attempt 3/3)...
[BE] Attempt 3 failed. Max retries exceeded.

Paused on error for ticket DEMO-1: Backend agent exceeded 2 retries.
```

To investigate and retry:

```bash
# 1. Read the agent output
cat tickets/DEMO-1/be_audit.md

# 2. Fix the root cause (update ticket scope, fix the backend repo, etc.)

# 3. Reset ticket status
# Edit tickets/DEMO-1/ticket.json: set "status": "queued"

# 4. Resume
tandem resume
tandem run
```
