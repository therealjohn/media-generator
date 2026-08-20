import {z} from 'zod'

import type {MediaComposer} from '../media/media-composer.js'
import type {WorkflowStepHandler} from './workflow-module.js'
import {resolveWithinGeneration} from './workflow-path.js'

const compositionInputSchema = z.object({
  height: z.number().int().positive(),
  output: z.object({
    id: z.string().min(1),
    path: z.string().min(1),
  }),
  scenes: z
    .array(
      z.object({
        durationSeconds: z.number().int().positive(),
        id: z.string().min(1),
        narration: z.string(),
        narrationArtifactId: z.string().min(1).optional(),
        videoArtifactId: z.string().min(1),
      }),
    )
    .min(1),
  subtitlePath: z.string().min(1).optional(),
  subtitles: z.boolean(),
  width: z.number().int().positive(),
})

export function createMediaCompositionStepHandler(dependencies: {
  composer: MediaComposer
  generationDirectory: string
}): WorkflowStepHandler {
  return {
    async execute(rawInput, context) {
      const input = compositionInputSchema.parse(rawInput)
      const outputPath = resolveWithinGeneration(
        dependencies.generationDirectory,
        input.output.path,
      )
      const result = await dependencies.composer.compose({
        height: input.height,
        outputPath,
        scenes: input.scenes.map((scene) => ({
          durationSeconds: scene.durationSeconds,
          id: scene.id,
          narration: scene.narration,
          ...(scene.narrationArtifactId === undefined
            ? {}
            : {
                narrationPath: resolveArtifact(
                  dependencies.generationDirectory,
                  context.dependencyArtifacts,
                  scene.narrationArtifactId,
                  'audio/',
                ),
              }),
          videoPath: resolveArtifact(
            dependencies.generationDirectory,
            context.dependencyArtifacts,
            scene.videoArtifactId,
            'video/',
          ),
        })),
        ...(input.subtitlePath === undefined
          ? {}
          : {
              subtitlePath: resolveWithinGeneration(
                dependencies.generationDirectory,
                input.subtitlePath,
              ),
            }),
        subtitles: input.subtitles,
        width: input.width,
      })
      return {
        artifacts: [
          {
            disposition: 'output',
            id: input.output.id,
            mediaType: result.mediaType,
            path: input.output.path,
          },
        ],
        output: {durationSeconds: result.durationSeconds},
      }
    },
    kind: 'media-compose',
  }
}

function resolveArtifact(
  generationDirectory: string,
  artifacts: Array<{
    id: string
    mediaType?: string
    path: string
  }>,
  id: string,
  expectedMediaPrefix: string,
): string {
  const artifact = artifacts.find((candidate) => candidate.id === id)
  if (artifact === undefined) {
    throw new Error(`Workflow artifact "${id}" is unavailable`)
  }
  if (!artifact.mediaType?.startsWith(expectedMediaPrefix)) {
    throw new Error(
      `Workflow artifact "${id}" must have media type ${expectedMediaPrefix}*`,
    )
  }
  return resolveWithinGeneration(generationDirectory, artifact.path)
}
