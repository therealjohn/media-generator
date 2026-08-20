import type {TokenCredential} from '@azure/core-auth'
import {AzureCliCredential} from '@azure/identity'

import {AzureOpenAIImageAdapter} from './adapters/azure-openai-image-adapter.js'
import {AzureOpenAIChatAdapter} from './adapters/azure-openai-chat-adapter.js'
import {BFLFluxAdapter} from './adapters/bfl-flux-adapter.js'
import {MAIImageAdapter} from './adapters/mai-image-adapter.js'
import {MAIVoiceAdapter} from './adapters/mai-voice-adapter.js'
import {SoraVideoJobAdapter} from './adapters/sora-video.js'
import {createModelRuntime, type ModelRuntime} from './model-runtime.js'
import {
  createStructuredModelRuntime,
  type StructuredModelRuntime,
} from './structured-model-runtime.js'

export interface DefaultModelRuntimeDependencies {
  credential: TokenCredential
  fetch: typeof globalThis.fetch
}

export function createDefaultModelRuntime(
  dependencyOverrides: Partial<DefaultModelRuntimeDependencies> = {},
): ModelRuntime {
  const credential =
    dependencyOverrides.credential ?? new AzureCliCredential()
  const fetch =
    dependencyOverrides.fetch ??
    ((input, init) => globalThis.fetch(input, init))
  const imageDependencies = {credential, fetch}

  return createModelRuntime([
    new MAIImageAdapter(imageDependencies),
    new MAIVoiceAdapter({fetch}),
    new AzureOpenAIImageAdapter(imageDependencies),
    new BFLFluxAdapter(imageDependencies),
    new SoraVideoJobAdapter({
      fetch,
      getAccessToken: async (scope) => {
        const token = await credential.getToken(scope)
        if (token === null) {
          throw new Error('Azure CLI did not return an access token')
        }
        return token.token
      },
    }),
  ])
}

export function createDefaultStructuredModelRuntime(
  dependencyOverrides: Partial<DefaultModelRuntimeDependencies> = {},
): StructuredModelRuntime {
  const credential =
    dependencyOverrides.credential ?? new AzureCliCredential()
  const fetch =
    dependencyOverrides.fetch ??
    ((input, init) => globalThis.fetch(input, init))

  return createStructuredModelRuntime([
    new AzureOpenAIChatAdapter({
      fetch,
      getAccessToken: async (scope) => {
        const token = await credential.getToken(scope)
        if (token === null) {
          throw new Error('Azure CLI did not return an access token')
        }
        return token.token
      },
    }),
  ])
}
