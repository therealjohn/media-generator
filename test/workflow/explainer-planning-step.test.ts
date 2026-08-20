import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import type {
  ExplainerPlan,
  ExplainerPlanningInput,
} from '../../src/workflow/explainer-planner.js'
import {createExplainerPlanningStepHandler} from '../../src/workflow/explainer-planning-step.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('ExplainerPlanningStepHandler', () => {
  test('loads private Text References and invokes the routed planner', async () => {
    const generationDirectory = await mkdtemp(
      join(tmpdir(), 'media-gen-planning-step-'),
    )
    temporaryDirectories.push(generationDirectory)
    await mkdir(join(generationDirectory, 'inputs'))
    await writeFile(
      join(
        generationDirectory,
        'inputs',
        'text-reference-1.md',
      ),
      '# Foundry\n\nUse an agent project.',
      'utf8',
    )
    const inputs: ExplainerPlanningInput[] = []
    const plan: ExplainerPlan = {
      scenes: [
        {
          ambientAudio: 'Pencil sounds.',
          durationSeconds: 20,
          id: 'scene-1',
          motion: 'Push in.',
          narration: 'Create an agent.',
          negative: 'No text.',
          scene: 'A robot on paper.',
        },
      ],
      title: 'Create an agent',
      visualBible: 'Black ink drawing.',
    }
    const handler = createExplainerPlanningStepHandler({
      deployment: {
        adapter: 'azure-openai-chat',
        deploymentName: 'planner',
        id: 'primary:planner',
        model: 'gpt-4.1-mini',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        provider: 'primary',
      },
      generationDirectory,
      planner: {
        plan: async (input) => {
          inputs.push(input)
          return plan
        },
      },
    })

    const result = await handler.execute(
      {
        aspectRatio: '16:9',
        clipDurationsSeconds: [4, 8, 12, 16, 20],
        creativeBrief: 'Explain how to create an AI agent.',
        durationSeconds: 20,
        preset: {
          guidance: 'Loose black ink drawing.',
          id: 'hand-drawn',
          title: 'Hand drawn',
        },
        sourceImagePaths: [],
        subtitles: true,
        textReferences: [
          {
            format: 'markdown',
            path: 'inputs/text-reference-1.md',
            title: 'Foundry documentation',
          },
        ],
        voiceId: 'en-US-Ethan:MAI-Voice-2',
        webReferenceUrls: [
          'https://learn.microsoft.com/foundry',
        ],
      },
      {dependencyArtifacts: [], dependencyOutputs: {}},
    )

    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({
      creativeBrief: 'Explain how to create an AI agent.',
      deployment: {id: 'primary:planner'},
      preset: {
        guidance: 'Loose black ink drawing.',
        title: 'Hand drawn',
      },
      targetDurationSeconds: 20,
    })
    expect(inputs[0]?.textContext).toContain(
      'Web Reference: https://learn.microsoft.com/foundry',
    )
    expect(inputs[0]?.textContext).toContain(
      'Text Reference: Foundry documentation',
    )
    expect(inputs[0]?.textContext).toContain(
      'Use an agent project.',
    )
    expect(result).toEqual({output: plan})
  })
})
