import {describe, expect, test} from 'vitest'

import {
  createDefaultModelRuntime,
  createDefaultStructuredModelRuntime,
} from '../../src/model-runtime/default-runtime.js'

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

  test('includes the structured Azure OpenAI planning adapter', async () => {
    const runtime = createDefaultStructuredModelRuntime({
      credential: {
        getToken: async () => ({
          expiresOnTimestamp: Date.now() + 60_000,
          token: 'token',
        }),
      },
      fetch: async () =>
        Response.json({
          choices: [
            {
              message: {
                content: '{"title":"Plan"}',
                role: 'assistant',
              },
            },
          ],
        }),
    })

    await expect(
      runtime.generate({
        adapter: 'azure-openai-chat',
        deploymentName: 'planner',
        jsonSchema: {
          properties: {title: {type: 'string'}},
          required: ['title'],
          type: 'object',
        },
        modelName: 'gpt-4.1-mini',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'Plan an explainer.',
        schemaName: 'plan',
        systemPrompt: 'Return JSON.',
      }),
    ).resolves.toEqual({value: {title: 'Plan'}})
  })
})
