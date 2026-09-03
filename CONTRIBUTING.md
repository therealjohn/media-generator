# Contributing

Thanks for contributing to Media Gen. By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Before starting

- Search existing issues before filing a new one.
- Open an issue before a large feature or architectural change so the approach
  can be discussed first.
- Never use real credentials, private endpoints, customer media, or other
  sensitive data in an issue, test, fixture, screenshot, or pull request.

## Development setup

Install Node.js 22 or later and dependencies:

```powershell
npm ci
```

The Azure CLI is required for live Foundry access, but not for the automated
test suite.

Read `CONTEXT.md` before changing user-facing language or persisted concepts,
and read `AGENTS.md` before changing module boundaries, routing, persistence,
or provider integration.

## Making changes

- Keep changes focused and add regression tests for behavior changes.
- Preserve the `MediaGenApplication.execute` boundary. CLI and HTTP/UI code are
  adapters over the application.
- Keep provider request shapes and endpoint construction inside typed adapters
  under `src/model-runtime/adapters`.
- Update user documentation when commands, configuration, or behavior changes.
- Add required attribution to `THIRD_PARTY_NOTICES.md` when incorporating
  third-party material.

## Validation

Run the smallest relevant Vitest file while iterating. Before submitting a
change, run:

```powershell
npm test -- --maxWorkers=1
npm run typecheck
npm run build
```

## Pull requests

Describe the user-visible result, the implementation choices that need review,
and the commands used to validate the change. Include screenshots or recordings
for meaningful Local UI changes. A pull request should not combine unrelated
cleanup with the intended change.

## Security and privacy

Never commit credentials, tokens, private endpoints, customer media, Local
Profiles, browser session artifacts, or files from `~/.media-gen`. Use
obviously fictional values and reserved example domains in tests and
documentation.

Report vulnerabilities according to `SECURITY.md`.

Unless stated otherwise, contributions are licensed under the repository's
[MIT License](LICENSE).
