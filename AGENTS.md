# Media Gen Engineering Guide

## Start here

- Read [`CONTEXT.md`](CONTEXT.md) when changing user-facing language, domain
  relationships, or persisted concepts. It is the canonical glossary; keep it
  free of implementation details.
- Read [`docs/architecture.md`](docs/architecture.md) before changing module
  boundaries, persistence, routing, or provider integration.
- Read the relevant file in [`docs/adr/`](docs/adr/) before changing a recorded
  architectural decision.

## Architecture boundaries

- `MediaGenApplication.execute` is the application boundary. CLI and HTTP/UI
  code are adapters over it; keep business mutations out of adapters.
- `.mg/config.json` is shared workspace configuration. `~/.media-gen` is
  private registry, profile, Generation, and working-media state.
- The filesystem is the authoritative Generation store. Edit and Recreate
  create derived Generations instead of mutating existing records.
- Model API differences belong in typed adapters under
  `src/model-runtime/adapters`. Keep provider payloads and endpoint construction
  out of the application and UI.
- The CLI is the execution source of truth. The Local UI calls the loopback
  HTTP adapter; the installed Agent Skill calls `mg`.

## Product invariants

- Internal Model Prompts and Azure tokens are transient and never persisted.
- Auto Selection preserves ordered deployment routing. A fallback is never
  executed automatically; manual fallback selection requires explicit
  `--force` approval.
- Permanent deletion, cleanup, and overwrite operations require explicit
  confirmation.
- CLI results use structured stdout (TOON by default, JSON on request).
  Progress and diagnostics belong on stderr.
- `mg serve` binds only to loopback addresses.

## Change paths

- CLI command: update `src/adapters/cli/run-cli.ts`,
  `src/adapters/cli/command-help.ts`, and CLI tests together.
- HTTP route: map it to a `MediaGenCommand` in
  `src/adapters/http/local-server.ts`; avoid duplicating application logic.
- Workspace schema: update `src/workspace/schemas.ts`, initialization defaults,
  and schema/application tests together.
- Model: update `src/catalog/models.ts`, its typed adapter, runtime
  registration, and adapter contract tests.
- Local UI: keep request types in `src/ui/api-client.ts`; settings persisted in
  the manifest must be loaded through `/api/settings`, not retained only in
  component state.

## Provider and Windows gotchas

- Generic image dimensions are adapter inputs, not universal provider fields.
  GPT Image must translate `width` and `height` to a supported `size`; lock
  provider payload shapes with request-body tests.
- On Windows, Azure CLI is commonly exposed as `az.cmd`. Extensionless commands
  must run through `%ComSpec% /d /s /c`; native `.exe` commands run directly.
- A globally linked `mg` runs `dist/cli.js`. Run `npm run build` before testing
  linked CLI behavior.

## Verification

Use the smallest relevant Vitest file during development:

```powershell
npm test -- test\adapters\cli\run-cli.test.ts
npm test -- test\ui\app.test.ts
npm test -- test\model-runtime\adapters\azure-openai-image-adapter.test.ts
```

Before completion:

```powershell
npm test -- --maxWorkers=1
npm run typecheck
npm run build
```

The serial full-suite command is the deterministic Windows check; the
file-lock concurrency test can race with parallel Vitest workers.
