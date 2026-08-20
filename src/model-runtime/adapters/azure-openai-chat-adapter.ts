import {AzureCliCredential} from '@azure/identity'

import type {
  StructuredModelAdapter,
  StructuredModelRequest,
  StructuredModelResult,
} from '../structured-model-runtime.js'
import {getFoundryServicesOrigin} from './image-adapter-common.js'

const cognitiveServicesScope =
  'https://cognitiveservices.azure.com/.default'

export interface AzureOpenAIChatAdapterDependencies {
  fetch: typeof globalThis.fetch
  getAccessToken(scope: string): Promise<string>
}

const defaultDependencies: AzureOpenAIChatAdapterDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
  getAccessToken: async (scope) => {
    const token = await new AzureCliCredential().getToken(scope)
    if (token === null) {
      throw new Error('Azure CLI did not return an access token')
    }
    return token.token
  },
}

export class AzureOpenAIChatAdapter
  implements StructuredModelAdapter
{
  readonly kind = 'azure-openai-chat' as const

  readonly #dependencies: AzureOpenAIChatAdapterDependencies

  constructor(
    dependencyOverrides: Partial<AzureOpenAIChatAdapterDependencies> = {},
  ) {
    this.#dependencies = {
      ...defaultDependencies,
      ...dependencyOverrides,
    }
  }

  async generate(
    request: StructuredModelRequest,
  ): Promise<StructuredModelResult> {
    const accessToken =
      await this.#dependencies.getAccessToken(cognitiveServicesScope)
    const response = await this.#dependencies.fetch(
      `${getFoundryServicesOrigin(request.projectEndpoint)}/openai/v1/chat/completions`,
      {
        body: JSON.stringify({
          messages: [
            {content: request.systemPrompt, role: 'system'},
            {content: request.prompt, role: 'user'},
          ],
          model: request.deploymentName,
          response_format: {
            json_schema: {
              name: request.schemaName,
              schema: request.jsonSchema,
              strict: true,
            },
            type: 'json_schema',
          },
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    )
    const bodyText = await response.text()
    if (!response.ok) {
      throw new Error(
        `Planning model request failed with HTTP ${response.status}${providerMessage(bodyText)}`,
      )
    }
    const body = parseObject(bodyText, 'Planning model response')
    const choices = body.choices
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error(
        'Planning model response did not include a completion choice',
      )
    }
    const choice = choices[0]
    if (!isRecord(choice) || !isRecord(choice.message)) {
      throw new Error(
        'Planning model response did not include an assistant message',
      )
    }
    const content = choice.message.content
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error(
        'Planning model response did not include JSON content',
      )
    }

    try {
      return {value: JSON.parse(content) as unknown}
    } catch {
      throw new Error(
        'Planning model response content was not valid JSON',
      )
    }
  }
}

function providerMessage(body: string): string {
  if (body.trim().length === 0) {
    return ''
  }
  try {
    const value: unknown = JSON.parse(body)
    if (
      isRecord(value) &&
      isRecord(value.error) &&
      typeof value.error.message === 'string'
    ) {
      return `: ${value.error.message}`
    }
  } catch {
    return `: ${body.trim()}`
  }
  return `: ${body.trim()}`
}

function parseObject(
  body: string,
  description: string,
): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    throw new Error(`${description} was not valid JSON`)
  }
  if (!isRecord(value)) {
    throw new Error(`${description} was not a JSON object`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
