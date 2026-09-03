import {readFile} from 'node:fs/promises'
import {basename} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'

import {AzureCliCredential} from '@azure/identity'

import {getVideoModelProfile} from '../../catalog/models.js'
import type {
  ModelAdapter,
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from '../model-runtime.js'

const azureAiScope = 'https://ai.azure.com/.default'
const previewQuery = 'api-version=preview'

export interface SoraVideoAdapterDependencies {
  fetch: typeof globalThis.fetch
  getAccessToken(scope: string): Promise<string>
  maxPollAttempts: number
  pollIntervalMs: number
  readFile(path: string): Promise<Buffer>
  sleep(milliseconds: number): Promise<void>
}

const defaultDependencies: SoraVideoAdapterDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
  getAccessToken: async (scope) => {
    const token = await new AzureCliCredential().getToken(scope)
    if (token === null) {
      throw new Error('Azure CLI did not return an access token')
    }

    return token.token
  },
  maxPollAttempts: 60,
  pollIntervalMs: 5_000,
  readFile,
  sleep: async (milliseconds) => {
    await delay(milliseconds)
  },
}

export class SoraVideoJobAdapter implements ModelAdapter {
  readonly kind = 'sora-video' as const

  readonly #dependencies: SoraVideoAdapterDependencies

  constructor(
    dependencyOverrides: Partial<SoraVideoAdapterDependencies> = {},
  ) {
    this.#dependencies = {
      ...defaultDependencies,
      ...dependencyOverrides,
    }
  }

  async generate(
    request: ProviderGenerationRequest,
  ): Promise<ProviderGenerationResult> {
    const dependencies = this.#dependencies
    const endpoint = azureOpenAiEndpoint(request.projectEndpoint)
    const useNativeV1 =
      optionalInteger(
        request.controls,
        ['nVariants', 'n_variants'],
        1,
      ) === 1
    const nativeSubmission = useNativeV1
      ? await createNativeSubmission(
          request,
          dependencies.readFile,
        )
      : undefined
    const accessToken = await dependencies.getAccessToken(azureAiScope)
    const authorizationHeaders = {
      Authorization: `Bearer ${accessToken}`,
    }
    if (nativeSubmission !== undefined) {
      const nativeResult = await generateNativeVideo(
        endpoint,
        nativeSubmission,
        authorizationHeaders,
        dependencies,
      )
      if (nativeResult !== undefined) {
        return nativeResult
      }
    }

    return generateLegacyVideo(
      endpoint,
      await createLegacySubmission(
        request,
        dependencies.readFile,
      ),
      authorizationHeaders,
      dependencies,
    )
  }
}

async function generateNativeVideo(
  endpoint: string,
  submission: {
    body: FormData | string
    headers: Record<string, string>
  },
  authorizationHeaders: Record<string, string>,
  dependencies: SoraVideoAdapterDependencies,
): Promise<ProviderGenerationResult | undefined> {
  const response = await dependencies.fetch(
    `${endpoint}/openai/v1/videos`,
    {
      body: submission.body,
      headers: {
        ...authorizationHeaders,
        ...submission.headers,
      },
      method: 'POST',
    },
  )
  if (response.status === 404) {
    return undefined
  }
  await ensureSuccessfulResponse(response, 'Sora video request')
  const job = await readJsonResponse(response)
  const jobId = requiredString(job, 'id', 'Sora job response')
  let currentJob = job

  for (
    let pollAttempt = 0;
    !isNativeTerminalStatus(currentJob.status);
    pollAttempt += 1
  ) {
    if (pollAttempt >= dependencies.maxPollAttempts) {
      throw new Error(
        `Sora video job "${jobId}" did not complete after ${dependencies.maxPollAttempts} polling attempts`,
      )
    }

    await dependencies.sleep(dependencies.pollIntervalMs)
    currentJob = await fetchJson(
      dependencies.fetch,
      `${endpoint}/openai/v1/videos/${encodeURIComponent(jobId)}`,
      {
        headers: authorizationHeaders,
        method: 'GET',
      },
    )
  }

  if (currentJob.status !== 'completed') {
    throw terminalJobError(jobId, currentJob)
  }

  const videoResponse = await dependencies.fetch(
    `${endpoint}/openai/v1/videos/${encodeURIComponent(jobId)}/content`,
    {
      headers: authorizationHeaders,
      method: 'GET',
    },
  )
  await ensureSuccessfulResponse(videoResponse, 'Sora video download')
  return {
    jobId,
    outputs: [
      {
        contents: Buffer.from(await videoResponse.arrayBuffer()),
        extension: '.mp4',
        mediaType: 'video/mp4',
      },
    ],
  }
}

async function generateLegacyVideo(
  endpoint: string,
  submission: {
    body: FormData | string
    headers: Record<string, string>
  },
  authorizationHeaders: Record<string, string>,
  dependencies: SoraVideoAdapterDependencies,
): Promise<ProviderGenerationResult> {
  const job = await fetchJson(
    dependencies.fetch,
    `${endpoint}/openai/v1/video/generations/jobs?${previewQuery}`,
    {
      body: submission.body,
      headers: {
        ...authorizationHeaders,
        ...submission.headers,
      },
      method: 'POST',
    },
  )
  const jobId = requiredString(job, 'id', 'Sora job response')
  let currentJob = job

  for (
    let pollAttempt = 0;
    !isTerminalStatus(currentJob.status);
    pollAttempt += 1
  ) {
    if (pollAttempt >= dependencies.maxPollAttempts) {
      throw new Error(
        `Sora video job "${jobId}" did not complete after ${dependencies.maxPollAttempts} polling attempts`,
      )
    }

    await dependencies.sleep(dependencies.pollIntervalMs)
    currentJob = await fetchJson(
      dependencies.fetch,
      `${endpoint}/openai/v1/video/generations/jobs/${encodeURIComponent(jobId)}?${previewQuery}`,
      {
        headers: authorizationHeaders,
        method: 'GET',
      },
    )
  }

  if (currentJob.status !== 'succeeded') {
    throw terminalJobError(jobId, currentJob)
  }

  const outputs = []
  for (const generationId of generationIds(currentJob)) {
    const videoResponse = await dependencies.fetch(
      `${endpoint}/openai/v1/video/generations/${encodeURIComponent(generationId)}/content/video?${previewQuery}`,
      {
        headers: authorizationHeaders,
        method: 'GET',
      },
    )
    await ensureSuccessfulResponse(
      videoResponse,
      'Sora video download',
    )
    outputs.push({
      contents: Buffer.from(await videoResponse.arrayBuffer()),
      extension: '.mp4',
      mediaType: 'video/mp4',
    })
  }

  return {
    jobId,
    outputs,
  }
}

export function createSoraVideoAdapter(
  dependencyOverrides: Partial<SoraVideoAdapterDependencies> = {},
): ModelAdapter {
  return new SoraVideoJobAdapter(dependencyOverrides)
}

function azureOpenAiEndpoint(projectEndpoint: string): string {
  const url = new URL(projectEndpoint)
  const foundrySuffix = '.services.ai.azure.com'
  if (!url.hostname.endsWith(foundrySuffix)) {
    throw new Error(
      `Cannot derive an Azure OpenAI endpoint from "${projectEndpoint}"`,
    )
  }

  const resourceName = url.hostname.slice(0, -foundrySuffix.length)
  return `https://${resourceName}.openai.azure.com`
}

async function createNativeSubmission(
  request: ProviderGenerationRequest,
  readReference: (path: string) => Promise<Buffer>,
): Promise<{
  body: FormData | string
  headers: Record<string, string>
}> {
  const width = requiredInteger(request.controls, 'width')
  const height = requiredInteger(request.controls, 'height')
  const fields = {
    model: request.deploymentName,
    prompt: request.prompt,
    seconds: String(soraDuration(request)),
    size: `${width}x${height}`,
  }
  if (request.references.length === 0) {
    return {
      body: JSON.stringify(fields),
      headers: {'Content-Type': 'application/json'},
    }
  }
  if (request.references.length > 1) {
    throw new Error('Sora video generation accepts at most one reference')
  }
  const reference = request.references[0]
  if (reference === undefined) {
    throw new Error('Sora reference was not available')
  }
  if (
    !reference.mediaType.startsWith('image/') &&
    !reference.mediaType.startsWith('video/')
  ) {
    throw new Error(
      `Sora does not support reference media type "${reference.mediaType}"`,
    )
  }
  const fileName = basename(reference.path)
  const contents = await readReference(reference.path)
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value)
  }
  form.set(
    'input_reference',
    new Blob([new Uint8Array(contents)], {
      type: reference.mediaType,
    }),
    fileName,
  )
  return {body: form, headers: {}}
}

async function createLegacySubmission(
  request: ProviderGenerationRequest,
  readReference: (path: string) => Promise<Buffer>,
): Promise<{
  body: FormData | string
  headers: Record<string, string>
}> {
  const fields = {
    height: requiredInteger(request.controls, 'height'),
    model: request.deploymentName,
    n_seconds: soraDuration(request),
    n_variants: optionalInteger(
      request.controls,
      ['nVariants', 'n_variants'],
      1,
    ),
    prompt: request.prompt,
    width: requiredInteger(request.controls, 'width'),
  }

  if (request.references.length === 0) {
    return {
      body: JSON.stringify(fields),
      headers: {'Content-Type': 'application/json'},
    }
  }

  if (request.references.length > 1) {
    throw new Error('Sora video generation accepts at most one reference')
  }

  const reference = request.references[0]
  if (reference === undefined) {
    throw new Error('Sora reference was not available')
  }

  const referenceType = reference.mediaType.startsWith('image/')
    ? 'image'
    : reference.mediaType.startsWith('video/')
      ? 'video'
      : null
  if (referenceType === null) {
    throw new Error(
      `Sora does not support reference media type "${reference.mediaType}"`,
    )
  }

  const fileName = basename(reference.path)
  const contents = await readReference(reference.path)
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, String(value))
  }

  form.set(
    'inpaint_items',
    JSON.stringify([
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
  )
  form.append(
    'files',
    new Blob([new Uint8Array(contents)], {
      type: reference.mediaType,
    }),
    fileName,
  )

  return {
    body: form,
    headers: {},
  }
}

async function fetchJson(
  fetchImplementation: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetchImplementation(url, init)
  await ensureSuccessfulResponse(response, 'Sora video request')
  return readJsonResponse(response)
}

async function readJsonResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const value: unknown = await response.json()
  if (!isRecord(value)) {
    throw new Error('Sora video response was not a JSON object')
  }

  return value
}

async function ensureSuccessfulResponse(
  response: Response,
  operation: string,
): Promise<void> {
  if (response.ok) {
    return
  }

  const details = providerErrorMessage(await response.text())
  throw new Error(
    `${operation} failed with HTTP ${response.status}${details === '' ? '' : `: ${details}`}`,
  )
}

function providerErrorMessage(body: string): string {
  if (body === '') {
    return ''
  }

  try {
    const value: unknown = JSON.parse(body)
    if (isRecord(value)) {
      if (typeof value.message === 'string') {
        return value.message
      }

      if (
        isRecord(value.error) &&
        typeof value.error.message === 'string'
      ) {
        return value.error.message
      }
    }
  } catch {
    return body
  }

  return body
}

function generationIds(job: Record<string, unknown>): string[] {
  const generations = job.generations
  if (!Array.isArray(generations) || generations.length === 0) {
    throw new Error('Sora video job succeeded without a generation')
  }

  return generations.map((generation) => {
    if (!isRecord(generation)) {
      throw new Error(
        'Sora video generation response did not include "id"',
      )
    }

    return requiredString(
      generation,
      'id',
      'Sora video generation response',
    )
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTerminalStatus(status: unknown): boolean {
  return (
    status === 'cancelled' ||
    status === 'failed' ||
    status === 'succeeded'
  )
}

function isNativeTerminalStatus(status: unknown): boolean {
  return (
    status === 'cancelled' ||
    status === 'completed' ||
    status === 'failed'
  )
}

function terminalJobError(
  jobId: string,
  job: Record<string, unknown>,
): Error {
  const reason = jobFailureReason(job)
  return new Error(
    `Sora video job "${jobId}" ended with status "${String(job.status)}"${reason === undefined ? '' : `: ${reason}`}`,
  )
}

function jobFailureReason(
  job: Record<string, unknown>,
): string | undefined {
  if (
    typeof job.failure_reason === 'string' &&
    job.failure_reason !== ''
  ) {
    return job.failure_reason
  }
  if (typeof job.error === 'string' && job.error !== '') {
    return job.error
  }
  if (
    isRecord(job.error) &&
    typeof job.error.message === 'string' &&
    job.error.message !== ''
  ) {
    return job.error.message
  }
  return undefined
}

function optionalInteger(
  controls: Record<string, unknown>,
  keys: string[],
  fallback: number,
): number {
  for (const key of keys) {
    if (controls[key] !== undefined) {
      return integer(controls[key], key)
    }
  }

  return fallback
}

function soraDuration(request: ProviderGenerationRequest): number {
  const profile = getVideoModelProfile(request.modelName)
  const duration = optionalInteger(
    request.controls,
    ['nSeconds', 'n_seconds'],
    profile.clipDurationsSeconds[0]!,
  )
  if (!profile.clipDurationsSeconds.includes(duration)) {
    throw new Error(
      `Sora duration ${duration} is unsupported; expected one of ${profile.clipDurationsSeconds.join(', ')} seconds`,
    )
  }
  return duration
}

function requiredInteger(
  controls: Record<string, unknown>,
  key: string,
): number {
  return integer(controls[key], key)
}

function integer(value: unknown, name: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(`Sora control "${name}" must be a positive integer`)
  }

  return value
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  description: string,
): string {
  const property = value[key]
  if (typeof property !== 'string' || property === '') {
    throw new Error(`${description} did not include "${key}"`)
  }

  return property
}
