import {describe, expect, test} from 'vitest'

import {findModelDefinition} from '../../src/catalog/models.js'

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
})
