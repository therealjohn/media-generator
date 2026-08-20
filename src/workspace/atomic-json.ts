import {randomUUID} from 'node:crypto'
import {
  mkdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import {dirname} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'

export async function writeJsonAtomic(
  path: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  )
  try {
    await renameWithRetry(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, {force: true})
    throw error
  }
}

async function renameWithRetry(
  source: string,
  destination: string,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      if (!isTransientRenameError(error) || attempt === 5) {
        throw error
      }
      await delay((attempt + 1) * 10)
    }
  }
}

function isTransientRenameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EACCES' ||
      error.code === 'EBUSY' ||
      error.code === 'EPERM')
  )
}
