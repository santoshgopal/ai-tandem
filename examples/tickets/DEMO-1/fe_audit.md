# Frontend Audit — DEMO-1

**Ticket**: Add user profile endpoint and profile page
**Agent run**: 2026-01-15T12:00:00Z – 2026-01-15T12:45:00Z
**Branch**: tandem/DEMO-1-fe
**Commit**: e4f5g6h

## Files created

- `src/pages/profile/[userId].tsx` — profile page with view and edit mode
- `src/components/profile/ProfileCard.tsx` — displays name, bio, avatar
- `src/components/profile/ProfileEditForm.tsx` — react-hook-form edit form
- `src/components/profile/AvatarUpload.tsx` — file picker with preview
- `src/api/profile.ts` — typed API client functions for all three endpoints
- `src/pages/profile/[userId].test.tsx` — 4 component tests

## Files modified

- `src/router.tsx` — registered `/profile/:userId` route

## Contract compliance

All endpoints from contract.json are called:
- ✓ `GET /users/:userId/profile` — called on mount, result feeds ProfileCard
- ✓ `PATCH /users/:userId/profile` — called on form submit in edit mode
- ✓ `POST /users/:userId/avatar` — called after avatar file selection confirmed

All error codes handled:
- ✓ `USER_NOT_FOUND` → 404 page state with friendly message
- ✓ `FORBIDDEN` → toast notification "You can only edit your own profile"
- ✓ `VALIDATION_ERROR` → inline field error under the relevant input
- ✓ `INVALID_FILE_TYPE` → file picker error message
- ✓ `FILE_TOO_LARGE` → file picker error message

## Gotchas addressed

- Avatar upload uses `FormData`, not JSON (per contract gotchas)
- PATCH body only includes fields the user actually changed
- `avatar_url` null case handled: shows default avatar placeholder

## Tests

```
✓ renders profile card with user data
✓ shows skeleton while loading
✓ shows 404 state for USER_NOT_FOUND
✓ edit form submits only changed fields
```
