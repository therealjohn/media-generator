import {
  mkdir,
  mkdtemp,
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
      schemaVersion: 5,
      selection: {
        kind: 'scenario',
        preset: 'bold-urban',
        scenario: 'short-form-video',
      },
      status: 'succeeded',
    })
  })
})
