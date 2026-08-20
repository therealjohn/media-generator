import {describe, expect, test} from 'vitest'

import {
  createFfmpegImageNormalizer,
  type ImageProcessResult,
} from '../../src/media/image-normalizer.js'

describe('FfmpegImageNormalizer', () => {
  test('normalizes an image to exact Sora dimensions', async () => {
    const calls: Array<{args: string[]; command: string}> = []
    const normalizer = createFfmpegImageNormalizer({
      ffmpegPath: 'ffmpeg-test',
      run: async (command, args) => {
        calls.push({args, command})
        return {exitCode: 0, stderr: '', stdout: ''}
      },
    })

    await normalizer.normalize({
      height: 720,
      inputPath: 'C:\\workspace\\style.png',
      outputPath: 'C:\\workspace\\style-sora.png',
      width: 1280,
    })

    expect(calls).toEqual([
      {
        args: [
          '-y',
          '-i',
          'C:\\workspace\\style.png',
          '-vf',
          'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1',
          '-frames:v',
          '1',
          'C:\\workspace\\style-sora.png',
        ],
        command: 'ffmpeg-test',
      },
    ])
  })

  test('surfaces image normalization failures', async () => {
    const failure: ImageProcessResult = {
      exitCode: 1,
      stderr: 'Invalid image',
      stdout: '',
    }
    const normalizer = createFfmpegImageNormalizer({
      ffmpegPath: 'ffmpeg-test',
      run: async () => failure,
    })

    await expect(
      normalizer.normalize({
        height: 720,
        inputPath: 'C:\\workspace\\style.png',
        outputPath: 'C:\\workspace\\style-sora.png',
        width: 1280,
      }),
    ).rejects.toThrow(
      'FFmpeg image normalization failed: Invalid image',
    )
  })
})
