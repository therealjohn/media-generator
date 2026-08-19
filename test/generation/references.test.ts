import {
  mkdtemp,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {
  fingerprintReference,
  inspectReference,
} from '../../src/generation/references.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('fingerprintReference', () => {
  test('reports when a reference has changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-reference-change-'))
    temporaryDirectories.push(root)
    const path = join(root, 'product.png')
    await writeFile(path, 'original', 'utf8')
    const fingerprint = await fingerprintReference(path)
    await writeFile(path, 'changed', 'utf8')

    await expect(inspectReference(fingerprint)).resolves.toEqual({
      currentSha256:
        'd67e2e944994496c8d8ec76eed0cf9f09679448d584b532bebf941852a37f5ed',
      path,
      state: 'changed',
    })
  })

  test('records path, metadata, media type, and SHA-256', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-reference-'))
    temporaryDirectories.push(root)
    const path = join(root, 'product.png')
    await writeFile(path, 'image bytes', 'utf8')
    const modifiedAt = new Date('2026-08-18T12:00:00.000Z')
    await utimes(path, modifiedAt, modifiedAt)

    await expect(fingerprintReference(path)).resolves.toEqual({
      mediaType: 'image/png',
      modifiedAt: modifiedAt.toISOString(),
      path,
      sha256:
        'de7030234493a8bea844dbe1d8676e68a2c1a4b014c721f0425a22b6df66faec',
      size: 11,
    })
  })
})
