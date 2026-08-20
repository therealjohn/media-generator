import type {z} from 'zod'
import {z as schema} from 'zod'

export interface WorkflowArtifact {
  disposition: 'output' | 'working'
  id: string
  mediaType?: string
  path: string
}

export interface WorkflowStepSpec {
  concurrencyKey?: string
  dependsOn: string[]
  id: string
  input: unknown
  kind: string
}

export interface WorkflowDefinition<Request, Prepared> {
  build(prepared: Prepared, request: Request): WorkflowStepSpec[]
  id: string
  prepare(request: Request): WorkflowStepSpec
  preparedSchema: z.ZodType<Prepared>
  requestSchema: z.ZodType<Request>
  version: number
}

export interface WorkflowStepContext {
  dependencyArtifacts: WorkflowArtifact[]
  dependencyOutputs: Readonly<Record<string, unknown>>
}

export interface WorkflowStepResult {
  artifacts?: WorkflowArtifact[]
  output?: unknown
}

export interface WorkflowStepHandler {
  execute(
    input: unknown,
    context: WorkflowStepContext,
  ): Promise<WorkflowStepResult>
  kind: string
}

export interface WorkflowStepState extends WorkflowStepSpec {
  artifacts: WorkflowArtifact[]
  attempts: number
  error?: string
  output?: unknown
  status: 'failed' | 'pending' | 'running' | 'succeeded'
}

export interface WorkflowExecutionState {
  artifacts: WorkflowArtifact[]
  error?: string
  outputs: WorkflowArtifact[]
  prepared?: unknown
  request: unknown
  status: 'failed' | 'running' | 'succeeded'
  steps: WorkflowStepState[]
  workflow: {
    id: string
    version: number
  }
}

export interface WorkflowModule {
  execute<Request, Prepared>(input: {
    definition: WorkflowDefinition<Request, Prepared>
    request: Request
  }): Promise<WorkflowExecutionState>
  resume<Request, Prepared>(input: {
    definition: WorkflowDefinition<Request, Prepared>
    state: WorkflowExecutionState
  }): Promise<WorkflowExecutionState>
}

const workflowArtifactSchema: schema.ZodType<WorkflowArtifact> =
  schema.object({
    disposition: schema.enum(['output', 'working']),
    id: schema.string().min(1),
    mediaType: schema.string().min(1).optional(),
    path: schema.string().min(1),
  })

const workflowStepStateSchema: schema.ZodType<WorkflowStepState> =
  schema.object({
    artifacts: schema.array(workflowArtifactSchema),
    attempts: schema.number().int().nonnegative(),
    concurrencyKey: schema.string().min(1).optional(),
    dependsOn: schema.array(schema.string().min(1)),
    error: schema.string().optional(),
    id: schema.string().min(1),
    input: schema.unknown(),
    kind: schema.string().min(1),
    output: schema.unknown().optional(),
    status: schema.enum([
      'failed',
      'pending',
      'running',
      'succeeded',
    ]),
  })

const workflowExecutionStateSchema: schema.ZodType<WorkflowExecutionState> =
  schema.object({
    artifacts: schema.array(workflowArtifactSchema),
    error: schema.string().optional(),
    outputs: schema.array(workflowArtifactSchema),
    prepared: schema.unknown().optional(),
    request: schema.unknown(),
    status: schema.enum(['failed', 'running', 'succeeded']),
    steps: schema.array(workflowStepStateSchema).min(1),
    workflow: schema.object({
      id: schema.string().min(1),
      version: schema.number().int().positive(),
    }),
  })

export function parseWorkflowExecutionState(
  value: unknown,
): WorkflowExecutionState {
  return workflowExecutionStateSchema.parse(value)
}

export function createWorkflowModule(dependencies: {
  checkpoint?(state: WorkflowExecutionState): Promise<void>
  concurrencyLimits?: Readonly<Record<string, number>>
  handlers: WorkflowStepHandler[]
  maxConcurrency?: number
}): WorkflowModule {
  const handlers = new Map(
    dependencies.handlers.map((handler) => [handler.kind, handler]),
  )
  const checkpointImplementation =
    dependencies.checkpoint ?? (async () => undefined)
  const maxConcurrency = dependencies.maxConcurrency ?? 1
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error('Workflow max concurrency must be a positive integer')
  }
  const concurrencyLimits = dependencies.concurrencyLimits ?? {}
  for (const [key, limit] of Object.entries(concurrencyLimits)) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(
        `Workflow concurrency limit "${key}" must be a positive integer`,
      )
    }
  }
  let checkpointQueue = Promise.resolve()
  const checkpoint = async (
    state: WorkflowExecutionState,
  ): Promise<void> => {
    checkpointQueue = checkpointQueue.then(() =>
      checkpointImplementation(state),
    )
    await checkpointQueue
  }

  async function execute<Request, Prepared>(input: {
    definition: WorkflowDefinition<Request, Prepared>
    request: Request
  }): Promise<WorkflowExecutionState> {
    const request = input.definition.requestSchema.parse(input.request)
    const preparation = input.definition.prepare(request)
    const state: WorkflowExecutionState = {
      artifacts: [],
      outputs: [],
      request,
      status: 'running',
      steps: [pendingStep(preparation)],
      workflow: {
        id: input.definition.id,
        version: input.definition.version,
      },
    }
    await checkpoint(state)
    return run(input.definition, state)
  }

  async function resume<Request, Prepared>(input: {
    definition: WorkflowDefinition<Request, Prepared>
    state: WorkflowExecutionState
  }): Promise<WorkflowExecutionState> {
    if (
      input.state.workflow.id !== input.definition.id ||
      input.state.workflow.version !== input.definition.version
    ) {
      throw new Error(
        `Workflow state belongs to ${input.state.workflow.id}@${input.state.workflow.version}`,
      )
    }
    for (const step of input.state.steps) {
      if (step.status === 'failed' || step.status === 'running') {
        step.status = 'pending'
        step.artifacts = []
        delete step.error
        delete step.output
      }
    }
    input.state.artifacts = input.state.steps.flatMap((step) =>
      step.status === 'succeeded' ? step.artifacts : [],
    )
    input.state.outputs = input.state.artifacts.filter(
      (artifact) => artifact.disposition === 'output',
    )
    return run(input.definition, input.state)
  }

  async function run<Request, Prepared>(
    definition: WorkflowDefinition<Request, Prepared>,
    state: WorkflowExecutionState,
  ): Promise<WorkflowExecutionState> {
    state.status = 'running'
    delete state.error

    try {
      const preparation = state.steps[0]
      if (preparation === undefined) {
        throw new Error('Workflow does not have a preparation step')
      }
      if (preparation.status !== 'succeeded') {
        await executeStep(preparation, state)
      }
      const prepared = definition.preparedSchema.parse(
        preparation.output,
      )
      state.prepared = prepared
      const request = definition.requestSchema.parse(state.request)

      if (state.steps.length === 1) {
        const graph = definition.build(prepared, request)
        validateGraph(preparation.id, graph)
        state.steps.push(...graph.map(pendingStep))
        await checkpoint(state)
      }

      const running = new Map<
        string,
        {
          completion: Promise<
            | {id: string; status: 'fulfilled'}
            | {error: unknown; id: string; status: 'rejected'}
          >
          step: WorkflowStepState
        }
      >()
      while (
        state.steps.some((step) => step.status === 'pending') ||
        running.size > 0
      ) {
        const ready = state.steps.filter(
          (step) =>
            step.status === 'pending' &&
            step.dependsOn.every(
              (dependencyId) =>
                requireStep(state, dependencyId).status ===
                'succeeded',
            ),
        )
        for (const step of ready) {
          if (running.size >= maxConcurrency) {
            break
          }
          if (
            !hasResourceCapacity(
              step,
              running,
              concurrencyLimits,
              maxConcurrency,
            )
          ) {
            continue
          }
          const completion = executeStep(step, state).then(
            () => ({
              id: step.id,
              status: 'fulfilled' as const,
            }),
            (error: unknown) => ({
              error,
              id: step.id,
              status: 'rejected' as const,
            }),
          )
          running.set(step.id, {completion, step})
        }
        if (running.size === 0) {
          throw new Error(
            'Workflow graph has no executable pending step',
          )
        }
        const settled = await Promise.race(
          [...running.values()].map(
            (active) => active.completion,
          ),
        )
        running.delete(settled.id)
        if (settled.status === 'rejected') {
          await Promise.allSettled(
            [...running.values()].map(
              (active) => active.completion,
            ),
          )
          throw settled.error
        }
      }

      state.status = 'succeeded'
      state.outputs = state.artifacts.filter(
        (artifact) => artifact.disposition === 'output',
      )
      await checkpoint(state)
      return state
    } catch (error) {
      state.status = 'failed'
      state.error =
        error instanceof Error ? error.message : 'Workflow failed'
      await checkpoint(state)
      throw error
    }
  }

  async function executeStep(
    step: WorkflowStepState,
    state: WorkflowExecutionState,
  ): Promise<void> {
    const handler = handlers.get(step.kind)
    if (handler === undefined) {
      throw new Error(
        `Workflow step handler "${step.kind}" is not available`,
      )
    }
    step.status = 'running'
    step.attempts += 1
    delete step.error
    await checkpoint(state)

    try {
      const dependenciesForStep = step.dependsOn.map((id) =>
        requireStep(state, id),
      )
      const dependencyOutputs = Object.fromEntries(
        dependenciesForStep.map((dependency) => [
          dependency.id,
          dependency.output,
        ]),
      )
      const result = await handler.execute(step.input, {
        dependencyArtifacts: dependenciesForStep.flatMap(
          (dependency) => dependency.artifacts,
        ),
        dependencyOutputs,
      })
      step.output = result.output
      step.artifacts = result.artifacts ?? []
      step.status = 'succeeded'
      state.artifacts = state.steps.flatMap(
        (current) => current.artifacts,
      )
      await checkpoint(state)
    } catch (error) {
      step.status = 'failed'
      step.error =
        error instanceof Error ? error.message : 'Workflow step failed'
      await checkpoint(state)
      throw error
    }
  }

  return {execute, resume}
}

function hasResourceCapacity(
  step: WorkflowStepState,
  running: ReadonlyMap<string, {step: WorkflowStepState}>,
  concurrencyLimits: Readonly<Record<string, number>>,
  maxConcurrency: number,
): boolean {
  const key = step.concurrencyKey
  if (key === undefined) {
    return true
  }
  const activeForKey = [...running.values()].filter(
    (active) => active.step.concurrencyKey === key,
  ).length
  return activeForKey < (concurrencyLimits[key] ?? maxConcurrency)
}

function pendingStep(spec: WorkflowStepSpec): WorkflowStepState {
  return {
    ...spec,
    artifacts: [],
    attempts: 0,
    status: 'pending',
  }
}

function requireStep(
  state: WorkflowExecutionState,
  id: string,
): WorkflowStepState {
  const step = state.steps.find((candidate) => candidate.id === id)
  if (step === undefined) {
    throw new Error(`Workflow step "${id}" does not exist`)
  }
  return step
}

function validateGraph(
  preparationId: string,
  graph: WorkflowStepSpec[],
): void {
  const ids = new Set([preparationId])
  for (const step of graph) {
    if (ids.has(step.id)) {
      throw new Error(`Workflow step "${step.id}" is duplicated`)
    }
    ids.add(step.id)
  }
  for (const step of graph) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(
          `Workflow step "${step.id}" depends on unknown step "${dependency}"`,
        )
      }
    }
  }
}
