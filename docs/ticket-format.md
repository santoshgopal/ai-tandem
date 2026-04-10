# Ticket Format

Each ticket is a directory under `tickets/` named by its ID, containing a `ticket.json` file.

```
tickets/
└── PROJ-1/
    ├── ticket.json      ← you write this
    ├── contract.json    ← backend agent writes this
    ├── be_audit.md      ← tandem writes after BE run
    ├── fe_audit.md      ← tandem writes after FE run
    └── status.json      ← tandem maintains this
```

The full JSON Schema is at [schemas/ticket.schema.json](../schemas/ticket.schema.json).

---

## Required fields

### `id`

```json
"id": "PROJ-42"
```

Unique ticket identifier. Format: `PREFIX-NUMBER` where PREFIX is all uppercase letters and NUMBER is a positive integer. Must match the directory name.

Set the prefix during `tandem init`. Use `tandem new-ticket` to auto-assign the next ID.

### `title`

```json
"title": "Add user profile endpoint and profile page"
```

Short imperative title. 5–120 characters. Used as the PR title and in log output.

### `status`

```json
"status": "queued"
```

Current state machine position. Valid values:

| Value | Meaning | Set by |
|-------|---------|--------|
| `queued` | Ready to run | You (initial state) |
| `be-working` | Backend agent is running | tandem |
| `contract-ready` | Backend finished, contract written | tandem |
| `fe-working` | Frontend agent is running | tandem |
| `done` | Both agents finished | tandem |
| `error` | Agent failed after max retries | tandem |
| `blocked` | A dependency is not yet `done` | tandem |

**You should only ever set this to `queued` or `blocked`.** tandem manages all other transitions. To re-run a failed ticket, set status back to `queued`.

### `priority`

```json
"priority": 10
```

Execution order. Integer >= 1. Lower = runs first. Tickets with the same priority run in filesystem order. Recommendation: start at 10, increment by 10 (leaves room for insertions).

### `user_story`

```json
"user_story": "As a registered user, I want to view my profile so that other users can identify me."
```

Written in standard format: `As a [user type], I want [goal] so that [reason]`. Minimum 10 characters. Both agents receive this — it anchors all implementation decisions to the actual user need.

### `acceptance`

```json
"acceptance": [
  "User can view their own profile with name, bio, and avatar",
  "User can update their name and bio via a form",
  "Avatar upload accepts JPEG and PNG up to 2MB"
]
```

Array of testable done criteria. At least one item required, each at least 5 characters. Both agents use these to confirm their work is complete before writing output.

### `be_scope`

```json
"be_scope": "Create GET /users/:userId/profile, PATCH /users/:userId/profile, and POST /users/:userId/avatar endpoints. All authenticated endpoints must use the existing AuthMiddleware."
```

Plain English description of what the backend agent must build. Be specific: which endpoints, which DB tables/models, which business logic. The backend agent treats this as its primary task definition. Do not describe frontend work here.

### `fe_scope`

```json
"fe_scope": "Create a /profile/:userId page that displays the user's profile card with name, bio, and avatar. Add an edit mode that shows a form to update name and bio inline."
```

Plain English description of what the frontend agent must build. Be specific: which views, which components, which interactions. The frontend agent treats this as its primary task definition. Do not describe backend work here.

---

## Optional fields

### `depends_on`

```json
"depends_on": ["PROJ-10", "PROJ-11"]
```

Array of ticket IDs that must reach `done` status before this ticket can start. Default: `[]`. If any dependency is not done when the loop processes this ticket, tandem sets the status to `blocked` and skips it.

Circular dependencies are a validation error caught by `tandem validate`.

### `be_constraints`

```json
"be_constraints": [
  "Use AuthMiddleware from src/middleware/auth.ts for authenticated endpoints",
  "Return { data, error } envelope on all responses — see src/types/api.ts",
  "Postgres only — no new tables without a migration file"
]
```

Hard rules the backend agent must follow. These override the agent's judgment. Use for non-negotiable architectural decisions, existing patterns the agent must respect, and things the agent might otherwise do wrong.

### `be_hints`

```json
"be_hints": [
  "UserModel is in src/models/user.ts — profile fields may need to be added",
  "The validation middleware is in src/middleware/validate.ts"
]
```

Soft guidance for the backend agent. Helps the agent navigate your codebase without reinventing patterns. Unlike constraints, the agent can deviate if there's a good reason.

### `fe_constraints`

```json
"fe_constraints": [
  "Use the existing Page component from src/components/layouts/Page.tsx",
  "Use react-hook-form for all forms",
  "Tailwind only — no inline styles"
]
```

Hard rules for the frontend agent. Same semantics as `be_constraints`.

### `fe_hints`

```json
"fe_hints": [
  "UserCard component in src/components/UserCard.tsx is a good reference",
  "Loading states should use the Skeleton component from src/components/ui/Skeleton.tsx"
]
```

Soft guidance for the frontend agent. Point the agent at existing components or patterns to reuse.

### `meta`

```json
"meta": {
  "created_at": "2026-01-15T10:00:00Z",
  "created_by": "Your Name",
  "labels": ["profile", "v2"],
  "notes": "Blocked on design review until 2026-01-20."
}
```

Optional metadata. Not used by the orchestrator — for human reference only.

| Field | Type | Description |
|-------|------|-------------|
| `created_at` | ISO 8601 string | When this ticket was created |
| `created_by` | string | Who created it |
| `labels` | string[] | Free-form tags |
| `notes` | string | Free-form notes (not injected into agent prompts) |

---

## Complete minimal example

```json
{
  "id": "PROJ-1",
  "title": "Add user profile endpoint and profile page",
  "status": "queued",
  "priority": 10,
  "user_story": "As a registered user, I want to view and edit my profile so that other users can identify me.",
  "acceptance": [
    "User can view their profile with name and bio",
    "User can edit name and bio via a form"
  ],
  "be_scope": "Create GET /users/:id/profile and PATCH /users/:id/profile endpoints. Use AuthMiddleware. Return { data, error } envelope.",
  "fe_scope": "Create /profile/:id page with a profile card. Add inline edit mode with a form."
}
```

See the full example at [examples/tickets/DEMO-1/ticket.json](../examples/tickets/DEMO-1/ticket.json).

---

## Writing effective scope

The scope fields are the most important part of a ticket. Poor scope leads to poor agent output.

**Be specific about file paths:**
> "Add `name` and `bio` columns to the `users` table via a migration in `db/migrations/`"

is better than:

> "Update the database"

**Name existing patterns the agent must follow:**
> "Use the existing `AuthMiddleware` from `src/middleware/auth.ts` — do not roll custom auth"

**Separate BE and FE clearly.** The backend agent never sees `fe_scope` and vice versa. If you describe frontend work in `be_scope`, the backend agent may try to implement it.

**Use `be_constraints` for non-negotiables.** If there is an architectural rule the agent must never break (e.g. "no raw SQL — use the ORM"), put it in constraints, not hints.
