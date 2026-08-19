import {describe, expect, test} from 'vitest'

import {
  createAzureFoundryDiscovery,
  createFoundryDiscovery,
} from '../../src/foundry/foundry-discovery.js'

describe('FoundryDiscovery', () => {
  test('creates project clients with the supplied credential', async () => {
    const credential = {
      getToken: async () => null,
    }
    const observed: unknown[] = []
    const discovery = createAzureFoundryDiscovery({
      createClient: (endpoint, suppliedCredential) => {
        observed.push(endpoint, suppliedCredential)
        return {
          deployments: {
            list: () => toAsyncIterable([]),
          },
        }
      },
      createCredential: () => credential,
    })

    await discovery.listDeployments(
      'https://example.services.ai.azure.com/api/projects/media',
    )

    expect(observed).toEqual([
      'https://example.services.ai.azure.com/api/projects/media',
      credential,
    ])
  })

  test('normalizes project model deployments', async () => {
    const discovery = createFoundryDiscovery({
      createClient: () => ({
        deployments: {
          list: () =>
            toAsyncIterable([
              {
                capabilities: {
                  imageGeneration: 'true',
                },
                connectionName: 'connection',
                modelName: 'MAI-Image-2.5-Flash',
                modelPublisher: 'Microsoft',
                modelVersion: '2026-06-02',
                name: 'mai-fast',
                sku: {
                  capacity: 1,
                  family: 'GlobalStandard',
                  name: 'GlobalStandard',
                  size: '',
                  tier: 'Standard',
                },
                type: 'ModelDeployment',
              },
            ]),
        },
      }),
    })

    await expect(
      discovery.listDeployments(
        'https://example.services.ai.azure.com/api/projects/media',
      ),
    ).resolves.toEqual([
      {
        capabilities: {
          imageGeneration: 'true',
        },
        connectionName: 'connection',
        modelName: 'MAI-Image-2.5-Flash',
        modelPublisher: 'Microsoft',
        modelVersion: '2026-06-02',
        name: 'mai-fast',
        sku: {
          capacity: 1,
          name: 'GlobalStandard',
          tier: 'Standard',
        },
      },
    ])
  })

})

async function* toAsyncIterable<T>(
  values: T[],
): AsyncIterable<T> {
  yield* values
}
