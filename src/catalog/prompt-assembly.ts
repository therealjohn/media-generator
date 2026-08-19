import type {MediaType} from './models.js'
import {findStyleDefinition} from './styles.js'

export interface PromptSelection {
  creativeBrief: string
  generator: MediaType
  style: string
}

const generators: Record<MediaType, string> = {
  image: 'Create a general-purpose image from the Creative Brief.',
  video: 'Create a general-purpose video from the Creative Brief.',
}

export function assembleModelPrompt(
  selection: PromptSelection,
): string {
  const style = findStyleDefinition(selection.style)
  if (
    style === undefined ||
    !style.mediaTypes.includes(selection.generator)
  ) {
    throw new Error(
      `Style "${selection.style}" is not available for ${selection.generator} generation`,
    )
  }

  return [
    generators[selection.generator],
    style.guidance,
    `User creative brief: ${selection.creativeBrief}`,
  ].join('\n')
}
