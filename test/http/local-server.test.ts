import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {createMediaGenApplication} from '../../src/application/media-gen-application.js'
import type {
  MediaGenApplication,
  MediaGenCommand,
  MediaGenResult,
} from '../../src/application/media-gen-application.js'
import {MediaGenError} from '../../src/application/media-gen-error.js'
import {
  createLocalServer,
  startLocalServer,
} from '../../src/adapters/http/local-server.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('LocalServer', () => {
  test('rejects requests with a non-loopback Host header', async () => {
    let executed = false
    const server = createLocalServer({
      application: {
        execute: async () => {
          executed = true
          return {type: 'settings-get'} as MediaGenResult
        },
      },
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      headers: {host: 'attacker.example'},
      method: 'GET',
      url: '/api/settings',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({
      code: 'loopback_request_required',
      error: true,
    })
    expect(executed).toBe(false)
    await server.close()
  })

  test('rejects state-changing requests from a non-loopback Origin', async () => {
    let executed = false
    const server = createLocalServer({
      application: {
        execute: async () => {
          executed = true
          return {type: 'settings-get'} as MediaGenResult
        },
      },
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      body: {
        endpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        name: 'primary',
      },
      headers: {
        host: '127.0.0.1:4173',
        origin: 'https://attacker.example',
      },
      method: 'POST',
      url: '/api/configure/foundry',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({
      code: 'loopback_request_required',
      error: true,
    })
    expect(executed).toBe(false)
    await server.close()
  })

  test('maps Scenario discovery and creation routes to application commands', async () => {
    const commands: MediaGenCommand[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        commands.push(command)
        return resultFor(command)
      },
    }
    const server = createLocalServer({
      application,
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    await server.inject({method: 'GET', url: '/api/scenarios'})
    await server.inject({
      method: 'GET',
      url: '/api/scenarios/explainer-video',
    })
    await server.inject({
      method: 'POST',
      url: '/api/scenarios/explainer-video/enable',
    })
    await server.inject({
      method: 'POST',
      url: '/api/scenarios/short-form-video/disable',
    })
    const createResponse = await server.inject({
      body: {
        force: false,
        request: {
          creativeBrief: 'Explain retrieval-augmented generation.',
          deploymentOverrides: {},
          kind: 'scenario',
          options: {
            'aspect-ratio': '16:9',
            duration: 20,
            subtitles: true,
            voice: {
              id: 'en-US-Harper:MAI-Voice-2',
              mode: 'selected',
            },
          },
          preset: 'editorial-motion-graphics',
          scenario: 'explainer-video',
          sourcePaths: [],
          textReferences: [
            {
              content: '# Product setup',
              format: 'markdown',
              title: 'Product documentation',
            },
          ],
        },
      },
      method: 'POST',
      url: '/api/create',
    })
    expect(createResponse.statusCode).toBe(202)

    expect(commands).toEqual([
      {type: 'scenarios-list'},
      {id: 'explainer-video', type: 'scenarios-get'},
      {
        enabled: true,
        id: 'explainer-video',
        type: 'scenarios-set-enabled',
      },
      {
        enabled: false,
        id: 'short-form-video',
        type: 'scenarios-set-enabled',
      },
      {
        background: true,
        force: false,
        request: {
          creativeBrief: 'Explain retrieval-augmented generation.',
          deploymentOverrides: {},
          kind: 'scenario',
          options: {
            'aspect-ratio': '16:9',
            duration: 20,
            subtitles: true,
            voice: {
              id: 'en-US-Harper:MAI-Voice-2',
              mode: 'selected',
            },
          },
          preset: 'editorial-motion-graphics',
          scenario: 'explainer-video',
          sourcePaths: [],
          textReferences: [
            {
              content: '# Product setup',
              format: 'markdown',
              title: 'Product documentation',
            },
          ],
        },
        type: 'create',
      },
    ])
    await server.close()
  })

  test('streams a generated output from the Media Workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-output-'))
    temporaryDirectories.push(root)
    const outputPath = join(root, 'output.png')
    await writeFile(outputPath, 'image bytes', 'utf8')
    const server = createLocalServer({
      application: {
        execute: async () => ({
          references: [
            {
              generationId: '01GENERATION',
              mediaType: 'image/png',
              path: outputPath,
            },
          ],
          type: 'generations-reference',
        }),
      },
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      method: 'GET',
      url: '/api/generations/01GENERATION/outputs/0',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('image/png')
    expect(response.body).toBe('image bytes')
    await server.close()
  })

  test('streams a Generation Reference Asset by scoped index', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-input-'))
    temporaryDirectories.push(root)
    const inputPath = join(root, 'product.png')
    await writeFile(inputPath, 'input bytes', 'utf8')
    const server = createLocalServer({
      application: {
        execute: async () => ({
          generation: {
            ...generationRecord('01GENERATION'),
            references: [
              {
                mediaType: 'image/png',
                modifiedAt: '2026-08-20T12:00:00.000Z',
                path: inputPath,
                sha256: 'input-sha',
                size: 11,
              },
            ],
          },
          referenceStates: [{path: inputPath, state: 'present'}],
          type: 'generations-get',
        }),
      },
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      method: 'GET',
      url: '/api/generations/01GENERATION/references/0',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('image/png')
    expect(response.body).toBe('input bytes')
    await server.close()
  })

  test('browses local reference files and streams selected image previews', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-reference-'))
    temporaryDirectories.push(root)
    const imagePath = join(root, 'product.png')
    const documentPath = join(root, 'brand-guide.pdf')
    await writeFile(imagePath, 'image bytes', 'utf8')
    await writeFile(documentPath, 'document bytes', 'utf8')
    const browseReferenceFiles = vi.fn(
      async () => [imagePath, documentPath],
    )
    const server = createLocalServer({
      application: {
        execute: async () => {
          throw new Error('The file picker must stay in the HTTP adapter')
        },
      },
      browseReferenceFiles,
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const browseResponse = await server.inject({
      method: 'POST',
      url: '/api/reference-files/browse',
    })

    expect(browseResponse.statusCode).toBe(200)
    expect(browseReferenceFiles).toHaveBeenCalledWith({
      multiple: true,
      title: 'Choose reference files',
    })
    const browseResult = browseResponse.json()
    expect(browseResult).toMatchObject({
      files: [
        {
          mediaType: 'image/png',
          name: 'product.png',
          path: imagePath,
        },
        {
          mediaType: 'application/pdf',
          name: 'brand-guide.pdf',
          path: documentPath,
        },
      ],
      type: 'reference-files-browse',
    })
    expect(browseResult.files[0].previewUrl).toMatch(
      /^\/api\/reference-files\/previews\//,
    )
    expect(browseResult.files[1].previewUrl).toBeUndefined()

    const previewResponse = await server.inject({
      method: 'GET',
      url: browseResult.files[0].previewUrl,
    })
    expect(previewResponse.statusCode).toBe(200)
    expect(previewResponse.headers['content-type']).toContain(
      'image/png',
    )
    expect(previewResponse.body).toBe('image bytes')
    await server.close()
  })

  test('restricts the source-video picker to MP4 and MOV files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-source-video-'))
    temporaryDirectories.push(root)
    const imagePath = join(root, 'product.png')
    await writeFile(imagePath, 'image bytes', 'utf8')
    const browseReferenceFiles = vi.fn(async () => [imagePath])
    const server = createLocalServer({
      application: {
        execute: async () => {
          throw new Error('The file picker must stay in the HTTP adapter')
        },
      },
      browseReferenceFiles,
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      body: {purpose: 'source-video'},
      method: 'POST',
      url: '/api/reference-files/browse',
    })

    expect(browseReferenceFiles).toHaveBeenCalledWith({
      extensions: ['.mp4', '.mov'],
      multiple: false,
      title: 'Choose source video',
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'invalid_source_video',
      error: true,
    })
    await server.close()
  })

  test('rejects multiple files returned for one source video', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-source-count-'))
    temporaryDirectories.push(root)
    const firstPath = join(root, 'first.mp4')
    const secondPath = join(root, 'second.mov')
    await writeFile(firstPath, 'first video', 'utf8')
    await writeFile(secondPath, 'second video', 'utf8')
    const server = createLocalServer({
      application: {
        execute: async () => {
          throw new Error('The file picker must stay in the HTTP adapter')
        },
      },
      browseReferenceFiles: async () => [firstPath, secondPath],
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      body: {purpose: 'source-video'},
      method: 'POST',
      url: '/api/reference-files/browse',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'invalid_source_video',
      error: true,
      message: 'Choose exactly one source video',
    })
    await server.close()
  })

  test('evicts old local reference preview tokens', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-preview-cap-'))
    temporaryDirectories.push(root)
    const imagePath = join(root, 'product.png')
    await writeFile(imagePath, 'image bytes', 'utf8')
    const server = createLocalServer({
      application: {
        execute: async () => {
          throw new Error('The file picker must stay in the HTTP adapter')
        },
      },
      browseReferenceFiles: async () => [imagePath],
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const previewUrls: string[] = []
    for (let index = 0; index < 65; index += 1) {
      const response = await server.inject({
        method: 'POST',
        url: '/api/reference-files/browse',
      })
      previewUrls.push(response.json().files[0].previewUrl)
    }

    const evicted = await server.inject({
      method: 'GET',
      url: previewUrls[0]!,
    })
    const retained = await server.inject({
      method: 'GET',
      url: previewUrls.at(-1)!,
    })
    expect(evicted.statusCode).toBe(404)
    expect(retained.statusCode).toBe(200)
    await server.close()
  })

  test('serves bundled Local UI assets', async () => {
    const uiRoot = await mkdtemp(join(tmpdir(), 'media-gen-ui-root-'))
    temporaryDirectories.push(uiRoot)
    await writeFile(
      join(uiRoot, 'index.html'),
      '<!doctype html><title>Media Gen</title>',
      'utf8',
    )
    const server = createLocalServer({
      application: createMediaGenApplication(),
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
      uiRoot,
    })

    const response = await server.inject({
      method: 'GET',
      url: '/create',
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('<title>Media Gen</title>')
    await server.close()
  })

  test('starts on the IPv4 loopback interface', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'media-gen-listen-'))
    temporaryDirectories.push(cwd)

    const running = await startLocalServer(
      {
        application: createMediaGenApplication(),
        context: {
          bin: 'mg',
          cwd,
          mediaGenHome: join(cwd, 'home'),
        },
      },
      0,
    )

    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    await running.server.close()
  })

  test('maps detail, settings, and reuse routes to application commands', async () => {
    const commands: MediaGenCommand[] = []
    const application: MediaGenApplication = {
      execute: async (command) => {
        commands.push(command)
        return resultFor(command)
      },
    }
    const server = createLocalServer({
      application,
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    await server.inject({
      method: 'GET',
      url: '/api/generations/01GENERATION',
    })
    await server.inject({
      method: 'DELETE',
      url: '/api/generations/01GENERATION?force=true',
    })
    await server.inject({
      body: {force: true, to: 'assets/final'},
      method: 'POST',
      url: '/api/generations/01GENERATION/export',
    })
    const recreateResponse = await server.inject({
      body: {creativeBrief: 'Updated', style: 'cinematic'},
      method: 'POST',
      url: '/api/generations/01GENERATION/recreate',
    })
    expect(recreateResponse.statusCode).toBe(200)
    const resumeResponse = await server.inject({
      method: 'POST',
      url: '/api/generations/01GENERATION/resume',
    })
    expect(resumeResponse.statusCode).toBe(202)
    await server.inject({
      body: {creativeBrief: 'Edit this', style: 'product-led'},
      method: 'POST',
      url: '/api/generations/01GENERATION/edit',
    })
    await server.inject({
      body: {ids: ['01FIRST', '01SECOND']},
      method: 'POST',
      url: '/api/references',
    })
    await server.inject({method: 'GET', url: '/api/auth'})
    await server.inject({method: 'GET', url: '/api/settings'})
    await server.inject({
      body: {
        endpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        name: 'primary',
      },
      method: 'POST',
      url: '/api/configure/foundry',
    })
    await server.inject({
      body: {
        apiKey: 'private-speech-key',
        endpoint:
          'https://speech-resource.cognitiveservices.azure.com/',
        voice: 'en-US-Ethan:MAI-Voice-2',
      },
      method: 'POST',
      url: '/api/configure/speech',
    })

    expect(commands).toEqual([
      {id: '01GENERATION', type: 'generations-get'},
      {
        force: true,
        id: '01GENERATION',
        type: 'generations-delete',
      },
      {
        force: true,
        id: '01GENERATION',
        to: 'assets/final',
        type: 'generations-export',
      },
      {
        background: true,
        creativeBrief: 'Updated',
        id: '01GENERATION',
        style: 'cinematic',
        type: 'generations-recreate',
      },
      {
        background: true,
        id: '01GENERATION',
        type: 'generations-resume',
      },
      {
        creativeBrief: 'Edit this',
        id: '01GENERATION',
        style: 'product-led',
        type: 'generations-edit',
      },
      {
        ids: ['01FIRST', '01SECOND'],
        type: 'generations-reference',
      },
      {type: 'auth-status'},
      {type: 'settings-get'},
      {
        endpoint:
          'https://example.services.ai.azure.com/api/projects/media',
        name: 'primary',
        type: 'configure-foundry',
      },
      {
        apiKey: 'private-speech-key',
        endpoint:
          'https://speech-resource.cognitiveservices.azure.com/',
        type: 'configure-speech',
        voice: 'en-US-Ethan:MAI-Voice-2',
      },
    ])
    await server.close()
  })

  test('returns structured application errors', async () => {
    const server = createLocalServer({
      application: {
        execute: async () => {
          throw new MediaGenError(
            'confirmation_required',
            'The action requires force',
            2,
            ['Retry with force'],
          )
        },
      },
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      method: 'GET',
      url: '/api/home',
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'confirmation_required',
      error: true,
      help: ['Retry with force'],
      message: 'The action requires force',
    })
    await server.close()
  })

  test('creates a Generation from the workbench request', async () => {
    const application = {
      execute: async (command: unknown) => {
        expect(command).toEqual({
          controls: {height: 1024, width: 1024},
          creativeBrief: 'Show the dashboard at launch.',
          deploymentId: 'primary:gpt-image',
          force: true,
          mediaType: 'image',
          referencePaths: ['C:\\assets\\product.png'],
          style: 'cinematic',
          textReferences: [
            {
              content: 'Product positioning notes',
              format: 'text',
              title: 'Notes',
            },
          ],
          type: 'generate',
        })
        return {
          generation: generationRecord('01GENERATION'),
          type: 'generate' as const,
        }
      },
    }
    const server = createLocalServer({
      application,
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      body: {
        controls: {height: 1024, width: 1024},
        creativeBrief: 'Show the dashboard at launch.',
        deploymentId: 'primary:gpt-image',
        force: true,
        mediaType: 'image',
        referencePaths: ['C:\\assets\\product.png'],
        style: 'cinematic',
        textReferences: [
          {
            content: 'Product positioning notes',
            format: 'text',
            title: 'Notes',
          },
        ],
      },
      method: 'POST',
      url: '/api/generations',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      generation: {id: '01GENERATION'},
      type: 'generate',
    })
    await server.close()
  })

  test('returns Generation history', async () => {
    const application = {
      execute: async (command: {type: string}) => {
        expect(command).toEqual({type: 'generations-list'})
        return {
          count: 0,
          generations: [],
          type: 'generations-list' as const,
        }
      },
    }
    const server = createLocalServer({
      application,
      context: {
        bin: 'mg',
        cwd: 'C:\\work',
        mediaGenHome: 'C:\\home',
      },
    })

    const response = await server.inject({
      method: 'GET',
      url: '/api/generations',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      count: 0,
      generations: [],
      type: 'generations-list',
    })
    await server.close()
  })

  test('returns the application home result', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'media-gen-server-'))
    temporaryDirectories.push(cwd)
    const server = createLocalServer({
      application: createMediaGenApplication(),
      context: {
        bin: 'mg',
        cwd,
        mediaGenHome: join(cwd, 'home'),
      },
    })

    const response = await server.inject({
      method: 'GET',
      url: '/api/home',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      projectDirectory: cwd,
      state: 'uninitialized',
      type: 'home',
    })
    await server.close()
  })
})

function generationRecord(id: string) {
  return {
    controls: {},
    createdAt: '2026-08-18T12:00:00.000Z',
    creativeBrief: 'Show the dashboard at launch.',
    error: null,
    id,
    mediaType: 'image' as const,
    operations: [],
    outputs: [],
    progress: {completed: 1, stage: 'succeeded', total: 1},
    provider: {jobId: null},
    references: [],
    resolvedModel: {
      deployment: 'mai-fast',
      id: 'primary:mai-fast',
      model: 'MAI-Image-2.5-Flash',
      provider: 'primary',
    },
    resolvedResources: [
      {
        deployment: 'mai-fast',
        id: 'primary:mai-fast',
        model: 'MAI-Image-2.5-Flash',
        provider: 'primary',
        role: 'generation',
      },
    ],
    runtime: {catalogVersion: '4', cliVersion: '0.0.0'},
    scenario: null,
    schemaVersion: 5 as const,
    selection: {
      generator: 'image' as const,
      kind: 'generator' as const,
      style: 'cinematic',
    },
    sourceGenerations: [],
    status: 'succeeded' as const,
    textReferences: [],
    updatedAt: '2026-08-18T12:00:00.000Z',
    webReferences: [],
  }
}

function resultFor(command: MediaGenCommand): MediaGenResult {
  switch (command.type) {
    case 'create':
      return {
        generation: generationRecord('01CREATED'),
        type: 'create',
      }
    case 'scenarios-list':
      return {scenarios: [], type: 'scenarios-list'}
    case 'scenarios-get':
      return {
        scenario: {
          description: 'Scenario',
          enabled: false,
          id: 'explainer-video',
          mediaType: 'video',
          presets: [],
          productionOptions: [],
          readiness: {
            missingRoles: ['visuals'],
            state: 'not-ready',
          },
          routingRoles: ['visuals'],
          title: 'Explainer video',
        },
        type: 'scenarios-get',
      }
    case 'scenarios-set-enabled':
      return {
        enabled: command.enabled,
        id: command.id,
        type: 'scenarios-set-enabled',
      }
    case 'generations-get':
      return {
        generation: generationRecord(command.id),
        referenceStates: [],
        type: 'generations-get',
      }
    case 'generations-delete':
      return {
        id: command.id,
        state: 'deleted',
        type: 'generations-delete',
      }
    case 'generations-export':
      return {
        files: [],
        id: command.id,
        type: 'generations-export',
      }
    case 'generations-recreate':
      return {
        generation: generationRecord('01RECREATED'),
        type: 'generations-recreate',
      }
    case 'generations-resume':
      return {
        generation: generationRecord(command.id),
        type: 'generations-resume',
      }
    case 'generations-edit':
      return {
        generation: generationRecord('01EDITED'),
        type: 'generations-edit',
      }
    case 'generations-reference':
      return {references: [], type: 'generations-reference'}
    case 'auth-status':
      return {help: [], state: 'signed-out', type: 'auth'}
    case 'configure-foundry':
      return {
        deployments: [],
        provider: {endpoint: command.endpoint, name: command.name},
        type: 'configure-foundry',
        unsupported: [],
      }
    case 'configure-speech':
      return {
        endpoint: command.endpoint,
        state: 'configured',
        type: 'configure-speech',
        voice: command.voice,
      }
    case 'settings-get':
      return {
        auth: {help: [], state: 'signed-out'},
        catalog: {
          videoModels: [],
          voices: [],
        },
        manifest: {
          deployments: {},
          export: {},
          providers: {},
          routing: {
            generators: {},
            scenarios: {},
          },
          scenarios: {enabled: []},
          schemaVersion: 2,
          workspace: {name: 'Project'},
        },
        scenarios: [],
        speech: {configured: false},
        type: 'settings-get',
      }
    default:
      throw new Error(`Unexpected command ${command.type}`)
  }
}
