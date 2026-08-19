# Media Gen Product Design

## Product statement

Media Gen helps developers and technical business creators generate, inspect, reuse, and export image and video assets without learning a large catalog of model-specific tools.

It runs locally. A Project Directory contains shared configuration and exported final assets. Private configuration, generation history, drafts, and working media live under the user's home directory.

## Target users

The long-term user is a **Business Creator** working in marketing, communications, or product management.

The prototype targets:

- developers
- technical product managers
- technical marketing and communications creators

Installation may assume a terminal and a local Project Directory. The browser interface should not assume model expertise.

## Product principles

### Prompt first

The primary input is a natural-language **Creative Brief**. Reference files,
model choice, Style, and other controls are optional refinements in a
Generator. A Scenario can replace the freeform controls with inputs,
Presets, and Production Options specific to its deliverable.

### Outcome first

Media Gen has two creation entry points:

- **Generators** are the general Image and Video creation surfaces.
- **Scenarios** are specific deliverables with purpose-built workflows, such
  as Explainer video or Short-form video.

A Generator exposes recommended Styles directly. A Scenario exposes
Scenario-specific Presets and Production Options. Scenario names describe
the deliverable instead of introducing productized names such as "Studio."

### Model choice remains accessible

Each Generator or Scenario defines its Eligible Models. `Auto` resolves to a
workspace-configured default deployment. Users can easily select another
eligible model.

Fallback is never silent. After a technical failure, another model or
deployment runs only after explicit approval.

### Local working state stays out of the project

Working media and generation history belong in `~/.media-gen`. Only an explicit export copies a selected media file into the Project Directory.

### One execution path

The CLI owns generation behavior. The Local UI and Agent Skill do not implement separate provider logic.

## Product surfaces

### 1. Create

The selected UI structure is the compact workbench from prototype Variant C, with Variant B's prominent natural-language input.

The general Create view contains:

- a small Create rail with Image and Video
- a large Creative Brief input
- optional Reference Sources
- a media-specific inspector
- an easy-to-change Model control with `Auto` as the default
- a Generate action

Image and Video use separate inspector layouts.

Common controls are normalized per media type. Manually selecting a model can reveal a collapsed Advanced section for adapter-specific options.

Enabled Scenarios appear in a separate Scenarios group below Create. Each
Scenario owns its workspace rather than inheriting the generic generation
form. For example:

- Explainer video can ask for a topic or source files, then expose visual
  Presets, voice, subtitles, duration, and aspect ratio.
- Short-form video can require a source video, then expose caption and layout
  Presets, detected language, and output orientation.

The Local UI accepts local Reference Assets, prior Generation outputs, and
pasted Text References. Web References are CLI-only provenance: agents read
the URL with their own tools and incorporate relevant content into the
Creative Brief or a Text Reference.

### 2. Generations

Generations are shown newest first in a gallery. A detail view shows:

- output media
- status and errors
- Creative Brief
- the Generator or Scenario used
- Style or Preset
- model and deployment identity
- Reference Asset paths and integrity state
- creation time
- links to source Generations

Detail actions:

| Action | Behavior |
| --- | --- |
| Edit | Starts a new Generation using the output as a reference and accepts a new Creative Brief. |
| Recreate | Prefills the prior Creative Brief and choices, then allows changes before creating a new Generation. |
| Reference | Adds one or more generated outputs to the current Create input. |
| Export | Copies the selected media file into the Project Directory. |
| Delete | Permanently removes the Generation after an explicit `--force` confirmation. |

Edit and Reference are capability-gated. The UI filters Eligible Models based on media type, edit support, and reference limits.

Every reuse action creates a new Generation. Existing Generations are never mutated into new results.

### 3. Settings

Settings edits tracked workspace configuration and private machine-local
configuration through the same validated application commands as the CLI.

It manages:

- Foundry project endpoints
- discovered Model Deployments
- logical model bindings
- Scenario enablement
- Generator and Scenario `Auto` order
- default export directory
- authentication status
- private Azure Speech endpoint, API key, and default Voice

Git handles review and rollback for the Workspace Manifest. Speech credentials
remain in the Local Profile and are never returned to the browser after save.
Media Gen does not add a second diff or history system.

### 4. Agent Skill

One lightweight `generate-media` Agent Skill:

- verifies that `mg` is installed
- resolves the nearest `.mg/config.json`
- loads current guidance through `mg skills`
- invokes structured CLI commands
- never calls a Model Provider directly

## Built-in creation catalog

The prototype ships two general Generators:

| Generator | Recommended Styles |
| --- | --- |
| Image | Minimal studio, Product-led, Brand graphic, Editorial illustration, Photoreal lifestyle, Cinematic, Playful 3D, Technical isometric |
| Video | Minimal studio, Product-led, Brand graphic, Photoreal lifestyle, Cinematic, Handheld UGC, Kinetic graphic, Playful 3D |

The built-in purpose-specific Scenarios are:

| Scenario | Core input | Example Presets | Production Options |
| --- | --- | --- | --- |
| Explainer video | Topic and optional image or video reference | Editorial motion graphics, Stickman cartoon, Watercolor chronicle | Optional MAI voice and narration, subtitles, duration, aspect ratio |
| Short-form video | Source video | Bold urban, Green contrast, Marker scribble | Language, captions, orientation |

Both Scenarios execute through the CLI. Short-form video uses a routed Sora
deployment for remix and variants. Explainer video resolves `visuals` from
workspace deployment routing and creates a Sora MP4. Voice is disabled by
default; when selected, the Scenario resolves `voice` from the private Speech
Connection and adds a MAI-Voice-2 MP3. The narration script defaults to the
Creative Brief. Subtitle generation and audio/video muxing remain
non-deterministic post-production gaps.

## Prompt behavior

For a Generator, the CLI combines:

- Creative Brief
- Generator instructions
- Style instructions
- Reference Asset information
- model-specific guidance

into a transient **Model Prompt**.

A Scenario combines its own workflow instructions, selected Preset,
Production Options, references, and model guidance. Generation records track
resolved resources, operations, and progress so a future Scenario can
coordinate multiple provider or local-processing operations without changing
the application interface.

The Model Prompt is not shown or persisted. Generation records retain the Creative Brief, selected choices, model/deployment identity, CLI version, and built-in catalog version.

## Model scope

Initial typed adapters support:

### Images

- `MAI-Image-2.5`
- `MAI-Image-2.5-Flash`
- `MAI-Image-2e`
- `gpt-image-2`
- `FLUX.1-Kontext-pro`
- `FLUX-1.1-pro`
- `FLUX.2-pro`
- `FLUX.2-flex`

### Video

- `sora-2`

Deferred until the Foundry contract is verified:

- `Stable-Diffusion-3.5-Large`
- `Stable-Image-Ultra`
- `Stable-Image-Core`

## Prototype scope

### Included

- local TypeScript/Node CLI
- bundled localhost React UI
- Entra authentication through Azure CLI context
- discovery of existing Foundry deployments
- image and video generation
- concurrent Generations
- file-based history
- Edit, Recreate, Reference, Export, and Delete
- lightweight Agent Skill and built-in skill catalog
- TOON output with optional JSON

### Deferred

- hosted application or multi-user collaboration
- product sign-in
- custom Scenarios
- saved Presets
- deterministic transcription, caption composition, and audio/video muxing
- multi-scene Scenario orchestration
- automatic fallback
- cost estimation and approval gates
- detach, watch, or resume commands
- uniform Azure AI Content Safety integration
- product telemetry
- desktop packaging
- automatic cleanup
- Stability AI adapters
- non-Foundry providers

## Prototype success criteria

The prototype succeeds when:

1. A user initializes any directory with `mg init`.
2. A teammate can clone or copy that directory, authenticate with Azure CLI, and validate the tracked Foundry endpoints.
3. Image and video Generations work from both `mg` and the Local UI.
4. Agent-created Generations appear in the Local UI without synchronization.
5. UI-created Generations appear in CLI history.
6. A user can reuse, export, and delete media through the defined actions.
7. The product never writes working generations into the Project Directory.

## Design references

- [Higgsfield](https://higgsfield.ai/) informed the Scenario and media-workbench direction, while its broad navigation and model catalogs illustrate the clutter to avoid.
- [Kie.ai](https://kie.ai/) informed provider abstraction and deployment visibility.
- [AXI](https://axi.md/) defines the agent-ergonomic CLI principles.
- [Checkly CLI](https://www.checklyhq.com/docs/cli/overview/) informed the lightweight installed skill plus CLI-hosted guidance pattern.
