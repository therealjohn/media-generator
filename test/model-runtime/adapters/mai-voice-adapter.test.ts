import {describe, expect, test, vi} from 'vitest'

import {MAIVoiceAdapter} from '../../../src/model-runtime/adapters/mai-voice-adapter.js'

describe('MAIVoiceAdapter', () => {
  test('synthesizes expressive SSML to MP3 with a private Speech key', async () => {
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(Buffer.from('mp3 bytes'), {
          headers: {'Content-Type': 'audio/mpeg'},
          status: 200,
        }),
    )
    const adapter = new MAIVoiceAdapter({
      fetch: fetchImplementation,
    })

    const result = await adapter.generate({
      adapter: 'mai-voice',
      controls: {
        locale: 'en-US',
        style: 'hopeful',
        styleDegree: 1.2,
        voice: 'en-US-Harper:MAI-Voice-2',
      },
      deploymentName: 'mai-voice-2',
      endpoint: 'https://eastus.tts.speech.microsoft.com/',
      apiKey: 'speech-key',
      modelName: 'MAI-Voice-2',
      projectEndpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      prompt: 'Welcome to <Media Gen> & the product.',
      references: [],
    })

    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, init] = fetchImplementation.mock.calls[0]!
    expect(String(url)).toBe(
      'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1',
    )
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/ssml+xml',
      'Ocp-Apim-Subscription-Key': 'speech-key',
      'X-Microsoft-OutputFormat':
        'audio-24khz-160kbitrate-mono-mp3',
    })
    expect(String(init?.body)).toContain(
      'name="en-US-Harper:MAI-Voice-2"',
    )
    expect(String(init?.body)).toContain(
      'style="hopeful" styledegree="1.2"',
    )
    expect(String(init?.body)).toContain(
      'Welcome to &lt;Media Gen&gt; &amp; the product.',
    )
    expect(result).toEqual({
      jobId: null,
      outputs: [
        {
          contents: Buffer.from('mp3 bytes'),
          extension: '.mp3',
          mediaType: 'audio/mpeg',
        },
      ],
    })
  })

  test('rejects Reference Assets and surfaces provider failures', async () => {
    const adapter = new MAIVoiceAdapter({
      fetch: async () =>
        new Response('Invalid voice', {status: 400}),
    })

    await expect(
      adapter.generate({
        adapter: 'mai-voice',
        controls: {voice: 'en-US-Harper:MAI-Voice-2'},
        deploymentName: 'mai-voice-2',
        endpoint: 'https://eastus.tts.speech.microsoft.com/',
        apiKey: 'speech-key',
        modelName: 'MAI-Voice-2',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'Narration',
        references: [
          {
            mediaType: 'audio/mpeg',
            modifiedAt: '2026-08-18T12:00:00.000Z',
            path: 'C:\\voice.mp3',
            sha256: 'sha',
            size: 10,
          },
        ],
      }),
    ).rejects.toThrow('MAI Voice does not accept Reference Assets')

    await expect(
      adapter.generate({
        adapter: 'mai-voice',
        controls: {voice: 'en-US-Harper:MAI-Voice-2'},
        deploymentName: 'mai-voice-2',
        endpoint: 'https://eastus.tts.speech.microsoft.com/',
        apiKey: 'speech-key',
        modelName: 'MAI-Voice-2',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        prompt: 'Narration',
        references: [],
      }),
    ).rejects.toThrow('MAI Voice request failed with HTTP 400')
  })
})
