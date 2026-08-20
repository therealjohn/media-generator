import {describe, expect, test} from 'vitest'

import {
  parseRegistry,
  parseLocalProfile,
  parseWorkspaceManifest,
  WorkspaceSchemaError,
} from '../../src/workspace/schemas.js'

describe('parseRegistry', () => {
  test('returns a typed version 1 registry', () => {
    const value = {
      schemaVersion: 1,
      workspaces: [
        {
          id: '01WORKSPACE',
          name: 'Project',
          projectDirectory: 'C:\\Project',
          slug: 'project',
        },
      ],
    }

    expect(parseRegistry(value)).toEqual(value)
  })
})

describe('parseLocalProfile', () => {
  test('returns a typed version 1 local profile', () => {
    expect(parseLocalProfile({schemaVersion: 1})).toEqual({
      schemaVersion: 1,
    })
  })

  test('accepts a private Azure Speech connection', () => {
    expect(
      parseLocalProfile({
        schemaVersion: 1,
        speech: {
          apiKey: 'private-key',
          defaultVoice: 'en-US-Ethan:MAI-Voice-2',
          endpoint:
            'https://speech-resource.cognitiveservices.azure.com/',
        },
      }),
    ).toEqual({
      schemaVersion: 1,
      speech: {
        apiKey: 'private-key',
        defaultVoice: 'en-US-Ethan:MAI-Voice-2',
        endpoint:
          'https://speech-resource.cognitiveservices.azure.com/',
      },
    })
  })

  test('rejects a private Speech connection that targets a non-Azure host', () => {
    expect(() =>
      parseLocalProfile({
        schemaVersion: 1,
        speech: {
          apiKey: 'private-key',
          defaultVoice: 'en-US-Ethan:MAI-Voice-2',
          endpoint: 'https://speech.example.com/',
        },
      }),
    ).toThrowError(WorkspaceSchemaError)
  })
})

describe('parseWorkspaceManifest', () => {
  test('returns a typed version 1 manifest', () => {
    const value = {
      deployments: {},
      export: {defaultDirectory: 'assets/generated'},
      providers: {},
      routing: {
        generators: {},
        scenarios: {},
      },
      scenarios: {
        enabled: [],
      },
      schemaVersion: 2,
      workspace: {name: 'Project'},
    }

    expect(parseWorkspaceManifest(value)).toEqual(value)
  })

  test('rejects a Foundry connection that targets a non-Azure host', () => {
    expect(() =>
      parseWorkspaceManifest({
        deployments: {},
        export: {},
        providers: {
          primary: {
            kind: 'microsoft-foundry',
            projectEndpoint:
              'https://attacker.example/api/projects/media',
          },
        },
        routing: {
          generators: {},
          scenarios: {},
        },
        scenarios: {enabled: []},
        schemaVersion: 2,
        workspace: {name: 'Project'},
      }),
    ).toThrowError(WorkspaceSchemaError)
  })

  test('normalizes version 1 routes into role-based version 2 routing', () => {
    expect(
      parseWorkspaceManifest({
        deployments: {},
        export: {},
        providers: {},
        routing: {
          'product-marketing-image': {auto: ['image-deployment']},
          'product-marketing-video': {auto: ['video-deployment']},
        },
        scenarios: {
          enabled: [
            'product-marketing-image',
            'product-marketing-video',
          ],
        },
        schemaVersion: 1,
        workspace: {name: 'Project'},
      }),
    ).toEqual({
      deployments: {},
      export: {},
      providers: {},
      routing: {
        generators: {
          image: {auto: ['image-deployment']},
          video: {auto: ['video-deployment']},
        },
        scenarios: {},
      },
      scenarios: {enabled: []},
      schemaVersion: 2,
      workspace: {name: 'Project'},
    })
  })

  test('accepts a structured planning model deployment', () => {
    const manifest = parseWorkspaceManifest({
        deployments: {
          'primary:planner': {
            adapter: 'azure-openai-chat',
            deploymentName: 'planner',
            model: 'gpt-4.1-mini',
            provider: 'primary',
          },
        },
        export: {},
        providers: {
          primary: {
            kind: 'microsoft-foundry',
            projectEndpoint:
              'https://example.services.ai.azure.com/api/projects/media',
          },
        },
        routing: {
          generators: {},
          scenarios: {
            'explainer-video': {
              planning: {auto: ['primary:planner']},
            },
          },
        },
        scenarios: {enabled: ['explainer-video']},
        schemaVersion: 2,
        workspace: {name: 'Project'},
      })
    expect(manifest).toMatchObject({
      deployments: {
        'primary:planner': {
          adapter: 'azure-openai-chat',
        },
      },
      routing: {
        scenarios: {
          'explainer-video': {},
        },
      },
    })
    expect(
      manifest.routing.scenarios['explainer-video'],
    ).not.toHaveProperty('planning')
  })

  test('removes obsolete shared MAI Voice deployment configuration', () => {
    const manifest = parseWorkspaceManifest({
        deployments: {
          'primary:sora': {
            adapter: 'sora-video',
            deploymentName: 'sora',
            model: 'sora-2',
            provider: 'primary',
          },
          'primary:voice': {
            adapter: 'mai-voice',
            deploymentName: 'voice',
            endpoint:
              'https://eastus.tts.speech.microsoft.com/',
            model: 'MAI-Voice-2',
            provider: 'primary',
          },
        },
        export: {},
        providers: {
          primary: {
            kind: 'microsoft-foundry',
            projectEndpoint:
              'https://example.services.ai.azure.com/api/projects/media',
          },
        },
        routing: {
          generators: {
            video: {auto: ['primary:sora']},
          },
          scenarios: {
            'explainer-video': {
              visuals: {auto: ['primary:sora']},
              voice: {auto: ['primary:voice']},
            },
          },
        },
        scenarios: {enabled: ['explainer-video']},
        schemaVersion: 2,
        workspace: {name: 'Project'},
      })
    expect(manifest).toMatchObject({
      deployments: {
        'primary:sora': {
          adapter: 'sora-video',
        },
      },
      routing: {
        scenarios: {
          'explainer-video': {
            visuals: {auto: ['primary:sora']},
          },
        },
      },
    })
    expect(manifest.deployments).not.toHaveProperty('primary:voice')
    expect(
      manifest.routing.scenarios['explainer-video'],
    ).not.toHaveProperty('voice')
  })

  test('rejects unsupported schema versions with a structured error', () => {
    expect(() =>
      parseWorkspaceManifest({
        deployments: {},
        export: {},
        providers: {},
        routing: {},
        scenarios: {enabled: []},
        schemaVersion: 3,
        workspace: {name: 'Project'},
      }),
    ).toThrowError(
      new WorkspaceSchemaError(
        'unsupported_manifest_version',
        'Workspace manifest schema version 3 is not supported',
      ),
    )
  })
})
