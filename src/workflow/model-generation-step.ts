import {mkdir, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

import {z} from 'zod'

import {
  findModelDefinition,
} from '../catalog/models.js'
import type {GenerationDeployment} from '../generation/generation-module.js'
import {fingerprintReference} from '../generation/references.js'
import type {ModelRuntime} from '../model-runtime/model-runtime.js'
import type {
  WorkflowStepHandler,
  WorkflowStepResult,
} from './workflow-module.js'
import {resolveWithinGeneration} from './workflow-path.js'

export interface ModelPromptFactory {
  assemble(data: unknown): string
  kind: string
}

const modelGenerationInputSchema = z.object({
  controls: z.record(z.string(), z.unknown()),
  output: z.object({
    basePath: z.string().min(1),
    disposition: z.enum(['output', 'working']),
    id: z.string().min(1),
  }),
  prompt: z.object({
    data: z.unknown(),
    kind: z.string().min(1),
  }),
  referenceArtifactIds: z.array(z.string().min(1)).default([]),
  referencePaths: z.array(z.string().min(1)).default([]),
  role: z.string().min(1),
})

export function createModelGenerationStepHandler(
  dependencies: {
    deployments: Record<string, GenerationDeployment>
    generationDirectory: string
    modelRuntime: ModelRuntime
    promptFactories: ModelPromptFactory[]
  },
): WorkflowStepHandler {
  const promptFactories = new Map(
    dependencies.promptFactories.map((factory) => [
      factory.kind,
      factory,
    ]),
  )

  return {
    async execute(rawInput, context): Promise<WorkflowStepResult> {
      const input = modelGenerationInputSchema.parse(rawInput)
      const deployment = dependencies.deployments[input.role]
      if (deployment === undefined) {
        throw new Error(
          `No deployment is available for workflow role "${input.role}"`,
        )
      }
      const promptFactory = promptFactories.get(input.prompt.kind)
      if (promptFactory === undefined) {
        throw new Error(
          `Model prompt factory "${input.prompt.kind}" is not available`,
        )
      }
      const dependencyReferencePaths =
        input.referenceArtifactIds.map((artifactId) => {
          const artifact = context.dependencyArtifacts.find(
            (candidate) => candidate.id === artifactId,
          )
          if (artifact === undefined) {
            throw new Error(
              `Workflow reference artifact "${artifactId}" is unavailable`,
            )
          }
          return resolveWithinGeneration(
            dependencies.generationDirectory,
            artifact.path,
          )
        })
      const referencePaths = [
        ...input.referencePaths,
        ...dependencyReferencePaths,
      ]
      const references = await Promise.all(
        referencePaths.map((path) => fingerprintReference(path)),
      )
      validateReferences(deployment, references)
      const prompt = promptFactory.assemble(input.prompt.data)
      if (prompt.trim().length === 0) {
        throw new Error(
          `Model prompt factory "${input.prompt.kind}" returned an empty prompt`,
        )
      }
      const result = await dependencies.modelRuntime.generate({
        adapter: deployment.adapter,
        apiKey: deployment.apiKey,
        controls: input.controls,
        deploymentName: deployment.deploymentName,
        endpoint: deployment.endpoint,
        modelName: deployment.model,
        projectEndpoint: deployment.projectEndpoint,
        prompt,
        references,
      })
      if (result.outputs.length !== 1) {
        throw new Error(
          `Workflow model step "${input.output.id}" expected one output but received ${result.outputs.length}`,
        )
      }
      const output = result.outputs[0]!
      const relativePath = `${input.output.basePath}${output.extension}`
      const absolutePath = resolveWithinGeneration(
        dependencies.generationDirectory,
        relativePath,
      )
      await mkdir(dirname(absolutePath), {recursive: true})
      await writeFile(absolutePath, output.contents)
      return {
        artifacts: [
          {
            disposition: input.output.disposition,
            id: input.output.id,
            mediaType: output.mediaType,
            path: relativePath,
          },
        ],
        output: {jobId: result.jobId},
      }
    },
    kind: 'model-generate',
  }
}

function validateReferences(
  deployment: GenerationDeployment,
  references: Array<{mediaType: string}>,
): void {
  if (deployment.adapter === 'mai-voice') {
    if (references.length > 0) {
      throw new Error('MAI Voice does not accept Reference Assets')
    }
    return
  }
  const definition = findModelDefinition(deployment.model)
  if (definition === undefined) {
    throw new Error(`Model "${deployment.model}" is not supported`)
  }
  if (references.length > definition.capabilities.maxReferences) {
    throw new Error(
      `Model "${deployment.model}" accepts at most ${definition.capabilities.maxReferences} references`,
    )
  }
  if (
    references.some((reference) =>
      reference.mediaType.startsWith('image/'),
    ) &&
    !definition.capabilities.acceptsImageReferences
  ) {
    throw new Error(
      `Model "${deployment.model}" does not accept image references`,
    )
  }
  if (
    references.some((reference) =>
      reference.mediaType.startsWith('video/'),
    ) &&
    !definition.capabilities.acceptsVideoReferences
  ) {
    throw new Error(
      `Model "${deployment.model}" does not accept video references`,
    )
  }
}
