# Media Gen

Media Gen is a local-first image and video generation workspace backed by
Microsoft Foundry. One TypeScript application engine powers:

- the `mg` command-line interface
- a bundled React UI served on localhost
- a lightweight `generate-media` Agent Skill

The current `0.1.1` prototype supports real Foundry discovery and generation,
filesystem-backed history, reuse workflows, and explicit model routing.

## Prerequisites

- Node.js 22 or later
- Azure CLI (`az`)
- access to a Microsoft Foundry project with supported model deployments
- the required Azure RBAC permissions and available model quota
- an Azure Speech resource and API key for default Explainer narration;
  selecting Voice Off removes this requirement for that Generation

Media Gen uses the current Azure CLI identity. It does not store Azure access
tokens.

## Build and install locally

From this directory:

```powershell
npm ci
npm run build
npm link
```

`npm link` installs the `mg` executable globally as a link to this working
directory. Rebuild after source changes so the linked command uses the latest
files in `dist`.

Verify the installation from any directory:

```powershell
mg --help
```

## Quick start

Run these commands in the directory that should become the Project Directory:

```powershell
mg init
mg auth
mg auth login
mg configure foundry --name primary --endpoint "https://<resource>.services.ai.azure.com/api/projects/<project>"
mg doctor
mg serve
```

`mg auth login` is needed only when Azure CLI is signed out. `mg serve` starts
the Local UI on a loopback address and keeps running until interrupted.
The CLI defaults Explainer Voice to Auto. The Local UI selects the private
Speech Connection's default MAI-Voice-2 Voice by name. Configure Azure Speech
for narrated Explainers:

```powershell
$env:MEDIA_GEN_SPEECH_API_KEY = Read-Host -MaskInput "Azure Speech API key"
mg configure speech --endpoint "https://<speech-region>.tts.speech.microsoft.com/" --voice "en-US-Ethan:MAI-Voice-2"
Remove-Item Env:\MEDIA_GEN_SPEECH_API_KEY
```

The CLI reads the key from `MEDIA_GEN_SPEECH_API_KEY`. The `--api-key` option
remains available for compatibility, but command-line secrets can be exposed
through shell history or process listings.

Every command has scoped help with syntax, options, examples, and next steps:

```powershell
mg configure foundry --help
mg configure speech --help
mg create image --help
mg create explainer-video --help
mg generations export --help
```

## Create media

```powershell
mg create image --prompt "Create a clean product launch visual"
mg create video --prompt "Create a five-second launch reveal"
```

The general Image and Video Generators support:

- Auto Selection through workspace routing
- explicit deployment selection with `--model`
- recommended image and video Styles, including Minimal studio, Editorial
  illustration, Cinematic, Handheld UGC, and Kinetic graphic
- local Reference Asset paths
- image dimensions and video duration
- explicit `--force` approval for configured fallback deployments

`mg generate image` and `mg generate video` remain compatible aliases.

## Create with Scenarios

```powershell
mg scenarios list
mg scenarios enable explainer-video
mg scenarios get explainer-video
mg create explainer-video --prompt "Explain the setup described in the source" --link "https://docs.example.com/setup"
mg create explainer-video --prompt "Explain retrieval-augmented generation" --voice en-US-Harper:MAI-Voice-2 --preset editorial-motion-graphics --subtitles --duration 60
mg create explainer-video --prompt "Create a visual-only explainer" --no-voice --duration 40

mg scenarios enable short-form-video
mg create short-form-video --source .\interview.mp4 --preset bold-urban --orientation vertical --subtitles --clip-count 3 --clip-duration 8
```

Built-in Scenarios:

- **Explainer video** automatically selects an eligible configured planning
  deployment and uses the normal Image Generator Auto route to create an
  exact-duration scene plan and one private style reference. That generated
  reference is passed to every video clip and is never a user setting. Business
  Creators can still add normal Reference Assets and Text References to ground
  the workflow. CLI requests can use Auto; the Local UI selects the configured
  default Voice by name so it can be changed or turned Off. Voice is
  synthesized per scene through MAI-Voice-2. Packaged FFmpeg composes clips,
  narration, provider audio, and optional subtitles into one MP4.
- **Short-form video** remixes one MP4 or MOV source into one to four styled
  variants using a Preset, orientation, language, subtitle request, and clip
  duration.

Scenario video generation uses routed Sora deployments. Explainer durations
come from the selected model profile (20 seconds through 10 minutes, plus a
15-to-600-second Manual choice normalized to a composable total).

Explainer narration uses a private Azure Speech Connection. Intermediate MP3
files remain private working artifacts. In the Local UI, open
**Settings -> Azure Speech** and enter the regional Speech synthesis endpoint,
API key, and default MAI Voice name. The key is stored only in the machine-local Local
Profile and is never returned to or prefilled in the browser. The CLI
equivalent is `mg configure speech`.

### Reference Sources

- `--reference <path>` adds a local Reference Asset.
- `--link <url>` records a Web Reference for provenance. Media Gen never
  downloads the page. Agents should read it with their own web tools and put
  the relevant facts in the Creative Brief.
- The Local UI Reference picker accepts pasted plain text or Markdown as a
  Text Reference. Text References are stored privately with the Generation,
  included in the transient Model Prompt, and never exported with media.

The Local UI shows the general Generators first, then the built-in Scenarios.
Selecting Explainer video or Short-form video opens its own Preset gallery,
source inputs, Production Options, model routing, readiness state, and
enablement flow.

## Manage Generations

```powershell
mg generations list
mg generations get <id>
mg generations recreate <id>
mg generations resume <id>
mg generations recreate <id> --preset marker-scribble --option clip-count=2
mg generations edit <id> --prompt "Use a warmer background"
mg generations reference --generation <id>
mg generations export <id> --to .\exports
mg generations delete <id> --force
mg generations cleanup --force
```

Edit and Recreate create new Generations; they never mutate the source
Generation. Failed composed workflows retain completed steps and can be
resumed. Export copies selected media into the Project Directory.

## Supported Foundry models

The built-in catalog currently recognizes:

- `MAI-Image-2.5`
- `MAI-Image-2.5-Flash`
- `MAI-Image-2e`
- GPT Image 2 (`gpt-image-2`)
- `FLUX.1-Kontext-pro`
- `FLUX-1.1-pro`
- `FLUX.2-pro`
- `FLUX.2-flex`
- `gpt-4.1`, `gpt-4.1-mini`, `gpt-5.4`, and `gpt-5.4-mini` for structured Workflow planning
- Sora 2 (`sora-2`)

Provider-specific request encoding stays inside typed model adapters. A
deployment must be discovered and stored in `.mg/config.json` before it can be
selected.

MAI-Voice-2 narration is configured separately through Azure Speech. Its
resource endpoint, API key, and default Voice are private Local Profile
settings, not Foundry deployment catalog entries.

## Agent Skill

Show the current agent-facing workflow catalog:

```powershell
mg skills
mg skills generate image
mg skills troubleshoot
```

Install the lightweight skill into a supported coding-agent directory:

```powershell
mg skills install --target github-copilot
mg skills install --target claude
mg skills install --target codex
mg skills install --target cursor
mg skills install --path <directory>
```

The installed skill delegates all execution and provider behavior to `mg`.

## Files and privacy

Shared project configuration:

```text
<project>\.mg\config.json
```

Private user-local state:

```text
~/.media-gen/registry.json
~/.media-gen/workspaces/<workspace>/
```

The Media Workspace stores Generation records and working media. Reference
Assets stay at their original paths and are fingerprinted. Internal provider
prompts and Azure tokens are never persisted. On POSIX systems, the Local
Profile is written with owner-only file permissions.

CLI output is TOON by default. Use `--output json` for scripts.

## Security

`mg serve` accepts only loopback hosts and browser origins. Foundry and Speech
connections are restricted to their Azure service hostnames. See
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Development

```powershell
npm ci
npm test
npm run typecheck
npm run build
node .\dist\cli.js --help
```

Use targeted Vitest files while iterating, then run the complete suite before
finishing a code change.

## Documentation

- [Domain language](CONTEXT.md)
- [Product design](docs/product-design.md)
- [Architecture](docs/architecture.md)
- [Architecture decisions](docs/adr/)
- [Agent Skill design](docs/agent-skill.md)
- [Implementation plan](docs/implementation-plan.md)
- [Foundry model API research](docs/research/foundry-media-model-api-surfaces.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

The historical UI exploration remains in
`prototypes/scenario-navigation/index.html`. The production Local UI is in
`src/ui`.

## License

[MIT](LICENSE). Third-party material is listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
