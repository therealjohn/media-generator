import {spawnSync} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, test} from 'vitest'

const temporaryDirectories: string[] = []
const cliPath = fileURLToPath(
  new URL('../../../src/cli.ts', import.meta.url),
)
const tsxPath = fileURLToPath(
  new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url),
)

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('mg entrypoint', () => {
  test('prints the current directory home result', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'media-gen-entrypoint-'))
    temporaryDirectories.push(cwd)

    const result = spawnSync(
      process.execPath,
      [tsxPath, cliPath, '--output', 'json'],
      {
        cwd,
        encoding: 'utf8',
      },
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      bin: 'mg',
      projectDirectory: cwd,
      state: 'uninitialized',
      type: 'home',
    })
  })
})
