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
import type {MediaCompositionRequest} from '../../src/media/media-composer.js'
import type {ProviderGenerationRequest} from '../../src/model-runtime/model-runtime.js'
import type {StructuredModelRequest} from '../../src/model-runtime/structured-model-runtime.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('Explainer workflow creation', () => {
  test('plans, generates one reference and three narrated scenes, then publishes one video', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-explainer-workflow-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const sourceImagePath = join(workspacePath, 'style.png')
    await writeFile(sourceImagePath, 'source style')
    const structuredRequests: StructuredModelRequest[] = []
    const mediaRequests: ProviderGenerationRequest[] = []
    const compositionRequests: MediaCompositionRequest[] = []
    const creation = createCreationModule({
      imageNormalizer: testImageNormalizer(),
      mediaComposer: {
        compose: async (request) => {
          compositionRequests.push(request)
          await mkdir(join(request.outputPath, '..'), {recursive: true})
          await writeFile(request.outputPath, 'final explainer')
          return {
            durationSeconds: 60,
            mediaType: 'video/mp4',
            path: request.outputPath,
          }
        },
      },
      modelRuntime: {
        generate: async (request) => {
          mediaRequests.push(request)
          if (request.adapter === 'mai-voice') {
            return {
              jobId: null,
              outputs: [
                {
                  contents: Buffer.from('voice audio'),
                  extension: '.mp3',
                  mediaType: 'audio/mpeg',
                },
              ],
            }
          }
          if (request.adapter === 'sora-video') {
            return {
              jobId: `video-${mediaRequests.length}`,
              outputs: [
                {
                  contents: Buffer.from('scene video'),
                  extension: '.mp4',
                  mediaType: 'video/mp4',
                },
              ],
            }
          }
          return {
            jobId: null,
            outputs: [
              {
                contents: Buffer.from('generated reference'),
                extension: '.png',
                mediaType: 'image/png',
              },
            ],
          }
        },
      },
      store: createGenerationStore(workspacePath, {
        createId: () => '01EXPLAINER',
        now: () => new Date('2026-08-19T20:00:00.000Z'),
      }),
      structuredModelRuntime: {
        generate: async (request) => {
          structuredRequests.push(request)
          return {
            value: {
              scenes: [
                scene('scene-1', 'Define the agent.'),
                scene('scene-2', 'Connect its tools.'),
                scene('scene-3', 'Publish the agent.'),
              ],
              title: 'Create an AI agent',
              visualBible:
                'Loose black ink line art on off-white paper.',
            },
          }
        },
      },
      workspacePath,
    })

    const result = await creation.create({
      deployments: {
        planning: {
          adapter: 'azure-openai-chat',
          deploymentName: 'planner',
          id: 'primary:planner',
          model: 'gpt-4.1-mini',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
        'reference-image': {
          adapter: 'mai-image',
          deploymentName: 'mai-image',
          id: 'primary:mai-image',
          model: 'MAI-Image-2.5',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
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
          apiKey: 'private-speech-key',
          defaultVoice: 'en-US-Ethan:MAI-Voice-2',
          deploymentName: 'azure-speech',
          endpoint:
            'https://speech-resource.cognitiveservices.azure.com/',
          id: 'local:speech',
          model: 'MAI-Voice-2',
          projectEndpoint:
            'https://speech-resource.cognitiveservices.azure.com/',
          provider: 'local-profile',
        },
      },
      force: false,
      request: {
        creativeBrief: 'Explain how to create an AI agent.',
        deploymentOverrides: {},
        kind: 'scenario',
        options: {
          'aspect-ratio': '16:9',
          duration: 60,
          subtitles: true,
          voice: {mode: 'auto'},
        },
        preset: 'hand-drawn',
        scenario: 'explainer-video',
        sourcePaths: [sourceImagePath],
        textReferences: [
          {
            content: '# Foundry\n\nCreate an agent project.',
            format: 'markdown',
            title: 'Foundry documentation',
          },
        ],
        webReferenceUrls: [
          'https://learn.microsoft.com/foundry',
        ],
      },
      sourceGenerations: [],
    })

    expect(structuredRequests).toHaveLength(1)
    expect(structuredRequests[0]?.prompt).toContain(
      'Create an agent project.',
    )
    const imageRequests = mediaRequests.filter(
      (request) => request.adapter === 'mai-image',
    )
    const videoRequests = mediaRequests.filter(
      (request) => request.adapter === 'sora-video',
    )
    const voiceRequests = mediaRequests.filter(
      (request) => request.adapter === 'mai-voice',
    )
    expect(imageRequests).toHaveLength(1)
    expect(imageRequests[0]?.references).toMatchObject([
      {path: sourceImagePath},
    ])
    expect(videoRequests).toHaveLength(3)
    expect(
      new Set(
        videoRequests.map((request) => request.references[0]?.path),
      ).size,
    ).toBe(1)
    expect(videoRequests[0]?.prompt).toContain(
      'STYLE REFERENCE (look only',
    )
    expect(videoRequests.map((request) => request.controls.nSeconds)).toEqual(
      [20, 20, 20],
    )
    expect(voiceRequests).toHaveLength(3)
    expect(
      voiceRequests.map((request) => request.controls.voice),
    ).toEqual([
      'en-US-Ethan:MAI-Voice-2',
      'en-US-Ethan:MAI-Voice-2',
      'en-US-Ethan:MAI-Voice-2',
    ])
    expect(voiceRequests.map((request) => request.prompt)).toEqual([
      'Define the agent.',
      'Connect its tools.',
      'Publish the agent.',
    ])
    expect(compositionRequests).toHaveLength(1)
    expect(compositionRequests[0]?.scenes).toHaveLength(3)
    expect(result).toMatchObject({
      id: '01EXPLAINER',
      outputs: [
        {
          mediaType: 'video/mp4',
          path: 'outputs/explainer.mp4',
        },
      ],
      progress: {
        completed: 10,
        stage: 'succeeded',
        total: 10,
      },
      resolvedModel: {
        id: 'primary:sora',
      },
      resolvedResources: [
        {id: 'primary:planner', role: 'planning'},
        {id: 'primary:mai-image', role: 'reference-image'},
        {id: 'primary:sora', role: 'visuals'},
        {id: 'local:speech', role: 'voice'},
      ],
      scenario: {
        options: {
          'aspect-ratio': '16:9',
          duration: 60,
          'output-height': 720,
          'output-width': 1280,
          'resolved-voice': 'en-US-Ethan:MAI-Voice-2',
          subtitles: true,
        },
      },
      status: 'succeeded',
    })
    expect(result.outputs).toHaveLength(1)
    const workflowState = await readFile(
      join(
        workspacePath,
        'generations',
        '01EXPLAINER',
        'working',
        'workflow.json',
      ),
      'utf8',
    )
    expect(workflowState).not.toContain('private-speech-key')
    expect(workflowState).not.toContain(
      'STYLE REFERENCE (look only',
    )
  })

  test('rejects excess source images before paid planning', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-explainer-references-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const first = join(workspacePath, 'first.png')
    const second = join(workspacePath, 'second.png')
    await Promise.all([
      writeFile(first, 'first'),
      writeFile(second, 'second'),
    ])
    let planningCalls = 0
    const creation = createCreationModule({
      imageNormalizer: testImageNormalizer(),
      mediaComposer: {
        compose: async () => {
          throw new Error('Unexpected composition')
        },
      },
      modelRuntime: {
        generate: async () => {
          throw new Error('Unexpected generation')
        },
      },
      store: createGenerationStore(workspacePath, {
        createId: () => '01REFERENCES',
        now: () => new Date('2026-08-19T20:00:00.000Z'),
      }),
      structuredModelRuntime: {
        generate: async () => {
          planningCalls += 1
          throw new Error('Unexpected planning')
        },
      },
      workspacePath,
    })

    await expect(
      creation.create({
        deployments: explainerDeployments(),
        force: false,
        request: {
          creativeBrief: 'Explain the product.',
          deploymentOverrides: {},
          kind: 'scenario',
          options: {
            'aspect-ratio': '16:9',
            duration: 20,
            subtitles: true,
            voice: {mode: 'off'},
          },
          preset: 'hand-drawn',
          scenario: 'explainer-video',
          sourcePaths: [first, second],
        },
        sourceGenerations: [],
      }),
    ).rejects.toThrow(
      'Reference-image model "MAI-Image-2.5" accepts at most 1 image reference',
    )
    expect(planningCalls).toBe(0)
  })
})

function scene(id: string, narration: string) {
  return {
    ambientAudio: 'Soft paper sounds.',
    durationSeconds: 20,
    id,
    motion: 'Slow push in.',
    narration,
    negative: 'No freeze frame.',
    scene: `A hand-drawn scene for ${id}.`,
  }
}

function explainerDeployments() {
  return {
    planning: {
      adapter: 'azure-openai-chat' as const,
      deploymentName: 'planner',
      id: 'primary:planner',
      model: 'gpt-4.1-mini',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      provider: 'primary',
    },
    'reference-image': {
      adapter: 'mai-image' as const,
      deploymentName: 'mai-image',
      id: 'primary:mai-image',
      model: 'MAI-Image-2.5',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      provider: 'primary',
    },
    visuals: {
      adapter: 'sora-video' as const,
      deploymentName: 'sora',
      id: 'primary:sora',
      model: 'sora-2',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      provider: 'primary',
    },
  }
}

function testImageNormalizer() {
  return {
    normalize: async (request: {
      inputPath: string
      outputPath: string
    }) => {
      await writeFile(
        request.outputPath,
        await readFile(request.inputPath),
      )
    },
  }
}
