import {describe, expect, test} from 'vitest'

import {
  createExplainerPlanner,
  type ExplainerPlan,
} from '../../src/workflow/explainer-planner.js'
import type {
  StructuredModelRequest,
  StructuredModelRuntime,
} from '../../src/model-runtime/structured-model-runtime.js'

const validPlan: ExplainerPlan = {
  scenes: [
    {
      ambientAudio: 'Soft pencil sounds.',
      durationSeconds: 20,
      id: 'scene-1',
      motion: 'Slow push in.',
      narration: 'First, define the agent.',
      negative: 'No captions or spoken dialogue.',
      scene: 'A robot is sketched on paper.',
    },
    {
      ambientAudio: 'Quiet keyboard clicks.',
      durationSeconds: 20,
      id: 'scene-2',
      motion: 'Static frame with internal motion.',
      narration: 'Next, connect its tools.',
      negative: 'No captions or spoken dialogue.',
      scene: 'Tools connect around the robot.',
    },
    {
      ambientAudio: 'Warm confirmation chime.',
      durationSeconds: 20,
      id: 'scene-3',
      motion: 'Follow the robot upward.',
      narration: 'Finally, publish the agent.',
      negative: 'No captions or spoken dialogue.',
      scene: 'The robot launches into a cloud.',
    },
  ],
  title: 'Create an AI agent',
  visualBible:
    'Loose black ink line art on clean off-white paper.',
}

describe('ExplainerPlanner', () => {
  test('requests and validates an exact model-supported scene plan', async () => {
    const requests: StructuredModelRequest[] = []
    const structuredRuntime: StructuredModelRuntime = {
      generate: async (request) => {
        requests.push(request)
        return {value: validPlan}
      },
    }
    const planner = createExplainerPlanner({structuredRuntime})

    const plan = await planner.plan({
      aspectRatio: '16:9',
      clipDurationsSeconds: [4, 8, 12, 16, 20],
      creativeBrief: 'Explain how to create an AI agent.',
      deployment: {
        adapter: 'azure-openai-chat',
        deploymentName: 'planner',
        id: 'primary:planner',
        model: 'gpt-4.1-mini',
        projectEndpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        provider: 'primary',
      },
      preset: {
        guidance:
          'Hand Drawn with confident black ink and generous negative space.',
        title: 'Hand drawn',
      },
      targetDurationSeconds: 60,
      textContext: 'Use Microsoft Foundry terminology.',
    })

    expect(plan).toEqual(validPlan)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      deploymentName: 'planner',
      modelName: 'gpt-4.1-mini',
      schemaName: 'explainer_plan',
    })
    expect(requests[0]?.prompt).toContain(
      'Allowed clip durations: 4, 8, 12, 16, 20 seconds.',
    )
    expect(requests[0]?.prompt).toContain(
      'The scene durations must total exactly 60 seconds.',
    )
    expect(requests[0]?.prompt).toContain(
      'Use Microsoft Foundry terminology.',
    )
  })

  test('repairs one invalid plan before failing the workflow', async () => {
    const requests: StructuredModelRequest[] = []
    const responses: unknown[] = [
      {
        ...validPlan,
        scenes: validPlan.scenes.slice(0, 2),
      },
      validPlan,
    ]
    const structuredRuntime: StructuredModelRuntime = {
      generate: async (request) => {
        requests.push(request)
        return {value: responses.shift()}
      },
    }
    const planner = createExplainerPlanner({structuredRuntime})

    await expect(
      planner.plan({
        aspectRatio: '16:9',
        clipDurationsSeconds: [4, 8, 12, 16, 20],
        creativeBrief: 'Explain how to create an AI agent.',
        deployment: {
          adapter: 'azure-openai-chat',
          deploymentName: 'planner',
          id: 'primary:planner',
          model: 'gpt-4.1-mini',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
        preset: {
          guidance: 'Hand Drawn.',
          title: 'Hand drawn',
        },
        targetDurationSeconds: 60,
        textContext: '',
      }),
    ).resolves.toEqual(validPlan)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.prompt).toContain(
      'The prior response was invalid',
    )
    expect(requests[1]?.prompt).toContain(
      'total exactly 60 seconds',
    )
  })

  test('does not reject narration based on estimated speaking rate', async () => {
    const requests: StructuredModelRequest[] = []
    const plan: ExplainerPlan = {
      scenes: [
        {
          ...validPlan.scenes[0]!,
          durationSeconds: 8,
          id: 'scene-01',
          narration: Array.from(
            {length: 23},
            (_, index) => `word${index + 1}`,
          ).join(' '),
        },
      ],
      title: validPlan.title,
      visualBible: validPlan.visualBible,
    }
    const planner = createExplainerPlanner({
      structuredRuntime: {
        generate: async (request) => {
          requests.push(request)
          return {value: plan}
        },
      },
    })

    await expect(
      planner.plan({
        aspectRatio: '16:9',
        clipDurationsSeconds: [4, 8, 12, 16, 20],
        creativeBrief: 'Explain how to create an AI agent.',
        deployment: {
          adapter: 'azure-openai-chat',
          deploymentName: 'planner',
          id: 'primary:planner',
          model: 'gpt-5.4',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
        preset: {
          guidance: 'Hand Drawn.',
          title: 'Hand drawn',
        },
        targetDurationSeconds: 8,
        textContext: '',
      }),
    ).resolves.toEqual(plan)
    expect(requests).toHaveLength(1)
  })

  test('repairs scene identifiers that are unsafe as artifact names', async () => {
    const responses: unknown[] = [
      {
        ...validPlan,
        scenes: [
          {...validPlan.scenes[0], id: '../scene'},
          ...validPlan.scenes.slice(1),
        ],
      },
      validPlan,
    ]
    const planner = createExplainerPlanner({
      structuredRuntime: {
        generate: async () => ({value: responses.shift()}),
      },
    })

    await expect(
      planner.plan({
        aspectRatio: '16:9',
        clipDurationsSeconds: [4, 8, 12, 16, 20],
        creativeBrief: 'Explain how to create an AI agent.',
        deployment: {
          adapter: 'azure-openai-chat',
          deploymentName: 'planner',
          id: 'primary:planner',
          model: 'gpt-4.1-mini',
          projectEndpoint:
            'https://example.services.ai.azure.com/api/projects/media',
          provider: 'primary',
        },
        preset: {
          guidance: 'Hand Drawn.',
          title: 'Hand drawn',
        },
        targetDurationSeconds: 60,
        textContext: '',
      }),
    ).resolves.toEqual(validPlan)
  })
})
