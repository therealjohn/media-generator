import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'

const fsSpies = vi.hoisted(() => ({
  writeFile: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('node:fs/promises')>()
  fsSpies.writeFile.mockImplementation((...args: unknown[]) =>
    Reflect.apply(actual.writeFile, actual, args),
  )
  return {
    ...actual,
    writeFile: fsSpies.writeFile,
  }
})

import {createMediaGenApplication} from '../../src/application/media-gen-application.js'

const temporaryDirectories: string[] = []

beforeEach(() => {
  fsSpies.writeFile.mockClear()
})

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('private workspace storage', () => {
  test('writes the Local Profile with owner-only permissions', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'media-gen-private-storage-'),
    )
    temporaryDirectories.push(root)
    const cwd = join(root, 'Project')
    const mediaGenHome = join(root, 'home')
    const application = createMediaGenApplication({
      createWorkspaceId: () => '01PRIVATE',
    })

    await application.execute(
      {type: 'init'},
      {bin: 'mg', cwd, mediaGenHome},
    )

    const localProfileWrite = fsSpies.writeFile.mock.calls.find(
      ([path]) => String(path).includes('local.json.'),
    )
    expect(localProfileWrite?.[2]).toEqual({
      encoding: 'utf8',
      mode: 0o600,
    })
  })
})
