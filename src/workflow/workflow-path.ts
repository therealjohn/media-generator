import {isAbsolute, relative, resolve} from 'node:path'

export function resolveWithinGeneration(
  generationDirectory: string,
  path: string,
  kind: 'artifact' | 'input' = 'artifact',
): string {
  const label = `Workflow ${kind} path`
  if (isAbsolute(path)) {
    throw new Error(`${label} must be relative: "${path}"`)
  }
  const root = resolve(generationDirectory)
  const resolvedPath = resolve(root, path)
  const relation = relative(root, resolvedPath)
  if (
    relation === '..' ||
    relation.startsWith('../') ||
    relation.startsWith('..\\') ||
    isAbsolute(relation)
  ) {
    throw new Error(`${label} escapes its Generation: "${path}"`)
  }
  return resolvedPath
}
