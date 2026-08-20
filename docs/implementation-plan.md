# Media Gen Implementation Plan

## Current status

- Phase 1 is complete: package scaffold, application interface, content-first home command, TOON/JSON output, structured usage errors, build, and tests.
- Phases 2-8 are complete for the local prototype: workspace schemas and locks, relinking and diagnostics, Azure CLI auth, Foundry deployment discovery, Generation storage and reuse actions, MAI/GPT Image/FLUX/Sora adapters, loopback server, bundled React UI, CLI-hosted guidance, and Agent Skill installation.
- Phase 9 hardening is complete for the prototype: structured errors, minimal list output with `--full`, stale-lock recovery, explicit cleanup, production packaging, and manual browser smoke testing.
- Phase 10 Scenario CLI support is complete: `mg create`, Scenario discovery
  and enablement, Explainer video, Short-form video, role-based routing,
  version 3 Generation records, Scenario-aware Recreate, readiness diagnostics,
  HTTP routes, and Agent Skill guidance.
- Phase 11 Scenario UI support is complete: built-in Scenarios appear below
  Image and Video, and each opens a purpose-built workbench with Preset
  selection, source inputs, Production Options, model readiness, enablement,
  and Scenario submission.
- Phase 12 Reference Source support is complete: CLI-only Web Reference URLs,
  pasted Text References in the Local UI, private Generation input files,
  version 4 records, Recreate preservation, and
  transient prompt grounding.
- Generation record version 5 persists normalized Generator controls so
  Image and Video detail views can report their production choices.
- Phase 13 MAI Voice support is complete: private Azure Speech endpoint and
  API-key configuration, Azure Speech SSML synthesis, Local Profile resolution
  for the Explainer `voice` role, per-scene narration generation, MP3 outputs,
  audio playback, and real MAI voice IDs.
- Phase 14 composed Workflow support is complete: a reusable typed workflow
  framework, structured planning, model capability profiles in JSON, one
  generated Explainer style reference, model-supported scene fan-out, Auto
  Voice with explicit Off, bundled FFmpeg composition, background Local UI
  execution, persisted progress, and resume.
- Live model execution requires a user-provided Foundry project endpoint,
  accessible image or video deployments, Azure CLI, and appropriate RBAC.
  Default Explainer narration additionally requires a private Azure Speech
  Connection; selecting Voice Off removes that requirement for the request.

## Delivery strategy

Build one real vertical slice early, then deepen the modules without widening the product scope.

The image and video paths should use the same `MediaGenApplication` interface, filesystem contract, CLI output, and Local UI before additional polish.

## Current stack

| Area | Proposed choice |
| --- | --- |
| Runtime | Node.js 22+, TypeScript |
| CLI framework | oclif |
| Validation | Zod |
| Azure project discovery | `@azure/ai-projects` |
| Azure authentication | `@azure/identity` with `AzureCliCredential` |
| Local HTTP adapter | Fastify |
| UI | React, Vite, React Router |
| Tests | Vitest and Testing Library |
| Packaging | npm package with `mg` binary and bundled UI assets |

These are implementation defaults, not domain decisions.

## Current source layout

```text
src/
|- adapters/
|  |- cli/
|  |- http/
|  `- skills/
|- application/
|- auth/
|- catalog/
|- components/
|- creation/
|- foundry/
|- generation/
|- model-runtime/
|  `- adapters/
|- ui/
|- workspace/
`- cli.ts
```

## Phase 1: Scaffold the package and interfaces

Deliver:

- npm package with `mg` binary
- TypeScript build
- bundled empty React UI
- `MediaGenApplication.execute` interface
- command/result types
- TOON and JSON encoders
- structured error and exit-code contract

Acceptance:

- `npx media-gen` runs.
- `mg` produces a content-first uninitialized state.
- unknown commands and flags fail loudly.
- tests exercise commands through the application interface.

## Phase 2: Workspace and configuration

Deliver:

- `mg init`
- nearest-ancestor `.mg/config.json` discovery
- schema validation and explicit migration framework
- `~/.media-gen/registry.json`
- per-workspace directory creation
- atomic writes and scoped locks
- workspace home view and `mg doctor`

Acceptance:

- initialization works in any directory without Git.
- nested commands resolve the nearest manifest.
- two directories with the same name receive different workspace IDs.
- moving a directory produces a clear relink error.

## Phase 3: Foundry authentication and deployment discovery

Deliver:

- `mg auth`, `mg auth login`, `mg auth logout`
- Azure CLI prerequisite checks
- project-endpoint validation
- `AIProjectClient.deployments` discovery
- CLI and Local UI configuration writes
- logical model/deployment binding
- Auto order validation

Acceptance:

- a project endpoint plus Azure CLI identity can enumerate deployments.
- a teammate can use the tracked manifest with their own Entra identity.
- no token is persisted.
- missing RBAC and wrong-tenant errors are specific.

## Phase 4: Generation store and fake model adapter

Deliver:

- Generation directory and record schema
- lifecycle transitions
- per-record locks and concurrent execution
- Reference Asset fingerprinting
- fake adapter
- list, get, delete, and export commands
- media-only export

Acceptance:

- multiple fake Generations run concurrently.
- interrupted and failed states remain inspectable.
- references report present, missing, or changed.
- export never writes provenance files into the Project Directory.

## Phase 5: Image adapters

Deliver:

- `MAIImageAdapter`
- `AzureOpenAIImageAdapter`
- `BFLFluxAdapter`
- capability-aware image controls
- general Image Generator
- recommended image Styles
- image Edit, Recreate, and Reference actions

Acceptance:

- each adapter normalizes output into the same Generation contract.
- unsupported edit/reference combinations fail before provider submission.
- Auto and manual model selection work.
- no internal Model Prompt is persisted.

## Phase 6: Sora video adapter

Deliver:

- `SoraVideoJobAdapter`
- submit, poll, and download behavior inside one waiting command
- general Video Generator
- recommended video Styles
- image-to-video and capability-gated video remix/reference

Acceptance:

- `mg generate` waits through completion and returns the local MP4 path.
- provider job IDs and failures are recorded.
- Local UI reflects running status.
- the CLI does not implement detach or resume.

## Phase 7: Local UI

Deliver:

- loopback-only `mg serve`
- Create workbench based on prototype Variant C
- prominent natural-language input inspired by Variant B
- separate Image and Video inspector layouts
- Generations gallery and detail
- Settings
- Edit, Recreate, Reference, Export, and Delete
- explicit refresh from filesystem-backed history

Acceptance:

- CLI-created Generations appear after the Local UI reloads its history.
- UI-created Generations appear in CLI output.
- capability changes update available actions and models.
- the server never binds to a non-loopback address.

## Phase 8: Agent Skill and CLI-hosted guidance

Deliver:

- `mg skills` action/reference catalog
- `mg skills install`
- GitHub Copilot, Claude, Codex, Cursor, and custom-path targets
- lightweight `generate-media` skill
- AXI contextual next steps across commands

Acceptance:

- the installed skill directs the agent to current CLI guidance.
- the skill contains no provider logic.
- an agent can initialize, configure, generate, inspect, and export using CLI output alone.

## Phase 9: Prototype hardening

Deliver:

- schema compatibility checks
- version and lifecycle diagnostics
- disk usage and explicit cleanup
- clear provider policy errors
- output truncation and `--full`
- package installation and upgrade documentation
- Windows, macOS, and Linux path tests

## Testing strategy

### Interface tests

Test complete behaviors through `MediaGenApplication.execute`.

Examples:

- init -> configure -> generate -> list -> export
- failed provider -> inspect -> explicit fallback refusal
- recreate and edit lineage
- concurrent Generations
- manifest migration

### Adapter contract tests

Each model adapter gets:

- request-shape tests
- response normalization tests
- authentication-scope tests
- capability tests
- structured provider-error tests

Use fixtures and fake HTTP endpoints. Live Foundry tests are opt-in and require explicit environment configuration.

### Filesystem tests

Use temporary directories to verify:

- atomic writes
- lock behavior
- registry collisions
- path movement
- reference fingerprints
- deletion and export overwrite protection

### UI tests

Use Testing Library for:

- Create flow
- Edit, Recreate, and Reference
- Settings writes
- export and delete confirmation states

Use manual browser smoke checks for bundled asset serving and end-to-end Local
UI navigation.

## Risks

| Risk | Response |
| --- | --- |
| Preview model APIs change | Keep behavior inside typed adapters and validate lifecycle in `mg doctor`. |
| Sora availability or policy limits block product media | Surface model policy clearly and keep manual model choice accessible. |
| FLUX lacks uniform Foundry safety | State prototype limits and keep a future safety seam. |
| Path-only Reference Assets move | Store fingerprints and show missing/changed state. |
| Internal prompts are not persisted | Store CLI and catalog versions; accept reduced reproducibility as a product decision. |
| Concurrent filesystem writes corrupt records | Per-record locks, scoped shared locks, and atomic renames. |
| User-home media grows without bound | Show disk usage and explicit deletion; never delete automatically. |

## Deferred roadmap

1. Deterministic transcription for source-video workflows.
2. Additional composed Scenario definitions over the Workflow module.
3. Custom Scenario packages and workspace overrides.
4. User-saved Presets.
5. Stability AI adapters.
6. Additional Model Providers and credential storage.
7. Azure AI Content Safety integration.
8. Cost estimates, budgets, and approval gates.
9. Detach, watch, resume, and interrupted-job reconciliation.
10. Desktop packaging for nontechnical Business Creators.
11. Hosted collaboration and shared enterprise workspaces.
