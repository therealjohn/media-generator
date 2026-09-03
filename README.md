# Media Gen

Media Gen is a local-first image and video generation workspace backed by
Microsoft Foundry. Use it through a coding-agent skill, the `mg` CLI, or a
browser UI served on your machine.

Media Gen can:

- create images and videos with configured Foundry deployments
- build narrated explainer videos and short-form video variants
- keep Generation history and working media outside the project directory
- recreate, edit, resume, reference, and export prior Generations

> [!NOTE]
> Media Gen is an early source-only prototype. There is no published npm
> package, and interfaces may change between revisions.

## Requirements

- Node.js 22 or later
- Azure CLI (`az`)
- access to a Microsoft Foundry project with supported deployments
- Azure Speech only when narrated Explainer videos are required

## Install

```powershell
git clone https://github.com/therealjohn/media-generator.git
cd media-generator
npm ci
npm run build
npm link
mg --help
```

`npm link` makes the `mg` command available globally from this checkout.
Rebuild after pulling source changes.

## Agent-first quickstart

Start in the directory where you want to create media. Install the skill for
your coding agent before setting up the workspace:

```powershell
mg skills install --target github-copilot
```

Other targets are `claude`, `codex`, and `cursor`.

Then prompt the agent:

> Use the generate-media skill to initialize Media Gen in this directory,
> check my Azure CLI authentication, connect the Microsoft Foundry project at
> `https://<resource>.services.ai.azure.com/api/projects/<project>`, run
> diagnostics, create a minimal-studio image for a product launch, and export
> the result to `assets/generated`.

The installed skill tells the agent to inspect the live `mg skills` guidance,
use the CLI for every change, and ask before any operation that requires
`--force`.

See [Agent-first workflows](docs/agent-workflows.md) for more prompts and
supported agent targets.

## Manual CLI quickstart

Run these commands from the directory that should hold the project manifest
and exported assets:

```powershell
mg init
mg auth
mg auth login
mg configure foundry --name primary --endpoint "https://<resource>.services.ai.azure.com/api/projects/<project>"
mg doctor

mg create image --prompt "Create a clean product launch visual" --style minimal-studio
mg generations list
mg generations export <generation-id> --to .\assets\generated
```

Run `mg auth login` only when `mg auth` reports that Azure CLI is signed out.
Use `mg serve` to open the Local UI instead of creating media directly from the
terminal.

## Documentation

- [Getting started](docs/getting-started.md)
- [Agent-first workflows](docs/agent-workflows.md)
- [Creating and managing media](docs/creating-media.md)
- [CLI reference](docs/cli-reference.md)
- [Storage and privacy](docs/storage-and-privacy.md)

Every command also has scoped help, for example:

```powershell
mg create explainer-video --help
mg generations export --help
mg skills install --help
```

For contribution, support, and security guidance, see
[CONTRIBUTING.md](CONTRIBUTING.md), [SUPPORT.md](SUPPORT.md), and
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Third-party material is listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
