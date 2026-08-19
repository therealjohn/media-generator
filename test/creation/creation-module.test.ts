import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {createCreationModule} from '../../src/creation/creation-module.js'
import {createGenerationStore} from '../../src/generation/generation-store.js'
import type {ProviderGenerationRequest} from '../../src/model-runtime/model-runtime.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('CreationModule', () => {
  test('creates an Explainer video with Preset and Production Option guidance', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-explainer-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const providerRequests: ProviderGenerationRequest[] = []
    const creation = createCreationModule({
      modelRuntime: {
        generate: async (request) => {
          providerRequests.push(request)
          if (request.adapter === 'mai-voice') {
            return {
              jobId: null,
              outputs: [
                {
                  contents: Buffer.from('narration'),
                  extension: '.mp3',
                  mediaType: 'audio/mpeg',
                },
              ],
            }
          }
          return {
            jobId: 'job-1',
            outputs: [
              {
                contents: Buffer.from('explainer'),
                extension: '.mp4',
                mediaType: 'video/mp4',
              },
            ],
          }
        },
      },
      store: createGenerationStore(workspacePath, {
        createId: () => '01EXPLAINER',
        now: () => new Date('2026-08-18T12:00:00.000Z'),
      }),
      workspacePath,
    })

    const result = await creation.create({
      deployments: {
        visuals: {
          adapter: 'sora-video',
          deploymentName: 'sora',
          id: 'primary:sora',
          model: 'sora-2',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
        voice: {
          adapter: 'mai-voice',
          deploymentName: 'voice',
          endpoint:
            'https://eastus.tts.speech.microsoft.com/',
          id: 'primary:voice',
          model: 'MAI-Voice-2',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
      },
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
        sourcePaths: [],
        textReferences: [
          {
            content: '# Product setup\n\nConnect the SDK.',
            format: 'markdown',
            title: 'Product documentation',
          },
        ],
        webReferenceUrls: [
          'https://docs.example.com/product/setup',
        ],
      },
      sourceGenerations: [],
    })

    expect(providerRequests[0]).toMatchObject({
      controls: {
        height: 720,
        nSeconds: 12,
        nVariants: 1,
        width: 1280,
      },
      references: [],
    })
    expect(providerRequests[0]?.prompt).toContain(
      'Editorial motion graphics',
    )
    expect(providerRequests[0]?.prompt).toContain(
      'Narration voice request: en-US-Harper:MAI-Voice-2',
    )
    expect(providerRequests[0]?.prompt).toContain(
      'Include clear burned-in subtitles',
    )
    expect(providerRequests[0]?.prompt).toContain(
      'https://docs.example.com/product/setup',
    )
    expect(providerRequests[0]?.prompt).toContain(
      'Text Reference: Product documentation',
    )
    expect(providerRequests[0]?.prompt).toContain('Connect the SDK.')
    expect(providerRequests[1]).toMatchObject({
      adapter: 'mai-voice',
      controls: {
        voice: 'en-US-Harper:MAI-Voice-2',
      },
      endpoint: 'https://eastus.tts.speech.microsoft.com/',
      prompt:
        'Retrieval-augmented generation grounds answers in trusted sources.',
      references: [],
    })
    expect(result).toMatchObject({
      id: '01EXPLAINER',
      resolvedResources: [
        {
          id: 'primary:sora',
          role: 'visuals',
        },
        {
          id: 'primary:voice',
          role: 'voice',
        },
      ],
      selection: {
        kind: 'scenario',
        preset: 'editorial-motion-graphics',
        scenario: 'explainer-video',
      },
      status: 'succeeded',
      textReferences: [
        {
          path: 'inputs/text-reference-1.md',
          title: 'Product documentation',
        },
      ],
      webReferences: [
        {url: 'https://docs.example.com/product/setup'},
      ],
    })
    expect(result.outputs).toMatchObject([
      {mediaType: 'video/mp4'},
      {mediaType: 'audio/mpeg'},
    ])
    expect(JSON.stringify(result)).not.toContain('Connect the SDK.')
    await expect(
      readFile(
        join(
          workspacePath,
          'generations',
          '01EXPLAINER',
          'inputs',
          'text-reference-1.md',
        ),
        'utf8',
      ),
    ).resolves.toBe('# Product setup\n\nConnect the SDK.')
  })

  test('creates styled Short-form video variants through one Scenario request', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-creation-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const sourcePath = join(workspacePath, 'interview.mp4')
    await writeFile(sourcePath, 'source video')
    let providerRequest: ProviderGenerationRequest | undefined
    const creation = createCreationModule({
      modelRuntime: {
        generate: async (request) => {
          providerRequest = request
          return {
            jobId: 'job-1',
            outputs: [
              {
                contents: Buffer.from('clip one'),
                extension: '.mp4',
                mediaType: 'video/mp4',
              },
              {
                contents: Buffer.from('clip two'),
                extension: '.mp4',
                mediaType: 'video/mp4',
              },
              {
                contents: Buffer.from('clip three'),
                extension: '.mp4',
                mediaType: 'video/mp4',
              },
            ],
          }
        },
      },
      store: createGenerationStore(workspacePath, {
        createId: () => '01SHORT',
        now: () => new Date('2026-08-18T12:00:00.000Z'),
      }),
      workspacePath,
    })

    const result = await creation.create({
      deployments: {
        video: {
          adapter: 'sora-video',
          deploymentName: 'sora',
          id: 'primary:sora',
          model: 'sora-2',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
      },
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
      },
      sourceGenerations: [],
    })

    expect(providerRequest).toMatchObject({
      controls: {
        height: 1280,
        nSeconds: 8,
        nVariants: 3,
        width: 720,
      },
      references: [{path: sourcePath}],
    })
    expect(providerRequest?.prompt).toContain('Bold urban')
    expect(providerRequest?.prompt).toContain('styled subtitles')
    expect(result).toMatchObject({
      id: '01SHORT',
      operations: [
        {kind: 'scenario-prepare', status: 'succeeded'},
        {kind: 'model-generate', status: 'succeeded'},
      ],
      outputs: [
        {path: 'outputs/output-1.mp4'},
        {path: 'outputs/output-2.mp4'},
        {path: 'outputs/output-3.mp4'},
      ],
      progress: {
        completed: 2,
        stage: 'succeeded',
        total: 2,
      },
      resolvedResources: [
        {
          id: 'primary:sora',
          role: 'video',
        },
      ],
      scenario: {
        inputs: {
          sourcePaths: [sourcePath],
        },
        options: {
          'clip-count': 3,
          orientation: 'vertical',
        },
      },
      schemaVersion: 4,
      selection: {
        kind: 'scenario',
        preset: 'bold-urban',
        scenario: 'short-form-video',
      },
      status: 'succeeded',
    })
  })
})
