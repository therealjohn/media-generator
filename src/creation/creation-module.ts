import {
  assembleScenarioPrompt,
  getScenarioDefinition,
  scenarioRolesForRequest,
  type ScenarioCreateRequest,
} from '../catalog/scenarios.js'
import {assembleModelPrompt} from '../catalog/prompt-assembly.js'
import type {
  MediaType,
} from '../catalog/models.js'
import {
  findModelDefinition,
  getVideoModelProfile,
  resolveExplainerDuration,
} from '../catalog/models.js'
import {
  createGenerationModule,
  type GenerationDeployment,
  type GenerationModule,
} from '../generation/generation-module.js'
import type {
  GenerationRecord,
  GenerationStore,
  ResolvedResource,
} from '../generation/generation-store.js'
import {fingerprintReference} from '../generation/references.js'
import type {ModelRuntime} from '../model-runtime/model-runtime.js'
import {
  prepareTextReferences,
  type TextReferenceInput,
} from '../generation/text-reference.js'
import {normalizeWebReferences} from '../generation/web-reference.js'
import type {MediaComposer} from '../media/media-composer.js'
import type {ImageNormalizer} from '../media/image-normalizer.js'
import type {StructuredModelRuntime} from '../model-runtime/structured-model-runtime.js'
import {
  createExplainerWorkflowDefinition,
} from '../workflow/explainer-workflow.js'
import {
  createExplainerWorkflowHandlers,
  explainerConcurrencyLimits,
} from '../workflow/explainer-workflow-runtime.js'
import {createWorkflowGenerationModule} from '../workflow/workflow-generation-module.js'
import type {WorkflowGenerationRun} from '../workflow/workflow-generation-module.js'

export interface GeneratorCreateRequest {
  controls: Record<string, unknown>
  creativeBrief: string
  deploymentId?: string
  generator: MediaType
  kind: 'generator'
  referencePaths: string[]
  style: string
  textReferences?: TextReferenceInput[]
  webReferenceUrls?: string[]
}

export type CreateRequest =
  | GeneratorCreateRequest
  | ScenarioCreateRequest

export interface CreationInput {
  deployments: Record<string, ResolvedCreationDeployment>
  force: boolean
  request: CreateRequest
  sourceGenerations: string[]
}

export interface ResolvedCreationDeployment
  extends GenerationDeployment {
  defaultVoice?: string
}

export interface CreationModule {
  create(input: CreationInput): Promise<GenerationRecord>
  resume(input: {
    deployments: Record<string, ResolvedCreationDeployment>
    generationId: string
    scenario: 'explainer-video'
  }): Promise<GenerationRecord>
  startResume(input: {
    deployments: Record<string, ResolvedCreationDeployment>
    generationId: string
    scenario: 'explainer-video'
  }): Promise<WorkflowGenerationRun>
  start(
    input: CreationInput & {
      request: Extract<
        ScenarioCreateRequest,
        {scenario: 'explainer-video'}
      >
    },
  ): Promise<WorkflowGenerationRun>
}

export function createCreationModule(dependencies: {
  imageNormalizer?: ImageNormalizer
  mediaComposer?: MediaComposer
  modelRuntime: ModelRuntime
  store: GenerationStore
  structuredModelRuntime?: StructuredModelRuntime
  workspacePath: string
}): CreationModule {
  const generation = createGenerationModule(dependencies)

  return {
    async create(input) {
      if (input.request.kind === 'generator') {
        return createGenerator(generation, {
          deployments: input.deployments,
          request: input.request,
          sourceGenerations: input.sourceGenerations,
        })
      }
      if (input.request.scenario === 'explainer-video') {
        return createExplainerScenario(dependencies, {
          deployments: input.deployments,
          request: input.request,
          sourceGenerations: input.sourceGenerations,
        })
      }
      return createScenario(generation, {
        deployments: input.deployments,
        request: input.request,
        sourceGenerations: input.sourceGenerations,
      })
    },
    async start(input) {
      return startExplainerScenario(dependencies, {
        deployments: input.deployments,
        request: input.request,
        sourceGenerations: input.sourceGenerations,
      })
    },
    async resume(input) {
      const run = await startExplainerResume(dependencies, input)
      return run.completion
    },
    startResume: (input) =>
      startExplainerResume(dependencies, input),
  }
}

async function startExplainerResume(
  dependencies: {
    imageNormalizer?: ImageNormalizer
    mediaComposer?: MediaComposer
    modelRuntime: ModelRuntime
    store: GenerationStore
    structuredModelRuntime?: StructuredModelRuntime
    workspacePath: string
  },
  input: {
    deployments: Record<string, ResolvedCreationDeployment>
    generationId: string
    scenario: 'explainer-video'
  },
): Promise<WorkflowGenerationRun> {
  if (dependencies.structuredModelRuntime === undefined) {
    throw new Error(
      'The structured planning runtime is not available',
    )
  }
  if (dependencies.mediaComposer === undefined) {
    throw new Error('The media composer is not available')
  }
  if (dependencies.imageNormalizer === undefined) {
    throw new Error('The image normalizer is not available')
  }
  const imageNormalizer = dependencies.imageNormalizer
  const mediaComposer = dependencies.mediaComposer
  const structuredModelRuntime =
    dependencies.structuredModelRuntime
  const workflowGeneration = createWorkflowGenerationModule({
    store: dependencies.store,
    workspacePath: dependencies.workspacePath,
  })
  return workflowGeneration.startResume({
    concurrencyLimits: explainerConcurrencyLimits(
      input.deployments,
    ),
    createHandlers: ({generationDirectory}) =>
      createExplainerWorkflowHandlers({
        deployments: input.deployments,
        generationDirectory,
        imageNormalizer,
        mediaComposer,
        modelRuntime: dependencies.modelRuntime,
        structuredModelRuntime,
      }),
    definition: createExplainerWorkflowDefinition(),
    generationId: input.generationId,
    maxConcurrency: 8,
  })
}

async function createExplainerScenario(
  dependencies: {
    imageNormalizer?: ImageNormalizer
    mediaComposer?: MediaComposer
    modelRuntime: ModelRuntime
    store: GenerationStore
    structuredModelRuntime?: StructuredModelRuntime
    workspacePath: string
  },
  input: {
    deployments: Record<string, ResolvedCreationDeployment>
    request: Extract<
      ScenarioCreateRequest,
      {scenario: 'explainer-video'}
    >
    sourceGenerations: string[]
  },
): Promise<GenerationRecord> {
  const run = await startExplainerScenario(dependencies, input)
  return run.completion
}

async function startExplainerScenario(
  dependencies: {
    imageNormalizer?: ImageNormalizer
    mediaComposer?: MediaComposer
    modelRuntime: ModelRuntime
    store: GenerationStore
    structuredModelRuntime?: StructuredModelRuntime
    workspacePath: string
  },
  input: {
    deployments: Record<string, ResolvedCreationDeployment>
    request: Extract<
      ScenarioCreateRequest,
      {scenario: 'explainer-video'}
    >
    sourceGenerations: string[]
  },
): Promise<WorkflowGenerationRun> {
  if (dependencies.structuredModelRuntime === undefined) {
    throw new Error(
      'The structured planning runtime is not available',
    )
  }
  if (dependencies.mediaComposer === undefined) {
    throw new Error('The media composer is not available')
  }
  if (dependencies.imageNormalizer === undefined) {
    throw new Error('The image normalizer is not available')
  }
  const imageNormalizer = dependencies.imageNormalizer
  const mediaComposer = dependencies.mediaComposer
  const structuredModelRuntime =
    dependencies.structuredModelRuntime
  const planning = requireDeployment(input.deployments, 'planning')
  const referenceImage = requireDeployment(
    input.deployments,
    'reference-image',
  )
  const visuals = requireDeployment(input.deployments, 'visuals')
  const voiceSelection = input.request.options.voice
  const voiceDeployment =
    voiceSelection.mode === 'off'
      ? undefined
      : requireDeployment(input.deployments, 'voice')
  const voiceId =
    voiceSelection.mode === 'off'
      ? undefined
      : voiceSelection.mode === 'selected'
        ? voiceSelection.id
        : voiceDeployment?.defaultVoice
  if (
    voiceSelection.mode !== 'off' &&
    voiceId === undefined
  ) {
    throw new Error(
      'The private Speech Connection does not define a default Voice',
    )
  }
  const durationSeconds = resolveExplainerDuration(
    visuals.model,
    input.request.options.duration,
  )
  const vertical =
    input.request.options['aspect-ratio'] === '9:16'
  const outputWidth = vertical ? 720 : 1280
  const outputHeight = vertical ? 1280 : 720
  const references = await Promise.all(
    input.request.sourcePaths.map((path) =>
      fingerprintReference(path),
    ),
  )
  validateExplainerImageReferences(referenceImage, references)
  const textReferences = prepareTextReferences(
    input.request.textReferences ?? [],
  )
  const webReferences = normalizeWebReferences(
    input.request.webReferenceUrls ?? [],
  )
  const definition = getScenarioDefinition('explainer-video')!
  const preset = definition.presets.find(
    (candidate) => candidate.id === input.request.preset,
  )!
  const resolvedResources = scenarioRolesForRequest(
    input.request,
  ).map((role) =>
    resource(role, requireDeployment(input.deployments, role)),
  )
  const workflowGeneration = createWorkflowGenerationModule({
    store: dependencies.store,
    workspacePath: dependencies.workspacePath,
  })
  const workflowDeployments: Record<
    string,
    ResolvedCreationDeployment
  > = {
    planning,
    'reference-image': referenceImage,
    visuals,
    ...(voiceDeployment === undefined
      ? {}
      : {voice: voiceDeployment}),
  }

  return workflowGeneration.start({
    concurrencyLimits: explainerConcurrencyLimits(
      workflowDeployments,
    ),
    createHandlers: ({generationDirectory}) =>
      createExplainerWorkflowHandlers({
        deployments: workflowDeployments,
        generationDirectory,
        imageNormalizer,
        mediaComposer,
        modelRuntime: dependencies.modelRuntime,
        structuredModelRuntime,
      }),
    definition: createExplainerWorkflowDefinition(),
    inputFiles: textReferences.map((reference) => ({
      contents: reference.content,
      path: reference.record.path,
    })),
    maxConcurrency: 8,
    record: {
      creativeBrief: input.request.creativeBrief,
      mediaType: 'video',
      references,
      resolvedModel: {
        deployment: visuals.deploymentName,
        id: visuals.id,
        model: visuals.model,
        provider: visuals.provider,
      },
      resolvedResources,
      scenario: {
        inputs: {
          sourcePaths: input.request.sourcePaths,
        },
        options: {
          ...input.request.options,
          duration: durationSeconds,
          'output-height': outputHeight,
          'output-width': outputWidth,
          ...(voiceId === undefined
            ? {}
            : {'resolved-voice': voiceId}),
        },
      },
      selection: {
        kind: 'scenario',
        preset: input.request.preset,
        scenario: 'explainer-video',
      },
      sourceGenerations: input.sourceGenerations,
      textReferences: textReferences.map(
        (reference) => reference.record,
      ),
      webReferences,
    },
    request: {
      aspectRatio: input.request.options['aspect-ratio'],
      clipDurationsSeconds:
        resolveExplainerClipDurations(visuals.model),
      creativeBrief: input.request.creativeBrief,
      durationSeconds,
      preset: {
        guidance: preset.guidance,
        id: preset.id,
        title: preset.title,
      },
      sourceImagePaths: references
        .filter((reference) =>
          reference.mediaType.startsWith('image/'),
        )
        .map((reference) => reference.path),
      subtitles: input.request.options.subtitles,
      textReferences: textReferences.map((reference) => ({
        format: reference.record.format,
        path: reference.record.path,
        title: reference.record.title,
      })),
      voiceId,
      webReferenceUrls: webReferences.map(
        (reference) => reference.url,
      ),
    },
  })
}

async function createGenerator(
  generation: GenerationModule,
  input: {
    deployments: Record<string, ResolvedCreationDeployment>
    request: GeneratorCreateRequest
    sourceGenerations: string[]
  },
): Promise<GenerationRecord> {
  const deployment = requireDeployment(input.deployments, 'generation')
  return generation.generate({
    controls: input.request.controls,
    creativeBrief: input.request.creativeBrief,
    deployment,
    mediaType: input.request.generator,
    prompt: assembleModelPrompt({
      creativeBrief: input.request.creativeBrief,
      generator: input.request.generator,
      style: input.request.style,
    }),
    referencePaths: input.request.referencePaths,
    resolvedResources: [resource('generation', deployment)],
    selection: {
      generator: input.request.generator,
      kind: 'generator',
      style: input.request.style,
    },
    sourceGenerations: input.sourceGenerations,
    textReferences: input.request.textReferences,
    webReferenceUrls: input.request.webReferenceUrls,
  })
}

async function createScenario(
  generation: GenerationModule,
  input: {
    deployments: Record<string, ResolvedCreationDeployment>
    request: Extract<
      ScenarioCreateRequest,
      {scenario: 'short-form-video'}
    >
    sourceGenerations: string[]
  },
): Promise<GenerationRecord> {
  const definition = getScenarioDefinition(input.request.scenario)!
  const routingRoles = scenarioRolesForRequest(input.request)
  const role = routingRoles[0]!
  const deployment = requireDeployment(input.deployments, role)
  const resolvedResources = routingRoles.map((routingRole) =>
    resource(
      routingRole,
      requireDeployment(input.deployments, routingRole),
    ),
  )
  const operations = [
    {kind: 'scenario-prepare', status: 'succeeded' as const},
    {kind: 'model-generate', status: 'running' as const},
  ]
  return generation.generate({
    controls: scenarioControls(input.request),
    creativeBrief: input.request.creativeBrief,
    deployment,
    mediaType: definition.mediaType,
    operations,
    progress: {
      completed: 1,
      stage: 'model-generate',
      total: operations.length,
    },
    prompt: assembleScenarioPrompt(input.request),
    referencePaths: input.request.sourcePaths,
    resolvedResources,
    scenario: {
      inputs: {
        sourcePaths: input.request.sourcePaths,
      },
      options: input.request.options,
    },
    selection: {
      kind: 'scenario',
      preset: input.request.preset,
      scenario: input.request.scenario,
    },
    sourceGenerations: input.sourceGenerations,
    textReferences: input.request.textReferences,
    webReferenceUrls: input.request.webReferenceUrls,
  })
}

function requireDeployment(
  deployments: Record<string, ResolvedCreationDeployment>,
  role: string,
): ResolvedCreationDeployment {
  const deployment = deployments[role]
  if (deployment === undefined) {
    throw new Error(`No deployment was resolved for role "${role}"`)
  }
  return deployment
}

function resource(
  role: string,
  deployment: ResolvedCreationDeployment,
): ResolvedResource {
  return {
    deployment: deployment.deploymentName,
    id: deployment.id,
    model: deployment.model,
    provider: deployment.provider,
    role,
  }
}

function scenarioControls(
  request: Extract<
    ScenarioCreateRequest,
    {scenario: 'short-form-video'}
  >,
): Record<string, unknown> {
  const vertical = request.options.orientation === 'vertical'
  return {
    height: vertical ? 1280 : 720,
    nSeconds: request.options['clip-duration'],
    nVariants: request.options['clip-count'],
    width: vertical ? 720 : 1280,
  }
}

function resolveExplainerClipDurations(
  modelName: string,
): number[] {
  return getVideoModelProfile(modelName).clipDurationsSeconds
}

function validateExplainerImageReferences(
  deployment: ResolvedCreationDeployment,
  references: Array<{mediaType: string}>,
): void {
  const definition = findModelDefinition(deployment.model)
  if (definition === undefined) {
    throw new Error(
      `Reference-image model "${deployment.model}" is not supported`,
    )
  }
  const imageReferences = references.filter((reference) =>
    reference.mediaType.startsWith('image/'),
  )
  if (
    imageReferences.length > 0 &&
    !definition.capabilities.acceptsImageReferences
  ) {
    throw new Error(
      `Reference-image model "${deployment.model}" does not accept image references`,
    )
  }
  if (
    imageReferences.length >
    definition.capabilities.maxReferences
  ) {
    throw new Error(
      `Reference-image model "${deployment.model}" accepts at most ${definition.capabilities.maxReferences} image reference${definition.capabilities.maxReferences === 1 ? '' : 's'}`,
    )
  }
}
