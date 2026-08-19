import type {ModelAdapterKind} from '../catalog/models.js'
import type {ReferenceFingerprint} from '../generation/generation-store.js'

export interface ProviderGenerationRequest {
  adapter: ModelAdapterKind
  apiKey?: string
  controls: Record<string, unknown>
  deploymentName: string
  endpoint?: string
  modelName: string
  projectEndpoint: string
  prompt: string
  references: ReferenceFingerprint[]
}

export interface ProviderOutput {
  contents: Buffer
  extension: string
  mediaType: string
}

export interface ProviderGenerationResult {
  jobId: null | string
  outputs: ProviderOutput[]
}

export interface ModelAdapter {
  kind: ModelAdapterKind
  generate(
    request: ProviderGenerationRequest,
  ): Promise<ProviderGenerationResult>
}

export interface ModelRuntime {
  generate(
    request: ProviderGenerationRequest,
  ): Promise<ProviderGenerationResult>
}

export function createModelRuntime(
  adapters: ModelAdapter[],
): ModelRuntime {
  const adaptersByKind = new Map(
    adapters.map((adapter) => [adapter.kind, adapter]),
  )

  return {
    async generate(request) {
      const adapter = adaptersByKind.get(request.adapter)
      if (adapter === undefined) {
        throw new Error(
          `Model adapter "${request.adapter}" is not available`,
        )
      }

      return adapter.generate(request)
    },
  }
}

export function createFakeModelAdapter(
  kind: ModelAdapterKind,
  output: ProviderOutput,
): ModelAdapter {
  return {
    async generate() {
      return {
        jobId: null,
        outputs: [output],
      }
    },
    kind,
  }
}
