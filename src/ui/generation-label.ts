import {findStyleDefinition} from '../catalog/styles.js'
import type {GenerationRecord} from './api-client.js'

export function generationSelectionLabel(
  generation: GenerationRecord,
): string {
  if (generation.selection.kind === 'generator') {
    return generation.selection.generator === 'image' ? 'Image' : 'Video'
  }

  return humanize(generation.selection.scenario)
}

export function generationStyleLabel(
  generation: GenerationRecord,
): string | undefined {
  if (generation.selection.kind !== 'generator') {
    return undefined
  }

  return (
    findStyleDefinition(generation.selection.style)?.label ??
    humanize(generation.selection.style)
  )
}

function humanize(value: string): string {
  const words = value.replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
