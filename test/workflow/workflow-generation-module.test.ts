import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'
import {z} from 'zod'

import {createGenerationStore} from '../../src/generation/generation-store.js'
import {
  createWorkflowGenerationModule,
} from '../../src/workflow/workflow-generation-module.js'
import type {
  WorkflowDefinition,
  WorkflowStepHandler,
} from '../../src/workflow/workflow-module.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('WorkflowGenerationModule', () => {
  test('starts a workflow and returns its Generation before completion', async () => {
    const workspacePath = await workspace()
    const store = createGenerationStore(workspacePath, {
      createId: () => '01BACKGROUND',
      now: () => new Date('2026-08-19T20:00:00.000Z'),
    })
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const workflowGeneration = createWorkflowGenerationModule({
      store,
      workspacePath,
    })

    const run = await workflowGeneration.start({
      createHandlers: () => [
        {
          execute: async (input) => {
            await gate
            return {
              output: z.object({title: z.string()}).parse(input),
            }
          },
          kind: 'prepare',
        },
        {
          execute: async () => {
            const path = join(
              workspacePath,
              'generations',
              '01BACKGROUND',
              'outputs',
              'final.mp4',
            )
            await writeFile(path, 'final video')
            return {
              artifacts: [
                {
                  disposition: 'output',
                  id: 'final-video',
                  mediaType: 'video/mp4',
                  path: 'outputs/final.mp4',
                },
              ],
            }
          },
          kind: 'publish',
        },
      ],
      definition: definition(),
      record: generationInput(),
      request: {title: 'Explain the product'},
    })

    expect(run.generation).toMatchObject({
      id: '01BACKGROUND',
      status: 'created',
    })
    expect(
      await Promise.race([
        run.completion.then(() => 'completed'),
        Promise.resolve('pending'),
      ]),
    ).toBe('pending')

    release()
    await expect(run.completion).resolves.toMatchObject({
      status: 'succeeded',
    })
  })

  test('rejects resume while the workflow already has an active owner', async () => {
    const workspacePath = await workspace()
    const store = createGenerationStore(workspacePath, {
      createId: () => '01OWNED',
      now: () => new Date('2026-08-19T20:00:00.000Z'),
    })
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const createHandlers = (): WorkflowStepHandler[] => [
      {
        execute: async (input) => {
          await gate
          return {
            output: z.object({title: z.string()}).parse(input),
          }
        },
        kind: 'prepare',
      },
      {
        execute: async () => {
          const path = join(
            workspacePath,
            'generations',
            '01OWNED',
            'outputs',
            'final.mp4',
          )
          await writeFile(path, 'final video')
          return {
            artifacts: [
              {
                disposition: 'output',
                id: 'final-video',
                mediaType: 'video/mp4',
                path: 'outputs/final.mp4',
              },
            ],
          }
        },
        kind: 'publish',
      },
    ]
    const workflowGeneration = createWorkflowGenerationModule({
      store,
      workspacePath,
    })
    const run = await workflowGeneration.start({
      createHandlers,
      definition: definition(),
      record: generationInput(),
      request: {title: 'Explain the product'},
    })

    const resumeOutcome = await Promise.race([
      workflowGeneration
        .resume({
          createHandlers,
          definition: definition(),
          generationId: '01OWNED',
        })
        .then(
          () => 'resolved',
          (error: unknown) =>
            error instanceof Error ? error.message : 'rejected',
        ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('pending'), 50),
      ),
    ])

    expect(resumeOutcome).toContain('already running')
    release()
    await run.completion
  })

  test('checkpoints workflow state and publishes output artifacts as Generation outputs', async () => {
    const workspacePath = await workspace()
    const generationDirectory = join(
      workspacePath,
      'generations',
      '01WORKFLOW',
    )
    const store = createGenerationStore(workspacePath, {
      createId: () => '01WORKFLOW',
      now: () => new Date('2026-08-19T20:00:00.000Z'),
    })
    const handlers: WorkflowStepHandler[] = [
      {
        execute: async (input) => ({
          output: z.object({title: z.string()}).parse(input),
        }),
        kind: 'prepare',
      },
      {
        execute: async () => {
          const path = 'outputs/final.mp4'
          await mkdir(join(generationDirectory, 'outputs'), {
            recursive: true,
          })
          await writeFile(
            join(generationDirectory, path),
            'final video',
          )
          return {
            artifacts: [
              {
                disposition: 'output',
                id: 'final-video',
                mediaType: 'video/mp4',
                path,
              },
            ],
          }
        },
        kind: 'publish',
      },
    ]
    const workflowGeneration = createWorkflowGenerationModule({
      store,
      workspacePath,
    })

    const result = await workflowGeneration.execute({
      definition: definition(),
      createHandlers: () => handlers,
      record: generationInput(),
      request: {title: 'Explain the product'},
    })

    expect(result).toMatchObject({
      error: null,
      id: '01WORKFLOW',
      operations: [
        {kind: 'prepare', status: 'succeeded'},
        {kind: 'publish', status: 'succeeded'},
      ],
      outputs: [
        {
          mediaType: 'video/mp4',
          path: 'outputs/final.mp4',
          size: 11,
        },
      ],
      progress: {
        completed: 2,
        stage: 'succeeded',
        total: 2,
      },
      status: 'succeeded',
    })
    expect(result.outputs[0]?.sha256).toHaveLength(64)
    const state = JSON.parse(
      await readFile(
        join(generationDirectory, 'working', 'workflow.json'),
        'utf8',
      ),
    ) as {status: string; workflow: {id: string}}
    expect(state).toMatchObject({
      status: 'succeeded',
      workflow: {id: 'test-workflow'},
    })
  })

  test('resumes persisted failed work without repeating successful steps', async () => {
    const workspacePath = await workspace()
    const store = createGenerationStore(workspacePath, {
      createId: () => '01RESUME',
      now: () => new Date('2026-08-19T20:00:00.000Z'),
    })
    let prepareCalls = 0
    let publishCalls = 0
    const failingHandlers: WorkflowStepHandler[] = [
      {
        execute: async (input) => {
          prepareCalls += 1
          return {
            output: z.object({title: z.string()}).parse(input),
          }
        },
        kind: 'prepare',
      },
      {
        execute: async () => {
          publishCalls += 1
          throw new Error('Temporary composition failure')
        },
        kind: 'publish',
      },
    ]
    const workflowGeneration = createWorkflowGenerationModule({
      store,
      workspacePath,
    })

    await expect(
      workflowGeneration.execute({
        definition: definition(),
        createHandlers: () => failingHandlers,
        record: generationInput(),
        request: {title: 'Explain the product'},
      }),
    ).rejects.toThrow('Temporary composition failure')

    const resumed = await workflowGeneration.resume({
      definition: definition(),
      generationId: '01RESUME',
      createHandlers: () => [
        failingHandlers[0]!,
        {
          execute: async () => {
            publishCalls += 1
            const path = join(
              workspacePath,
              'generations',
              '01RESUME',
              'outputs',
              'final.mp4',
            )
            await mkdir(join(path, '..'), {recursive: true})
            await writeFile(path, 'final video')
            return {
              artifacts: [
                {
                  disposition: 'output',
                  id: 'final-video',
                  mediaType: 'video/mp4',
                  path: 'outputs/final.mp4',
                },
              ],
            }
          },
          kind: 'publish',
        },
      ],
    })

    expect(resumed.status).toBe('succeeded')
    expect(prepareCalls).toBe(1)
    expect(publishCalls).toBe(2)
  })
})

function definition(): WorkflowDefinition<
  {title: string},
  {title: string}
> {
  return {
    build: () => [
      {
        dependsOn: ['prepare'],
        id: 'publish',
        input: {},
        kind: 'publish',
      },
    ],
    id: 'test-workflow',
    prepare: (request) => ({
      dependsOn: [],
      id: 'prepare',
      input: request,
      kind: 'prepare',
    }),
    preparedSchema: z.object({title: z.string()}),
    requestSchema: z.object({title: z.string()}),
    version: 1,
  }
}

function generationInput() {
  return {
    creativeBrief: 'Explain the product.',
    mediaType: 'video' as const,
    references: [],
    resolvedModel: {
      deployment: 'sora',
      id: 'primary:sora',
      model: 'sora-2',
      provider: 'primary',
    },
    resolvedResources: [
      {
        deployment: 'sora',
        id: 'primary:sora',
        model: 'sora-2',
        provider: 'primary',
        role: 'visuals',
      },
    ],
    scenario: {
      inputs: {sourcePaths: []},
      options: {duration: 20},
    },
    selection: {
      kind: 'scenario' as const,
      preset: 'hand-drawn',
      scenario: 'explainer-video',
    },
    sourceGenerations: [],
  }
}

async function workspace(): Promise<string> {
  const workspacePath = await mkdtemp(
    join(tmpdir(), 'media-gen-workflow-generation-'),
  )
  temporaryDirectories.push(workspacePath)
  await mkdir(join(workspacePath, 'generations'))
  return workspacePath
}
