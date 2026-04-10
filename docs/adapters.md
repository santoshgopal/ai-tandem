# Platform Adapters

> **Status:** Git operations and PR automation are planned for a future release (Phase 3).
> The `open_prs` config option is accepted but currently has no effect — tandem logs a warning when it is set to `true`.

---

## Planned: Automatic PR opening

When Phase 3 ships, setting `"open_prs": true` in `.tandem/config.json` will cause tandem to automatically open a pull request in each repo after both agents complete a ticket.

```json
{
  "open_prs": true,
  "pr_base_branch": "main"
}
```

Supported platforms will be:

- **GitHub** — via `GITHUB_TOKEN` env variable
- **GitLab** — via `GITLAB_TOKEN` env variable (cloud and self-hosted)

---

## Planned: GitHub adapter

### Token scopes required

| Scope | Why |
|-------|-----|
| `repo` | Read repo metadata, push branches, open PRs |

Set the token as an environment variable before running tandem:

```bash
export GITHUB_TOKEN=ghp_...
tandem run
```

The adapter will detect GitHub from the remote URL (`github.com`) and use the REST API to open PRs with the ticket ID, title, and a link to the audit logs.

---

## Planned: GitLab adapter

### Token scopes required

| Scope | Why |
|-------|-----|
| `api` | Full API access — required for merge request creation |

```bash
export GITLAB_TOKEN=glpat-...
tandem run
```

For self-hosted GitLab instances, set `GITLAB_HOST`:

```bash
export GITLAB_HOST=https://gitlab.mycompany.com
```

---

## Tracking

Follow progress on Phase 3 at the [GitHub repository](https://github.com/santoshgopal/ai-tandem/issues).
