import type {MediaType} from './models.js'

export interface StyleDefinition {
  description: string
  guidance: string
  id: string
  label: string
  mediaTypes: readonly MediaType[]
}

const definitions: readonly StyleDefinition[] = [
  {
    description:
      'Clean lighting, a simple setting, and generous negative space.',
    guidance:
      'Use controlled studio lighting, a clean setting, and generous negative space.',
    id: 'minimal-studio',
    label: 'Minimal studio',
    mediaTypes: ['image', 'video'],
  },
  {
    description:
      'Keeps the product clear, credible, and visually dominant.',
    guidance:
      'Keep the product clear, credible, and visually dominant.',
    id: 'product-led',
    label: 'Product-led',
    mediaTypes: ['image', 'video'],
  },
  {
    description:
      'Bold shapes, deliberate color, and campaign-ready composition.',
    guidance:
      'Use bold graphic shapes, deliberate color, and a campaign-ready composition with clear copy-safe space.',
    id: 'brand-graphic',
    label: 'Brand graphic',
    mediaTypes: ['image', 'video'],
  },
  {
    description:
      'Conceptual editorial artwork with a clear visual idea.',
    guidance:
      'Use a conceptual editorial illustration with a clear visual idea and publication-quality composition.',
    id: 'editorial-illustration',
    label: 'Editorial illustration',
    mediaTypes: ['image'],
  },
  {
    description:
      'Believable real-world context with natural light and materials.',
    guidance:
      'Use believable real-world context, natural lighting, and photorealistic materials.',
    id: 'photoreal-lifestyle',
    label: 'Photoreal lifestyle',
    mediaTypes: ['image', 'video'],
  },
  {
    description:
      'Premium lighting, depth, and a polished cinematic tone.',
    guidance:
      'Use cinematic lighting, depth, and a premium visual tone.',
    id: 'cinematic',
    label: 'Cinematic',
    mediaTypes: ['image', 'video'],
  },
  {
    description:
      'Informal handheld movement with authentic social-video energy.',
    guidance:
      'Use an informal handheld phone-camera treatment with natural movement and social-video energy.',
    id: 'handheld-ugc',
    label: 'Handheld UGC',
    mediaTypes: ['video'],
  },
  {
    description:
      'Graphic motion, quick transitions, and abstract product forms.',
    guidance:
      'Use bold graphic motion, quick transitions, and product-inspired abstract forms.',
    id: 'kinetic-graphic',
    label: 'Kinetic graphic',
    mediaTypes: ['video'],
  },
  {
    description:
      'Approachable dimensional illustration with playful materials.',
    guidance:
      'Use approachable dimensional illustration, stylized materials, and playful forms.',
    id: 'playful-3d',
    label: 'Playful 3D',
    mediaTypes: ['image', 'video'],
  },
  {
    description:
      'Structured isometric artwork inspired by technical systems.',
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
