# CLI reference

This reference describes Media Gen `0.1.1`. The installed CLI is authoritative:

```powershell
mg --help
mg <command> --help
```

## Global behavior

Running `mg` without a command shows the current workspace state. Commands
return structured TOON output by default.

| Option | Description |
| --- | --- |
| `--output toon` | Use the default TOON output. |
| `--output json` | Return JSON for scripts and tools. |
| `-h`, `--help` | Show scoped command help. |

Progress and diagnostics are written to stderr. Structured results and errors
are written to stdout. Invalid arguments, refused confirmation operations, and
other failures return a nonzero exit code.

## Command overview

| Command | Purpose |
| --- | --- |
| `mg init` | Initialize the current directory. |
| `mg auth` | Inspect Azure CLI authentication. |
| `mg configure foundry` | Discover and save a Foundry project. |
| `mg configure speech` | Save the private Speech connection. |
| `mg doctor` | Check workspace readiness. |
| `mg create` | Create with a Generator or Scenario. |
| `mg scenarios` | Inspect and enable Scenarios. |
| `mg generations` | Inspect, reuse, export, and delete Generations. |
| `mg relink` | Reassociate a moved project. |
| `mg serve` | Start the Local UI. |
| `mg skills` | Show or install agent guidance. |

## `mg init`

```text
mg init [--output toon|json]
```

Initializes the current directory as a Media Gen project. If the directory is
already initialized, the command returns the existing association.

## `mg auth`

```text
mg auth [--output toon|json]
mg auth login [--output toon|json]
mg auth logout [--output toon|json]
```

- `mg auth` reports Azure CLI availability and sign-in state.
- `mg auth login` starts interactive Azure CLI sign-in.
- `mg auth logout` signs out through Azure CLI.

## `mg configure foundry`

```text
mg configure foundry --name <name> --endpoint <url> [--output toon|json]
```

| Option | Description |
| --- | --- |
| `--name <name>` | Local Provider Connection name. Required. |
| `--endpoint <url>` | Microsoft Foundry project endpoint. Required. |

The command discovers recognized deployments and writes non-secret provider,
deployment, and routing data to `.mg/config.json`.

Example:

```powershell
mg configure foundry `
  --name primary `
  --endpoint "https://<resource>.services.ai.azure.com/api/projects/<project>"
```

## `mg configure speech`

```text
mg configure speech --endpoint <url> --voice <name> [--api-key <key>] [--output toon|json]
```

| Option | Description |
| --- | --- |
| `--endpoint <url>` | Regional Azure Speech synthesis endpoint. Required. |
| `--voice <name>` | Default MAI-Voice-2 Voice ID. Required. |
| `--api-key <key>` | Speech API key. Omit on updates to retain the saved key. |

Prefer the `MEDIA_GEN_SPEECH_API_KEY` environment variable:

```powershell
$env:MEDIA_GEN_SPEECH_API_KEY = Read-Host -MaskInput "Azure Speech API key"
mg configure speech `
  --endpoint "https://<region>.tts.speech.microsoft.com/" `
  --voice "en-US-Ethan:MAI-Voice-2"
Remove-Item Env:\MEDIA_GEN_SPEECH_API_KEY
```

## `mg doctor`

```text
mg doctor [--output toon|json]
```

Checks the manifest, private Media Workspace, registry, Azure CLI, and Scenario
readiness. Follow the returned help entries for failed checks.

## `mg create image`

```text
mg create image --prompt <text> [options]
```

| Option | Description |
| --- | --- |
| `--prompt <text>` | Creative Brief. Required. |
| `--style <style>` | Recommended visual Style. |
| `--model <id>` | Specific configured Model Deployment. |
| `--reference <path>` | Local Reference Asset. Repeatable. |
| `--link <url>` | Web Reference URL. Repeatable. |
| `--width <pixels>` | Requested output width. |
| `--height <pixels>` | Requested output height. |
| `--force` | Approve a manually selected fallback deployment. |

Example:

```powershell
mg create image `
  --prompt "Create a clean product hero image" `
  --style product-led `
  --width 1600 `
  --height 900
```

`mg generate image` is a compatibility alias with the same options.

## `mg create video`

```text
mg create video --prompt <text> [options]
```

The video command accepts all image Generator options plus:

| Option | Description |
| --- | --- |
| `--duration <seconds>` | Requested video duration. |

Example:

```powershell
mg create video `
  --prompt "Create a cinematic product launch" `
  --style cinematic `
  --duration 8
```

`mg generate video` is a compatibility alias with the same options.

## `mg create explainer-video`

```text
mg create explainer-video --prompt <text> [options]
```

| Option | Description |
| --- | --- |
| `--prompt <text>` | Topic or explanation goal. Required. |
| `--source <path>` | Local source material. Repeatable. |
| `--link <url>` | Web Reference URL. Repeatable. |
| `--preset <id>` | Visual Preset. Default: `editorial-motion-graphics`. |
| `--voice auto` | Use the private Speech Connection's default Voice. |
| `--voice <id>` | Use a specific MAI-Voice-2 Voice. |
| `--no-voice` | Disable narration. |
| `--subtitles` | Burn subtitles into the result. |
| `--duration <seconds>` | Total duration from 15 to 600 seconds. Default: 60. |
| `--aspect-ratio <ratio>` | `16:9` or `9:16`. Default: `16:9`. |
| `--deployment visuals=<id>` | Override the routed visuals deployment. |

Example:

```powershell
mg create explainer-video `
  --prompt "Explain retrieval-augmented generation" `
  --preset editorial-motion-graphics `
  --voice auto `
  --subtitles `
  --duration 60 `
  --aspect-ratio 16:9
```

Enable the Scenario first with `mg scenarios enable explainer-video`.

## `mg create short-form-video`

```text
mg create short-form-video --source <video> [options]
```

| Option | Description |
| --- | --- |
| `--source <video>` | One MP4 or MOV source. Required. |
| `--prompt <text>` | Clip-selection direction. |
| `--link <url>` | Web Reference URL. Repeatable. |
| `--preset <id>` | Visual Preset. Default: `bold-urban`. |
| `--orientation <value>` | `vertical` or `horizontal`. Default: `vertical`. |
| `--language <value>` | Source language or `auto`. Default: `auto`. |
| `--subtitles` | Include styled subtitles. |
| `--clip-count <number>` | Number of clips, 1 through 4. Default: 1. |
| `--clip-duration <seconds>` | Model-supported duration. Default: 8. |
| `--deployment <role=id>` | Override Scenario routing. Repeatable. |

Example:

```powershell
mg create short-form-video `
  --source .\interview.mp4 `
  --preset bold-urban `
  --orientation vertical `
  --subtitles `
  --clip-count 3 `
  --clip-duration 8
```

Enable the Scenario first with `mg scenarios enable short-form-video`.

## `mg scenarios`

```text
mg scenarios list [--output toon|json]
mg scenarios get <id> [--output toon|json]
mg scenarios enable <id> [--output toon|json]
mg scenarios disable <id> [--output toon|json]
```

- `list` shows built-in Scenarios and current enablement.
- `get` shows one Scenario's Presets, Production Options, and routing.
- `enable` adds a Scenario to the workspace manifest.
- `disable` removes a Scenario from workspace enablement.

Built-in IDs are `explainer-video` and `short-form-video`.

## `mg generations list`

```text
mg generations list [--full] [--output toon|json]
```

Lists saved Generation history. Add `--full` to return complete records instead
of the compact list.

## `mg generations get`

```text
mg generations get <id> [--output toon|json]
```

Returns one Generation record.

## `mg generations recreate`

```text
mg generations recreate <id> [options]
```

| Option | Description |
| --- | --- |
| `--prompt <text>` | Override the original Creative Brief. |
| `--style <style>` | Override the original Style. |
| `--preset <id>` | Override the original Scenario Preset. |
| `--option <name=value>` | Override a Production Option. Repeatable. |
| `--deployment <role=id>` | Override Scenario routing. Repeatable. |
| `--force` | Approve a fallback deployment. |

Recreate copies the source choices into a new Generation.

## `mg generations resume`

```text
mg generations resume <id> [--output toon|json]
```

Continues incomplete workflow steps without repeating successful work.

## `mg generations edit`

```text
mg generations edit <id> --prompt <text> [--style <style>] [--output toon|json]
```

Creates a new Generation using an existing output as a Reference Asset.

## `mg generations reference`

```text
mg generations reference --generation <id> [--generation <id> ...] [--output toon|json]
```

Returns reusable output paths for one or more Generations.

## `mg generations export`

```text
mg generations export <id> [--to <path>] [--force] [--output toon|json]
```

| Option | Description |
| --- | --- |
| `--to <path>` | Destination inside the project directory. |
| `--force` | Overwrite existing destination files. |

Without `--to`, Media Gen uses `export.defaultDirectory` from the manifest. If
neither is set, the command asks you to provide an export destination.

## `mg generations delete`

```text
mg generations delete <id> --force [--output toon|json]
```

Permanently deletes one Generation and its outputs. `--force` is required.

## `mg generations cleanup`

```text
mg generations cleanup --force [--output toon|json]
```

Permanently deletes failed and interrupted Generations. `--force` is required.

## `mg relink`

```text
mg relink --from <old-path> [--output toon|json]
```

Reassociates the current project directory with the private Media Workspace
registered at the previous absolute path.

## `mg serve`

```text
mg serve [--port <number>] [--output toon|json]
```

Starts the Local UI on `127.0.0.1`. The default port is `4173`. Keep the
command running and press Ctrl+C to stop it.

## `mg skills`

```text
mg skills
mg skills <action> [reference]
```

Without an action, prints the current agent guidance catalog. Supported
guidance routes include:

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
mg skills export
mg skills troubleshoot
```

## `mg skills install`

```text
mg skills install [--target <target> | --path <directory>] [--force]
```

| Option | Description |
| --- | --- |
| `--target <target>` | `github-copilot`, `claude`, `codex`, or `cursor`. |
| `--path <directory>` | Custom skill parent directory. |
| `--force` | Replace an existing generated skill. |

Example:

```powershell
mg skills install --target github-copilot
```
