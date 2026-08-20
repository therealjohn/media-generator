import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {createGenerationModule} from '../../src/generation/generation-module.js'
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

describe('GenerationModule', () => {
  test('records provider failures before surfacing them', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-run-failure-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const store = createGenerationStore(workspacePath, {
      createId: () => '01FAILED',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    const generation = createGenerationModule({
      modelRuntime: {
        generate: async () => {
          throw new Error('Provider failed')
        },
      },
      store,
      workspacePath,
    })

    await expect(
      generation.generate({
        controls: {},
        creativeBrief: 'Show the dashboard at launch.',
        deployment: {
          adapter: 'mai-image',
          deploymentName: 'mai-fast',
          id: 'primary:mai-fast',
          model: 'MAI-Image-2.5-Flash',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
        mediaType: 'image',
        referencePaths: [],
        selection: {
          generator: 'image',
          kind: 'generator',
          style: 'cinematic',
        },
        sourceGenerations: [],
      }),
    ).rejects.toThrow('Provider failed')
    await expect(store.get('01FAILED')).resolves.toMatchObject({
      error: {
        code: 'generation_failed',
        message: 'Provider failed',
      },
      status: 'failed',
    })
  })

  test('runs a Generation to completion and saves normalized output', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-run-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    let now = 0
    const store = createGenerationStore(workspacePath, {
      createId: () => '01GENERATION',
      now: () =>
        new Date(`2026-08-18T12:00:0${now++}.000Z`),
    })
    const runtime = createModelRuntime([
      createFakeModelAdapter('mai-image', {
        contents: Buffer.from('generated image'),
        extension: '.png',
        mediaType: 'image/png',
      }),
    ])
    const generation = createGenerationModule({
      modelRuntime: runtime,
      store,
      workspacePath,
    })

    const result = await generation.generate({
      controls: {height: 864, width: 1536},
      creativeBrief: 'Show the dashboard at launch.',
      deployment: {
        adapter: 'mai-image',
        deploymentName: 'mai-fast',
        id: 'primary:mai-fast',
        model: 'MAI-Image-2.5-Flash',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        provider: 'primary',
      },
      mediaType: 'image',
      referencePaths: [],
      selection: {
        generator: 'image',
        kind: 'generator',
        style: 'cinematic',
      },
      sourceGenerations: [],
    })

    expect(result).toMatchObject({
      controls: {height: 864, width: 1536},
      creativeBrief: 'Show the dashboard at launch.',
      outputs: [
        {
          mediaType: 'image/png',
          path: 'outputs/output-1.png',
          size: 15,
        },
      ],
      status: 'succeeded',
    })
    expect(result).not.toHaveProperty('modelPrompt')
    await expect(
      readFile(
        join(
          workspacePath,
          'generations',
          '01GENERATION',
          'outputs',
          'output-1.png',
        ),
        'utf8',
      ),
    ).resolves.toBe('generated image')
  })
})
