import {describe, expect, test} from 'vitest'

import {AzureOpenAIChatAdapter} from '../../../src/model-runtime/adapters/azure-openai-chat-adapter.js'
import type {StructuredModelRequest} from '../../../src/model-runtime/structured-model-runtime.js'

describe('AzureOpenAIChatAdapter', () => {
  test('requests schema-constrained JSON from the Foundry v1 endpoint', async () => {
    const calls: Array<{init: RequestInit; url: string}> = []
    const scopes: string[] = []
    const adapter = new AzureOpenAIChatAdapter({
      fetch: async (input, init = {}) => {
        calls.push({init, url: String(input)})
        return Response.json({
          choices: [
            {
              finish_reason: 'stop',
              index: 0,
              message: {
                content: '{"title":"Planned"}',
                role: 'assistant',
              },
            },
          ],
          created: 1,
          id: 'completion-1',
          model: 'gpt-4.1-mini',
          object: 'chat.completion',
          usage: {
            completion_tokens: 10,
            prompt_tokens: 20,
            total_tokens: 30,
          },
        })
      },
      getAccessToken: async (scope) => {
        scopes.push(scope)
        return 'test-token'
      },
    })

    const result = await adapter.generate(request())

    expect(scopes).toEqual([
      'https://cognitiveservices.azure.com/.default',
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://example.services.ai.azure.com/openai/v1/chat/completions',
    )
    expect(
      new Headers(calls[0]?.init.headers).get('authorization'),
    ).toBe('Bearer test-token')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      messages: [
        {content: 'Return a plan.', role: 'system'},
        {content: 'Explain the product.', role: 'user'},
      ],
      model: 'planner-deployment',
      response_format: {
        json_schema: {
          name: 'explainer_plan',
          schema: {
            properties: {title: {type: 'string'}},
            required: ['title'],
            type: 'object',
          },
          strict: true,
        },
        type: 'json_schema',
      },
    })
    expect(result).toEqual({value: {title: 'Planned'}})
  })

  test('surfaces provider errors without a success-shaped fallback', async () => {
    const adapter = new AzureOpenAIChatAdapter({
      fetch: async () =>
        Response.json(
          {error: {message: 'Structured outputs are unavailable'}},
          {status: 400},
        ),
      getAccessToken: async () => 'test-token',
    })

    await expect(adapter.generate(request())).rejects.toThrow(
      'Planning model request failed with HTTP 400: Structured outputs are unavailable',
    )
  })
})

function request(): StructuredModelRequest {
  return {
    adapter: 'azure-openai-chat',
    deploymentName: 'planner-deployment',
    jsonSchema: {
      properties: {title: {type: 'string'}},
      required: ['title'],
      type: 'object',
    },
    modelName: 'gpt-4.1-mini',
    projectEndpoint:
      'https://example.services.ai.azure.com/api/projects/media',
    prompt: 'Explain the product.',
    schemaName: 'explainer_plan',
    systemPrompt: 'Return a plan.',
  }
}
