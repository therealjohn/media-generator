import {z} from 'zod'

import {
  isAzureSpeechEndpoint,
  isMicrosoftFoundryProjectEndpoint,
} from './endpoints.js'

export class WorkspaceSchemaError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceSchemaError'
  }
}

const providerConnectionSchema = z.object({
  kind: z.literal('microsoft-foundry'),
  projectEndpoint: z
    .url()
    .refine(isMicrosoftFoundryProjectEndpoint),
})

const modelDeploymentSchema = z.object({
  adapter: z.enum([
    'azure-openai-image',
    'bfl-flux',
    'mai-image',
    'mai-voice',
    'sora-video',
  ]),
  deploymentName: z.string().min(1),
  endpoint: z.url().optional(),
  model: z.string().min(1),
  provider: z.string().min(1),
})

const routeSchema = z.object({
  auto: z.array(z.string().min(1)).min(1),
})

const workspaceManifestV1Schema = z.object({
  deployments: z.record(z.string(), modelDeploymentSchema),
  export: z.object({
    defaultDirectory: z.string().min(1).optional(),
  }),
  providers: z.record(z.string(), providerConnectionSchema),
  routing: z.record(z.string(), routeSchema),
  scenarios: z.object({
    enabled: z.array(z.string().min(1)),
  }),
  schemaVersion: z.literal(1),
  workspace: z.object({
    name: z.string().min(1),
  }),
})

const workspaceManifestSchema = z.object({
  deployments: z.record(z.string(), modelDeploymentSchema),
  export: z.object({
    defaultDirectory: z.string().min(1).optional(),
  }),
  providers: z.record(z.string(), providerConnectionSchema),
  routing: z.object({
    generators: z.record(z.string(), routeSchema),
    scenarios: z.record(
      z.string(),
      z.record(z.string(), routeSchema),
    ),
  }),
  scenarios: z.object({
    enabled: z.array(z.string().min(1)),
  }),
  schemaVersion: z.literal(2),
  workspace: z.object({
    name: z.string().min(1),
  }),
})

const registrySchema = z.object({
  schemaVersion: z.literal(1),
  workspaces: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      projectDirectory: z.string().min(1),
      slug: z.string().min(1),
    }),
  ),
})

const localProfileSchema = z.object({
  credentials: z
    .record(
      z.string(),
      z.object({
        apiKeyEnvironmentVariable: z.string().min(1).optional(),
      }),
    )
    .optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  schemaVersion: z.literal(1),
  speech: z
    .object({
      apiKey: z.string().min(1),
      defaultVoice: z.string().min(1),
      endpoint: z.url().refine(isAzureSpeechEndpoint),
    })
    .optional(),
})

export type WorkspaceManifest = z.infer<
  typeof workspaceManifestSchema
>
export type RegistryFile = z.infer<typeof registrySchema>
export type LocalProfile = z.infer<typeof localProfileSchema>

export function parseRegistry(value: unknown): RegistryFile {
  return parseVersionedFile(
    value,
    registrySchema,
    'registry',
  )
}

export function parseLocalProfile(value: unknown): LocalProfile {
  return parseVersionedFile(
    value,
    localProfileSchema,
    'local profile',
  )
}

export function parseWorkspaceManifest(
  value: unknown,
): WorkspaceManifest {
  const schemaVersion =
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value
      ? value.schemaVersion
      : undefined

  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new WorkspaceSchemaError(
      'unsupported_manifest_version',
      `Workspace manifest schema version ${String(schemaVersion)} is not supported`,
    )
  }

  if (schemaVersion === 1) {
    const result = workspaceManifestV1Schema.safeParse(value)
    if (!result.success) {
      throw new WorkspaceSchemaError(
        'invalid_manifest',
        `Workspace manifest is invalid: ${z.prettifyError(result.error)}`,
      )
    }

    const legacy = result.data
    const generators: Record<string, {auto: string[]}> = {}
    const imageRoute =
      legacy.routing.image ??
      legacy.routing['product-marketing-image']
    const videoRoute =
      legacy.routing.video ??
      legacy.routing['product-marketing-video']
    if (imageRoute !== undefined) {
      generators.image = imageRoute
    }
    if (videoRoute !== undefined) {
      generators.video = videoRoute
    }

    return removeObsoleteSpeechDeployments({
      ...legacy,
      routing: {
        generators,
        scenarios: {},
      },
      scenarios: {
        enabled: legacy.scenarios.enabled.filter(
          (scenario) =>
            scenario !== 'product-marketing-image' &&
            scenario !== 'product-marketing-video',
        ),
      },
      schemaVersion: 2,
    })
  }

  const result = workspaceManifestSchema.safeParse(value)
  if (!result.success) {
    throw new WorkspaceSchemaError(
      'invalid_manifest',
      `Workspace manifest is invalid: ${z.prettifyError(result.error)}`,
    )
  }

  return removeObsoleteSpeechDeployments(result.data)
}

function removeObsoleteSpeechDeployments(
  manifest: WorkspaceManifest,
): WorkspaceManifest {
  const obsoleteDeploymentIds = new Set(
    Object.entries(manifest.deployments)
      .filter(([, deployment]) => deployment.adapter === 'mai-voice')
      .map(([id]) => id),
  )
  if (obsoleteDeploymentIds.size === 0) {
    return manifest
  }

  const deployments = Object.fromEntries(
    Object.entries(manifest.deployments).filter(
      ([id]) => !obsoleteDeploymentIds.has(id),
    ),
  )
  const cleanRoutes = (
    routes: Record<string, {auto: string[]}>,
  ): Record<string, {auto: string[]}> =>
    Object.fromEntries(
      Object.entries(routes).flatMap(([name, route]) => {
        const auto = route.auto.filter(
          (id) => !obsoleteDeploymentIds.has(id),
        )
        return auto.length === 0 ? [] : [[name, {auto}]]
      }),
    )

  return {
    ...manifest,
    deployments,
    routing: {
      generators: cleanRoutes(manifest.routing.generators),
      scenarios: Object.fromEntries(
        Object.entries(manifest.routing.scenarios).map(
          ([scenario, roles]) => [scenario, cleanRoutes(roles)],
        ),
      ),
    },
  }
}

function parseVersionedFile<T>(
  value: unknown,
  schema: z.ZodType<T>,
  name: string,
): T {
  const schemaVersion =
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value
      ? value.schemaVersion
      : undefined

  if (schemaVersion !== 1) {
    throw new WorkspaceSchemaError(
      `unsupported_${name.replaceAll(' ', '_')}_version`,
      `${capitalize(name)} schema version ${String(schemaVersion)} is not supported`,
    )
  }

  const result = schema.safeParse(value)
  if (!result.success) {
    throw new WorkspaceSchemaError(
      `invalid_${name.replaceAll(' ', '_')}`,
      `${capitalize(name)} is invalid: ${z.prettifyError(result.error)}`,
    )
  }

  return result.data
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`
}
