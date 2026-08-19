import {createHash} from 'node:crypto'
import {readFile, stat} from 'node:fs/promises'
import {extname, resolve} from 'node:path'

import type {ReferenceFingerprint} from './generation-store.js'

const mediaTypes: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export async function fingerprintReference(
  referencePath: string,
): Promise<ReferenceFingerprint> {
  const path = resolve(referencePath)
  const [contents, metadata] = await Promise.all([
    readFile(path),
    stat(path),
  ])

  return {
    mediaType:
      mediaTypes[extname(path).toLowerCase()] ??
      'application/octet-stream',
    modifiedAt: metadata.mtime.toISOString(),
    path,
    sha256: createHash('sha256').update(contents).digest('hex'),
    size: metadata.size,
  }
}

export async function inspectReference(
  fingerprint: ReferenceFingerprint,
): Promise<
  | {path: string; state: 'missing'}
  | {path: string; state: 'present'}
  | {currentSha256: string; path: string; state: 'changed'}
> {
  try {
    const current = await fingerprintReference(fingerprint.path)
    if (current.sha256 === fingerprint.sha256) {
      return {path: fingerprint.path, state: 'present'}
    }

    return {
      currentSha256: current.sha256,
      path: fingerprint.path,
      state: 'changed',
    }
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return {path: fingerprint.path, state: 'missing'}
    }

    throw error
  }
}
