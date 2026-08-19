import {randomUUID} from 'node:crypto'
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path'

import {ulid} from 'ulid'

import {
  createAuthModule,
  type AuthModule,
  type AuthStatus,
} from '../auth/auth-module.js'
import {createChildProcessRunner} from '../auth/child-process-runner.js'
import {
  findModelDefinition,
  type MediaType,
  type ModelAdapterKind,
  type ModelMediaType,
} from '../catalog/models.js'
import {defaultStyleFor} from '../catalog/styles.js'
import {
  getScenarioDefinition,
  listScenarioDefinitions,
  parseScenarioRequest,
  requiredScenarioRoles,
  scenarioRolesForRequest,
} from '../catalog/scenarios.js'
import {
  createAzureFoundryDiscovery,
  type FoundryDiscovery,
} from '../foundry/foundry-discovery.js'
import {
  createGenerationStore,
  type GenerationRecord,
} from '../generation/generation-store.js'
import type {TextReferenceInput} from '../generation/text-reference.js'
import {
  createCreationModule,
  type CreateRequest,
  type ResolvedCreationDeployment,
} from '../creation/creation-module.js'
import {
  type ModelRuntime,
} from '../model-runtime/model-runtime.js'
import {createDefaultModelRuntime} from '../model-runtime/default-runtime.js'
import {MediaGenError} from './media-gen-error.js'
import {
  parseRegistry,
  parseLocalProfile,
  parseWorkspaceManifest,
  type LocalProfile,
  type RegistryFile,
  type WorkspaceManifest,
} from '../workspace/schemas.js'
import {withFileLock} from '../workspace/file-lock.js'
import {
  isAzureSpeechEndpoint,
  isMicrosoftFoundryProjectEndpoint,
} from '../workspace/endpoints.js'

export interface CommandContext {
  bin: string
  cwd: string
  mediaGenHome: string
}

function scenarioView(
  manifest: WorkspaceManifest,
  localProfile: LocalProfile,
  scenario: ReturnType<typeof listScenarioDefinitions>[number],
): ScenarioView {
  return {
    ...scenario,
    enabled: manifest.scenarios.enabled.includes(scenario.id),
    readiness: scenarioReadiness(manifest, localProfile, scenario),
  }
}

function generationStyle(record: GenerationRecord): string {
  return record.selection.kind === 'generator'
    ? record.selection.style
    : defaultStyleFor(record.mediaType)
}

export type MediaGenCommand =
  | {type: 'auth-login'}
  | {type: 'auth-logout'}
  | {type: 'auth-status'}
  | {
      endpoint: string
      name: string
      type: 'configure-foundry'
    }
  | {
      apiKey: string
      endpoint: string
      type: 'configure-speech'
      voice: string
    }
  | {type: 'doctor'}
  | {type: 'home'}
  | {type: 'init'}
  | {
      force: boolean
      request: CreateRequest
      type: 'create'
    }
  | {
      creativeBrief: string
      controls?: Record<string, unknown>
      deploymentId?: string
      force?: boolean
      mediaType: MediaType
      referencePaths: string[]
      style: string
      textReferences?: TextReferenceInput[]
      type: 'generate'
      webReferenceUrls?: string[]
    }
  | {type: 'generations-list'}
  | {force: boolean; type: 'generations-cleanup'}
  | {id: string; type: 'generations-get'}
  | {
      creativeBrief: string
      id: string
      style?: string
      type: 'generations-edit'
    }
  | {force: boolean; id: string; type: 'generations-delete'}
  | {
      force: boolean
      id: string
      to?: string
      type: 'generations-export'
    }
  | {from: string; type: 'relink'}
  | {
      creativeBrief?: string
      deploymentOverrides?: Record<string, string>
      force?: boolean
      id: string
      options?: Record<string, unknown>
      preset?: string
      style?: string
      type: 'generations-recreate'
    }
  | {ids: string[]; type: 'generations-reference'}
  | {type: 'scenarios-list'}
  | {id: string; type: 'scenarios-get'}
  | {
      enabled: boolean
      id: string
      type: 'scenarios-set-enabled'
    }
  | {type: 'settings-get'}

export interface UninitializedHomeResult {
  bin: string
  description: string
  help: string[]
  manifest: {
    exists: false
    path: string
  }
  projectDirectory: string
  state: 'uninitialized'
  type: 'home'
}

export interface ReadyHomeResult {
  bin: string
  description: string
  help: string[]
  manifest: {
    exists: true
    path: string
  }
  projectDirectory: string
  state: 'ready'
  type: 'home'
  workspace: {
    id: string
    path: string
  }
}

export type HomeResult = ReadyHomeResult | UninitializedHomeResult

export interface DoctorResult {
  checks: Array<{
    detail: string
    name: string
    status: 'fail' | 'pass'
  }>
  help: string[]
  state: 'healthy' | 'unhealthy'
  type: 'doctor'
}

export interface RelinkResult {
  from: string
  state: 'relinked'
  to: string
  type: 'relink'
  workspace: {
    id: string
    path: string
  }
}

export type AuthResult =
  | (AuthStatus & {type: 'auth'})
  | {state: 'login-completed'; type: 'auth'}
  | {state: 'logout-completed'; type: 'auth'}

export interface ConfigureFoundryResult {
  deployments: Array<{
    adapter: ModelAdapterKind
    deploymentName: string
    id: string
    mediaType: ModelMediaType
    model: string
  }>
  provider: {
    endpoint: string
    name: string
  }
  type: 'configure-foundry'
  unsupported: Array<{
    deploymentName: string
    model: string
  }>
}

export interface ConfigureSpeechResult {
  endpoint: string
  state: 'configured'
  type: 'configure-speech'
  voice: string
}

export interface GenerateResult {
  generation: GenerationRecord
  type: 'generate'
}

export interface CreateResult {
  generation: GenerationRecord
  type: 'create'
}

export interface ScenariosListResult {
  scenarios: Array<{
    description: string
    enabled: boolean
    id: string
    mediaType: 'image' | 'video'
    ready: boolean
    title: string
  }>
  type: 'scenarios-list'
}

export type ScenarioView =
  ReturnType<typeof listScenarioDefinitions>[number] & {
    enabled: boolean
    readiness: {
      missingRoles: string[]
      state: 'not-ready' | 'ready'
    }
  }

export interface ScenariosGetResult {
  scenario: ScenarioView
  type: 'scenarios-get'
}

export interface ScenariosSetEnabledResult {
  enabled: boolean
  id: string
  type: 'scenarios-set-enabled'
}

export interface GenerationsListResult {
  count: number
  generations: GenerationRecord[]
  type: 'generations-list'
}

export interface GenerationsGetResult {
  generation: GenerationRecord
  type: 'generations-get'
}

export interface GenerationsDeleteResult {
  id: string
  state: 'deleted'
  type: 'generations-delete'
}

export interface GenerationsCleanupResult {
  count: number
  deleted: string[]
  type: 'generations-cleanup'
}

export interface GenerationsEditResult {
  generation: GenerationRecord
  type: 'generations-edit'
}

export interface GenerationsExportResult {
  files: string[]
  id: string
  type: 'generations-export'
}

export interface GenerationsRecreateResult {
  generation: GenerationRecord
  type: 'generations-recreate'
}

export interface GenerationsReferenceResult {
  references: Array<{
    generationId: string
    mediaType: string
    path: string
  }>
  type: 'generations-reference'
}

export interface SettingsGetResult {
  auth: AuthStatus
  manifest: WorkspaceManifest
  scenarios: ScenarioView[]
  speech:
    | {configured: false}
    | {
        configured: true
        defaultVoice: string
        endpoint: string
      }
  type: 'settings-get'
}

export interface InitResult {
  help: string[]
  manifest: {
    created: boolean
    path: string
  }
  projectDirectory: string
  state: 'already-initialized' | 'initialized'
  type: 'init'
  workspace: {
    id: string
    path: string
  }
}

export type MediaGenResult =
  | AuthResult
  | ConfigureFoundryResult
  | ConfigureSpeechResult
  | CreateResult
  | DoctorResult
  | GenerateResult
  | GenerationsDeleteResult
  | GenerationsCleanupResult
  | GenerationsEditResult
  | GenerationsExportResult
  | GenerationsGetResult
  | GenerationsListResult
  | GenerationsRecreateResult
  | GenerationsReferenceResult
  | HomeResult
  | InitResult
  | RelinkResult
  | ScenariosGetResult
  | ScenariosListResult
  | ScenariosSetEnabledResult
  | SettingsGetResult

export interface MediaGenApplication {
  execute(
    command: MediaGenCommand,
    context: CommandContext,
  ): Promise<MediaGenResult>
}

export interface ApplicationDependencies {
  authModule: AuthModule
  createGenerationId: () => string
  createWorkspaceId: () => string
  foundryDiscovery: FoundryDiscovery
  modelRuntime: ModelRuntime
  now: () => Date
}

const defaultDependencies: ApplicationDependencies = {
  authModule: createAuthModule(createChildProcessRunner()),
  createGenerationId: () => ulid(),
  createWorkspaceId: () => randomUUID(),
  foundryDiscovery: createAzureFoundryDiscovery(),
  modelRuntime: createDefaultModelRuntime(),
  now: () => new Date(),
}

const description =
  'Local-first image and video generation workspace'
const initializedHelp = ['Run `mg`', 'Run `mg --help`']
const readyHelp = ['Run `mg --help`']
const uninitializedHelp = ['Run `mg init`', 'Run `mg --help`']

function scenarioReadiness(
  manifest: WorkspaceManifest,
  localProfile: LocalProfile,
  scenario: ReturnType<typeof listScenarioDefinitions>[number],
): {
  missingRoles: string[]
  state: 'not-ready' | 'ready'
} {
  const routes = manifest.routing.scenarios[scenario.id] ?? {}
  const missingRoles = requiredScenarioRoles(scenario).filter(
    (role) =>
      scenario.roleMediaTypes[role] === 'audio'
        ? localProfile.speech === undefined
        : routes[role]?.auto[0] === undefined,
  )
  return {
    missingRoles,
    state: missingRoles.length === 0 ? 'ready' : 'not-ready',
  }
}

export function createMediaGenApplication(
  dependencyOverrides: Partial<ApplicationDependencies> = {},
): MediaGenApplication {
  const dependencies = {
    ...defaultDependencies,
    ...dependencyOverrides,
  }

  return {
    async execute(command, context) {
      switch (command.type) {
        case 'auth-status':
          return {...(await dependencies.authModule.status()), type: 'auth'}
        case 'auth-login':
          return {...(await dependencies.authModule.login()), type: 'auth'}
        case 'auth-logout':
          return {...(await dependencies.authModule.logout()), type: 'auth'}
        case 'configure-foundry':
          return configureFoundry(
            context,
            command.name,
            command.endpoint,
            dependencies.foundryDiscovery,
          )
        case 'configure-speech':
          return configureSpeech(
            context,
            command.endpoint,
            command.apiKey,
            command.voice,
          )
        case 'doctor':
          return doctorWorkspace(context, dependencies.authModule)
        case 'create':
          return createMedia(context, command, dependencies)
        case 'generate':
          return generateMedia(context, command, dependencies)
        case 'generations-delete':
          return deleteGeneration(context, command, dependencies)
        case 'generations-cleanup':
          return cleanupGenerations(context, command, dependencies)
        case 'generations-export':
          return exportGeneration(context, command, dependencies)
        case 'generations-edit':
          return editGeneration(context, command, dependencies)
        case 'generations-get':
          return getGeneration(context, command.id, dependencies)
        case 'generations-list':
          return listGenerations(context, dependencies)
        case 'generations-recreate':
          return recreateGeneration(context, command, dependencies)
        case 'generations-reference':
          return referenceGenerations(context, command, dependencies)
        case 'init':
          return initializeWorkspace(context, dependencies)
        case 'relink':
          return relinkWorkspace(context, command.from)
        case 'scenarios-list':
          return listScenarios(context)
        case 'scenarios-get':
          return getScenario(context, command.id)
        case 'scenarios-set-enabled':
          return setScenarioEnabled(
            context,
            command.id,
            command.enabled,
          )
        case 'settings-get':
          return getSettings(context, dependencies.authModule)
        case 'home':
          return describeWorkspace(context)
      }

      async function listScenarios(
        context: CommandContext,
      ): Promise<ScenariosListResult> {
        const resolvedWorkspace = await resolveWorkspace(context)
        const manifest = await readManifest(
          resolvedWorkspace.manifestPath,
        )
        const localProfile = await readLocalProfile(
          resolvedWorkspace.mediaWorkspacePath,
        )
        return {
          scenarios: listScenarioDefinitions().map((scenario) => {
            const view = scenarioView(
              manifest,
              localProfile,
              scenario,
            )
            return {
              description: view.description,
              enabled: view.enabled,
              id: view.id,
              mediaType: view.mediaType,
              ready: view.readiness.state === 'ready',
              title: view.title,
            }
          }),
          type: 'scenarios-list',
        }
      }

      async function getScenario(
        context: CommandContext,
        id: string,
      ): Promise<ScenariosGetResult> {
        const scenario = getScenarioDefinition(id)
        if (scenario === undefined) {
          throw new MediaGenError(
            'unknown_scenario',
            `Scenario "${id}" is not built into Media Gen`,
          )
        }
        const resolvedWorkspace = await resolveWorkspace(context)
        const manifest = await readManifest(
          resolvedWorkspace.manifestPath,
        )
        const localProfile = await readLocalProfile(
          resolvedWorkspace.mediaWorkspacePath,
        )
        return {
          scenario: scenarioView(manifest, localProfile, scenario),
          type: 'scenarios-get',
        }
      }

      async function setScenarioEnabled(
        context: CommandContext,
        id: string,
        enabled: boolean,
      ): Promise<ScenariosSetEnabledResult> {
        const scenario = getScenarioDefinition(id)
        if (scenario === undefined) {
          throw new MediaGenError(
            'unknown_scenario',
            `Scenario "${id}" is not built into Media Gen`,
          )
        }
        const manifestPath = await requireManifest(context.cwd)
        await withFileLock(manifestPath, async () => {
          const manifest = await readManifest(manifestPath)
          if (enabled) {
            const scenarioRoutes =
              manifest.routing.scenarios[scenario.id] ?? {}
            const generatorRoute =
              manifest.routing.generators[scenario.mediaType]
            if (generatorRoute !== undefined) {
              for (const role of scenario.routingRoles) {
                if (
                  scenario.roleMediaTypes[role] !== scenario.mediaType
                ) {
                  continue
                }
                scenarioRoutes[role] ??= {
                  auto: [...generatorRoute.auto],
                }
              }
            }
            manifest.routing.scenarios[scenario.id] = scenarioRoutes
          }
          manifest.scenarios.enabled = enabled
            ? [...new Set([...manifest.scenarios.enabled, scenario.id])]
            : manifest.scenarios.enabled.filter(
                (enabledScenario) => enabledScenario !== scenario.id,
              )
          await writeJsonAtomic(manifestPath, manifest)
        })

        return {
          enabled,
          id: scenario.id,
          type: 'scenarios-set-enabled',
        }
      }

      async function cleanupGenerations(
        context: CommandContext,
        command: Extract<
          MediaGenCommand,
          {type: 'generations-cleanup'}
        >,
        dependencies: ApplicationDependencies,
      ): Promise<GenerationsCleanupResult> {
        if (!command.force) {
          throw new MediaGenError(
            'confirmation_required',
            'Cleaning failed Generations requires --force',
            2,
            ['Rerun the command with `--force`'],
          )
        }
        const store = await createWorkspaceGenerationStore(context, dependencies)
        const generations = await store.list()
        const deletable = generations.filter(
          (generation) =>
            generation.status === 'failed' ||
            generation.status === 'interrupted',
        )
        await Promise.all(
          deletable.map((generation) => store.delete(generation.id)),
        )
        return {
          count: deletable.length,
          deleted: deletable.map((generation) => generation.id),
          type: 'generations-cleanup',
        }
      }

      async function getSettings(
        context: CommandContext,
        authModule: AuthModule,
      ): Promise<SettingsGetResult> {
        const resolvedWorkspace = await resolveWorkspace(context)
        const manifest = await readManifest(
          resolvedWorkspace.manifestPath,
        )
        const localProfile = await readLocalProfile(
          resolvedWorkspace.mediaWorkspacePath,
        )
        return {
          auth: await authModule.status(),
          manifest,
          scenarios: listScenarioDefinitions().map((scenario) =>
            scenarioView(manifest, localProfile, scenario),
          ),
          speech:
            localProfile.speech === undefined
              ? {configured: false}
              : {
                  configured: true,
                  defaultVoice: localProfile.speech.defaultVoice,
                  endpoint: localProfile.speech.endpoint,
                },
          type: 'settings-get',
        }
      }
    },
  }
}

async function configureFoundry(
  context: CommandContext,
  name: string,
  endpoint: string,
  discovery: FoundryDiscovery,
): Promise<ConfigureFoundryResult> {
  if (!isMicrosoftFoundryProjectEndpoint(endpoint)) {
    throw new MediaGenError(
      'invalid_foundry_endpoint',
      'Microsoft Foundry project endpoint must use a services.ai.azure.com hostname',
      2,
    )
  }
  const manifestPath = await requireManifest(context.cwd)
  const discovered = await discovery.listDeployments(endpoint)
  const deployments: ConfigureFoundryResult['deployments'] = []
  const unsupported: ConfigureFoundryResult['unsupported'] = []

  for (const deployment of discovered) {
    const definition = findModelDefinition(deployment.modelName)
    if (definition === undefined) {
      unsupported.push({
        deploymentName: deployment.name,
        model: deployment.modelName,
      })
      continue
    }

    const id = `${name}:${deployment.name}`
    deployments.push({
      adapter: definition.adapter,
      deploymentName: deployment.name,
      id,
      mediaType: definition.mediaType,
      model: definition.modelName,
    })
  }

  await withFileLock(manifestPath, async () => {
    const manifest = await readManifest(manifestPath)
    manifest.providers[name] = {
      kind: 'microsoft-foundry',
      projectEndpoint: endpoint,
    }
    for (const deployment of deployments) {
      manifest.deployments[deployment.id] = {
        adapter: deployment.adapter,
        deploymentName: deployment.deploymentName,
        model: deployment.model,
        provider: name,
      }
    }
    const imageDeployments = deployments.filter(
      (deployment) => deployment.mediaType === 'image',
    )
    if (imageDeployments.length > 0) {
      manifest.routing.generators.image = {
        auto: appendUnique(
          manifest.routing.generators.image?.auto ?? [],
          imageDeployments.map((deployment) => deployment.id),
        ),
      }
    }
    const videoDeployments = deployments.filter(
      (deployment) => deployment.mediaType === 'video',
    )
    if (videoDeployments.length > 0) {
      manifest.routing.generators.video = {
        auto: appendUnique(
          manifest.routing.generators.video?.auto ?? [],
          videoDeployments.map((deployment) => deployment.id),
        ),
      }
      for (const scenario of listScenarioDefinitions()) {
        const scenarioRoutes =
          manifest.routing.scenarios[scenario.id] ?? {}
        for (const role of scenario.routingRoles) {
          const eligibleDeployments = deployments.filter(
            (deployment) =>
              deployment.mediaType ===
              scenario.roleMediaTypes[role],
          )
          if (eligibleDeployments.length === 0) {
            continue
          }
          scenarioRoutes[role] = {
            auto: appendUnique(
              scenarioRoutes[role]?.auto ?? [],
              eligibleDeployments.map(
                (deployment) => deployment.id,
              ),
            ),
          }
        }
        manifest.routing.scenarios[scenario.id] = scenarioRoutes
      }
    }

    function appendUnique(existing: string[], additions: string[]): string[] {
      return [
        ...existing,
        ...additions.filter((addition) => !existing.includes(addition)),
      ]
    }
    await writeJsonAtomic(manifestPath, manifest)
  })

  return {
    deployments,
    provider: {endpoint, name},
    type: 'configure-foundry',
    unsupported,
  }
}

async function configureSpeech(
  context: CommandContext,
  endpoint: string,
  apiKey: string,
  voice: string,
): Promise<ConfigureSpeechResult> {
  const resolvedWorkspace = await resolveWorkspace(context)
  const localProfilePath = join(
    resolvedWorkspace.mediaWorkspacePath,
    'local.json',
  )
  const normalizedEndpoint = normalizeSpeechEndpoint(endpoint)
  const normalizedApiKey = apiKey.trim()
  const normalizedVoice = voice.trim()
  if (normalizedApiKey.length === 0) {
    throw new MediaGenError(
      'missing_argument',
      'Azure Speech configuration requires an API key',
      2,
    )
  }
  if (normalizedVoice.length === 0) {
    throw new MediaGenError(
      'missing_argument',
      'Azure Speech configuration requires a voice name',
      2,
    )
  }
  await withFileLock(localProfilePath, async () => {
    const localProfile = await readLocalProfile(
      resolvedWorkspace.mediaWorkspacePath,
    )
    localProfile.speech = {
      apiKey: normalizedApiKey,
      defaultVoice: normalizedVoice,
      endpoint: normalizedEndpoint,
    }
    await writeJsonAtomic(localProfilePath, localProfile, {
      mode: 0o600,
    })
  })
  return {
    endpoint: normalizedEndpoint,
    state: 'configured',
    type: 'configure-speech',
    voice: normalizedVoice,
  }
}

async function deleteGeneration(
  context: CommandContext,
  command: Extract<MediaGenCommand, {type: 'generations-delete'}>,
  dependencies: ApplicationDependencies,
): Promise<GenerationsDeleteResult> {
  if (!command.force) {
    throw new MediaGenError(
      'confirmation_required',
      `Deleting Generation "${command.id}" requires --force`,
      2,
      ['Rerun the command with `--force`'],
    )
  }
  const store = await createWorkspaceGenerationStore(context, dependencies)
  return {
    ...(await store.delete(command.id)),
    type: 'generations-delete',
  }
}

async function exportGeneration(
  context: CommandContext,
  command: Extract<MediaGenCommand, {type: 'generations-export'}>,
  dependencies: ApplicationDependencies,
): Promise<GenerationsExportResult> {
  const manifestPath = await requireManifest(context.cwd)
  const manifest = await readManifest(manifestPath)
  const projectDirectory = dirname(dirname(manifestPath))
  const workspace = await findRegisteredWorkspace(
    context.mediaGenHome,
    projectDirectory,
  )
  const mediaWorkspacePath = workspacePath(
    context.mediaGenHome,
    workspace,
  )
  const store = createGenerationStore(mediaWorkspacePath, {
    createId: dependencies.createGenerationId,
    now: dependencies.now,
  })
  const generation = await store.get(command.id)
  const configuredTarget =
    command.to ?? manifest.export.defaultDirectory
  if (configuredTarget === undefined) {
    throw new MediaGenError(
      'export_destination_required',
      'No export destination is configured',
      2,
      ['Use `--to <path>` or configure export.defaultDirectory'],
    )
  }

  const targetDirectory = resolve(
    projectDirectory,
    configuredTarget,
  )
  const relativeTarget = relative(
    projectDirectory,
    targetDirectory,
  )
  if (
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget)
  ) {
    throw new MediaGenError(
      'invalid_export_destination',
      'Export destination must stay inside the Project Directory',
      2,
    )
  }
  await mkdir(targetDirectory, {recursive: true})
  const files: string[] = []

  for (const output of generation.outputs) {
    const source = join(
      mediaWorkspacePath,
      'generations',
      generation.id,
      output.path,
    )
    const destination = join(
      targetDirectory,
      `${generation.id}-${basename(output.path)}`,
    )
    if ((await pathExists(destination)) && !command.force) {
      throw new MediaGenError(
        'confirmation_required',
        `Export destination "${destination}" already exists and requires --force`,
        2,
        ['Rerun the command with `--force`'],
      )
    }
    await copyFile(source, destination)
    files.push(destination)
  }

  return {
    files,
    id: generation.id,
    type: 'generations-export',
  }
}

async function editGeneration(
  context: CommandContext,
  command: Extract<MediaGenCommand, {type: 'generations-edit'}>,
  dependencies: ApplicationDependencies,
): Promise<GenerationsEditResult> {
  const resolvedWorkspace = await resolveWorkspace(context)
  const store = createGenerationStore(
    resolvedWorkspace.mediaWorkspacePath,
    {
      createId: dependencies.createGenerationId,
      now: dependencies.now,
    },
  )
  const source = await store.get(command.id)
  const output = source.outputs[0]
  if (output === undefined) {
    throw new Error(`Generation "${source.id}" has no output to edit`)
  }
  const result = await generateMedia(
    context,
    {
      creativeBrief: command.creativeBrief,
      mediaType: source.mediaType,
      referencePaths: [
        join(
          resolvedWorkspace.mediaWorkspacePath,
          'generations',
          source.id,
          output.path,
        ),
      ],
      style: command.style ?? generationStyle(source),
      type: 'generate',
    },
    dependencies,
    [source.id],
  )

  return {
    generation: result.generation,
    type: 'generations-edit',
  }
}

async function generateMedia(
  context: CommandContext,
  command: Extract<MediaGenCommand, {type: 'generate'}>,
  dependencies: ApplicationDependencies,
  sourceGenerations: string[] = [],
): Promise<GenerateResult> {
  const result = await createMedia(
    context,
    {
      force: command.force === true,
      request: {
        controls:
          command.mediaType === 'image'
            ? {
                height: 1024,
                width: 1024,
                ...command.controls,
              }
            : {
                height: 720,
                nSeconds: 5,
                nVariants: 1,
                width: 1280,
                ...command.controls,
              },
        creativeBrief: command.creativeBrief,
        deploymentId: command.deploymentId,
        generator: command.mediaType,
        kind: 'generator',
        referencePaths: command.referencePaths,
        style: command.style,
        textReferences: command.textReferences,
        webReferenceUrls: command.webReferenceUrls,
      },
      type: 'create',
    },
    dependencies,
    sourceGenerations,
  )
  return {
    generation: result.generation,
    type: 'generate',
  }
}

async function createMedia(
  context: CommandContext,
  command: Extract<MediaGenCommand, {type: 'create'}>,
  dependencies: ApplicationDependencies,
  sourceGenerations: string[] = [],
): Promise<CreateResult> {
  const manifestPath = await requireManifest(context.cwd)
  const manifest = await readManifest(manifestPath)
  if (
    command.request.kind === 'scenario' &&
    !manifest.scenarios.enabled.includes(command.request.scenario)
  ) {
    throw new MediaGenError(
      'scenario_disabled',
      `Scenario "${command.request.scenario}" is not enabled`,
      2,
      [`Run \`mg scenarios enable ${command.request.scenario}\``],
    )
  }
  const projectDirectory = dirname(dirname(manifestPath))
  const workspace = await findRegisteredWorkspace(
    context.mediaGenHome,
    projectDirectory,
  )
  const mediaWorkspacePath = workspacePath(
    context.mediaGenHome,
    workspace,
  )
  const localProfile = await readLocalProfile(mediaWorkspacePath)
  const request = command.request
  const resolved = resolveCreationDeployments(
    manifest,
    localProfile,
    request,
    command.force,
  )
  const creation = createCreationModule({
    modelRuntime: dependencies.modelRuntime,
    store: createGenerationStore(mediaWorkspacePath, {
      createId: dependencies.createGenerationId,
      now: dependencies.now,
    }),
    workspacePath: mediaWorkspacePath,
  })

  try {
    return {
      generation: await creation.create({
        deployments: resolved.deployments,
        force: command.force,
        request,
        sourceGenerations,
      }),
      type: 'create',
    }
  } catch (error) {
    const fallback = resolved.fallback
    if (fallback !== undefined) {
      throw new MediaGenError(
        'fallback_available',
        `Creation failed with "${resolved.primaryDeploymentId}"; retry "${fallback.deploymentId}" only after approval`,
        2,
        [
          request.kind === 'generator'
            ? `Rerun with \`--model ${fallback.deploymentId} --force\` after approval`
            : `Rerun with \`--deployment ${fallback.role}=${fallback.deploymentId} --force\` after approval`,
        ],
      )
    }

    throw error
  }
}

function resolveCreationDeployments(
  manifest: WorkspaceManifest,
  localProfile: LocalProfile,
  request: CreateRequest,
  force: boolean,
): {
  deployments: Record<string, ResolvedCreationDeployment>
  fallback?: {deploymentId: string; role: string}
  primaryDeploymentId: string
} {
  const roles =
    request.kind === 'generator'
      ? [
          {
            mediaType: request.generator,
            override: request.deploymentId,
            role: 'generation',
            route:
              manifest.routing.generators[request.generator]?.auto ?? [],
          },
        ]
      : scenarioRolesForRequest(request).map(
          (role) => ({
            mediaType: getScenarioDefinition(request.scenario)!
              .roleMediaTypes[role]!,
            override: request.deploymentOverrides[role],
            role,
            route:
              manifest.routing.scenarios[request.scenario]?.[role]
                ?.auto ?? [],
          }),
        )
  const deployments: Record<string, ResolvedCreationDeployment> = {}
  let primaryDeploymentId = ''
  let fallback: {deploymentId: string; role: string} | undefined

  for (const role of roles) {
    if (role.mediaType === 'audio') {
      if (role.override !== undefined) {
        throw new MediaGenError(
          'invalid_argument',
          `Deployment overrides are not supported for Speech role "${role.role}"`,
          2,
          ['Configure Azure Speech in Settings or run `mg configure speech --help`'],
        )
      }
      const speech = localProfile.speech
      if (speech === undefined) {
        throw new MediaGenError(
          'speech_not_configured',
          'Azure Speech is not configured for the Explainer voice role',
          2,
          ['Configure Azure Speech in Settings or run `mg configure speech --help`'],
        )
      }
      deployments[role.role] = {
        adapter: 'mai-voice',
        apiKey: speech.apiKey,
        deploymentName: 'azure-speech',
        endpoint: speech.endpoint,
        id: 'local:speech',
        model: 'MAI-Voice-2',
        projectEndpoint: speech.endpoint,
        provider: 'local-profile',
      }
      primaryDeploymentId ||= 'local:speech'
      continue
    }
    const deploymentId = role.override ?? role.route[0]
    if (deploymentId === undefined) {
      throw new MediaGenError(
        'no_eligible_model',
        `No eligible model is configured for role "${role.role}"`,
      )
    }
    if (
      role.override !== undefined &&
      role.route.indexOf(deploymentId) > 0 &&
      !force
    ) {
      throw new MediaGenError(
        'confirmation_required',
        `Using fallback deployment "${deploymentId}" for role "${role.role}" requires --force`,
        2,
        ['Rerun the command with `--force`'],
      )
    }
    const deployment = manifest.deployments[deploymentId]
    if (deployment === undefined) {
      throw new Error(`Deployment "${deploymentId}" is not configured`)
    }
    const provider = manifest.providers[deployment.provider]
    if (provider === undefined) {
      throw new Error(`Provider "${deployment.provider}" is not configured`)
    }
    const definition = findModelDefinition(deployment.model)
    if (
      definition === undefined ||
      definition.mediaType !== role.mediaType
    ) {
      throw new MediaGenError(
        'model_capability_mismatch',
        `Deployment "${deploymentId}" is not eligible for role "${role.role}"`,
      )
    }
    deployments[role.role] = {
      adapter: deployment.adapter,
      deploymentName: deployment.deploymentName,
      id: deploymentId,
      model: deployment.model,
      projectEndpoint: provider.projectEndpoint,
      ...(deployment.endpoint === undefined
        ? {}
        : {endpoint: deployment.endpoint}),
      provider: deployment.provider,
    }
    primaryDeploymentId ||= deploymentId
    if (role.override === undefined && role.route[1] !== undefined) {
      fallback ??= {
        deploymentId: role.route[1],
        role: role.role,
      }
    }
  }

  return {deployments, fallback, primaryDeploymentId}
}

async function recreateGeneration(
  context: CommandContext,
  command: Extract<
    MediaGenCommand,
    {type: 'generations-recreate'}
  >,
  dependencies: ApplicationDependencies,
): Promise<GenerationsRecreateResult> {
  const store = await createWorkspaceGenerationStore(context, dependencies)
  const source = await store.get(command.id)
  const {mediaWorkspacePath} = await resolveWorkspace(context)
  const textReferences = await loadTextReferences(
    mediaWorkspacePath,
    source,
  )
  if (source.selection.kind === 'scenario') {
    if (source.scenario === null) {
      throw new MediaGenError(
        'invalid_generation_record',
        `Generation "${source.id}" is missing Scenario inputs`,
      )
    }
    const request = parseScenarioRequest(source.selection.scenario, {
      creativeBrief: command.creativeBrief ?? source.creativeBrief,
      deploymentOverrides: command.deploymentOverrides ?? {},
      options: {
        ...source.scenario.options,
        ...command.options,
      },
      preset: command.preset ?? source.selection.preset,
      sourcePaths: source.references.map((reference) => reference.path),
      textReferences,
      webReferenceUrls: source.webReferences.map(
        (reference) => reference.url,
      ),
    })
    const result = await createMedia(
      context,
      {
        force: command.force === true,
        request,
        type: 'create',
      },
      dependencies,
      [source.id],
    )
    return {
      generation: result.generation,
      type: 'generations-recreate',
    }
  }
  const result = await generateMedia(
    context,
    {
      creativeBrief: command.creativeBrief ?? source.creativeBrief,
      mediaType: source.mediaType,
      referencePaths: [],
      style: command.style ?? generationStyle(source),
      textReferences,
      type: 'generate',
      webReferenceUrls: source.webReferences.map(
        (reference) => reference.url,
      ),
    },
    dependencies,
    [source.id],
  )

  return {
    generation: result.generation,
    type: 'generations-recreate',
  }

  async function loadTextReferences(
    mediaWorkspacePath: string,
    generation: GenerationRecord,
  ): Promise<TextReferenceInput[]> {
    return Promise.all(
      generation.textReferences.map(async (reference) => ({
        content: await readFile(
          join(
            mediaWorkspacePath,
            'generations',
            generation.id,
            reference.path,
          ),
          'utf8',
        ),
        format: reference.format,
        title: reference.title,
      })),
    )
  }

}

async function referenceGenerations(
  context: CommandContext,
  command: Extract<
    MediaGenCommand,
    {type: 'generations-reference'}
  >,
  dependencies: ApplicationDependencies,
): Promise<GenerationsReferenceResult> {
  const resolvedWorkspace = await resolveWorkspace(context)
  const store = createGenerationStore(
    resolvedWorkspace.mediaWorkspacePath,
    {
      createId: dependencies.createGenerationId,
      now: dependencies.now,
    },
  )
  const generations = await Promise.all(
    command.ids.map((id) => store.get(id)),
  )

  return {
    references: generations.flatMap((generation) =>
      generation.outputs.map((output) => ({
        generationId: generation.id,
        mediaType: output.mediaType,
        path: join(
          resolvedWorkspace.mediaWorkspacePath,
          'generations',
          generation.id,
          output.path,
        ),
      })),
    ),
    type: 'generations-reference',
  }
}

async function getGeneration(
  context: CommandContext,
  id: string,
  dependencies: ApplicationDependencies,
): Promise<GenerationsGetResult> {
  const store = await createWorkspaceGenerationStore(context, dependencies)
  return {
    generation: await store.get(id),
    type: 'generations-get',
  }
}

async function listGenerations(
  context: CommandContext,
  dependencies: ApplicationDependencies,
): Promise<GenerationsListResult> {
  const store = await createWorkspaceGenerationStore(context, dependencies)
  const generations = await store.list()
  return {
    count: generations.length,
    generations,
    type: 'generations-list',
  }
}

async function createWorkspaceGenerationStore(
  context: CommandContext,
  dependencies: ApplicationDependencies,
) {
  const {mediaWorkspacePath} = await resolveWorkspace(context)
  return createGenerationStore(
    mediaWorkspacePath,
    {
      createId: dependencies.createGenerationId,
      now: dependencies.now,
    },
  )
}

async function resolveWorkspace(context: CommandContext) {
  const manifestPath = await requireManifest(context.cwd)
  const projectDirectory = dirname(dirname(manifestPath))
  const workspace = await findRegisteredWorkspace(
    context.mediaGenHome,
    projectDirectory,
  )
  return {
    manifestPath,
    mediaWorkspacePath: workspacePath(context.mediaGenHome, workspace),
    projectDirectory,
    workspace,
  }
}

async function requireManifest(cwd: string): Promise<string> {
  const manifestPath = await findManifest(cwd)
  if (manifestPath === undefined) {
    throw new Error('Media Gen is not initialized')
  }

  return manifestPath
}

async function readManifest(path: string) {
  return parseWorkspaceManifest(
    JSON.parse(await readFile(path, 'utf8')),
  )
}

async function readLocalProfile(
  mediaWorkspacePath: string,
): Promise<LocalProfile> {
  return parseLocalProfile(
    JSON.parse(
      await readFile(join(mediaWorkspacePath, 'local.json'), 'utf8'),
    ),
  )
}

function normalizeSpeechEndpoint(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new MediaGenError(
      'invalid_speech_endpoint',
      'Azure Speech endpoint must be a valid HTTP or HTTPS URL',
      2,
    )
  }
  if (url.protocol !== 'https:') {
    throw new MediaGenError(
      'invalid_speech_endpoint',
      'Azure Speech endpoint must use HTTPS',
      2,
    )
  }
  if (!isAzureSpeechEndpoint(value)) {
    throw new MediaGenError(
      'invalid_speech_endpoint',
      'Azure Speech endpoint must use an Azure Speech hostname',
      2,
    )
  }
  return `${url.protocol}//${url.host}/`
}

async function describeWorkspace(
  context: CommandContext,
): Promise<HomeResult> {
  const manifestPath = await findManifest(context.cwd)
  if (manifestPath === undefined) {
    return {
      bin: context.bin,
      description,
      help: uninitializedHelp,
      manifest: {
        exists: false,
        path: join(context.cwd, '.mg', 'config.json'),
      },
      projectDirectory: context.cwd,
      state: 'uninitialized',
      type: 'home',
    }
  }

  parseWorkspaceManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  )
  const projectDirectory = dirname(dirname(manifestPath))
  const workspace = await findRegisteredWorkspace(
    context.mediaGenHome,
    projectDirectory,
  )

  return {
    bin: context.bin,
    description,
    help: readyHelp,
    manifest: {
      exists: true,
      path: manifestPath,
    },
    projectDirectory,
    state: 'ready',
    type: 'home',
    workspace: {
      id: workspace.id,
      path: workspacePath(context.mediaGenHome, workspace),
    },
  }
}

async function relinkWorkspace(
  context: CommandContext,
  from: string,
): Promise<RelinkResult> {
  const manifestPath = await findManifest(context.cwd)
  if (manifestPath === undefined) {
    throw new Error('Media Gen is not initialized')
  }
  parseWorkspaceManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  )
  const projectDirectory = dirname(dirname(manifestPath))
  const registryPath = join(context.mediaGenHome, 'registry.json')

  return withFileLock(registryPath, async () => {
    const registry = await readRegistry(context.mediaGenHome)
    const workspace = registry.workspaces.find(
      (entry) => resolve(entry.projectDirectory) === resolve(from),
    )
    if (workspace === undefined) {
      throw new Error(`No Media Gen workspace is registered for ${from}`)
    }

    workspace.projectDirectory = projectDirectory
    await writeJsonAtomic(registryPath, registry)

    return {
      from: resolve(from),
      state: 'relinked',
      to: projectDirectory,
      type: 'relink',
      workspace: {
        id: workspace.id,
        path: workspacePath(context.mediaGenHome, workspace),
      },
    }
  })
}

async function doctorWorkspace(
  context: CommandContext,
  authModule: AuthModule,
): Promise<DoctorResult> {
  const manifestPath = await findManifest(context.cwd)
  if (manifestPath === undefined) {
    throw new Error('Media Gen is not initialized')
  }

  const manifest = parseWorkspaceManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  )
  const projectDirectory = dirname(dirname(manifestPath))
  const workspace = await findRegisteredWorkspace(
    context.mediaGenHome,
    projectDirectory,
  )
  const mediaWorkspacePath = workspacePath(
    context.mediaGenHome,
    workspace,
  )
  const localProfilePath = join(mediaWorkspacePath, 'local.json')
  await access(mediaWorkspacePath)
  const localProfile = parseLocalProfile(
    JSON.parse(await readFile(localProfilePath, 'utf8')),
  )
  const auth = await authModule.status()
  const authCheck =
    auth.state === 'signed-in'
      ? {
          detail: auth.account.name,
          name: 'azure-cli',
          status: 'pass' as const,
        }
      : {
          detail: auth.help.join(' '),
          name: 'azure-cli',
          status: 'fail' as const,
        }
  const scenarioChecks = manifest.scenarios.enabled.map((scenarioId) => {
    const scenario = getScenarioDefinition(scenarioId)
    if (scenario === undefined) {
      return {
        detail: 'Scenario is not built into this CLI version',
        name: `scenario:${scenarioId}`,
        status: 'fail' as const,
      }
    }
    const readiness = scenarioReadiness(
      manifest,
      localProfile,
      scenario,
    )
    const missingRole = readiness.missingRoles[0]
    if (missingRole !== undefined) {
      return {
        detail:
          scenario.roleMediaTypes[missingRole] === 'audio'
            ? `Missing private Azure Speech configuration for role "${missingRole}"`
            : `Missing route for role "${missingRole}"`,
        name: `scenario:${scenario.id}`,
        status: 'fail' as const,
      }
    }
    const routes = manifest.routing.scenarios[scenario.id] ?? {}
    return {
      detail: requiredScenarioRoles(scenario)
        .map((role) =>
          scenario.roleMediaTypes[role] === 'audio'
            ? `${role}: local:speech`
            : `${role}: ${routes[role]!.auto[0]}`,
        )
        .join(', '),
      name: `scenario:${scenario.id}`,
      status: 'pass' as const,
    }
  })
  const scenarioHelp = scenarioChecks
    .filter((check) => check.status === 'fail')
    .map((check) => {
      const id = check.name.slice('scenario:'.length)
      const scenario = getScenarioDefinition(id)
      if (scenario === undefined) {
        return `Disable unknown Scenario "${id}".`
      }
      const missingRole = scenarioReadiness(
        manifest,
        localProfile,
        scenario,
      ).missingRoles[0]
      return missingRole !== undefined &&
        scenario.roleMediaTypes[missingRole] === 'audio'
        ? 'Configure Azure Speech in Settings or run `mg configure speech --help`.'
        : `Configure a ${missingRole === undefined ? 'video' : scenario.roleMediaTypes[missingRole]} deployment for ${scenario.title}.`
    })
  const healthy =
    auth.state === 'signed-in' &&
    scenarioChecks.every((check) => check.status === 'pass')

  return {
    checks: [
      authCheck,
      {detail: manifestPath, name: 'manifest', status: 'pass'},
      {detail: workspace.id, name: 'registry', status: 'pass'},
      {
        detail: mediaWorkspacePath,
        name: 'media-workspace',
        status: 'pass',
      },
      {
        detail: localProfilePath,
        name: 'local-profile',
        status: 'pass',
      },
      ...scenarioChecks,
    ],
    help: [
      ...(auth.state === 'signed-in' ? [] : auth.help),
      ...scenarioHelp,
    ],
    state: healthy ? 'healthy' : 'unhealthy',
    type: 'doctor',
  }
}

async function initializeWorkspace(
  context: CommandContext,
  dependencies: ApplicationDependencies,
): Promise<InitResult> {
  const projectDirectory = resolve(context.cwd)
  const projectName = basename(projectDirectory)
  const slug = createSlug(projectName)
  const manifestPath = join(projectDirectory, '.mg', 'config.json')
  const registryPath = join(context.mediaGenHome, 'registry.json')
  await mkdir(context.mediaGenHome, {recursive: true})

  return withFileLock(registryPath, async () => {
    const registry = await readRegistryOrEmpty(context.mediaGenHome)
    const existingWorkspace = registry.workspaces.find(
      (entry) => resolve(entry.projectDirectory) === projectDirectory,
    )
    const manifestExists = await pathExists(manifestPath)

    if (manifestExists && existingWorkspace !== undefined) {
      return {
        help: initializedHelp,
        manifest: {
          created: false,
          path: manifestPath,
        },
        projectDirectory,
        state: 'already-initialized',
        type: 'init',
        workspace: {
          id: existingWorkspace.id,
          path: join(
            context.mediaGenHome,
            'workspaces',
            `${existingWorkspace.slug}--${existingWorkspace.id}`,
          ),
        },
      }
    }

    if (manifestExists || existingWorkspace !== undefined) {
      throw new Error(
        `Media Gen initialization is inconsistent for ${projectDirectory}`,
      )
    }

    const workspaceId = dependencies.createWorkspaceId()
    const workspaceDirectory = join(
      context.mediaGenHome,
      'workspaces',
      `${slug}--${workspaceId}`,
    )

    await Promise.all([
      mkdir(join(workspaceDirectory, 'generations'), {recursive: true}),
      mkdir(join(workspaceDirectory, 'cache'), {recursive: true}),
      mkdir(join(workspaceDirectory, 'logs'), {recursive: true}),
    ])

    await Promise.all([
      writeJsonAtomic(manifestPath, {
        deployments: {},
        export: {},
        providers: {},
        routing: {
          generators: {},
          scenarios: {},
        },
        scenarios: {
          enabled: [],
        },
        schemaVersion: 2,
        workspace: {
          name: projectName,
        },
      }),
      writeJsonAtomic(
        join(workspaceDirectory, 'local.json'),
        {
          schemaVersion: 1,
        },
        {mode: 0o600},
      ),
    ])
    await writeJsonAtomic(registryPath, {
      schemaVersion: 1,
      workspaces: [
        ...registry.workspaces,
        {
          id: workspaceId,
          name: projectName,
          projectDirectory,
          slug,
        },
      ],
    })

    return {
      help: initializedHelp,
      manifest: {
        created: true,
        path: manifestPath,
      },
      projectDirectory,
      state: 'initialized',
      type: 'init',
      workspace: {
        id: workspaceId,
        path: workspaceDirectory,
      },
    }
  })
}

function createSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')

  return slug || 'workspace'
}

async function writeJsonAtomic(
  path: string,
  value: unknown,
  options: {mode?: number} = {},
): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    options.mode === undefined
      ? 'utf8'
      : {encoding: 'utf8', mode: options.mode},
  )
  await rename(temporaryPath, path)
}

async function readRegistry(mediaGenHome: string): Promise<RegistryFile> {
  return parseRegistry(
    JSON.parse(
      await readFile(join(mediaGenHome, 'registry.json'), 'utf8'),
    ),
  )
}

async function readRegistryOrEmpty(
  mediaGenHome: string,
): Promise<RegistryFile> {
  try {
    return await readRegistry(mediaGenHome)
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error
    }

    return {
      schemaVersion: 1,
      workspaces: [],
    }
  }
}

async function findRegisteredWorkspace(
  mediaGenHome: string,
  projectDirectory: string,
): Promise<RegistryFile['workspaces'][number]> {
  const registry = await readRegistry(mediaGenHome)
  const workspace = registry.workspaces.find(
    (entry) =>
      resolve(entry.projectDirectory) === resolve(projectDirectory),
  )
  if (workspace === undefined) {
    throw new Error(
      `No Media Gen workspace is registered for ${projectDirectory}`,
    )
  }

  return workspace
}

function workspacePath(
  mediaGenHome: string,
  workspace: RegistryFile['workspaces'][number],
): string {
  return join(
    mediaGenHome,
    'workspaces',
    `${workspace.slug}--${workspace.id}`,
  )
}

async function findManifest(cwd: string): Promise<string | undefined> {
  let directory = resolve(cwd)
  const root = parse(directory).root

  while (true) {
    const candidate = join(directory, '.mg', 'config.json')
    try {
      await access(candidate)
      return candidate
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error
      }
    }

    if (directory === root) {
      return undefined
    }

    directory = dirname(directory)
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (isMissingPathError(error)) {
      return false
    }

    throw error
  }
}
