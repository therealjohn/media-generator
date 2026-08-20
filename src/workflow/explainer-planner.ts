import {z} from 'zod'

import type {
  StructuredModelDeployment,
  StructuredModelRuntime,
} from '../model-runtime/structured-model-runtime.js'

export interface ExplainerScenePlan {
  ambientAudio: string
  durationSeconds: number
  id: string
  motion: string
  narration: string
  negative: string
  scene: string
}

export interface ExplainerPlan {
  scenes: ExplainerScenePlan[]
  title: string
  visualBible: string
}

export interface ExplainerPlanningInput {
  aspectRatio: '16:9' | '9:16'
  clipDurationsSeconds: number[]
  creativeBrief: string
  deployment: StructuredModelDeployment
  preset: {
    guidance: string
    title: string
  }
  targetDurationSeconds: number
  textContext: string
}

export interface ExplainerPlanner {
  plan(input: ExplainerPlanningInput): Promise<ExplainerPlan>
}

export const explainerScenePlanSchema = z.object({
  ambientAudio: z.string().trim().min(1),
  durationSeconds: z.number().int().positive(),
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/i),
  motion: z.string().trim().min(1),
  narration: z.string().trim().min(1),
  negative: z.string().trim().min(1),
  scene: z.string().trim().min(1),
})
export const explainerPlanSchema = z.object({
  scenes: z.array(explainerScenePlanSchema).min(1),
  title: z.string().trim().min(1),
  visualBible: z.string().trim().min(1),
})

const planJsonSchema = {
  additionalProperties: false,
  properties: {
    scenes: {
      items: {
        additionalProperties: false,
        properties: {
          ambientAudio: {type: 'string'},
          durationSeconds: {type: 'integer'},
          id: {
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$',
            type: 'string',
          },
          motion: {type: 'string'},
          narration: {type: 'string'},
          negative: {type: 'string'},
          scene: {type: 'string'},
        },
        required: [
          'ambientAudio',
          'durationSeconds',
          'id',
          'motion',
          'narration',
          'negative',
          'scene',
        ],
        type: 'object',
      },
      minItems: 1,
      type: 'array',
    },
    title: {type: 'string'},
    visualBible: {type: 'string'},
  },
  required: ['scenes', 'title', 'visualBible'],
  type: 'object',
} satisfies Record<string, unknown>

export function createExplainerPlanner(dependencies: {
  structuredRuntime: StructuredModelRuntime
}): ExplainerPlanner {
  return {
    async plan(input) {
      const basePrompt = planningPrompt(input)
      let validationError = ''

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await dependencies.structuredRuntime.generate({
          adapter: input.deployment.adapter,
          apiKey: input.deployment.apiKey,
          deploymentName: input.deployment.deploymentName,
          endpoint: input.deployment.endpoint,
          jsonSchema: planJsonSchema,
          modelName: input.deployment.model,
          projectEndpoint: input.deployment.projectEndpoint,
          prompt:
            attempt === 0
              ? basePrompt
              : [
                  basePrompt,
                  '',
                  `The prior response was invalid: ${validationError}`,
                  `Return a corrected plan whose scene durations use only the allowed values and total exactly ${input.targetDurationSeconds} seconds.`,
                ].join('\n'),
          schemaName: 'explainer_plan',
          systemPrompt:
            'You plan coherent narrated explainer videos and return only schema-valid JSON.',
        })
        const parsed = explainerPlanSchema.safeParse(result.value)
        if (!parsed.success) {
          validationError = z.prettifyError(parsed.error)
          continue
        }
        const semanticError = validatePlan(parsed.data, input)
        if (semanticError === undefined) {
          return parsed.data
        }
        validationError = semanticError
      }

      throw new Error(
        `Explainer planner returned an invalid plan: ${validationError}`,
      )
    },
  }
}

function planningPrompt(input: ExplainerPlanningInput): string {
  return [
    'Create a scene-by-scene plan for a narrated explainer video.',
    `Creative Brief: ${input.creativeBrief}`,
    `Visual Preset: ${input.preset.title}. ${input.preset.guidance}`,
    `Aspect ratio: ${input.aspectRatio}.`,
    `Allowed clip durations: ${input.clipDurationsSeconds.join(', ')} seconds.`,
    `The scene durations must total exactly ${input.targetDurationSeconds} seconds.`,
    'Use shorter clips only when the subject benefits from a distinct visual beat.',
    'Each scene must include a fresh scene description, motivated motion, ambient audio, narration, and negative guidance.',
    'Keep narration at or below 150 words per minute so it fits without truncation.',
    'The video model will receive narration separately, so prohibit spoken dialogue, lip-sync, captions, and on-screen text in every scene negative.',
    'Write concise narration that fits naturally within each scene duration.',
    input.textContext.length === 0
      ? 'No additional Text Reference context was supplied.'
      : `Text Reference context:\n${input.textContext}`,
  ].join('\n')
}

function validatePlan(
  plan: ExplainerPlan,
  input: ExplainerPlanningInput,
): string | undefined {
  const ids = new Set<string>()
  let total = 0
  for (const scene of plan.scenes) {
    if (ids.has(scene.id)) {
      return `Scene id "${scene.id}" is duplicated`
    }
    ids.add(scene.id)
    if (
      !input.clipDurationsSeconds.includes(scene.durationSeconds)
    ) {
      return `Scene "${scene.id}" uses unsupported duration ${scene.durationSeconds}`
    }
    total += scene.durationSeconds
  }
  if (total !== input.targetDurationSeconds) {
    return `Scene durations total ${total}, expected ${input.targetDurationSeconds}`
  }
  return undefined
}
