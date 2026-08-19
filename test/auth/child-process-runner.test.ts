import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {delimiter, join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {createChildProcessRunner} from '../../src/auth/child-process-runner.js'

const temporaryDirectories: string[] = []
const originalPath = process.env.PATH

afterEach(async () => {
  process.env.PATH = originalPath
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('ChildProcessRunner', () => {
  test.runIf(process.platform === 'win32')(
    'executes command shims available through PATHEXT on Windows',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'media-gen-cmd-'))
      temporaryDirectories.push(directory)
      await writeFile(
        join(directory, 'fixture.cmd'),
        '@echo off\r\necho shim-ok\r\n',
        'utf8',
      )
      process.env.PATH = `${directory}${delimiter}${originalPath ?? ''}`
      const runner = createChildProcessRunner()

      await expect(runner.run('fixture', [])).resolves.toMatchObject({
        exitCode: 0,
        stdout: expect.stringContaining('shim-ok'),
      })
    },
  )

  test('captures process output and exit code', async () => {
    const runner = createChildProcessRunner()

    await expect(
      runner.run(process.execPath, [
        '-e',
        "process.stdout.write('ok'); process.stderr.write('note')",
      ]),
    ).resolves.toEqual({
      exitCode: 0,
      stderr: 'note',
      stdout: 'ok',
    })
  })
})
