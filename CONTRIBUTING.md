# Contributing to ai-tandem

Thank you for your interest in contributing.

## Development setup

```bash
git clone https://github.com/santoshgopal/ai-tandem.git
cd ai-tandem
npm install
npm run typecheck
npm test
```

## Project structure

Before contributing, read [README.md](README.md) and the schemas in [schemas/](schemas/).
Understanding the data model (ticket → contract → status) is essential before touching
the orchestrator or CLI code.

## How to contribute

1. **Open an issue first** for non-trivial changes. Describe what you want to change and why.
2. **Fork** the repo and create a branch: `git checkout -b feat/your-feature`.
3. **Write tests** for any new behaviour. Run `npm test` before submitting.
4. **Run typecheck**: `npm run typecheck` must pass with zero errors.
5. **Run schema validation**: `npm run validate-schemas` must pass.
6. **Submit a PR** against `main`.

## Commit format

```
type(scope): short description

Body (optional): explain why, not what.
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

Examples:

- `feat(orchestrator): add retry-handler with exponential backoff`
- `fix(contract-watcher): handle symlinked contract paths`
- `docs(schemas): clarify TypeDef $ref semantics`

## Schema changes

Changes to any `.schema.json` file must:

1. Be backwards-compatible OR bump the `$id` version
2. Update the corresponding TypeScript interfaces in `schemas/index.ts`
3. Update affected fixture files in `tests/fixtures/`
4. Update `examples/tickets/DEMO-1/` if the example becomes invalid

## Adding a new CLI command

1. Add the handler file to `cli/commands/your-command.ts`
2. Register it in `cli/index.ts`
3. Add documentation to `docs/cli-reference.md`
4. Add an integration test in `tests/integration/`

## Code style

- TypeScript strict mode is enforced. No `any`, no `as` casts unless unavoidable.
- ESM only. No `require()`.
- No external dependencies without discussion in an issue first.
- Prefer explicit over clever.

## Questions?

Open an issue at [github.com/santoshgopal/ai-tandem/issues](https://github.com/santoshgopal/ai-tandem/issues).
