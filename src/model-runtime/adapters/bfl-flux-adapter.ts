import {readFile as readFileFromDisk} from 'node:fs/promises'

import type {TokenCredential} from '@azure/core-auth'

import type {
  ModelAdapter,
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from '../model-runtime.js'
import {
  acquireFoundryImageToken,
  normalizeProviderImageOutputs,
  readProviderJson,
} from './image-adapter-common.js'
import type {
  ImageOutputType,
  ImageTokenRetriever,
} from './image-adapter-common.js'

export interface BFLFluxAdapterDependencies {
  credential: TokenCredential
  fetch: typeof globalThis.fetch
  getToken?: ImageTokenRetriever
  readFile?: (path: string) => Promise<Buffer>
}

interface FluxModelConfiguration {
  maxReferences: number
  path: string
}

const modelConfigurations: Record<
  string,
  FluxModelConfiguration
> = {
  'FLUX-1.1-pro': {
    maxReferences: 0,
    path: 'flux-pro-1.1',
  },
  'FLUX.1-Kontext-pro': {
    maxReferences: 1,
    path: 'flux-kontext-pro',
  },
  'FLUX.2-flex': {
    maxReferences: 10,
    path: 'flux-2-flex',
  },
  'FLUX.2-pro': {
    maxReferences: 8,
    path: 'flux-2-pro',
  },
}

export class BFLFluxAdapter implements ModelAdapter {
  readonly kind = 'bfl-flux' as const

  readonly #credential: TokenCredential
  readonly #fetch: typeof globalThis.fetch
  readonly #getToken: ImageTokenRetriever
  readonly #readFile: (path: string) => Promise<Buffer>

  constructor(dependencies: BFLFluxAdapterDependencies) {
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
    const configuration = getModelConfiguration(request.modelName)
    if (request.references.length > configuration.maxReferences) {
      throw new Error(
        `${request.modelName} accepts at most ${configuration.maxReferences} reference images`,
      )
    }

    const fallbackType = getOutputType(request.controls)
    const token = await acquireFoundryImageToken(
      this.#credential,
      this.#getToken,
    )
    const body = await this.#createRequestBody(request)
    const response = await this.#fetch(
      `${getBFLOrigin(request.projectEndpoint)}/providers/blackforestlabs/v1/${configuration.path}?api-version=preview`,
      {
        body: JSON.stringify(body),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    )
    const responseBody = await readProviderJson(
      response,
      'BFL FLUX',
    )

    return {
      jobId: null,
      outputs: await normalizeProviderImageOutputs(
        responseBody,
        'BFL FLUX',
        this.#fetch,
        fallbackType,
      ),
    }
  }

  async #createRequestBody(
    request: ProviderGenerationRequest,
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      ...request.controls,
      model: request.deploymentName,
      prompt: request.prompt,
    }
    for (const name of Object.keys(body)) {
      if (/^input_image(?:_\d+)?$/.test(name)) {
        delete body[name]
      }
    }

    const references = await Promise.all(
      request.references.map((reference) =>
        this.#readFile(reference.path),
      ),
    )
    references.forEach((contents, index) => {
      const suffix = index === 0 ? '' : `_${index + 1}`
      body[`input_image${suffix}`] = contents.toString('base64')
    })

    return body
  }
}

function getBFLOrigin(projectEndpoint: string): string {
  const projectUrl = new URL(projectEndpoint)
  const servicesSuffix = '.services.ai.azure.com'
  if (!projectUrl.hostname.endsWith(servicesSuffix)) {
    throw new Error(
      'The Foundry project endpoint must use a services.ai.azure.com host',
    )
  }

  const resourceName = projectUrl.hostname.slice(
    0,
    -servicesSuffix.length,
  )
  return `${projectUrl.protocol}//${resourceName}.api.cognitive.microsoft.com`
}

function getModelConfiguration(
  modelName: string,
): FluxModelConfiguration {
  const configuration = modelConfigurations[modelName]
  if (configuration === undefined) {
    throw new Error(`Unsupported BFL FLUX model "${modelName}"`)
  }

  return configuration
}

function getOutputType(
  controls: Record<string, unknown>,
): ImageOutputType {
  const outputFormat = controls.output_format
  if (
    outputFormat === undefined ||
    outputFormat === 'jpeg' ||
    outputFormat === 'jpg'
  ) {
    return {
      extension: '.jpg',
      mediaType: 'image/jpeg',
    }
  }
  if (outputFormat === 'png') {
    return {
      extension: '.png',
      mediaType: 'image/png',
    }
  }

  throw new Error(
    'BFL FLUX control "output_format" must be jpeg or png',
  )
}
