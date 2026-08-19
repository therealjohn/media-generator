import {mkdir, rm, stat} from 'node:fs/promises'

export interface FileLockOptions {
  now?: () => Date
  staleAfterMs?: number
}

export async function withFileLock<T>(
  path: string,
  operation: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const lockPath = `${path}.lock`
  const now = options.now ?? (() => new Date())
  const staleAfterMs = options.staleAfterMs ?? 30_000

  while (true) {
    try {
      await mkdir(lockPath)
      break
    } catch (error) {
      if (!isLockContention(error)) {
        throw error
      }

      let lockMetadata
      try {
        lockMetadata = await stat(lockPath)
      } catch (statError) {
        if (isMissingPath(statError)) {
          continue
        }
        throw statError
      }
      if (
        now().getTime() - lockMetadata.mtime.getTime() >
        staleAfterMs
      ) {
        await rm(lockPath, {force: true, recursive: true})
        continue
      }

      await delay(10)
    }
  }

  try {
    return await operation()
  } finally {
    await rm(lockPath, {force: true, recursive: true})
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isLockContention(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'EEXIST'
  )
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
