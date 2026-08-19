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
  createGenerationModule,
  type GenerationDeployment,
  type GenerationModule,
} from '../generation/generation-module.js'
import type {
  GenerationRecord,
  GenerationStore,
  ResolvedResource,
} from '../generation/generation-store.js'
import type {ModelRuntime} from '../model-runtime/model-runtime.js'
import type {TextReferenceInput} from '../generation/text-reference.js'

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

export interface ResolvedCreationDeployment
  extends GenerationDeployment {}

export interface CreationModule {
  create(input: {
    deployments: Record<string, ResolvedCreationDeployment>
    force: boolean
    request: CreateRequest
    sourceGenerations: string[]
  }): Promise<GenerationRecord>
}

export function createCreationModule(dependencies: {
  modelRuntime: ModelRuntime
  store: GenerationStore
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
      return createScenario(generation, {
        deployments: input.deployments,
        request: input.request,
        sourceGenerations: input.sourceGenerations,
      })
    },
  }
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
    request: ScenarioCreateRequest
    sourceGenerations: string[]
  },
): Promise<GenerationRecord> {
  const definition = getScenarioDefinition(input.request.scenario)!
  const routingRoles = scenarioRolesForRequest(input.request)
  const role = routingRoles[0]!
  const deployment = requireDeployment(input.deployments, role)
  const voiceEnabled =
    input.request.scenario === 'explainer-video' &&
    input.request.options.voice !== undefined
  const voiceDeployment =
    voiceEnabled
      ? requireDeployment(input.deployments, 'voice')
      : undefined
  const resolvedResources = routingRoles.map((routingRole) =>
    resource(
      routingRole,
      requireDeployment(input.deployments, routingRole),
    ),
  )
  const operations =
    input.request.scenario === 'explainer-video'
      ? [
          {kind: 'scenario-prepare', status: 'succeeded' as const},
          {kind: 'video-generate', status: 'running' as const},
          ...(voiceEnabled
            ? [
                {
                  kind: 'voice-generate',
                  status: 'running' as const,
                },
              ]
            : []),
        ]
      : [
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
      stage:
        input.request.scenario === 'explainer-video'
          ? voiceEnabled
            ? 'video-and-voice-generation'
            : 'video-generation'
          : 'model-generate',
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
    supplementalGenerations:
      input.request.scenario === 'explainer-video' &&
      voiceEnabled &&
      voiceDeployment !== undefined
        ? [
            {
              controls: {
                voice: input.request.options.voice,
              },
              deployment: voiceDeployment,
              prompt:
                input.request.options.narration?.trim() ||
                input.request.creativeBrief,
              role: 'voice',
            },
          ]
        : undefined,
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
  request: ScenarioCreateRequest,
): Record<string, unknown> {
  if (request.scenario === 'explainer-video') {
    const vertical = request.options['aspect-ratio'] === '9:16'
    return {
      height: vertical ? 1280 : 720,
      nSeconds: request.options.duration,
      nVariants: 1,
      width: vertical ? 720 : 1280,
    }
  }

  const vertical = request.options.orientation === 'vertical'
  return {
    height: vertical ? 1280 : 720,
    nSeconds: request.options['clip-duration'],
    nVariants: request.options['clip-count'],
    width: vertical ? 720 : 1280,
  }
}
