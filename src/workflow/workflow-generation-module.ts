import {createHash, randomUUID} from 'node:crypto'
import {
  mkdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  join,
} from 'node:path'

import type {
  CreateGenerationInput,
  GenerationRecord,
  GenerationStore,
} from '../generation/generation-store.js'
import {writeJsonAtomic} from '../workspace/atomic-json.js'
import {
  createWorkflowModule,
  parseWorkflowExecutionState,
  type WorkflowDefinition,
  type WorkflowExecutionState,
  type WorkflowStepHandler,
} from './workflow-module.js'
import {resolveWithinGeneration} from './workflow-path.js'

export interface WorkflowGenerationModule {
  execute<Request, Prepared>(
    input: WorkflowGenerationExecutionInput<Request, Prepared>,
  ): Promise<GenerationRecord>
  resume<Request, Prepared>(input: {
    concurrencyLimits?: Readonly<Record<string, number>>
    createHandlers(
      context: WorkflowGenerationContext,
    ): WorkflowStepHandler[]
    definition: WorkflowDefinition<Request, Prepared>
    generationId: string
    maxConcurrency?: number
  }): Promise<GenerationRecord>
  startResume<Request, Prepared>(input: {
    concurrencyLimits?: Readonly<Record<string, number>>
    createHandlers(
      context: WorkflowGenerationContext,
    ): WorkflowStepHandler[]
    definition: WorkflowDefinition<Request, Prepared>
    generationId: string
    maxConcurrency?: number
  }): Promise<WorkflowGenerationRun>
  start<Request, Prepared>(
    input: WorkflowGenerationExecutionInput<Request, Prepared>,
  ): Promise<WorkflowGenerationRun>
}

export interface WorkflowGenerationExecutionInput<Request, Prepared> {
  concurrencyLimits?: Readonly<Record<string, number>>
  createHandlers(
    context: WorkflowGenerationContext,
  ): WorkflowStepHandler[]
  definition: WorkflowDefinition<Request, Prepared>
  inputFiles?: Array<{contents: string; path: string}>
  maxConcurrency?: number
  record: CreateGenerationInput
  request: Request
}

export interface WorkflowGenerationContext {
  generationDirectory: string
  generationId: string
}

export interface WorkflowGenerationRun {
  completion: Promise<GenerationRecord>
  generation: GenerationRecord
}

export function createWorkflowGenerationModule(dependencies: {
  store: GenerationStore
  workspacePath: string
}): WorkflowGenerationModule {
  return {
    async execute(input) {
      const run = await startExecution(input)
      return run.completion
    },

    start: startExecution,

    async resume(input) {
      const run = await startResumeExecution(input)
      return run.completion
    },

    startResume: startResumeExecution,
  }

  async function startResumeExecution<Request, Prepared>(input: {
    concurrencyLimits?: Readonly<Record<string, number>>
    createHandlers(
      context: WorkflowGenerationContext,
    ): WorkflowStepHandler[]
    definition: WorkflowDefinition<Request, Prepared>
    generationId: string
    maxConcurrency?: number
  }): Promise<WorkflowGenerationRun> {
    const current = await dependencies.store.get(input.generationId)
    const generationDirectory = generationPath(
      dependencies.workspacePath,
      input.generationId,
    )
    const workflow = workflowForGeneration({
      concurrencyLimits: input.concurrencyLimits,
      generationId: input.generationId,
      createHandlers: input.createHandlers,
      maxConcurrency: input.maxConcurrency,
    })
    const lease = await acquireWorkflowLease(
      generationDirectory,
      input.generationId,
    )
    try {
      const state = parseWorkflowExecutionState(
        JSON.parse(
          await readFile(
            workflowStatePath(generationDirectory),
            'utf8',
          ),
        ) as unknown,
      )
      const generation =
        state.status === 'succeeded'
          ? current
          : await dependencies.store.update(
              input.generationId,
              (record) => ({
                ...record,
                error: null,
                status: 'running',
              }),
            )
      const completion =
        (state.status === 'succeeded'
          ? Promise.resolve(state)
          : workflow.resume({
              definition: input.definition,
              state,
            }))
          .then((resumed) =>
            finalize(input.generationId, resumed),
          )
          .finally(() => lease.release())
      return {completion, generation}
    } catch (error) {
      await lease.release()
      throw error
    }
  }

  async function startExecution<Request, Prepared>(
    input: WorkflowGenerationExecutionInput<Request, Prepared>,
  ): Promise<WorkflowGenerationRun> {
    const record = await dependencies.store.create(input.record)
    const generationDirectory = generationPath(
      dependencies.workspacePath,
      record.id,
    )
    await mkdir(join(generationDirectory, 'working'), {
      recursive: true,
    })
    await Promise.all(
      (input.inputFiles ?? []).map(async (file) => {
        const path = resolveWithinGeneration(
          generationDirectory,
          file.path,
        )
        await mkdir(dirname(path), {recursive: true})
        await writeFile(path, file.contents, 'utf8')
      }),
    )
    const workflow = workflowForGeneration({
      concurrencyLimits: input.concurrencyLimits,
      generationId: record.id,
      createHandlers: input.createHandlers,
      maxConcurrency: input.maxConcurrency,
    })
    const lease = await acquireWorkflowLease(
      generationDirectory,
      record.id,
    )
    const completion = workflow
      .execute({
        definition: input.definition,
        request: input.request,
      })
      .then((state) => finalize(record.id, state))
      .finally(() => lease.release())
    return {completion, generation: record}
  }

  async function acquireWorkflowLease(
    generationDirectory: string,
    generationId: string,
  ): Promise<{release(): Promise<void>}> {
    const leasePath = join(
      generationDirectory,
      'working',
      'workflow-run.lock',
    )
    const ownerPath = join(leasePath, 'owner')
    const owner = randomUUID()
    const staleAfterMs = 30_000

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await mkdir(leasePath)
        await writeFile(ownerPath, owner, 'utf8')
        break
      } catch (error) {
        if (!isExistingPath(error)) {
          throw error
        }
        const metadata = await stat(leasePath)
        if (Date.now() - metadata.mtimeMs <= staleAfterMs) {
          throw new Error(
            `Workflow Generation "${generationId}" is already running`,
          )
        }
        await rm(leasePath, {force: true, recursive: true})
        if (attempt === 1) {
          throw new Error(
            `Workflow Generation "${generationId}" lease could not be acquired`,
          )
        }
      }
    }

    let heartbeatError: unknown
    const heartbeat = setInterval(() => {
      void refreshLease(leasePath, ownerPath, owner)
        .then(() => {
          heartbeatError = undefined
        })
        .catch((error: unknown) => {
          heartbeatError = error
        })
    }, 5_000)
    heartbeat.unref()

    return {
      async release() {
        clearInterval(heartbeat)
        if (await leaseOwnedBy(ownerPath, owner)) {
          await rm(leasePath, {force: true, recursive: true})
        }
        if (heartbeatError !== undefined) {
          throw heartbeatError
        }
      },
    }
  }

  async function refreshLease(
    leasePath: string,
    ownerPath: string,
    owner: string,
  ): Promise<void> {
    if (!(await leaseOwnedBy(ownerPath, owner))) {
      throw new Error('Workflow lease ownership was lost')
    }
    const now = new Date()
    await utimes(leasePath, now, now)
  }

  async function leaseOwnedBy(
    ownerPath: string,
    owner: string,
  ): Promise<boolean> {
    try {
      return (await readFile(ownerPath, 'utf8')) === owner
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return false
      }
      throw error
    }
  }

  function isExistingPath(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      error.code === 'EEXIST'
    )
  }

  function workflowForGeneration(input: {
    concurrencyLimits?: Readonly<Record<string, number>>
    createHandlers(
      context: WorkflowGenerationContext,
    ): WorkflowStepHandler[]
    generationId: string
    maxConcurrency?: number
  }) {
    const generationDirectory = generationPath(
      dependencies.workspacePath,
      input.generationId,
    )
    return createWorkflowModule({
      checkpoint: async (state) => {
        await writeJsonAtomic(
          workflowStatePath(generationDirectory),
          state,
        )
        await dependencies.store.update(
          input.generationId,
          (current) => projectWorkflowState(current, state),
        )
      },
      concurrencyLimits: input.concurrencyLimits,
      handlers: input.createHandlers({
        generationDirectory,
        generationId: input.generationId,
      }),
      maxConcurrency: input.maxConcurrency,
    })
  }

  async function finalize(
    generationId: string,
    state: WorkflowExecutionState,
  ): Promise<GenerationRecord> {
    const generationDirectory = generationPath(
      dependencies.workspacePath,
      generationId,
    )
    const outputs = await Promise.all(
      state.outputs.map(async (artifact) => {
        if (artifact.mediaType === undefined) {
          throw new Error(
            `Published workflow artifact "${artifact.id}" is missing a media type`,
          )
        }
        if (!artifact.path.replaceAll('\\', '/').startsWith('outputs/')) {
          throw new Error(
            `Published workflow artifact "${artifact.id}" must be under outputs/`,
          )
        }
        const contents = await readFile(
          resolveWithinGeneration(generationDirectory, artifact.path),
        )
        return {
          mediaType: artifact.mediaType,
          path: artifact.path,
          sha256: createHash('sha256')
            .update(contents)
            .digest('hex'),
          size: contents.byteLength,
        }
      }),
    )
    return dependencies.store.update(generationId, (current) => ({
      ...projectWorkflowState(current, state),
      outputs,
    }))
  }
}

function projectWorkflowState(
  record: GenerationRecord,
  state: WorkflowExecutionState,
): GenerationRecord {
  const completed = state.steps.filter(
    (step) => step.status === 'succeeded',
  ).length
  const activeStep =
    state.steps.find((step) => step.status === 'running') ??
    state.steps.find((step) => step.status === 'pending')
  return {
    ...record,
    error:
      state.status === 'failed'
        ? {
            code: 'workflow_failed',
            message: state.error ?? 'Workflow failed',
          }
        : null,
    operations: state.steps.map((step) => ({
      kind: step.id,
      ...(step.error === undefined ? {} : {message: step.error}),
      status: step.status,
    })),
    progress: {
      completed,
      stage:
        state.status === 'running'
          ? (activeStep?.id ?? 'running')
          : state.status,
      total: state.steps.length,
    },
    status: state.status,
  }
}

function generationPath(
  workspacePath: string,
  generationId: string,
): string {
  return join(workspacePath, 'generations', generationId)
}

function workflowStatePath(generationDirectory: string): string {
  return join(generationDirectory, 'working', 'workflow.json')
}
