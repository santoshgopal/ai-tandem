# Contract Format

The contract is the only communication channel between the backend and frontend agents. The backend agent writes `contract.json` inside the ticket directory after it finishes implementation. The frontend agent reads it before writing a single line of code.

**The contract describes what was actually built — not what was planned.** Every field must reflect the real implementation.

The full JSON Schema is at [schemas/contract.schema.json](../schemas/contract.schema.json).

---

## Top-level fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `ticket_id` | yes | string | The ticket ID this contract belongs to (e.g. `PROJ-42`) |
| `be_commit` | yes | string | Git SHA of the backend commit (min 7 chars) |
| `generated_at` | yes | ISO 8601 | When the backend agent wrote this contract |
| `endpoints` | yes | array | Every HTTP endpoint the feature introduces |
| `types` | yes | object | Named TypeScript types shared by request/response bodies |
| `base_url_hint` | no | string | Path prefix for all endpoints (e.g. `/api/v1`) |
| `auth` | no | object | Auth scheme used by all endpoints unless overridden |
| `frontend_guidance` | no | object | Structured guidance from BE agent to FE agent |
| `be_notes` | no | string[] | Free-form implementation notes from the backend agent |

---

## `auth`

Describes the authentication scheme used across all endpoints.

```json
"auth": {
  "type": "bearer",
  "notes": "Token expires in 1 hour. Refresh via POST /auth/refresh."
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `bearer`, `api-key`, `session-cookie`, `none` | The auth mechanism |
| `header` | string | For `api-key`: the header name (e.g. `X-API-Key`) |
| `notes` | string | Anything the frontend needs to know about auth |

Individual endpoints can override this with `auth_override`.

---

## `endpoints`

Array of endpoint objects. At least one is required.

```json
{
  "method": "GET",
  "path": "/users/:userId/profile",
  "summary": "Returns the public profile of any user by ID.",
  "auth_override": "none",
  "request": { ... },
  "response": { ... }
}
```

### Endpoint fields

| Field | Required | Description |
|-------|----------|-------------|
| `method` | yes | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` |
| `path` | yes | Path relative to `base_url_hint`. Path params in `:colon` notation |
| `summary` | yes | One sentence: what this endpoint does |
| `auth_override` | no | Override contract-level auth for this endpoint |
| `request` | no | Incoming request shape |
| `response` | yes | All possible response shapes |

### `request`

All sub-fields are optional — only include what the endpoint actually accepts.

| Field | Description |
|-------|-------------|
| `params` | URL path parameters as `key → TypeDef` |
| `query` | Query string parameters as `key → TypeDef` |
| `body` | Request body (inline TypeDef or `$ref` to a named type) |
| `headers` | Non-auth headers the frontend must send |

### `response`

```json
"response": {
  "success": {
    "status": 200,
    "body": { "$ref": "UserProfile" }
  },
  "errors": [
    { "status": 404, "code": "USER_NOT_FOUND", "description": "No user with this ID." },
    { "status": 403, "code": "FORBIDDEN", "description": "Not the profile owner." }
  ]
}
```

`success` is required. `errors` should list every status code the frontend must handle — incomplete error lists mean the frontend cannot show the right message.

---

## `types`

Named TypeScript interfaces shared by request and response bodies. Keys are PascalCase.

```json
"types": {
  "UserProfile": {
    "type": "object",
    "properties": {
      "id":         { "type": "string", "format": "uuid" },
      "name":       { "type": "string" },
      "bio":        { "type": "string" },
      "avatar_url": { "type": "string", "format": "uri" },
      "created_at": { "type": "string", "format": "date-time" }
    },
    "required": ["id", "name", "created_at"]
  }
}
```

Reference named types anywhere in the contract with `{ "$ref": "UserProfile" }`.

### TypeDef variants

The contract uses a recursive `TypeDef` for all type definitions:

| Variant | When to use | Example |
|---------|-------------|---------|
| Primitive | Simple scalar | `{ "type": "string", "format": "uuid" }` |
| Object | Structured body | `{ "type": "object", "properties": { ... }, "required": [...] }` |
| Array | List | `{ "type": "array", "items": { "$ref": "UserProfile" } }` |
| Reference | Named type | `{ "$ref": "UserProfile" }` |

---

## `frontend_guidance`

Structured guidance the backend agent writes for the frontend agent — derived from what was actually built.

```json
"frontend_guidance": {
  "loading_states": [
    "Skeleton while GET /users/:userId/profile loads on page mount",
    "Submit button disabled and showing spinner while PATCH is in-flight"
  ],
  "optimistic_update": false,
  "gotchas": [
    "The avatar endpoint accepts multipart/form-data — do NOT send JSON.",
    "bio field is optional in the PATCH body — send only fields the user changed."
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `loading_states` | string[] | Async states the frontend must handle |
| `optimistic_update` | boolean | Whether to update UI before server responds |
| `pagination` | object | Pagination details if any endpoint returns a list |
| `polling_required` | boolean | True if the operation is async and frontend must poll |
| `gotchas` | string[] | Anything surprising the frontend must know |

### `pagination`

```json
"pagination": {
  "strategy": "cursor",
  "default_page_size": 20,
  "max_page_size": 100
}
```

`strategy` is one of: `cursor` (next_cursor token), `offset` (page + per_page), `none`.

---

## `be_notes`

Free-form array of strings. The backend agent uses this to document implementation decisions, trade-offs, and things left for follow-up tickets.

```json
"be_notes": [
  "Added name and bio columns to users table via migration 0012_add_profile_fields.sql.",
  "Avatars stored in 'user-avatars' S3 bucket, served via CloudFront.",
  "File size validation happens at middleware layer before the controller."
]
```

---

## Annotated example

The complete DEMO-1 contract is at [examples/tickets/DEMO-1/contract.json](../examples/tickets/DEMO-1/contract.json). It demonstrates:

- Three endpoints with different auth requirements (`auth_override: "none"` on the public GET)
- A named type (`UserProfile`) referenced by multiple endpoints
- A multipart/form-data upload endpoint with `headers`
- Full error coverage per endpoint
- `frontend_guidance` with loading states and gotchas
- `be_notes` documenting migration and infrastructure decisions

---

## What happens if the contract is wrong

The contract is validated against the schema when `contract-watcher` detects it. If validation fails:

- The ticket transitions to `error`
- `be_audit.md` contains the agent output
- `status.json` records the error reason

Fix the contract (or fix the backend implementation and regenerate it), then reset the ticket to `queued` to retry.
