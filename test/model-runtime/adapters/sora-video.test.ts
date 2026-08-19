import {describe, expect, test} from 'vitest'

import type {ProviderGenerationRequest} from '../../../src/model-runtime/model-runtime.js'
import {
  createSoraVideoAdapter,
  SoraVideoJobAdapter,
} from '../../../src/model-runtime/adapters/sora-video.js'

interface ObservedFetchCall {
  init: RequestInit
  url: string
}

describe('SoraVideoAdapter', () => {
  test('uses the native Sora 2 v1 API for text-to-video generation', async () => {
    const observedCalls: ObservedFetchCall[] = []
    const observedScopes: string[] = []
    const observedSleeps: number[] = []
    const adapter = new SoraVideoJobAdapter({
      fetch: async (input, init = {}) => {
        const url = String(input)
        observedCalls.push({
          init,
          url,
        })
        if (
          init.method === 'POST' &&
          url ===
            'https://example.openai.azure.com/openai/v1/videos'
        ) {
          return jsonResponse({id: 'video-1', status: 'queued'})
        }
        if (
          url ===
          'https://example.openai.azure.com/openai/v1/videos/video-1'
        ) {
          return jsonResponse({
            id: 'video-1',
            status: 'completed',
          })
        }
        if (
          url ===
          'https://example.openai.azure.com/openai/v1/videos/video-1/content'
        ) {
          return new Response(Buffer.from('mp4 bytes'), {
            headers: {'content-type': 'video/mp4'},
          })
        }

        return jsonResponse({detail: 'Not Found'}, 404)
      },
      getAccessToken: async (scope) => {
        observedScopes.push(scope)
        return 'test-token'
      },
      maxPollAttempts: 3,
      pollIntervalMs: 25,
      sleep: async (milliseconds) => {
        observedSleeps.push(milliseconds)
      },
    })

    const result = await adapter.generate(
      request({
        controls: {
          height: 720,
          nSeconds: 8,
          width: 1280,
        },
      }),
    )

    expect(adapter.kind).toBe('sora-video')
    expect(observedScopes).toEqual(['https://ai.azure.com/.default'])
    expect(observedSleeps).toEqual([25])
    expect(observedCalls.map((call) => call.url)).toEqual([
      'https://example.openai.azure.com/openai/v1/videos',
      'https://example.openai.azure.com/openai/v1/videos/video-1',
      'https://example.openai.azure.com/openai/v1/videos/video-1/content',
    ])
    expect(
      new Headers(observedCalls[0]?.init.headers).get('authorization'),
    ).toBe('Bearer test-token')
    expect(
      new Headers(observedCalls[0]?.init.headers).get('content-type'),
    ).toBe('application/json')
    expect(JSON.parse(String(observedCalls[0]?.init.body))).toEqual({
      model: 'sora-deployment',
      prompt: 'A paper airplane gliding over a city',
      seconds: '8',
      size: '1280x720',
    })
    expect(result).toEqual({
      jobId: 'video-1',
      outputs: [
        {
          contents: Buffer.from('mp4 bytes'),
          extension: '.mp4',
          mediaType: 'video/mp4',
        },
      ],
    })
  })

  test('falls back to the legacy preview API when native v1 is unavailable', async () => {
    const observedUrls: string[] = []
    const adapter = createSoraVideoAdapter({
      fetch: async (input) => {
        const url = String(input)
        observedUrls.push(url)
        if (
          url ===
          'https://example.openai.azure.com/openai/v1/videos'
        ) {
          return jsonResponse({detail: 'Not Found'}, 404)
        }
        if (
          url ===
          'https://example.openai.azure.com/openai/v1/video/generations/jobs?api-version=preview'
        ) {
          return jsonResponse({
            generations: [{id: 'generation-1'}],
            id: 'job-1',
            status: 'succeeded',
          })
        }
        if (
          url ===
          'https://example.openai.azure.com/openai/v1/video/generations/generation-1/content/video?api-version=preview'
        ) {
          return new Response(Buffer.from('mp4 bytes'))
        }
        throw new Error(`Unexpected fetch: ${url}`)
      },
      getAccessToken: async () => 'test-token',
      maxPollAttempts: 1,
      pollIntervalMs: 1,
      sleep: async () => {},
    })

    await expect(
      adapter.generate(
        request({
          controls: {
            height: 720,
            nSeconds: 8,
            width: 1280,
          },
        }),
      ),
    ).resolves.toMatchObject({
      jobId: 'job-1',
      outputs: [{mediaType: 'video/mp4'}],
    })
    expect(observedUrls).toEqual([
      'https://example.openai.azure.com/openai/v1/videos',
      'https://example.openai.azure.com/openai/v1/video/generations/jobs?api-version=preview',
      'https://example.openai.azure.com/openai/v1/video/generations/generation-1/content/video?api-version=preview',
    ])
  })

  test.each([
    {
      fileName: 'starting-frame.png',
      mediaType: 'image/png',
      referenceType: 'image',
    },
    {
      fileName: 'source-video.mp4',
      mediaType: 'video/mp4',
      referenceType: 'video',
    },
  ])(
    'submits one $referenceType reference as multipart form data',
    async ({fileName, mediaType, referenceType}) => {
      const observedCalls: ObservedFetchCall[] = []
      const observedPaths: string[] = []
      const responses = [
        jsonResponse({
          generations: [{id: 'generation-1'}],
          id: 'job-1',
          status: 'succeeded',
        }),
        new Response(Buffer.from('mp4 bytes')),
      ]
      const referencePath = `C:\\references\\${fileName}`
      const adapter = createSoraVideoAdapter({
        fetch: async (input, init = {}) => {
          observedCalls.push({init, url: String(input)})
          const response = responses.shift()
          if (response === undefined) {
            throw new Error('Unexpected fetch')
          }

          return response
        },
        getAccessToken: async () => 'test-token',
        maxPollAttempts: 1,
        pollIntervalMs: 1,
        readFile: async (path) => {
          observedPaths.push(path)
          return Buffer.from('reference bytes')
        },
        sleep: async () => {
          throw new Error('Unexpected sleep')
        },
      })

      await adapter.generate(
        request({
          controls: {
            height: 720,
            nSeconds: 8,
            width: 1280,
          },
          references: [
            {
              mediaType,
              modifiedAt: '2026-08-18T12:00:00.000Z',
              path: referencePath,
              sha256: 'reference-sha',
              size: 15,
            },
          ],
        }),
      )

      expect(observedPaths).toEqual([referencePath])
      expect(
        new Headers(observedCalls[0]?.init.headers).get('content-type'),
      ).toBeNull()
      const body = observedCalls[0]?.init.body
      expect(body).toBeInstanceOf(FormData)
      const form = body as FormData
      expect(Object.fromEntries(form.entries())).toMatchObject({
        height: '720',
        inpaint_items: JSON.stringify([
          {
            crop_bounds: {
              bottom_fraction: 1,
              left_fraction: 0,
              right_fraction: 1,
              top_fraction: 0,
            },
            file_name: fileName,
            frame_index: 0,
            type: referenceType,
          },
        ]),
        model: 'sora-deployment',
        n_seconds: '8',
        n_variants: '1',
        prompt: 'A paper airplane gliding over a city',
        width: '1280',
      })
      const file = form.get('files')
      expect(file).toBeInstanceOf(Blob)
      expect((file as File).name).toBe(fileName)
      expect((file as Blob).type).toBe(mediaType)
      expect(
        Buffer.from(await (file as Blob).arrayBuffer()),
      ).toEqual(Buffer.from('reference bytes'))
    },
  )

  test.each([
    {
      failureReason: 'The prompt was rejected by policy',
      status: 'failed',
    },
    {
      failureReason: 'The job was cancelled by the service',
      status: 'cancelled',
    },
  ])(
    'surfaces a terminal $status job with its failure reason',
    async ({failureReason, status}) => {
      const responses = [
        jsonResponse({id: 'job-1', status: 'queued'}),
        jsonResponse({
          failure_reason: failureReason,
          id: 'job-1',
          status,
        }),
      ]
      const adapter = createSoraVideoAdapter({
        fetch: async () => {
          const response = responses.shift()
          if (response === undefined) {
            throw new Error('Unexpected fetch')
          }

          return response
        },
        getAccessToken: async () => 'test-token',
        maxPollAttempts: 1,
        pollIntervalMs: 1,
        sleep: async () => {},
      })

      await expect(
        adapter.generate(
          request({
            controls: {
              height: 720,
              width: 1280,
            },
          }),
        ),
      ).rejects.toThrow(
        `Sora video job "job-1" ended with status "${status}": ${failureReason}`,
      )
    },
  )

  test('stops polling after the configured attempt limit', async () => {
    const responses = [
      jsonResponse({id: 'job-1', status: 'queued'}),
      jsonResponse({id: 'job-1', status: 'preprocessing'}),
      jsonResponse({id: 'job-1', status: 'running'}),
    ]
    let fetchCalls = 0
    const observedSleeps: number[] = []
    const adapter = createSoraVideoAdapter({
      fetch: async () => {
        fetchCalls += 1
        const response = responses.shift()
        if (response === undefined) {
          throw new Error('Unexpected fetch')
        }

        return response
      },
      getAccessToken: async () => 'test-token',
      maxPollAttempts: 2,
      pollIntervalMs: 7,
      sleep: async (milliseconds) => {
        observedSleeps.push(milliseconds)
      },
    })

    await expect(
      adapter.generate(
        request({
          controls: {
            height: 720,
            width: 1280,
          },
        }),
      ),
    ).rejects.toThrow(
      'Sora video job "job-1" did not complete after 2 polling attempts',
    )
    expect(fetchCalls).toBe(3)
    expect(observedSleeps).toEqual([7, 7])
  })

  test('surfaces the provider message when submission fails', async () => {
    const adapter = createSoraVideoAdapter({
      fetch: async () =>
        jsonResponse(
          {
            code: 'content_filter',
            message: 'The prompt was blocked',
          },
          400,
        ),
      getAccessToken: async () => 'test-token',
      maxPollAttempts: 1,
      pollIntervalMs: 1,
      sleep: async () => {},
    })

    await expect(
      adapter.generate(
        request({
          controls: {
            height: 720,
            width: 1280,
          },
        }),
      ),
    ).rejects.toThrow(
      'Sora video request failed with HTTP 400: The prompt was blocked',
    )
  })

  test('rejects more than one reference before authentication or submission', async () => {
    let fetchCalls = 0
    let tokenCalls = 0
    const reference = {
      mediaType: 'image/png',
      modifiedAt: '2026-08-18T12:00:00.000Z',
      path: 'C:\\references\\starting-frame.png',
      sha256: 'reference-sha',
      size: 15,
    }
    const adapter = createSoraVideoAdapter({
      fetch: async () => {
        fetchCalls += 1
        throw new Error('Unexpected fetch')
      },
      getAccessToken: async () => {
        tokenCalls += 1
        return 'test-token'
      },
      maxPollAttempts: 1,
      pollIntervalMs: 1,
      readFile: async () => {
        throw new Error('Unexpected file read')
      },
      sleep: async () => {},
    })

    await expect(
      adapter.generate(
        request({
          controls: {
            height: 720,
            width: 1280,
          },
          references: [reference, reference],
        }),
      ),
    ).rejects.toThrow(
      'Sora video generation accepts at most one reference',
    )
    expect(tokenCalls).toBe(0)
    expect(fetchCalls).toBe(0)
  })

  test('downloads every generated video variant', async () => {
    const observedUrls: string[] = []
    const responses = [
      jsonResponse({
        generations: [
          {id: 'generation-1'},
          {id: 'generation-2'},
        ],
        id: 'job-1',
        status: 'succeeded',
      }),
      new Response(Buffer.from('first mp4')),
      new Response(Buffer.from('second mp4')),
    ]
    const adapter = createSoraVideoAdapter({
      fetch: async (input) => {
        observedUrls.push(String(input))
        const response = responses.shift()
        if (response === undefined) {
          throw new Error('Unexpected fetch')
        }

        return response
      },
      getAccessToken: async () => 'test-token',
      maxPollAttempts: 1,
      pollIntervalMs: 1,
      sleep: async () => {},
    })

    const result = await adapter.generate(
      request({
        controls: {
          height: 720,
          nVariants: 2,
          width: 1280,
        },
      }),
    )

    expect(observedUrls.slice(1)).toEqual([
      'https://example.openai.azure.com/openai/v1/video/generations/generation-1/content/video?api-version=preview',
      'https://example.openai.azure.com/openai/v1/video/generations/generation-2/content/video?api-version=preview',
    ])
    expect(result.outputs).toEqual([
      {
        contents: Buffer.from('first mp4'),
        extension: '.mp4',
        mediaType: 'video/mp4',
      },
      {
        contents: Buffer.from('second mp4'),
        extension: '.mp4',
        mediaType: 'video/mp4',
      },
    ])
  })
})

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: {'content-type': 'application/json'},
    status,
  })
}

function request(
  overrides: Partial<ProviderGenerationRequest> = {},
): ProviderGenerationRequest {
  return {
    adapter: 'sora-video',
    controls: {},
    deploymentName: 'sora-deployment',
    modelName: 'sora-2',
    projectEndpoint:
      'https://example.services.ai.azure.com/api/projects/media',
    prompt: 'A paper airplane gliding over a city',
    references: [],
    ...overrides,
  }
}
