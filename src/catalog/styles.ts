import type {MediaType} from './models.js'

export interface StyleDefinition {
  guidance: string
  id: string
  label: string
  mediaTypes: readonly MediaType[]
}

const definitions: readonly StyleDefinition[] = [
  {
    guidance:
      'Use controlled studio lighting, a clean setting, and generous negative space.',
    id: 'minimal-studio',
    label: 'Minimal studio',
    mediaTypes: ['image', 'video'],
  },
  {
    guidance:
      'Keep the product clear, credible, and visually dominant.',
    id: 'product-led',
    label: 'Product-led',
    mediaTypes: ['image', 'video'],
  },
  {
    guidance:
      'Use bold graphic shapes, deliberate color, and a campaign-ready composition with clear copy-safe space.',
    id: 'brand-graphic',
    label: 'Brand graphic',
    mediaTypes: ['image', 'video'],
  },
  {
    guidance:
      'Use a conceptual editorial illustration with a clear visual idea and publication-quality composition.',
    id: 'editorial-illustration',
    label: 'Editorial illustration',
    mediaTypes: ['image'],
  },
  {
    guidance:
      'Use believable real-world context, natural lighting, and photorealistic materials.',
    id: 'photoreal-lifestyle',
    label: 'Photoreal lifestyle',
    mediaTypes: ['image', 'video'],
  },
  {
    guidance:
      'Use cinematic lighting, depth, and a premium visual tone.',
    id: 'cinematic',
    label: 'Cinematic',
    mediaTypes: ['image', 'video'],
  },
  {
    guidance:
      'Use an informal handheld phone-camera treatment with natural movement and social-video energy.',
    id: 'handheld-ugc',
    label: 'Handheld UGC',
    mediaTypes: ['video'],
  },
  {
    guidance:
      'Use bold graphic motion, quick transitions, and product-inspired abstract forms.',
    id: 'kinetic-graphic',
    label: 'Kinetic graphic',
    mediaTypes: ['video'],
  },
  {
    guidance:
      'Use approachable dimensional illustration, stylized materials, and playful forms.',
    id: 'playful-3d',
    label: 'Playful 3D',
    mediaTypes: ['image', 'video'],
  },
  {
    guidance:
      'Use a structured isometric illustration inspired by technical systems without implying diagrammatic accuracy.',
    id: 'technical-isometric',
    label: 'Technical isometric',
    mediaTypes: ['image'],
  },
]

const defaultStyles: Record<MediaType, string> = {
  image: 'minimal-studio',
  video: 'cinematic',
}

export function defaultStyleFor(mediaType: MediaType): string {
  return defaultStyles[mediaType]
}

export function findStyleDefinition(
  id: string,
): StyleDefinition | undefined {
  return definitions.find((definition) => definition.id === id)
}

export function listStyleDefinitions(
  mediaType: MediaType,
): readonly StyleDefinition[] {
  return definitions.filter((definition) =>
    definition.mediaTypes.includes(mediaType),
  )
}
