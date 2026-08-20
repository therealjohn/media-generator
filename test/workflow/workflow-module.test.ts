import {z} from 'zod'
import {describe, expect, test} from 'vitest'

import {
  createWorkflowModule,
  type WorkflowDefinition,
  type WorkflowExecutionState,
  type WorkflowStepHandler,
} from '../../src/workflow/workflow-module.js'

describe('WorkflowModule', () => {
  test('executes a prepared dependency graph and publishes final artifacts', async () => {
    const events: string[] = []
    const checkpoints: WorkflowExecutionState[] = []
    const handlers: WorkflowStepHandler[] = [
      {
        execute: async (input) => {
          const request = z.object({topic: z.string()}).parse(input)
          events.push('plan')
          return {
            output: {
              title: `Explain ${request.topic}`,
            },
          }
        },
        kind: 'plan',
      },
      {
        execute: async (input) => {
          const scene = z.object({title: z.string()}).parse(input)
          events.push('generate')
          return {
            artifacts: [
              {
                disposition: 'working',
                id: 'scene-video',
                mediaType: 'video/mp4',
                path: 'working/scene.mp4',
              },
            ],
            output: {title: scene.title},
          }
        },
        kind: 'generate',
      },
      {
        execute: async (_input, context) => {
          events.push('publish')
          expect(context.dependencyArtifacts).toEqual([
            {
              disposition: 'working',
              id: 'scene-video',
              mediaType: 'video/mp4',
              path: 'working/scene.mp4',
            },
          ])
          return {
            artifacts: [
              {
                disposition: 'output',
                id: 'final-video',
                mediaType: 'video/mp4',
                path: 'outputs/explainer.mp4',
              },
            ],
          }
        },
        kind: 'publish',
      },
    ]
    const definition: WorkflowDefinition<
      {topic: string},
      {title: string}
    > = {
      build: (prepared) => [
        {
          dependsOn: ['prepare'],
          id: 'generate',
          input: {title: prepared.title},
          kind: 'generate',
        },
        {
          dependsOn: ['generate'],
          id: 'publish',
          input: {},
          kind: 'publish',
        },
      ],
      id: 'explainer-video',
      prepare: (request) => ({
        dependsOn: [],
        id: 'prepare',
        input: request,
        kind: 'plan',
      }),
      preparedSchema: z.object({title: z.string()}),
      requestSchema: z.object({topic: z.string()}),
      version: 1,
    }
    const workflow = createWorkflowModule({
      checkpoint: async (state) => {
        checkpoints.push(structuredClone(state))
      },
      handlers,
    })

    const result = await workflow.execute({
      definition,
      request: {topic: 'retrieval-augmented generation'},
    })

    expect(events).toEqual(['plan', 'generate', 'publish'])
    expect(result).toMatchObject({
      outputs: [
        {
          id: 'final-video',
          path: 'outputs/explainer.mp4',
        },
      ],
      status: 'succeeded',
      steps: [
        {id: 'prepare', status: 'succeeded'},
        {id: 'generate', status: 'succeeded'},
        {id: 'publish', status: 'succeeded'},
      ],
      workflow: {
        id: 'explainer-video',
        version: 1,
      },
    })
    expect(checkpoints.at(-1)?.status).toBe('succeeded')
  })

  test('runs independent steps with bounded concurrency', async () => {
    let active = 0
    let maximumActive = 0
    const handlers: WorkflowStepHandler[] = [
      {
        execute: async () => ({output: {ready: true}}),
        kind: 'plan',
      },
      {
        execute: async () => {
          active += 1
          maximumActive = Math.max(maximumActive, active)
          await new Promise((resolve) => setTimeout(resolve, 10))
          active -= 1
          return {}
        },
        kind: 'work',
      },
      {
        execute: async () => ({}),
        kind: 'join',
      },
    ]
    const definition: WorkflowDefinition<
      {topic: string},
      {ready: boolean}
    > = {
      build: () => [
        {
          dependsOn: ['prepare'],
          id: 'work-1',
          input: {},
          kind: 'work',
        },
        {
          dependsOn: ['prepare'],
          id: 'work-2',
          input: {},
          kind: 'work',
        },
        {
          dependsOn: ['prepare'],
          id: 'work-3',
          input: {},
          kind: 'work',
        },
        {
          dependsOn: ['work-1', 'work-2', 'work-3'],
          id: 'join',
          input: {},
          kind: 'join',
        },
      ],
      id: 'parallel-work',
      prepare: (request) => ({
        dependsOn: [],
        id: 'prepare',
        input: request,
        kind: 'plan',
      }),
      preparedSchema: z.object({ready: z.boolean()}),
      requestSchema: z.object({topic: z.string()}),
      version: 1,
    }
    const workflow = createWorkflowModule({
      handlers,
      maxConcurrency: 2,
    })

    await workflow.execute({
      definition,
      request: {topic: 'parallel work'},
    })

    expect(maximumActive).toBe(2)
  })

  test('applies concurrency limits by resource key', async () => {
    let activeVideos = 0
    let maximumActiveVideos = 0
    const handlers: WorkflowStepHandler[] = [
      {
        execute: async () => ({output: {ready: true}}),
        kind: 'plan',
      },
      {
        execute: async () => {
          activeVideos += 1
          maximumActiveVideos = Math.max(
            maximumActiveVideos,
            activeVideos,
          )
          await new Promise((resolve) => setTimeout(resolve, 10))
          activeVideos -= 1
          return {}
        },
        kind: 'video',
      },
      {
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return {}
        },
        kind: 'voice',
      },
    ]
    const definition: WorkflowDefinition<
      {topic: string},
      {ready: boolean}
    > = {
      build: () => [
        {
          concurrencyKey: 'video-deployment',
          dependsOn: ['prepare'],
          id: 'video-1',
          input: {},
          kind: 'video',
        },
        {
          concurrencyKey: 'video-deployment',
          dependsOn: ['prepare'],
          id: 'video-2',
          input: {},
          kind: 'video',
        },
        {
          concurrencyKey: 'speech',
          dependsOn: ['prepare'],
          id: 'voice-1',
          input: {},
          kind: 'voice',
        },
      ],
      id: 'resource-limits',
      prepare: (request) => ({
        dependsOn: [],
        id: 'prepare',
        input: request,
        kind: 'plan',
      }),
      preparedSchema: z.object({ready: z.boolean()}),
      requestSchema: z.object({topic: z.string()}),
      version: 1,
    }
    const workflow = createWorkflowModule({
      concurrencyLimits: {
        'video-deployment': 1,
      },
      handlers,
      maxConcurrency: 3,
    })

    await workflow.execute({
      definition,
      request: {topic: 'resource limits'},
    })

    expect(maximumActiveVideos).toBe(1)
  })

  test('fills a free slot without waiting for the slowest running step', async () => {
    let releaseSlow: () => void = () => undefined
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve
    })
    let thirdStarted = false
    const handlers: WorkflowStepHandler[] = [
      {
        execute: async () => ({output: {ready: true}}),
        kind: 'plan',
      },
      {
        execute: async (input) => {
          const work = z.object({id: z.number()}).parse(input)
          if (work.id === 2) {
            await slowGate
          }
          if (work.id === 3) {
            thirdStarted = true
          }
          return {}
        },
        kind: 'work',
      },
    ]
    const definition: WorkflowDefinition<
      {topic: string},
      {ready: boolean}
    > = {
      build: () => [1, 2, 3].map((id) => ({
        dependsOn: ['prepare'],
        id: `work-${id}`,
        input: {id},
        kind: 'work',
      })),
      id: 'slot-scheduling',
      prepare: (request) => ({
        dependsOn: [],
        id: 'prepare',
        input: request,
        kind: 'plan',
      }),
      preparedSchema: z.object({ready: z.boolean()}),
      requestSchema: z.object({topic: z.string()}),
      version: 1,
    }
    const workflow = createWorkflowModule({
      handlers,
      maxConcurrency: 2,
    })

    const completion = workflow.execute({
      definition,
      request: {topic: 'slots'},
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(thirdStarted).toBe(true)
    releaseSlow()
    await completion
  })

  test('resumes failed workflows without repeating succeeded steps', async () => {
    let generationAttempts = 0
    let failedState: WorkflowExecutionState | undefined
    const handlers: WorkflowStepHandler[] = [
      {
        execute: async () => ({output: {title: 'Prepared'}}),
        kind: 'plan',
      },
      {
        execute: async () => {
          generationAttempts += 1
          if (generationAttempts === 1) {
            throw new Error('Temporary provider failure')
          }
          return {
            artifacts: [
              {
                disposition: 'working',
                id: 'scene',
                path: 'working/scene.mp4',
              },
            ],
          }
        },
        kind: 'generate',
      },
      {
        execute: async () => ({
          artifacts: [
            {
              disposition: 'output',
              id: 'final',
              path: 'outputs/final.mp4',
            },
          ],
        }),
        kind: 'publish',
      },
    ]
    const definition: WorkflowDefinition<
      {topic: string},
      {title: string}
    > = {
      build: () => [
        {
          dependsOn: ['prepare'],
          id: 'generate',
          input: {},
          kind: 'generate',
        },
        {
          dependsOn: ['generate'],
          id: 'publish',
          input: {},
          kind: 'publish',
        },
      ],
      id: 'resumable-work',
      prepare: (request) => ({
        dependsOn: [],
        id: 'prepare',
        input: request,
        kind: 'plan',
      }),
      preparedSchema: z.object({title: z.string()}),
      requestSchema: z.object({topic: z.string()}),
      version: 1,
    }
    const workflow = createWorkflowModule({
      checkpoint: async (state) => {
        if (state.status === 'failed') {
          failedState = structuredClone(state)
        }
      },
      handlers,
    })

    await expect(
      workflow.execute({
        definition,
        request: {topic: 'resumable work'},
      }),
    ).rejects.toThrow('Temporary provider failure')

    const resumed = await workflow.resume({
      definition,
      state: failedState!,
    })

    expect(resumed.status).toBe('succeeded')
    expect(resumed.steps).toMatchObject([
      {attempts: 1, id: 'prepare', status: 'succeeded'},
      {attempts: 2, id: 'generate', status: 'succeeded'},
      {attempts: 1, id: 'publish', status: 'succeeded'},
    ])
  })
})
