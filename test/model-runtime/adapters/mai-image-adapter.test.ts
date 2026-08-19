import type {TokenCredential} from '@azure/core-auth'
import {describe, expect, test} from 'vitest'

import {MAIImageAdapter} from '../../../src/model-runtime/adapters/mai-image-adapter.js'
import type {ReferenceFingerprint} from '../../../src/generation/generation-store.js'

const accessToken = {
  expiresOnTimestamp: Date.now() + 60_000,
  token: 'test-token',
}

describe('MAIImageAdapter', () => {
  test('generates a PNG through the MAI generations endpoint', async () => {
    const scopes: Array<string | string[]> = []
    const requests: Array<{
      input: RequestInfo | URL
      init?: RequestInit
    }> = []
    const credential: TokenCredential = {
      async getToken(scope) {
        scopes.push(scope)
        return accessToken
      },
    }
    const fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requests.push({init, input})
      return jsonResponse({
        created: 1_787_000_000,
        data: [
          {
            b64_json: Buffer.from('generated png').toString('base64'),
          },
        ],
      })
    }) as typeof globalThis.fetch
    const adapter = new MAIImageAdapter({
      credential,
      fetch,
      readFile: async () => {
        throw new Error('text generation must not read a reference')
      },
    })

    const result = await adapter.generate({
      adapter: 'mai-image',
      controls: {
        height: 768,
        width: 1024,
      },
      deploymentName: 'mai-fast',
      modelName: 'MAI-Image-2.5-Flash',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'A studio product photograph',
      references: [],
    })

    expect(adapter.kind).toBe('mai-image')
    expect(scopes).toEqual([
      'https://cognitiveservices.azure.com/.default',
    ])
    expect(requests).toHaveLength(1)
    expect(String(requests[0]?.input)).toBe(
      'https://example.services.ai.azure.com/mai/v1/images/generations',
    )
    expect(requests[0]?.init?.method).toBe('POST')
    expect(new Headers(requests[0]?.init?.headers)).toEqual(
      new Headers({
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      }),
    )
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      height: 768,
      model: 'mai-fast',
      prompt: 'A studio product photograph',
      width: 1024,
    })
    expect(result).toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('generated png'),
          extension: '.png',
          mediaType: 'image/png',
        },
      ],
    })
  })

  test('uses 1024 pixel defaults for MAI text generation', async () => {
    let requestBody: unknown
    const adapter = new MAIImageAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return jsonResponse({
          data: [
            {
              b64_json: Buffer.from('image').toString('base64'),
            },
          ],
        })
      }) as typeof globalThis.fetch,
    })

    await adapter.generate({
      adapter: 'mai-image',
      controls: {},
      deploymentName: 'mai',
      modelName: 'MAI-Image-2.5',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'A red fox',
      references: [],
    })

    expect(requestBody).toEqual({
      height: 1024,
      model: 'mai',
      prompt: 'A red fox',
      width: 1024,
    })
  })

  test('edits one JPEG reference through multipart form data', async () => {
    const referenceBytes = Buffer.from('reference jpeg')
    const readPaths: string[] = []
    let requestBody: FormData | undefined
    let requestHeaders: Headers | undefined
    const adapter = new MAIImageAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (_input, init) => {
        requestBody = init?.body as FormData
        requestHeaders = new Headers(init?.headers)
        return jsonResponse({
          data: [
            {
              b64_json: Buffer.from('edited png').toString('base64'),
            },
          ],
        })
      }) as typeof globalThis.fetch,
      readFile: async (path) => {
        readPaths.push(path)
        return referenceBytes
      },
    })

    const result = await adapter.generate({
      adapter: 'mai-image',
      controls: {
        height: 900,
        width: 900,
      },
      deploymentName: 'mai-editor',
      modelName: 'MAI-Image-2.5',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media/',
      prompt: 'Replace the background with a forest',
      references: [
        reference('C:\\images\\product.jpg', 'image/jpeg'),
      ],
    })

    expect(readPaths).toEqual(['C:\\images\\product.jpg'])
    expect(requestHeaders?.get('authorization')).toBe(
      'Bearer test-token',
    )
    expect(requestHeaders?.has('content-type')).toBe(false)
    expect(requestBody).toBeInstanceOf(FormData)
    expect(requestBody?.get('model')).toBe('mai-editor')
    expect(requestBody?.get('prompt')).toBe(
      'Replace the background with a forest',
    )
    expect(requestBody?.has('width')).toBe(false)
    expect(requestBody?.has('height')).toBe(false)
    const image = requestBody?.get('image')
    expect(image).toBeInstanceOf(Blob)
    expect((image as Blob).type).toBe('image/jpeg')
    expect((image as Blob & {name?: string}).name).toBe('product.jpg')
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

  test.each([
    {
      modelName: 'MAI-Image-2e',
      references: [reference('C:\\images\\one.png')],
      message: 'MAI-Image-2e does not support image editing',
    },
    {
      modelName: 'MAI-Image-2.5',
      references: [
        reference('C:\\images\\one.png'),
        reference('C:\\images\\two.png'),
      ],
      message: 'MAI image editing accepts exactly one reference image',
    },
  ])(
    'rejects unsupported references before provider submission',
    async ({message, modelName, references}) => {
      let fetchCalls = 0
      let tokenCalls = 0
      const adapter = new MAIImageAdapter({
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
          adapter: 'mai-image',
          controls: {},
          deploymentName: 'mai',
          modelName,
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          prompt: 'Edit this image',
          references,
        }),
      ).rejects.toThrow(message)
      expect(tokenCalls).toBe(0)
      expect(fetchCalls).toBe(0)
    },
  )

  test('surfaces provider error details', async () => {
    const adapter = new MAIImageAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async () =>
        jsonResponse(
          {
            error: {
              code: 'content_filter',
              message: 'The image request was blocked',
            },
          },
          400,
        )) as typeof globalThis.fetch,
    })

    await expect(
      adapter.generate({
        adapter: 'mai-image',
        controls: {},
        deploymentName: 'mai',
        modelName: 'MAI-Image-2.5',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'A blocked prompt',
        references: [],
      }),
    ).rejects.toThrow(
      'MAI Image request failed (400): The image request was blocked',
    )
  })

  test('fails before fetch when the credential returns no token', async () => {
    let fetchCalls = 0
    const adapter = new MAIImageAdapter({
      credential: credentialReturning(null),
      fetch: (async () => {
        fetchCalls += 1
        return jsonResponse({})
      }) as typeof globalThis.fetch,
    })

    await expect(
      adapter.generate({
        adapter: 'mai-image',
        controls: {},
        deploymentName: 'mai',
        modelName: 'MAI-Image-2.5',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'A red fox',
        references: [],
      }),
    ).rejects.toThrow(
      'Unable to acquire a Microsoft Foundry image access token',
    )
    expect(fetchCalls).toBe(0)
  })

  test('allows token retrieval to be injected separately', async () => {
    const tokenRequests: Array<{
      credential: TokenCredential
      scope: string
    }> = []
    const credential: TokenCredential = {
      async getToken() {
        throw new Error('the injected token retriever must be used')
      },
    }
    const adapter = new MAIImageAdapter({
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
      adapter: 'mai-image',
      controls: {},
      deploymentName: 'mai',
      modelName: 'MAI-Image-2.5',
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
  token: null | typeof accessToken,
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
