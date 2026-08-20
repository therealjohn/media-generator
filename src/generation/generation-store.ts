import {
  mkdir,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises'
import {join} from 'node:path'

import {z} from 'zod'

import {MediaGenError} from '../application/media-gen-error.js'
import {withFileLock} from '../workspace/file-lock.js'
import {writeJsonAtomic} from '../workspace/atomic-json.js'
import type {MediaType} from '../catalog/models.js'
import type {TextReferenceRecord} from './text-reference.js'
import type {WebReference} from './web-reference.js'

export type GenerationStatus =
  | 'created'
  | 'failed'
  | 'interrupted'
  | 'running'
  | 'submitted'
  | 'succeeded'
  | 'validating'

export interface ReferenceFingerprint {
  mediaType: string
  modifiedAt: string
  path: string
  sha256: string
  size: number
}

export type GenerationSelection =
  | {
      generator: MediaType
      kind: 'generator'
      style: string
    }
  | {
      kind: 'scenario'
      preset?: string
      scenario: string
    }

export interface ResolvedResource {
  deployment: string
  id: string
  model: string
  provider: string
  role: string
}

export interface GenerationOperation {
  kind: string
  message?: string
  status: 'failed' | 'pending' | 'running' | 'succeeded'
}

export interface GenerationProgress {
  completed: number
  stage: string
  total: number
}

export interface GenerationScenario {
  inputs: Record<string, unknown>
  options: Record<string, unknown>
}

export interface GenerationRecord {
  controls: Record<string, unknown>
  createdAt: string
  creativeBrief: string
  error: null | {
    code: string
    message: string
  }
  id: string
  mediaType: MediaType
  outputs: Array<{
    mediaType: string
    path: string
    sha256: string
    size: number
  }>
  operations: GenerationOperation[]
  progress: GenerationProgress
  provider: {
    jobId: null | string
  }
  references: ReferenceFingerprint[]
  resolvedModel: {
    deployment: string
    id: string
    model: string
    provider: string
  }
  resolvedResources: ResolvedResource[]
  runtime: {
    catalogVersion: string
    cliVersion: string
  }
  scenario: GenerationScenario | null
  schemaVersion: 5
  selection: GenerationSelection
  sourceGenerations: string[]
  status: GenerationStatus
  textReferences: TextReferenceRecord[]
  updatedAt: string
  webReferences: WebReference[]
}

export type CreateGenerationInput = Pick<
  GenerationRecord,
  | 'creativeBrief'
  | 'mediaType'
  | 'references'
  | 'resolvedModel'
  | 'selection'
  | 'sourceGenerations'
> &
  Partial<
    Pick<
      GenerationRecord,
      | 'operations'
      | 'progress'
      | 'resolvedResources'
      | 'scenario'
      | 'controls'
      | 'textReferences'
      | 'webReferences'
    >
  >

export interface GenerationStore {
  create(input: CreateGenerationInput): Promise<GenerationRecord>
  delete(id: string): Promise<{id: string; state: 'deleted'}>
  get(id: string): Promise<GenerationRecord>
  list(): Promise<GenerationRecord[]>
  update(
    id: string,
    update: (current: GenerationRecord) => GenerationRecord,
  ): Promise<GenerationRecord>
}

export interface GenerationStoreDependencies {
  createId(): string
  now(): Date
}

export function createGenerationStore(
  workspacePath: string,
  dependencies: GenerationStoreDependencies,
): GenerationStore {
  return {
    async create(input) {
      const id = requireGenerationId(dependencies.createId())
      const timestamp = dependencies.now().toISOString()
      const directory = join(workspacePath, 'generations', id)
      const record: GenerationRecord = {
        ...input,
        controls: input.controls ?? {},
        createdAt: timestamp,
        error: null,
        id,
        operations: input.operations ?? [],
        outputs: [],
        progress:
          input.progress ?? {
            completed: 0,
            stage: 'created',
            total: 1,
          },
        provider: {jobId: null},
        resolvedResources:
          input.resolvedResources ?? [
            {
              ...input.resolvedModel,
              role: 'generation',
            },
          ],
        runtime: {
          catalogVersion: '5',
          cliVersion: '0.1.1',
        },
        scenario: input.scenario ?? null,
        schemaVersion: 5,
        status: 'created',
        textReferences: input.textReferences ?? [],
        updatedAt: timestamp,
        webReferences: input.webReferences ?? [],
      }

      await mkdir(join(directory, 'outputs'), {recursive: true})
      await writeJsonAtomic(join(directory, 'generation.json'), record)
      return record
    },
    async delete(id) {
      const generationId = requireGenerationId(id)
      const directory = join(
        workspacePath,
        'generations',
        generationId,
      )
      const recordPath = join(directory, 'generation.json')
      return withFileLock(recordPath, async () => {
        await rm(directory, {recursive: true})
        return {id: generationId, state: 'deleted'}
      })
    },
    async get(id) {
      const generationId = requireGenerationId(id)
      return readGenerationRecord(
        join(
          workspacePath,
          'generations',
          generationId,
          'generation.json',
        ),
      )
    },
    async list() {
      const generationsPath = join(workspacePath, 'generations')
      const entries = await readdir(generationsPath, {
        withFileTypes: true,
      })
      const records = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) =>
            readGenerationRecord(
              join(generationsPath, entry.name, 'generation.json'),
            ),
          ),
      )
      return records.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      )
    },
    async update(id, update) {
      const generationId = requireGenerationId(id)
      const recordPath = join(
        workspacePath,
        'generations',
        generationId,
        'generation.json',
      )
      return withFileLock(recordPath, async () => {
        const current = await readGenerationRecord(recordPath)
        const next = {
          ...update(current),
          updatedAt: dependencies.now().toISOString(),
        }

        const record = generationRecordSchema.parse(next)
        await writeJsonAtomic(recordPath, record)
        return record
      })
    },
  }
}

const generationIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function requireGenerationId(id: string): string {
  if (!generationIdPattern.test(id)) {
    throw new MediaGenError(
      'invalid_generation_id',
      `Generation ID "${id}" is invalid`,
      2,
    )
  }

  return id
}

const referenceSchema = z.object({
  mediaType: z.string(),
  modifiedAt: z.string(),
  path: z.string(),
  sha256: z.string(),
  size: z.number().nonnegative(),
})

const generationSelectionSchema: z.ZodType<GenerationSelection> =
  z.discriminatedUnion('kind', [
    z.object({
      generator: z.enum(['image', 'video']),
      kind: z.literal('generator'),
      style: z.string(),
    }),
    z.object({
      kind: z.literal('scenario'),
      preset: z.string().optional(),
      scenario: z.string(),
    }),
  ])

const resolvedResourceSchema: z.ZodType<ResolvedResource> = z.object({
  deployment: z.string(),
  id: z.string(),
  model: z.string(),
  provider: z.string(),
  role: z.string(),
})

const generationOperationSchema: z.ZodType<GenerationOperation> =
  z.object({
    kind: z.string(),
    message: z.string().optional(),
    status: z.enum(['failed', 'pending', 'running', 'succeeded']),
  })

const textReferenceSchema = z.object({
  format: z.enum(['markdown', 'text']),
  path: z.string(),
  sha256: z.string(),
  size: z.number().nonnegative(),
  title: z.string(),
})

const webReferenceSchema = z.object({
  url: z.url(),
})

const generationRecordSchema = z.object({
  controls: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  creativeBrief: z.string(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
  id: z.string(),
  mediaType: z.enum(['image', 'video']),
  outputs: z.array(
    z.object({
      mediaType: z.string(),
      path: z.string(),
      sha256: z.string(),
      size: z.number().nonnegative(),
    }),
  ),
  operations: z.array(generationOperationSchema),
  progress: z.object({
    completed: z.number().int().nonnegative(),
    stage: z.string(),
    total: z.number().int().nonnegative(),
  }),
  provider: z.object({
    jobId: z.string().nullable(),
  }),
  references: z.array(referenceSchema),
  resolvedModel: z.object({
    deployment: z.string(),
    id: z.string(),
    model: z.string(),
    provider: z.string(),
  }),
  resolvedResources: z.array(resolvedResourceSchema),
  runtime: z.object({
    catalogVersion: z.string(),
    cliVersion: z.string(),
  }),
  scenario: z
    .object({
      inputs: z.record(z.string(), z.unknown()),
      options: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  schemaVersion: z.literal(5),
  selection: generationSelectionSchema,
  sourceGenerations: z.array(z.string()),
  status: z.enum([
    'created',
    'failed',
    'interrupted',
    'running',
    'submitted',
    'succeeded',
    'validating',
  ]),
  textReferences: z.array(textReferenceSchema),
  updatedAt: z.string(),
  webReferences: z.array(webReferenceSchema),
})

const version4GenerationRecordSchema = generationRecordSchema
  .omit({
    controls: true,
    schemaVersion: true,
  })
  .extend({
    schemaVersion: z.literal(4),
  })

const version3GenerationRecordSchema = version4GenerationRecordSchema
  .omit({
    schemaVersion: true,
    textReferences: true,
    webReferences: true,
  })
  .extend({
    schemaVersion: z.literal(3),
  })

const version2GenerationRecordSchema = z.object({
  createdAt: z.string(),
  creativeBrief: z.string(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
  id: z.string(),
  mediaType: z.enum(['image', 'video']),
  outputs: z.array(
    z.object({
      mediaType: z.string(),
      path: z.string(),
      sha256: z.string(),
      size: z.number().nonnegative(),
    }),
  ),
  provider: z.object({
    jobId: z.string().nullable(),
  }),
  references: z.array(referenceSchema),
  resolvedModel: z.object({
    deployment: z.string(),
    id: z.string(),
    model: z.string(),
    provider: z.string(),
  }),
  runtime: z.object({
    catalogVersion: z.string(),
    cliVersion: z.string(),
  }),
  schemaVersion: z.literal(2),
  selection: generationSelectionSchema,
  sourceGenerations: z.array(z.string()),
  status: z.enum([
    'created',
    'failed',
    'interrupted',
    'running',
    'submitted',
    'succeeded',
    'validating',
  ]),
  updatedAt: z.string(),
})

const legacyGenerationRecordSchema = z.object({
  createdAt: z.string(),
  creativeBrief: z.string(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
  id: z.string(),
  mediaType: z.enum(['image', 'video']),
  outputs: z.array(
    z.object({
      mediaType: z.string(),
      path: z.string(),
      sha256: z.string(),
      size: z.number().nonnegative(),
    }),
  ),
  provider: z.object({
    jobId: z.string().nullable(),
  }),
  references: z.array(referenceSchema),
  resolvedModel: z.object({
    deployment: z.string(),
    id: z.string(),
    model: z.string(),
    provider: z.string(),
  }),
  runtime: z.object({
    catalogVersion: z.string(),
    cliVersion: z.string(),
  }),
  schemaVersion: z.literal(1),
  selection: z.object({
    deliverable: z.string(),
    scenario: z.string(),
    style: z.string(),
  }),
  sourceGenerations: z.array(z.string()),
  status: z.enum([
    'created',
    'failed',
    'interrupted',
    'running',
    'submitted',
    'succeeded',
    'validating',
  ]),
  updatedAt: z.string(),
})

async function readGenerationRecord(
  path: string,
): Promise<GenerationRecord> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1
  ) {
    const legacy = legacyGenerationRecordSchema.parse(value)
    return upgradeToVersion5(
      upgradeToVersion4(
        upgradeToVersion3({
          ...legacy,
          schemaVersion: 2,
          selection: {
            generator: legacy.mediaType,
            kind: 'generator',
            style: legacy.selection.style,
          },
        }),
      ),
    )
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 2
  ) {
    return upgradeToVersion5(
      upgradeToVersion4(
        upgradeToVersion3(
          version2GenerationRecordSchema.parse(value),
        ),
      ),
    )
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 3
  ) {
    return upgradeToVersion5(
      upgradeToVersion4(
        version3GenerationRecordSchema.parse(value),
      ),
    )
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 4
  ) {
    return upgradeToVersion5(
      version4GenerationRecordSchema.parse(value),
    )
  }

  return generationRecordSchema.parse(value) as GenerationRecord
}

function upgradeToVersion3(
  record: z.infer<typeof version2GenerationRecordSchema>,
): z.infer<typeof version3GenerationRecordSchema> {
  const terminal =
    record.status === 'succeeded' || record.status === 'failed'
  return version3GenerationRecordSchema.parse({
    ...record,
    operations: [],
    progress: {
      completed: terminal ? 1 : 0,
      stage: record.status,
      total: 1,
    },
    resolvedResources: [
      {
        ...record.resolvedModel,
        role: 'generation',
      },
    ],
    runtime: {
      ...record.runtime,
      catalogVersion: '3',
    },
    scenario: null,
    schemaVersion: 3,
  })
}

function upgradeToVersion4(
  record: z.infer<typeof version3GenerationRecordSchema>,
): z.infer<typeof version4GenerationRecordSchema> {
  return version4GenerationRecordSchema.parse({
    ...record,
    runtime: {
      ...record.runtime,
      catalogVersion: '4',
    },
    schemaVersion: 4,
    textReferences: [],
    webReferences: [],
  })
}

function upgradeToVersion5(
  record: z.infer<typeof version4GenerationRecordSchema>,
): GenerationRecord {
  return generationRecordSchema.parse({
    ...record,
    controls: {},
    runtime: {
      ...record.runtime,
      catalogVersion: '5',
    },
    schemaVersion: 5,
  }) as GenerationRecord
}
