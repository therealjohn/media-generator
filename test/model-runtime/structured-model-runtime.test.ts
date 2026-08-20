import {describe, expect, test} from 'vitest'

import {
  createStructuredModelRuntime,
  type StructuredModelAdapter,
  type StructuredModelRequest,
} from '../../src/model-runtime/structured-model-runtime.js'

describe('StructuredModelRuntime', () => {
  test('routes structured generation to the requested adapter', async () => {
    const observed: StructuredModelRequest[] = []
    const adapter: StructuredModelAdapter = {
      generate: async (request) => {
        observed.push(request)
        return {value: {planned: true}}
      },
      kind: 'azure-openai-chat',
    }
    const runtime = createStructuredModelRuntime([adapter])
    const request: StructuredModelRequest = {
      adapter: 'azure-openai-chat',
      deploymentName: 'planner',
      jsonSchema: {type: 'object'},
      modelName: 'gpt-4.1-mini',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'Plan.',
      schemaName: 'plan',
      systemPrompt: 'Return JSON.',
    }

    await expect(runtime.generate(request)).resolves.toEqual({
      value: {planned: true},
    })
    expect(observed).toEqual([request])
  })
})
