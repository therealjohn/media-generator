# Generate Media Agent Skill Design

## Goal

Provide a portable, lightweight Agent Skill that teaches coding agents how to use Media Gen without duplicating product documentation or provider logic.

## Principle

The CLI is the source of truth.

The installed skill contains:

- trigger metadata
- the requirement to verify `mg`
- the requirement to query `mg skills`
- the core safety and confirmation rules
- a few stable command examples

Detailed Generator, Scenario, model, configuration, and troubleshooting guidance stays inside the versioned CLI.

## Proposed installed skill

Illustrative shape:

```md
---
name: generate-media
description: Generate, edit, recreate, reference, inspect, and export image or video media through the Media Gen CLI. Use for image generation, video generation, product marketing media, media references, or reviewing prior generations.
---

# Generate Media

Before acting:

1. Verify `mg` is installed.
2. Run `mg` to inspect the current workspace.
3. Run `mg skills` to load the current action catalog.
4. Run `mg skills <action> [reference]` for the requested workflow.

Use `mg` for every mutation. Do not call Model Providers directly.

Use TOON output by default. Request JSON only when a script needs it.

Commands that require `--force` must be presented to the user before rerunning.
```

The final skill should remain short enough that it can load on every relevant request.

## Skill command catalog

```text
mg skills
|- initialize
|- configure
|  |- foundry
|  `- speech
|  |- models
|- create
|  |- explainer-video
|  |- short-form-video
|- generate
|  |- image
|  |- video
|- scenarios
|- inspect
|  |- generations
|- export
|- troubleshoot
```

Examples:

```text
mg skills initialize
mg skills configure foundry
mg skills configure speech
mg skills create explainer-video
mg skills create short-form-video
mg skills generate image
mg skills generate video
mg skills scenarios
mg skills inspect generations
```

## Agent workflow

### Generate

1. Run `mg`.
2. If uninitialized, load `mg skills initialize`.
3. If authentication or deployment bindings are missing, load the relevant configure guidance.
4. Determine whether the request uses a general Generator or an available Scenario.
5. Use natural language as the Creative Brief.
6. For a Generator, include an explicit Style, model, or Reference Sources only when supplied or needed.
7. Before passing `--link`, read the URL with agent web tools and incorporate
   the relevant content into the Creative Brief. Media Gen records the URL
   but does not fetch it.
8. Invoke the CLI command documented for the selected Generator or Scenario.
9. Return the Generation ID and local output path.

### Edit

1. Identify the source Generation.
2. Run the capability-aware Edit command.
3. Provide the new Creative Brief.
4. Do not modify the source Generation.

### Recreate

1. Inspect the source Generation.
2. Prefill its Creative Brief and choices.
3. For a Scenario, preserve its Preset, source references, and Production
   Options unless the user overrides them.
4. Apply user-requested changes.
5. Create a new Generation.

### Reference

1. Add one or more generated outputs as references.
2. Query capabilities before choosing a model.
3. Explain unavailable models or reference limits.

### Export

1. Export only after the user selects a result.
2. Copy media only.
3. Require `--force` before overwriting an existing file.

## Installation

```text
mg skills install --target github-copilot
mg skills install --target claude
mg skills install --target codex
mg skills install --target cursor
mg skills install --path <directory>
```

The installer changes only the target skill file. It does not edit project instruction files, memory files, session hooks, or global agent settings.

## Non-goals

The Agent Skill does not:

- contain provider endpoints or credentials
- assemble provider prompts
- poll providers itself
- write Generation records directly
- modify `.mg/config.json`
- implement a separate output folder contract
- add ambient session hooks
