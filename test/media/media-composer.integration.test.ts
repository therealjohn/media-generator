import {execFile} from 'node:child_process'
import {mkdtemp, rm, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'

import ffmpegPath from 'ffmpeg-static'
import {afterEach, describe, expect, test} from 'vitest'

import {createFfmpegMediaComposer} from '../../src/media/media-composer.js'

const execute = promisify(execFile)
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {force: true, recursive: true}),
    ),
  )
})

describe('FfmpegMediaComposer integration', () => {
  test('composes real clips and narration with the bundled binaries', async () => {
    if (ffmpegPath === null) {
      throw new Error('Bundled FFmpeg is unavailable')
    }
    const directory = await mkdtemp(
      join(tmpdir(), 'media-gen-composer-'),
    )
    temporaryDirectories.push(directory)
    const firstVideo = join(directory, 'first.mp4')
    const secondVideo = join(directory, 'second.mp4')
    const firstVoice = join(directory, 'first.mp3')
    const secondVoice = join(directory, 'second.mp3')
    const outputPath = join(directory, 'output.mp4')

    await Promise.all([
      createVideo(ffmpegPath, firstVideo, 'red', 440),
      createVideo(ffmpegPath, secondVideo, 'blue', 550),
      createVoice(ffmpegPath, firstVoice, 880, 1.2),
      createVoice(ffmpegPath, secondVoice, 990, 0.8),
    ])
    const composer = createFfmpegMediaComposer()

    const result = await composer.compose({
      height: 180,
      outputPath,
      scenes: [
        {
          durationSeconds: 1,
          id: 'scene-1',
          narration: 'First scene.',
          narrationPath: firstVoice,
          videoPath: firstVideo,
        },
        {
          durationSeconds: 1,
          id: 'scene-2',
          narration: 'Second scene.',
          narrationPath: secondVoice,
          videoPath: secondVideo,
        },
      ],
      subtitles: true,
      width: 320,
    })

    expect(result.durationSeconds).toBeCloseTo(2, 1)
    expect(result).toMatchObject({
      mediaType: 'video/mp4',
      path: outputPath,
    })
    expect((await stat(outputPath)).size).toBeGreaterThan(0)
  }, 20_000)
})

async function createVideo(
  binary: string,
  path: string,
  color: string,
  frequency: number,
): Promise<void> {
  await execute(binary, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=320x180:d=1`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${frequency}:duration=1`,
    '-shortest',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    path,
  ])
}

async function createVoice(
  binary: string,
  path: string,
  frequency: number,
  duration: number,
): Promise<void> {
  await execute(binary, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${frequency}:duration=${duration}`,
    '-q:a',
    '6',
    path,
  ])
}
