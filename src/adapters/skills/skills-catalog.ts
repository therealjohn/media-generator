const catalog = `# Media Gen Skills

Use the current CLI guidance instead of guessing commands.

## Actions

- \`initialize\` - initialize a Project Directory
- \`configure\` - configure Foundry projects and private Azure Speech
- \`create\` - create media with a Generator or Scenario
- \`generate\` - create image or video media
- \`scenarios\` - inspect and enable purpose-built workflows
- \`inspect\` - inspect Generation history and details
- \`export\` - copy selected media into the Project Directory
- \`troubleshoot\` - diagnose workspace, authentication, and provider failures

## References

\`\`\`text
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
\`\`\`
`

const references: Record<string, string> = {
  initialize: `# Initialize

Run \`mg init\` in the Project Directory, then run \`mg\` to inspect the workspace.
`,
  'configure/foundry': `# Configure Microsoft Foundry

1. Run \`mg auth\`.
2. If needed, run \`mg auth login\`.
3. Run \`mg configure foundry --name <name> --endpoint <project-endpoint>\`.

Media Gen discovers supported deployments and writes non-secret mappings to \`.mg/config.json\`.
`,
  'configure/speech': `# Configure Azure Speech

Run:

\`\`\`text
mg configure speech --endpoint https://<resource>.cognitiveservices.azure.com/ --api-key <key> --voice en-US-Ethan:MAI-Voice-2
\`\`\`

Media Gen stores the Speech Connection in the private Local Profile. The API key is never written to \`.mg/config.json\`, Generation records, or structured output.
`,
  'generate/image': `# Generate an image

Run:

\`\`\`text
mg generate image --prompt "<creative brief>" [--style minimal-studio|brand-graphic|editorial-illustration|photoreal-lifestyle|cinematic] [--reference <path>] [--link <url>]
\`\`\`

Use natural language for the requested content. References are optional and model capability-gated. Before using \`--link\`, read the URL with the agent's web tools and incorporate the relevant content into the Creative Brief; Media Gen records the URL but does not fetch it.
`,
  'generate/video': `# Generate a video

Run:

\`\`\`text
mg generate video --prompt "<creative brief>" [--style cinematic|handheld-ugc|kinetic-graphic|minimal-studio|photoreal-lifestyle] [--reference <path>] [--link <url>]
\`\`\`

The command waits for Sora to complete and saves the MP4 in the Media Workspace. Before using \`--link\`, read the URL with the agent's web tools and incorporate the relevant content into the Creative Brief; Media Gen does not fetch links.
`,
  'create/explainer-video': `# Create an Explainer video

Enable and inspect the Scenario:

\`\`\`text
mg scenarios enable explainer-video
mg scenarios get explainer-video
\`\`\`

Create:

\`\`\`text
mg create explainer-video --prompt "<topic or explanation goal>" --preset editorial-motion-graphics --subtitles --duration 12 --aspect-ratio 16:9 [--link <url>]
\`\`\`

Voice is disabled by default, so the Scenario only requires a routed \`visuals\` deployment and creates a Sora MP4. To add narration, configure Azure Speech and pass \`--voice <voice-id>\`; optionally pass \`--narration "<spoken script>"\`, otherwise the Creative Brief is spoken. Narration produces a separate MP3 and media muxing remains separate. Agents must read each linked source themselves and put the relevant facts in the Creative Brief; \`--link\` preserves provenance only.
`,
  'create/short-form-video': `# Create Short-form video

Enable and inspect the Scenario:

\`\`\`text
mg scenarios enable short-form-video
mg scenarios get short-form-video
\`\`\`

Create:

\`\`\`text
mg create short-form-video --source <video.mp4> --preset bold-urban --orientation vertical --subtitles --clip-count 1 --clip-duration 8
\`\`\`

The source must be one MP4 or MOV file. The routed video model creates one or more styled variants.
`,
  scenarios: `# Scenarios

Run \`mg scenarios list\`, then \`mg scenarios get <id>\`.

Enable a workflow with \`mg scenarios enable <id>\` before creating it.
`,
  'inspect/generations': `# Inspect Generations

Run \`mg generations list\`, then \`mg generations get <id>\`.
`,
  export: `# Export

Run \`mg generations export <id> [--to <directory>]\`.

Use \`--force\` only after approval when the destination exists.
`,
  troubleshoot: `# Troubleshoot

Run \`mg doctor\`, then inspect its failing checks and next-step guidance.
`,
}

export function getSkillContent(
  action?: string,
  reference?: string,
): string {
  if (action !== undefined) {
    const content =
      references[
        reference === undefined ? action : `${action}/${reference}`
      ]
    if (content !== undefined) {
      return content
    }
  }

  return catalog
}
