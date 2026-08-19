# Contributing

## Development setup

Install Node.js 22 or later and the Azure CLI, then install dependencies:

```powershell
npm ci
```

Read `CONTEXT.md` before changing user-facing language or persisted concepts,
and read `docs/architecture.md` before changing module boundaries, routing,
persistence, or provider integration.

## Validation

Run the smallest relevant Vitest file while iterating. Before submitting a
change, run:

```powershell
npm test -- --maxWorkers=1
npm run typecheck
npm run build
```

Add regression tests for behavior changes. Keep provider-specific request
construction inside `src/model-runtime/adapters`.

## Security and privacy

Never commit credentials, tokens, private endpoints, customer media, Local
Profiles, browser session artifacts, or files from `~/.media-gen`. Use
obviously fictional values and reserved example domains in tests and
documentation.

Report vulnerabilities according to `SECURITY.md`.
