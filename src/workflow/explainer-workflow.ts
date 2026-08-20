import {z} from 'zod'

import {
  explainerPlanSchema,
  type ExplainerPlan,
  type ExplainerScenePlan,
} from './explainer-planner.js'
import type {ModelPromptFactory} from './model-generation-step.js'
import type {
  WorkflowDefinition,
  WorkflowStepSpec,
} from './workflow-module.js'

const textReferenceSchema = z.object({
  format: z.enum(['markdown', 'text']),
  path: z.string().min(1),
  title: z.string().min(1),
})

export const explainerWorkflowRequestSchema = z.object({
  aspectRatio: z.enum(['16:9', '9:16']),
  clipDurationsSeconds: z.array(z.number().int().positive()).min(1),
  creativeBrief: z.string().trim().min(1),
  durationSeconds: z.number().int().min(15).max(600),
  narration: z.string().trim().min(1).optional(),
  preset: z.object({
    guidance: z.string().trim().min(1),
    id: z.string().min(1),
    title: z.string().min(1),
  }),
  sourceImagePaths: z.array(z.string().min(1)),
  subtitles: z.boolean(),
  textReferences: z.array(textReferenceSchema),
  voiceId: z.string().min(1).optional(),
  webReferenceUrls: z.array(z.url()),
})

export type ExplainerWorkflowRequest = z.infer<
  typeof explainerWorkflowRequestSchema
>

export function createExplainerWorkflowDefinition(): WorkflowDefinition<
  ExplainerWorkflowRequest,
  ExplainerPlan
> {
  return {
    build: buildExplainerGraph,
    id: 'explainer-video',
    prepare: (request) => ({
      dependsOn: [],
      id: 'plan',
      input: request,
      kind: 'explainer-plan',
    }),
    preparedSchema: explainerPlanSchema,
    requestSchema: explainerWorkflowRequestSchema,
    version: 2,
  }
}

export function createExplainerPromptFactories(): ModelPromptFactory[] {
  return [
    {
      assemble(data) {
        const input = z
          .object({
            creativeBrief: z.string().min(1),
            presetGuidance: z.string().min(1),
            visualBible: z.string().min(1),
          })
          .parse(data)
        return [
          'Create one reusable visual style reference image for a multi-scene explainer video.',
          `Creative Brief: ${input.creativeBrief}`,
          `Selected Preset: ${input.presetGuidance}`,
          `Visual bible: ${input.visualBible}`,
          'Create a clean style board with representative materials, line treatment, palette, lighting, and character design.',
          'Do not compose a video scene or imply a starting frame.',
          'Do not include captions, labels, logos, or interface text.',
        ].join('\n')
      },
      kind: 'explainer-reference',
    },
    {
      assemble(data) {
        const input = z
          .object({
            presetGuidance: z.string().min(1),
            scene: explainerPlanSchema.shape.scenes.element,
            visualBible: z.string().min(1),
          })
          .parse(data)
        const scene = input.scene
        return [
          'STYLE REFERENCE (look only — NOT the first frame): The attached image is a STYLE reference, not a start/keyframe. Do NOT open the video on it, do NOT reproduce or animate the reference image itself.',
          `Copy ONLY its rendering style: ${input.presetGuidance} ${input.visualBible}`,
          'The first frame must be the SCENE below, drawn or rendered fresh in that exact style.',
          `SCENE: ${scene.scene}`,
          `MOTION: ${scene.motion}`,
          `AUDIO: ${scene.ambientAudio} — no voice.`,
          [
            `NEGATIVE: ${scene.negative}`,
            'opening on the reference image',
            'first frame showing the style reference',
            'reproducing the reference image as a frame',
            'unmotivated horizontal drift',
            'color or style drift',
            'lip-sync',
            'captions',
            'on-screen text',
            'watermark',
            'freeze frame',
            'static hold at the start or end',
          ].join(', '),
        ].join('\n')
      },
      kind: 'explainer-scene',
    },
    {
      assemble(data) {
        return z
          .object({narration: z.string().trim().min(1)})
          .parse(data).narration
      },
      kind: 'explainer-voice',
    },
  ]
}

function buildExplainerGraph(
  plan: ExplainerPlan,
  request: ExplainerWorkflowRequest,
): WorkflowStepSpec[] {
  const vertical = request.aspectRatio === '9:16'
  const width = vertical ? 720 : 1280
  const height = vertical ? 1280 : 720
  const steps: WorkflowStepSpec[] = [
    {
      concurrencyKey: 'reference-image',
      dependsOn: ['plan'],
      id: 'reference-image',
      input: {
        controls: {height, width},
        output: {
          basePath: 'working/reference/style',
          disposition: 'working',
          id: 'style-reference-source',
        },
        prompt: {
          data: {
            creativeBrief: request.creativeBrief,
            presetGuidance: request.preset.guidance,
            visualBible: plan.visualBible,
          },
          kind: 'explainer-reference',
        },
        referencePaths: request.sourceImagePaths,
        role: 'reference-image',
      },
      kind: 'model-generate',
    },
    {
      dependsOn: ['reference-image'],
      id: 'normalize-reference-image',
      input: {
        height,
        output: {
          id: 'style-reference',
          path: 'working/reference/style-sora.png',
        },
        sourceArtifactId: 'style-reference-source',
        width,
      },
      kind: 'image-normalize',
    },
  ]

  for (const scene of plan.scenes) {
    steps.push(
      sceneVideoStep(
        scene,
        request,
        plan.visualBible,
        width,
        height,
      ),
    )
    if (request.voiceId !== undefined) {
      steps.push(sceneVoiceStep(scene, request.voiceId))
    }
  }

  steps.push({
    dependsOn: plan.scenes.flatMap((scene) => [
      `${scene.id}-video`,
      ...(request.voiceId === undefined
        ? []
        : [`${scene.id}-voice`]),
    ]),
    id: 'compose',
    input: {
      height,
      output: {
        id: 'final-video',
        path: 'outputs/explainer.mp4',
      },
      scenes: plan.scenes.map((scene) => ({
        durationSeconds: scene.durationSeconds,
        id: scene.id,
        narration: scene.narration,
        narrationArtifactId:
          request.voiceId === undefined
            ? undefined
            : `${scene.id}-voice`,
        videoArtifactId: `${scene.id}-video`,
      })),
      subtitlePath: 'working/subtitles/explainer.srt',
      subtitles: request.subtitles,
      width,
    },
    kind: 'media-compose',
  })
  return steps
}

function sceneVideoStep(
  scene: ExplainerScenePlan,
  request: ExplainerWorkflowRequest,
  visualBible: string,
  width: number,
  height: number,
): WorkflowStepSpec {
  return {
    concurrencyKey: 'visuals',
    dependsOn: ['normalize-reference-image'],
    id: `${scene.id}-video`,
    input: {
      controls: {
        height,
        nSeconds: scene.durationSeconds,
        nVariants: 1,
        width,
      },
      output: {
        basePath: `working/scenes/${scene.id}/video`,
        disposition: 'working',
        id: `${scene.id}-video`,
      },
      prompt: {
        data: {
          presetGuidance: request.preset.guidance,
          scene,
          visualBible,
        },
        kind: 'explainer-scene',
      },
      referenceArtifactIds: ['style-reference'],
      role: 'visuals',
    },
    kind: 'model-generate',
  }
}

function sceneVoiceStep(
  scene: ExplainerScenePlan,
  voiceId: string,
): WorkflowStepSpec {
  return {
    concurrencyKey: 'voice',
    dependsOn: ['plan'],
    id: `${scene.id}-voice`,
    input: {
      controls: {voice: voiceId},
      output: {
        basePath: `working/scenes/${scene.id}/voice`,
        disposition: 'working',
        id: `${scene.id}-voice`,
      },
      prompt: {
        data: {narration: scene.narration},
        kind: 'explainer-voice',
      },
      role: 'voice',
    },
    kind: 'model-generate',
  }
}
