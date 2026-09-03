import {join} from 'node:path'

import type {TokenCredential} from '@azure/core-auth'
import {describe, expect, test} from 'vitest'

import {AzureOpenAIImageAdapter} from '../../../src/model-runtime/adapters/azure-openai-image-adapter.js'
import type {ReferenceFingerprint} from '../../../src/generation/generation-store.js'

const accessToken = {
  expiresOnTimestamp: Date.now() + 60_000,
  token: 'openai-token',
}

describe('AzureOpenAIImageAdapter', () => {
  test('generates every returned image through the OpenAI v1 endpoint', async () => {
    const scopes: Array<string | string[]> = []
    const requests: Array<{
      input: RequestInfo | URL
      init?: RequestInit
    }> = []
    const adapter = new AzureOpenAIImageAdapter({
      credential: {
        async getToken(scope) {
          scopes.push(scope)
          return accessToken
        },
      },
      fetch: (async (input, init) => {
        requests.push({init, input})
        return jsonResponse({
          created: 1_787_000_000,
          data: [
            {
              b64_json: Buffer.from('first jpeg').toString('base64'),
              revised_prompt: 'First revised prompt',
            },
            {
              b64_json: `data:image/jpeg;base64,${Buffer.from(
                'second jpeg',
              ).toString('base64')}`,
              revised_prompt: 'Second revised prompt',
            },
          ],
        })
      }) as typeof globalThis.fetch,
    })

    const result = await adapter.generate({
      adapter: 'azure-openai-image',
      controls: {
        background: 'opaque',
        n: 2,
        output_compression: 80,
        output_format: 'jpeg',
        quality: 'high',
        size: '1536x1024',
      },
      deploymentName: 'gpt-image-production',
      modelName: 'gpt-image-2',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media?api-version=2026-01-01',
      prompt: 'A detailed product launch image',
      references: [],
    })

    expect(adapter.kind).toBe('azure-openai-image')
    expect(scopes).toEqual([
      'https://cognitiveservices.azure.com/.default',
    ])
    expect(requests).toHaveLength(1)
    expect(String(requests[0]?.input)).toBe(
      'https://example.services.ai.azure.com/openai/v1/images/generations?api-version=preview',
    )
    expect(requests[0]?.init?.method).toBe('POST')
    expect(new Headers(requests[0]?.init?.headers)).toEqual(
      new Headers({
        authorization: 'Bearer openai-token',
        'content-type': 'application/json',
      }),
    )
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      background: 'opaque',
      model: 'gpt-image-production',
      n: 2,
      output_compression: 80,
      output_format: 'jpeg',
      prompt: 'A detailed product launch image',
      quality: 'high',
      size: '1536x1024',
    })
    expect(result).toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('first jpeg'),
          extension: '.jpg',
          mediaType: 'image/jpeg',
        },
        {
          contents: Buffer.from('second jpeg'),
          extension: '.jpg',
          mediaType: 'image/jpeg',
        },
      ],
    })
  })

  test('translates width and height into a supported GPT Image size', async () => {
    let requestBody: Record<string, unknown> | undefined
    const adapter = new AzureOpenAIImageAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >
        return jsonResponse({
          data: [
            {
              b64_json: Buffer.from('landscape image').toString(
                'base64',
              ),
            },
          ],
        })
      }) as typeof globalThis.fetch,
    })

    await adapter.generate({
      adapter: 'azure-openai-image',
      controls: {
        height: 720,
        width: 1280,
      },
      deploymentName: 'gpt-image-production',
      modelName: 'gpt-image-2',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'A landscape product hero image',
      references: [],
    })

    expect(requestBody).toEqual({
      model: 'gpt-image-production',
      prompt: 'A landscape product hero image',
      size: '1536x1024',
    })
  })

  test('edits one reference image through multipart form data', async () => {
    const referenceBytes = Buffer.from('reference png')
    const referencePath = join('images', 'product.png')
    let requestInput: RequestInfo | URL | undefined
    let requestBody: FormData | undefined
    let requestHeaders: Headers | undefined
    const adapter = new AzureOpenAIImageAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (input, init) => {
        requestInput = input
        requestBody = init?.body as FormData
        requestHeaders = new Headers(init?.headers)
        return jsonResponse({
          created: 1_787_000_000,
          data: [
            {
              b64_json: Buffer.from('edited png').toString('base64'),
            },
          ],
        })
      }) as typeof globalThis.fetch,
      readFile: async () => referenceBytes,
    })

    const result = await adapter.generate({
      adapter: 'azure-openai-image',
      controls: {
        n: 1,
        output_format: 'png',
        quality: 'medium',
        size: '1024x1024',
      },
      deploymentName: 'gpt-image-editor',
      modelName: 'gpt-image-2',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'Put the product on a marble table',
      references: [
        reference(referencePath, 'image/png'),
      ],
    })

    expect(String(requestInput)).toBe(
      'https://example.services.ai.azure.com/openai/v1/images/edits?api-version=preview',
    )
    expect(requestHeaders?.get('authorization')).toBe(
      'Bearer openai-token',
    )
    expect(requestHeaders?.has('content-type')).toBe(false)
    expect(requestBody).toBeInstanceOf(FormData)
    expect(requestBody?.get('model')).toBe('gpt-image-editor')
    expect(requestBody?.get('prompt')).toBe(
      'Put the product on a marble table',
    )
    expect(requestBody?.get('n')).toBe('1')
    expect(requestBody?.get('output_format')).toBe('png')
    expect(requestBody?.get('quality')).toBe('medium')
    expect(requestBody?.get('size')).toBe('1024x1024')
    const image = requestBody?.get('image')
    expect(image).toBeInstanceOf(Blob)
    expect((image as Blob).type).toBe('image/png')
    expect((image as Blob & {name?: string}).name).toBe('product.png')
    await expect((image as Blob).arrayBuffer()).resolves.toEqual(
      referenceBytes.buffer.slice(
        referenceBytes.byteOffset,
        referenceBytes.byteOffset + referenceBytes.byteLength,
      ),
    )
    expect(result).toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('edited png'),
          extension: '.png',
          mediaType: 'image/png',
        },
      ],
    })
  })

  test('defaults base64 outputs to PNG', async () => {
    const adapter = new AzureOpenAIImageAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async () =>
        jsonResponse({
          data: [
            {
              b64_json: Buffer.from('default image').toString(
                'base64',
              ),
            },
          ],
        })) as typeof globalThis.fetch,
    })

    await expect(
      adapter.generate({
        adapter: 'azure-openai-image',
        controls: {},
        deploymentName: 'gpt-image',
        modelName: 'gpt-image-2',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'A red fox',
        references: [],
      }),
    ).resolves.toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('default image'),
          extension: '.png',
          mediaType: 'image/png',
        },
      ],
    })
  })

  test('normalizes WebP base64 outputs', async () => {
    const adapter = new AzureOpenAIImageAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async () =>
        jsonResponse({
          data: [
            {
              b64_json: Buffer.from('webp image').toString('base64'),
            },
          ],
        })) as typeof globalThis.fetch,
    })

    await expect(
      adapter.generate({
        adapter: 'azure-openai-image',
        controls: {
          output_format: 'webp',
        },
        deploymentName: 'gpt-image',
        modelName: 'gpt-image-2',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'A red fox',
        references: [],
      }),
    ).resolves.toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('webp image'),
          extension: '.webp',
          mediaType: 'image/webp',
        },
      ],
    })
  })

  test('rejects multiple edit references before authentication or fetch', async () => {
    let fetchCalls = 0
    let tokenCalls = 0
    const adapter = new AzureOpenAIImageAdapter({
      credential: {
        async getToken() {
          tokenCalls += 1
          return accessToken
        },
      },
      fetch: (async () => {
        fetchCalls += 1
        return jsonResponse({})
      }) as typeof globalThis.fetch,
    })

    await expect(
      adapter.generate({
        adapter: 'azure-openai-image',
        controls: {},
        deploymentName: 'gpt-image',
        modelName: 'gpt-image-2',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'Edit both images',
        references: [
          reference('C:\\images\\one.png'),
          reference('C:\\images\\two.png'),
        ],
      }),
    ).rejects.toThrow(
      'GPT Image editing accepts exactly one reference image',
    )
    expect(tokenCalls).toBe(0)
    expect(fetchCalls).toBe(0)
  })

  test('allows token retrieval and fetch to be injected', async () => {
    const tokenRequests: Array<{
      credential: TokenCredential
      scope: string
    }> = []
    const credential: TokenCredential = {
      async getToken() {
        throw new Error('the injected token retriever must be used')
      },
    }
    const adapter = new AzureOpenAIImageAdapter({
      credential,
      fetch: (async () =>
        jsonResponse({
          data: [
            {
              b64_json: Buffer.from('image').toString('base64'),
            },
          ],
        })) as typeof globalThis.fetch,
      getToken: async (suppliedCredential, scope) => {
        tokenRequests.push({
          credential: suppliedCredential,
          scope,
        })
        return accessToken
      },
    })

    await adapter.generate({
      adapter: 'azure-openai-image',
      controls: {},
      deploymentName: 'gpt-image',
      modelName: 'gpt-image-2',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'A red fox',
      references: [],
    })

    expect(tokenRequests).toEqual([
      {
        credential,
        scope: 'https://cognitiveservices.azure.com/.default',
      },
    ])
  })
})

function credentialReturning(
  token: typeof accessToken,
): TokenCredential {
  return {
    async getToken() {
      return token
    },
  }
}

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

function reference(
  path: string,
  mediaType = 'image/png',
): ReferenceFingerprint {
  return {
    mediaType,
    modifiedAt: '2026-08-18T00:00:00.000Z',
    path,
    sha256: 'sha256',
    size: 15,
  }
}
