import {describe, expect, test} from 'vitest'

import {assembleModelPrompt} from '../../src/catalog/prompt-assembly.js'

describe('assembleModelPrompt', () => {
  test('combines a general image request with its selected Style', () => {
    expect(
      assembleModelPrompt({
        creativeBrief: 'Show the product dashboard at launch.',
        generator: 'image',
        style: 'cinematic',
      }),
    ).toBe(
      [
        'Create a general-purpose image from the Creative Brief.',
        'Use cinematic lighting, depth, and a premium visual tone.',
        'User creative brief: Show the product dashboard at launch.',
      ].join('\n'),
    )
  })
})
