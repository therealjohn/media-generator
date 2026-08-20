import {describe, expect, test} from 'vitest'

import {
  defaultClipSchedule,
  findModelDefinition,
  getVideoModelProfile,
  listComposableExplainerDurations,
  listVoiceDefinitions,
  resolveExplainerDuration,
} from '../../src/catalog/models.js'

describe('findModelDefinition', () => {
  test.each([
    ['MAI-Image-2.5', 'mai-image', 'image'],
    ['MAI-Image-2.5-Flash', 'mai-image', 'image'],
    ['MAI-Image-2e', 'mai-image', 'image'],
    ['gpt-image-2', 'azure-openai-image', 'image'],
    ['FLUX.1-Kontext-pro', 'bfl-flux', 'image'],
    ['FLUX-1.1-pro', 'bfl-flux', 'image'],
    ['FLUX.2-pro', 'bfl-flux', 'image'],
    ['FLUX.2-flex', 'bfl-flux', 'image'],
    ['gpt-5.4', 'azure-openai-chat', 'text'],
    ['gpt-5.4-mini', 'azure-openai-chat', 'text'],
    ['sora-2', 'sora-video', 'video'],
  ] as const)(
    'maps %s to its adapter and media type',
    (modelName, adapter, mediaType) => {
      expect(findModelDefinition(modelName)).toMatchObject({
        adapter,
        mediaType,
        modelName,
      })
    },
  )

  test('does not treat Azure Speech voices as model deployments', () => {
    expect(findModelDefinition('MAI-Voice-2')).toBeUndefined()
  })

  test('normalizes a dated GPT planning model snapshot', () => {
    expect(
      findModelDefinition('gpt-5.4-2026-03-05'),
    ).toMatchObject({
      adapter: 'azure-openai-chat',
      mediaType: 'text',
      modelName: 'gpt-5.4',
    })
  })

  test('loads Sora clip and Explainer duration capabilities from the catalog', () => {
    expect(getVideoModelProfile('sora-2')).toEqual({
      clipDurationsSeconds: [4, 8, 12, 16, 20],
      explainerDurationPresetsSeconds: [
        20, 40, 60, 180, 300, 600,
      ],
      manualDuration: {
        maxSeconds: 600,
        minSeconds: 15,
      },
      maxConcurrentRequests: 2,
      preferredClipSeconds: 20,
    })
  })

  test('normalizes manual durations to an exact model-composable total', () => {
    expect(resolveExplainerDuration('sora-2', 15)).toBe(16)
    expect(resolveExplainerDuration('sora-2', 30)).toBe(32)
    expect(resolveExplainerDuration('sora-2', 600)).toBe(600)
  })

  test('creates a preferred exact clip schedule', () => {
    expect(defaultClipSchedule('sora-2', 60)).toEqual([20, 20, 20])
    expect(defaultClipSchedule('sora-2', 28)).toEqual([20, 8])
  })

  test('lists effective manual duration values for clients', () => {
    const durations = listComposableExplainerDurations('sora-2')

    expect(durations.slice(0, 4)).toEqual([16, 20, 24, 28])
    expect(durations.at(-1)).toBe(600)
  })

  test('loads MAI Voice choices from the shared catalog', () => {
    expect(listVoiceDefinitions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'en-US-Ethan:MAI-Voice-2',
          model: 'MAI-Voice-2',
        }),
      ]),
    )
  })
})
