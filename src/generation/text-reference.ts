import {createHash} from 'node:crypto'

import {MediaGenError} from '../application/media-gen-error.js'
import type {WebReference} from './web-reference.js'

export interface TextReferenceInput {
  content: string
  format: 'markdown' | 'text'
  title?: string
}

export interface TextReferenceRecord {
  format: 'markdown' | 'text'
  path: string
  sha256: string
  size: number
  title: string
}

export interface PreparedTextReference {
  content: string
  record: TextReferenceRecord
}

export function prepareTextReferences(
  inputs: TextReferenceInput[],
  options: {
    maxBytesPerReference?: number
    maxReferences?: number
    maxTotalBytes?: number
  } = {},
): PreparedTextReference[] {
  const maxBytesPerReference =
    options.maxBytesPerReference ?? 100_000
  const maxReferences = options.maxReferences ?? 5
  const maxTotalBytes = options.maxTotalBytes ?? 250_000
  if (inputs.length > maxReferences) {
    throw new MediaGenError(
      'invalid_text_reference',
      `At most ${maxReferences} Text References are allowed`,
      2,
    )
  }

  let totalBytes = 0
  return inputs.map((input, index) => {
    const content = input.content.replace(/\r\n?/g, '\n').trim()
    if (content.length === 0) {
      throw new MediaGenError(
        'invalid_text_reference',
        `Text Reference ${index + 1} is empty`,
        2,
      )
    }
    const contents = Buffer.from(content, 'utf8')
    if (contents.byteLength > maxBytesPerReference) {
      throw new MediaGenError(
        'invalid_text_reference',
        `Text Reference ${index + 1} exceeds the ${maxBytesPerReference} byte limit`,
        2,
      )
    }
    totalBytes += contents.byteLength
    if (totalBytes > maxTotalBytes) {
      throw new MediaGenError(
        'invalid_text_reference',
        `Text References exceed the ${maxTotalBytes} byte total limit`,
        2,
      )
    }
    const extension = input.format === 'markdown' ? 'md' : 'txt'
    return {
      content,
      record: {
        format: input.format,
        path: `inputs/text-reference-${index + 1}.${extension}`,
        sha256: createHash('sha256').update(contents).digest('hex'),
        size: contents.byteLength,
        title:
          input.title?.trim() || `Text Reference ${index + 1}`,
      },
    }
  })
}

export function formatReferenceContext(input: {
  textReferences: PreparedTextReference[]
  webReferences: WebReference[]
}): string {
  const sections: string[] = []
  if (input.webReferences.length > 0) {
    sections.push(
      [
        'Reference URLs (Media Gen does not fetch these):',
        ...input.webReferences.map(
          (reference) => `- ${reference.url}`,
        ),
      ].join('\n'),
    )
  }
  for (const reference of input.textReferences) {
    sections.push(
      [
        `Text Reference: ${reference.record.title} (${reference.record.format === 'markdown' ? 'Markdown' : 'Plain text'})`,
        reference.content,
      ].join('\n'),
    )
  }
  return sections.join('\n\n')
}
