# Storage and privacy

Media Gen separates shared project configuration from private working state.

## Project directory

`mg init` creates:

```text
<project>/.mg/config.json
```

The manifest contains:

- the workspace name
- enabled Scenarios
- non-secret Foundry project endpoints
- discovered deployment metadata
- ordered Auto Selection routes
- the default export directory, when configured

It does not contain Azure tokens or Speech API keys. Foundry endpoint and
deployment names are not credentials, but they may still reveal internal
resource names. Review them before publishing a project repository.

Exported assets are written into the project directory only when you run
`mg generations export`.

## Private Media Workspace

Machine-local state lives under:

```text
~/.media-gen/
|- registry.json
`- workspaces/
   `- <workspace>/
      |- local.json
      `- generations/
```

The registry associates project paths with private workspaces. `local.json`
contains machine-specific settings, including the Azure Speech endpoint, key,
and default Voice when configured.

Each Generation stores its request, status, reference metadata, private Text
References, working files, and outputs. Edit and Recreate produce new records
instead of modifying an existing Generation.

Do not copy `~/.media-gen` into a repository.

## What leaves the machine

When you create media, Media Gen sends the selected provider:

- the Creative Brief
- internally assembled provider instructions
- selected local Reference Assets
- private Text Reference content
- requested dimensions, duration, and other controls

Web Reference URLs are recorded as provenance but are not fetched by Media Gen.
If an agent uses a Web Reference, the agent reads it separately and puts the
relevant facts in the Creative Brief.

Provider safety policies and retention behavior are controlled by the
configured Microsoft service.

## Credentials

Foundry authentication uses the current Azure CLI identity. Access tokens are
kept in memory and are never written to Media Gen configuration or Generation
records.

Configure Speech with `MEDIA_GEN_SPEECH_API_KEY` instead of putting the key on
the command line:

```powershell
$env:MEDIA_GEN_SPEECH_API_KEY = Read-Host -MaskInput "Azure Speech API key"
mg configure speech `
  --endpoint "https://<speech-region>.tts.speech.microsoft.com/" `
  --voice "en-US-Ethan:MAI-Voice-2"
Remove-Item Env:\MEDIA_GEN_SPEECH_API_KEY
```

The Speech key is stored only in the private Local Profile. It is not returned
by Settings APIs or structured CLI output.

## Local UI

`mg serve` binds to `127.0.0.1` and accepts only loopback Host and Origin
values. It has no LAN mode and no product authentication. Do not proxy or
expose it to a network.

## Logs and telemetry

Media Gen has no product telemetry or hosted history. Diagnostics and working
state stay under `~/.media-gen`.

CLI results are structured on stdout. Progress and diagnostics use stderr.
Use `--output json` when another program needs to parse a result.
