import {describe, expect, test} from 'vitest'

import {
  getScenarioDefinition,
  listScenarioDefinitions,
  parseScenarioRequest,
  requiredScenarioRoles,
  scenarioRolesForRequest,
} from '../../src/catalog/scenarios.js'

describe('Scenario catalog', () => {
  test('lists deliverable-named built-in Scenarios', () => {
    expect(
      listScenarioDefinitions().map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
      })),
    ).toEqual([
      {id: 'explainer-video', title: 'Explainer video'},
      {id: 'short-form-video', title: 'Short-form video'},
    ])
  })

  test('describes Explainer video inputs, Presets, and Production Options', () => {
    expect(getScenarioDefinition('explainer-video')).toMatchObject({
      id: 'explainer-video',
      mediaType: 'video',
      optionalRoutingRoles: ['voice'],
      roleMediaTypes: {
        planning: 'text',
        'reference-image': 'image',
        visuals: 'video',
        voice: 'audio',
      },
      routingRoles: [
        'visuals',
        'voice',
      ],
      presets: expect.arrayContaining([
        expect.objectContaining({id: 'editorial-motion-graphics'}),
        expect.objectContaining({id: 'stickman-cartoon'}),
        expect.objectContaining({id: 'watercolor-chronicle'}),
      ]),
      productionOptions: expect.arrayContaining([
        expect.objectContaining({id: 'voice'}),
        expect.objectContaining({id: 'subtitles'}),
        expect.objectContaining({id: 'duration'}),
        expect.objectContaining({id: 'aspect-ratio'}),
      ]),
      title: 'Explainer video',
    })
    const handDrawn = getScenarioDefinition(
      'explainer-video',
    )?.presets.find((preset) => preset.id === 'hand-drawn')
    expect(handDrawn?.description).toBe(
      'Loose ink illustration with paper texture and animated line work.',
    )
    expect(handDrawn?.description).not.toContain(
      'clean off-white paper',
    )
    expect(handDrawn?.guidance).toContain(
      'loose confident black ink pen-and-marker line art on clean off-white paper',
    )
  })

  test('defaults Explainer narration to Auto and a one-minute duration', () => {
    const request = parseScenarioRequest('explainer-video', {
      creativeBrief: 'Explain retrieval-augmented generation.',
      options: {},
      preset: 'hand-drawn',
      sourcePaths: [],
    })

    expect(request).toMatchObject({
      options: {
        'aspect-ratio': '16:9',
        duration: 60,
        subtitles: true,
        voice: {mode: 'auto'},
      },
      scenario: 'explainer-video',
    })
    expect(scenarioRolesForRequest(request)).toEqual([
      'planning',
      'reference-image',
      'visuals',
      'voice',
    ])
    expect(
      requiredScenarioRoles(
        getScenarioDefinition('explainer-video')!,
      ),
    ).toEqual([
      'visuals',
      'voice',
    ])
  })

  test('allows Explainer narration to be explicitly disabled', () => {
    const request = parseScenarioRequest('explainer-video', {
      creativeBrief: 'Explain retrieval-augmented generation.',
      options: {
        duration: 600,
        voice: {mode: 'off'},
      },
      preset: 'hand-drawn',
      sourcePaths: [],
    })

    expect(scenarioRolesForRequest(request)).toEqual([
      'planning',
      'reference-image',
      'visuals',
    ])
  })

  test('validates a Short-form video request', () => {
    expect(
      parseScenarioRequest('short-form-video', {
        creativeBrief: 'Select the strongest product insight.',
        options: {
          'clip-count': 3,
          'clip-duration': 8,
          language: 'auto',
          orientation: 'vertical',
          subtitles: true,
        },
        preset: 'bold-urban',
        sourcePaths: ['C:\\media\\interview.mp4'],
      }),
    ).toEqual({
      creativeBrief: 'Select the strongest product insight.',
      deploymentOverrides: {},
      kind: 'scenario',
      options: {
        'clip-count': 3,
        'clip-duration': 8,
        language: 'auto',
        orientation: 'vertical',
        subtitles: true,
      },
      preset: 'bold-urban',
      scenario: 'short-form-video',
      sourcePaths: ['C:\\media\\interview.mp4'],
    })
  })

  test('requires one source video for Short-form video', () => {
    expect(() =>
      parseScenarioRequest('short-form-video', {
        creativeBrief: '',
        options: {},
        preset: 'bold-urban',
        sourcePaths: [],
      }),
    ).toThrow('Short-form video requires exactly one source video')
  })

  test('rejects a non-video Short-form source', () => {
    expect(() =>
      parseScenarioRequest('short-form-video', {
        creativeBrief: '',
        options: {},
        preset: 'bold-urban',
        sourcePaths: ['C:\\media\\portrait.png'],
      }),
    ).toThrow('Short-form video source must be an MP4 or MOV file')
  })

  test('rejects unsupported Short-form clip durations', () => {
    expect(() =>
      parseScenarioRequest('short-form-video', {
        creativeBrief: '',
        options: {'clip-duration': 5},
        preset: 'bold-urban',
        sourcePaths: ['C:\\media\\interview.mp4'],
      }),
    ).toThrow('Expected a supported video duration')
  })
})
