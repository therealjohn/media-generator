import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {installAgentSkill} from '../../src/adapters/skills/skill-installer.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('installAgentSkill', () => {
  test('refuses to overwrite an existing skill without force', async () => {
    const projectDirectory = await mkdtemp(
      join(tmpdir(), 'media-gen-skill-existing-'),
    )
    temporaryDirectories.push(projectDirectory)
    await installAgentSkill(projectDirectory, {
      target: 'claude',
    })

    await expect(
      installAgentSkill(projectDirectory, {
        target: 'claude',
      }),
    ).rejects.toMatchObject({
      code: 'confirmation_required',
      exitCode: 2,
    })
  })

  test('installs the lightweight GitHub Copilot skill', async () => {
    const projectDirectory = await mkdtemp(
      join(tmpdir(), 'media-gen-skill-'),
    )
    temporaryDirectories.push(projectDirectory)

    const result = await installAgentSkill(projectDirectory, {
      target: 'github-copilot',
    })

    const path = join(
      projectDirectory,
      '.github',
      'skills',
      'generate-media',
      'SKILL.md',
    )
    expect(result).toEqual({
      path,
      state: 'installed',
      target: 'github-copilot',
    })
    const content = await readFile(path, 'utf8')
    expect(content).toContain('name: generate-media')
    expect(content).toContain('run `mg skills`')
    expect(content).toContain('Do not call Model Providers directly')
  })
})
