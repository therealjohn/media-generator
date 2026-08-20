import type {ModelAdapterKind} from '../catalog/models.js'

export interface StructuredModelDeployment {
  adapter: Extract<ModelAdapterKind, 'azure-openai-chat'>
  apiKey?: string
  deploymentName: string
  endpoint?: string
  id: string
  model: string
  projectEndpoint: string
  provider: string
}

export interface StructuredModelRequest {
  adapter: Extract<ModelAdapterKind, 'azure-openai-chat'>
  apiKey?: string
  deploymentName: string
  endpoint?: string
  jsonSchema: Record<string, unknown>
  modelName: string
  projectEndpoint: string
  prompt: string
  schemaName: string
  systemPrompt: string
}

export interface StructuredModelResult {
  value: unknown
}

export interface StructuredModelRuntime {
  generate(
    request: StructuredModelRequest,
  ): Promise<StructuredModelResult>
}

export interface StructuredModelAdapter {
  generate(
    request: StructuredModelRequest,
  ): Promise<StructuredModelResult>
  kind: Extract<ModelAdapterKind, 'azure-openai-chat'>
}

export function createStructuredModelRuntime(
  adapters: StructuredModelAdapter[],
): StructuredModelRuntime {
  const adaptersByKind = new Map(
    adapters.map((adapter) => [adapter.kind, adapter]),
  )

  return {
    async generate(request) {
      const adapter = adaptersByKind.get(request.adapter)
      if (adapter === undefined) {
        throw new Error(
          `Structured model adapter "${request.adapter}" is not available`,
        )
      }
      return adapter.generate(request)
    },
  }
}
