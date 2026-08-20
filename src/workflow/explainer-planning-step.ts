import {readFile} from 'node:fs/promises'

import type {StructuredModelDeployment} from '../model-runtime/structured-model-runtime.js'
import type {ExplainerPlanner} from './explainer-planner.js'
import {
  explainerWorkflowRequestSchema,
} from './explainer-workflow.js'
import type {WorkflowStepHandler} from './workflow-module.js'
import {resolveWithinGeneration} from './workflow-path.js'

export function createExplainerPlanningStepHandler(dependencies: {
  deployment: StructuredModelDeployment
  generationDirectory: string
  planner: ExplainerPlanner
}): WorkflowStepHandler {
  return {
    async execute(rawInput) {
      const input = explainerWorkflowRequestSchema.parse(rawInput)
      const textReferences = await Promise.all(
        input.textReferences.map(async (reference) => ({
          ...reference,
          content: await readFile(
            resolveWithinGeneration(
              dependencies.generationDirectory,
              reference.path,
              'input',
            ),
            'utf8',
          ),
        })),
      )
      const context = [
        ...input.webReferenceUrls.map(
          (url) => `Web Reference: ${url}`,
        ),
        ...textReferences.map((reference) =>
          [
            `Text Reference: ${reference.title} (${reference.format})`,
            reference.content,
          ].join('\n'),
        ),
      ].join('\n\n')
      const plan = await dependencies.planner.plan({
        aspectRatio: input.aspectRatio,
        clipDurationsSeconds: input.clipDurationsSeconds,
        creativeBrief: input.creativeBrief,
        deployment: dependencies.deployment,
        preset: {
          guidance: input.preset.guidance,
          title: input.preset.title,
        },
        targetDurationSeconds: input.durationSeconds,
        textContext: context,
      })
      return {output: plan}
    },
    kind: 'explainer-plan',
  }
}
