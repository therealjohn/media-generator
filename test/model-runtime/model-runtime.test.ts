import {describe, expect, test} from 'vitest'

import {
  createFakeModelAdapter,
  createModelRuntime,
} from '../../src/model-runtime/model-runtime.js'

describe('ModelRuntime', () => {
  test('normalizes output through the selected adapter', async () => {
    const runtime = createModelRuntime([
      createFakeModelAdapter('mai-image', {
        contents: Buffer.from('generated image'),
        extension: '.png',
        mediaType: 'image/png',
      }),
    ])

    const result = await runtime.generate({
      adapter: 'mai-image',
      controls: {},
      deploymentName: 'mai-fast',
      modelName: 'MAI-Image-2.5-Flash',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'internal prompt',
      references: [],
    })

    expect(result).toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('generated image'),
          extension: '.png',
          mediaType: 'image/png',
        },
      ],
    })
  })
})
