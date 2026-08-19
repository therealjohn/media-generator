import {createHash} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import type {
  MediaType,
  ModelAdapterKind,
} from '../catalog/models.js'
import {findModelDefinition} from '../catalog/models.js'
import {assembleModelPrompt} from '../catalog/prompt-assembly.js'
import type {ModelRuntime} from '../model-runtime/model-runtime.js'
import {MediaGenError} from '../application/media-gen-error.js'
import {
  type GenerationOperation,
  type GenerationProgress,
  type GenerationScenario,
  type GenerationSelection,
  type GenerationRecord,
  type GenerationStore,
  type ResolvedResource,
} from './generation-store.js'
import {fingerprintReference} from './references.js'
import {
  formatReferenceContext,
  prepareTextReferences,
  type TextReferenceInput,
} from './text-reference.js'
import {
  normalizeWebReferences,
} from './web-reference.js'

export interface GenerateMediaInput {
  controls: Record<string, unknown>
  creativeBrief: string
  deployment: GenerationDeployment
  mediaType: MediaType
  operations?: GenerationOperation[]
  progress?: GenerationProgress
  prompt?: string
  referencePaths: string[]
  resolvedResources?: ResolvedResource[]
  scenario?: GenerationScenario | null
  selection: GenerationSelection
  sourceGenerations: string[]
  supplementalGenerations?: Array<{
    controls: Record<string, unknown>
    deployment: GenerationDeployment
    prompt: string
    role: string
  }>
  textReferences?: TextReferenceInput[]
  webReferenceUrls?: string[]
}

export interface GenerationDeployment {
  adapter: ModelAdapterKind
  apiKey?: string
  deploymentName: string
  endpoint?: string
  id: string
  model: string
  projectEndpoint: string
  provider: string
}

export interface GenerationModule {
  generate(input: GenerateMediaInput): Promise<GenerationRecord>
}

export interface GenerationModuleDependencies {
  modelRuntime: ModelRuntime
  store: GenerationStore
  workspacePath: string
}

export function createGenerationModule(
  dependencies: GenerationModuleDependencies,
): GenerationModule {
  return {
    async generate(input) {
      const references = await Promise.all(
        input.referencePaths.map((path) => fingerprintReference(path)),
      )
      const textReferences = prepareTextReferences(
        input.textReferences ?? [],
      )
      const webReferences = normalizeWebReferences(
        input.webReferenceUrls ?? [],
      )
      validateReferences(input.deployment.model, references)
      for (const supplemental of input.supplementalGenerations ?? []) {
        if (supplemental.deployment.adapter !== 'mai-voice') {
          validateReferences(supplemental.deployment.model, [])
        }
      }
      const record = await dependencies.store.create({
        creativeBrief: input.creativeBrief,
        mediaType: input.mediaType,
        operations: input.operations,
        progress: input.progress,
        references,
        resolvedModel: {
          deployment: input.deployment.deploymentName,
          id: input.deployment.id,
          model: input.deployment.model,
          provider: input.deployment.provider,
        },
        resolvedResources: input.resolvedResources,
        scenario: input.scenario,
        selection: input.selection,
        sourceGenerations: input.sourceGenerations,
        textReferences: textReferences.map(
          (reference) => reference.record,
        ),
        webReferences,
      })
      await dependencies.store.update(record.id, (current) => ({
        ...current,
        status: 'running',
      }))
      try {
        await Promise.all(
          textReferences.map(async (reference) => {
            const path = join(
              dependencies.workspacePath,
              'generations',
              record.id,
              reference.record.path,
            )
            await mkdir(join(path, '..'), {recursive: true})
            await writeFile(path, reference.content, 'utf8')
          }),
        )
        const basePrompt =
          input.prompt ??
          (input.selection.kind === 'generator'
            ? assembleModelPrompt({
                creativeBrief: input.creativeBrief,
                generator: input.selection.generator,
                style: input.selection.style,
              })
            : undefined)
        if (basePrompt === undefined) {
          throw new MediaGenError(
            'invalid_creation_plan',
            'Scenario creation requires a prepared Model Prompt',
          )
        }
        const referenceContext = formatReferenceContext({
          textReferences,
          webReferences,
        })
        const prompt =
          referenceContext.length === 0
            ? basePrompt
            : `${basePrompt}\n\n${referenceContext}`
        const [result, ...supplementalResults] = await Promise.all([
          dependencies.modelRuntime.generate({
            adapter: input.deployment.adapter,
            apiKey: input.deployment.apiKey,
            controls: input.controls,
            deploymentName: input.deployment.deploymentName,
            endpoint: input.deployment.endpoint,
            modelName: input.deployment.model,
            projectEndpoint: input.deployment.projectEndpoint,
            prompt,
            references,
          }),
          ...(input.supplementalGenerations ?? []).map(
            (supplemental) =>
              dependencies.modelRuntime.generate({
                adapter: supplemental.deployment.adapter,
                    apiKey: supplemental.deployment.apiKey,
                controls: supplemental.controls,
                deploymentName:
                  supplemental.deployment.deploymentName,
                endpoint: supplemental.deployment.endpoint,
                modelName: supplemental.deployment.model,
                projectEndpoint:
                  supplemental.deployment.projectEndpoint,
                prompt: supplemental.prompt,
                references: [],
              }),
          ),
        ])
        const providerOutputs = [
          ...result.outputs,
          ...supplementalResults.flatMap(
            (supplemental) => supplemental.outputs,
          ),
        ]
        const outputs = await Promise.all(
          providerOutputs.map(async (output, index) => {
            const relativePath = `outputs/output-${index + 1}${output.extension}`
            const absolutePath = join(
              dependencies.workspacePath,
              'generations',
              record.id,
              relativePath,
            )
            await mkdir(join(absolutePath, '..'), {recursive: true})
            await writeFile(absolutePath, output.contents)
            return {
              mediaType: output.mediaType,
              path: relativePath,
              sha256: createHash('sha256')
                .update(output.contents)
                .digest('hex'),
              size: output.contents.byteLength,
            }

          }),
        )

        return dependencies.store.update(record.id, (current) => ({
          ...current,
          operations: current.operations.map((operation) =>
            operation.status === 'running'
              ? {...operation, status: 'succeeded'}
              : operation,
          ),
          outputs,
          progress: {
            completed: current.progress.total,
            stage: 'succeeded',
            total: current.progress.total,
          },
          provider: {jobId: result.jobId},
          status: 'succeeded',
        }))
      } catch (error) {
        await dependencies.store.update(record.id, (current) => ({
          ...current,
          error: {
            code: 'generation_failed',
            message:
              error instanceof Error
                ? error.message
                : 'Generation failed',
          },
          operations: current.operations.map((operation) =>
            operation.status === 'running'
              ? {
                  ...operation,
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Generation failed',
                  status: 'failed',
                }
              : operation,
          ),
          progress: {
            ...current.progress,
            stage: 'failed',
          },
          status: 'failed',
        }))
        throw error
      }
    },
  }
}

function validateReferences(
  modelName: string,
  references: Array<{mediaType: string}>,
): void {
  const definition = findModelDefinition(modelName)
  if (definition === undefined) {
    throw new MediaGenError(
      'unsupported_model',
      `Model "${modelName}" is not supported`,
    )
  }
  if (
    references.some((reference) =>
      reference.mediaType.startsWith('image/'),
    ) &&
    !definition.capabilities.acceptsImageReferences
  ) {
    throw new MediaGenError(
      'model_capability_mismatch',
      `Model "${modelName}" does not accept image references`,
    )
  }
  if (
    references.some((reference) =>
      reference.mediaType.startsWith('video/'),
    ) &&
    !definition.capabilities.acceptsVideoReferences
  ) {
    throw new MediaGenError(
      'model_capability_mismatch',
      `Model "${modelName}" does not accept video references`,
    )
  }
  if (references.length > definition.capabilities.maxReferences) {
    throw new MediaGenError(
      'model_capability_mismatch',
      `Model "${modelName}" accepts at most ${definition.capabilities.maxReferences} references`,
    )
  }
}
