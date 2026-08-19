import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {createMediaGenApplication} from '../../src/application/media-gen-application.js'
import type {AuthModule} from '../../src/auth/auth-module.js'
import type {FoundryDiscovery} from '../../src/foundry/foundry-discovery.js'
import {createGenerationStore} from '../../src/generation/generation-store.js'
import {
  createFakeModelAdapter,
  createModelRuntime,
} from '../../src/model-runtime/model-runtime.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('MediaGenApplication', () => {
  test('configures private Azure Speech settings without exposing the API key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-speech-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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

    await expect(
      application.execute(
        {
          apiKey: 'private-speech-key',
          endpoint:
            'https://speech-resource.cognitiveservices.azure.com/speech/path',
          type: 'configure-speech',
          voice: 'en-US-Ethan:MAI-Voice-2',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toEqual({
      endpoint:
        'https://speech-resource.cognitiveservices.azure.com/',
      state: 'configured',
      type: 'configure-speech',
      voice: 'en-US-Ethan:MAI-Voice-2',
    })
    await expect(
      readJson(join(initialized.workspace.path, 'local.json')),
    ).resolves.toEqual({
      schemaVersion: 1,
      speech: {
        apiKey: 'private-speech-key',
        defaultVoice: 'en-US-Ethan:MAI-Voice-2',
        endpoint:
          'https://speech-resource.cognitiveservices.azure.com/',
      },
    })
    const settings = await application.execute(
      {type: 'settings-get'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    expect(settings).toMatchObject({
      speech: {
        configured: true,
        defaultVoice: 'en-US-Ethan:MAI-Voice-2',
        endpoint:
          'https://speech-resource.cognitiveservices.azure.com/',
      },
      type: 'settings-get',
    })
    expect(JSON.stringify(settings)).not.toContain('private-speech-key')
  })

  test('rejects an insecure Azure Speech endpoint before storing the API key', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-speech-https-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01SPEECH',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {
          apiKey: 'private-speech-key',
          endpoint: 'http://speech.example.com/',
          type: 'configure-speech',
          voice: 'en-US-Ethan:MAI-Voice-2',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'invalid_speech_endpoint',
      message: 'Azure Speech endpoint must use HTTPS',
    })
  })

  test('rejects a non-Azure Speech endpoint before storing the API key', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-speech-host-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01SPEECH',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {
          apiKey: 'private-speech-key',
          endpoint: 'https://speech.example.com/',
          type: 'configure-speech',
          voice: 'en-US-Ethan:MAI-Voice-2',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'invalid_speech_endpoint',
      message:
        'Azure Speech endpoint must use an Azure Speech hostname',
    })
  })

  test('rejects an untrusted Foundry endpoint before discovery', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-foundry-host-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    let discoveryCalls = 0
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01FOUNDRY',
      foundryDiscovery: {
        listDeployments: async () => {
          discoveryCalls += 1
          return []
        },
      },
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {
          endpoint: 'https://attacker.example/api/projects/media',
          name: 'primary',
          type: 'configure-foundry',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'invalid_foundry_endpoint',
      message:
        'Microsoft Foundry project endpoint must use a services.ai.azure.com hostname',
    })
    expect(discoveryCalls).toBe(0)
  })

  test('lists and enables built-in Scenarios', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-scenarios-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {type: 'scenarios-list'},
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      scenarios: [
        {enabled: false, id: 'explainer-video', ready: false},
        {enabled: false, id: 'short-form-video', ready: false},
      ],
      type: 'scenarios-list',
    })

    await expect(
      application.execute(
        {
          enabled: true,
          id: 'short-form-video',
          type: 'scenarios-set-enabled',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toEqual({
      enabled: true,
      id: 'short-form-video',
      type: 'scenarios-set-enabled',
    })
    await expect(
      application.execute(
        {id: 'short-form-video', type: 'scenarios-get'},
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      scenario: {
        enabled: true,
        id: 'short-form-video',
        readiness: {
          missingRoles: ['video'],
          state: 'not-ready',
        },
      },
      type: 'scenarios-get',
    })
  })

  test('seeds Scenario routing from an existing Video Generator route', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-scenario-route-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    const manifestPath = join(cwd, '.mg', 'config.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.routing.generators.video = {
      auto: ['primary:sora'],
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )

    await application.execute(
      {
        enabled: true,
        id: 'explainer-video',
        type: 'scenarios-set-enabled',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(readJson(manifestPath)).resolves.toMatchObject({
      routing: {
        scenarios: {
          'explainer-video': {
            visuals: {
              auto: ['primary:sora'],
            },
          },
        },
      },
    })
  })

  test('creates a Short-form video through configured Scenario routing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-short-form-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    const sourcePath = join(root, 'interview.mp4')
    await mkdir(cwd)
    await writeFile(sourcePath, 'source video')
    const application = createMediaGenApplication({
      createGenerationId: () => '01SHORT',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('sora', 'sora-2'),
        ],
      },
      modelRuntime: {
        generate: async (request) => ({
          jobId: 'job-1',
          outputs: Array.from(
            {length: Number(request.controls.nVariants ?? 1)},
            () => ({
              contents: Buffer.from('generated clip'),
              extension: '.mp4',
              mediaType: 'video/mp4',
            }),
          ),
        }),
      },
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
    await application.execute(
      {
        enabled: true,
        id: 'short-form-video',
        type: 'scenarios-set-enabled',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {
          force: false,
          request: {
            creativeBrief: 'Choose the strongest product insight.',
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
            sourcePaths: [sourcePath],
            textReferences: [
              {
                content: 'Use the product terminology from these notes.',
                format: 'text',
                title: 'Product notes',
              },
            ],
            webReferenceUrls: [
              'https://docs.example.com/product',
            ],
          },
          type: 'create',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      generation: {
        id: '01SHORT',
        outputs: [
          {path: 'outputs/output-1.mp4'},
          {path: 'outputs/output-2.mp4'},
          {path: 'outputs/output-3.mp4'},
        ],
        selection: {
          kind: 'scenario',
          scenario: 'short-form-video',
        },
        status: 'succeeded',
      },
      type: 'create',
    })
  })

  test('creates an Explainer video without Speech when Voice is disabled', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-explainer-no-voice-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    const requests: Array<{adapter: string}> = []
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createGenerationId: () => '01EXPLAINER',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('sora', 'sora-2'),
        ],
      },
      modelRuntime: {
        generate: async (request) => {
          requests.push({adapter: request.adapter})
          return {
            jobId: null,
            outputs: [
              {
                contents: Buffer.from('video'),
                extension: '.mp4',
                mediaType: 'video/mp4',
              },
            ],
          }
        },
      },
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
    await application.execute(
      {
        enabled: true,
        id: 'explainer-video',
        type: 'scenarios-set-enabled',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {
          force: false,
          request: {
            creativeBrief: 'Explain retrieval-augmented generation.',
            deploymentOverrides: {},
            kind: 'scenario',
            options: {
              'aspect-ratio': '16:9',
              duration: 12,
              subtitles: true,
            },
            preset: 'editorial-motion-graphics',
            scenario: 'explainer-video',
            sourcePaths: [],
          },
          type: 'create',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      generation: {
        id: '01EXPLAINER',
        operations: [
          {kind: 'scenario-prepare'},
          {kind: 'video-generate'},
        ],
        outputs: [{mediaType: 'video/mp4'}],
        resolvedResources: [
          {id: 'primary:sora', role: 'visuals'},
        ],
      },
      type: 'create',
    })
    expect(requests).toEqual([{adapter: 'sora-video'}])
  })

  test('creates Explainer video and MAI Voice narration when Voice is selected', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-explainer-voice-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    const requests: Array<{
      adapter: string
      apiKeyConfigured: boolean
      endpoint?: string
      prompt: string
      voice?: unknown
    }> = []
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createGenerationId: () => '01EXPLAINER',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('sora', 'sora-2'),
        ],
      },
      modelRuntime: {
        generate: async (request) => {
          requests.push({
            adapter: request.adapter,
            apiKeyConfigured: request.apiKey !== undefined,
            endpoint: request.endpoint,
            prompt: request.prompt,
            voice: request.controls.voice,
          })
          return {
            jobId: null,
            outputs: [
              request.adapter === 'mai-voice'
                ? {
                    contents: Buffer.from('narration'),
                    extension: '.mp3',
                    mediaType: 'audio/mpeg',
                  }
                : {
                    contents: Buffer.from('video'),
                    extension: '.mp4',
                    mediaType: 'video/mp4',
                  },
            ],
          }
        },
      },
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    await application.execute(
      {
        apiKey: 'private-speech-key',
        endpoint:
          'https://speech-resource.cognitiveservices.azure.com/',
        type: 'configure-speech',
        voice: 'en-US-Ethan:MAI-Voice-2',
      },
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
    await application.execute(
      {
        enabled: true,
        id: 'explainer-video',
        type: 'scenarios-set-enabled',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {
          force: false,
          request: {
            creativeBrief: 'Explain retrieval-augmented generation.',
            deploymentOverrides: {voice: 'primary:sora'},
            kind: 'scenario',
            options: {
              'aspect-ratio': '16:9',
              duration: 12,
              narration:
                'Retrieval-augmented generation grounds answers in trusted sources.',
              subtitles: true,
              voice: 'en-US-Ethan:MAI-Voice-2',
            },
            preset: 'editorial-motion-graphics',
            scenario: 'explainer-video',
            sourcePaths: [],
          },
          type: 'create',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'invalid_argument',
      message:
        'Deployment overrides are not supported for Speech role "voice"',
    })

    await expect(
      application.execute(
        {
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
              voice: 'en-US-Ethan:MAI-Voice-2',
            },
            preset: 'editorial-motion-graphics',
            scenario: 'explainer-video',
            sourcePaths: [],
          },
          type: 'create',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      generation: {
        id: '01EXPLAINER',
        outputs: [
          {mediaType: 'video/mp4'},
          {mediaType: 'audio/mpeg'},
        ],
        resolvedResources: [
          {id: 'primary:sora', role: 'visuals'},
          {id: 'local:speech', role: 'voice'},
        ],
      },
      type: 'create',
    })
    expect(requests).toEqual([
      {
        adapter: 'sora-video',
        apiKeyConfigured: false,
        endpoint: undefined,
        prompt: expect.stringContaining('visual explainer video'),
        voice: undefined,
      },
      {
        adapter: 'mai-voice',
        apiKeyConfigured: true,
        endpoint:
          'https://speech-resource.cognitiveservices.azure.com/',
        prompt:
          'Retrieval-augmented generation grounds answers in trusted sources.',
        voice: 'en-US-Ethan:MAI-Voice-2',
      },
    ])
  })

  test('recreates a Scenario with its Preset, options, sources, and lineage', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-scenario-recreate-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    const sourcePath = join(root, 'interview.mp4')
    const ids = ['01SOURCE', '01RECREATED']
    await mkdir(cwd)
    await writeFile(sourcePath, 'source video')
    const application = createMediaGenApplication({
      createGenerationId: () => ids.shift() ?? 'unexpected',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('sora', 'sora-2'),
        ],
      },
      modelRuntime: {
        generate: async () => ({
          jobId: 'job-1',
          outputs: [
            {
              contents: Buffer.from('generated clip'),
              extension: '.mp4',
              mediaType: 'video/mp4',
            },
          ],
        }),
      },
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
    await application.execute(
      {
        enabled: true,
        id: 'short-form-video',
        type: 'scenarios-set-enabled',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )
    await application.execute(
      {
        force: false,
        request: {
          creativeBrief: 'Choose the strongest insight.',
          deploymentOverrides: {},
          kind: 'scenario',
          options: {
            'clip-count': 1,
            'clip-duration': 8,
            language: 'auto',
            orientation: 'vertical',
            subtitles: true,
          },
          preset: 'bold-urban',
          scenario: 'short-form-video',
          sourcePaths: [sourcePath],
          textReferences: [
            {
              content: 'Use the product terminology from these notes.',
              format: 'text',
              title: 'Product notes',
            },
          ],
          webReferenceUrls: [
            'https://docs.example.com/product',
          ],
        },
        type: 'create',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {
          id: '01SOURCE',
          type: 'generations-recreate',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      generation: {
        id: '01RECREATED',
        references: [{path: sourcePath}],
        scenario: {
          options: {
            'clip-count': 1,
            orientation: 'vertical',
          },
        },
        selection: {
          kind: 'scenario',
          preset: 'bold-urban',
          scenario: 'short-form-video',
        },
        sourceGenerations: ['01SOURCE'],
        textReferences: [
          {
            title: 'Product notes',
          },
        ],
        webReferences: [
          {url: 'https://docs.example.com/product'},
        ],
      },
      type: 'generations-recreate',
    })
  })

  test('reports when no eligible model is configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-no-model-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {
          creativeBrief: 'Create a launch image.',
          mediaType: 'image',
          referencePaths: [],
          style: 'product-led',
          type: 'generate',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'no_eligible_model',
      message: 'No eligible model is configured for role "generation"',
    })
  })

  test('cleans only failed or interrupted Generations when forced', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-cleanup-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const ids = ['01FAILED', '01SUCCEEDED']
    const application = createMediaGenApplication({
      createGenerationId: () => ids.shift() ?? 'unexpected',
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
      createId: () => ids.shift() ?? 'unexpected',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    await store.create(generationInput())
    await store.update('01FAILED', (record) => ({
      ...record,
      status: 'failed',
    }))
    await store.create(generationInput())
    await store.update('01SUCCEEDED', (record) => ({
      ...record,
      status: 'succeeded',
    }))

    const result = await application.execute(
      {force: true, type: 'generations-cleanup'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(result).toEqual({
      count: 1,
      deleted: ['01FAILED'],
      type: 'generations-cleanup',
    })
    await expect(store.list()).resolves.toMatchObject([
      {id: '01SUCCEEDED'},
    ])
  })

  test('applies normalized video controls before Sora execution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-video-controls-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const requests: unknown[] = []
    const application = createMediaGenApplication({
      createGenerationId: () => '01VIDEO',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('sora', 'sora-2'),
        ],
      },
      modelRuntime: {
        generate: async (request) => {
          requests.push(request)
          return {
            jobId: 'job',
            outputs: [
              {
                contents: Buffer.from('video'),
                extension: '.mp4',
                mediaType: 'video/mp4',
              },
            ],
          }
        },
      },
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

    await application.execute(
      {
        controls: {nSeconds: 8},
        creativeBrief: 'Launch the product.',
        mediaType: 'video',
        referencePaths: [],
        style: 'cinematic',
        type: 'generate',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(requests).toMatchObject([
      {
        controls: {
          height: 720,
          nSeconds: 8,
          nVariants: 1,
          width: 1280,
        },
      },
    ])
  })

  test('requires force before using a configured fallback deployment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-force-fallback-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
      modelRuntime: {
        generate: async () => {
          throw new Error('Runtime should not be called')
        },
      },
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    const manifestPath = join(cwd, '.mg', 'config.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.providers = {
      primary: {
        kind: 'microsoft-foundry',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
      },
    }
    manifest.deployments = {
      'primary:first': {
        adapter: 'mai-image',
        deploymentName: 'first',
        model: 'MAI-Image-2.5-Flash',
        provider: 'primary',
      },
      'primary:second': {
        adapter: 'azure-openai-image',
        deploymentName: 'second',
        model: 'gpt-image-2',
        provider: 'primary',
      },
    }
    manifest.routing = {
      generators: {
        image: {
          auto: ['primary:first', 'primary:second'],
        },
      },
      scenarios: {},
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )

    await expect(
      application.execute(
        {
          creativeBrief: 'Show the dashboard.',
          deploymentId: 'primary:second',
          force: false,
          mediaType: 'image',
          referencePaths: [],
          style: 'product-led',
          type: 'generate',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'confirmation_required',
      exitCode: 2,
      message:
        'Using fallback deployment "primary:second" for role "generation" requires --force',
    })
  })

  test('proposes but does not execute the next Auto deployment after failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-fallback-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createGenerationId: () => '01FAILED',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('first', 'MAI-Image-2.5-Flash'),
          foundryDeployment('second', 'gpt-image-2'),
        ],
      },
      modelRuntime: {
        generate: async () => {
          throw new Error('First deployment unavailable')
        },
      },
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

    await expect(
      application.execute(
        {
          creativeBrief: 'Show the dashboard.',
          force: false,
          mediaType: 'image',
          referencePaths: [],
          style: 'product-led',
          type: 'generate',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'fallback_available',
      exitCode: 2,
      message:
        'Creation failed with "primary:first"; retry "primary:second" only after approval',
    })
  })

  test('preserves the current Auto default when another Foundry project is added', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-routing-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    let discoveredModel = 'MAI-Image-2.5-Flash'
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('image', discoveredModel),
        ],
      },
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    await application.execute(
      {
        endpoint:
          'https://east.services.ai.azure.com/api/projects/media',
        name: 'east',
        type: 'configure-foundry',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )
    discoveredModel = 'gpt-image-2'
    await application.execute(
      {
        endpoint:
          'https://west.services.ai.azure.com/api/projects/media',
        name: 'west',
        type: 'configure-foundry',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      readJson(join(cwd, '.mg', 'config.json')),
    ).resolves.toMatchObject({
      routing: {
        generators: {
          image: {
            auto: ['east:image', 'west:image'],
          },
        },
      },
    })
  })

  test('returns non-secret workspace settings and authentication status', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-settings-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      authModule: {
        login: async () => ({state: 'login-completed'}),
        logout: async () => ({state: 'logout-completed'}),
        status: async () => ({help: [], state: 'signed-out'}),
      },
      createWorkspaceId: () => '01WORKSPACE',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {type: 'settings-get'},
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      auth: {state: 'signed-out'},
      manifest: {
        providers: {},
        schemaVersion: 2,
      },
      type: 'settings-get',
    })
  })

  test('uses a manually selected Eligible Model deployment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-manual-model-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createGenerationId: () => '01GENERATION',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('mai-fast', 'MAI-Image-2.5-Flash'),
          foundryDeployment('gpt-image', 'gpt-image-2'),
        ],
      },
      modelRuntime: createModelRuntime([
        createFakeModelAdapter('mai-image', {
          contents: Buffer.from('mai'),
          extension: '.png',
          mediaType: 'image/png',
        }),
        createFakeModelAdapter('azure-openai-image', {
          contents: Buffer.from('gpt'),
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

    const result = await application.execute(
      {
        creativeBrief: 'Show the dashboard.',
        deploymentId: 'primary:gpt-image',
        force: true,
        mediaType: 'image',
        referencePaths: [],
        style: 'product-led',
        type: 'generate',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(result).toMatchObject({
      generation: {
        resolvedModel: {
          id: 'primary:gpt-image',
          model: 'gpt-image-2',
        },
      },
      type: 'generate',
    })
  })

  test('returns generated outputs as reusable references', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-reference-action-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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
    const outputPath = join(
      initialized.workspace.path,
      'generations',
      '01GENERATION',
      'outputs',
      'output-1.png',
    )
    await writeFile(outputPath, 'generated image', 'utf8')
    await store.update('01GENERATION', (record) => ({
      ...record,
      outputs: [
        {
          mediaType: 'image/png',
          path: 'outputs/output-1.png',
          sha256: 'hash',
          size: 15,
        },
      ],
      status: 'succeeded',
    }))

    await expect(
      application.execute(
        {
          ids: ['01GENERATION'],
          type: 'generations-reference',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toEqual({
      references: [
        {
          generationId: '01GENERATION',
          mediaType: 'image/png',
          path: outputPath,
        },
      ],
      type: 'generations-reference',
    })
  })

  test('rejects Edit before execution when Auto lacks reference support', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-edit-capability-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('mai-efficient', 'MAI-Image-2e'),
        ],
      },
    })
    const initialized = await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    if (initialized.type !== 'init') {
      throw new Error('Expected init result')
    }
    await application.execute(
      {
        endpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        name: 'primary',
        type: 'configure-foundry',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )
    const store = createGenerationStore(initialized.workspace.path, {
      createId: () => '01SOURCE',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    await store.create(generationInput())
    const sourcePath = join(
      initialized.workspace.path,
      'generations',
      '01SOURCE',
      'outputs',
      'output-1.png',
    )
    await writeFile(sourcePath, 'generated image', 'utf8')
    await store.update('01SOURCE', (record) => ({
      ...record,
      outputs: [
        {
          mediaType: 'image/png',
          path: 'outputs/output-1.png',
          sha256: 'hash',
          size: 15,
        },
      ],
      status: 'succeeded',
    }))

    await expect(
      application.execute(
        {
          creativeBrief: 'Change the background.',
          id: '01SOURCE',
          type: 'generations-edit',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'model_capability_mismatch',
      message:
        'Model "MAI-Image-2e" does not accept image references',
    })
  })

  test('edits a Generation by referencing its output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-edit-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const ids = ['01SOURCE', '01EDITED']
    const application = createMediaGenApplication({
      createGenerationId: () => ids.shift() ?? 'unexpected',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('mai-fast', 'MAI-Image-2.5-Flash'),
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
    await application.execute(
      {
        creativeBrief: 'Original brief.',
        mediaType: 'image',
        referencePaths: [],
        style: 'product-led',
        type: 'generate',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    const result = await application.execute(
      {
        creativeBrief: 'Make the background darker.',
        id: '01SOURCE',
        type: 'generations-edit',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(result).toMatchObject({
      generation: {
        creativeBrief: 'Make the background darker.',
        id: '01EDITED',
        references: [
          {
            path: expect.stringContaining(
              join(
                '01SOURCE',
                'outputs',
                'output-1.png',
              ),
            ),
          },
        ],
        sourceGenerations: ['01SOURCE'],
      },
      type: 'generations-edit',
    })
  })

  test('recreates a Generation with updated choices and lineage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-recreate-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const ids = ['01SOURCE', '01RECREATED']
    const application = createMediaGenApplication({
      createGenerationId: () => ids.shift() ?? 'unexpected',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('mai-fast', 'MAI-Image-2.5-Flash'),
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
    await application.execute(
      {
        creativeBrief: 'Original brief.',
        mediaType: 'image',
        referencePaths: [],
        style: 'product-led',
        type: 'generate',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    const result = await application.execute(
      {
        creativeBrief: 'Updated brief.',
        id: '01SOURCE',
        style: 'cinematic',
        type: 'generations-recreate',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(result).toMatchObject({
      generation: {
        creativeBrief: 'Updated brief.',
        id: '01RECREATED',
        selection: {style: 'cinematic'},
        sourceGenerations: ['01SOURCE'],
      },
      type: 'generations-recreate',
    })
  })

  test('exports Generation media into the configured project directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-export-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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
    const manifestPath = join(cwd, '.mg', 'config.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.export = {defaultDirectory: 'assets/generated'}
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )
    const store = createGenerationStore(initialized.workspace.path, {
      createId: () => '01GENERATION',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    await store.create(generationInput())
    const sourcePath = join(
      initialized.workspace.path,
      'generations',
      '01GENERATION',
      'outputs',
      'output-1.png',
    )
    await writeFile(sourcePath, 'generated image', 'utf8')
    await store.update('01GENERATION', (record) => ({
      ...record,
      outputs: [
        {
          mediaType: 'image/png',
          path: 'outputs/output-1.png',
          sha256: 'hash',
          size: 15,
        },
      ],
      status: 'succeeded',
    }))

    const result = await application.execute(
      {
        force: false,
        id: '01GENERATION',
        type: 'generations-export',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    const destination = join(
      cwd,
      'assets',
      'generated',
      '01GENERATION-output-1.png',
    )
    expect(result).toEqual({
      files: [destination],
      id: '01GENERATION',
      type: 'generations-export',
    })
    await expect(readFile(destination, 'utf8')).resolves.toBe(
      'generated image',
    )
    await expect(
      readFile(`${destination}.json`, 'utf8'),
    ).rejects.toMatchObject({code: 'ENOENT'})
  })

  test('rejects export destinations outside the Project Directory', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-export-scope-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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
    const sourcePath = join(
      initialized.workspace.path,
      'generations',
      '01GENERATION',
      'outputs',
      'output-1.png',
    )
    await writeFile(sourcePath, 'generated image', 'utf8')
    await store.update('01GENERATION', (record) => ({
      ...record,
      outputs: [
        {
          mediaType: 'image/png',
          path: 'outputs/output-1.png',
          sha256: 'hash',
          size: 15,
        },
      ],
      status: 'succeeded',
    }))

    await expect(
      application.execute(
        {
          force: false,
          id: '01GENERATION',
          to: join('..', 'outside'),
          type: 'generations-export',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'invalid_export_destination',
      message:
        'Export destination must stay inside the Project Directory',
    })
  })

  test('deletes a Generation when force is supplied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-force-delete-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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

    await expect(
      application.execute(
        {
          force: true,
          id: '01GENERATION',
          type: 'generations-delete',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toEqual({
      id: '01GENERATION',
      state: 'deleted',
      type: 'generations-delete',
    })
  })

  test('requires force before deleting a Generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-delete-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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

    await expect(
      application.execute(
        {
          force: false,
          id: '01GENERATION',
          type: 'generations-delete',
        },
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'confirmation_required',
      exitCode: 2,
      message: 'Deleting Generation "01GENERATION" requires --force',
    })
  })

  test('lists and reads persisted Generations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-history-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createGenerationId: () => '01GENERATION',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('mai-fast', 'MAI-Image-2.5-Flash'),
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
    await application.execute(
      {
        creativeBrief: 'Show the dashboard at launch.',
        mediaType: 'image',
        referencePaths: [],
        style: 'cinematic',
        type: 'generate',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {type: 'generations-list'},
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      count: 1,
      generations: [{id: '01GENERATION'}],
      type: 'generations-list',
    })
    await expect(
      application.execute(
        {id: '01GENERATION', type: 'generations-get'},
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      generation: {id: '01GENERATION'},
      type: 'generations-get',
    })
  })

  test('generates media through the configured Auto deployment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-generate-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createGenerationId: () => '01GENERATION',
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('mai-fast', 'MAI-Image-2.5-Flash'),
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

    const result = await application.execute(
      {
        creativeBrief: 'Show the dashboard at launch.',
        mediaType: 'image',
        referencePaths: [],
        style: 'cinematic',
        type: 'generate',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(result).toMatchObject({
      generation: {
        creativeBrief: 'Show the dashboard at launch.',
        id: '01GENERATION',
        resolvedModel: {
          id: 'primary:mai-fast',
          model: 'MAI-Image-2.5-Flash',
        },
        selection: {
          generator: 'image',
          kind: 'generator',
          style: 'cinematic',
        },
        status: 'succeeded',
      },
      type: 'generate',
    })
  })

  test('configures a Foundry project and supported deployments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-foundry-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const foundryDiscovery: FoundryDiscovery = {
      listDeployments: async () => [
        foundryDeployment('mai-fast', 'MAI-Image-2.5-Flash'),
        foundryDeployment('voice', 'MAI-Voice-2'),
        foundryDeployment('sora', 'sora-2'),
        foundryDeployment('other', 'unsupported-model'),
      ],
    }
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01FOUNDRY',
      foundryDiscovery,
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    const endpoint =
      'https://example.services.ai.azure.com/api/projects/media'
    const result = await application.execute(
      {
        endpoint,
        name: 'primary',
        type: 'configure-foundry',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(result).toEqual({
      deployments: [
        {
          adapter: 'mai-image',
          deploymentName: 'mai-fast',
          id: 'primary:mai-fast',
          mediaType: 'image',
          model: 'MAI-Image-2.5-Flash',
        },
        {
          adapter: 'sora-video',
          deploymentName: 'sora',
          id: 'primary:sora',
          mediaType: 'video',
          model: 'sora-2',
        },
      ],
      provider: {
        endpoint,
        name: 'primary',
      },
      type: 'configure-foundry',
      unsupported: [
        {
          deploymentName: 'voice',
          model: 'MAI-Voice-2',
        },
        {
          deploymentName: 'other',
          model: 'unsupported-model',
        },
      ],
    })
    await expect(
      readJson(join(cwd, '.mg', 'config.json')),
    ).resolves.toMatchObject({
      deployments: {
        'primary:mai-fast': {
          adapter: 'mai-image',
          deploymentName: 'mai-fast',
          model: 'MAI-Image-2.5-Flash',
          provider: 'primary',
        },
        'primary:sora': {
          adapter: 'sora-video',
          deploymentName: 'sora',
          model: 'sora-2',
          provider: 'primary',
        },
      },
      providers: {
        primary: {
          kind: 'microsoft-foundry',
          projectEndpoint: endpoint,
        },
      },
      routing: {
        generators: {
          image: {
            auto: ['primary:mai-fast'],
          },
          video: {
            auto: ['primary:sora'],
          },
        },
        scenarios: {
          'explainer-video': {
            visuals: {
              auto: ['primary:sora'],
            },
          },
          'short-form-video': {
            video: {
              auto: ['primary:sora'],
            },
          },
        },
      },
    })
    const manifest = (await readJson(
      join(cwd, '.mg', 'config.json'),
    )) as {
      deployments: Record<string, unknown>
      routing: {
        scenarios: Record<string, Record<string, unknown>>
      }
    }
    expect(manifest.deployments).not.toHaveProperty('primary:voice')
    expect(
      manifest.routing.scenarios['explainer-video'],
    ).not.toHaveProperty('voice')
  })

  test('reports authentication status through the application interface', async () => {
    const authModule: AuthModule = {
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
    }
    const application = createMediaGenApplication({authModule})

    await expect(
      application.execute(
        {type: 'auth-status'},
        {bin: 'mg', cwd: 'C:\\work', mediaGenHome: 'C:\\home'},
      ),
    ).resolves.toEqual({
      account: {name: 'john@example.com', type: 'user'},
      state: 'signed-in',
      subscription: {
        id: 'subscription-id',
        name: 'Developer Subscription',
      },
      tenantId: 'tenant-id',
      type: 'auth',
    })
  })

  test('relinks a moved project to its existing Media Workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-relink-'))
    temporaryDirectories.push(root)
    const originalDirectory = join(root, 'Original Project')
    const movedDirectory = join(root, 'Moved Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(originalDirectory)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01RELINK',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd: originalDirectory, mediaGenHome},
    )
    await rename(originalDirectory, movedDirectory)

    const result = await application.execute(
      {from: originalDirectory, type: 'relink'},
      {bin: 'mg', cwd: movedDirectory, mediaGenHome},
    )

    expect(result).toEqual({
      from: originalDirectory,
      state: 'relinked',
      to: movedDirectory,
      type: 'relink',
      workspace: {
        id: '01RELINK',
        path: join(
          mediaGenHome,
          'workspaces',
          'original-project--01RELINK',
        ),
      },
    })
    await expect(readJson(join(mediaGenHome, 'registry.json'))).resolves.toMatchObject({
      workspaces: [
        {
          id: '01RELINK',
          projectDirectory: movedDirectory,
        },
      ],
    })
  })

  test('reports a healthy initialized workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-doctor-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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
      createWorkspaceId: () => '01HEALTHY',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    const result = await application.execute(
      {type: 'doctor'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(result).toEqual({
      checks: [
        {
          detail: 'john@example.com',
          name: 'azure-cli',
          status: 'pass',
        },
        {
          detail: join(cwd, '.mg', 'config.json'),
          name: 'manifest',
          status: 'pass',
        },
        {
          detail: '01HEALTHY',
          name: 'registry',
          status: 'pass',
        },
        {
          detail: join(
            mediaGenHome,
            'workspaces',
            'project--01HEALTHY',
          ),
          name: 'media-workspace',
          status: 'pass',
        },
        {
          detail: join(
            mediaGenHome,
            'workspaces',
            'project--01HEALTHY',
            'local.json',
          ),
          name: 'local-profile',
          status: 'pass',
        },
      ],
      help: [],
      state: 'healthy',
      type: 'doctor',
    })
  })

  test('reports an enabled Scenario without routing as not ready', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-scenario-doctor-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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
      createWorkspaceId: () => '01WORKSPACE',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    await application.execute(
      {
        enabled: true,
        id: 'short-form-video',
        type: 'scenarios-set-enabled',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {type: 'doctor'},
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      checks: expect.arrayContaining([
        {
          detail: 'Missing route for role "video"',
          name: 'scenario:short-form-video',
          status: 'fail',
        },
      ]),
      help: expect.arrayContaining([
        'Configure a video deployment for Short-form video.',
      ]),
      state: 'unhealthy',
      type: 'doctor',
    })
  })

  test('treats an Explainer without Speech as ready because Voice is optional', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-speech-doctor-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
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
      createWorkspaceId: () => '01WORKSPACE',
      foundryDiscovery: {
        listDeployments: async () => [
          foundryDeployment('sora', 'sora-2'),
        ],
      },
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
    await application.execute(
      {
        enabled: true,
        id: 'explainer-video',
        type: 'scenarios-set-enabled',
      },
      {bin: 'mg', cwd, mediaGenHome},
    )

    await expect(
      application.execute(
        {type: 'doctor'},
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).resolves.toMatchObject({
      checks: expect.arrayContaining([
        {
          detail: 'visuals: primary:sora',
          name: 'scenario:explainer-video',
          status: 'pass',
        },
      ]),
      help: [],
      state: 'healthy',
      type: 'doctor',
    })
  })

  test('preserves both projects when initialization runs concurrently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-concurrent-init-'))
    temporaryDirectories.push(root)
    const firstProject = join(root, 'First Project')
    const secondProject = join(root, 'Second Project')
    const mediaGenHome = join(root, 'home')
    await Promise.all([mkdir(firstProject), mkdir(secondProject)])
    const workspaceIds = ['01FIRST', '01SECOND']
    const application = createMediaGenApplication({
      createWorkspaceId: () => workspaceIds.shift() ?? 'unexpected',
    })

    await Promise.all([
      application.execute(
        {type: 'init'},
        {bin: 'mg', cwd: firstProject, mediaGenHome},
      ),
      application.execute(
        {type: 'init'},
        {bin: 'mg', cwd: secondProject, mediaGenHome},
      ),
    ])

    await expect(readJson(join(mediaGenHome, 'registry.json'))).resolves.toMatchObject({
      workspaces: expect.arrayContaining([
        expect.objectContaining({projectDirectory: firstProject}),
        expect.objectContaining({projectDirectory: secondProject}),
      ]),
    })
  })

  test('rejects an invalid workspace manifest before reporting ready', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-invalid-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01INVALID',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    await writeFile(
      join(cwd, '.mg', 'config.json'),
      '{"schemaVersion":1}',
      'utf8',
    )

    await expect(
      application.execute(
        {type: 'home'},
        {bin: 'mg', cwd, mediaGenHome},
      ),
    ).rejects.toMatchObject({
      code: 'invalid_manifest',
      message: expect.stringContaining(
        'Workspace manifest is invalid',
      ),
    })
  })

  test('reuses an existing workspace without overwriting configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-reinit-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)
    const workspaceIds = ['01ORIGINAL', '01UNEXPECTED']
    const application = createMediaGenApplication({
      createWorkspaceId: () => workspaceIds.shift() ?? 'unexpected',
    })

    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )
    const manifestPath = join(cwd, '.mg', 'config.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.export = {defaultDirectory: 'assets/generated'}
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )

    const result = await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    expect(result).toEqual({
      help: ['Run `mg`', 'Run `mg --help`'],
      manifest: {
        created: false,
        path: manifestPath,
      },
      projectDirectory: cwd,
      state: 'already-initialized',
      type: 'init',
      workspace: {
        id: '01ORIGINAL',
        path: join(
          mediaGenHome,
          'workspaces',
          'project--01ORIGINAL',
        ),
      },
    })
    await expect(readJson(manifestPath)).resolves.toMatchObject({
      export: {defaultDirectory: 'assets/generated'},
    })
    await expect(readJson(join(mediaGenHome, 'registry.json'))).resolves.toMatchObject({
      workspaces: [{id: '01ORIGINAL'}],
    })
  })

  test('preserves existing registry entries when another project initializes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-registry-'))
    temporaryDirectories.push(root)
    const firstProject = join(root, 'First Project')
    const secondProject = join(root, 'Second Project')
    const mediaGenHome = join(root, 'home')
    await Promise.all([mkdir(firstProject), mkdir(secondProject)])
    const workspaceIds = ['01FIRST', '01SECOND']
    const application = createMediaGenApplication({
      createWorkspaceId: () => workspaceIds.shift() ?? 'unexpected',
    })

    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd: firstProject, mediaGenHome},
    )
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd: secondProject, mediaGenHome},
    )

    await expect(readJson(join(mediaGenHome, 'registry.json'))).resolves.toEqual({
      schemaVersion: 1,
      workspaces: [
        {
          id: '01FIRST',
          name: 'First Project',
          projectDirectory: firstProject,
          slug: 'first-project',
        },
        {
          id: '01SECOND',
          name: 'Second Project',
          projectDirectory: secondProject,
          slug: 'second-project',
        },
      ],
    })
  })

  test('describes the initialized workspace from a nested directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-ready-'))
    temporaryDirectories.push(root)
    const projectDirectory = join(root, 'Product Launch')
    const nestedDirectory = join(projectDirectory, 'src', 'features')
    const mediaGenHome = join(root, 'home')
    await mkdir(nestedDirectory, {recursive: true})

    const application = createMediaGenApplication({
      createWorkspaceId: () => '01READYWORKSPACE',
    })
    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd: projectDirectory, mediaGenHome},
    )

    const result = await application.execute(
      {type: 'home'},
      {bin: 'mg', cwd: nestedDirectory, mediaGenHome},
    )

    expect(result).toEqual({
      bin: 'mg',
      description: 'Local-first image and video generation workspace',
      help: ['Run `mg --help`'],
      manifest: {
        exists: true,
        path: join(projectDirectory, '.mg', 'config.json'),
      },
      projectDirectory,
      state: 'ready',
      type: 'home',
      workspace: {
        id: '01READYWORKSPACE',
        path: join(
          mediaGenHome,
          'workspaces',
          'product-launch--01READYWORKSPACE',
        ),
      },
    })
  })

  test('initializes tracked configuration and user workspace state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-init-'))
    temporaryDirectories.push(root)
    const cwd = join(root, 'Product Launch')
    const mediaGenHome = join(root, 'home')
    await mkdir(cwd)

    const application = createMediaGenApplication({
      createWorkspaceId: () => '01TESTWORKSPACE',
    })
    const result = await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    const workspaceDirectory = join(
      mediaGenHome,
      'workspaces',
      'product-launch--01TESTWORKSPACE',
    )

    expect(result).toEqual({
      help: ['Run `mg`', 'Run `mg --help`'],
      manifest: {
        created: true,
        path: join(cwd, '.mg', 'config.json'),
      },
      projectDirectory: cwd,
      state: 'initialized',
      type: 'init',
      workspace: {
        id: '01TESTWORKSPACE',
        path: workspaceDirectory,
      },
    })

    await expect(
      readJson(join(cwd, '.mg', 'config.json')),
    ).resolves.toEqual({
      deployments: {},
      export: {},
      providers: {},
      routing: {
        generators: {},
        scenarios: {},
      },
      scenarios: {
        enabled: [],
      },
      schemaVersion: 2,
      workspace: {
        name: 'Product Launch',
      },
    })
    await expect(readJson(join(mediaGenHome, 'registry.json'))).resolves.toEqual({
      schemaVersion: 1,
      workspaces: [
        {
          id: '01TESTWORKSPACE',
          name: 'Product Launch',
          projectDirectory: cwd,
          slug: 'product-launch',
        },
      ],
    })
    await expect(readJson(join(workspaceDirectory, 'local.json'))).resolves.toEqual({
      schemaVersion: 1,
    })
    await expect(stat(join(workspaceDirectory, 'generations'))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    })
    await expect(stat(join(workspaceDirectory, 'cache'))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    })
    await expect(stat(join(workspaceDirectory, 'logs'))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    })
  })

  test('describes an uninitialized current directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'media-gen-'))
    temporaryDirectories.push(cwd)

    const application = createMediaGenApplication()
    const result = await application.execute(
      {type: 'home'},
      {bin: 'mg', cwd, mediaGenHome: join(cwd, 'home')},
    )

    expect(result).toEqual({
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

  async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'))
  }

  function foundryDeployment(name: string, modelName: string) {
    return {
      capabilities: {},
      modelName,
      modelPublisher: 'publisher',
      modelVersion: '1',
      name,
      sku: {
        capacity: 1,
        name: 'GlobalStandard',
        tier: 'Standard',
      },
    }
  }

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
})
