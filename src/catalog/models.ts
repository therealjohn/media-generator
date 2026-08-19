export type ModelAdapterKind =
  | 'azure-openai-image'
  | 'bfl-flux'
  | 'mai-image'
  | 'mai-voice'
  | 'sora-video'

export type MediaType = 'image' | 'video'
export type ModelMediaType = MediaType | 'audio'

export interface ModelCapabilities {
  acceptsImageReferences: boolean
  acceptsVideoReferences: boolean
  maxReferences: number
  supportsEditing: boolean
  supportsTextGeneration: boolean
}

export interface ModelDefinition {
  adapter: ModelAdapterKind
  capabilities: ModelCapabilities
  mediaType: ModelMediaType
  modelName: string
}

const imageTextOnly: ModelCapabilities = {
  acceptsImageReferences: false,
  acceptsVideoReferences: false,
  maxReferences: 0,
  supportsEditing: false,
  supportsTextGeneration: true,
}

const definitions: ModelDefinition[] = [
  {
    adapter: 'mai-image',
    capabilities: {
      ...imageTextOnly,
      acceptsImageReferences: true,
      maxReferences: 1,
      supportsEditing: true,
    },
    mediaType: 'image',
    modelName: 'MAI-Image-2.5',
  },
  {
    adapter: 'mai-image',
    capabilities: {
      ...imageTextOnly,
      acceptsImageReferences: true,
      maxReferences: 1,
      supportsEditing: true,
    },
    mediaType: 'image',
    modelName: 'MAI-Image-2.5-Flash',
  },
  {
    adapter: 'mai-image',
    capabilities: imageTextOnly,
    mediaType: 'image',
    modelName: 'MAI-Image-2e',
  },
  {
    adapter: 'azure-openai-image',
    capabilities: {
      ...imageTextOnly,
      acceptsImageReferences: true,
      maxReferences: 1,
      supportsEditing: true,
    },
    mediaType: 'image',
    modelName: 'gpt-image-2',
  },
  {
    adapter: 'bfl-flux',
    capabilities: {
      ...imageTextOnly,
      acceptsImageReferences: true,
      maxReferences: 1,
      supportsEditing: true,
    },
    mediaType: 'image',
    modelName: 'FLUX.1-Kontext-pro',
  },
  {
    adapter: 'bfl-flux',
    capabilities: imageTextOnly,
    mediaType: 'image',
    modelName: 'FLUX-1.1-pro',
  },
  {
    adapter: 'bfl-flux',
    capabilities: {
      ...imageTextOnly,
      acceptsImageReferences: true,
      maxReferences: 8,
      supportsEditing: true,
    },
    mediaType: 'image',
    modelName: 'FLUX.2-pro',
  },
  {
    adapter: 'bfl-flux',
    capabilities: {
      ...imageTextOnly,
      acceptsImageReferences: true,
      maxReferences: 10,
      supportsEditing: true,
    },
    mediaType: 'image',
    modelName: 'FLUX.2-flex',
  },
  {
    adapter: 'sora-video',
    capabilities: {
      acceptsImageReferences: true,
      acceptsVideoReferences: true,
      maxReferences: 1,
      supportsEditing: true,
      supportsTextGeneration: true,
    },
    mediaType: 'video',
    modelName: 'sora-2',
  },
]

export function findModelDefinition(
  modelName: string,
): ModelDefinition | undefined {
  const normalized = modelName.toLowerCase()
  return definitions.find(
    (definition) =>
      definition.modelName.toLowerCase() === normalized,
  )
}

export function listModelDefinitions(): readonly ModelDefinition[] {
  return definitions
}
