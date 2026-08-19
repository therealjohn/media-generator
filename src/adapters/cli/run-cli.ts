import {Args, Flags, Parser} from '@oclif/core'
import {encode} from '@toon-format/toon'

import {
  createMediaGenApplication,
  type MediaGenApplication,
  type MediaGenCommand,
} from '../../application/media-gen-application.js'
import {MediaGenError} from '../../application/media-gen-error.js'
import {defaultStyleFor} from '../../catalog/styles.js'
import {
  getScenarioDefinition,
  parseScenarioRequest,
} from '../../catalog/scenarios.js'
import {
  startLocalServer,
  type LocalServerOptions,
} from '../http/local-server.js'
import {getSkillContent} from '../skills/skills-catalog.js'
import {
  installAgentSkill,
  type SkillTarget,
} from '../skills/skill-installer.js'
import {formatCommandHelp} from './command-help.js'

export interface CliContext {
  bin: string
  cwd: string
  env?: NodeJS.ProcessEnv
  mediaGenHome: string
  stderr: (text: string) => void
  stdout: (text: string) => void
}

export interface CliDependencies {
  startServer(
    options: LocalServerOptions,
    port?: number,
  ): Promise<{
    server: {close(): Promise<unknown>}
    url: string
  }>
}

const defaultCliDependencies: CliDependencies = {
  startServer: startLocalServer,
}

export async function runCli(
  argv: string[],
  context: CliContext,
  application: MediaGenApplication = createMediaGenApplication(),
  dependencyOverrides: Partial<CliDependencies> = {},
): Promise<number> {
  const dependencies = {
    ...defaultCliDependencies,
    ...dependencyOverrides,
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    context.stdout(formatCommandHelp(context.bin, argv))
    return 0
  }

  const unknownFlag = argv.find(
    (argument) =>
      argument.startsWith('-') &&
      argument !== '--api-key' &&
      !argument.startsWith('--api-key=') &&
      argument !== '--endpoint' &&
      !argument.startsWith('--endpoint=') &&
      argument !== '--from' &&
      !argument.startsWith('--from=') &&
      argument !== '--force' &&
      argument !== '--full' &&
      argument !== '--generation' &&
      !argument.startsWith('--generation=') &&
      argument !== '--height' &&
      !argument.startsWith('--height=') &&
      argument !== '--name' &&
      !argument.startsWith('--name=') &&
      argument !== '--model' &&
      !argument.startsWith('--model=') &&
      argument !== '--narration' &&
      !argument.startsWith('--narration=') &&
      argument !== '--output' &&
      !argument.startsWith('--output=') &&
      argument !== '--path' &&
      !argument.startsWith('--path=') &&
      argument !== '--port' &&
      !argument.startsWith('--port=') &&
      argument !== '--prompt' &&
      !argument.startsWith('--prompt=') &&
      argument !== '--reference' &&
      !argument.startsWith('--reference=') &&
      argument !== '--style' &&
      !argument.startsWith('--style=') &&
      argument !== '--target' &&
      !argument.startsWith('--target=') &&
      argument !== '--to' &&
      !argument.startsWith('--to=') &&
      argument !== '--duration' &&
      !argument.startsWith('--duration=') &&
      argument !== '--aspect-ratio' &&
      !argument.startsWith('--aspect-ratio=') &&
      argument !== '--clip-count' &&
      !argument.startsWith('--clip-count=') &&
      argument !== '--clip-duration' &&
      !argument.startsWith('--clip-duration=') &&
      argument !== '--deployment' &&
      !argument.startsWith('--deployment=') &&
      argument !== '--language' &&
      !argument.startsWith('--language=') &&
      argument !== '--link' &&
      !argument.startsWith('--link=') &&
      argument !== '--orientation' &&
      !argument.startsWith('--orientation=') &&
      argument !== '--option' &&
      !argument.startsWith('--option=') &&
      argument !== '--preset' &&
      !argument.startsWith('--preset=') &&
      argument !== '--source' &&
      !argument.startsWith('--source=') &&
      argument !== '--subtitles' &&
      argument !== '--voice' &&
      !argument.startsWith('--voice=') &&
      argument !== '--width' &&
      !argument.startsWith('--width='),
  )

  if (unknownFlag !== undefined) {
    context.stdout(
      `${encode({
        code: 'unknown_flag',
        error: true,
        help: ['Run `mg --help`'],
        message: `Unknown flag "${unknownFlag}"`,
      })}\n`,
    )
    return 2
  }

  const requestedCommand = findCommand(argv)
  if (
    requestedCommand !== undefined &&
    requestedCommand !== 'auth' &&
    requestedCommand !== 'configure' &&
    requestedCommand !== 'create' &&
    requestedCommand !== 'doctor' &&
    requestedCommand !== 'generate' &&
    requestedCommand !== 'generations' &&
    requestedCommand !== 'init' &&
    requestedCommand !== 'relink'
    && requestedCommand !== 'scenarios'
    && requestedCommand !== 'serve'
    && requestedCommand !== 'skills'
  ) {
    context.stdout(
      `${encode({
        code: 'unknown_command',
        error: true,
        help: ['Run `mg --help`'],
        message: `Unknown command "${requestedCommand}"`,
      })}\n`,
    )
    return 2
  }

  const requestedOutput = argv
    .map((argument, index) => {
      if (argument.startsWith('--output=')) {
        return argument.slice('--output='.length)
      }

      if (argument === '--output') {
        return argv[index + 1]
      }

      return undefined
    })
    .find((value) => value !== undefined)

  if (
    requestedOutput !== undefined &&
    requestedOutput !== 'json' &&
    requestedOutput !== 'toon'
  ) {
    context.stdout(
      `${encode({
        code: 'invalid_output_format',
        error: true,
        help: ['Use `--output toon` or `--output json`'],
        message: `Unknown output format "${requestedOutput}"`,
      })}\n`,
    )
    return 2
  }

  const {args, flags} = await Parser.parse(argv, {
    args: {
      command: Args.string({
        options: [
          'auth',
          'configure',
          'create',
          'doctor',
          'generate',
          'generations',
          'init',
          'relink',
          'scenarios',
          'serve',
          'skills',
        ],
        required: false,
      }),
      action: Args.string({
        options: [
          'cleanup',
          'create',
          'disable',
          'enable',
          'explainer-video',
          'foundry',
          'configure',
          'delete',
          'edit',
          'export',
          'generate',
          'get',
          'image',
          'initialize',
          'inspect',
          'install',
          'login',
          'list',
          'logout',
          'recreate',
          'reference',
          'scenarios',
          'short-form-video',
          'speech',
          'troubleshoot',
          'video',
        ],
        required: false,
      }),
      id: Args.string({required: false}),
    },
    flags: {
      'api-key': Flags.string(),
      endpoint: Flags.string(),
      'aspect-ratio': Flags.string(),
      'clip-count': Flags.integer(),
      'clip-duration': Flags.integer(),
      deployment: Flags.string({multiple: true}),
      from: Flags.string(),
      force: Flags.boolean({default: false}),
      full: Flags.boolean({default: false}),
      generation: Flags.string({multiple: true}),
      height: Flags.integer(),
      name: Flags.string(),
      model: Flags.string(),
      narration: Flags.string(),
      output: Flags.string({
        default: 'toon',
        options: ['json', 'toon'],
      }),
      path: Flags.string(),
      language: Flags.string(),
      link: Flags.string({multiple: true}),
      orientation: Flags.string(),
      option: Flags.string({multiple: true}),
      preset: Flags.string(),
      port: Flags.integer({default: 4173}),
      prompt: Flags.string(),
      reference: Flags.string({multiple: true}),
      source: Flags.string({multiple: true}),
      style: Flags.string(),
      subtitles: Flags.boolean({default: false}),
      target: Flags.string({
        options: [
          'claude',
          'codex',
          'cursor',
          'github-copilot',
        ],
      }),
      to: Flags.string(),
      duration: Flags.integer(),
      voice: Flags.string(),
      width: Flags.integer(),
    },
    strict: true,
  })

  let command: MediaGenCommand
  try {
    command =
      args.command === 'auth'
      ? args.action === 'login'
        ? {type: 'auth-login' as const}
        : args.action === 'logout'
          ? {type: 'auth-logout' as const}
          : {type: 'auth-status' as const}
      : args.command === 'configure' &&
          args.action === 'foundry'
        ? {
            endpoint: flags.endpoint ?? '',
            name: flags.name ?? '',
            type: 'configure-foundry' as const,
          }
      : args.command === 'configure' &&
          args.action === 'speech'
        ? {
            apiKey:
              flags['api-key'] ??
              context.env?.MEDIA_GEN_SPEECH_API_KEY ??
              process.env.MEDIA_GEN_SPEECH_API_KEY ??
              '',
            endpoint: flags.endpoint ?? '',
            type: 'configure-speech' as const,
            voice: flags.voice ?? '',
          }
      : args.command === 'doctor'
      ? {type: 'doctor' as const}
      : args.command === 'create' &&
        (args.action === 'image' || args.action === 'video')
      ? {
          force: flags.force === true,
          request: {
            controls: {
              ...(flags.duration === undefined
                ? {}
                : {nSeconds: flags.duration}),
              ...(flags.height === undefined
                ? {}
                : {height: flags.height}),
              ...(flags.width === undefined ? {} : {width: flags.width}),
            },
            creativeBrief: flags.prompt ?? '',
            deploymentId: flags.model,
            generator: args.action,
            kind: 'generator' as const,
            referencePaths: flags.reference ?? [],
            style:
              flags.style ?? defaultStyleFor(args.action),
            ...(flags.link === undefined
              ? {}
              : {webReferenceUrls: flags.link}),
          },
          type: 'create' as const,
        }
      : args.command === 'create' &&
        (args.action === 'explainer-video' ||
          args.action === 'short-form-video')
      ? {
          force: flags.force === true,
          request: parseScenarioRequest(args.action, {
            creativeBrief: flags.prompt ?? '',
            deploymentOverrides: parseDeploymentOverrides(
              flags.deployment ?? [],
            ),
            options:
              args.action === 'explainer-video'
                ? {
                    ...(flags['aspect-ratio'] === undefined
                      ? {}
                      : {'aspect-ratio': flags['aspect-ratio']}),
                    ...(flags.duration === undefined
                      ? {}
                      : {duration: flags.duration}),
                    ...(flags.narration === undefined
                      ? {}
                      : {narration: flags.narration}),
                    subtitles: flags.subtitles === true,
                    ...(flags.voice === undefined
                      ? {}
                      : {voice: flags.voice}),
                  }
                : {
                    ...(flags['clip-count'] === undefined
                      ? {}
                      : {'clip-count': flags['clip-count']}),
                    ...(flags['clip-duration'] === undefined
                      ? {}
                      : {'clip-duration': flags['clip-duration']}),
                    ...(flags.language === undefined
                      ? {}
                      : {language: flags.language}),
                    ...(flags.orientation === undefined
                      ? {}
                      : {orientation: flags.orientation}),
                    subtitles: flags.subtitles === true,
                  },
            ...(flags.preset === undefined
              ? {}
              : {preset: flags.preset}),
            sourcePaths: flags.source ?? [],
            ...(flags.link === undefined
              ? {}
              : {webReferenceUrls: flags.link}),
          }),
          type: 'create' as const,
        }
      : args.command === 'generate' &&
        (args.action === 'image' || args.action === 'video')
      ? {
          creativeBrief: flags.prompt ?? '',
          controls: {
            ...(flags.duration === undefined
              ? {}
              : {nSeconds: flags.duration}),
            ...(flags.height === undefined
              ? {}
              : {height: flags.height}),
            ...(flags.width === undefined ? {} : {width: flags.width}),
          },
          deploymentId: flags.model,
          force: flags.force === true,
          mediaType:
            args.action === 'image' ? 'image' : 'video',
          referencePaths: flags.reference ?? [],
          style:
            flags.style ??
            defaultStyleFor(
              args.action === 'image' ? 'image' : 'video',
            ),
          ...(flags.link === undefined
            ? {}
            : {webReferenceUrls: flags.link}),
          type: 'generate' as const,
        }
      : args.command === 'generations' &&
        args.action === 'list'
        ? {type: 'generations-list' as const}
      : args.command === 'generations' &&
        args.action === 'cleanup'
        ? {
          force: flags.force === true,
          type: 'generations-cleanup' as const,
        }
      : args.command === 'generations' &&
        args.action === 'get'
        ? {
          id: args.id ?? '',
          type: 'generations-get' as const,
        }
      : args.command === 'generations' &&
        args.action === 'delete'
        ? {
          force: flags.force === true,
          id: args.id ?? '',
          type: 'generations-delete' as const,
        }
      : args.command === 'generations' &&
        args.action === 'export'
        ? {
          force: flags.force === true,
          id: args.id ?? '',
          to: flags.to,
          type: 'generations-export' as const,
        }
      : args.command === 'generations' &&
        args.action === 'recreate'
        ? {
          creativeBrief: flags.prompt,
          deploymentOverrides: parseDeploymentOverrides(
            flags.deployment ?? [],
          ),
          force: flags.force === true,
          id: args.id ?? '',
          options: parseOptionOverrides(flags.option ?? []),
          preset: flags.preset,
          style: flags.style,
          type: 'generations-recreate' as const,
        }
      : args.command === 'generations' &&
        args.action === 'edit'
        ? {
          creativeBrief: flags.prompt ?? '',
          id: args.id ?? '',
          style: flags.style,
          type: 'generations-edit' as const,
        }
      : args.command === 'generations' &&
        args.action === 'reference'
        ? {
          ids: flags.generation ?? [],
          type: 'generations-reference' as const,
        }
      : args.command === 'scenarios' && args.action === 'list'
        ? {type: 'scenarios-list' as const}
      : args.command === 'scenarios' && args.action === 'get'
        ? {id: args.id ?? '', type: 'scenarios-get' as const}
      : args.command === 'scenarios' &&
        (args.action === 'enable' || args.action === 'disable')
        ? {
          enabled: args.action === 'enable',
          id: args.id ?? '',
          type: 'scenarios-set-enabled' as const,
        }
      : args.command === 'init'
        ? {type: 'init' as const}
        : args.command === 'relink'
          ? {from: flags.from ?? '', type: 'relink' as const}
          : {type: 'home' as const}
  } catch (error) {
    const helpPath = [args.command, args.action]
      .filter((value): value is string => value !== undefined)
      .join(' ')
    writeStructured(context, flags.output, {
      code: 'invalid_argument',
      error: true,
      help: [`Run \`${context.bin} ${helpPath} --help\``],
      message:
        error instanceof Error ? error.message : 'Invalid argument',
    })
    return 2
  }

  if (
    ((command.type === 'generate' &&
      command.creativeBrief.trim().length === 0) ||
      (command.type === 'create' &&
        command.request.kind === 'generator' &&
        command.request.creativeBrief.trim().length === 0))
  ) {
    const mediaType =
      command.type === 'generate'
        ? command.mediaType
        : command.request.kind === 'generator'
          ? command.request.generator
          : undefined
    if (mediaType === undefined) {
      throw new Error('Expected a Generator request')
    }
    const creationCommand =
      command.type === 'generate' ? 'generate' : 'create'
    writeStructured(context, flags.output, {
          code: 'missing_argument',
          error: true,
          help: [
            `Run \`mg ${creationCommand} ${mediaType} --help\``,
          ],
          message: `${mediaType === 'image' ? 'Image' : 'Video'} generation requires --prompt`,
    })
    return 2
  }

  if (args.command === 'serve') {
    const running = await dependencies.startServer(
          {
            application,
            context: {
              bin: context.bin,
              cwd: context.cwd,
              mediaGenHome: context.mediaGenHome,
            },
          },
          flags.port,
    )
    writeStructured(context, flags.output, {
          type: 'serve',
          url: running.url,
    })
    return 0
  }

  if (args.command === 'skills') {
    if (args.action === 'install') {
      const result = await installAgentSkill(context.cwd, {
        force: flags.force === true,
        path: flags.path,
        target: isSkillTarget(flags.target)
          ? flags.target
          : undefined,
      })
      writeStructured(context, flags.output, result)
      return 0
    }

    context.stdout(
      getSkillContent(args.action, args.id),
    )
    return 0
  }

  try {
    if (command.type === 'create' && command.request.kind === 'scenario') {
      const scenario = getScenarioDefinition(command.request.scenario)
      context.stderr(
        `Creating ${scenario?.title ?? command.request.scenario}...\n`,
      )
    }
    const result = await application.execute(command, {
      bin: context.bin,
      cwd: context.cwd,
      mediaGenHome: context.mediaGenHome,
    })
    writeStructured(
      context,
      flags.output,
      flags.full === true ? result : summarizeResult(result),
    )
    return 0
  } catch (error) {
    if (error instanceof MediaGenError) {
      writeStructured(context, flags.output, {
        code: error.code,
        error: true,
        help: error.help,
        message: error.message,
      })
      return error.exitCode
    }

    writeStructured(context, flags.output, {
      code: 'internal_error',
      error: true,
      help: ['Run `mg doctor`'],
      message:
        error instanceof Error ? error.message : 'Unexpected failure',
    })
    return 1
  }
}

function summarizeResult(value: unknown): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    value.type !== 'generations-list' ||
    !('generations' in value) ||
    !Array.isArray(value.generations) ||
    !('count' in value)
  ) {
    return value
  }

  return {
    count: value.count,
    generations: value.generations.map((generation) => {
      if (typeof generation !== 'object' || generation === null) {
        return generation
      }
      return {
        createdAt:
          'createdAt' in generation ? generation.createdAt : undefined,
        id: 'id' in generation ? generation.id : undefined,
        mediaType:
          'mediaType' in generation ? generation.mediaType : undefined,
        status: 'status' in generation ? generation.status : undefined,
      }
    }),
    help: [
      'Run `mg generations get <id>`',
      'Use `--full` for complete records',
    ],
    type: 'generations-list',
  }
}

function writeStructured(
  context: CliContext,
  output: string,
  value: unknown,
): void {
  if (output === 'json') {
    context.stdout(`${JSON.stringify(value)}\n`)
  } else {
    context.stdout(`${encode(value)}\n`)
  }
}

function findCommand(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (
      argument === '--endpoint' ||
      argument === '--aspect-ratio' ||
      argument === '--clip-count' ||
      argument === '--clip-duration' ||
      argument === '--deployment' ||
      argument === '--from' ||
      argument === '--generation' ||
      argument === '--height' ||
      argument === '--name' ||
      argument === '--language' ||
      argument === '--link' ||
      argument === '--model' ||
      argument === '--narration' ||
      argument === '--output' ||
      argument === '--path' ||
      argument === '--orientation' ||
      argument === '--option' ||
      argument === '--preset' ||
      argument === '--port' ||
      argument === '--prompt' ||
      argument === '--reference' ||
      argument === '--source' ||
      argument === '--style' ||
      argument === '--target' ||
      argument === '--to'
      || argument === '--duration'
      || argument === '--voice'
      || argument === '--width'
    ) {
      index += 1
      continue
    }

    if (
      argument === undefined ||
      argument.startsWith('--output=') ||
      argument.startsWith('-')
    ) {
      continue
    }

    return argument
  }

  return undefined
}

function parseDeploymentOverrides(
  values: string[],
): Record<string, string> {
  return Object.fromEntries(
    values.map((value) => {
      const separator = value.indexOf('=')
      if (separator <= 0 || separator === value.length - 1) {
        throw new Error(
          `Deployment override "${value}" must use role=deployment-id`,
        )
      }

      return [value.slice(0, separator), value.slice(separator + 1)]
    }),
  )
}

function parseOptionOverrides(
  values: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    values.map((value) => {
      const separator = value.indexOf('=')
      if (separator <= 0 || separator === value.length - 1) {
        throw new Error(
          `Production Option "${value}" must use name=value`,
        )
      }
      const raw = value.slice(separator + 1)
      const parsed =
        raw === 'true'
          ? true
          : raw === 'false'
            ? false
            : /^-?\d+(?:\.\d+)?$/.test(raw)
              ? Number(raw)
              : raw
      return [value.slice(0, separator), parsed]
    }),
  )
}

function isSkillTarget(value: unknown): value is SkillTarget {
  return (
    value === 'claude' ||
    value === 'codex' ||
    value === 'cursor' ||
    value === 'github-copilot'
  )
}
