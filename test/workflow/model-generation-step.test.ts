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

import {
  createModelGenerationStepHandler,
  type ModelPromptFactory,
} from '../../src/workflow/model-generation-step.js'
import type {GenerationDeployment} from '../../src/generation/generation-module.js'
import type {
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from '../../src/model-runtime/model-runtime.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('ModelGenerationStepHandler', () => {
  test('assembles a transient prompt and writes normalized working artifacts', async () => {
    const generationDirectory = await mkdtemp(
      join(tmpdir(), 'media-gen-model-step-'),
    )
    temporaryDirectories.push(generationDirectory)
    const referencePath = join(
      generationDirectory,
      'working',
      'reference.png',
    )
    await mkdir(join(referencePath, '..'), {recursive: true})
    await writeFile(referencePath, 'reference image')
    const requests: ProviderGenerationRequest[] = []
    const promptFactory: ModelPromptFactory = {
      assemble: (data) => {
        const scene = data as {scene: string}
        return `SCENE: ${scene.scene}`
      },
      kind: 'scene-video',
    }
    const handler = createModelGenerationStepHandler({
      deployments: {
        visuals: deployment(),
      },
      generationDirectory,
      modelRuntime: {
        generate: async (request) => {
          requests.push(request)
          return output('.mp4', 'video/mp4', 'video bytes')
        },
      },
      promptFactories: [promptFactory],
    })

    const result = await handler.execute(
      {
        controls: {
          height: 720,
          nSeconds: 20,
          width: 1280,
        },
        output: {
          basePath: 'working/scenes/scene-1/video',
          disposition: 'working',
          id: 'scene-1-video',
        },
        prompt: {
          data: {scene: 'A robot is drawn on paper.'},
          kind: 'scene-video',
        },
        referenceArtifactIds: ['style-reference'],
        role: 'visuals',
      },
      {
        dependencyArtifacts: [
          {
            disposition: 'working',
            id: 'style-reference',
            mediaType: 'image/png',
            path: 'working/reference.png',
          },
        ],
        dependencyOutputs: {},
      },
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      adapter: 'sora-video',
      controls: {
        height: 720,
        nSeconds: 20,
        width: 1280,
      },
      prompt: 'SCENE: A robot is drawn on paper.',
      references: [
        {
          mediaType: 'image/png',
          path: referencePath,
        },
      ],
    })
    expect(result).toEqual({
      artifacts: [
        {
          disposition: 'working',
          id: 'scene-1-video',
          mediaType: 'video/mp4',
          path: 'working/scenes/scene-1/video.mp4',
        },
      ],
      output: {jobId: 'job-1'},
    })
    await expect(
      readFile(
        join(
          generationDirectory,
          'working',
          'scenes',
          'scene-1',
          'video.mp4',
        ),
        'utf8',
      ),
    ).resolves.toBe('video bytes')
  })

  test('rejects a prompt factory that is not registered', async () => {
    const generationDirectory = await mkdtemp(
      join(tmpdir(), 'media-gen-model-step-'),
    )
    temporaryDirectories.push(generationDirectory)
    const handler = createModelGenerationStepHandler({
      deployments: {visuals: deployment()},
      generationDirectory,
      modelRuntime: {
        generate: async () => {
          throw new Error('Unexpected generation')
        },
      },
      promptFactories: [],
    })

    await expect(
      handler.execute(
        {
          controls: {},
          output: {
            basePath: 'working/video',
            disposition: 'working',
            id: 'video',
          },
          prompt: {data: {}, kind: 'missing'},
          role: 'visuals',
        },
        {dependencyArtifacts: [], dependencyOutputs: {}},
      ),
    ).rejects.toThrow(
      'Model prompt factory "missing" is not available',
    )
  })
})

function deployment(): GenerationDeployment {
  return {
    adapter: 'sora-video',
    deploymentName: 'sora',
    id: 'primary:sora',
    model: 'sora-2',
    projectEndpoint:
      'https://example.services.ai.azure.com/api/projects/media',
    provider: 'primary',
  }
}

function output(
  extension: string,
  mediaType: string,
  contents: string,
): ProviderGenerationResult {
  return {
    jobId: 'job-1',
    outputs: [
      {
        contents: Buffer.from(contents),
        extension,
        mediaType,
      },
    ],
  }
}
