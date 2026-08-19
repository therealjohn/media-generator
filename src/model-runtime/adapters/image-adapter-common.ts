import type {
  AccessToken,
  TokenCredential,
} from '@azure/core-auth'

import type {ProviderOutput} from '../model-runtime.js'

export const foundryImageTokenScope =
  'https://cognitiveservices.azure.com/.default'

export type ImageTokenRetriever = (
  credential: TokenCredential,
  scope: string,
) => Promise<AccessToken | null>

export interface ImageOutputType {
  extension: string
  mediaType: string
}

export async function acquireFoundryImageToken(
  credential: TokenCredential,
  getToken: ImageTokenRetriever,
): Promise<string> {
  const accessToken = await getToken(
    credential,
    foundryImageTokenScope,
  )
  if (accessToken === null) {
    throw new Error(
      'Unable to acquire a Microsoft Foundry image access token',
    )
  }

  return accessToken.token
}

export function getFoundryServicesOrigin(
  projectEndpoint: string,
): string {
  return new URL(projectEndpoint).origin
}

export async function readProviderJson(
  response: Response,
  providerName: string,
): Promise<unknown> {
  const text = await response.text()
  const body = parseJson(text)

  if (!response.ok) {
    const message = getProviderErrorMessage(body) ?? text
    throw new Error(
      `${providerName} request failed (${response.status}): ${message}`,
    )
  }

  if (body === undefined) {
    throw new Error(`${providerName} returned an empty response`)
  }

  return body
}

export function normalizeBase64DataOutputs(
  body: unknown,
  providerName: string,
  mediaType: string,
  extension: string,
): ProviderOutput[] {
  if (
    !isRecord(body) ||
    !Array.isArray(body.data) ||
    body.data.length === 0
  ) {
    throw new Error(
      `${providerName} returned no generated image data`,
    )
  }

  return body.data.map((item) => {
    if (!isRecord(item) || typeof item.b64_json !== 'string') {
      throw new Error(
        `${providerName} returned an image without base64 data`,
      )
    }

    return {
      contents: Buffer.from(stripDataUrl(item.b64_json), 'base64'),
      extension,
      mediaType,
    }
  })
}

export async function normalizeProviderImageOutputs(
  body: unknown,
  providerName: string,
  fetch: typeof globalThis.fetch,
  fallbackType: ImageOutputType,
): Promise<ProviderOutput[]> {
  const candidates = getImageCandidates(body)
  if (candidates.length === 0) {
    throw new Error(
      `${providerName} returned no generated image data`,
    )
  }

  return Promise.all(
    candidates.map(async (candidate) => {
      if (!isRecord(candidate)) {
        throw new Error(
          `${providerName} returned an invalid image result`,
        )
      }

      const base64 = getFirstString(candidate, [
        'b64_json',
        'base64_data',
        'base64',
      ])
      if (base64 !== undefined) {
        const dataUrl = parseDataUrl(base64)
        const outputType =
          dataUrl.mediaType === undefined
            ? fallbackType
            : outputTypeFromMediaType(dataUrl.mediaType) ??
              fallbackType
        return {
          contents: Buffer.from(dataUrl.base64, 'base64'),
          ...outputType,
        }
      }

      const url = getFirstString(candidate, ['url', 'sample'])
      if (url === undefined) {
        throw new Error(
          `${providerName} returned an image without data or a URL`,
        )
      }

      return downloadImage(url, providerName, fetch, fallbackType)
    }),
  )
}

async function downloadImage(
  url: string,
  providerName: string,
  fetch: typeof globalThis.fetch,
  fallbackType: ImageOutputType,
): Promise<ProviderOutput> {
  const response = await fetch(url)
  if (!response.ok) {
    const message = await response.text()
    throw new Error(
      `${providerName} image download failed (${response.status}): ${message}`,
    )
  }

  const contents = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  const outputType =
    (contentType === undefined
      ? undefined
      : outputTypeFromMediaType(contentType)) ??
    outputTypeFromUrl(url) ??
    fallbackType

  return {
    contents,
    ...outputType,
  }
}

function getFirstString(
  record: Record<string, unknown>,
  names: string[],
): string | undefined {
  for (const name of names) {
    const value = record[name]
    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

function getImageCandidates(body: unknown): unknown[] {
  if (!isRecord(body)) {
    return []
  }
  if (Array.isArray(body.data)) {
    return body.data
  }
  if (Array.isArray(body.images)) {
    return body.images
  }
  if (isRecord(body.result)) {
    return [body.result]
  }
  if (
    getFirstString(body, [
      'b64_json',
      'base64_data',
      'base64',
      'url',
      'sample',
    ]) !== undefined
  ) {
    return [body]
  }

  return []
}

function getProviderErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined
  }

  if (
    isRecord(body.error) &&
    typeof body.error.message === 'string'
  ) {
    return body.error.message
  }

  if (typeof body.message === 'string') {
    return body.message
  }

  return undefined
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseJson(text: string): unknown {
  if (text.length === 0) {
    return undefined
  }

  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function outputTypeFromMediaType(
  mediaType: string,
): ImageOutputType | undefined {
  switch (mediaType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return {
        extension: '.jpg',
        mediaType: 'image/jpeg',
      }
    case 'image/png':
      return {
        extension: '.png',
        mediaType: 'image/png',
      }
    case 'image/webp':
      return {
        extension: '.webp',
        mediaType: 'image/webp',
      }
    default:
      return undefined
  }
}

function outputTypeFromUrl(
  value: string,
): ImageOutputType | undefined {
  let pathname: string
  try {
    pathname = new URL(value).pathname.toLowerCase()
  } catch {
    return undefined
  }

  if (pathname.endsWith('.png')) {
    return outputTypeFromMediaType('image/png')
  }
  if (
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg')
  ) {
    return outputTypeFromMediaType('image/jpeg')
  }
  if (pathname.endsWith('.webp')) {
    return outputTypeFromMediaType('image/webp')
  }

  return undefined
}

function parseDataUrl(value: string): {
  base64: string
  mediaType?: string
} {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(value)
  if (match === null) {
    return {base64: value}
  }

  return {
    base64: match[2] ?? '',
    mediaType: match[1],
  }
}

function stripDataUrl(value: string): string {
  return parseDataUrl(value).base64
}
