import {fileURLToPath} from 'node:url'
import {createReadStream} from 'node:fs'

import fastifyStatic from '@fastify/static'
import Fastify, {type FastifyInstance} from 'fastify'
import {z} from 'zod'

import type {
  CommandContext,
  MediaGenApplication,
} from '../../application/media-gen-application.js'
import {MediaGenError} from '../../application/media-gen-error.js'
import {defaultStyleFor} from '../../catalog/styles.js'
import {parseScenarioRequest} from '../../catalog/scenarios.js'

export interface LocalServerOptions {
  application: MediaGenApplication
  context: CommandContext
  uiRoot?: string
}

export function createLocalServer(
  options: LocalServerOptions,
): FastifyInstance {
  const server = Fastify({logger: false})
  server.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin
    if (
      !isLoopbackHostname(request.hostname) ||
      (origin !== undefined && !isLoopbackOrigin(origin))
    ) {
      return reply.status(403).send({
        code: 'loopback_request_required',
        error: true,
        message: 'Media Gen accepts requests only from loopback hosts',
      })
    }
  })
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof MediaGenError) {
      return reply.status(error.exitCode === 2 ? 409 : 400).send({
        code: error.code,
        error: true,
        help: error.help,
        message: error.message,
      })
    }

    return reply.send(error)
  })

  server.get('/api/home', async () =>
    options.application.execute({type: 'home'}, options.context),
  )
  server.get('/api/generations', async () =>
    options.application.execute(
      {type: 'generations-list'},
      options.context,
    ),
  )
  server.post('/api/create', async (request) => {
    const body = createBodySchema.parse(request.body)
    return options.application.execute(
      {
        force: body.force,
        request:
          body.request.kind === 'scenario'
            ? parseScenarioRequest(
                body.request.scenario,
                body.request,
              )
            : body.request,
        type: 'create',
      },
      options.context,
    )
  })
  server.get('/api/scenarios', async () =>
    options.application.execute(
      {type: 'scenarios-list'},
      options.context,
    ),
  )
  server.get('/api/scenarios/:id', async (request) => {
    const {id} = idParamsSchema.parse(request.params)
    return options.application.execute(
      {id, type: 'scenarios-get'},
      options.context,
    )
  })
  server.post('/api/scenarios/:id/:action', async (request) => {
    const {action, id} = scenarioActionParamsSchema.parse(
      request.params,
    )
    return options.application.execute(
      {
        enabled: action === 'enable',
        id,
        type: 'scenarios-set-enabled',
      },
      options.context,
    )
  })
  server.post('/api/generations', async (request) => {
    const body = generateBodySchema.parse(request.body)
    return options.application.execute(
      {
        controls: body.controls,
        creativeBrief: body.creativeBrief,
        deploymentId: body.deploymentId,
        force: body.force,
        mediaType: body.mediaType,
        referencePaths: body.referencePaths,
        style: body.style ?? defaultStyleFor(body.mediaType),
        textReferences: body.textReferences,
        type: 'generate',
        webReferenceUrls: body.webReferenceUrls,
      },
      options.context,
    )
  })
  server.get('/api/generations/:id', async (request) => {
    const {id} = idParamsSchema.parse(request.params)
    return options.application.execute(
      {id, type: 'generations-get'},
      options.context,
    )
  })
  server.get(
    '/api/generations/:id/outputs/:index',
    async (request, reply) => {
      const {id, index} = outputParamsSchema.parse(request.params)
      const result = await options.application.execute(
        {ids: [id], type: 'generations-reference'},
        options.context,
      )
      if (result.type !== 'generations-reference') {
        throw new Error('Expected Generation references')
      }
      const output = result.references[index]
      if (output === undefined) {
        return reply.status(404).send({
          code: 'output_not_found',
          error: true,
          message: `Generation output ${index} was not found`,
        })
      }

      return reply
        .type(output.mediaType)
        .send(createReadStream(output.path))
    },
  )
  server.delete('/api/generations/:id', async (request) => {
    const {id} = idParamsSchema.parse(request.params)
    const query = forceQuerySchema.parse(request.query)
    return options.application.execute(
      {
        force: query.force,
        id,
        type: 'generations-delete',
      },
      options.context,
    )
  })
  server.post('/api/generations/:id/export', async (request) => {
    const {id} = idParamsSchema.parse(request.params)
    const body = exportBodySchema.parse(request.body)
    return options.application.execute(
      {
        force: body.force,
        id,
        to: body.to,
        type: 'generations-export',
      },
      options.context,
    )
  })
  server.post('/api/generations/:id/recreate', async (request) => {
    const {id} = idParamsSchema.parse(request.params)
    const body = reuseBodySchema.parse(request.body)
    return options.application.execute(
      {
        creativeBrief: body.creativeBrief,
        id,
        style: body.style,
        type: 'generations-recreate',
      },
      options.context,
    )
  })
  server.post('/api/generations/:id/edit', async (request) => {
    const {id} = idParamsSchema.parse(request.params)
    const body = editBodySchema.parse(request.body)
    return options.application.execute(
      {
        creativeBrief: body.creativeBrief,
        id,
        style: body.style,
        type: 'generations-edit',
      },
      options.context,
    )
  })
  server.post('/api/references', async (request) => {
    const body = referencesBodySchema.parse(request.body)
    return options.application.execute(
      {
        ids: body.ids,
        type: 'generations-reference',
      },
      options.context,
    )
  })
  server.get('/api/auth', async () =>
    options.application.execute({type: 'auth-status'}, options.context),
  )
  server.get('/api/settings', async () =>
    options.application.execute({type: 'settings-get'}, options.context),
  )
  server.post('/api/configure/foundry', async (request) => {
    const body = configureFoundryBodySchema.parse(request.body)
    return options.application.execute(
      {
        endpoint: body.endpoint,
        name: body.name,
        type: 'configure-foundry',
      },
      options.context,
    )
  })
  server.post('/api/configure/speech', async (request) => {
    const body = configureSpeechBodySchema.parse(request.body)
    return options.application.execute(
      {
        apiKey: body.apiKey,
        endpoint: body.endpoint,
        type: 'configure-speech',
        voice: body.voice,
      },
      options.context,
    )
  })
  if (options.uiRoot !== undefined) {
    void server.register(fastifyStatic, {
      root: options.uiRoot,
    })
    server.setNotFoundHandler((_request, reply) =>
      reply.sendFile('index.html'),
    )
  }

  return server
}

export async function startLocalServer(
  options: LocalServerOptions,
  port = 4173,
): Promise<{server: FastifyInstance; url: string}> {
  const server = createLocalServer({
    ...options,
    uiRoot: options.uiRoot ?? defaultUiRoot,
  })
  const url = await server.listen({
    host: '127.0.0.1',
    port,
  })
  return {server, url}
}

const defaultUiRoot = fileURLToPath(
  new URL('../../../dist/ui', import.meta.url),
)

const generateBodySchema = z.object({
  controls: z.record(z.string(), z.unknown()).default({}),
  creativeBrief: z.string().min(1),
  deploymentId: z.string().min(1).optional(),
  force: z.boolean().default(false),
  mediaType: z.enum(['image', 'video']),
  referencePaths: z.array(z.string()).default([]),
  style: z.string().min(1).optional(),
  textReferences: z
    .array(
      z.object({
        content: z.string(),
        format: z.enum(['markdown', 'text']),
        title: z.string().optional(),
      }),
    )
    .optional(),
  webReferenceUrls: z.array(z.url()).optional(),
})

const generatorCreateRequestSchema = z.object({
  controls: z.record(z.string(), z.unknown()).default({}),
  creativeBrief: z.string().min(1),
  deploymentId: z.string().min(1).optional(),
  generator: z.enum(['image', 'video']),
  kind: z.literal('generator'),
  referencePaths: z.array(z.string()).default([]),
  style: z.string().min(1),
  textReferences: z
    .array(
      z.object({
        content: z.string(),
        format: z.enum(['markdown', 'text']),
        title: z.string().optional(),
      }),
    )
    .optional(),
  webReferenceUrls: z.array(z.url()).optional(),
})

const scenarioCreateRequestSchema = z.object({
  creativeBrief: z.string(),
  deploymentOverrides: z
    .record(z.string(), z.string())
    .default({}),
  kind: z.literal('scenario'),
  options: z.record(z.string(), z.unknown()).default({}),
  preset: z.string().min(1),
  scenario: z.enum(['explainer-video', 'short-form-video']),
  sourcePaths: z.array(z.string()).default([]),
  textReferences: z
    .array(
      z.object({
        content: z.string(),
        format: z.enum(['markdown', 'text']),
        title: z.string().optional(),
      }),
    )
    .optional(),
  webReferenceUrls: z.array(z.url()).optional(),
})

const createBodySchema = z.object({
  force: z.boolean().default(false),
  request: z.discriminatedUnion('kind', [
    generatorCreateRequestSchema,
    scenarioCreateRequestSchema,
  ]),
})

const idParamsSchema = z.object({
  id: z.string().min(1),
})

const scenarioActionParamsSchema = z.object({
  action: z.enum(['disable', 'enable']),
  id: z.string().min(1),
})

const outputParamsSchema = z.object({
  id: z.string().min(1),
  index: z.coerce.number().int().nonnegative(),
})

const forceQuerySchema = z.object({
  force: z
    .enum(['false', 'true'])
    .default('false')
    .transform((value) => value === 'true'),
})

const exportBodySchema = z.object({
  force: z.boolean().default(false),
  to: z.string().min(1).optional(),
})

const reuseBodySchema = z.object({
  creativeBrief: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
})

const editBodySchema = z.object({
  creativeBrief: z.string().min(1),
  style: z.string().min(1).optional(),
})

const referencesBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
})

const configureFoundryBodySchema = z.object({
  endpoint: z.url(),
  name: z.string().min(1),
})

const configureSpeechBodySchema = z.object({
  apiKey: z.string().min(1),
  endpoint: z.url(),
  voice: z.string().min(1),
})

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.toLowerCase() === 'localhost'
  )
}

function isLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      isLoopbackHostname(url.hostname)
    )
  } catch {
    return false
  }
}
