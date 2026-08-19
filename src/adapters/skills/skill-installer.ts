import {access, mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {MediaGenError} from '../../application/media-gen-error.js'

export type SkillTarget =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'github-copilot'

export interface SkillInstallOptions {
  force?: boolean
  path?: string
  target?: SkillTarget
}

const targetDirectories: Record<SkillTarget, string[]> = {
  claude: ['.claude', 'skills', 'generate-media'],
  codex: ['.agents', 'skills', 'generate-media'],
  cursor: ['.cursor', 'skills', 'generate-media'],
  'github-copilot': ['.github', 'skills', 'generate-media'],
}

export async function installAgentSkill(
  projectDirectory: string,
  options: SkillInstallOptions,
): Promise<{
  path: string
  state: 'installed'
  target: SkillTarget | 'custom'
}> {
  const target = options.path === undefined
    ? options.target ?? 'github-copilot'
    : 'custom'
  const directory =
    options.path === undefined
      ? join(
          projectDirectory,
          ...targetDirectories[options.target ?? 'github-copilot'],
        )
      : join(projectDirectory, options.path)
  const path = join(directory, 'SKILL.md')
  if ((await pathExists(path)) && options.force !== true) {
    throw new MediaGenError(
      'confirmation_required',
      `Skill "${path}" already exists and requires --force`,
      2,
      ['Rerun the command with `--force`'],
    )
  }
  await mkdir(directory, {recursive: true})
  await writeFile(path, skillContent, 'utf8')

  return {path, state: 'installed', target}
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }

    throw error
  }
}

const skillContent = `---
name: generate-media
description: Generate, edit, recreate, reference, inspect, and export image or video media through the Media Gen CLI.
---

# Generate Media

Before acting:

1. Verify that \`mg\` is installed.
2. Run \`mg\` to inspect the current workspace.
3. Always run \`mg skills\` to load the current action catalog.
4. Run \`mg skills <action> [reference]\` for the requested workflow.

Use \`mg\` for every mutation. Do not call Model Providers directly.

Use TOON output by default. Request JSON only when a script needs it.

Commands that require \`--force\` must be presented to the user before rerunning.
`
