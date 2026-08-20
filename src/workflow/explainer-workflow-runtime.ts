import {getVideoModelProfile} from '../catalog/models.js'
import type {GenerationDeployment} from '../generation/generation-module.js'
import type {MediaComposer} from '../media/media-composer.js'
import type {ImageNormalizer} from '../media/image-normalizer.js'
import type {ModelRuntime} from '../model-runtime/model-runtime.js'
import type {
  StructuredModelDeployment,
  StructuredModelRuntime,
} from '../model-runtime/structured-model-runtime.js'
import {createExplainerPlanner} from './explainer-planner.js'
import {createExplainerPlanningStepHandler} from './explainer-planning-step.js'
import {createExplainerPromptFactories} from './explainer-workflow.js'
import {createMediaCompositionStepHandler} from './media-composition-step.js'
import {createImageNormalizationStepHandler} from './image-normalization-step.js'
import {createModelGenerationStepHandler} from './model-generation-step.js'
import type {WorkflowStepHandler} from './workflow-module.js'

export function createExplainerWorkflowHandlers(dependencies: {
  deployments: Record<string, GenerationDeployment>
  generationDirectory: string
  imageNormalizer: ImageNormalizer
  mediaComposer: MediaComposer
  modelRuntime: ModelRuntime
  structuredModelRuntime: StructuredModelRuntime
}): WorkflowStepHandler[] {
  const planning = requirePlanningDeployment(
    dependencies.deployments.planning,
  )
  return [
    createExplainerPlanningStepHandler({
      deployment: planning,
      generationDirectory: dependencies.generationDirectory,
      planner: createExplainerPlanner({
        structuredRuntime: dependencies.structuredModelRuntime,
      }),
    }),
    createModelGenerationStepHandler({
      deployments: dependencies.deployments,
      generationDirectory: dependencies.generationDirectory,
      modelRuntime: dependencies.modelRuntime,
      promptFactories: createExplainerPromptFactories(),
    }),
    createImageNormalizationStepHandler({
      generationDirectory: dependencies.generationDirectory,
      imageNormalizer: dependencies.imageNormalizer,
    }),
    createMediaCompositionStepHandler({
      composer: dependencies.mediaComposer,
      generationDirectory: dependencies.generationDirectory,
    }),
  ]
}

export function explainerConcurrencyLimits(
  deployments: Record<string, GenerationDeployment>,
): Readonly<Record<string, number>> {
  const visuals = deployments.visuals
  if (visuals === undefined) {
    throw new Error(
      'No deployment is available for workflow role "visuals"',
    )
  }
  return {
    'reference-image': 1,
    visuals: getVideoModelProfile(visuals.model)
      .maxConcurrentRequests,
    voice: 4,
  }
}

function requirePlanningDeployment(
  deployment: GenerationDeployment | undefined,
): StructuredModelDeployment {
  if (deployment === undefined) {
    throw new Error(
      'No deployment is available for workflow role "planning"',
    )
  }
  if (deployment.adapter !== 'azure-openai-chat') {
    throw new Error(
      `Deployment "${deployment.id}" is not eligible for structured planning`,
    )
  }
  return {
    adapter: deployment.adapter,
    apiKey: deployment.apiKey,
    deploymentName: deployment.deploymentName,
    endpoint: deployment.endpoint,
    id: deployment.id,
    model: deployment.model,
    projectEndpoint: deployment.projectEndpoint,
    provider: deployment.provider,
  }
}
