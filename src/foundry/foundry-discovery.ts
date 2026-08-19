export interface FoundryDeployment {
  capabilities: Record<string, string>
  connectionName?: string
  modelName: string
  modelPublisher: string
  modelVersion: string
  name: string
  sku: {
    capacity: number
    name: string
    tier: string
  }
}

export interface FoundryDiscovery {
  listDeployments(projectEndpoint: string): Promise<FoundryDeployment[]>
}

interface DeploymentLike {
  name: string
  type: string
}

interface ModelDeploymentLike extends DeploymentLike {
  capabilities: Record<string, string>
  connectionName?: string
  modelName: string
  modelPublisher: string
  modelVersion: string
  name: string
  sku: {
    capacity: number
    name: string
    tier: string
  }
  type: string
}

interface FoundryClientLike {
  deployments: {
    list(): AsyncIterable<DeploymentLike>
  }
}

export interface FoundryDiscoveryDependencies {
  createClient(projectEndpoint: string): FoundryClientLike
}

export interface AzureFoundryDiscoveryDependencies {
  createClient(
    projectEndpoint: string,
    credential: TokenCredential,
  ): FoundryClientLike
  createCredential(): TokenCredential
}

const defaultAzureDependencies: AzureFoundryDiscoveryDependencies = {
  createClient: (projectEndpoint, credential) =>
    new AIProjectClient(projectEndpoint, credential),
  createCredential: () => new AzureCliCredential(),
}

export function createAzureFoundryDiscovery(
  dependencyOverrides: Partial<AzureFoundryDiscoveryDependencies> = {},
): FoundryDiscovery {
  const dependencies = {
    ...defaultAzureDependencies,
    ...dependencyOverrides,
  }
  const credential = dependencies.createCredential()

  return createFoundryDiscovery({
    createClient: (projectEndpoint) =>
      dependencies.createClient(projectEndpoint, credential),
  })
}

export function createFoundryDiscovery(
  dependencies: FoundryDiscoveryDependencies,
): FoundryDiscovery {
  return {
    async listDeployments(projectEndpoint) {
      const deployments: FoundryDeployment[] = []
      const client = dependencies.createClient(projectEndpoint)
      for await (const deployment of client.deployments.list()) {
        if (!isModelDeployment(deployment)) {
          continue
        }

        function isModelDeployment(
          deployment: DeploymentLike,
        ): deployment is ModelDeploymentLike {
          return (
            deployment.type === 'ModelDeployment' &&
            'capabilities' in deployment &&
            'modelName' in deployment &&
            'modelPublisher' in deployment &&
            'modelVersion' in deployment &&
            'sku' in deployment
          )
        }

        deployments.push({
          capabilities: deployment.capabilities,
          connectionName: deployment.connectionName,
          modelName: deployment.modelName,
          modelPublisher: deployment.modelPublisher,
          modelVersion: deployment.modelVersion,
          name: deployment.name,
          sku: {
            capacity: deployment.sku.capacity,
            name: deployment.sku.name,
            tier: deployment.sku.tier,
          },
        })
      }

      return deployments
    },
  }
}
import type {TokenCredential} from '@azure/core-auth'
import {AIProjectClient} from '@azure/ai-projects'
import {AzureCliCredential} from '@azure/identity'
