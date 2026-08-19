import {MediaGenError} from '../application/media-gen-error.js'

export interface WebReference {
  url: string
}

export function normalizeWebReferences(
  values: string[],
): WebReference[] {
  const references = new Map<string, WebReference>()
  for (const value of values) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw invalidWebReference(value, 'is not a valid URL')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw invalidWebReference(
        value,
        'must use the http or https protocol',
      )
    }
    if (url.username.length > 0 || url.password.length > 0) {
      throw invalidWebReference(
        value,
        'must not include URL credentials',
      )
    }
    const normalized = url.toString()
    references.set(normalized, {url: normalized})
  }
  return [...references.values()]
}

function invalidWebReference(
  value: string,
  detail: string,
): MediaGenError {
  return new MediaGenError(
    'invalid_web_reference',
    `Web Reference "${value}" ${detail}`,
    2,
  )
}
