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

export interface MAIImageAdapterDependencies {
  credential: TokenCredential
  fetch: typeof globalThis.fetch
  getToken?: ImageTokenRetriever
  readFile?: (path: string) => Promise<Buffer>
}

export class MAIImageAdapter implements ModelAdapter {
  readonly kind = 'mai-image' as const

  readonly #credential: TokenCredential
  readonly #fetch: typeof globalThis.fetch
  readonly #getToken: ImageTokenRetriever
  readonly #readFile: (path: string) => Promise<Buffer>

  constructor(dependencies: MAIImageAdapterDependencies) {
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
    validateReferences(request)

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
    const body = await readProviderJson(response, 'MAI Image')

    return {
      jobId: null,
      outputs: normalizeBase64DataOutputs(
        body,
        'MAI Image',
        'image/png',
        '.png',
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
        'MAI image editing accepts exactly one reference image',
      )
    }

    const contents = await this.#readFile(reference.path)
    const form = new FormData()
    form.append('model', request.deploymentName)
    form.append('prompt', request.prompt)
    form.append(
      'image',
      new Blob([new Uint8Array(contents)], {
        type: reference.mediaType,
      }),
      basename(reference.path),
    )

    return this.#fetch(
      `${servicesOrigin}/mai/v1/images/edits`,
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
      `${servicesOrigin}/mai/v1/images/generations`,
      {
        body: JSON.stringify({
          height: numberControl(request.controls, 'height', 1024),
          model: request.deploymentName,
          prompt: request.prompt,
          width: numberControl(request.controls, 'width', 1024),
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

function numberControl(
  controls: Record<string, unknown>,
  name: string,
  fallback: number,
): number {
  const value = controls[name]
  if (value === undefined) {
    return fallback
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(`MAI Image control "${name}" must be an integer`)
  }

  return value
}

function validateReferences(
  request: ProviderGenerationRequest,
): void {
  if (request.references.length > 1) {
    throw new Error(
      'MAI image editing accepts exactly one reference image',
    )
  }
  if (
    request.modelName === 'MAI-Image-2e' &&
    request.references.length > 0
  ) {
    throw new Error(
      'MAI-Image-2e does not support image editing',
    )
  }
}
