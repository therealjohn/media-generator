# Creating and managing media

Media Gen provides general-purpose Generators and purpose-built Scenarios. All
results are recorded as Generations in a private Media Workspace.

## Image Generator

Create an image:

```powershell
mg create image `
  --prompt "Create a clean product launch visual with copy-safe space" `
  --style minimal-studio `
  --width 1600 `
  --height 900
```

Add a local image reference:

```powershell
mg create image `
  --prompt "Restyle this as an editorial illustration" `
  --reference .\source.png `
  --style editorial-illustration
```

Reference support and limits depend on the selected model.

## Video Generator

Create a video:

```powershell
mg create video `
  --prompt "Create a restrained cinematic product reveal" `
  --style cinematic `
  --duration 8 `
  --width 1920 `
  --height 1080
```

Video duration and reference support are validated against the selected model.

## Styles

| Style | Image | Video |
| --- | --- | --- |
| `minimal-studio` | Yes | Yes |
| `product-led` | Yes | Yes |
| `brand-graphic` | Yes | Yes |
| `editorial-illustration` | Yes | No |
| `photoreal-lifestyle` | Yes | Yes |
| `cinematic` | Yes | Yes |
| `handheld-ugc` | No | Yes |
| `kinetic-graphic` | No | Yes |
| `playful-3d` | Yes | Yes |
| `technical-isometric` | Yes | No |

The default is `minimal-studio` for images and `cinematic` for videos.

## Reference Sources

Use local Reference Assets:

```powershell
mg create image --prompt "Use this composition" --reference .\layout.png
```

Repeat `--reference` to supply more than one file when the selected model
supports it.

Record a Web Reference:

```powershell
mg create image `
  --prompt "Use the launch details from the source" `
  --link "https://docs.example.com/launch"
```

Media Gen does not download the URL. Read it yourself, or ask an agent to read
it, and include the relevant facts in the Creative Brief. The URL is stored
only as provenance.

The Local UI also accepts pasted plain text or Markdown as a private Text
Reference.

## Explainer video

Enable the Scenario once per project:

```powershell
mg scenarios enable explainer-video
mg scenarios get explainer-video
```

Create a narrated Explainer:

```powershell
mg create explainer-video `
  --prompt "Explain how retrieval-augmented generation works" `
  --preset editorial-motion-graphics `
  --voice auto `
  --subtitles `
  --duration 60 `
  --aspect-ratio 16:9
```

Use `--voice <voice-id>` for a specific configured Voice or `--no-voice` for a
visual-only result. Duration must be between 15 and 600 seconds and is
normalized to durations composable by the selected video model.

Available Presets:

- `editorial-motion-graphics`
- `stickman-cartoon`
- `watercolor-chronicle`
- `colorful-3d`
- `hand-drawn`
- `poster-vector`

Media Gen plans scenes, creates a shared style reference, generates video and
optional narration for each scene, and composes one final MP4. Intermediate
files remain private.

## Short-form video

Enable the Scenario:

```powershell
mg scenarios enable short-form-video
mg scenarios get short-form-video
```

Create variants from one MP4 or MOV source:

```powershell
mg create short-form-video `
  --source .\interview.mp4 `
  --prompt "Choose the strongest self-contained product insight" `
  --preset bold-urban `
  --orientation vertical `
  --subtitles `
  --clip-count 3 `
  --clip-duration 8
```

`--clip-count` accepts 1 through 4. The selected video model determines the
supported clip durations.

Available Presets:

- `bold-urban`
- `green-contrast`
- `urban-serenity`
- `warm-glow`
- `yellow-frame`
- `monochrome-vibes`
- `marker-scribble`
- `sticker-type`

## Model selection

Auto Selection uses the ordered routing saved in `.mg/config.json`. Select a
specific configured deployment with `--model <id>` for a Generator or
`--deployment <role=id>` for a Scenario.

A fallback deployment is never run automatically. Selecting a configured
fallback requires explicit `--force` approval.

The built-in catalog recognizes:

- MAI Image 2.5, MAI Image 2.5 Flash, and MAI Image 2e
- GPT Image 2
- FLUX.1 Kontext Pro, FLUX 1.1 Pro, FLUX.2 Pro, and FLUX.2 Flex
- Sora 2
- GPT-4.1, GPT-4.1 mini, GPT-5.4, and GPT-5.4 mini for workflow planning
- MAI-Voice-2 Voices configured through Azure Speech

## Generation history

List and inspect records:

```powershell
mg generations list
mg generations get <id>
```

Create a new Generation from prior work:

```powershell
mg generations recreate <id> --prompt "Use a warmer background"
mg generations edit <id> --prompt "Replace the background with white"
```

Resume an incomplete workflow without repeating completed steps:

```powershell
mg generations resume <id>
```

Return output paths for reuse:

```powershell
mg generations reference --generation <id>
```

Export final media into the project:

```powershell
mg generations export <id> --to .\assets\generated
```

Export is the only operation that copies working media into the project
directory. Overwriting an existing destination requires `--force`.

Permanent deletion also requires confirmation:

```powershell
mg generations delete <id> --force
mg generations cleanup --force
```

Cleanup removes only failed and interrupted Generations.

## Local UI

Start the UI:

```powershell
mg serve
```

The browser interface exposes the same application behavior as the CLI,
including Generator and Scenario creation, references, routing, Settings, and
Generation history. It listens only on a loopback address.
