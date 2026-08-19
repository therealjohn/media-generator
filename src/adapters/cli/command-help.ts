interface HelpSection {
  lines: string[]
  title: string
}

interface HelpDefinition {
  nextSteps: string[]
  sections?: HelpSection[]
  summary: string
  usage: string[]
}

const outputOptions = [
  '  --output <format>  Output format: toon or json (default: toon)',
  '  -h, --help         Show command help',
]

const generationOptions = [
  '  --prompt <text>      Creative brief (required)',
  '  --style <style>      Recommended visual style',
  '  --model <id>         Use a specific configured deployment',
  '  --reference <path>   Add a reference file; repeat for multiple files',
  '  --link <url>         Record a Web Reference URL; repeat for multiple URLs',
  '  --width <pixels>     Output width',
  '  --height <pixels>    Output height',
  '  --force              Approve a manually selected fallback deployment',
  ...outputOptions,
]

const definitions: Record<string, HelpDefinition> = {
  '': {
    nextSteps: [
      'Run `{bin} init` to initialize the current directory.',
      'Run `{bin} doctor` to check an existing workspace.',
    ],
    sections: [
      {
        lines: [
          '  auth                 Manage Azure CLI authentication',
          '  configure foundry    Discover and save a Foundry project',
          '  configure speech     Save a private Azure Speech connection',
          '  create               Create with a Generator or Scenario',
          '  doctor               Check workspace health',
          '  generate image       Generate an image',
          '  generate video       Generate a video',
          '  generations          Manage Generation history',
          '  init                 Initialize the current directory',
          '  relink               Reassociate a moved project',
          '  scenarios            Inspect and enable purpose-built Scenarios',
          '  serve                Start the Local UI server',
          '  skills               Show or install agent guidance',
        ],
        title: 'COMMANDS',
      },
      {
        lines: outputOptions,
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} init',
          '  {bin} generate image --prompt "A product hero image"',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Local-first image and video generation workspace',
    usage: ['{bin} [COMMAND] [--output toon|json]'],
  },
  auth: {
    nextSteps: [
      'Run `{bin} auth login` if the state is signed-out.',
      'Run `{bin} configure foundry --help` after signing in.',
    ],
    sections: [
      {
        lines: [
          '  login   Sign in through Azure CLI',
          '  logout  Sign out through Azure CLI',
        ],
        title: 'COMMANDS',
      },
      {
        lines: outputOptions,
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} auth'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Show the current Azure CLI authentication state.',
    usage: ['{bin} auth [--output toon|json]'],
  },
  'auth login': {
    nextSteps: [
      'Run `{bin} auth` to confirm the signed-in account.',
      'Run `{bin} configure foundry --help` to connect a project.',
    ],
    sections: [
      {
        lines: outputOptions,
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} auth login'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Sign in interactively through Azure CLI.',
    usage: ['{bin} auth login [--output toon|json]'],
  },
  'auth logout': {
    nextSteps: ['Run `{bin} auth` to confirm the signed-out state.'],
    sections: [
      {
        lines: outputOptions,
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} auth logout'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Sign out through Azure CLI.',
    usage: ['{bin} auth logout [--output toon|json]'],
  },
  configure: {
    nextSteps: [
      'Run `{bin} configure foundry --help` for required project options.',
      'Run `{bin} configure speech --help` for private narration options.',
    ],
    sections: [
      {
        lines: [
          '  foundry  Discover supported deployments and save the project',
          '  speech   Save a private Azure Speech resource connection',
        ],
        title: 'COMMANDS',
      },
      {
        lines: ['  {bin} configure foundry --help'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Configure model providers for the current workspace.',
    usage: ['{bin} configure <command>'],
  },
  'configure foundry': {
    nextSteps: [
      'Run `{bin} doctor` to check authentication and workspace health.',
      'Run `{bin} generate image --help` or `{bin} generate video --help`.',
    ],
    sections: [
      {
        lines: [
          '  --name <name>      Local provider name (required)',
          '  --endpoint <url>   Microsoft Foundry project endpoint (required)',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} configure foundry --name production --endpoint <project-endpoint>',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary:
      'Discover supported deployments in a Microsoft Foundry project and save them.',
    usage: [
      '{bin} configure foundry --name <name> --endpoint <url> [--output toon|json]',
    ],
  },
  'configure speech': {
    nextSteps: [
      'Run `{bin} doctor` to check Scenario readiness.',
      'Run `{bin} create explainer-video --help` to create narrated media.',
    ],
    sections: [
      {
        lines: [
          '  --endpoint <url>   Azure Speech resource endpoint (required)',
          '  --api-key <key>    API key override; prefer MEDIA_GEN_SPEECH_API_KEY',
          '  --voice <name>     Default MAI Voice name (required)',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: [
          '  MEDIA_GEN_SPEECH_API_KEY  Azure Speech API key (recommended)',
        ],
        title: 'ENVIRONMENT',
      },
      {
        lines: [
          '  Set MEDIA_GEN_SPEECH_API_KEY, then run:',
          '  {bin} configure speech --endpoint https://<resource>.cognitiveservices.azure.com/ --voice en-US-Ethan:MAI-Voice-2',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary:
      'Save a private Azure Speech resource endpoint, API key, and default MAI Voice.',
    usage: [
      '{bin} configure speech --endpoint <url> --voice <name> [--api-key <key>] [--output toon|json]',
    ],
  },
  doctor: {
    nextSteps: [
      'Follow each failing check in the returned help list.',
      'Run `{bin} auth login` if the Azure CLI check is signed-out.',
    ],
    sections: [
      {
        lines: outputOptions,
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} doctor'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Check the manifest, workspace, registry, and Azure CLI.',
    usage: ['{bin} doctor [--output toon|json]'],
  },
  create: {
    nextSteps: [
      'Run `{bin} create image --help` for general image creation.',
      'Run `{bin} scenarios list` to discover purpose-built workflows.',
    ],
    sections: [
      {
        lines: [
          '  image             Create a general image',
          '  video             Create a general video',
          '  explainer-video   Create an Explainer video',
          '  short-form-video  Create Short-form video clips',
        ],
        title: 'COMMANDS',
      },
    ],
    summary: 'Create media with a general Generator or a Scenario.',
    usage: ['{bin} create <image|video|scenario> [options]'],
  },
  'create explainer-video': {
    nextSteps: [
      'Run `{bin} scenarios get explainer-video` to inspect all Presets and options.',
      'Run `{bin} generations get <id>` after creation completes.',
    ],
    sections: [
      {
        lines: [
          '  --prompt <text>         Topic or explanation goal (required)',
          '  --source <path>         Source material; repeat for multiple files',
          '  --link <url>            Record a Web Reference URL',
          '  --preset <id>           Visual Preset',
          '  --voice <id>            Enable narration with this Voice (off by default)',
          '  --narration <text>       Spoken script when --voice is used',
          '  --subtitles             Include subtitles',
          '  --duration <seconds>    Target duration',
          '  --aspect-ratio <ratio>  16:9 or 9:16',
          '  --deployment visuals=<id>  Override the routed visuals deployment',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
    ],
    summary: 'Create a visual Explainer video.',
    usage: [
      '{bin} create explainer-video --prompt <text> [options]',
    ],
  },
  'create short-form-video': {
    nextSteps: [
      'Run `{bin} scenarios get short-form-video` to inspect all Presets and options.',
      'Run `{bin} generations get <id>` after creation completes.',
    ],
    sections: [
      {
        lines: [
          '  --source <video>          Source video (required)',
          '  --link <url>              Record a Web Reference URL',
          '  --prompt <text>           Clip-selection direction',
          '  --preset <id>             Visual Preset',
          '  --orientation <value>     vertical or horizontal',
          '  --language <value>        Source language or auto',
          '  --subtitles               Include subtitles',
          '  --clip-count <number>     Number of clips',
          '  --clip-duration <seconds> Target duration per clip',
          '  --deployment <role=id>    Override a routed deployment',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
    ],
    summary: 'Create styled Short-form video clips from one source video.',
    usage: [
      '{bin} create short-form-video --source <video> [options]',
    ],
  },
  scenarios: {
    nextSteps: [
      'Run `{bin} scenarios get <id>` for Presets and Production Options.',
      'Run `{bin} scenarios enable <id>` before using a disabled Scenario.',
    ],
    sections: [
      {
        lines: [
          '  list       List built-in Scenarios and enablement',
          '  get        Describe one Scenario',
          '  enable     Enable a Scenario in the workspace',
          '  disable    Disable a Scenario in the workspace',
        ],
        title: 'COMMANDS',
      },
    ],
    summary: 'Inspect and configure purpose-built creation Scenarios.',
    usage: ['{bin} scenarios <command>'],
  },
  'scenarios list': scenarioHelp(
    'List built-in Scenarios and workspace enablement.',
    '{bin} scenarios list [--output toon|json]',
  ),
  'scenarios get': scenarioHelp(
    'Describe a Scenario, including Presets and Production Options.',
    '{bin} scenarios get <id> [--output toon|json]',
  ),
  'scenarios enable': scenarioHelp(
    'Enable a built-in Scenario in the current workspace.',
    '{bin} scenarios enable <id> [--output toon|json]',
  ),
  'scenarios disable': scenarioHelp(
    'Disable a built-in Scenario in the current workspace.',
    '{bin} scenarios disable <id> [--output toon|json]',
  ),
  generate: {
    nextSteps: [
      'Run `{bin} generate image --help` for image options.',
      'Run `{bin} generate video --help` for video options.',
    ],
    sections: [
      {
        lines: [
          '  image  Generate an image from a creative brief',
          '  video  Generate a video from a creative brief',
        ],
        title: 'COMMANDS',
      },
      {
        lines: [
          '  {bin} generate image --prompt "A product hero image"',
          '  {bin} generate video --prompt "A five-second launch clip"',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Generate media using configured Microsoft Foundry deployments.',
    usage: ['{bin} generate <image|video> --prompt <text> [options]'],
  },
  'generate image': {
    nextSteps: [
      'Run `{bin} generations list` to inspect saved Generations.',
      'Run `{bin} generations export <id> --help` to export an output.',
    ],
    sections: [
      {
        lines: generationOptions,
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} generate image --prompt "A clean product hero image" --style product-led',
          '  {bin} generate image --prompt "Restyle this image" --reference .\\source.png',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Generate an image from a creative brief.',
    usage: ['{bin} generate image --prompt <text> [options]'],
  },
  'generate video': {
    nextSteps: [
      'Run `{bin} generations list` to inspect saved Generations.',
      'Run `{bin} generations export <id> --help` to export an output.',
    ],
    sections: [
      {
        lines: [
          ...generationOptions.slice(0, 6),
          '  --duration <seconds>  Video duration',
          ...generationOptions.slice(6),
        ],
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} generate video --prompt "A cinematic product launch" --duration 5',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Generate a video from a creative brief.',
    usage: ['{bin} generate video --prompt <text> [options]'],
  },
  generations: {
    nextSteps: [
      'Run `{bin} generations list` to find Generation IDs.',
      'Run `{bin} generations get <id> --help` to inspect one Generation.',
    ],
    sections: [
      {
        lines: [
          '  list       List Generation history',
          '  get        Read one Generation',
          '  export     Copy generated media into the project',
          '  recreate   Generate again from an existing Generation',
          '  edit       Generate from an existing output',
          '  reference  Return reusable output paths',
          '  delete     Permanently delete one Generation',
          '  cleanup    Delete failed and interrupted Generations',
        ],
        title: 'COMMANDS',
      },
      {
        lines: ['  {bin} generations list'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Inspect, reuse, export, and remove saved Generations.',
    usage: ['{bin} generations <command>'],
  },
  'generations list': {
    nextSteps: [
      'Run `{bin} generations get <id>` to inspect a result.',
      'Use `--full` when complete Generation records are needed.',
    ],
    sections: [
      {
        lines: [
          '  --full             Return complete Generation records',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} generations list --output json'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'List saved Generation history.',
    usage: [
      '{bin} generations list [--full] [--output toon|json]',
    ],
  },
  'generations cleanup': {
    nextSteps: [
      'Run `{bin} generations list` to inspect the remaining history.',
    ],
    sections: [
      {
        lines: [
          '  --force             Confirm permanent cleanup (required)',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} generations cleanup --force'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Delete all failed and interrupted Generations.',
    usage: [
      '{bin} generations cleanup --force [--output toon|json]',
    ],
  },
  'generations get': {
    nextSteps: [
      'Run `{bin} generations export <id> --help` to export its outputs.',
      'Run `{bin} generations recreate <id> --help` to generate again.',
    ],
    sections: [
      {
        lines: outputOptions,
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} generations get 01GENERATION'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Read one Generation record by ID.',
    usage: ['{bin} generations get <id> [--output toon|json]'],
  },
  'generations delete': {
    nextSteps: [
      'Run `{bin} generations list` to confirm the Generation was removed.',
    ],
    sections: [
      {
        lines: [
          '  --force             Confirm permanent deletion (required)',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} generations delete 01GENERATION --force'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Permanently delete one Generation and its outputs.',
    usage: [
      '{bin} generations delete <id> --force [--output toon|json]',
    ],
  },
  'generations export': {
    nextSteps: [
      'Open the returned file paths from the project directory.',
      'Run `{bin} generations get <id>` to inspect the source record.',
    ],
    sections: [
      {
        lines: [
          '  --to <path>         Export directory; defaults to manifest configuration',
          '  --force             Overwrite existing destination files',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} generations export 01GENERATION --to .\\exports',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Copy a Generation output into the project directory.',
    usage: [
      '{bin} generations export <id> [--to <path>] [--force] [--output toon|json]',
    ],
  },
  'generations recreate': {
    nextSteps: [
      'Run `{bin} generations get <new-id>` using the returned Generation ID.',
    ],
    sections: [
      {
        lines: [
          '  --prompt <text>     Override the original creative brief',
          '  --style <style>     Override the original style',
          '  --preset <id>       Override the original Scenario Preset',
          '  --option <name=value> Override a Production Option; repeatable',
          '  --deployment <role=id> Override Scenario routing; repeatable',
          '  --force             Approve a fallback deployment',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} generations recreate 01GENERATION --prompt "Use a darker background"',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Generate again from an existing Generation.',
    usage: [
      '{bin} generations recreate <id> [--prompt <text>] [--style <style>] [--output toon|json]',
    ],
  },
  'generations edit': {
    nextSteps: [
      'Run `{bin} generations get <new-id>` using the returned Generation ID.',
    ],
    sections: [
      {
        lines: [
          '  --prompt <text>     Edit instruction (required)',
          '  --style <style>     Style for the new Generation',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} generations edit 01GENERATION --prompt "Replace the background with white"',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Create a new Generation using an existing output as reference.',
    usage: [
      '{bin} generations edit <id> --prompt <text> [--style <style>] [--output toon|json]',
    ],
  },
  'generations reference': {
    nextSteps: [
      'Pass a returned path to `{bin} generate image --reference <path>`.',
    ],
    sections: [
      {
        lines: [
          '  --generation <id>  Generation to reference; repeat for multiple IDs',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} generations reference --generation 01FIRST --generation 01SECOND',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Return reusable output paths for one or more Generations.',
    usage: [
      '{bin} generations reference --generation <id> [--generation <id> ...] [--output toon|json]',
    ],
  },
  init: {
    nextSteps: [
      'Run `{bin} auth` to inspect Azure CLI authentication.',
      'Run `{bin} configure foundry --help` to connect a Foundry project.',
    ],
    sections: [
      {
        lines: outputOptions,
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} init'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Initialize the current directory as a Media Gen project.',
    usage: ['{bin} init [--output toon|json]'],
  },
  relink: {
    nextSteps: [
      'Run `{bin} doctor` to verify the moved project association.',
    ],
    sections: [
      {
        lines: [
          '  --from <old-path>   Previous absolute project path (required)',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} relink --from C:\\projects\\old-location'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Reassociate a moved project with its existing Media Workspace.',
    usage: [
      '{bin} relink --from <old-path> [--output toon|json]',
    ],
  },
  serve: {
    nextSteps: [
      'Open the returned loopback URL in a browser.',
      'Press Ctrl+C in the terminal to stop the server.',
    ],
    sections: [
      {
        lines: [
          '  --port <number>     Loopback port (default: 4173)',
          ...outputOptions,
        ],
        title: 'OPTIONS',
      },
      {
        lines: ['  {bin} serve --port 4173'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Start the bundled Local UI server on a loopback address.',
    usage: [
      '{bin} serve [--port <number>] [--output toon|json]',
    ],
  },
  skills: {
    nextSteps: [
      'Run `{bin} skills install --help` to install the Agent Skill.',
      'Run `{bin} skills generate image` for agent-facing generation guidance.',
    ],
    sections: [
      {
        lines: [
          '  initialize                Show initialization guidance',
          '  configure foundry         Show Foundry configuration guidance',
          '  create <scenario>         Show Scenario creation guidance',
          '  generate image|video      Show media generation guidance',
          '  scenarios                 Show Scenario discovery guidance',
          '  inspect generations       Show Generation inspection guidance',
          '  export                    Show export guidance',
          '  troubleshoot              Show troubleshooting guidance',
          '  install                   Install the lightweight Agent Skill',
        ],
        title: 'ACTIONS',
      },
      {
        lines: ['  {bin} skills generate image'],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Show current agent guidance or install the Media Gen Agent Skill.',
    usage: ['{bin} skills [action] [reference]'],
  },
  'skills install': {
    nextSteps: [
      'Open the installed SKILL.md to review the generated guidance.',
      'Run `{bin} skills` to list available runtime guidance.',
    ],
    sections: [
      {
        lines: [
          '  --target <target>    claude, codex, cursor, or github-copilot',
          '  --path <directory>   Install into a custom directory',
          '  --force              Replace an existing installed skill',
          '  -h, --help           Show command help',
        ],
        title: 'OPTIONS',
      },
      {
        lines: [
          '  {bin} skills install --target github-copilot',
          '  {bin} skills install --path .\\.agents\\skills',
        ],
        title: 'EXAMPLES',
      },
    ],
    summary: 'Install the lightweight generate-media Agent Skill.',
    usage: [
      '{bin} skills install [--target <target> | --path <directory>] [--force]',
    ],
  },
  'skills initialize': guidanceHelp(
    'Show agent-facing project initialization guidance.',
    '{bin} skills initialize',
    'Run the displayed `{bin} init` command in the project directory.',
  ),
  'skills configure': guidanceHelp(
    'Show agent-facing Microsoft Foundry configuration guidance.',
    '{bin} skills configure foundry',
    'Run the displayed authentication and configuration commands in order.',
  ),
  'skills generate': guidanceHelp(
    'Show agent-facing image or video generation guidance.',
    '{bin} skills generate <image|video>',
    'Run `{bin} skills generate image` or `{bin} skills generate video`.',
  ),
  'skills create': guidanceHelp(
    'Show agent-facing Scenario creation guidance.',
    '{bin} skills create <explainer-video|short-form-video>',
    'Run `{bin} skills create explainer-video` or `{bin} skills create short-form-video`.',
  ),
  'skills create explainer-video': guidanceHelp(
    'Show agent-facing Explainer video guidance.',
    '{bin} skills create explainer-video',
    'Run the displayed `{bin} scenarios enable` and `{bin} create explainer-video` commands.',
  ),
  'skills create short-form-video': guidanceHelp(
    'Show agent-facing Short-form video guidance.',
    '{bin} skills create short-form-video',
    'Run the displayed `{bin} scenarios enable` and `{bin} create short-form-video` commands.',
  ),
  'skills scenarios': guidanceHelp(
    'Show agent-facing Scenario discovery and enablement guidance.',
    '{bin} skills scenarios',
    'Run the displayed `{bin} scenarios list` command.',
  ),
  'skills generate image': guidanceHelp(
    'Show agent-facing image generation guidance.',
    '{bin} skills generate image',
    'Run the displayed `{bin} generate image` command with a creative brief.',
  ),
  'skills generate video': guidanceHelp(
    'Show agent-facing video generation guidance.',
    '{bin} skills generate video',
    'Run the displayed `{bin} generate video` command with a creative brief.',
  ),
  'skills inspect': guidanceHelp(
    'Show agent-facing Generation inspection guidance.',
    '{bin} skills inspect generations',
    'Run the displayed list command, then inspect a returned Generation ID.',
  ),
  'skills export': guidanceHelp(
    'Show agent-facing Generation export guidance.',
    '{bin} skills export',
    'Run the displayed export command with a Generation ID.',
  ),
  'skills troubleshoot': guidanceHelp(
    'Show agent-facing troubleshooting guidance.',
    '{bin} skills troubleshoot',
    'Run the displayed `{bin} doctor` command and follow its help list.',
  ),
}

definitions['skills configure foundry'] = definitions['skills configure']!
definitions['skills inspect generations'] = definitions['skills inspect']!
definitions['create image'] = {
  ...definitions['generate image']!,
  usage: ['{bin} create image --prompt <text> [options]'],
}
definitions['create video'] = {
  ...definitions['generate video']!,
  usage: ['{bin} create video --prompt <text> [options]'],
}

export function formatCommandHelp(
  bin: string,
  argv: string[],
): string {
  const path = extractHelpPath(argv)
  const definition = findDefinition(path)
  const lines = [
    'Media Gen',
    '',
    definition.summary,
    '',
    'USAGE',
    ...definition.usage.map((usage) => `  ${usage}`),
  ]

  for (const section of definition.sections ?? []) {
    lines.push('', section.title, ...section.lines)
  }

  lines.push(
    '',
    'NEXT STEPS',
    ...definition.nextSteps.map((step) => `  ${step}`),
    '',
  )

  return lines
    .join('\n')
    .replaceAll('{bin}', bin)
}

function guidanceHelp(
  summary: string,
  usage: string,
  nextStep: string,
): HelpDefinition {
  return {
    nextSteps: [nextStep],
    sections: [
      {
        lines: [`  ${usage}`],
        title: 'EXAMPLES',
      },
    ],
    summary,
    usage: [usage],
  }
}

function scenarioHelp(
  summary: string,
  usage: string,
): HelpDefinition {
  return {
    nextSteps: ['Run `{bin} scenarios list` to inspect current enablement.'],
    sections: [
      {
        lines: outputOptions,
        title: 'OPTIONS',
      },
    ],
    summary,
    usage: [usage],
  }
}

function findDefinition(path: string[]): HelpDefinition {
  for (let length = path.length; length >= 0; length -= 1) {
    const definition = definitions[path.slice(0, length).join(' ')]
    if (definition !== undefined) {
      return definition
    }
  }

  return definitions['']!
}

function extractHelpPath(argv: string[]): string[] {
  const valueFlags = new Set([
    '--duration',
    '--aspect-ratio',
    '--clip-count',
    '--clip-duration',
    '--deployment',
    '--endpoint',
    '--from',
    '--generation',
    '--height',
    '--model',
    '--narration',
    '--language',
    '--link',
    '--name',
    '--output',
    '--path',
    '--orientation',
    '--option',
    '--preset',
    '--port',
    '--prompt',
    '--reference',
    '--source',
    '--style',
    '--target',
    '--to',
    '--voice',
    '--width',
  ])
  const path: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '-h' || argument === '--help') {
      continue
    }
    if (argument !== undefined && valueFlags.has(argument)) {
      index += 1
      continue
    }
    if (argument === undefined || argument.startsWith('-')) {
      continue
    }
    path.push(argument)
  }

  return path
}
