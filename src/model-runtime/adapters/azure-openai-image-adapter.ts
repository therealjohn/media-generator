import {readFile as readFileFromDisk} from 'node:fs/promises'
import {basename} from 'node:path'

import type {TokenCredential} from '@azure/core-auth'

import type {
  ModelAdapter,
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from '../model-runtime.js'
import {
  acquireFoundryImageToken,
  getFoundryServicesOrigin,
  normalizeBase64DataOutputs,
  readProviderJson,
} from './image-adapter-common.js'
import type {ImageTokenRetriever} from './image-adapter-common.js'

export interface AzureOpenAIImageAdapterDependencies {
  credential: TokenCredential
  fetch: typeof globalThis.fetch
  getToken?: ImageTokenRetriever
  readFile?: (path: string) => Promise<Buffer>
}

export class AzureOpenAIImageAdapter implements ModelAdapter {
  readonly kind = 'azure-openai-image' as const

  readonly #credential: TokenCredential
  readonly #fetch: typeof globalThis.fetch
  readonly #getToken: ImageTokenRetriever
  readonly #readFile: (path: string) => Promise<Buffer>

  constructor(
    dependencies: AzureOpenAIImageAdapterDependencies,
  ) {
    this.#credential = dependencies.credential
    this.#fetch = dependencies.fetch
    this.#getToken =
      dependencies.getToken ??
      ((credential, scope) => credential.getToken(scope))
    this.#readFile =
      dependencies.readFile ??
      (async (path) => readFileFromDisk(path))
  }

  async generate(
    request: ProviderGenerationRequest,
  ): Promise<ProviderGenerationResult> {
    if (request.references.length > 1) {
      throw new Error(
        'GPT Image editing accepts exactly one reference image',
      )
    }

    const outputType = getOutputType(request.controls)
    const token = await acquireFoundryImageToken(
      this.#credential,
      this.#getToken,
    )
    const servicesOrigin = getFoundryServicesOrigin(
      request.projectEndpoint,
    )
    const response =
      request.references.length === 0
        ? await this.#generateImage(request, servicesOrigin, token)
        : await this.#editImage(request, servicesOrigin, token)
    const body = await readProviderJson(response, 'GPT Image')

    return {
      jobId: null,
      outputs: normalizeBase64DataOutputs(
        body,
        'GPT Image',
        outputType.mediaType,
        outputType.extension,
      ),
    }
  }

  async #editImage(
    request: ProviderGenerationRequest,
    servicesOrigin: string,
    token: string,
  ): Promise<Response> {
    const reference = request.references[0]
    if (reference === undefined) {
      throw new Error(
        'GPT Image editing accepts exactly one reference image',
      )
    }

    const contents = await this.#readFile(reference.path)
    const form = new FormData()
    appendControls(form, normalizeControls(request.controls))
    form.set('model', request.deploymentName)
    form.set('prompt', request.prompt)
    form.set(
      'image',
      new Blob([new Uint8Array(contents)], {
        type: reference.mediaType,
      }),
      basename(reference.path),
    )

    return this.#fetch(
      `${servicesOrigin}/openai/v1/images/edits?api-version=preview`,
      {
        body: form,
        headers: {
          authorization: `Bearer ${token}`,
        },
        method: 'POST',
      },
    )
  }

  #generateImage(
    request: ProviderGenerationRequest,
    servicesOrigin: string,
    token: string,
  ): Promise<Response> {
    return this.#fetch(
      `${servicesOrigin}/openai/v1/images/generations?api-version=preview`,
      {
        body: JSON.stringify({
          ...normalizeControls(request.controls),
          model: request.deploymentName,
          prompt: request.prompt,
        }),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    )
  }
}

function normalizeControls(
  controls: Record<string, unknown>,
): Record<string, unknown> {
  const {height, width, ...normalized} = controls
  if (
    normalized.size === undefined &&
    typeof height === 'number' &&
    typeof width === 'number'
  ) {
    normalized.size =
      width > height
        ? '1536x1024'
        : height > width
          ? '1024x1536'
          : '1024x1024'
  }

  return normalized
}

function appendControls(
  form: FormData,
  controls: Record<string, unknown>,
): void {
  for (const [name, value] of Object.entries(controls)) {
    if (
      value === undefined ||
      name === 'image' ||
      name === 'model' ||
      name === 'prompt'
    ) {
      continue
    }
    if (
      typeof value !== 'boolean' &&
      typeof value !== 'number' &&
      typeof value !== 'string'
    ) {
      throw new Error(
        `GPT Image control "${name}" must be a scalar value`,
      )
    }

    form.append(name, String(value))
  }
}

function getOutputType(
  controls: Record<string, unknown>,
): {
  extension: string
  mediaType: string
} {
  const outputFormat = controls.output_format
  if (outputFormat === undefined || outputFormat === 'png') {
    return {
      extension: '.png',
      mediaType: 'image/png',
    }
  }
  if (outputFormat === 'jpeg' || outputFormat === 'jpg') {
    return {
      extension: '.jpg',
      mediaType: 'image/jpeg',
    }
  }
  if (outputFormat === 'webp') {
    return {
      extension: '.webp',
      mediaType: 'image/webp',
    }
  }

  throw new Error(
    'GPT Image control "output_format" must be png, jpeg, or webp',
  )
}
