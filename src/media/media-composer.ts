import {spawn} from 'node:child_process'
import {mkdir, writeFile as writeFileToDisk} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, extname} from 'node:path'

export interface MediaCompositionScene {
  durationSeconds: number
  id: string
  narration: string
  narrationPath?: string
  videoPath: string
}

export interface MediaCompositionRequest {
  height: number
  outputPath: string
  scenes: MediaCompositionScene[]
  subtitlePath?: string
  subtitles: boolean
  width: number
}

export interface MediaCompositionResult {
  durationSeconds: number
  mediaType: 'video/mp4'
  path: string
}

export interface MediaComposer {
  compose(
    request: MediaCompositionRequest,
  ): Promise<MediaCompositionResult>
}

export interface MediaProcessResult {
  exitCode: number
  stderr: string
  stdout: string
}

export interface FfmpegMediaComposerDependencies {
  ffmpegPath: string | null
  ffprobePath: string
  run(
    command: string,
    args: string[],
  ): Promise<MediaProcessResult>
  writeFile(path: string, contents: string): Promise<void>
}

const require = createRequire(import.meta.url)
const ffmpegPath = readStaticBinaryPath(
  require('ffmpeg-static'),
  'ffmpeg-static',
)
const ffprobePath = requireStaticBinaryPath(
  readStaticBinaryPath(
    require('ffprobe-static'),
    'ffprobe-static',
  ),
  'FFprobe',
)

const defaultDependencies: FfmpegMediaComposerDependencies = {
  ffmpegPath,
  ffprobePath,
  run: runProcess,
  writeFile: async (path, contents) => {
    await mkdir(dirname(path), {recursive: true})
    await writeFileToDisk(path, contents, 'utf8')
  },
}

function readStaticBinaryPath(
  value: unknown,
  packageName: string,
): string | null {
  if (typeof value === 'string' || value === null) {
    return value
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string'
  ) {
    return value.path
  }
  throw new Error(
    `${packageName} did not expose a binary path`,
  )
}

function requireBundledFfmpegPath(path: string | null): string {
  return requireStaticBinaryPath(path, 'FFmpeg')
}

function requireStaticBinaryPath(
  path: string | null,
  binary: string,
): string {
  if (path === null) {
    throw new Error(
      `The bundled ${binary} binary is unavailable on this platform`,
    )
  }
  return path
}

export function createFfmpegMediaComposer(
  dependencyOverrides: Partial<FfmpegMediaComposerDependencies> = {},
): MediaComposer {
  const dependencies = {
    ...defaultDependencies,
    ...dependencyOverrides,
  }

  return {
    async compose(request) {
      const ffmpegBinary = requireBundledFfmpegPath(
        dependencies.ffmpegPath,
      )
      if (request.scenes.length === 0) {
        throw new Error('Media composition requires at least one scene')
      }
      if (
        !Number.isInteger(request.width) ||
        request.width <= 0 ||
        !Number.isInteger(request.height) ||
        request.height <= 0
      ) {
        throw new Error(
          'Media composition dimensions must be positive integers',
        )
      }

      const subtitlePath =
        request.subtitlePath ??
        replaceExtension(request.outputPath, '.srt')
      if (request.subtitles) {
        await dependencies.writeFile(
          subtitlePath,
          createSrt(request.scenes),
        )
      }

      const audioPresence = await Promise.all(
        request.scenes.map((scene) =>
          hasAudioStream(
            dependencies,
            scene.videoPath,
          ),
        ),
      )
      const narrationDurations = await Promise.all(
        request.scenes.map((scene) =>
          scene.narrationPath === undefined
            ? Promise.resolve(undefined)
            : probeDuration(
                dependencies,
                scene.narrationPath,
              ),
        ),
      )
      const args = ['-y']
      const inputIndexes: Array<{
        narration?: number
        video: number
      }> = []
      let inputIndex = 0
      for (const scene of request.scenes) {
        args.push('-i', scene.videoPath)
        const indexes: {
          narration?: number
          video: number
        } = {video: inputIndex}
        inputIndex += 1
        if (scene.narrationPath !== undefined) {
          args.push('-i', scene.narrationPath)
          indexes.narration = inputIndex
          inputIndex += 1
        }
        inputIndexes.push(indexes)
      }

      const filters: string[] = []
      for (
        let sceneIndex = 0;
        sceneIndex < request.scenes.length;
        sceneIndex += 1
      ) {
        const scene = request.scenes[sceneIndex]!
        const indexes = inputIndexes[sceneIndex]!
        const duration = scene.durationSeconds
        filters.push(
          `[${indexes.video}:v]scale=${request.width}:${request.height}:force_original_aspect_ratio=increase,crop=${request.width}:${request.height},fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},setpts=PTS-STARTPTS,setsar=1[v${sceneIndex}]`,
        )

        const hasAmbientAudio = audioPresence[sceneIndex] === true
        if (hasAmbientAudio) {
          filters.push(
            `[${indexes.video}:a]aresample=48000,volume=0.25,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[ambient${sceneIndex}]`,
          )
        }
        if (indexes.narration !== undefined) {
          const narrationDuration =
            narrationDurations[sceneIndex]
          const tempo =
            narrationDuration !== undefined &&
            narrationDuration > duration
              ? `${atempoFilter(narrationDuration / duration)},`
              : ''
          filters.push(
            `[${indexes.narration}:a]aresample=48000,${tempo}apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[voice${sceneIndex}]`,
          )
          filters.push(
            hasAmbientAudio
              ? `[ambient${sceneIndex}][voice${sceneIndex}]amix=inputs=2:duration=longest:normalize=0,atrim=duration=${duration}[a${sceneIndex}]`
              : `[voice${sceneIndex}]anull[a${sceneIndex}]`,
          )
        } else if (hasAmbientAudio) {
          filters.push(
            `[ambient${sceneIndex}]anull[a${sceneIndex}]`,
          )
        } else {
          filters.push(
            `anullsrc=channel_layout=stereo:sample_rate=48000:d=${duration}[a${sceneIndex}]`,
          )
        }
      }

      const concatInputs = request.scenes
        .map((_, index) => `[v${index}][a${index}]`)
        .join('')
      filters.push(
        `${concatInputs}concat=n=${request.scenes.length}:v=1:a=1[vconcat][aconcat]`,
      )
      if (request.subtitles) {
        filters.push(
          `[vconcat]subtitles='${escapeFilterPath(subtitlePath)}'[vout]`,
        )
      } else {
        filters.push('[vconcat]null[vout]')
      }

      args.push(
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[vout]',
        '-map',
        '[aconcat]',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        request.outputPath,
      )
      const composition = await dependencies.run(
        ffmpegBinary,
        args,
      )
      if (composition.exitCode !== 0) {
        throw new Error(
          `FFmpeg composition failed${composition.stderr.trim().length === 0 ? '' : `: ${composition.stderr.trim()}`}`,
        )
      }

      const duration = await probeDuration(
        dependencies,
        request.outputPath,
      )
      const expectedDuration = request.scenes.reduce(
        (total, scene) => total + scene.durationSeconds,
        0,
      )
      if (Math.abs(duration - expectedDuration) > 0.5) {
        throw new Error(
          `Composed video duration ${duration} did not match expected duration ${expectedDuration}`,
        )
      }

      return {
        durationSeconds: duration,
        mediaType: 'video/mp4',
        path: request.outputPath,
      }
    },
  }
}

function atempoFilter(ratio: number): string {
  const factors: number[] = []
  let remaining = ratio
  while (remaining > 2) {
    factors.push(2)
    remaining /= 2
  }
  factors.push(remaining)
  return factors
    .map((factor) => `atempo=${Number(factor.toFixed(4))}`)
    .join(',')
}

async function hasAudioStream(
  dependencies: FfmpegMediaComposerDependencies,
  path: string,
): Promise<boolean> {
  const result = await dependencies.run(dependencies.ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=index',
    '-of',
    'json',
    path,
  ])
  if (result.exitCode !== 0) {
    throw new Error(
      `FFprobe audio inspection failed${result.stderr.trim().length === 0 ? '' : `: ${result.stderr.trim()}`}`,
    )
  }
  let body: unknown
  try {
    body = JSON.parse(result.stdout)
  } catch {
    throw new Error('FFprobe audio inspection returned invalid JSON')
  }
  return (
    typeof body === 'object' &&
    body !== null &&
    'streams' in body &&
    Array.isArray(body.streams) &&
    body.streams.length > 0
  )
}

async function probeDuration(
  dependencies: FfmpegMediaComposerDependencies,
  path: string,
): Promise<number> {
  const result = await dependencies.run(dependencies.ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ])
  if (result.exitCode !== 0) {
    throw new Error(
      `FFprobe duration inspection failed${result.stderr.trim().length === 0 ? '' : `: ${result.stderr.trim()}`}`,
    )
  }
  const duration = Number(result.stdout.trim())
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      'FFprobe duration inspection returned an invalid duration',
    )
  }
  return duration
}

function createSrt(scenes: MediaCompositionScene[]): string {
  let start = 0
  let index = 1
  const entries: string[] = []
  for (const scene of scenes) {
    const end = start + scene.durationSeconds
    if (scene.narration.trim().length > 0) {
      entries.push(
        [
          String(index),
          `${srtTimestamp(start)} --> ${srtTimestamp(end)}`,
          scene.narration.trim(),
        ].join('\n'),
      )
      index += 1
    }
    start = end
  }
  return `${entries.join('\n\n')}\n`
}

function srtTimestamp(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000)
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor(
    (milliseconds % 3_600_000) / 60_000,
  )
  const remainingSeconds = Math.floor(
    (milliseconds % 60_000) / 1000,
  )
  const remainingMilliseconds = milliseconds % 1000
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(remainingSeconds, 2)},${pad(remainingMilliseconds, 3)}`
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

function replaceExtension(path: string, extension: string): string {
  const currentExtension = extname(path)
  return currentExtension.length === 0
    ? `${path}${extension}`
    : `${path.slice(0, -currentExtension.length)}${extension}`
}

function escapeFilterPath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
}

async function runProcess(
  command: string,
  args: string[],
): Promise<MediaProcessResult> {
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
