import type {
  ModelAdapter,
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from '../model-runtime.js'

const outputFormat = 'audio-24khz-160kbitrate-mono-mp3'

export interface MAIVoiceAdapterDependencies {
  fetch: typeof globalThis.fetch
}

export class MAIVoiceAdapter implements ModelAdapter {
  readonly kind = 'mai-voice' as const

  readonly #fetch: typeof globalThis.fetch

  constructor(dependencies: MAIVoiceAdapterDependencies) {
    this.#fetch = dependencies.fetch
  }

  async generate(
    request: ProviderGenerationRequest,
  ): Promise<ProviderGenerationResult> {
    if (request.references.length > 0) {
      throw new Error('MAI Voice does not accept Reference Assets')
    }
    if (request.endpoint === undefined) {
      throw new Error('MAI Voice is missing its Speech resource endpoint')
    }
    if (request.apiKey === undefined) {
      throw new Error('MAI Voice is missing its Speech API key')
    }
    const response = await this.#fetch(
      `${request.endpoint.replace(/\/+$/, '')}/cognitiveservices/v1`,
      {
        body: createSsml(request),
        headers: {
          'Content-Type': 'application/ssml+xml',
          'Ocp-Apim-Subscription-Key': request.apiKey,
          'User-Agent': 'MediaGen/0.1 MAI-Voice-2',
          'X-Microsoft-OutputFormat': outputFormat,
        },
        method: 'POST',
      },
    )
    if (!response.ok) {
      const detail = (await response.text()).trim()
      throw new Error(
        `MAI Voice request failed with HTTP ${response.status}${detail.length === 0 ? '' : `: ${detail}`}`,
      )
    }

    return {
      jobId: null,
      outputs: [
        {
          contents: Buffer.from(await response.arrayBuffer()),
          extension: '.mp3',
          mediaType: 'audio/mpeg',
        },
      ],
    }
  }
}

function createSsml(request: ProviderGenerationRequest): string {
  const voice = stringControl(
    request.controls,
    'voice',
    'en-US-Harper:MAI-Voice-2',
  )
  const locale = stringControl(
    request.controls,
    'locale',
    voice.split('-', 2).join('-') || 'en-US',
  )
  const style = optionalStringControl(request.controls, 'style')
  const styleDegree =
    numberControl(request.controls, 'styleDegree') ?? 1
  const content = escapeXml(request.prompt)
  const spokenContent =
    style === undefined
      ? content
      : `<mstts:express-as style="${escapeXmlAttribute(style)}" styledegree="${styleDegree}">${content}</mstts:express-as>`

  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${escapeXmlAttribute(locale)}">`,
    `  <voice xml:lang="${escapeXmlAttribute(locale)}" name="${escapeXmlAttribute(voice)}">`,
    `    ${spokenContent}`,
    '  </voice>',
    '</speak>',
  ].join('\n')
}

function stringControl(
  controls: Record<string, unknown>,
  name: string,
  fallback: string,
): string {
  return optionalStringControl(controls, name) ?? fallback
}

function optionalStringControl(
  controls: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = controls[name]
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function numberControl(
  controls: Record<string, unknown>,
  name: string,
): number | undefined {
  const value = controls[name]
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeXmlAttribute(value: string): string {
  return escapeXml(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
