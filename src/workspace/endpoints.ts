const foundryHostnameSuffix = '.services.ai.azure.com'
const speechHostnameSuffixes = [
  '.cognitiveservices.azure.com',
  '.tts.speech.microsoft.com',
]

export function isMicrosoftFoundryProjectEndpoint(
  value: string,
): boolean {
  const url = parseHttpsUrl(value)
  return (
    url !== undefined &&
    hasNamedSubdomain(url.hostname, foundryHostnameSuffix)
  )
}

export function isAzureSpeechEndpoint(value: string): boolean {
  const url = parseHttpsUrl(value)
  return (
    url !== undefined &&
    speechHostnameSuffixes.some((suffix) =>
      hasNamedSubdomain(url.hostname, suffix),
    )
  )
}

export function isAzureSpeechSynthesisEndpoint(
  value: string,
): boolean {
  const url = parseHttpsUrl(value)
  return (
    url !== undefined &&
    hasNamedSubdomain(
      url.hostname,
      '.tts.speech.microsoft.com',
    )
  )
}

function parseHttpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.username.length === 0 &&
      url.password.length === 0
      ? url
      : undefined
  } catch {
    return undefined
  }
}

function hasNamedSubdomain(
  hostname: string,
  suffix: string,
): boolean {
  return (
    hostname.endsWith(suffix) &&
    hostname.length > suffix.length
  )
}
