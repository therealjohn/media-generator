# Agent-first workflows

The `generate-media` skill lets a coding agent operate Media Gen without
duplicating provider logic. The agent reads current guidance from `mg skills`
and uses `mg` for every mutation.

## Install the skill first

Run the installer from the project directory before asking the agent to set up
Media Gen:

```powershell
mg skills install --target github-copilot
```

Choose the target for the agent you use:

| Target | Installed path |
| --- | --- |
| `github-copilot` | `.github/skills/generate-media/SKILL.md` |
| `claude` | `.claude/skills/generate-media/SKILL.md` |
| `codex` | `.agents/skills/generate-media/SKILL.md` |
| `cursor` | `.cursor/skills/generate-media/SKILL.md` |

Use a custom location when needed:

```powershell
mg skills install --path .\path\to\skills
```

Add `--force` only when you intend to replace an existing generated skill.

## Ask the agent to set up the workspace

Example prompt:

> Use the generate-media skill to initialize Media Gen in this directory.
> Check my Azure CLI authentication, connect the Microsoft Foundry project at
> `https://<resource>.services.ai.azure.com/api/projects/<project>`, and run
> diagnostics. Stop and tell me what I need to fix if any check fails.

The agent should run `mg init`, inspect authentication, configure Foundry, and
finish with `mg doctor`. Interactive Azure sign-in may still require your
attention.

## Ask for an image

> Use the generate-media skill to create a 1600 by 900 minimal-studio image of
> our product on a clean desk with copy-safe space on the left. Export the final
> image to `assets/generated`.

For an existing image:

> Use the generate-media skill to restyle `assets/source.png` as an editorial
> illustration. Preserve the subject and export the result to
> `assets/generated`.

## Ask for a video

> Use the generate-media skill to create an eight-second cinematic product
> reveal in 16:9. Keep the motion restrained, inspect the completed Generation,
> and export the MP4 to `assets/generated`.

## Ask for an Explainer video

> Use the generate-media skill to create a 60-second 16:9 Explainer video about
> retrieval-augmented generation using the editorial-motion-graphics Preset,
> narration, and subtitles. Enable the Scenario if needed, inspect the result,
> and export the final MP4.

When a source is a web page, make the agent read it before creation:

> Read `https://docs.example.com/guide`, then use the generate-media skill to
> create a 40-second visual Explainer of the setup. Put the relevant facts in
> the Creative Brief, preserve the URL as a Web Reference, use subtitles, and
> turn Voice off.

Media Gen records Web Reference URLs but does not fetch them. The agent must
read the page with its own web tools and include the relevant facts in the
Creative Brief.

## Ask for Short-form video

> Use the generate-media skill to turn `interview.mp4` into three eight-second
> vertical clips with the bold-urban Preset and subtitles. Inspect each result
> and export the strongest clip.

The source must be one MP4 or MOV file.

## Iterate on prior work

> Use the generate-media skill to inspect the latest Generation and recreate it
> with a warmer background.

> Use the generate-media skill to edit Generation `<id>` so the product is
> centered on white.

> Use the generate-media skill to resume Generation `<id>` without repeating
> completed workflow steps.

Edit and Recreate always create a new Generation. They do not change the
source record.

## Approval boundaries

The agent should ask before rerunning an operation with `--force`. Media Gen
uses that flag for:

- manually selecting a configured fallback deployment
- overwriting exported files
- deleting one Generation
- cleaning up failed or interrupted Generations
- replacing an installed skill

Do not put Azure keys or tokens in prompts. Configure Speech through
`MEDIA_GEN_SPEECH_API_KEY`, and let Media Gen obtain Foundry tokens from Azure
CLI.
