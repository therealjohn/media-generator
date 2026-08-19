import {describe, expect, test} from 'vitest'

import {
  formatReferenceContext,
  prepareTextReferences,
} from '../../src/generation/text-reference.js'

describe('Text References', () => {
  test('prepares private input metadata without embedding content in the record', () => {
    const prepared = prepareTextReferences([
      {
        content: '# Product setup\r\n\r\nConnect the SDK.',
        format: 'markdown',
        title: 'Product documentation',
      },
    ])

    expect(prepared).toEqual([
      {
        content: '# Product setup\n\nConnect the SDK.',
        record: {
          format: 'markdown',
          path: 'inputs/text-reference-1.md',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          size: 33,
          title: 'Product documentation',
        },
      },
    ])
  })

  test('rejects empty or oversized Text References', () => {
    expect(() =>
      prepareTextReferences([{content: '   ', format: 'text'}]),
    ).toThrow('Text Reference 1 is empty')
    expect(() =>
      prepareTextReferences(
        [{content: 'x'.repeat(17), format: 'text'}],
        {maxBytesPerReference: 16},
      ),
    ).toThrow('Text Reference 1 exceeds the 16 byte limit')
  })

  test('formats transient text and URL context for the Model Prompt', () => {
    expect(
      formatReferenceContext({
        textReferences: [
          {
            content: '# Product setup\n\nConnect the SDK.',
            record: {
              format: 'markdown',
              path: 'inputs/text-reference-1.md',
              sha256: 'sha',
              size: 33,
              title: 'Product documentation',
            },
          },
        ],
        webReferences: [
          {url: 'https://docs.example.com/setup'},
        ],
      }),
    ).toBe(
      [
        'Reference URLs (Media Gen does not fetch these):',
        '- https://docs.example.com/setup',
        '',
        'Text Reference: Product documentation (Markdown)',
        '# Product setup',
        '',
        'Connect the SDK.',
      ].join('\n'),
    )
  })
})
