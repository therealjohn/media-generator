import type {TokenCredential} from '@azure/core-auth'
import {describe, expect, test} from 'vitest'

import {BFLFluxAdapter} from '../../../src/model-runtime/adapters/bfl-flux-adapter.js'
import type {ReferenceFingerprint} from '../../../src/generation/generation-store.js'

const accessToken = {
  expiresOnTimestamp: Date.now() + 60_000,
  token: 'flux-token',
}

describe('BFLFluxAdapter', () => {
  test.each([
    ['FLUX.1-Kontext-pro', 'flux-kontext-pro'],
    ['FLUX-1.1-pro', 'flux-pro-1.1'],
    ['FLUX.2-pro', 'flux-2-pro'],
    ['FLUX.2-flex', 'flux-2-flex'],
  ])(
    'maps %s to its native BFL provider path',
    async (modelName, modelPath) => {
      const scopes: Array<string | string[]> = []
      let requestInput: RequestInfo | URL | undefined
      let requestInit: RequestInit | undefined
      const adapter = new BFLFluxAdapter({
        credential: {
          async getToken(scope) {
            scopes.push(scope)
            return accessToken
          },
        },
        fetch: (async (input, init) => {
          requestInput = input
          requestInit = init
          return jsonResponse({
            data: [
              {
                b64_json: Buffer.from('flux jpeg').toString(
                  'base64',
                ),
              },
            ],
          })
        }) as typeof globalThis.fetch,
      })

      const result = await adapter.generate({
        adapter: 'bfl-flux',
        controls: {
          height: 1024,
          n: 1,
          output_format: 'jpeg',
          seed: 42,
          width: 1024,
        },
        deploymentName: 'flux-production',
        modelName,
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'A cinematic photograph of a red fox',
        references: [],
      })

      expect(adapter.kind).toBe('bfl-flux')
      expect(scopes).toEqual([
        'https://cognitiveservices.azure.com/.default',
      ])
      expect(String(requestInput)).toBe(
        `https://example.api.cognitive.microsoft.com/providers/blackforestlabs/v1/${modelPath}?api-version=preview`,
      )
      expect(requestInit?.method).toBe('POST')
      expect(new Headers(requestInit?.headers)).toEqual(
        new Headers({
          authorization: 'Bearer flux-token',
          'content-type': 'application/json',
        }),
      )
      expect(JSON.parse(String(requestInit?.body))).toEqual({
        height: 1024,
        model: 'flux-production',
        n: 1,
        output_format: 'jpeg',
        prompt: 'A cinematic photograph of a red fox',
        seed: 42,
        width: 1024,
      })
      expect(result).toEqual({
        jobId: null,
        outputs: [
          {
            contents: Buffer.from('flux jpeg'),
            extension: '.jpg',
            mediaType: 'image/jpeg',
          },
        ],
      })
    },
  )

  test('encodes one Kontext reference as input_image', async () => {
    const readPaths: string[] = []
    let requestBody: Record<string, unknown> | undefined
    const adapter = new BFLFluxAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (_input, init) => {
        requestBody = JSON.parse(
          String(init?.body),
        ) as Record<string, unknown>
        return jsonResponse({
          data: [
            {
              b64_json: Buffer.from('edited image').toString(
                'base64',
              ),
            },
          ],
        })
      }) as typeof globalThis.fetch,
      readFile: async (path) => {
        readPaths.push(path)
        return Buffer.from('kontext reference')
      },
    })

    await adapter.generate({
      adapter: 'bfl-flux',
      controls: {
        aspect_ratio: '1:1',
        output_format: 'png',
      },
      deploymentName: 'flux-kontext',
      modelName: 'FLUX.1-Kontext-pro',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'Change the background to a mountain lake',
      references: [reference('C:\\images\\product.png')],
    })

    expect(readPaths).toEqual(['C:\\images\\product.png'])
    expect(requestBody).toEqual({
      aspect_ratio: '1:1',
      input_image: Buffer.from('kontext reference').toString(
        'base64',
      ),
      model: 'flux-kontext',
      output_format: 'png',
      prompt: 'Change the background to a mountain lake',
    })
  })

  test('numbers multiple FLUX.2 reference images in request order', async () => {
    const bytesByPath = new Map([
      ['C:\\images\\one.png', Buffer.from('one')],
      ['C:\\images\\two.jpg', Buffer.from('two')],
      ['C:\\images\\three.webp', Buffer.from('three')],
    ])
    let requestBody: Record<string, unknown> | undefined
    const adapter = new BFLFluxAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (_input, init) => {
        requestBody = JSON.parse(
          String(init?.body),
        ) as Record<string, unknown>
        return jsonResponse({
          data: [
            {
              b64_json: Buffer.from('combined').toString('base64'),
            },
          ],
        })
      }) as typeof globalThis.fetch,
      readFile: async (path) => {
        const contents = bytesByPath.get(path)
        if (contents === undefined) {
          throw new Error(`Unexpected path: ${path}`)
        }
        return contents
      },
    })

    await adapter.generate({
      adapter: 'bfl-flux',
      controls: {
        output_format: 'jpeg',
      },
      deploymentName: 'flux-two',
      modelName: 'FLUX.2-pro',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'Combine these products into one campaign image',
      references: [
        reference('C:\\images\\one.png'),
        reference('C:\\images\\two.jpg', 'image/jpeg'),
        reference('C:\\images\\three.webp', 'image/webp'),
      ],
    })

    expect(requestBody).toEqual({
      input_image: Buffer.from('one').toString('base64'),
      input_image_2: Buffer.from('two').toString('base64'),
      input_image_3: Buffer.from('three').toString('base64'),
      model: 'flux-two',
      output_format: 'jpeg',
      prompt: 'Combine these products into one campaign image',
    })
  })

  test.each([
    ['FLUX-1.1-pro', 1, 0],
    ['FLUX.1-Kontext-pro', 2, 1],
    ['FLUX.2-pro', 9, 8],
    ['FLUX.2-flex', 11, 10],
  ])(
    'rejects %s reference counts above the model limit',
    async (modelName, referenceCount, limit) => {
      let fetchCalls = 0
      let readCalls = 0
      let tokenCalls = 0
      const adapter = new BFLFluxAdapter({
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
        readFile: async () => {
          readCalls += 1
          return Buffer.from('reference')
        },
      })

      await expect(
        adapter.generate({
          adapter: 'bfl-flux',
          controls: {},
          deploymentName: 'flux',
          modelName,
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          prompt: 'Edit these images',
          references: Array.from(
            {length: referenceCount},
            (_, index) =>
              reference(`C:\\images\\reference-${index}.png`),
          ),
        }),
      ).rejects.toThrow(
        `${modelName} accepts at most ${limit} reference images`,
      )
      expect(tokenCalls).toBe(0)
      expect(readCalls).toBe(0)
      expect(fetchCalls).toBe(0)
    },
  )

  test('downloads URL outputs before returning', async () => {
    const signedUrl =
      'https://storage.example.com/results/generated.png?sig=secret'
    const requests: Array<{
      input: RequestInfo | URL
      init?: RequestInit
    }> = []
    const adapter = new BFLFluxAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (input, init) => {
        requests.push({init, input})
        if (String(input) === signedUrl) {
          return new Response(
            new Uint8Array(Buffer.from('downloaded png')),
            {
              headers: {
                'content-type': 'image/png',
              },
            },
          )
        }

        return jsonResponse({
          data: [
            {
              url: signedUrl,
            },
          ],
        })
      }) as typeof globalThis.fetch,
    })

    const result = await adapter.generate({
      adapter: 'bfl-flux',
      controls: {
        output_format: 'jpeg',
      },
      deploymentName: 'flux',
      modelName: 'FLUX.2-pro',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'A red fox',
      references: [],
    })

    expect(requests).toHaveLength(2)
    expect(String(requests[1]?.input)).toBe(signedUrl)
    expect(requests[1]?.init).toBeUndefined()
    expect(result).toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('downloaded png'),
          extension: '.png',
          mediaType: 'image/png',
        },
      ],
    })
  })

  test('downloads a native BFL result.sample URL', async () => {
    const signedUrl =
      'https://storage.example.com/results/generated.jpg?sig=secret'
    const adapter = new BFLFluxAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (input) => {
        if (String(input) === signedUrl) {
          return new Response(
            new Uint8Array(Buffer.from('downloaded jpeg')),
          )
        }

        return jsonResponse({
          id: 'request-id',
          result: {
            sample: signedUrl,
          },
          status: 'Ready',
        })
      }) as typeof globalThis.fetch,
    })

    await expect(
      adapter.generate({
        adapter: 'bfl-flux',
        controls: {},
        deploymentName: 'flux',
        modelName: 'FLUX.2-flex',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'A red fox',
        references: [],
      }),
    ).resolves.toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('downloaded jpeg'),
          extension: '.jpg',
          mediaType: 'image/jpeg',
        },
      ],
    })
  })

  test('surfaces signed URL download failures', async () => {
    const signedUrl =
      'https://storage.example.com/results/generated.png?sig=expired'
    const adapter = new BFLFluxAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async (input) => {
        if (String(input) === signedUrl) {
          return new Response('The signed URL expired', {
            status: 403,
          })
        }

        return jsonResponse({
          data: [
            {
              url: signedUrl,
            },
          ],
        })
      }) as typeof globalThis.fetch,
    })

    await expect(
      adapter.generate({
        adapter: 'bfl-flux',
        controls: {},
        deploymentName: 'flux',
        modelName: 'FLUX.2-pro',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'A red fox',
        references: [],
      }),
    ).rejects.toThrow(
      'BFL FLUX image download failed (403): The signed URL expired',
    )
  })

  test('normalizes base64_data image responses and data URL media types', async () => {
    const adapter = new BFLFluxAdapter({
      credential: credentialReturning(accessToken),
      fetch: (async () =>
        jsonResponse({
          images: [
            {
              base64_data: `data:image/png;base64,${Buffer.from(
                'base64 png',
              ).toString('base64')}`,
              metadata: {
                seed: 42,
              },
            },
          ],
        })) as typeof globalThis.fetch,
    })

    await expect(
      adapter.generate({
        adapter: 'bfl-flux',
        controls: {
          output_format: 'jpeg',
        },
        deploymentName: 'flux',
        modelName: 'FLUX.2-pro',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'A red fox',
        references: [],
      }),
    ).resolves.toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('base64 png'),
          extension: '.png',
          mediaType: 'image/png',
        },
      ],
    })
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
    const adapter = new BFLFluxAdapter({
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
      adapter: 'bfl-flux',
      controls: {},
      deploymentName: 'flux',
      modelName: 'FLUX.2-pro',
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
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
