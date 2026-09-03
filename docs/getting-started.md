# Getting started

## Prerequisites

Install:

- Node.js 22 or later
- Azure CLI (`az`)
- Git

You also need access to a Microsoft Foundry project with supported model
deployments, the required Azure RBAC permissions, and available quota.

Narrated Explainer videos additionally require an Azure Speech resource and API
key. Image generation, general video generation, Short-form video, and
visual-only Explainer video do not require Speech.

## Install from source

Media Gen is not published as an npm package. Build and link the CLI from a
checkout:

```powershell
git clone https://github.com/therealjohn/media-generator.git
cd media-generator
npm ci
npm run build
npm link
```

Verify the executable:

```powershell
mg --help
```

The linked `mg` command runs `dist/cli.js` from the checkout. Run
`npm run build` after pulling or changing source files.

## Initialize a project

Create or open the directory where you want the manifest and exported media:

```powershell
New-Item -ItemType Directory media-project
Set-Location media-project
mg init
```

`mg init` creates `.mg/config.json` and associates the directory with a private
Media Workspace under `~/.media-gen`.

## Authenticate with Azure

Check the Azure CLI session:

```powershell
mg auth
```

If the result is signed out:

```powershell
mg auth login
```

Media Gen uses the current Azure CLI identity for Foundry requests. Azure
access tokens stay in memory and are not written to Media Gen files.

## Connect Microsoft Foundry

Use the project endpoint shown by Microsoft Foundry:

```powershell
mg configure foundry `
  --name primary `
  --endpoint "https://<resource>.services.ai.azure.com/api/projects/<project>"
```

The command discovers supported deployments and records non-secret provider,
deployment, and routing information in `.mg/config.json`. Repeat it with a
different `--name` to connect another Foundry project.

Run diagnostics after configuration:

```powershell
mg doctor
```

## Configure narration

Skip this section if Explainer videos will use `--no-voice`.

Set the Speech key through the environment so it does not appear in shell
history:

```powershell
$env:MEDIA_GEN_SPEECH_API_KEY = Read-Host -MaskInput "Azure Speech API key"
mg configure speech `
  --endpoint "https://<speech-region>.tts.speech.microsoft.com/" `
  --voice "en-US-Ethan:MAI-Voice-2"
Remove-Item Env:\MEDIA_GEN_SPEECH_API_KEY
```

The Speech endpoint, key, and default Voice are stored in the machine-local
Local Profile, not `.mg/config.json`. Omit the key when changing an existing
connection to retain the saved value.

## Choose an interface

Use a coding agent:

```powershell
mg skills install --target github-copilot
```

Continue with [Agent-first workflows](agent-workflows.md).

Use the CLI:

```powershell
mg create image --prompt "Create a clean product launch visual"
```

Continue with [Creating and managing media](creating-media.md) or the
[CLI reference](cli-reference.md).

Use the Local UI:

```powershell
mg serve
```

Open the returned loopback URL. Keep the command running while using the UI and
press Ctrl+C to stop it.

## Troubleshooting

Start with:

```powershell
mg doctor
```

The result checks the manifest, private workspace, registry, Azure CLI, and
Scenario readiness, and includes next steps for failed checks.

For command syntax, use scoped help:

```powershell
mg configure foundry --help
mg create image --help
mg generations export --help
```
