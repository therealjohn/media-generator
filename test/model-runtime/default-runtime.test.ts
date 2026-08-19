import {describe, expect, test} from 'vitest'

import {createDefaultModelRuntime} from '../../src/model-runtime/default-runtime.js'

describe('createDefaultModelRuntime', () => {
  test('includes the MAI image adapter', async () => {
    const runtime = createDefaultModelRuntime({
      credential: {
        getToken: async () => ({
          expiresOnTimestamp: Date.now() + 60_000,
          token: 'token',
        }),
      },
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                b64_json: Buffer.from('image').toString('base64'),
              },
            ],
          }),
          {
            headers: {'content-type': 'application/json'},
            status: 200,
          },
        ),
    })

    await expect(
      runtime.generate({
        adapter: 'mai-image',
        controls: {},
        deploymentName: 'mai-fast',
        modelName: 'MAI-Image-2.5-Flash',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'prompt',
        references: [],
      }),
    ).resolves.toMatchObject({
      outputs: [
        {
          contents: Buffer.from('image'),
          mediaType: 'image/png',
        },
      ],
    })
  })
})
