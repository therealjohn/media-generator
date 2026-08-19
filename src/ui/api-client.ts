export type GenerationStatus =
  | 'created'
  | 'failed'
  | 'interrupted'
  | 'running'
  | 'submitted'
  | 'succeeded'
  | 'validating'

export interface GenerationRecord {
  createdAt: string
  creativeBrief: string
  error: null | {
    code: string
    message: string
  }
  id: string
  mediaType: 'image' | 'video'
  operations: Array<{
    kind: string
    message?: string
    status: 'failed' | 'pending' | 'running' | 'succeeded'
  }>
  outputs: Array<{
    mediaType: string
    path: string
    sha256: string
    size: number
  }>
  progress: {
    completed: number
    stage: string
    total: number
  }
  provider: {
    jobId: null | string
  }
  references: Array<{
    mediaType: string
    modifiedAt: string
    path: string
    sha256: string
    size: number
  }>
  resolvedModel: {
    deployment: string
    id: string
    model: string
    provider: string
  }
  resolvedResources: Array<{
    deployment: string
    id: string
    model: string
    provider: string
    role: string
  }>
  runtime: {
    catalogVersion: string
    cliVersion: string
  }
  scenario: null | {
    inputs: Record<string, unknown>
    options: Record<string, unknown>
  }
  schemaVersion: 4
  selection:
    | {
        generator: 'image' | 'video'
        kind: 'generator'
        style: string
      }
    | {
        kind: 'scenario'
        preset?: string
        scenario: string
      }
  sourceGenerations: string[]
  status: GenerationStatus
  textReferences: Array<{
    format: 'markdown' | 'text'
    path: string
    sha256: string
    size: number
    title: string
  }>
  updatedAt: string
  webReferences: Array<{url: string}>
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

export interface GenerateInput {
  controls?: Record<string, unknown>
  creativeBrief: string
  deploymentId?: string
  force?: boolean
  mediaType: 'audio' | 'image' | 'video'
  referencePaths: string[]
  style: string
  textReferences?: Array<{
    content: string
    format: 'markdown' | 'text'
    title?: string
  }>
}

export interface GenerateResult {
  generation: GenerationRecord
  type: 'generate'
}

export type ScenarioCreateInput =
  | {
      force?: boolean
      request: {
        creativeBrief: string
        deploymentOverrides: Record<string, string>
        kind: 'scenario'
        options: {
          'aspect-ratio': '16:9' | '9:16'
          duration: number
          narration?: string
          subtitles: boolean
          voice?: string
        }
        preset: string
        scenario: 'explainer-video'
        sourcePaths: string[]
        textReferences?: Array<{
          content: string
          format: 'markdown' | 'text'
          title?: string
        }>
      }
    }
  | {
      force?: boolean
      request: {
        creativeBrief: string
        deploymentOverrides: Record<string, string>
        kind: 'scenario'
        options: {
          'clip-count': number
          'clip-duration': number
          language: string
          orientation: 'horizontal' | 'vertical'
          subtitles: boolean
        }
        preset: string
        scenario: 'short-form-video'
        sourcePaths: string[]
        textReferences?: Array<{
          content: string
          format: 'markdown' | 'text'
          title?: string
        }>
      }
    }

export interface CreateResult {
  generation: GenerationRecord
  type: 'create'
}

export interface GenerationReuseInput {
  creativeBrief: string
  style?: string
}

export interface GenerationsEditResult {
  generation: GenerationRecord
  type: 'generations-edit'
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

export interface GenerationsExportResult {
  files: string[]
  id: string
  type: 'generations-export'
}

export interface GenerationsDeleteResult {
  id: string
  state: 'deleted'
  type: 'generations-delete'
}

export type AuthResult =
  | {
      account: {name: string; type: string}
      state: 'signed-in'
      subscription: {id: string; name: string}
      tenantId: string
      type: 'auth'
    }
  | {
      help: string[]
      state: 'signed-out' | 'unavailable'
      type: 'auth'
    }

export interface ConfigureFoundryResult {
  deployments: Array<{
    adapter: string
    deploymentName: string
    id: string
    mediaType: 'image' | 'video'
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

export interface SettingsGetResult {
  auth:
    | {
        account: {name: string; type: string}
        state: 'signed-in'
        subscription: {id: string; name: string}
        tenantId: string
      }
    | {
        help: string[]
        state: 'signed-out' | 'unavailable'
      }
  manifest: {
    deployments: Record<
      string,
      {
        adapter:
          | 'azure-openai-image'
          | 'bfl-flux'
          | 'mai-image'
          | 'mai-voice'
          | 'sora-video'
        deploymentName: string
        endpoint?: string
        model: string
        provider: string
      }
    >
    export: {
      defaultDirectory?: string
    }
    providers: Record<
      string,
      {
        kind: 'microsoft-foundry'
        projectEndpoint: string
      }
    >
    routing: {
      generators: Record<string, {auto: string[]}>
      scenarios: Record<
        string,
        Record<string, {auto: string[]}>
      >
    }
    scenarios: {
      enabled: string[]
    }
    schemaVersion: 2
    workspace: {
      name: string
    }
  }
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

export interface ScenarioView {
  description: string
  enabled: boolean
  id: 'explainer-video' | 'short-form-video'
  mediaType: 'video'
  optionalRoutingRoles?: string[]
  presets: Array<{
    description: string
    id: string
    title: string
  }>
  productionOptions: Array<{
    description: string
    id: string
    required: boolean
    type: 'boolean' | 'integer' | 'string'
  }>
  readiness: {
    missingRoles: string[]
    state: 'not-ready' | 'ready'
  }
  routingRoles: string[]
  title: string
}

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export class ApiError extends Error {
  readonly code?: string
  readonly help: string[]
  readonly status: number

  constructor(
    message: string,
    options: {code?: string; help?: string[]; status: number},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code
    this.help = options.help ?? []
    this.status = options.status
  }
}

export interface ApiClient {
  addReferences(ids: string[]): Promise<GenerationsReferenceResult>
  configureFoundry(input: {
    endpoint: string
    name: string
  }): Promise<ConfigureFoundryResult>
  configureSpeech(input: {
    apiKey: string
    endpoint: string
    voice: string
  }): Promise<ConfigureSpeechResult>
  createGeneration(input: GenerateInput): Promise<GenerateResult>
  createScenario(input: ScenarioCreateInput): Promise<CreateResult>
  deleteGeneration(
    id: string,
    force: boolean,
  ): Promise<GenerationsDeleteResult>
  editGeneration(
    id: string,
    input: GenerationReuseInput,
  ): Promise<GenerationsEditResult>
  exportGeneration(
    id: string,
    input: {force: boolean; to?: string},
  ): Promise<GenerationsExportResult>
  getAuthStatus(): Promise<AuthResult>
  getGeneration(id: string): Promise<GenerationsGetResult>
  getSettings(): Promise<SettingsGetResult>
  listGenerations(): Promise<GenerationsListResult>
  recreateGeneration(
    id: string,
    input: GenerationReuseInput,
  ): Promise<GenerationsRecreateResult>
  setScenarioEnabled(
    id: ScenarioView['id'],
    enabled: boolean,
  ): Promise<{
    enabled: boolean
    id: string
    type: 'scenarios-set-enabled'
  }>
}

export function createApiClient(
  fetchImplementation: Fetch = (input, init) =>
    globalThis.fetch(input, init),
): ApiClient {
  return {
    addReferences: (ids) =>
      request<GenerationsReferenceResult>(
        fetchImplementation,
        '/api/references',
        {
          body: JSON.stringify({ids}),
          headers: {'Content-Type': 'application/json'},
          method: 'POST',
        },
      ),
    configureFoundry: (input) =>
      request<ConfigureFoundryResult>(
        fetchImplementation,
        '/api/configure/foundry',
        {
          body: JSON.stringify(input),
          headers: {'Content-Type': 'application/json'},
          method: 'POST',
        },
      ),
    configureSpeech: (input) =>
      request<ConfigureSpeechResult>(
        fetchImplementation,
        '/api/configure/speech',
        {
          body: JSON.stringify(input),
          headers: {'Content-Type': 'application/json'},
          method: 'POST',
        },
      ),
    createGeneration: (input) =>
      request<GenerateResult>(fetchImplementation, '/api/generations', {
        body: JSON.stringify(input),
        headers: {'Content-Type': 'application/json'},
        method: 'POST',
      }),
    createScenario: (input) =>
      request<CreateResult>(fetchImplementation, '/api/create', {
        body: JSON.stringify(input),
        headers: {'Content-Type': 'application/json'},
        method: 'POST',
      }),
    deleteGeneration: (id, force) =>
      request<GenerationsDeleteResult>(
        fetchImplementation,
        `/api/generations/${encodeURIComponent(id)}?force=${force}`,
        {method: 'DELETE'},
      ),
    editGeneration: (id, input) =>
      request<GenerationsEditResult>(
        fetchImplementation,
        `/api/generations/${encodeURIComponent(id)}/edit`,
        {
          body: JSON.stringify(input),
          headers: {'Content-Type': 'application/json'},
          method: 'POST',
        },
      ),
    exportGeneration: (id, input) =>
      request<GenerationsExportResult>(
        fetchImplementation,
        `/api/generations/${encodeURIComponent(id)}/export`,
        {
          body: JSON.stringify(input),
          headers: {'Content-Type': 'application/json'},
          method: 'POST',
        },
      ),
    getAuthStatus: () =>
      request<AuthResult>(fetchImplementation, '/api/auth', {
        method: 'GET',
      }),
    getGeneration: (id) =>
      request<GenerationsGetResult>(
        fetchImplementation,
        `/api/generations/${encodeURIComponent(id)}`,
        {method: 'GET'},
      ),
    getSettings: () =>
      request<SettingsGetResult>(
        fetchImplementation,
        '/api/settings',
        {method: 'GET'},
      ),
    listGenerations: () =>
      request<GenerationsListResult>(
        fetchImplementation,
        '/api/generations',
        {method: 'GET'},
      ),
    recreateGeneration: (id, input) =>
      request<GenerationsRecreateResult>(
        fetchImplementation,
        `/api/generations/${encodeURIComponent(id)}/recreate`,
        {
          body: JSON.stringify(input),
          headers: {'Content-Type': 'application/json'},
          method: 'POST',
        },
      ),
    setScenarioEnabled: (id, enabled) =>
      request(
        fetchImplementation,
        `/api/scenarios/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`,
        {method: 'POST'},
      ),
  }
}

async function request<Result>(
  fetchImplementation: Fetch,
  path: string,
  init: RequestInit,
): Promise<Result> {
  const response = await fetchImplementation(path, init)
  const body = (await response.json()) as unknown

  if (!response.ok) {
    const error = readErrorBody(body)
    throw new ApiError(
      error.message || `Request failed with status ${response.status}.`,
      {
        code: error.code,
        help: error.help,
        status: response.status,
      },
    )
  }

  return body as Result
}

function readErrorBody(body: unknown): {
  code?: string
  help: string[]
  message: string
} {
  if (typeof body !== 'object' || body === null) {
    return {help: [], message: ''}
  }

  const candidate = body as {
    code?: unknown
    help?: unknown
    message?: unknown
  }
  return {
    code:
      typeof candidate.code === 'string' ? candidate.code : undefined,
    help: Array.isArray(candidate.help)
      ? candidate.help.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    message:
      typeof candidate.message === 'string' ? candidate.message : '',
  }
}

export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong.',
): string {
  return error instanceof Error && error.message
    ? error.message
    : fallback
}
