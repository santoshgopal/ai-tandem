# Backend Audit — DEMO-1

**Ticket**: Add user profile endpoint and profile page
**Agent run**: 2026-01-15T11:00:00Z – 2026-01-15T11:30:00Z
**Branch**: tandem/DEMO-1-be
**Commit**: a1b2c3d

## Files created

- `migrations/0012_add_profile_fields.sql` — adds `name` and `bio` columns to `users` table
- `src/controllers/profile.controller.ts` — GET, PATCH, and avatar POST handlers
- `src/routes/profile.routes.ts` — route definitions with AuthMiddleware applied
- `src/tests/profile.controller.test.ts` — 7 unit tests, all passing

## Files modified

- `src/routes/index.ts` — registered `/users` profile routes

## Decisions made

- Kept `avatar_url` as a nullable column rather than a separate table, as the existing
  StorageService already returns a CDN URL. A separate avatars table would be overkill for v1.
- Used `multer` for multipart parsing (already a project dependency).
- The GET profile endpoint is public (`auth_override: none`) because user profiles are
  visible to anyone, including unauthenticated visitors.

## Tests

```
✓ GET /users/:userId/profile returns 200 with profile data
✓ GET /users/:userId/profile returns 404 for unknown user
✓ PATCH /users/:userId/profile updates name and bio
✓ PATCH /users/:userId/profile returns 403 for wrong user
✓ POST /users/:userId/avatar stores file and returns URL
✓ POST /users/:userId/avatar rejects files over 2MB
✓ POST /users/:userId/avatar rejects non-image files
```
