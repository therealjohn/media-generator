import {z} from 'zod'

import rawCatalog from './model-profiles.json' with {type: 'json'}

export type ModelAdapterKind =
  | 'azure-openai-chat'
  | 'azure-openai-image'
  | 'bfl-flux'
  | 'mai-image'
  | 'mai-voice'
  | 'sora-video'

export type MediaType = 'image' | 'video'
export type ModelMediaType = MediaType | 'audio' | 'text'

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
  video?: VideoModelProfile
}

export interface VideoModelProfile {
  clipDurationsSeconds: number[]
  explainerDurationPresetsSeconds: number[]
  manualDuration: {
    maxSeconds: number
    minSeconds: number
  }
  maxConcurrentRequests: number
  preferredClipSeconds: number
}

export interface VoiceDefinition {
  id: string
  label: string
  model: 'MAI-Voice-2'
}

const positiveInteger = z.number().int().positive()
const modelCapabilitiesSchema = z.object({
  acceptsImageReferences: z.boolean(),
  acceptsVideoReferences: z.boolean(),
  maxReferences: z.number().int().nonnegative(),
  supportsEditing: z.boolean(),
  supportsTextGeneration: z.boolean(),
})
const videoModelProfileSchema = z.object({
  clipDurationsSeconds: z.array(positiveInteger).min(1),
  explainerDurationPresetsSeconds: z.array(positiveInteger).min(1),
  manualDuration: z.object({
    maxSeconds: positiveInteger,
    minSeconds: positiveInteger,
  }),
  maxConcurrentRequests: positiveInteger,
  preferredClipSeconds: positiveInteger,
})
const modelDefinitionSchema = z.object({
  adapter: z.enum([
    'azure-openai-chat',
    'azure-openai-image',
    'bfl-flux',
    'mai-image',
    'sora-video',
  ]),
  capabilities: modelCapabilitiesSchema,
  mediaType: z.enum(['audio', 'image', 'text', 'video']),
  modelName: z.string().min(1),
  video: videoModelProfileSchema.optional(),
})
const voiceDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  model: z.literal('MAI-Voice-2'),
})
const catalogSchema = z.object({
  models: z.array(modelDefinitionSchema),
  schemaVersion: z.literal(1),
  voices: z.array(voiceDefinitionSchema),
})

const catalog = catalogSchema.parse(rawCatalog)
const definitions: ModelDefinition[] = catalog.models
const voices: VoiceDefinition[] = catalog.voices

for (const definition of definitions) {
  if (definition.mediaType === 'video' && definition.video === undefined) {
    throw new Error(
      `Video model "${definition.modelName}" is missing video capabilities`,
    )
  }
  if (definition.video !== undefined) {
    validateVideoProfile(definition.modelName, definition.video)
  }
}

export function findModelDefinition(
  modelName: string,
): ModelDefinition | undefined {
  const normalized = modelName.toLowerCase()
  const exact = definitions.find(
    (definition) =>
      definition.modelName.toLowerCase() === normalized,
  )
  if (exact !== undefined) {
    return exact
  }
  return definitions.find((definition) => {
    const canonical = definition.modelName.toLowerCase()
    if (!normalized.startsWith(`${canonical}-`)) {
      return false
    }
    const suffix = normalized.slice(canonical.length + 1)
    return /^\d{4}-\d{2}-\d{2}$/.test(suffix)
  })
}

export function listModelDefinitions(): readonly ModelDefinition[] {
  return definitions
}

export function getVideoModelProfile(
  modelName: string,
): VideoModelProfile {
  const definition = findModelDefinition(modelName)
  if (definition?.video === undefined) {
    throw new Error(
      `Model "${modelName}" does not define video capabilities`,
    )
  }
  return definition.video
}

export function listVoiceDefinitions(): readonly VoiceDefinition[] {
  return voices
}

export function resolveExplainerDuration(
  modelName: string,
  requestedSeconds: number,
): number {
  const profile = getVideoModelProfile(modelName)
  if (
    !Number.isInteger(requestedSeconds) ||
    requestedSeconds < profile.manualDuration.minSeconds ||
    requestedSeconds > profile.manualDuration.maxSeconds
  ) {
    throw new Error(
      `Explainer duration must be between ${profile.manualDuration.minSeconds} and ${profile.manualDuration.maxSeconds} seconds`,
    )
  }

  const achievable = listComposableExplainerDurations(modelName)
  const nearest = [...achievable].sort((left, right) => {
    const leftDistance = Math.abs(left - requestedSeconds)
    const rightDistance = Math.abs(right - requestedSeconds)
    return (
      leftDistance - rightDistance ||
      Number(right >= requestedSeconds) -
        Number(left >= requestedSeconds) ||
      left - right
    )
  })[0]
  if (nearest === undefined) {
    throw new Error(
      `Model "${modelName}" cannot compose an Explainer duration`,
    )
  }
  return nearest
}

export function listComposableExplainerDurations(
  modelName: string,
): number[] {
  const profile = getVideoModelProfile(modelName)
  return achievableDurations(profile).filter(
    (duration) =>
      duration >= profile.manualDuration.minSeconds &&
      duration <= profile.manualDuration.maxSeconds,
  )
}

export function defaultClipSchedule(
  modelName: string,
  totalSeconds: number,
): number[] {
  const profile = getVideoModelProfile(modelName)
  if (
    !Number.isInteger(totalSeconds) ||
    totalSeconds <= 0 ||
    totalSeconds > profile.manualDuration.maxSeconds
  ) {
    throw new Error(
      `Explainer duration ${totalSeconds} is invalid for "${modelName}"`,
    )
  }
  const durations = [
    profile.preferredClipSeconds,
    ...profile.clipDurationsSeconds
      .filter(
        (duration) => duration !== profile.preferredClipSeconds,
      )
      .sort((left, right) => right - left),
  ]
  const memo = new Map<number, number[] | null>()

  function schedule(remaining: number): number[] | null {
    if (remaining === 0) {
      return []
    }
    const cached = memo.get(remaining)
    if (cached !== undefined) {
      return cached
    }
    for (const duration of durations) {
      if (duration > remaining) {
        continue
      }
      const rest = schedule(remaining - duration)
      if (rest !== null) {
        const result = [duration, ...rest]
        memo.set(remaining, result)
        return result
      }
    }
    memo.set(remaining, null)
    return null
  }

  const result = schedule(totalSeconds)
  if (result === null) {
    throw new Error(
      `Model "${modelName}" cannot compose ${totalSeconds} seconds`,
    )
  }
  return result
}

function achievableDurations(
  profile: VideoModelProfile,
): number[] {
  const achievable = new Set([0])
  for (
    let total = 1;
    total <= profile.manualDuration.maxSeconds;
    total += 1
  ) {
    if (
      profile.clipDurationsSeconds.some((duration) =>
        achievable.has(total - duration),
      )
    ) {
      achievable.add(total)
    }
  }
  return [...achievable].filter((duration) => duration > 0)
}

function validateVideoProfile(
  modelName: string,
  profile: VideoModelProfile,
): void {
  if (
    profile.manualDuration.minSeconds >
    profile.manualDuration.maxSeconds
  ) {
    throw new Error(
      `Video model "${modelName}" has an invalid manual duration range`,
    )
  }
  if (
    !profile.clipDurationsSeconds.includes(
      profile.preferredClipSeconds,
    )
  ) {
    throw new Error(
      `Video model "${modelName}" preferred clip duration is unsupported`,
    )
  }
  for (const preset of profile.explainerDurationPresetsSeconds) {
    defaultClipSchedule(modelName, preset)
  }
}
