import {z} from 'zod'
import {extname} from 'node:path'

import type {
  MediaType,
  ModelMediaType,
} from './models.js'
import type {TextReferenceInput} from '../generation/text-reference.js'

export type ScenarioId = 'explainer-video' | 'short-form-video'

export interface ScenarioPresetDefinition {
  description: string
  id: string
  title: string
}

export interface ScenarioProductionOptionDefinition {
  description: string
  id: string
  required: boolean
  type: 'boolean' | 'integer' | 'string'
}

export interface ScenarioDefinition {
  description: string
  id: ScenarioId
  mediaType: MediaType
  optionalRoutingRoles?: readonly string[]
  presets: readonly ScenarioPresetDefinition[]
  productionOptions: readonly ScenarioProductionOptionDefinition[]
  roleMediaTypes: Readonly<Record<string, ModelMediaType>>
  routingRoles: readonly string[]
  title: string
}

export type ScenarioCreateRequest =
  | {
      creativeBrief: string
      deploymentOverrides: Record<string, string>
      kind: 'scenario'
      options: {
        'aspect-ratio': '16:9' | '9:16'
        duration: number
        narration?: string
        subtitles: boolean
        voice?: string
      }
      preset: string
      scenario: 'explainer-video'
      sourcePaths: string[]
      textReferences?: TextReferenceInput[]
      webReferenceUrls?: string[]
    }
  | {
      creativeBrief: string
      deploymentOverrides: Record<string, string>
      kind: 'scenario'
      options: {
        'clip-count': number
        'clip-duration': number
        language: string
        orientation: 'horizontal' | 'vertical'
        subtitles: boolean
      }
      preset: string
      scenario: 'short-form-video'
      sourcePaths: [string]
      textReferences?: TextReferenceInput[]
      webReferenceUrls?: string[]
    }

const explainerVideo: ScenarioDefinition = {
  description:
    'Create a visual explanation with optional narration from a topic or source material.',
  id: 'explainer-video',
  mediaType: 'video',
  optionalRoutingRoles: ['voice'],
  presets: [
    preset(
      'editorial-motion-graphics',
      'Editorial motion graphics',
      'Editorial collage and graphic motion.',
    ),
    preset(
      'stickman-cartoon',
      'Stickman cartoon',
      'Simple hand-drawn characters and visual storytelling.',
    ),
    preset(
      'watercolor-chronicle',
      'Watercolor chronicle',
      'Soft painted scenes with an illustrated narrative.',
    ),
    preset(
      'colorful-3d',
      'Colorful 3D',
      'Bright dimensional characters and environments.',
    ),
    preset(
      'hand-drawn',
      'Hand drawn',
      'Loose monochrome drawing and animated line work.',
    ),
    preset(
      'poster-vector',
      'Poster vector',
      'Bold vector shapes and poster-like composition.',
    ),
  ],
  productionOptions: [
    option(
      'voice',
      'Optional narration voice. Leave disabled to create visuals only.',
      'string',
    ),
    option('subtitles', 'Burn subtitles into the output.', 'boolean'),
    option('duration', 'Target duration in seconds.', 'integer'),
    option('aspect-ratio', 'Output aspect ratio.', 'string'),
  ],
  roleMediaTypes: {
    visuals: 'video',
    voice: 'audio',
  },
  routingRoles: ['visuals', 'voice'],
  title: 'Explainer video',
}

const shortFormVideo: ScenarioDefinition = {
  description:
    'Turn one source video into one or more styled short-form clips.',
  id: 'short-form-video',
  mediaType: 'video',
  presets: [
    preset('bold-urban', 'Bold urban', 'Bold captions and urban graphics.'),
    preset(
      'green-contrast',
      'Green contrast',
      'High-contrast framing and graphic overlays.',
    ),
    preset(
      'urban-serenity',
      'Urban serenity',
      'Calm typography with geometric accents.',
    ),
    preset('warm-glow', 'Warm glow', 'Warm color and illustrated accents.'),
    preset(
      'yellow-frame',
      'Yellow frame',
      'Framed presenter layout with highlighted captions.',
    ),
    preset(
      'monochrome-vibes',
      'Monochrome vibes',
      'Black-and-white treatment with restrained type.',
    ),
    preset(
      'marker-scribble',
      'Marker scribble',
      'Hand-drawn marker annotations and emphasis.',
    ),
    preset(
      'sticker-type',
      'Sticker type',
      'Sticker-like captions and playful graphic callouts.',
    ),
  ],
  productionOptions: [
    option('language', 'Source language or auto detection.', 'string'),
    option('subtitles', 'Add styled subtitles.', 'boolean'),
    option('orientation', 'Vertical or horizontal output.', 'string'),
    option('clip-count', 'Number of clips to create.', 'integer'),
    option('clip-duration', 'Target duration per clip.', 'integer'),
  ],
  roleMediaTypes: {
    video: 'video',
  },
  routingRoles: ['video'],
  title: 'Short-form video',
}

const definitions = [explainerVideo, shortFormVideo] as const

const explainerRequestSchema = z.object({
  creativeBrief: z.string().trim().min(1),
  deploymentOverrides: z.record(z.string(), z.string()).default({}),
  options: z.preprocess(
    (value) => value ?? {},
    z.object({
      'aspect-ratio': z.enum(['16:9', '9:16']).default('16:9'),
      duration: z.number().int().min(5).max(12).default(12),
      narration: z.string().optional(),
      subtitles: z.boolean().default(true),
      voice: z.string().min(1).optional(),
    }),
  ),
  preset: z.string().min(1).default('editorial-motion-graphics'),
  sourcePaths: z.array(z.string()).default([]),
  textReferences: z
    .array(
      z.object({
        content: z.string(),
        format: z.enum(['markdown', 'text']),
        title: z.string().optional(),
      }),
    )
    .optional(),
  webReferenceUrls: z.array(z.string()).optional(),
})

const shortFormRequestSchema = z.object({
  creativeBrief: z.string().trim().default(''),
  deploymentOverrides: z.record(z.string(), z.string()).default({}),
  options: z.preprocess(
    (value) => value ?? {},
    z.object({
      'clip-count': z.number().int().min(1).max(4).default(1),
      'clip-duration': z.number().int().min(5).max(12).default(8),
      language: z.string().min(1).default('auto'),
      orientation: z.enum(['horizontal', 'vertical']).default('vertical'),
      subtitles: z.boolean().default(true),
    }),
  ),
  preset: z.string().min(1).default('bold-urban'),
  sourcePaths: z.array(z.string()),
  textReferences: z
    .array(
      z.object({
        content: z.string(),
        format: z.enum(['markdown', 'text']),
        title: z.string().optional(),
      }),
    )
    .optional(),
  webReferenceUrls: z.array(z.string()).optional(),
})

export function getScenarioDefinition(
  id: string,
): ScenarioDefinition | undefined {
  return definitions.find((definition) => definition.id === id)
}

export function listScenarioDefinitions(): readonly ScenarioDefinition[] {
  return definitions
}

export function parseScenarioRequest(
  id: string,
  input: unknown,
): ScenarioCreateRequest {
  const definition = getScenarioDefinition(id)
  if (definition === undefined) {
    throw new Error(`Scenario "${id}" is not built into Media Gen`)
  }

  if (id === 'explainer-video') {
    const request = explainerRequestSchema.parse(input)
    requirePreset(definition, request.preset)
    return {
      ...request,
      kind: 'scenario',
      scenario: 'explainer-video',
    }
  }

  const request = shortFormRequestSchema.parse(input)
  if (request.sourcePaths.length !== 1) {
    throw new Error('Short-form video requires exactly one source video')
  }
  if (
    !['.mov', '.mp4'].includes(
      extname(request.sourcePaths[0]!).toLowerCase(),
    )
  ) {
    throw new Error('Short-form video source must be an MP4 or MOV file')
  }
  requirePreset(definition, request.preset)
  return {
    ...request,
    kind: 'scenario',
    scenario: 'short-form-video',
    sourcePaths: [request.sourcePaths[0]!],
  }
}

export function assembleScenarioPrompt(
  request: ScenarioCreateRequest,
): string {
  const definition = getScenarioDefinition(request.scenario)!
  const selectedPreset = definition.presets.find(
    (presetDefinition) => presetDefinition.id === request.preset,
  )!
  if (request.scenario === 'explainer-video') {
    return [
      'Create a concise visual explainer video.',
      `Visual preset: ${selectedPreset.title}. ${selectedPreset.description}`,
      request.options.voice === undefined
        ? 'Do not add voice narration.'
        : `Narration voice request: ${request.options.voice}.`,
      request.options.subtitles
        ? 'Include clear burned-in subtitles.'
        : 'Do not include subtitles.',
      `Frame the result for ${request.options['aspect-ratio']}.`,
      `User creative brief: ${request.creativeBrief}`,
    ].join('\n')
  }

  return [
    'Create styled short-form video variants from the supplied source video.',
    `Visual preset: ${selectedPreset.title}. ${selectedPreset.description}`,
    `Use ${request.options.orientation} composition.`,
    request.options.subtitles
      ? 'Include prominent styled subtitles.'
      : 'Do not include subtitles.',
    `Source language: ${request.options.language}.`,
    request.creativeBrief.length > 0
      ? `User creative brief: ${request.creativeBrief}`
      : 'Select a strong self-contained moment from the source.',
  ].join('\n')
}

export function requiredScenarioRoles(
  scenario: ScenarioDefinition,
): string[] {
  const optionalRoles = new Set(
    scenario.optionalRoutingRoles ?? [],
  )
  return scenario.routingRoles.filter(
    (role) => !optionalRoles.has(role),
  )
}

export function scenarioRolesForRequest(
  request: ScenarioCreateRequest,
): string[] {
  const scenario = getScenarioDefinition(request.scenario)!
  const optionalRoles = new Set(
    scenario.optionalRoutingRoles ?? [],
  )
  return scenario.routingRoles.filter(
    (role) =>
      !optionalRoles.has(role) ||
      (request.scenario === 'explainer-video' &&
        role === 'voice' &&
        request.options.voice !== undefined),
  )
}

function option(
  id: string,
  description: string,
  type: ScenarioProductionOptionDefinition['type'],
): ScenarioProductionOptionDefinition {
  return {description, id, required: false, type}
}

function preset(
  id: string,
  title: string,
  description: string,
): ScenarioPresetDefinition {
  return {description, id, title}
}

function requirePreset(
  definition: ScenarioDefinition,
  presetId: string,
): void {
  if (!definition.presets.some((preset) => preset.id === presetId)) {
    throw new Error(
      `Preset "${presetId}" is not available for ${definition.title}`,
    )
  }
}
