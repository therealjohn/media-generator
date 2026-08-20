import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'

export interface ImageNormalizationRequest {
  height: number
  inputPath: string
  outputPath: string
  width: number
}

export interface ImageNormalizer {
  normalize(request: ImageNormalizationRequest): Promise<void>
}

export interface ImageProcessResult {
  exitCode: number
  stderr: string
  stdout: string
}

export interface FfmpegImageNormalizerDependencies {
  ffmpegPath: string | null
  run(command: string, args: string[]): Promise<ImageProcessResult>
}

const require = createRequire(import.meta.url)
const loadedFfmpegPath: unknown = require('ffmpeg-static')
const bundledFfmpegPath =
  typeof loadedFfmpegPath === 'string' ||
  loadedFfmpegPath === null
    ? loadedFfmpegPath
    : null

const defaultDependencies: FfmpegImageNormalizerDependencies = {
  ffmpegPath: bundledFfmpegPath,
  run: runProcess,
}

export function createFfmpegImageNormalizer(
  dependencyOverrides: Partial<FfmpegImageNormalizerDependencies> = {},
): ImageNormalizer {
  const dependencies = {
    ...defaultDependencies,
    ...dependencyOverrides,
  }
  return {
    async normalize(request) {
      const ffmpegPath = requireFfmpegPath(
        dependencies.ffmpegPath,
      )
      const result = await dependencies.run(ffmpegPath, [
        '-y',
        '-i',
        request.inputPath,
        '-vf',
        `scale=${request.width}:${request.height}:force_original_aspect_ratio=increase,crop=${request.width}:${request.height},setsar=1`,
        '-frames:v',
        '1',
        request.outputPath,
      ])
      if (result.exitCode !== 0) {
        throw new Error(
          `FFmpeg image normalization failed${result.stderr.trim().length === 0 ? '' : `: ${result.stderr.trim()}`}`,
        )
      }
    },
  }
}

function requireFfmpegPath(path: string | null): string {
  if (path === null) {
    throw new Error(
      'The bundled FFmpeg binary is unavailable on this platform',
    )
  }
  return path
}

async function runProcess(
  command: string,
  args: string[],
): Promise<ImageProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: 'pipe',
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stderr,
        stdout,
      })
    })
  })
}
