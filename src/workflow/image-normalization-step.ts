import {z} from 'zod'

import type {ImageNormalizer} from '../media/image-normalizer.js'
import type {WorkflowStepHandler} from './workflow-module.js'
import {resolveWithinGeneration} from './workflow-path.js'

const imageNormalizationInputSchema = z.object({
  height: z.number().int().positive(),
  output: z.object({
    id: z.string().min(1),
    path: z.string().min(1),
  }),
  sourceArtifactId: z.string().min(1),
  width: z.number().int().positive(),
})

export function createImageNormalizationStepHandler(
  dependencies: {
    generationDirectory: string
    imageNormalizer: ImageNormalizer
  },
): WorkflowStepHandler {
  return {
    async execute(rawInput, context) {
      const input = imageNormalizationInputSchema.parse(rawInput)
      const source = context.dependencyArtifacts.find(
        (artifact) => artifact.id === input.sourceArtifactId,
      )
      if (source === undefined) {
        throw new Error(
          `Workflow artifact "${input.sourceArtifactId}" is unavailable`,
        )
      }
      if (!source.mediaType?.startsWith('image/')) {
        throw new Error(
          `Workflow artifact "${input.sourceArtifactId}" must be an image`,
        )
      }
      await dependencies.imageNormalizer.normalize({
        height: input.height,
        inputPath: resolveWithinGeneration(
          dependencies.generationDirectory,
          source.path,
        ),
        outputPath: resolveWithinGeneration(
          dependencies.generationDirectory,
          input.output.path,
        ),
        width: input.width,
      })
      return {
        artifacts: [
          {
            disposition: 'working',
            id: input.output.id,
            mediaType: 'image/png',
            path: input.output.path,
          },
        ],
      }
    },
    kind: 'image-normalize',
  }
}
