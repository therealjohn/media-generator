// @vitest-environment jsdom

import React from 'react'
import {
  act,
  cleanup,
  render,
  screen,
  within,
} from '@testing-library/react'
import {userEvent} from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {afterEach, describe, expect, test, vi} from 'vitest'

import type {
  GenerationRecord,
  SettingsGetResult,
} from '../../src/ui/api-client.js'
import {App} from '../../src/ui/app.js'

globalThis.ResizeObserver = class ResizeObserver {
  disconnect() {}

  observe() {}

  unobserve() {}
}

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: {
    configurable: true,
    value: () => false,
  },
  releasePointerCapture: {
    configurable: true,
    value: () => undefined,
  },
  scrollIntoView: {
    configurable: true,
    value: () => undefined,
  },
  setPointerCapture: {
    configurable: true,
    value: () => undefined,
  },
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Local UI', () => {
  test('renders the Create workbench with shadcn design-system primitives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settingsResult())),
    )

    renderApp('/create')

    const model = await screen.findByRole('combobox', {name: 'Model'})
    const brief = screen.getByRole('textbox', {
      name: 'Creative Brief',
    })
    const generate = screen.getByRole('button', {
      name: 'Generate image',
    })

    expect(model.getAttribute('data-slot')).toBe('native-select')
    expect(brief.getAttribute('data-slot')).toBe('textarea')
    expect(generate.getAttribute('data-slot')).toBe('button')
    expect(model.closest('[data-slot="card"]')).not.toBeNull()
  })

  test('renders primary navigation with shadcn buttons', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settingsResult())),
    )

    renderApp('/create')

    const navigation = screen.getByRole('navigation', {
      name: 'Primary',
    })
    for (const name of ['Create', 'Generations', 'Settings']) {
      const link = within(navigation).getByRole('link', {name})
      expect(link.getAttribute('data-slot')).toBe('button')
      expect(link.getAttribute('aria-label')).toBe(name)
    }
  })

  test('uses shadcn controls throughout the Create direction panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settingsResult())),
    )
    const user = userEvent.setup()

    renderApp('/create')

    const model = await screen.findByRole('combobox', {name: 'Model'})
    expect(
      screen
        .getByRole('button', {name: /Minimal studio/})
        .getAttribute('data-slot'),
    ).toBe('button')
    const aspectRatio = screen.getByRole('combobox', {
      name: 'Aspect ratio',
    })
    expect(aspectRatio.getAttribute('data-slot')).toBe('select-trigger')
    expect(
      aspectRatio.querySelector('[data-aspect-ratio-icon]'),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {name: 'Add references'}).getAttribute(
        'data-reference-dropzone',
      ),
    ).toBe('true')
    expect(
      screen.getByRole('button', {name: /Image/}).getAttribute(
        'data-slot',
      ),
    ).toBe('button')

    await user.selectOptions(model, 'primary:mai-fast')

    expect(
      screen
        .getByRole('checkbox', {name: 'Approve fallback'})
        .getAttribute('data-slot'),
    ).toBe('checkbox')
  })

  test('uses model-supported duration choices for video', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settingsResult())),
    )
    const user = userEvent.setup()

    renderApp('/create')

    await user.click(screen.getByRole('button', {name: /Video/}))

    const duration = screen.getByRole('combobox', {name: 'Duration'})
    expect((duration as HTMLSelectElement).value).toBe('8')
    expect(
      within(duration).getByRole('option', {name: '4 seconds'}),
    ).not.toBeNull()
    expect(
      within(duration).getByRole('option', {name: '20 seconds'}),
    ).not.toBeNull()

    await user.selectOptions(duration, '20')

    expect((duration as HTMLSelectElement).value).toBe('20')
  })

  test('opens a reference picker with local and Generation sources', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input) === '/api/settings'
            ? jsonResponse(settingsResult())
            : jsonResponse({
                count: 0,
                generations: [],
                type: 'generations-list',
              }),
        ),
      ),
    )
    const user = userEvent.setup()

    renderApp('/create')

    await user.click(
      screen.getByRole('button', {name: 'Add references'}),
    )

    const picker = await screen.findByRole('dialog', {
      name: 'Add references',
    })
    expect(
      within(picker).getByRole('tab', {name: 'Local files'}),
    ).not.toBeNull()
    expect(
      within(picker).getByRole('tab', {
        name: 'Image Generations',
      }),
    ).not.toBeNull()
    expect(
      within(picker).getByRole('tab', {
        name: 'Video Generations',
      }),
    ).not.toBeNull()
    expect(
      within(picker).getByRole('button', {name: 'Browse files'}),
    ).not.toBeNull()
    expect(
      within(picker).queryByRole('textbox', {
        name: 'Reference paths',
      }),
    ).toBeNull()
  })

  test('adds pasted text without asking for a title or format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input) === '/api/settings'
            ? jsonResponse(settingsResult())
            : jsonResponse({
                count: 0,
                generations: [],
                type: 'generations-list',
              }),
        ),
      ),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      screen.getByRole('button', {name: 'Add references'}),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Add references',
    })
    await user.click(
      within(picker).getByRole('tab', {name: 'Text'}),
    )
    expect(
      within(picker).queryByRole('textbox', {name: 'Title'}),
    ).toBeNull()
    expect(
      within(picker).queryByRole('combobox', {name: 'Format'}),
    ).toBeNull()
    expect(within(picker).queryByText('Markdown')).toBeNull()
    await user.type(
      within(picker).getByRole('textbox', {name: 'Text'}),
      '# Product setup{enter}{enter}Connect the SDK.',
    )
    await user.click(
      within(picker).getByRole('button', {
        name: 'Add text',
      }),
    )
    await user.click(
      within(picker).getByRole('button', {name: 'Close'}),
    )

    expect(screen.getByText('Product setup')).not.toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Remove text reference Product setup',
      }),
    ).not.toBeNull()
  })

  test('browses local files and previews images and generic files', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          return Promise.resolve(jsonResponse(settingsResult()))
        }
        if (path === '/api/generations' && init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              count: 0,
              generations: [],
              type: 'generations-list',
            }),
          )
        }
        if (
          path === '/api/reference-files/browse' &&
          init?.method === 'POST'
        ) {
          return Promise.resolve(
            jsonResponse({
              files: [
                {
                  mediaType: 'image/png',
                  name: 'product.png',
                  path: 'C:\\assets\\product.png',
                  previewUrl:
                    '/api/reference-files/previews/image-token',
                },
                {
                  mediaType: 'application/pdf',
                  name: 'brand-guide.pdf',
                  path: 'C:\\assets\\brand-guide.pdf',
                },
              ],
              type: 'reference-files-browse',
            }),
          )
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      screen.getByRole('button', {name: 'Add references'}),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Add references',
    })
    await user.click(
      within(picker).getByRole('button', {name: 'Browse files'}),
    )

    const image = within(picker).getByRole('img', {
      name: 'Reference product.png',
    })
    expect(image.getAttribute('src')).toBe(
      '/api/reference-files/previews/image-token',
    )
    expect(within(picker).getByText('brand-guide')).not.toBeNull()
    expect(within(picker).getByText('PDF')).not.toBeNull()
    expect(fetchFake).toHaveBeenCalledWith(
      '/api/reference-files/browse',
      {
        body: JSON.stringify({purpose: 'references'}),
        headers: {'Content-Type': 'application/json'},
        method: 'POST',
      },
    )
  })

  test('adds a prior Generation from the reference picker', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          return Promise.resolve(jsonResponse(settingsResult()))
        }
        if (path === '/api/generations' && init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              count: 1,
              generations: [
                generationRecord({
                  outputs: [
                    {
                      mediaType: 'image/png',
                      path: 'outputs/output-1.png',
                      sha256: 'output-sha',
                      size: 1024,
                    },
                  ],
                }),
              ],
              type: 'generations-list',
            }),
          )
        }
        if (path === '/api/references') {
          return Promise.resolve(
            jsonResponse({
              references: [
                {
                  generationId: '01GENERATION',
                  mediaType: 'image/png',
                  path: 'C:\\media\\01GENERATION\\output.png',
                },
              ],
              type: 'generations-reference',
            }),
          )
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')

    await user.click(
      screen.getByRole('button', {name: 'Add references'}),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Add references',
    })
    await user.click(
      within(picker).getByRole('tab', {
        name: 'Image Generations',
      }),
    )
    await user.click(
      await within(picker).findByRole('button', {
        name: 'Use Generation 01GENERATION',
      }),
    )

    expect(await within(picker).findByText('Selected')).not.toBeNull()
    await user.click(
      within(picker).getByRole('button', {name: 'Close'}),
    )

    expect(
      screen
        .getByRole('img', {name: 'Reference output.png'})
        .getAttribute('src'),
    ).toBe('/api/generations/01GENERATION/outputs/0')
    const [, referenceInit] = fetchFake.mock.calls.find(
      ([path]) => String(path) === '/api/references',
    )!
    expect(JSON.parse(String(referenceInit?.body))).toEqual({
      ids: ['01GENERATION'],
    })
  })

  test('shows an error when a Generation reference cannot be added', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          return Promise.resolve(jsonResponse(settingsResult()))
        }
        if (path === '/api/generations' && init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              count: 1,
              generations: [
                generationRecord({
                  outputs: [
                    {
                      mediaType: 'image/png',
                      path: 'outputs/output-1.png',
                      sha256: 'output-sha',
                      size: 1024,
                    },
                  ],
                }),
              ],
              type: 'generations-list',
            }),
          )
        }
        return Promise.resolve(
          jsonResponse(
            {
              code: 'reference_failed',
              error: true,
              help: [],
              message: 'The Generation output is unavailable.',
            },
            400,
          ),
        )
      }),
    )
    const user = userEvent.setup()

    renderApp('/create')

    await user.click(
      screen.getByRole('button', {name: 'Add references'}),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Add references',
    })
    await user.click(
      within(picker).getByRole('tab', {
        name: 'Image Generations',
      }),
    )
    await user.click(
      await within(picker).findByRole('button', {
        name: 'Use Generation 01GENERATION',
      }),
    )

    expect(
      await within(picker).findByRole('alert', {
        name: 'Could not add Generation reference',
      }),
    ).not.toBeNull()
    expect(
      within(picker).getByText(
        'The Generation output is unavailable.',
      ),
    ).not.toBeNull()
  })

  test('submits an optional manual model deployment', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, _init?: RequestInit) =>
        Promise.resolve(
          String(input) === '/api/settings'
            ? jsonResponse(settingsResult())
            : jsonResponse({
                generation: generationRecord({id: '01GENERATED'}),
                type: 'generate',
              }),
        ),
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')

    const model = await screen.findByRole('combobox', {name: 'Model'})
    await user.type(
      screen.getByRole('textbox', {name: 'Creative Brief'}),
      'Show the dashboard.',
    )
    await user.selectOptions(
      model,
      'primary:mai-fast',
    )
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Approve fallback',
      }),
    )
    await user.click(
      screen.getByRole('button', {name: 'Generate image'}),
    )

    const [, init] = fetchFake.mock.calls.find(
      ([path]) => String(path) === '/api/generations',
    )!
    expect(JSON.parse(String(init?.body))).toMatchObject({
      deploymentId: 'primary:mai-fast',
      force: true,
    })
  })

  test('opens Image as a prompt-first workbench', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settingsResult())),
    )
    renderApp('/create')

    expect(
      screen.getByRole('heading', {
        name: 'Image',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('textbox', {name: 'Creative Brief'}),
    ).not.toBeNull()

    const createNavigation = screen.getByRole('navigation', {
      name: 'Create',
    })
    expect(
      within(createNavigation).getByRole('button', {
        name: /Image/,
      }),
    ).not.toBeNull()
    expect(
      within(createNavigation).getByRole('button', {
        name: /Video/,
      }),
    ).not.toBeNull()
    expect(
      within(createNavigation).queryByText('Product marketing image'),
    ).toBeNull()
    expect(
      within(createNavigation).queryByText('Product marketing video'),
    ).toBeNull()

    expect(screen.queryByRole('group', {name: 'Media type'})).toBeNull()
    expect(
      screen.getByRole('button', {
        name: /Minimal studio.*Clean lighting/,
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {
        name: /Editorial illustration.*Conceptual editorial/,
      }),
    ).not.toBeNull()
    const brief = screen.getByRole('textbox', {name: 'Creative Brief'})
    const promptCard = brief.closest<HTMLElement>('[data-slot="card"]')
    expect(promptCard).not.toBeNull()
    expect(
      within(promptCard!).getByRole('button', {
        name: 'Add references',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Model'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {name: 'Generate image'}),
    ).not.toBeNull()

    const advanced = screen.getByText('Advanced')
    expect(advanced.closest('details')?.open).toBe(false)
  })

  test('carries the prompt and Style card UX into Video', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settingsResult())),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(screen.getByRole('button', {name: /Video/}))

    expect(
      screen.getByRole('heading', {name: 'Video'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {
        name: /Handheld UGC.*Informal handheld/,
      }),
    ).not.toBeNull()
    const brief = screen.getByRole('textbox', {name: 'Creative Brief'})
    expect(
      within(brief.closest('[data-slot="card"]')!).getByRole(
        'button',
        {name: 'Add references'},
      ),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Model'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Duration'}),
    ).not.toBeNull()
  })

  test('shows built-in Scenarios below the general Generators', async () => {
    const settings = settingsResult()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )

    renderApp('/create')

    const navigation = screen.getByRole('navigation', {
      name: 'Create',
    })
    expect(
      await within(navigation).findByText('Scenarios'),
    ).not.toBeNull()
    expect(
      within(navigation).getByRole('button', {
        name: /Explainer video/,
      }),
    ).not.toBeNull()
    expect(
      within(navigation).getByRole('button', {
        name: /Short-form video/,
      }),
    ).not.toBeNull()
  })

  test('opens a purpose-built Explainer video workbench', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.manifest.scenarios.enabled = ['explainer-video']
    settings.manifest.routing.scenarios = {
      'explainer-video': {
        visuals: {auto: ['primary:sora']},
      },
    }
    settings.speech = {
      configured: true,
      defaultVoice: 'en-US-Ethan:MAI-Voice-2',
      endpoint:
        'https://speech-resource.cognitiveservices.azure.com/',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )

    expect(
      screen.getByRole('heading', {name: 'Explainer video'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('textbox', {
        name: 'What should the video explain?',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {
        name: /Editorial motion graphics/,
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Voice'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('option', {name: 'Off'}),
    ).not.toBeNull()
    expect(
      screen.queryByRole('option', {name: /Auto.*Ethan/i}),
    ).toBeNull()
    expect(screen.queryByText('Narration provider')).toBeNull()
    expect(screen.queryByText('Azure Speech configured')).toBeNull()
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Voice',
        }) as HTMLSelectElement
      ).value,
    ).toBe('en-US-Ethan:MAI-Voice-2')
    expect(
      screen.queryByRole('textbox', {name: 'Narration script'}),
    ).toBeNull()
    await user.selectOptions(
      screen.getByRole('combobox', {name: 'Voice'}),
      'off',
    )
    expect(
      screen.getByRole('checkbox', {name: 'Subtitles'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Duration'}),
    ).not.toBeNull()
    await user.click(screen.getByText('Advanced'))
    const videoModel = screen.getByRole('combobox', {
      name: 'Video model',
    })
    expect(
      within(videoModel).getByRole('option', {name: 'Auto'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Aspect ratio'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {name: 'Create Explainer video'}),
    ).not.toBeNull()
    expect(
      screen.queryByRole('combobox', {name: 'Style'}),
    ).toBeNull()
    expect(
      screen.queryByRole('heading', {name: 'Source material'}),
    ).toBeNull()
    expect(
      screen.getByRole('button', {name: 'Add references'}),
    ).not.toBeNull()
  })

  test('offers model-derived Explainer durations and a manual slider', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.manifest.scenarios.enabled = ['explainer-video']
    settings.manifest.routing.scenarios = {
      'explainer-video': {
        visuals: {auto: ['primary:sora']},
      },
    }
    settings.speech = {
      configured: true,
      defaultVoice: 'en-US-Ethan:MAI-Voice-2',
      endpoint:
        'https://speech-resource.cognitiveservices.azure.com/',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )

    const duration = screen.getByRole('combobox', {
      name: 'Duration',
    })
    expect(
      within(duration).getByRole('option', {name: '20 seconds'}),
    ).not.toBeNull()
    expect(
      within(duration).getByRole('option', {name: '1 minute'}),
    ).not.toBeNull()
    expect(
      within(duration).getByRole('option', {name: '10 minutes'}),
    ).not.toBeNull()
    expect((duration as HTMLSelectElement).value).toBe('60')
    expect(
      screen.queryByRole('slider', {name: 'Manual duration'}),
    ).toBeNull()

    await user.selectOptions(duration, 'manual')

    const manual = screen.getByRole('slider', {
      name: 'Manual duration',
    })
    expect(manual.getAttribute('aria-valuemin')).toBe('15')
    expect(manual.getAttribute('aria-valuemax')).toBe('600')
  })

  test('allows Voice Off when Speech is not configured', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.scenarios[0]!.readiness = {
      missingRoles: ['voice'],
      state: 'not-ready',
    }
    settings.manifest.scenarios.enabled = ['explainer-video']
    settings.manifest.routing.scenarios = {
      'explainer-video': {
        planning: {auto: ['primary:planner']},
        'reference-image': {auto: ['primary:mai-fast']},
        visuals: {auto: ['primary:sora']},
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )

    const create = screen.getByRole('button', {
      name: 'Create Explainer video',
    }) as HTMLButtonElement
    expect(create.disabled).toBe(false)
    expect(
      (
        screen.getByRole('combobox', {
          name: 'Voice',
        }) as HTMLSelectElement
      ).value,
    ).toBe('off')
    expect(
      screen.queryByText(/Missing setup: voice/),
    ).toBeNull()
  })

  test('does not expose generated workflow references as Scenario setup', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.scenarios[0]!.readiness = {
      missingRoles: ['planning', 'reference-image'],
      state: 'not-ready',
    }
    settings.manifest.deployments['primary:planner'] = {
      adapter: 'azure-openai-chat',
      deploymentName: 'planner',
      model: 'gpt-4.1-mini',
      provider: 'primary',
    }
    settings.manifest.scenarios.enabled = ['explainer-video']
    settings.manifest.routing.scenarios = {
      'explainer-video': {
        visuals: {auto: ['primary:sora']},
      },
    }
    settings.speech = {
      configured: true,
      defaultVoice: 'en-US-Ethan:MAI-Voice-2',
      endpoint:
        'https://speech-resource.cognitiveservices.azure.com/',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )

    expect(
      screen.queryByText(/planning, reference-image/),
    ).toBeNull()
    expect(
      (
        screen.getByRole('button', {
          name: 'Create Explainer video',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
    expect(
      screen.getByRole('button', {name: 'Add references'}),
    ).not.toBeNull()
  })

  test('accepts multiple user Reference Assets for an Explainer', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.manifest.scenarios.enabled = ['explainer-video']
    settings.manifest.routing.scenarios = {
      'explainer-video': {
        visuals: {auto: ['primary:sora']},
      },
    }
    settings.speech = {
      configured: true,
      defaultVoice: 'en-US-Ethan:MAI-Voice-2',
      endpoint:
        'https://speech-resource.cognitiveservices.azure.com/',
    }
    const fetchFake = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          return jsonResponse(settings)
        }
        if (
          path === '/api/reference-files/browse' &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            files: [
              {
                mediaType: 'image/png',
                name: 'style.png',
                path: 'C:\\assets\\style.png',
                previewUrl:
                  '/api/reference-files/previews/style-token',
              },
              {
                mediaType: 'image/png',
                name: 'product.png',
                path: 'C:\\assets\\product.png',
                previewUrl:
                  '/api/reference-files/previews/product-token',
              },
            ],
            type: 'reference-files-browse',
          })
        }
        if (path === '/api/create' && init?.method === 'POST') {
          return jsonResponse({
            generation: generationRecord({
              id: '01EXPLAINER',
              mediaType: 'video',
              status: 'created',
            }),
            type: 'create',
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )
    await user.type(
      screen.getByRole('textbox', {
        name: 'What should the video explain?',
      }),
      'Explain the product.',
    )
    await user.click(
      screen.getByRole('button', {name: 'Add references'}),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Add references',
    })
    await user.click(
      within(picker).getByRole('button', {name: 'Browse files'}),
    )
    await user.click(
      within(picker).getByRole('button', {name: 'Close'}),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'Create Explainer video',
      }),
    )

    const [, createInit] = fetchFake.mock.calls.find(
      ([path]) => String(path) === '/api/create',
    )!
    expect(
      JSON.parse(String(createInit?.body)).request.sourcePaths,
    ).toEqual([
      'C:\\assets\\style.png',
      'C:\\assets\\product.png',
    ])
  })

  test('moves a prominent highlight between selected Presets', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.scenarios[0]!.presets.push({
      description:
        'Simple hand-drawn characters and visual storytelling.',
      id: 'stickman-cartoon',
      title: 'Stickman cartoon',
    })

    settings.manifest.scenarios.enabled = ['explainer-video']
    settings.manifest.routing.scenarios = {
      'explainer-video': {
        visuals: {auto: ['primary:sora']},
      },
    }
    settings.speech = {
      configured: true,
      defaultVoice: 'en-US-Harper:MAI-Voice-2',
      endpoint:
        'https://speech-resource.cognitiveservices.azure.com/',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )

    const editorial = screen.getByRole('button', {
      name: /Editorial motion graphics/,
    })
    const stickman = screen.getByRole('button', {
      name: /Stickman cartoon/,
    })
    expect(editorial.getAttribute('data-selected')).toBe('true')
    expect(editorial.className).toContain('ring-2')
    expect(stickman.className).toContain('whitespace-normal')
    expect(stickman.getAttribute('data-selected')).toBe('false')

    await user.click(stickman)

    expect(editorial.getAttribute('data-selected')).toBe('false')
    expect(stickman.getAttribute('data-selected')).toBe('true')
    expect(stickman.className).toContain('ring-2')
  })

  test('shows end-user Preset copy instead of Model Prompt guidance', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.scenarios[0]!.presets.push({
      description:
        'Loose ink illustration with paper texture and animated line work.',
      id: 'hand-drawn',
      title: 'Hand drawn',
    })
    settings.manifest.scenarios.enabled = ['explainer-video']
    settings.manifest.routing.scenarios = {
      'explainer-video': {
        visuals: {auto: ['primary:sora']},
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )

    expect(
      screen.getByRole('button', {
        name: /Hand drawn.*Loose ink illustration/,
      }),
    ).not.toBeNull()
    expect(
      screen.queryByText(/clean off-white paper/),
    ).toBeNull()
  })

  test('opens a purpose-built Short-form video workbench', async () => {
    const settings = settingsResult()
    settings.scenarios[1]!.enabled = true
    settings.manifest.scenarios.enabled = ['short-form-video']
    settings.manifest.routing.scenarios = {
      'short-form-video': {
        video: {auto: ['primary:sora']},
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Short-form video/,
      }),
    )

    expect(
      screen.getByRole('heading', {name: 'Short-form video'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {name: 'Choose source video'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {name: 'Add context'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('textbox', {name: 'Direction'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {name: /Bold urban/}),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Orientation'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Language'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Clip count'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('combobox', {name: 'Clip duration'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('group', {name: 'Layout'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('group', {name: 'Clips'}),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {name: 'Create Short-form video'}),
    ).not.toBeNull()

    await user.click(
      screen.getByRole('button', {name: 'Choose source video'}),
    )
    const sourcePicker = await screen.findByRole('dialog', {
      name: 'Add source video',
    })
    expect(
      within(sourcePicker).getByRole('tab', {name: 'Local files'}),
    ).not.toBeNull()
    expect(
      within(sourcePicker).getByRole('tab', {
        name: 'Video Generations',
      }),
    ).not.toBeNull()
    expect(
      within(sourcePicker).queryByRole('tab', {name: 'Text'}),
    ).toBeNull()
    expect(
      within(sourcePicker).queryByRole('tab', {
        name: 'Image Generations',
      }),
    ).toBeNull()
    await user.click(
      within(sourcePicker).getByRole('button', {name: 'Close'}),
    )

    await user.click(
      screen.getByRole('button', {name: 'Add context'}),
    )
    const contextPicker = await screen.findByRole('dialog', {
      name: 'Add context',
    })
    expect(
      within(contextPicker).getByRole('tab', {name: 'Text'}),
    ).not.toBeNull()
    expect(
      within(contextPicker).queryByRole('tab', {name: 'Local files'}),
    ).toBeNull()
  })

  test('does not silently truncate a multi-output source Generation', async () => {
    const settings = settingsResult()
    settings.scenarios[1]!.enabled = true
    settings.manifest.scenarios.enabled = ['short-form-video']
    settings.manifest.routing.scenarios = {
      'short-form-video': {
        video: {auto: ['primary:sora']},
      },
    }
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          return Promise.resolve(jsonResponse(settings))
        }
        if (path === '/api/generations' && init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              count: 1,
              generations: [
                generationRecord({
                  id: '01MULTI',
                  mediaType: 'video',
                  outputs: [
                    {
                      mediaType: 'video/mp4',
                      path: 'outputs/clip-1.mp4',
                      sha256: 'first',
                      size: 100,
                    },
                    {
                      mediaType: 'video/mp4',
                      path: 'outputs/clip-2.mp4',
                      sha256: 'second',
                      size: 100,
                    },
                  ],
                }),
              ],
              type: 'generations-list',
            }),
          )
        }
        if (path === '/api/references' && init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse({
              references: [
                {
                  generationId: '01MULTI',
                  mediaType: 'video/mp4',
                  path: 'C:\\media\\01MULTI\\clip-1.mp4',
                },
                {
                  generationId: '01MULTI',
                  mediaType: 'video/mp4',
                  path: 'C:\\media\\01MULTI\\clip-2.mp4',
                },
              ],
              type: 'generations-reference',
            }),
          )
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {name: /Short-form video/}),
    )
    await user.click(
      screen.getByRole('button', {name: 'Choose source video'}),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Add source video',
    })
    await user.click(
      within(picker).getByRole('tab', {
        name: 'Video Generations',
      }),
    )
    await user.click(
      await within(picker).findByRole('button', {
        name: 'Use Generation 01MULTI',
      }),
    )

    expect(
      await within(picker).findByRole('alert', {
        name: 'Choose one video output',
      }),
    ).not.toBeNull()
  })

  test('submits an Explainer video with the configured Voice by default', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.manifest.scenarios.enabled = ['explainer-video']
    settings.manifest.routing.scenarios = {
      'explainer-video': {
        visuals: {auto: ['primary:sora']},
      },
    }
    settings.speech = {
      configured: true,
      defaultVoice: 'en-US-Harper:MAI-Voice-2',
      endpoint:
        'https://speech-resource.cognitiveservices.azure.com/',
    }
    const fetchFake = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          return jsonResponse(settings)
        }
        if (path === '/api/generations' && init?.method === 'GET') {
          return jsonResponse({
            count: 0,
            generations: [],
            type: 'generations-list',
          })
        }
        if (path === '/api/create' && init?.method === 'POST') {
          return jsonResponse({
            generation: generationRecord({
              id: '01EXPLAINER',
              mediaType: 'video',
              status: 'created',
            }),
            type: 'create',
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )
    await user.type(
      screen.getByRole('textbox', {
        name: 'What should the video explain?',
      }),
      'Explain retrieval-augmented generation.',
    )
    await user.click(
      screen.getByRole('button', {name: 'Add references'}),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Add references',
    })
    await user.click(
      within(picker).getByRole('tab', {name: 'Text'}),
    )
    await user.type(
      within(picker).getByRole('textbox', {name: 'Text'}),
      '# Product setup{enter}{enter}Connect the SDK.',
    )
    await user.click(
      within(picker).getByRole('button', {
        name: 'Add text',
      }),
    )
    await user.click(
      within(picker).getByRole('button', {name: 'Close'}),
    )
    await user.click(
      screen.getByRole('button', {name: 'Create Explainer video'}),
    )

    const [, createInit] = fetchFake.mock.calls.find(
      ([path]) => String(path) === '/api/create',
    )!
    expect(JSON.parse(String(createInit?.body))).toEqual({
      force: false,
      request: {
        creativeBrief: 'Explain retrieval-augmented generation.',
        deploymentOverrides: {},
        kind: 'scenario',
        options: {
          'aspect-ratio': '16:9',
          duration: 60,
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
            content: '# Product setup\n\nConnect the SDK.',
            format: 'text',
          },
        ],
      },
    })
    expect(
      screen.getByRole('heading', {name: 'Generation in progress'}),
    ).not.toBeNull()
    expect(screen.getByText('In progress')).not.toBeNull()
    expect(screen.queryByText('Success')).toBeNull()
  })

  test('submits a Short-form video Scenario request', async () => {
    const settings = settingsResult()
    settings.scenarios[1]!.enabled = true
    settings.manifest.scenarios.enabled = ['short-form-video']
    settings.manifest.routing.scenarios = {
      'short-form-video': {
        video: {auto: ['primary:sora']},
      },
    }
    const fetchFake = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          return jsonResponse(settings)
        }
        if (path === '/api/generations' && init?.method === 'GET') {
          return jsonResponse({
            count: 0,
            generations: [],
            type: 'generations-list',
          })
        }
        if (
          path === '/api/reference-files/browse' &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            files: [
              {
                mediaType: 'video/mp4',
                name: 'interview.mp4',
                path: 'C:\\media\\interview.mp4',
              },
            ],
            type: 'reference-files-browse',
          })
        }
        if (path === '/api/create' && init?.method === 'POST') {
          return jsonResponse({
            generation: generationRecord({
              id: '01SHORT',
              mediaType: 'video',
            }),
            type: 'create',
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Short-form video/,
      }),
    )
    await user.click(
      screen.getByRole('button', {name: 'Choose source video'}),
    )
    const picker = await screen.findByRole('dialog', {
      name: 'Add source video',
    })
    await user.click(
      within(picker).getByRole('button', {name: 'Browse files'}),
    )
    await user.click(
      within(picker).getByRole('button', {name: 'Close'}),
    )
    await user.type(
      screen.getByRole('textbox', {name: 'Direction'}),
      'Choose the strongest product insight.',
    )
    await user.selectOptions(
      screen.getByRole('combobox', {name: 'Clip count'}),
      '3',
    )
    await user.click(
      screen.getByRole('button', {name: 'Create Short-form video'}),
    )

    const [, createInit] = fetchFake.mock.calls.find(
      ([path]) => String(path) === '/api/create',
    )!
    expect(JSON.parse(String(createInit?.body))).toEqual({
      force: false,
      request: {
        creativeBrief: 'Choose the strongest product insight.',
        deploymentOverrides: {},
        kind: 'scenario',
        options: {
          'clip-count': 3,
          'clip-duration': 8,
          language: 'auto',
          orientation: 'vertical',
          subtitles: true,
        },
        preset: 'bold-urban',
        scenario: 'short-form-video',
        sourcePaths: ['C:\\media\\interview.mp4'],
      },
    })
  })

  test('enables a Scenario and refreshes its readiness', async () => {
    const disabledSettings = settingsResult()
    disabledSettings.scenarios[0]!.readiness = {
      missingRoles: ['visuals'],
      state: 'not-ready',
    }
    const enabledSettings = settingsResult()
    enabledSettings.scenarios[0]!.enabled = true
    enabledSettings.manifest.scenarios.enabled = ['explainer-video']
    enabledSettings.manifest.routing.scenarios = {
      'explainer-video': {
        visuals: {auto: ['primary:sora']},
      },
    }
    let settingsRequests = 0
    const fetchFake = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          settingsRequests += 1
          return jsonResponse(
            settingsRequests === 1
              ? disabledSettings
              : enabledSettings,
          )
        }
        if (
          path === '/api/scenarios/explainer-video/enable' &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            enabled: true,
            id: 'explainer-video',
            type: 'scenarios-set-enabled',
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )
    await user.click(
      screen.getByRole('button', {name: 'Enable Explainer video'}),
    )

    expect(
      (
        await screen.findByRole('button', {
          name: 'Create Explainer video',
        })
      ).getAttribute('disabled'),
    ).toBeNull()
    expect(settingsRequests).toBe(2)
  })

  test('explains when an enabled Scenario still needs model routing', async () => {
    const settings = settingsResult()
    settings.scenarios[0]!.enabled = true
    settings.scenarios[0]!.readiness = {
      missingRoles: ['visuals'],
      state: 'not-ready',
    }
    settings.manifest.scenarios.enabled = ['explainer-video']
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settings)),
    )
    const user = userEvent.setup()

    renderApp('/create')
    await user.click(
      await screen.findByRole('button', {
        name: /Explainer video/,
      }),
    )

    expect(
      screen.getByRole('heading', {name: 'Scenario needs setup'}),
    ).not.toBeNull()
    expect(
      screen.getByText('Missing setup: visuals'),
    ).not.toBeNull()
    expect(
      (
        screen.getByRole('button', {
          name: 'Create Explainer video',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  test('offers configured model deployments for the selected media type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settingsResult())),
    )
    const user = userEvent.setup()

    renderApp('/create')

    const imageModels = await screen.findByRole('combobox', {
      name: 'Model',
    })
    expect(
      within(imageModels).getByRole('option', {
        name: /Auto.*gpt-image-2/i,
      }),
    ).not.toBeNull()
    expect(
      within(imageModels).getByRole('option', {
        name: /MAI-Image-2.5-Flash/,
      }),
    ).not.toBeNull()
    expect(
      within(imageModels).queryByRole('option', {name: /sora-2/i}),
    ).toBeNull()

    await user.click(screen.getByRole('button', {name: /Video/}))

    const videoModels = screen.getByRole('combobox', {name: 'Model'})
    expect(
      within(videoModels).getAllByRole('option', {name: /sora-2/i}),
    ).toHaveLength(2)
    expect(
      within(videoModels).queryByRole('option', {
        name: /MAI-Image-2.5-Flash/,
      }),
    ).toBeNull()
  })

  test('submits numeric aspect ratio and GPT Image advanced controls', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, _init?: RequestInit) =>
        Promise.resolve(
          String(input) === '/api/settings'
            ? jsonResponse(settingsResult())
            : jsonResponse({
                generation: generationRecord({id: '01GENERATED'}),
                type: 'generate',
              }),
        ),
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')

    await screen.findByRole('combobox', {name: 'Model'})
    await user.type(
      screen.getByRole('textbox', {name: 'Creative Brief'}),
      'Create a wide technical launch image.',
    )
    await user.click(
      screen.getByRole('combobox', {name: 'Aspect ratio'}),
    )
    await user.click(
      screen.getByRole('option', {name: '16:9 Widescreen'}),
    )
    await user.click(screen.getByText('Advanced'))
    await user.selectOptions(
      screen.getByRole('combobox', {name: 'Quality'}),
      'high',
    )
    await user.selectOptions(
      screen.getByRole('combobox', {name: 'Output format'}),
      'jpeg',
    )
    await user.selectOptions(
      screen.getByRole('combobox', {name: 'Background'}),
      'opaque',
    )
    await user.click(
      screen.getByRole('button', {name: 'Generate image'}),
    )

    const [, init] = fetchFake.mock.calls.find(
      ([path]) => String(path) === '/api/generations',
    )!
    expect(JSON.parse(String(init?.body))).toMatchObject({
      controls: {
        background: 'opaque',
        height: 864,
        output_format: 'jpeg',
        quality: 'high',
        width: 1536,
      },
    })
  })

  test('shows loading and an explicit empty Generation history', async () => {
    let completeRequest: (response: Response) => void = () => undefined
    const fetchFake = vi.fn<
      (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<Response>
    >(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          completeRequest = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchFake)

    renderApp('/generations')

    expect(screen.getByRole('status').textContent).toContain(
      'Loading Generations',
    )

    await act(async () => {
      completeRequest(
        jsonResponse({
          count: 0,
          generations: [],
          type: 'generations-list',
        }),
      )
    })

    expect(
      await screen.findByRole('heading', {
        name: 'No Generations yet',
      }),
    ).not.toBeNull()
    expect(
      screen.getByText(
        'Your image and video Generations will appear here.',
      ),
    ).not.toBeNull()
    expect(fetchFake).toHaveBeenCalledWith(
      '/api/generations',
      expect.objectContaining({method: 'GET'}),
    )
  })

  test('shows Generation history newest first in a gallery', async () => {
    const fetchFake = vi.fn().mockResolvedValue(
      jsonResponse({
        count: 2,
        generations: [
          generationRecord({
            createdAt: '2026-08-17T12:00:00.000Z',
            creativeBrief: 'An older product hero.',
            id: '01OLDER',
          }),
          generationRecord({
            createdAt: '2026-08-18T12:00:00.000Z',
            creativeBrief: 'The newest launch image.',
            id: '01NEWEST',
          }),
        ],
        type: 'generations-list',
      }),
    )
    vi.stubGlobal('fetch', fetchFake)

    renderApp('/generations')

    expect(
      await screen.findByRole('heading', {name: 'Generations'}),
    ).not.toBeNull()
    expect(screen.getByText('2 Generations')).not.toBeNull()

    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(
      within(cards[0] as HTMLElement).getByText(
        'The newest launch image.',
      ),
    ).not.toBeNull()
    expect(
      within(cards[0] as HTMLElement)
        .getByRole('link', {name: 'Open Generation 01NEWEST'})
        .getAttribute('href'),
    ).toBe('/generations/01NEWEST')
  })

  test('renders Generation history with shadcn cards and badges', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          count: 1,
          generations: [generationRecord()],
          type: 'generations-list',
        }),
      ),
    )

    renderApp('/generations')

    const card = await screen.findByRole('article')
    expect(card.getAttribute('data-slot')).toBe('card')
    expect(
      within(card).getByText('succeeded').getAttribute('data-slot'),
    ).toBe('badge')
    expect(
      within(card)
        .getByRole('link', {
          name: 'Open Generation 01GENERATION',
        })
        .getAttribute('data-generation-tile-link'),
    ).toBe('true')
    expect(
      within(card).queryByRole('link', {name: 'Open Generation'}),
    ).toBeNull()
  })

  test('renders output media in a full-screen Generation gallery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          count: 1,
          generations: [
            generationRecord({
              outputs: [
                {
                  mediaType: 'image/png',
                  path: 'C:\\media\\01GENERATION\\output.png',
                  sha256: 'output-sha',
                  size: 1024,
                },
              ],
            }),
          ],
          type: 'generations-list',
        }),
      ),
    )

    renderApp('/generations')

    const gallery = await screen.findByRole('region', {
      name: 'Generation gallery',
    })
    expect(gallery.getAttribute('data-layout')).toBe(
      'full-screen-gallery',
    )
    const output = within(gallery).getByRole('img', {
      name: 'Generation output for Image',
    })
    expect(output.getAttribute('src')).toBe(
      '/api/generations/01GENERATION/outputs/0',
    )
    expect(output.getAttribute('data-fit')).toBe('intrinsic')
    expect(
      output
        .closest('[role="article"]')
        ?.getAttribute('data-tile-layout'),
    ).toBe('intrinsic')
  })

  test('reserves a loading tile for an in-flight Generation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          count: 1,
          generations: [
            generationRecord({
              outputs: [],
              status: 'running',
            }),
          ],
          type: 'generations-list',
        }),
      ),
    )

    renderApp('/generations')

    const tile = await screen.findByRole('article')
    expect(
      within(tile).getByRole('status', {
        name: 'Generating Image',
      }),
    ).not.toBeNull()
    expect(within(tile).getByText('Generating image...')).not.toBeNull()
  })

  test('shows a retryable error when Generation history fails', async () => {
    const fetchFake = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: 'history_unavailable',
            error: true,
            help: ['Try again'],
            message: 'Generation history is unavailable.',
          },
          500,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          count: 0,
          generations: [],
          type: 'generations-list',
        }),
      )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations')

    expect(
      await screen.findByRole('alert', {
        name: 'Could not load Generations',
      }),
    ).not.toBeNull()
    expect(
      screen.getByText('Generation history is unavailable.'),
    ).not.toBeNull()

    await user.click(screen.getByRole('button', {name: 'Try again'}))

    expect(
      await screen.findByRole('heading', {
        name: 'No Generations yet',
      }),
    ).not.toBeNull()
    expect(fetchFake).toHaveBeenCalledTimes(2)
  })

  test('submits the Creative Brief and shows the created Generation', async () => {
    let completeRequest: (response: Response) => void = () => undefined
    const fetchFake = vi.fn<
      (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<Response>
    >((input, init) => {
      const path = String(input)
      if (path === '/api/settings') {
        return Promise.resolve(jsonResponse(settingsResult()))
      }
      if (path === '/api/generations' && init?.method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            count: 0,
            generations: [],
            type: 'generations-list',
          }),
        )
      }
      if (
        path === '/api/reference-files/browse' &&
        init?.method === 'POST'
      ) {
        return Promise.resolve(
          jsonResponse({
            files: [
              {
                mediaType: 'image/png',
                name: 'dashboard.png',
                path: 'C:\\assets\\dashboard.png',
                previewUrl:
                  '/api/reference-files/previews/dashboard-token',
              },
              {
                mediaType: 'image/png',
                name: 'brand.png',
                path: 'C:\\assets\\brand.png',
                previewUrl:
                  '/api/reference-files/previews/brand-token',
              },
            ],
            type: 'reference-files-browse',
          }),
        )
      }
      return new Promise<Response>((resolve) => {
        completeRequest = resolve
      })
    })
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')

    await user.click(screen.getByRole('button', {name: /Video/}))
    await user.type(
      screen.getByRole('textbox', {name: 'Creative Brief'}),
      'Reveal the dashboard with a confident launch moment.',
    )
    await user.click(
      screen.getByRole('button', {name: /Cinematic/}),
    )
    await user.click(
      screen.getByRole('button', {name: 'Add references'}),
    )
    const referencePicker = await screen.findByRole('dialog', {
      name: 'Add references',
    })
    await user.click(
      within(referencePicker).getByRole('button', {
        name: 'Browse files',
      }),
    )
    await user.click(
      within(referencePicker).getByRole('button', {name: 'Close'}),
    )
    await user.click(
      screen.getByRole('button', {name: 'Generate video'}),
    )

    expect(
      (
        screen.getByRole('button', {
          name: 'Generating video...',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    const [path, init] = fetchFake.mock.calls.find(
      ([requestPath, requestInit]) =>
        String(requestPath) === '/api/generations' &&
        requestInit?.method === 'POST',
    )!
    expect(String(path)).toBe('/api/generations')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      controls: {
        height: 720,
        nSeconds: 8,
        nVariants: 1,
        width: 1280,
      },
      creativeBrief:
        'Reveal the dashboard with a confident launch moment.',
      mediaType: 'video',
      referencePaths: [
        'C:\\assets\\dashboard.png',
        'C:\\assets\\brand.png',
      ],
      style: 'cinematic',
    })

    await act(async () => {
      completeRequest(
        jsonResponse({
          generation: generationRecord({
            creativeBrief:
              'Reveal the dashboard with a confident launch moment.',
            id: '01GENERATED',
            mediaType: 'video',
          }),
          type: 'generate',
        }),
      )
    })

    expect(
      await screen.findByRole('heading', {
        name: 'Generation created',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('link', {name: 'Open Generation'}).getAttribute(
        'href',
      ),
    ).toBe('/generations/01GENERATED')
  })

  test('shows a Generation submission error without losing the brief', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL) =>
        Promise.resolve(
          String(input) === '/api/settings'
            ? jsonResponse(settingsResult())
            : jsonResponse(
                {
                  code: 'no_eligible_model',
                  error: true,
                  help: ['Configure a Foundry deployment'],
                  message: 'No eligible image model is configured.',
                },
                400,
              ),
        ),
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/create')
    const brief = screen.getByRole('textbox', {
      name: 'Creative Brief',
    }) as HTMLTextAreaElement
    await user.type(brief, 'Create a clean launch visual.')
    await user.click(
      screen.getByRole('button', {name: 'Generate image'}),
    )

    expect(
      await screen.findByRole('alert', {
        name: 'Generation could not be created',
      }),
    ).not.toBeNull()
    expect(
      screen.getByText('No eligible image model is configured.'),
    ).not.toBeNull()
    expect(brief.value).toBe('Create a clean launch visual.')
    expect(
      (
        screen.getByRole('button', {
          name: 'Generate image',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  test('loads a Generation detail with every reuse action', async () => {
    const fetchFake = vi.fn().mockResolvedValue(
      jsonResponse({
        generation: generationRecord({
          outputs: [
            {
              mediaType: 'image/png',
              path: 'C:\\media\\01GENERATION\\output.png',
              sha256: 'output-sha',
              size: 1024,
            },
          ],
          references: [
            {
              mediaType: 'image/png',
              modifiedAt: '2026-08-18T11:00:00.000Z',
              path: 'C:\\assets\\product.png',
              sha256: 'reference-sha',
              size: 512,
            },
          ],
          sourceGenerations: ['01SOURCE'],
        }),
        type: 'generations-get',
      }),
    )
    vi.stubGlobal('fetch', fetchFake)

    renderApp('/generations/01GENERATION')

    expect(screen.getByRole('status').textContent).toContain(
      'Loading Generation',
    )
    expect(
      await screen.findByRole('heading', {
        name: 'Generation 01GENERATION',
      }),
    ).not.toBeNull()
    expect(
      screen.getByDisplayValue('Show the dashboard at launch.'),
    ).not.toBeNull()
    expect(screen.getByText('MAI-Image-2.5-Flash')).not.toBeNull()
    expect(screen.getByText('Image')).not.toBeNull()
    expect(screen.getByText('C:\\assets\\product.png')).not.toBeNull()
    expect(
      screen
        .getByRole('img', {name: 'Generated output 1'})
        .getAttribute('src'),
    ).toBe('/api/generations/01GENERATION/outputs/0')
    expect(
      screen
        .getByRole('link', {name: 'Source Generation 01SOURCE'})
        .getAttribute('href'),
    ).toBe('/generations/01SOURCE')

    for (const action of [
      'Edit',
      'Recreate',
      'Reference',
      'Export',
      'Delete',
    ]) {
      expect(
        screen.getByRole('button', {name: action}),
      ).not.toBeNull()
    }
    expect(fetchFake).toHaveBeenCalledWith(
      '/api/generations/01GENERATION',
      expect.objectContaining({method: 'GET'}),
    )
  })

  test('renders Generation detail with shadcn cards and controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          generation: generationRecord(),
          type: 'generations-get',
        }),
      ),
    )

    renderApp('/generations/01GENERATION')

    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    expect(screen.getByRole('main').getAttribute('data-layout')).toBe(
      'generation-detail',
    )
    expect(
      screen
        .getByRole('complementary', {
          name: 'Generation information',
        })
        .getAttribute('data-layout'),
    ).toBe('information-panel')
    expect(
      document.querySelector('[data-layout="media-stage"]'),
    ).not.toBeNull()
    expect(
      screen
        .getByRole('textbox', {name: 'Creative Brief'})
        .getAttribute('data-slot'),
    ).toBe('textarea')
    expect(
      screen
        .getByRole('combobox', {name: 'Style'})
        .getAttribute('data-slot'),
    ).toBe('native-select')
    expect(
      screen.getByRole('button', {name: 'Edit'}).getAttribute(
        'data-slot',
      ),
    ).toBe('button')
    expect(
      screen.getByText('succeeded').getAttribute('data-slot'),
    ).toBe('badge')
  })

  test('renders generated MAI Voice narration as an audio player', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          generation: generationRecord({
            mediaType: 'video',
            outputs: [
              {
                mediaType: 'video/mp4',
                path: 'outputs/output-1.mp4',
                sha256: 'video-sha',
                size: 1024,
              },
              {
                mediaType: 'audio/mpeg',
                path: 'outputs/output-2.mp3',
                sha256: 'audio-sha',
                size: 512,
              },
            ],
          }),
          type: 'generations-get',
        }),
      ),
    )

    renderApp('/generations/01GENERATION')

    expect(
      await screen.findByLabelText('Generated narration 2'),
    ).not.toBeNull()
    expect(
      screen
        .getByLabelText('Generated narration 2')
        .getAttribute('src'),
    ).toBe('/api/generations/01GENERATION/outputs/1')
  })

  test('renders Explainer production details and every Reference Source type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          generation: generationRecord({
            mediaType: 'video',
            references: [
              {
                mediaType: 'image/png',
                modifiedAt: '2026-08-19T12:00:00.000Z',
                path: 'C:\\assets\\product.png',
                sha256: 'reference-sha',
                size: 1024,
              },
            ],
            scenario: {
              inputs: {
                sourcePaths: ['C:\\assets\\product.png'],
              },
              options: {
                'aspect-ratio': '16:9',
                duration: 60,
                'output-height': 720,
                'output-width': 1280,
                'resolved-voice':
                  'en-US-Ethan:MAI-Voice-2',
                subtitles: true,
                voice: {mode: 'auto'},
              },
            },
            selection: {
              kind: 'scenario',
              preset: 'hand-drawn',
              scenario: 'explainer-video',
            },
            textReferences: [
              {
                format: 'markdown',
                path: 'inputs/text-reference-1.md',
                sha256: 'text-sha',
                size: 512,
                title: 'Foundry documentation',
              },
            ],
            webReferences: [
              {url: 'https://learn.microsoft.com/foundry'},
            ],
          }),
          referenceStates: [
            {
              path: 'C:\\assets\\product.png',
              state: 'present',
            },
          ],
          type: 'generations-get',
        }),
      ),
    )

    renderApp('/generations/01GENERATION')

    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    expect(
      screen.queryByRole('combobox', {name: 'Style'}),
    ).toBeNull()
    expect(
      screen.queryByRole('heading', {name: 'Workflow progress'}),
    ).toBeNull()
    expect(screen.getByText('1280 × 720')).not.toBeNull()
    expect(screen.getByText('16:9')).not.toBeNull()
    expect(screen.getByText('1 minute')).not.toBeNull()
    expect(
      screen.getByText('en-US-Ethan:MAI-Voice-2'),
    ).not.toBeNull()
    expect(screen.getByText('On')).not.toBeNull()
    expect(
      screen.getByRole('heading', {name: 'Reference Sources'}),
    ).not.toBeNull()
    expect(screen.getByText('Text reference 1')).not.toBeNull()
    expect(screen.queryByText('Foundry documentation')).toBeNull()
    expect(screen.queryByText('Markdown')).toBeNull()
    expect(
      screen
        .getByRole('img', {name: 'Reference product.png'})
        .getAttribute('src'),
    ).toBe('/api/generations/01GENERATION/references/0')
    expect(screen.getByText('Present')).not.toBeNull()
    expect(
      screen.getByRole('link', {
        name: 'https://learn.microsoft.com/foundry',
      }),
    ).not.toBeNull()
    expect(screen.getByText('C:\\assets\\product.png')).not.toBeNull()
  })

  test('renders Image and Video Generator production details', async () => {
    const fetchFake = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          generation: generationRecord({
            controls: {height: 864, width: 1536},
            selection: {
              generator: 'image',
              kind: 'generator',
              style: 'editorial-illustration',
            },
          }),
          type: 'generations-get',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          generation: generationRecord({
            controls: {duration: 8, height: 720, width: 1280},
            id: '01VIDEO',
            mediaType: 'video',
            selection: {
              generator: 'video',
              kind: 'generator',
              style: 'cinematic',
            },
          }),
          type: 'generations-get',
        }),
      )
    vi.stubGlobal('fetch', fetchFake)

    const image = renderApp('/generations/01IMAGE')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    let production = screen.getByRole('region', {
      name: 'Production details',
    })
    expect(within(production).getByText('16:9')).not.toBeNull()
    expect(within(production).getByText('1536 × 864')).not.toBeNull()
    expect(
      within(production).getByText('Editorial illustration'),
    ).not.toBeNull()

    image.unmount()
    renderApp('/generations/01VIDEO')
    await screen.findByRole('heading', {
      name: 'Generation 01VIDEO',
    })
    production = screen.getByRole('region', {
      name: 'Production details',
    })
    expect(within(production).getByText('16:9')).not.toBeNull()
    expect(within(production).getByText('1280 × 720')).not.toBeNull()
    expect(within(production).getByText('8 seconds')).not.toBeNull()
  })

  test('renders Short-form production details and simplified Text References', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          generation: generationRecord({
            mediaType: 'video',
            scenario: {
              inputs: {sourcePaths: ['C:\\media\\interview.mp4']},
              options: {
                'clip-count': 3,
                'clip-duration': 8,
                language: 'auto',
                orientation: 'vertical',
                subtitles: true,
              },
            },
            selection: {
              kind: 'scenario',
              preset: 'bold-urban',
              scenario: 'short-form-video',
            },
            textReferences: [
              {
                format: 'markdown',
                path: 'inputs/text-reference-1.md',
                sha256: 'text-sha',
                size: 512,
                title: 'Internal default title',
              },
            ],
          }),
          type: 'generations-get',
        }),
      ),
    )

    renderApp('/generations/01SHORT')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    const production = screen.getByRole('region', {
      name: 'Production details',
    })
    expect(within(production).getByText('Bold urban')).not.toBeNull()
    expect(within(production).getByText('Vertical')).not.toBeNull()
    expect(within(production).getByText('Auto detect')).not.toBeNull()
    expect(within(production).getByText('3')).not.toBeNull()
    expect(within(production).getByText('8 seconds')).not.toBeNull()
    expect(screen.getByText('Text reference 1')).not.toBeNull()
    expect(screen.queryByText('Internal default title')).toBeNull()
    expect(screen.queryByText('Markdown')).toBeNull()
    expect(screen.queryByText('Plain text')).toBeNull()
  })

  test('shows a retryable Generation detail error', async () => {
    const fetchFake = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: 'generation_not_found',
            error: true,
            help: [],
            message: 'Generation 01MISSING was not found.',
          },
          404,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          generation: generationRecord({id: '01MISSING'}),
          type: 'generations-get',
        }),
      )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01MISSING')

    expect(
      await screen.findByRole('alert', {
        name: 'Could not load Generation',
      }),
    ).not.toBeNull()
    expect(
      screen.getByText('Generation 01MISSING was not found.'),
    ).not.toBeNull()

    await user.click(screen.getByRole('button', {name: 'Try again'}))

    expect(
      await screen.findByRole('heading', {
        name: 'Generation 01MISSING',
      }),
    ).not.toBeNull()
  })

  test('creates an Edit from the Generation detail', async () => {
    let completeEdit: (response: Response) => void = () => undefined
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              generation: generationRecord(),
              type: 'generations-get',
            }),
          )
        }
        if (path.endsWith('/edit')) {
          return new Promise<Response>((resolve) => {
            completeEdit = resolve
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01GENERATION')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })

    const brief = screen.getByRole('textbox', {
      name: 'Creative Brief',
    })
    await user.clear(brief)
    await user.type(brief, 'Keep the product, but use a warmer scene.')
    await user.selectOptions(
      screen.getByRole('combobox', {name: 'Style'}),
      'cinematic',
    )
    await user.click(screen.getByRole('button', {name: 'Edit'}))

    expect(
      (
        screen.getByRole('button', {
          name: 'Editing...',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    const [, editInit] = fetchFake.mock.calls[1] as [
      string,
      RequestInit,
    ]
    expect(fetchFake.mock.calls[1]?.[0]).toBe(
      '/api/generations/01GENERATION/edit',
    )
    expect(JSON.parse(String(editInit.body))).toEqual({
      creativeBrief: 'Keep the product, but use a warmer scene.',
      style: 'cinematic',
    })

    await act(async () => {
      completeEdit(
        jsonResponse({
          generation: generationRecord({id: '01EDITED'}),
          type: 'generations-edit',
        }),
      )
    })

    expect(
      await screen.findByText('Edit created Generation 01EDITED.'),
    ).not.toBeNull()
  })

  test('recreates a Generation with the current choices', async () => {
    let completeRecreate: (response: Response) => void = () => undefined
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              generation: generationRecord(),
              type: 'generations-get',
            }),
          )
        }
        if (path.endsWith('/recreate')) {
          return new Promise<Response>((resolve) => {
            completeRecreate = resolve
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01GENERATION')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    await user.click(screen.getByRole('button', {name: 'Recreate'}))

    expect(
      (
        screen.getByRole('button', {
          name: 'Recreating...',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    const [, recreateInit] = fetchFake.mock.calls[1] as [
      string,
      RequestInit,
    ]
    expect(fetchFake.mock.calls[1]?.[0]).toBe(
      '/api/generations/01GENERATION/recreate',
    )
    expect(JSON.parse(String(recreateInit.body))).toEqual({
      creativeBrief: 'Show the dashboard at launch.',
      style: 'product-led',
    })

    await act(async () => {
      completeRecreate(
        jsonResponse({
          generation: generationRecord({id: '01RECREATED'}),
          type: 'generations-recreate',
        }),
      )
    })

    expect(
      await screen.findByText(
        'Recreate created Generation 01RECREATED.',
      ),
    ).not.toBeNull()
  })

  test('resumes a failed Explainer workflow from Generation detail', async () => {
    const failed = generationRecord({
      error: {
        code: 'workflow_failed',
        message: 'Temporary Sora failure',
      },
      mediaType: 'video',
      scenario: {
        inputs: {sourcePaths: []},
        options: {
          duration: 60,
          voice: {mode: 'auto'},
        },
      },
      selection: {
        kind: 'scenario',
        preset: 'hand-drawn',
        scenario: 'explainer-video',
      },
      status: 'failed',
    })
    const fetchFake = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (
          path === '/api/generations/01GENERATION' &&
          init?.method === 'GET'
        ) {
          return jsonResponse({
            generation: failed,
            type: 'generations-get',
          })
        }
        if (
          path === '/api/generations/01GENERATION/resume' &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            generation: {
              ...failed,
              error: null,
              status: 'succeeded',
            },
            type: 'generations-resume',
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01GENERATION')
    await user.click(
      await screen.findByRole('button', {
        name: 'Resume generation',
      }),
    )

    expect(
      await screen.findByText('Generation resume started.'),
    ).not.toBeNull()
    expect(fetchFake).toHaveBeenCalledWith(
      '/api/generations/01GENERATION/resume',
      {method: 'POST'},
    )
  })

  test('does not expose workflow operations on Generation detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          generation: generationRecord({
            mediaType: 'video',
            operations: [
              {
                kind: 'explainer-plan',
                status: 'succeeded',
              },
              {
                kind: 'model-generate',
                status: 'running',
              },
              {
                kind: 'media-compose',
                status: 'pending',
              },
            ],
            progress: {
              completed: 1,
              stage: 'model-generate',
              total: 3,
            },
            status: 'running',
          }),
          type: 'generations-get',
        }),
      ),
    )

    renderApp('/generations/01GENERATION')

    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    expect(
      screen.queryByRole('heading', {name: 'Workflow progress'}),
    ).toBeNull()
    expect(screen.queryByText('explainer-plan')).toBeNull()
    expect(screen.queryByText('media-compose')).toBeNull()
  })

  test('adds a generated output to the Create references', async () => {
    let completeReference: (response: Response) => void =
      () => undefined
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              generation: generationRecord(),
              type: 'generations-get',
            }),
          )
        }
        if (path === '/api/references') {
          return new Promise<Response>((resolve) => {
            completeReference = resolve
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01GENERATION')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    await user.click(screen.getByRole('button', {name: 'Reference'}))

    expect(
      (
        screen.getByRole('button', {
          name: 'Adding reference...',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    const [, referenceInit] = fetchFake.mock.calls[1] as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(String(referenceInit.body))).toEqual({
      ids: ['01GENERATION'],
    })

    await act(async () => {
      completeReference(
        jsonResponse({
          references: [
            {
              generationId: '01GENERATION',
              mediaType: 'image/png',
              path: 'C:\\media\\01GENERATION\\output.png',
            },
          ],
          type: 'generations-reference',
        }),
      )
    })

    await user.click(
      await screen.findByRole('link', {name: 'Continue in Create'}),
    )
    expect(screen.getByText('output.png')).not.toBeNull()
    expect(
      screen.getByRole('button', {name: 'Add references'}),
    ).not.toBeNull()
  })

  test('exports a Generation from the detail view', async () => {
    let completeExport: (response: Response) => void = () => undefined
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              generation: generationRecord(),
              type: 'generations-get',
            }),
          )
        }
        if (path.endsWith('/export')) {
          return new Promise<Response>((resolve) => {
            completeExport = resolve
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01GENERATION')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    await user.click(screen.getByRole('button', {name: 'Export'}))

    expect(
      (
        screen.getByRole('button', {
          name: 'Exporting...',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    const [, exportInit] = fetchFake.mock.calls[1] as [
      string,
      RequestInit,
    ]
    expect(fetchFake.mock.calls[1]?.[0]).toBe(
      '/api/generations/01GENERATION/export',
    )
    expect(JSON.parse(String(exportInit.body))).toEqual({force: false})

    await act(async () => {
      completeExport(
        jsonResponse({
          files: ['C:\\project\\assets\\hero.png'],
          id: '01GENERATION',
          type: 'generations-export',
        }),
      )
    })

    expect(await screen.findByText('Exported 1 file.')).not.toBeNull()
    expect(
      screen.getByText('C:\\project\\assets\\hero.png'),
    ).not.toBeNull()
  })

  test('requires confirmation before overwriting an export', async () => {
    let exportAttempt = 0
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              generation: generationRecord(),
              type: 'generations-get',
            }),
          )
        }
        if (path.endsWith('/export')) {
          exportAttempt += 1
          if (exportAttempt === 1) {
            return Promise.resolve(
              jsonResponse(
                {
                  code: 'confirmation_required',
                  error: true,
                  help: ['Retry with force'],
                  message: 'The export destination already exists.',
                },
                409,
              ),
            )
          }
          return Promise.resolve(
            jsonResponse({
              files: ['C:\\project\\assets\\hero.png'],
              id: '01GENERATION',
              type: 'generations-export',
            }),
          )
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01GENERATION')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    await user.click(screen.getByRole('button', {name: 'Export'}))

    expect(
      await screen.findByRole('alertdialog', {
        name: 'Overwrite exported files?',
      }),
    ).not.toBeNull()
    await user.click(
      screen.getByRole('button', {name: 'Confirm overwrite'}),
    )

    const [, overwriteInit] = fetchFake.mock.calls[2] as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(String(overwriteInit.body))).toEqual({force: true})
    expect(await screen.findByText('Exported 1 file.')).not.toBeNull()
  })

  test('shows a detail action error and restores the action', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              generation: generationRecord(),
              type: 'generations-get',
            }),
          )
        }
        if (path.endsWith('/export')) {
          return Promise.resolve(
            jsonResponse(
              {
                code: 'export_failed',
                error: true,
                help: [],
                message: 'The export destination already exists.',
              },
              400,
            ),
          )
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01GENERATION')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    await user.click(screen.getByRole('button', {name: 'Export'}))

    expect(
      await screen.findByRole('alert', {name: 'Action failed'}),
    ).not.toBeNull()
    expect(
      screen.getByText('The export destination already exists.'),
    ).not.toBeNull()
    expect(
      (
        screen.getByRole('button', {
          name: 'Export',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  test('requires confirmation before deleting a Generation', async () => {
    let completeDelete: (response: Response) => void = () => undefined
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (init?.method === 'GET') {
          return Promise.resolve(
            jsonResponse({
              generation: generationRecord(),
              type: 'generations-get',
            }),
          )
        }
        if (init?.method === 'DELETE') {
          return new Promise<Response>((resolve) => {
            completeDelete = resolve
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/generations/01GENERATION')
    await screen.findByRole('heading', {
      name: 'Generation 01GENERATION',
    })
    await user.click(screen.getByRole('button', {name: 'Delete'}))

    expect(fetchFake).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('alertdialog', {
        name: 'Delete this Generation?',
      }),
    ).not.toBeNull()
    await user.click(
      screen.getByRole('button', {name: 'Confirm delete'}),
    )

    expect(
      (
        screen.getByRole('button', {
          name: 'Deleting...',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(fetchFake.mock.calls[1]?.[0]).toBe(
      '/api/generations/01GENERATION?force=true',
    )
    expect(fetchFake.mock.calls[1]?.[1]).toMatchObject({
      method: 'DELETE',
    })

    await act(async () => {
      completeDelete(
        jsonResponse({
          id: '01GENERATION',
          state: 'deleted',
          type: 'generations-delete',
        }),
      )
    })

    expect(
      await screen.findByRole('heading', {
        name: 'Generation deleted',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('link', {name: 'Back to Generations'}),
    ).not.toBeNull()
  })

  test('shows Azure authentication status in Settings', async () => {
    let completeAuth: (response: Response) => void = () => undefined
    const fetchFake = vi.fn(
      (input: RequestInfo | URL) =>
        String(input) === '/api/settings'
          ? Promise.resolve(jsonResponse(settingsResult()))
          : new Promise<Response>((resolve) => {
              completeAuth = resolve
            }),
    )
    vi.stubGlobal('fetch', fetchFake)

    renderApp('/settings')

    expect(
      screen.getByRole('heading', {name: 'Settings'}),
    ).not.toBeNull()
    expect(screen.getByRole('status').textContent).toContain(
      'Checking Azure authentication',
    )

    await act(async () => {
      completeAuth(
        jsonResponse({
          account: {name: 'john@example.com', type: 'user'},
          state: 'signed-in',
          subscription: {
            id: 'subscription-id',
            name: 'Developer Subscription',
          },
          tenantId: 'tenant-id',
          type: 'auth',
        }),
      )
    })

    expect(await screen.findByText('john@example.com')).not.toBeNull()
    expect(screen.getByText('Developer Subscription')).not.toBeNull()
    expect(fetchFake).toHaveBeenCalledWith(
      '/api/auth',
      expect.objectContaining({method: 'GET'}),
    )
  })

  test('shows persisted Foundry connections after the server restarts', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL) =>
        Promise.resolve(
          String(input) === '/api/settings'
            ? jsonResponse(settingsResult())
            : jsonResponse({
                account: {name: 'john@example.com', type: 'user'},
                state: 'signed-in',
                subscription: {
                  id: 'subscription-id',
                  name: 'Developer Subscription',
                },
                tenantId: 'tenant-id',
                type: 'auth',
              }),
        ),
    )
    vi.stubGlobal('fetch', fetchFake)

    renderApp('/settings')

    expect(
      await screen.findByRole('heading', {
        name: 'Saved Foundry connections',
      }),
    ).not.toBeNull()
    expect(screen.getByText('primary')).not.toBeNull()
    expect(
      screen.getByText(
        'https://example.services.ai.azure.com/api/projects/media',
      ),
    ).not.toBeNull()
    expect(fetchFake).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({method: 'GET'}),
    )
  })

  test('renders Settings with shadcn cards and form controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input) === '/api/settings'
            ? jsonResponse(settingsResult())
            : jsonResponse({
                account: {name: 'john@example.com', type: 'user'},
                state: 'signed-in',
                subscription: {
                  id: 'subscription-id',
                  name: 'Developer Subscription',
                },
                tenantId: 'tenant-id',
                type: 'auth',
              }),
        ),
      ),
    )

    renderApp('/settings')

    await screen.findByText('john@example.com')
    expect(
      screen
        .getByRole('textbox', {name: 'Connection name'})
        .getAttribute('data-slot'),
    ).toBe('input')
    expect(
      screen
        .getByRole('textbox', {name: 'Foundry project endpoint'})
        .getAttribute('data-slot'),
    ).toBe('input')
    expect(
      screen
        .getByRole('button', {name: 'Save Foundry connection'})
        .getAttribute('data-slot'),
    ).toBe('button')
    expect(
      screen.getByText('Signed in').getAttribute('data-slot'),
    ).toBe('badge')
    expect(
      screen
        .getByRole('heading', {name: 'Azure CLI context'})
        .closest('[data-slot="card"]'),
    ).not.toBeNull()
    const layout = document.querySelector(
      '[data-layout="settings-stack"]',
    )
    expect(layout).not.toBeNull()
    expect(layout?.className).not.toContain('xl:grid-cols')
  })

  test('saves a private Azure Speech connection from Settings', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/settings') {
          return Promise.resolve(jsonResponse(settingsResult()))
        }
        if (path === '/api/auth') {
          return Promise.resolve(
            jsonResponse({
              account: {name: 'john@example.com', type: 'user'},
              state: 'signed-in',
              subscription: {
                id: 'subscription-id',
                name: 'Developer Subscription',
              },
              tenantId: 'tenant-id',
              type: 'auth',
            }),
          )
        }
        if (
          path === '/api/configure/speech' &&
          init?.method === 'POST'
        ) {
          return Promise.resolve(
            jsonResponse({
              endpoint:
                'https://eastus2.tts.speech.microsoft.com/',
              state: 'configured',
              type: 'configure-speech',
              voice: 'en-US-Ethan:MAI-Voice-2',
            }),
          )
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/settings')
    await screen.findByText('john@example.com')

    await user.type(
      screen.getByRole('textbox', {
        name: 'Azure Speech synthesis endpoint',
      }),
      'https://eastus2.tts.speech.microsoft.com/',
    )
    await user.type(
      screen.getByLabelText('Azure Speech API key'),
      'private-speech-key',
    )
    await user.clear(
      screen.getByRole('textbox', {name: 'Default MAI voice'}),
    )
    await user.type(
      screen.getByRole('textbox', {name: 'Default MAI voice'}),
      'en-US-Ethan:MAI-Voice-2',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'Save Speech connection',
      }),
    )

    const [, configureInit] = fetchFake.mock.calls.find(
      ([path]) => String(path) === '/api/configure/speech',
    ) as [string, RequestInit]
    expect(JSON.parse(String(configureInit.body))).toEqual({
      apiKey: 'private-speech-key',
      endpoint:
        'https://eastus2.tts.speech.microsoft.com/',
      voice: 'en-US-Ethan:MAI-Voice-2',
    })
    expect(
      await screen.findByRole('heading', {
        name: 'Speech connection saved',
      }),
    ).not.toBeNull()
    expect(
      (screen.getByLabelText('Azure Speech API key') as HTMLInputElement)
        .value,
    ).toBe('')
  })

  test('shows saved Speech settings without returning the API key', async () => {
    const settings = settingsResult()
    settings.speech = {
      configured: true,
      defaultVoice: 'en-US-Ethan:MAI-Voice-2',
      endpoint:
        'https://speech-resource.cognitiveservices.azure.com/',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input) === '/api/settings'
            ? jsonResponse(settings)
            : jsonResponse({
                account: {name: 'john@example.com', type: 'user'},
                state: 'signed-in',
                subscription: {
                  id: 'subscription-id',
                  name: 'Developer Subscription',
                },
                tenantId: 'tenant-id',
                type: 'auth',
              }),
        ),
      ),
    )

    renderApp('/settings')

    expect(
      await screen.findByRole('heading', {
        name: 'Saved Speech connection',
      }),
    ).not.toBeNull()
    expect(
      screen.getByText(
        'https://speech-resource.cognitiveservices.azure.com/',
      ),
    ).not.toBeNull()
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Default MAI voice',
        }) as HTMLInputElement
      ).value,
    ).toBe('en-US-Ethan:MAI-Voice-2')
    expect(
      (screen.getByLabelText('Azure Speech API key') as HTMLInputElement)
        .value,
    ).toBe('')
    expect(
      (screen.getByLabelText('Azure Speech API key') as HTMLInputElement)
        .required,
    ).toBe(false)
  })

  test('shows an authentication error in Settings', async () => {
    const fetchFake = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          code: 'auth_unavailable',
          error: true,
          help: [],
          message: 'Azure CLI could not be reached.',
        },
        500,
      ),
    )
    vi.stubGlobal('fetch', fetchFake)

    renderApp('/settings')

    expect(
      await screen.findByRole('alert', {
        name: 'Could not check authentication',
      }),
    ).not.toBeNull()
    expect(
      screen.getByText('Azure CLI could not be reached.'),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Check authentication again',
      }),
    ).not.toBeNull()
  })

  test('submits a Foundry project endpoint from Settings', async () => {
    let completeConfiguration: (response: Response) => void =
      () => undefined
    const fetchFake = vi.fn(
      (input: RequestInfo | URL, _init?: RequestInit) => {
        const path = String(input)
        if (path === '/api/auth') {
          return Promise.resolve(
            jsonResponse({
              account: {name: 'john@example.com', type: 'user'},
              state: 'signed-in',
              subscription: {
                id: 'subscription-id',
                name: 'Developer Subscription',
              },
              tenantId: 'tenant-id',
              type: 'auth',
            }),
          )
        }
        if (path === '/api/configure/foundry') {
          return new Promise<Response>((resolve) => {
            completeConfiguration = resolve
          })
        }
        throw new Error(`Unexpected request: ${path}`)
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/settings')
    await screen.findByText('john@example.com')

    await user.clear(
      screen.getByRole('textbox', {name: 'Connection name'}),
    )
    await user.type(
      screen.getByRole('textbox', {name: 'Connection name'}),
      'primary',
    )
    await user.type(
      screen.getByRole('textbox', {
        name: 'Foundry project endpoint',
      }),
      'https://example.services.ai.azure.com/api/projects/media',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'Save Foundry connection',
      }),
    )

    expect(
      (
        screen.getByRole('button', {
          name: 'Discovering deployments...',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    const [, configureInit] = fetchFake.mock.calls.find(
      ([path]) => String(path) === '/api/configure/foundry',
    ) as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(String(configureInit.body))).toEqual({
      endpoint:
        'https://example.services.ai.azure.com/api/projects/media',
      name: 'primary',
    })

    await act(async () => {
      completeConfiguration(
        jsonResponse({
          deployments: [
            {
              adapter: 'mai-image',
              deploymentName: 'mai-fast',
              id: 'primary:mai-fast',
              mediaType: 'image',
              model: 'MAI-Image-2.5-Flash',
            },
            {
              adapter: 'sora-video',
              deploymentName: 'sora',
              id: 'primary:sora',
              mediaType: 'video',
              model: 'sora-2',
            },
          ],
          provider: {
            endpoint:
              'https://example.services.ai.azure.com/api/projects/media',
            name: 'primary',
          },
          type: 'configure-foundry',
          unsupported: [
            {
              deploymentName: 'other',
              model: 'unsupported-model',
            },
          ],
        }),
      )
    })

    expect(
      await screen.findByRole('heading', {
        name: 'Foundry connection saved',
      }),
    ).not.toBeNull()
    expect(screen.getByText('MAI-Image-2.5-Flash')).not.toBeNull()
    expect(screen.getByText('sora-2')).not.toBeNull()
    expect(screen.getByText(/1 unsupported deployment/)).not.toBeNull()
    expect(screen.getByText('unsupported-model')).not.toBeNull()
    expect(screen.getByText('other')).not.toBeNull()
  })

  test('shows a Foundry configuration error in Settings', async () => {
    const fetchFake = vi.fn(
      (input: RequestInfo | URL) => {
        const path = String(input)
        if (path === '/api/settings') {
          return Promise.resolve(jsonResponse(settingsResult()))
        }
        if (path === '/api/auth') {
          return Promise.resolve(
            jsonResponse({
              help: ['Run `mg auth login`'],
              state: 'signed-out',
              type: 'auth',
            }),
          )
        }
        return Promise.resolve(
          jsonResponse(
            {
              code: 'foundry_discovery_failed',
              error: true,
              help: [],
              message: 'The Foundry project could not be reached.',
            },
            400,
          ),
        )
      },
    )
    vi.stubGlobal('fetch', fetchFake)
    const user = userEvent.setup()

    renderApp('/settings')
    await screen.findByText('Signed out')
    const endpoint = screen.getByRole('textbox', {
      name: 'Foundry project endpoint',
    }) as HTMLInputElement
    await user.type(
      endpoint,
      'https://example.services.ai.azure.com/api/projects/media',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'Save Foundry connection',
      }),
    )

    expect(
      await screen.findByRole('alert', {
        name: 'Foundry connection could not be saved',
      }),
    ).not.toBeNull()
    expect(
      screen.getByText('The Foundry project could not be reached.'),
    ).not.toBeNull()
    expect(endpoint.value).toBe(
      'https://example.services.ai.azure.com/api/projects/media',
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'Save Foundry connection',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })
})

function renderApp(path: string) {
  return render(
    React.createElement(
      MemoryRouter,
      {initialEntries: [path]},
      React.createElement(App),
    ),
  )
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {'Content-Type': 'application/json'},
    status,
  })
}

function generationRecord(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {...baseGenerationRecord(), ...overrides}
}

function baseGenerationRecord(): GenerationRecord {
  return {
    controls: {},
    createdAt: '2026-08-18T12:00:00.000Z',
    creativeBrief: 'Show the dashboard at launch.',
    error: null,
    id: '01GENERATION',
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
    runtime: {catalogVersion: '5', cliVersion: '0.0.0'},
    scenario: null,
    schemaVersion: 5 as const,
    selection: {
      generator: 'image' as const,
      kind: 'generator' as const,
      style: 'product-led',
    },
    sourceGenerations: [],
    status: 'succeeded' as const,
    textReferences: [],
    updatedAt: '2026-08-18T12:00:00.000Z',
    webReferences: [],
  }
}

function settingsResult(): SettingsGetResult {
  return {
    auth: {
      account: {name: 'john@example.com', type: 'user'},
      state: 'signed-in',
      subscription: {id: 'subscription-id', name: 'Subscription'},
      tenantId: 'tenant-id',
    },
    catalog: {
      videoModels: [
        {
          clipDurationsSeconds: [4, 8, 12, 16, 20],
          composableDurationsSeconds: Array.from(
            {length: 147},
            (_, index) => 16 + index * 4,
          ),
          explainerDurationPresetsSeconds: [
            20, 40, 60, 180, 300, 600,
          ],
          manualDuration: {
            maxSeconds: 600,
            minSeconds: 15,
          },
          maxConcurrentRequests: 2,
          model: 'sora-2',
          preferredClipSeconds: 20,
        },
      ],
      voices: [
        {
          id: 'en-US-Harper:MAI-Voice-2',
          label: 'Harper · English (US)',
          model: 'MAI-Voice-2',
        },
        {
          id: 'en-US-Ethan:MAI-Voice-2',
          label: 'Ethan · English (US)',
          model: 'MAI-Voice-2',
        },
      ],
    },
    manifest: {
      deployments: {
        'primary:gpt-image': {
          adapter: 'azure-openai-image',
          deploymentName: 'gpt-image',
          model: 'gpt-image-2',
          provider: 'primary',
        },
        'primary:mai-fast': {
          adapter: 'mai-image',
          deploymentName: 'mai-fast',
          model: 'MAI-Image-2.5-Flash',
          provider: 'primary',
        },
        'primary:sora': {
          adapter: 'sora-video',
          deploymentName: 'sora',
          model: 'sora-2',
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
          image: {
            auto: ['primary:gpt-image', 'primary:mai-fast'],
          },
          video: {
            auto: ['primary:sora'],
          },
        },
        scenarios: {},
      },
      scenarios: {
        enabled: [],
      },
      schemaVersion: 2,
      workspace: {name: 'Media Workspace'},
    },
    scenarios: [
      {
        description:
          'Create a narrated visual explanation from a topic or source material.',
        enabled: false,
        id: 'explainer-video' as const,
        mediaType: 'video' as const,
        presets: [
          {
            description: 'Editorial collage and graphic motion.',
            id: 'editorial-motion-graphics',
            title: 'Editorial motion graphics',
          },
        ],
        productionOptions: [],
        readiness: {
          missingRoles: [],
          state: 'ready' as const,
        },
        routingRoles: [
          'visuals',
          'voice',
        ],
        title: 'Explainer video',
      },
      {
        description:
          'Turn one source video into one or more styled short-form clips.',
        enabled: false,
        id: 'short-form-video' as const,
        mediaType: 'video' as const,
        presets: [
          {
            description: 'Bold captions and urban graphics.',
            id: 'bold-urban',
            title: 'Bold urban',
          },
        ],
        productionOptions: [],
        readiness: {
          missingRoles: [],
          state: 'ready' as const,
        },
        routingRoles: ['video'],
        title: 'Short-form video',
      },
    ],
    speech: {configured: false},
    type: 'settings-get',
  }
}
