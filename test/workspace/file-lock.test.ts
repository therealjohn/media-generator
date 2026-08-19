import {mkdir, mkdtemp, rm, utimes} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {withFileLock} from '../../src/workspace/file-lock.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('withFileLock', () => {
  test('recovers a stale lock directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-stale-lock-'))
    temporaryDirectories.push(root)
    const path = join(root, 'registry.json')
    const lockPath = `${path}.lock`
    await mkdir(lockPath)
    const old = new Date('2026-08-18T11:00:00.000Z')
    await utimes(lockPath, old, old)

    await expect(
      withFileLock(
        path,
        async () => 'recovered',
        {
          now: () => new Date('2026-08-18T12:00:00.000Z'),
          staleAfterMs: 30_000,
        },
      ),
    ).resolves.toBe('recovered')
  })

  test('serializes concurrent operations for the same path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-gen-lock-'))
    temporaryDirectories.push(root)
    const events: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withFileLock(join(root, 'registry.json'), async () => {
      events.push('first:start')
      await firstMayFinish
      events.push('first:end')
    })
    const second = withFileLock(join(root, 'registry.json'), async () => {
      events.push('second:start')
      events.push('second:end')
    })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(events).toEqual(['first:start'])

    releaseFirst?.()
    await Promise.all([first, second])

    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
  })
})
