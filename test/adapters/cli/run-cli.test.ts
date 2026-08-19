import {mkdir, mkdtemp, rename, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {decode} from '@toon-format/toon'
import {afterEach, describe, expect, test} from 'vitest'

import {createMediaGenApplication} from '../../../src/application/media-gen-application.js'
import {runCli} from '../../../src/adapters/cli/run-cli.js'
import {
  createFakeModelAdapter,
  createModelRuntime,
} from '../../../src/model-runtime/model-runtime.js'
import {createGenerationStore} from '../../../src/generation/generation-store.js'
import {MediaGenError} from '../../../src/application/media-gen-error.js'
import type {MediaGenApplication} from '../../../src/application/media-gen-application.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('runCli', () => {
  test('creates an Explainer video with Scenario-specific options', async () => {
    const stderr: string[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          force: false,
          request: {
            creativeBrief: 'Explain retrieval-augmented generation.',
            deploymentOverrides: {},
            kind: 'scenario',
            options: {
              'aspect-ratio': '16:9',
              duration: 12,
              narration:
                'Retrieval-augmented generation grounds answers in trusted sources.',
              subtitles: true,
              voice: 'en-US-Harper:MAI-Voice-2',
            },
            preset: 'editorial-motion-graphics',
            scenario: 'explainer-video',
            sourcePaths: ['C:\\research\\rag.pdf'],
            webReferenceUrls: [
              'https://docs.example.com/rag',
            ],
          },
          type: 'create',
        })
        return {
          generation: generationRecord('01EXPLAINER'),
          type: 'create',
        }
      },
    }

    const exitCode = await runCli(
      [
        'create',
        'explainer-video',
        '--prompt',
        'Explain retrieval-augmented generation.',
        '--source',
        'C:\\research\\rag.pdf',
        '--link',
        'https://docs.example.com/rag',
        '--preset',
        'editorial-motion-graphics',
        '--voice',
        'en-US-Harper:MAI-Voice-2',
        '--narration',
        'Retrieval-augmented generation grounds answers in trusted sources.',
        '--subtitles',
        '--duration',
        '12',
        '--aspect-ratio',
        '16:9',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: (text) => stderr.push(text),
        stdout: () => undefined,
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(stderr.join('')).toContain('Creating Explainer video')
  })

  test('creates a Short-form video with clipping options', async () => {
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          force: false,
          request: {
            creativeBrief: 'Choose the strongest insight.',
            deploymentOverrides: {},
            kind: 'scenario',
            options: {
              'clip-count': 3,
              'clip-duration': 8,
              language: 'auto',
              orientation: 'vertical',
              subtitles: true,
            },
            preset: 'bold-urban',
            scenario: 'short-form-video',
            sourcePaths: ['C:\\media\\interview.mp4'],
          },
          type: 'create',
        })
        return {
          generation: generationRecord('01SHORT'),
          type: 'create',
        }
      },
    }

    const exitCode = await runCli(
      [
        'create',
        'short-form-video',
        '--source',
        'C:\\media\\interview.mp4',
        '--prompt',
        'Choose the strongest insight.',
        '--preset',
        'bold-urban',
        '--orientation',
        'vertical',
        '--language',
        'auto',
        '--subtitles',
        '--clip-count',
        '3',
        '--clip-duration',
        '8',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: () => undefined,
      },
      application,
    )

    expect(exitCode).toBe(0)
  })

  test('returns a structured error when Short-form video has no source', async () => {
    const stdout: string[] = []

    const exitCode = await runCli(
      [
        'create',
        'short-form-video',
        '--preset',
        'bold-urban',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      {
        execute: async () => {
          throw new Error('Invalid request must not execute')
        },
      },
    )

    expect(exitCode).toBe(2)
    expect(JSON.parse(stdout.join(''))).toEqual({
      code: 'invalid_argument',
      error: true,
      help: ['Run `mg create short-form-video --help`'],
      message: 'Short-form video requires exactly one source video',
    })
  })

  test('lists built-in Scenarios', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({type: 'scenarios-list'})
        return {
          scenarios: [],
          type: 'scenarios-list',
        }
      },
    }

    const exitCode = await runCli(
      ['scenarios', 'list', '--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({
      scenarios: [],
      type: 'scenarios-list',
    })
  })

  test('enables a built-in Scenario', async () => {
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          enabled: true,
          id: 'explainer-video',
          type: 'scenarios-set-enabled',
        })
        return {
          enabled: true,
          id: 'explainer-video',
          type: 'scenarios-set-enabled',
        }
      },
    }

    await expect(
      runCli(
        ['scenarios', 'enable', 'explainer-video', '--output', 'json'],
        {
          bin: 'mg',
          cwd: 'C:\\work',
          mediaGenHome: 'C:\\home',
          stderr: () => undefined,
          stdout: () => undefined,
        },
        application,
      ),
    ).resolves.toBe(0)
  })

  test('cleans failed Generations with force', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          force: true,
          type: 'generations-cleanup',
        })
        return {
          count: 1,
          deleted: ['01FAILED'],
          type: 'generations-cleanup',
        }
      },
    }

    const exitCode = await runCli(
      [
        'generations',
        'cleanup',
        '--force',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      count: 1,
      type: 'generations-cleanup',
    })
  })

  test('passes media-specific generation controls', async () => {
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toMatchObject({
          controls: {
            height: 1280,
            nSeconds: 8,
            width: 720,
          },
          mediaType: 'video',
          type: 'generate',
        })
        return {
          generation: generationRecord('01VIDEO'),
          type: 'generate',
        }
      },
    }

    const exitCode = await runCli(
      [
        'generate',
        'video',
        '--prompt',
        'Launch the product',
        '--width',
        '720',
        '--height',
        '1280',
        '--duration',
        '8',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: () => undefined,
      },
      application,
    )

    expect(exitCode).toBe(0)
  })

  test('passes a manually selected deployment to generation', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toMatchObject({
          deploymentId: 'primary:gpt-image',
          force: true,
          type: 'generate',
        })
        return {
          generation: generationRecord('01GENERATION'),
          type: 'generate',
        }
      },
    }

    const exitCode = await runCli(
      [
        'generate',
        'image',
        '--prompt',
        'Create an image',
        '--model',
        'primary:gpt-image',
        '--force',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
  })

  test('summarizes Generation lists unless full output is requested', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async () => ({
        count: 1,
        generations: [generationRecord('01GENERATION')],
        type: 'generations-list',
      }),
    }

    const exitCode = await runCli(
      ['generations', 'list', '--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({
      count: 1,
      generations: [
        {
          createdAt: '2026-08-18T12:00:00.000Z',
          id: '01GENERATION',
          mediaType: 'image',
          status: 'succeeded',
        },
      ],
      help: ['Run `mg generations get <id>`', 'Use `--full` for complete records'],
      type: 'generations-list',
    })
  })

  test('formats unexpected errors without a stack trace', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async () => {
        throw new Error('Unexpected failure')
      },
    }

    const exitCode = await runCli(
      ['--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout.join(''))).toEqual({
      code: 'internal_error',
      error: true,
      help: ['Run `mg doctor`'],
      message: 'Unexpected failure',
    })
  })

  test('returns a structured error when a required argument is missing', async () => {
    const stdout: string[] = []

    const exitCode = await runCli(
      ['generate', 'image', '--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      createMediaGenApplication(),
    )

    expect(exitCode).toBe(2)
    expect(JSON.parse(stdout.join(''))).toEqual({
      code: 'missing_argument',
      error: true,
      help: ['Run `mg generate image --help`'],
      message: 'Image generation requires --prompt',
    })
  })

  test('installs the lightweight Agent Skill', async () => {
    const projectDirectory = await mkdtemp(
      join(tmpdir(), 'media-gen-cli-skill-'),
    )
    temporaryDirectories.push(projectDirectory)
    const stdout: string[] = []

    const exitCode = await runCli(
      [
        'skills',
        'install',
        '--target',
        'github-copilot',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: projectDirectory,
        mediaGenHome: join(projectDirectory, 'home'),
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      createMediaGenApplication(),
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      state: 'installed',
      target: 'github-copilot',
    })
  })

  test('prints focused CLI-hosted skill guidance', async () => {
    const stdout: string[] = []

    const exitCode = await runCli(
      ['skills', 'generate', 'image'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      createMediaGenApplication(),
    )

    expect(exitCode).toBe(0)
    expect(stdout.join('')).toContain('mg generate image')
  })

  test('starts the loopback Local UI server', async () => {
    const stdout: string[] = []
    const starts: unknown[] = []

    const exitCode = await runCli(
      ['serve', '--port', '4500', '--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      createMediaGenApplication(),
      {
        startServer: async (options, port) => {
          starts.push(options.context, port)
          return {
            server: {close: async () => undefined},
            url: 'http://127.0.0.1:4500',
          }
        },
      },
    )

    expect(exitCode).toBe(0)
    expect(starts).toEqual([
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
      4500,
    ])
    expect(JSON.parse(stdout.join(''))).toEqual({
      type: 'serve',
      url: 'http://127.0.0.1:4500',
    })
  })

  test('collects multiple Generations as references', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          ids: ['01FIRST', '01SECOND'],
          type: 'generations-reference',
        })
        return {
          references: [],
          type: 'generations-reference',
        }
      },
    }

    const exitCode = await runCli(
      [
        'generations',
        'reference',
        '--generation',
        '01FIRST',
        '--generation',
        '01SECOND',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({
      references: [],
      type: 'generations-reference',
    })
  })

  test('edits a Generation with a new Creative Brief', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          creativeBrief: 'Darken the background',
          id: '01SOURCE',
          style: 'cinematic',
          type: 'generations-edit',
        })
        return {
          generation: generationRecord('01EDITED'),
          type: 'generations-edit',
        }
      },
    }

    const exitCode = await runCli(
      [
        'generations',
        'edit',
        '01SOURCE',
        '--prompt',
        'Darken the background',
        '--style',
        'cinematic',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      type: 'generations-edit',
    })
  })

  test('recreates a Generation with optional overrides', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          creativeBrief: 'Updated brief',
          deploymentOverrides: {},
          force: false,
          id: '01SOURCE',
          options: {},
          preset: undefined,
          style: 'cinematic',
          type: 'generations-recreate',
        })
        return {
          generation: generationRecord('01RECREATED'),
          type: 'generations-recreate',
        }
      },
    }

    const exitCode = await runCli(
      [
        'generations',
        'recreate',
        '01SOURCE',
        '--prompt',
        'Updated brief',
        '--style',
        'cinematic',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      type: 'generations-recreate',
    })
  })

  test('recreates a Scenario with Preset and Production Option overrides', async () => {
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          creativeBrief: undefined,
          deploymentOverrides: {video: 'primary:sora'},
          force: true,
          id: '01SOURCE',
          options: {
            'clip-count': 2,
            subtitles: false,
          },
          preset: 'marker-scribble',
          style: undefined,
          type: 'generations-recreate',
        })
        return {
          generation: generationRecord('01RECREATED'),
          type: 'generations-recreate',
        }
      },
    }

    await expect(
      runCli(
        [
          'generations',
          'recreate',
          '01SOURCE',
          '--preset',
          'marker-scribble',
          '--option',
          'clip-count=2',
          '--option',
          'subtitles=false',
          '--deployment',
          'video=primary:sora',
          '--force',
          '--output',
          'json',
        ],
        {
          bin: 'mg',
          cwd: 'C:\\work',
          mediaGenHome: 'C:\\home',
          stderr: () => undefined,
          stdout: () => undefined,
        },
        application,
      ),
    ).resolves.toBe(0)
  })

  test('exports a Generation to a requested directory', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          force: true,
          id: '01GENERATION',
          to: 'assets/final',
          type: 'generations-export',
        })
        return {
          files: ['C:\\work\\assets\\final\\01GENERATION-output-1.png'],
          id: '01GENERATION',
          type: 'generations-export',
        }
      },
    }

    const exitCode = await runCli(
      [
        'generations',
        'export',
        '01GENERATION',
        '--to',
        'assets/final',
        '--force',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      id: '01GENERATION',
      type: 'generations-export',
    })
  })

  test('deletes a Generation with force', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cli-delete-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const stdout: string[] = []
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
    })
    const initialized = await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    if (initialized.type !== 'init') {
      throw new Error('Expected init result')
    }
    const store = createGenerationStore(initialized.workspace.path, {
      createId: () => '01GENERATION',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    await store.create(generationInput())

    const exitCode = await runCli(
      [
        'generations',
        'delete',
        '01GENERATION',
        '--force',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd,
        mediaGenHome,
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({
      id: '01GENERATION',
      state: 'deleted',
      type: 'generations-delete',
    })
  })

  test('formats application errors as structured output', async () => {
    const stdout: string[] = []
    const application: MediaGenApplication = {
      execute: async () => {
        throw new MediaGenError(
          'confirmation_required',
          'The action requires --force',
          2,
          ['Rerun with `--force`'],
        )
      },
    }

    const exitCode = await runCli(
      ['--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(2)
    expect(JSON.parse(stdout.join(''))).toEqual({
      code: 'confirmation_required',
      error: true,
      help: ['Rerun with `--force`'],
      message: 'The action requires --force',
    })

  })

  test('reads a persisted Generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cli-get-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const stdout: string[] = []
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
    })
    const initialized = await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    if (initialized.type !== 'init') {
      throw new Error('Expected init result')
    }
    const store = createGenerationStore(initialized.workspace.path, {
      createId: () => '01GENERATION',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    await store.create({
      creativeBrief: 'Create a product hero.',
      mediaType: 'image',
      references: [],
      resolvedModel: {
        deployment: 'mai-fast',
        id: 'primary:mai-fast',
        model: 'MAI-Image-2.5-Flash',
        provider: 'primary',
      },
      selection: {
        generator: 'image' as const,
        kind: 'generator' as const,
        style: 'product-led',
      },
      sourceGenerations: [],
    })

    const exitCode = await runCli(
      ['generations', 'get', '01GENERATION', '--output', 'json'],
      {
        bin: 'mg',
        cwd,
        mediaGenHome,
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      generation: {id: '01GENERATION'},
      type: 'generations-get',
    })
  })

  function generationInput() {
    return {
      creativeBrief: 'Create a product hero.',
      mediaType: 'image' as const,
      references: [],
      resolvedModel: {
        deployment: 'mai-fast',
        id: 'primary:mai-fast',
        model: 'MAI-Image-2.5-Flash',
        provider: 'primary',
      },
      selection: {
        generator: 'image' as const,
        kind: 'generator' as const,
        style: 'product-led',
      },
      sourceGenerations: [],
    }

  }

  function generationRecord(id: string) {
    return {
      createdAt: '2026-08-18T12:00:00.000Z',
      creativeBrief: 'Brief',
      error: null,
      id,
      mediaType: 'image' as const,
      operations: [],
      outputs: [],
      progress: {completed: 1, stage: 'succeeded', total: 1},
      provider: {jobId: null},
      references: [],
      resolvedModel: {
        deployment: 'mai-fast',
        id: 'primary:mai-fast',
        model: 'MAI-Image-2.5-Flash',
        provider: 'primary',
      },
      resolvedResources: [
        {
          deployment: 'mai-fast',
          id: 'primary:mai-fast',
          model: 'MAI-Image-2.5-Flash',
          provider: 'primary',
          role: 'generation',
        },
      ],
      runtime: {catalogVersion: '4', cliVersion: '0.0.0'},
      scenario: null,
      schemaVersion: 4 as const,
      selection: {
        generator: 'image' as const,
        kind: 'generator' as const,
        style: 'product-led',
      },
      sourceGenerations: [],
      status: 'succeeded' as const,
      textReferences: [],
      updatedAt: '2026-08-18T12:00:00.000Z',
      webReferences: [],
    }
  }

  test('lists persisted Generations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cli-list-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const stdout: string[] = []
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    const exitCode = await runCli(
      ['generations', 'list', '--output', 'json'],
      {
        bin: 'mg',
        cwd,
        mediaGenHome,
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({
      count: 0,
      generations: [],
      help: [
        'Run `mg generations get <id>`',
        'Use `--full` for complete records',
      ],
      type: 'generations-list',
    })
  })

  test('generates an image from a Creative Brief', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cli-generate-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const stdout: string[] = []
    const application = createMediaGenApplication({
      createGenerationId: () => '01GENERATION',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          {
            capabilities: {},
            modelName: 'MAI-Image-2.5-Flash',
            modelPublisher: 'Microsoft',
            modelVersion: '2026-06-02',
            name: 'mai-fast',
            sku: {
              capacity: 1,
              name: 'GlobalStandard',
              tier: 'Standard',
            },
          },
        ],
      },
      modelRuntime: createModelRuntime([
        createFakeModelAdapter('mai-image', {
          contents: Buffer.from('generated image'),
          extension: '.png',
          mediaType: 'image/png',
        }),
      ]),
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    await application.execute(
      {
        endpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        name: 'primary',
        type: 'configure-foundry',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    const exitCode = await runCli(
      [
        'generate',
        'image',
        '--prompt',
        'Show the dashboard at launch.',
        '--style',
        'cinematic',
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd,
        mediaGenHome,
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      generation: {
        id: '01GENERATION',
        mediaType: 'image',
        status: 'succeeded',
      },
      type: 'generate',
    })
  })

  test('configures a Foundry project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cli-config-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const stdout: string[] = []
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01CONFIG',
      foundryDiscovery: {
        listDeployments: async () => [
          {
            capabilities: {},
            modelName: 'MAI-Image-2.5-Flash',
            modelPublisher: 'Microsoft',
            modelVersion: '2026-06-02',
            name: 'mai-fast',
            sku: {
              capacity: 1,
              name: 'GlobalStandard',
              tier: 'Standard',
            },
          },
        ],
      },
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    const endpoint =
      'https://example.services.ai.azure.com/api/projects/media'

    const exitCode = await runCli(
      [
        'configure',
        'foundry',
        '--name',
        'primary',
        '--endpoint',
        endpoint,
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd,
        mediaGenHome,
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      provider: {endpoint, name: 'primary'},
      type: 'configure-foundry',
    })
  })

  test('configures private Azure Speech from the environment without echoing the API key', async () => {
    const stdout: string[] = []
    const apiKey = 'private-speech-key'
    const endpoint =
      'https://speech-resource.cognitiveservices.azure.com/'
    const voice = 'en-US-Ethan:MAI-Voice-2'
    const application: MediaGenApplication = {
      execute: async (command) => {
        expect(command).toEqual({
          apiKey,
          endpoint,
          type: 'configure-speech',
          voice,
        })
        return {
          endpoint,
          state: 'configured',
          type: 'configure-speech',
          voice,
        }
      },
    }

    const exitCode = await runCli(
      [
        'configure',
        'speech',
        '--endpoint',
        endpoint,
        '--voice',
        voice,
        '--output',
        'json',
      ],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        env: {MEDIA_GEN_SPEECH_API_KEY: apiKey},
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({
      endpoint,
      state: 'configured',
      type: 'configure-speech',
      voice,
    })
    expect(stdout.join('')).not.toContain(apiKey)
  })

  test('runs Azure CLI logout', async () => {
    const stdout: string[] = []
    const application = createMediaGenApplication({
      authModule: {
        login: async () => ({state: 'login-completed'}),
        logout: async () => ({state: 'logout-completed'}),
        status: async () => ({help: [], state: 'signed-out'}),
      },
    })

    const exitCode = await runCli(
      ['auth', 'logout', '--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({
      state: 'logout-completed',
      type: 'auth',
    })
  })

  test('runs Azure CLI login', async () => {
    const stdout: string[] = []
    const application = createMediaGenApplication({
      authModule: {
        login: async () => ({state: 'login-completed'}),
        logout: async () => ({state: 'logout-completed'}),
        status: async () => ({help: [], state: 'signed-out'}),
      },
    })

    const exitCode = await runCli(
      ['auth', 'login', '--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toEqual({
      state: 'login-completed',
      type: 'auth',
    })
  })

  test('reports Azure CLI authentication status', async () => {
    const stdout: string[] = []
    const application = createMediaGenApplication({
      authModule: {
        login: async () => ({state: 'login-completed'}),
        logout: async () => ({state: 'logout-completed'}),
        status: async () => ({
          account: {name: 'john@example.com', type: 'user'},
          state: 'signed-in',
          subscription: {
            id: 'subscription-id',
            name: 'Developer Subscription',
          },
          tenantId: 'tenant-id',
        }),
      },
    })

    const exitCode = await runCli(
      ['auth', '--output', 'json'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      state: 'signed-in',
      tenantId: 'tenant-id',
      type: 'auth',
    })
  })

  test('relinks a moved project from its prior path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cli-relink-'))
    temporaryDirectories.push(root)
    const originalDirectory = join(root, 'Original')
    const movedDirectory = join(root, 'Moved')
    const mediaGenHome = join(root, 'home')
    await mkdir(originalDirectory)
    const stdout: string[] = []
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01RELINK',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd: originalDirectory, mediaGenHome},
    )
    await rename(originalDirectory, movedDirectory)

    const exitCode = await runCli(
      ['relink', '--from', originalDirectory, '--output', 'json'],
      {
        bin: 'mg',
        cwd: movedDirectory,
        mediaGenHome,
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      from: originalDirectory,
      state: 'relinked',
      to: movedDirectory,
      type: 'relink',
    })
  })

  test('runs workspace diagnostics', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cli-doctor-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const stdout: string[] = []
    const application = createMediaGenApplication({
      authModule: {
        login: async () => ({state: 'login-completed'}),
        logout: async () => ({state: 'logout-completed'}),
        status: async () => ({
          account: {name: 'john@example.com', type: 'user'},
          state: 'signed-in',
          subscription: {
            id: 'subscription-id',
            name: 'Developer Subscription',
          },
          tenantId: 'tenant-id',
        }),
      },
      createWorkspaceId: () => '01DOCTOR',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    const exitCode = await runCli(
      ['doctor', '--output', 'json'],
      {
        bin: 'mg',
        cwd,
        mediaGenHome,
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      state: 'healthy',
      type: 'doctor',
    })
  })

  test('prints concise help', async () => {
    const stdout: string[] = []
    const stderr: string[] = []

    const exitCode = await runCli(['--help'], {
      bin: 'mg',
      cwd: 'C:\\work',
      mediaGenHome: 'C:\\home',
      stderr: (text) => stderr.push(text),
      stdout: (text) => stdout.push(text),
    })

    const output = stdout.join('')

    expect(exitCode).toBe(0)
    expect(stderr).toEqual([])
    expect(output).toContain('Media Gen')
    expect(output).toContain('mg [COMMAND] [--output toon|json]')
    expect(output).toContain('init')
    expect(output).toContain('Initialize the current directory')
    expect(output).toContain('--output')
    expect(output).toContain('NEXT STEPS')
  })

  test.each([
    [['auth'], 'mg auth [--output toon|json]'],
    [['auth', 'login'], 'mg auth login [--output toon|json]'],
    [['auth', 'logout'], 'mg auth logout [--output toon|json]'],
    [['configure'], 'mg configure <command>'],
    [
      ['configure', 'foundry'],
      'mg configure foundry --name <name> --endpoint <url> [--output toon|json]',
    ],
    [
      ['configure', 'speech'],
      'mg configure speech --endpoint <url> --voice <name> [--api-key <key>] [--output toon|json]',
    ],
    [['doctor'], 'mg doctor [--output toon|json]'],
    [
      ['generate'],
      'mg generate <image|video> --prompt <text> [options]',
    ],
    [
      ['create'],
      'mg create <image|video|scenario> [options]',
    ],
    [
      ['create', 'image'],
      'mg create image --prompt <text> [options]',
    ],
    [
      ['create', 'video'],
      'mg create video --prompt <text> [options]',
    ],
    [
      ['create', 'explainer-video'],
      'mg create explainer-video --prompt <text> [options]',
    ],
    [
      ['create', 'short-form-video'],
      'mg create short-form-video --source <video> [options]',
    ],
    [['scenarios'], 'mg scenarios <command>'],
    [
      ['scenarios', 'list'],
      'mg scenarios list [--output toon|json]',
    ],
    [
      ['scenarios', 'get'],
      'mg scenarios get <id> [--output toon|json]',
    ],
    [
      ['scenarios', 'enable'],
      'mg scenarios enable <id> [--output toon|json]',
    ],
    [
      ['scenarios', 'disable'],
      'mg scenarios disable <id> [--output toon|json]',
    ],
    [
      ['generate', 'image'],
      'mg generate image --prompt <text> [options]',
    ],
    [
      ['generate', 'video'],
      'mg generate video --prompt <text> [options]',
    ],
    [['generations'], 'mg generations <command>'],
    [
      ['generations', 'list'],
      'mg generations list [--full] [--output toon|json]',
    ],
    [
      ['generations', 'cleanup'],
      'mg generations cleanup --force [--output toon|json]',
    ],
    [
      ['generations', 'get'],
      'mg generations get <id> [--output toon|json]',
    ],
    [
      ['generations', 'delete'],
      'mg generations delete <id> --force [--output toon|json]',
    ],
    [
      ['generations', 'export'],
      'mg generations export <id> [--to <path>] [--force] [--output toon|json]',
    ],
    [
      ['generations', 'recreate'],
      'mg generations recreate <id> [--prompt <text>] [--style <style>] [--output toon|json]',
    ],
    [
      ['generations', 'edit'],
      'mg generations edit <id> --prompt <text> [--style <style>] [--output toon|json]',
    ],
    [
      ['generations', 'reference'],
      'mg generations reference --generation <id> [--generation <id> ...] [--output toon|json]',
    ],
    [['init'], 'mg init [--output toon|json]'],
    [
      ['relink'],
      'mg relink --from <old-path> [--output toon|json]',
    ],
    [['serve'], 'mg serve [--port <number>] [--output toon|json]'],
    [['skills'], 'mg skills [action] [reference]'],
    [
      ['skills', 'install'],
      'mg skills install [--target <target> | --path <directory>] [--force]',
    ],
    [['skills', 'initialize'], 'mg skills initialize'],
    [['skills', 'configure'], 'mg skills configure foundry'],
    [
      ['skills', 'configure', 'foundry'],
      'mg skills configure foundry',
    ],
    [
      ['skills', 'generate'],
      'mg skills generate <image|video>',
    ],
    [
      ['skills', 'create'],
      'mg skills create <explainer-video|short-form-video>',
    ],
    [
      ['skills', 'create', 'explainer-video'],
      'mg skills create explainer-video',
    ],
    [
      ['skills', 'create', 'short-form-video'],
      'mg skills create short-form-video',
    ],
    [['skills', 'scenarios'], 'mg skills scenarios'],
    [['skills', 'generate', 'image'], 'mg skills generate image'],
    [['skills', 'generate', 'video'], 'mg skills generate video'],
    [
      ['skills', 'inspect'],
      'mg skills inspect generations',
    ],
    [
      ['skills', 'inspect', 'generations'],
      'mg skills inspect generations',
    ],
    [['skills', 'export'], 'mg skills export'],
    [['skills', 'troubleshoot'], 'mg skills troubleshoot'],
  ])(
    'prints scoped help for %s',
    async (command, expectedUsage) => {
      const stdout: string[] = []
      const stderr: string[] = []
      const exitCode = await runCli([...command, '--help'], {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: (text) => stderr.push(text),
        stdout: (text) => stdout.push(text),
      }, {
        execute: async () => {
          throw new Error('Help must not execute the command')
        },
      })
      const output = stdout.join('')

      expect(exitCode).toBe(0)
      expect(stderr).toEqual([])
      expect(output).toContain(expectedUsage)
      expect(output).toContain('NEXT STEPS')
      expect(output).not.toContain(
        'mg [COMMAND] [--output toon|json]',
      )
    },
  )

  test('explains how to configure Foundry and what to do next', async () => {
    const stdout: string[] = []

    const exitCode = await runCli(
      ['configure', 'foundry', '--help'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
    )
    const output = stdout.join('')

    expect(exitCode).toBe(0)
    expect(output).toContain(
      'Discover supported deployments in a Microsoft Foundry project and save them.',
    )
    expect(output).toContain('--endpoint <url>')
    expect(output).toContain('--name <name>')
    expect(output).toContain('EXAMPLES')
    expect(output).toContain(
      'mg configure foundry --name production --endpoint <project-endpoint>',
    )
    expect(output).toContain('Run `mg doctor`')
  })

  test('explains private Azure Speech configuration', async () => {
    const stdout: string[] = []

    const exitCode = await runCli(
      ['configure', 'speech', '--help'],
      {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
    )

    const output = stdout.join('')
    expect(exitCode).toBe(0)
    expect(output).toContain(
      'Save a private Azure Speech resource endpoint, API key, and default MAI Voice.',
    )
    expect(output).toContain('--api-key <key>')
    expect(output).toContain('MEDIA_GEN_SPEECH_API_KEY')
    expect(output).toContain('--voice <name>')
  })

  test('returns a structured usage error for an unknown command', async () => {
    const stdout: string[] = []
    const stderr: string[] = []

    const exitCode = await runCli(['wat'], {
      bin: 'mg',
      cwd: 'C:\\work',
      mediaGenHome: 'C:\\home',
      stderr: (text) => stderr.push(text),
      stdout: (text) => stdout.push(text),
    })

    expect(exitCode).toBe(2)
    expect(stderr).toEqual([])
    expect(decode(stdout.join(''))).toEqual({
      code: 'unknown_command',
      error: true,
      help: ['Run `mg --help`'],
      message: 'Unknown command "wat"',
    })
  })

  test('initializes the current directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cli-init-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const stdout: string[] = []
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01CLIWORKSPACE',
    })

    const exitCode = await runCli(
      ['init', '--output', 'json'],
      {
        bin: 'mg',
        cwd,
        mediaGenHome,
        stderr: () => undefined,
        stdout: (text) => stdout.push(text),
      },
      application,
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      manifest: {
        created: true,
        path: join(cwd, '.mg', 'config.json'),
      },
      projectDirectory: cwd,
      state: 'initialized',
      type: 'init',
      workspace: {
        id: '01CLIWORKSPACE',
      },
    })
  })

  test('returns a structured usage error for an unknown flag', async () => {
    const stdout: string[] = []
    const stderr: string[] = []

    const exitCode = await runCli(['--wat'], {
      bin: 'mg',
      cwd: 'C:\\work',
      mediaGenHome: 'C:\\home',
      stderr: (text) => stderr.push(text),
      stdout: (text) => stdout.push(text),
    })

    expect(exitCode).toBe(2)
    expect(stderr).toEqual([])
    expect(decode(stdout.join(''))).toEqual({
      code: 'unknown_flag',
      error: true,
      help: ['Run `mg --help`'],
      message: 'Unknown flag "--wat"',
    })
  })

  test('returns a structured usage error for an invalid output format', async () => {
    const stdout: string[] = []
    const stderr: string[] = []

    const exitCode = await runCli(['--output', 'yaml'], {
      bin: 'mg',
      cwd: 'C:\\work',
      mediaGenHome: 'C:\\home',
      stderr: (text) => stderr.push(text),
      stdout: (text) => stdout.push(text),
    })

    const output = stdout.join('')

    expect(exitCode).toBe(2)
    expect(stderr).toEqual([])
    expect(decode(output)).toEqual({
      code: 'invalid_output_format',
      error: true,
      help: ['Use `--output toon` or `--output json`'],
      message: 'Unknown output format "yaml"',
    })
  })

  test('writes the home result as TOON by default', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'media-gen-cli-'))
    temporaryDirectories.push(cwd)
    const stdout: string[] = []

    const exitCode = await runCli([], {
      bin: 'mg',
      cwd,
      mediaGenHome: join(cwd, 'home'),
      stderr: () => undefined,
      stdout: (text) => stdout.push(text),
    })

    const output = stdout.join('')

    expect(exitCode).toBe(0)
    expect(output).toContain('bin: mg')
    expect(output).toContain(
      'description: Local-first image and video generation workspace',
    )
    expect(output).toContain('help[2]:')
    expect(output).toContain('manifest:')
    expect(output).toContain('exists: false')
    expect(output).toContain('state: uninitialized')
    expect(output).toContain('type: home')
  })

  test('writes the home result as JSON when requested', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'media-gen-cli-'))
    temporaryDirectories.push(cwd)
    const stdout: string[] = []
    const stderr: string[] = []

    const exitCode = await runCli(['--output', 'json'], {
      bin: 'mg',
      cwd,
      mediaGenHome: join(cwd, 'home'),
      stderr: (text) => stderr.push(text),
      stdout: (text) => stdout.push(text),
    })

    expect(exitCode).toBe(0)
    expect(stderr).toEqual([])
    expect(JSON.parse(stdout.join(''))).toEqual({
      bin: 'mg',
      description: 'Local-first image and video generation workspace',
      help: ['Run `mg init`', 'Run `mg --help`'],
      manifest: {
        exists: false,
        path: join(cwd, '.mg', 'config.json'),
      },
      projectDirectory: cwd,
      state: 'uninitialized',
      type: 'home',
    })
  })
})
