import {describe, expect, test} from 'vitest'

import {
  createExplainerPromptFactories,
  createExplainerWorkflowDefinition,
  type ExplainerWorkflowRequest,
} from '../../src/workflow/explainer-workflow.js'
import type {ExplainerPlan} from '../../src/workflow/explainer-planner.js'

const plan: ExplainerPlan = {
  scenes: [
    {
      ambientAudio: 'Soft pencil sounds.',
      durationSeconds: 20,
      id: 'scene-1',
      motion: 'Slow push in.',
      narration: 'First, define the agent.',
      negative: 'No freeze frame.',
      scene: 'A robot is sketched on paper.',
    },
    {
      ambientAudio: 'Quiet keyboard clicks.',
      durationSeconds: 20,
      id: 'scene-2',
      motion: 'Static frame with internal motion.',
      narration: 'Next, connect its tools.',
      negative: 'No horizontal drift.',
      scene: 'Tools connect around the robot.',
    },
    {
      ambientAudio: 'Warm confirmation chime.',
      durationSeconds: 20,
      id: 'scene-3',
      motion: 'Follow the robot upward.',
      narration: 'Finally, publish the agent.',
      negative: 'No watermark.',
      scene: 'The robot launches into a cloud.',
    },
  ],
  title: 'Create an AI agent',
  visualBible:
    'Loose black ink line art on clean off-white paper.',
}

describe('Explainer workflow definition', () => {
  test('builds reference, scene, narration, and composition steps from a plan', () => {
    const definition = createExplainerWorkflowDefinition()
    const graph = definition.build(plan, request())

    expect(definition.prepare(request()).kind).toBe('explainer-plan')
    expect(graph.map((step) => step.id)).toEqual([
      'reference-image',
      'normalize-reference-image',
      'scene-1-video',
      'scene-1-voice',
      'scene-2-video',
      'scene-2-voice',
      'scene-3-video',
      'scene-3-voice',
      'compose',
    ])
    expect(graph[0]).toMatchObject({
      dependsOn: ['plan'],
      kind: 'model-generate',
    })
    expect(
      graph.find(
        (step) => step.id === 'normalize-reference-image',
      ),
    ).toMatchObject({
      dependsOn: ['reference-image'],
      input: {
        output: {
          id: 'style-reference',
          path: 'working/reference/style-sora.png',
        },
        sourceArtifactId: 'style-reference-source',
      },
      kind: 'image-normalize',
    })
    expect(graph.find((step) => step.id === 'scene-1-video')).toMatchObject({
      concurrencyKey: 'visuals',
      dependsOn: ['normalize-reference-image'],
      input: {
        controls: {nSeconds: 20},
        prompt: {
          data: {
            visualBible: plan.visualBible,
          },
        },
        referenceArtifactIds: ['style-reference'],
        role: 'visuals',
      },
      kind: 'model-generate',
    })
    expect(graph.find((step) => step.id === 'scene-1-voice')).toMatchObject({
      concurrencyKey: 'voice',
      dependsOn: ['plan'],
      input: {
        controls: {voice: 'en-US-Ethan:MAI-Voice-2'},
        role: 'voice',
      },
      kind: 'model-generate',
    })
    expect(graph.at(-1)).toMatchObject({
      dependsOn: [
        'scene-1-video',
        'scene-1-voice',
        'scene-2-video',
        'scene-2-voice',
        'scene-3-video',
        'scene-3-voice',
      ],
      id: 'compose',
      kind: 'media-compose',
    })
  })

  test('omits Voice steps when narration is disabled', () => {
    const definition = createExplainerWorkflowDefinition()
    const graph = definition.build(
      plan,
      request({voiceId: undefined}),
    )

    expect(
      graph.some((step) => step.id.endsWith('-voice')),
    ).toBe(false)
    expect(graph.at(-1)).toMatchObject({
      dependsOn: [
        'scene-1-video',
        'scene-2-video',
        'scene-3-video',
      ],
      input: {
        scenes: [
          {
            id: 'scene-1',
            narrationArtifactId: undefined,
          },
          {
            id: 'scene-2',
            narrationArtifactId: undefined,
          },
          {
            id: 'scene-3',
            narrationArtifactId: undefined,
          },
        ],
        subtitlePath: 'working/subtitles/explainer.srt',
      },
    })
  })

  test('assembles transient style-reference and scene prompts', () => {
    const factories = new Map(
      createExplainerPromptFactories().map((factory) => [
        factory.kind,
        factory,
      ]),
    )
    const referencePrompt = factories.get('explainer-reference')!.assemble({
      creativeBrief: 'Explain how to create an AI agent.',
      presetGuidance:
        'Hand Drawn with loose black ink on off-white paper.',
      visualBible: plan.visualBible,
    })
    const scenePrompt = factories.get('explainer-scene')!.assemble({
      presetGuidance:
        'Hand Drawn with loose black ink on off-white paper.',
      scene: plan.scenes[0],
      visualBible: plan.visualBible,
    })

    expect(referencePrompt).toContain(
      'Create one reusable visual style reference image',
    )
    expect(referencePrompt).toContain(
      'Do not include captions, labels, logos, or interface text',
    )
    expect(scenePrompt).toContain(
      'STYLE REFERENCE (look only — NOT the first frame)',
    )
    expect(scenePrompt).toContain(
      'Do NOT open the video on it',
    )
    expect(scenePrompt).toContain(
      'SCENE: A robot is sketched on paper.',
    )
    expect(scenePrompt).toContain('MOTION: Slow push in.')
    expect(scenePrompt).toContain(
      'AUDIO: Soft pencil sounds. — no voice.',
    )
    expect(scenePrompt).toContain(
      'lip-sync, captions, on-screen text, watermark',
    )
  })
})

function request(
  overrides: Partial<ExplainerWorkflowRequest> = {},
): ExplainerWorkflowRequest {
  return {
    aspectRatio: '16:9',
    clipDurationsSeconds: [4, 8, 12, 16, 20],
    creativeBrief: 'Explain how to create an AI agent.',
    durationSeconds: 60,
    preset: {
      guidance:
        'Hand Drawn with loose black ink on off-white paper.',
      id: 'hand-drawn',
      title: 'Hand drawn',
    },
    sourceImagePaths: [],
    subtitles: true,
    textReferences: [],
    voiceId: 'en-US-Ethan:MAI-Voice-2',
    webReferenceUrls: [],
    ...overrides,
  }
}
