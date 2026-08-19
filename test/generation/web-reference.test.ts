import {describe, expect, test} from 'vitest'

import {normalizeWebReferences} from '../../src/generation/web-reference.js'

describe('normalizeWebReferences', () => {
  test('normalizes and deduplicates public HTTP(S) URLs without fetching', () => {
    expect(
      normalizeWebReferences([
        'https://docs.example.com/setup',
        'https://docs.example.com/setup',
        'http://example.com/product#overview',
      ]),
    ).toEqual([
      {url: 'https://docs.example.com/setup'},
      {url: 'http://example.com/product#overview'},
    ])
  })

  test.each([
    'not a URL',
    'file:///C:/docs/product.html',
    'https://user:secret@example.com/docs',
  ])('rejects unsupported Web Reference %s', (url) => {
    expect(() => normalizeWebReferences([url])).toThrowError(
      /Web Reference/,
    )
  })
})
