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

import {createGenerationStore} from '../../src/generation/generation-store.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('GenerationStore', () => {
  test('deletes a Generation directory', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-delete-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const store = createGenerationStore(workspacePath, {
      createId: () => '01GENERATION',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    await store.create(generationInput())

    await expect(store.delete('01GENERATION')).resolves.toEqual({
      id: '01GENERATION',
      state: 'deleted',
    })
    await expect(store.get('01GENERATION')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('lists Generations newest first', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-list-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const ids = ['01OLDER', '01NEWER']
    const timestamps = [
      new Date('2026-08-18T12:00:00.000Z'),
      new Date('2026-08-18T12:01:00.000Z'),
    ]
    const store = createGenerationStore(workspacePath, {
      createId: () => ids.shift() ?? 'unexpected',
      now: () => timestamps.shift() ?? new Date(0),
    })
    await store.create(generationInput())
    await store.create(generationInput())

    await expect(store.list()).resolves.toMatchObject([
      {id: '01NEWER'},
      {id: '01OLDER'},
    ])
  })

  test('reads a Generation by ID', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-get-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const store = createGenerationStore(workspacePath, {
      createId: () => '01GENERATION',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    const created = await store.create(generationInput())

    await expect(store.get('01GENERATION')).resolves.toEqual(created)
  })

  test('rejects Generation IDs that escape the Generation directory', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-id-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const store = createGenerationStore(workspacePath, {
      createId: () => '01GENERATION',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })
    const record = await store.create(generationInput())
    const outsideDirectory = join(workspacePath, 'outside')
    await mkdir(outsideDirectory)
    await writeFile(
      join(outsideDirectory, 'generation.json'),
      `${JSON.stringify(record, null, 2)}\n`,
      'utf8',
    )

    await expect(
      store.get(join('..', 'outside')),
    ).rejects.toMatchObject({
      code: 'invalid_generation_id',
    })
  })

  test('does not delete outside the Generation directory', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-delete-scope-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const outsideDirectory = join(workspacePath, 'outside')
    const sentinelPath = join(outsideDirectory, 'sentinel.txt')
    await mkdir(outsideDirectory)
    await writeFile(sentinelPath, 'keep me', 'utf8')
    const store = createGenerationStore(workspacePath, {
      createId: () => '01GENERATION',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })

    await expect(
      store.delete(join('..', 'outside')),
    ).rejects.toMatchObject({
      code: 'invalid_generation_id',
    })
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(
      'keep me',
    )
  })

  test('updates a Generation atomically under its record lock', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-update-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const timestamps = [
      new Date('2026-08-18T12:00:00.000Z'),
      new Date('2026-08-18T12:00:10.000Z'),
    ]
    const store = createGenerationStore(workspacePath, {
      createId: () => '01GENERATION',
      now: () => timestamps.shift() ?? new Date(0),
    })
    await store.create(generationInput())

    const record = await store.update('01GENERATION', (current) => ({
      ...current,
      provider: {jobId: 'provider-job'},
      status: 'running',
    }))

    expect(record).toMatchObject({
      provider: {jobId: 'provider-job'},
      status: 'running',
      updatedAt: '2026-08-18T12:00:10.000Z',
    })
    await expect(
      readJson(
        join(
          workspacePath,
          'generations',
          '01GENERATION',
          'generation.json',
        ),
      ),
    ).resolves.toEqual(record)
  })

  test('creates a self-contained Generation directory and record', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const store = createGenerationStore(workspacePath, {
      createId: () => '01GENERATION',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })

    const record = await store.create(generationInput())

    expect(record).toMatchObject({
      createdAt: '2026-08-18T12:00:00.000Z',
      id: '01GENERATION',
      operations: [],
      progress: {
        completed: 0,
        stage: 'created',
        total: 1,
      },
      resolvedResources: [
        {
          id: 'primary:mai-fast',
          role: 'generation',
        },
      ],
      scenario: null,
      schemaVersion: 4,
      selection: {
        generator: 'image',
        kind: 'generator',
        style: 'minimal-studio',
      },
      textReferences: [],
      webReferences: [],
      status: 'created',
      updatedAt: '2026-08-18T12:00:00.000Z',
    })

    await expect(
      readJson(
        join(
          workspacePath,
          'generations',
          '01GENERATION',
          'generation.json',
        ),
      ),
    ).resolves.toEqual(record)
  })

  test('stores Web Reference URLs and private Text Reference metadata', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-references-'),
    )
    temporaryDirectories.push(workspacePath)
    await mkdir(join(workspacePath, 'generations'))
    const store = createGenerationStore(workspacePath, {
      createId: () => '01REFERENCES',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })

    const record = await store.create({
      ...generationInput(),
      textReferences: [
        {
          format: 'markdown',
          path: 'inputs/text-reference-1.md',
          sha256: 'text-sha',
          size: 24,
          title: 'Product documentation',
        },
      ],
      webReferences: [
        {url: 'https://docs.example.com/product'},
      ],
    })

    expect(record).toMatchObject({
      schemaVersion: 4,
      textReferences: [
        {
          path: 'inputs/text-reference-1.md',
          title: 'Product documentation',
        },
      ],
      webReferences: [
        {url: 'https://docs.example.com/product'},
      ],
    })
    expect(JSON.stringify(record)).not.toContain('Connect the SDK')
  })

  test('normalizes legacy product marketing selections as generators', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-legacy-'),
    )
    temporaryDirectories.push(workspacePath)
    const generationPath = join(
      workspacePath,
      'generations',
      '01LEGACY',
    )
    await mkdir(join(generationPath, 'outputs'), {recursive: true})
    await writeFile(
      join(generationPath, 'generation.json'),
      `${JSON.stringify({
        createdAt: '2026-08-18T12:00:00.000Z',
        creativeBrief: 'Create a polished product hero.',
        error: null,
        id: '01LEGACY',
        mediaType: 'image',
        outputs: [],
        provider: {jobId: null},
        references: [],
        resolvedModel: {
          deployment: 'mai-fast',
          id: 'primary:mai-fast',
          model: 'MAI-Image-2.5-Flash',
          provider: 'primary',
        },
        runtime: {catalogVersion: '1', cliVersion: '0.1.1'},
        schemaVersion: 1,
        selection: {
          deliverable: 'product-hero',
          scenario: 'product-marketing-image',
          style: 'product-led',
        },
        sourceGenerations: [],
        status: 'succeeded',
        updatedAt: '2026-08-18T12:00:00.000Z',
      }, null, 2)}\n`,
      'utf8',
    )
    const store = createGenerationStore(workspacePath, {
      createId: () => 'unused',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })

    await expect(store.get('01LEGACY')).resolves.toMatchObject({
      schemaVersion: 4,
      resolvedResources: [
        {
          id: 'primary:mai-fast',
          role: 'generation',
        },
      ],
      selection: {
        generator: 'image',
        kind: 'generator',
        style: 'product-led',
      },
    })
  })

  test('normalizes version 2 Generator records as version 4 records', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-v2-'),
    )
    temporaryDirectories.push(workspacePath)
    const generationPath = join(workspacePath, 'generations', '01V2')
    await mkdir(join(generationPath, 'outputs'), {recursive: true})
    await writeFile(
      join(generationPath, 'generation.json'),
      `${JSON.stringify({
        createdAt: '2026-08-18T12:00:00.000Z',
        creativeBrief: 'Create a polished product hero.',
        error: null,
        id: '01V2',
        mediaType: 'image',
        outputs: [],
        provider: {jobId: null},
        references: [],
        resolvedModel: {
          deployment: 'mai-fast',
          id: 'primary:mai-fast',
          model: 'MAI-Image-2.5-Flash',
          provider: 'primary',
        },
        runtime: {catalogVersion: '2', cliVersion: '0.1.1'},
        schemaVersion: 2,
        selection: {
          generator: 'image',
          kind: 'generator',
          style: 'minimal-studio',
        },
        sourceGenerations: [],
        status: 'succeeded',
        updatedAt: '2026-08-18T12:00:00.000Z',
      }, null, 2)}\n`,
      'utf8',
    )
    const store = createGenerationStore(workspacePath, {
      createId: () => 'unused',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })

    await expect(store.get('01V2')).resolves.toMatchObject({
      operations: [],
      progress: {
        completed: 1,
        stage: 'succeeded',
        total: 1,
      },
      scenario: null,
      schemaVersion: 4,
      textReferences: [],
      webReferences: [],
    })
  })

  test('normalizes version 3 records with empty Web and Text References', async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), 'media-gen-generation-v3-'),
    )
    temporaryDirectories.push(workspacePath)
    const generationPath = join(workspacePath, 'generations', '01V3')
    await mkdir(join(generationPath, 'outputs'), {recursive: true})
    await writeFile(
      join(generationPath, 'generation.json'),
      `${JSON.stringify({
        createdAt: '2026-08-18T12:00:00.000Z',
        creativeBrief: 'Create a polished product hero.',
        error: null,
        id: '01V3',
        mediaType: 'image',
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
        runtime: {catalogVersion: '3', cliVersion: '0.1.1'},
        scenario: null,
        schemaVersion: 3,
        selection: {
          generator: 'image',
          kind: 'generator',
          style: 'minimal-studio',
        },
        sourceGenerations: [],
        status: 'succeeded',
        updatedAt: '2026-08-18T12:00:00.000Z',
      }, null, 2)}\n`,
      'utf8',
    )
    const store = createGenerationStore(workspacePath, {
      createId: () => 'unused',
      now: () => new Date('2026-08-18T12:00:00.000Z'),
    })

    await expect(store.get('01V3')).resolves.toMatchObject({
      schemaVersion: 4,
      textReferences: [],
      webReferences: [],
    })
  })
})

function generationInput() {
  return {
    creativeBrief: 'Create a polished product hero.',
    mediaType: 'image' as const,
    references: [],
    resolvedModel: {
      deployment: 'mai-fast',
      id: 'primary:mai-fast',
      model: 'MAI-Image-2.5-Flash',
      provider: 'primary',
    },
    selection: {
      generator: 'image' as const,
      kind: 'generator' as const,
      style: 'minimal-studio',
    },
    sourceGenerations: [],
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}
