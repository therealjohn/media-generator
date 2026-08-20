import {describe, expect, test} from 'vitest'

import {
  createFfmpegMediaComposer,
  type MediaProcessResult,
} from '../../src/media/media-composer.js'

describe('FfmpegMediaComposer', () => {
  test('mixes scene narration, burns subtitles, and concatenates one final video', async () => {
    const calls: Array<{args: string[]; command: string}> = []
    const files = new Map<string, string>()
    const processResults: MediaProcessResult[] = [
      {
        exitCode: 0,
        stderr: '',
        stdout: '{"streams":[{"index":0}]}',
      },
      {
        exitCode: 0,
        stderr: '',
        stdout: '{"streams":[]}',
      },
      {
        exitCode: 0,
        stderr: '',
        stdout: '25.000000',
      },
      {
        exitCode: 0,
        stderr: '',
        stdout: '18.000000',
      },
      {exitCode: 0, stderr: '', stdout: ''},
      {exitCode: 0, stderr: '', stdout: '40.000000'},
    ]
    const composer = createFfmpegMediaComposer({
      ffmpegPath: 'ffmpeg-test',
      ffprobePath: 'ffprobe-test',
      run: async (command, args) => {
        calls.push({args, command})
        return processResults.shift()!
      },
      writeFile: async (path, contents) => {
        files.set(path, contents)
      },
    })

    const result = await composer.compose({
      height: 720,
      outputPath: 'C:\\workspace\\outputs\\explainer.mp4',
      scenes: [
        {
          durationSeconds: 20,
          id: 'scene-1',
          narration: 'First, define the agent.',
          narrationPath: 'C:\\workspace\\scene-1.mp3',
          videoPath: 'C:\\workspace\\scene-1.mp4',
        },
        {
          durationSeconds: 20,
          id: 'scene-2',
          narration: 'Then connect its tools.',
          narrationPath: 'C:\\workspace\\scene-2.mp3',
          videoPath: 'C:\\workspace\\scene-2.mp4',
        },
      ],
      subtitlePath:
        'C:\\workspace\\working\\subtitles\\explainer.srt',
      subtitles: true,
      width: 1280,
    })

    expect(result).toEqual({
      durationSeconds: 40,
      mediaType: 'video/mp4',
      path: 'C:\\workspace\\outputs\\explainer.mp4',
    })
    expect(calls.map((call) => call.command)).toEqual([
      'ffprobe-test',
      'ffprobe-test',
      'ffprobe-test',
      'ffprobe-test',
      'ffmpeg-test',
      'ffprobe-test',
    ])
    const ffmpegArgs = calls[4]?.args ?? []
    expect(ffmpegArgs).toContain('-filter_complex')
    expect(ffmpegArgs.join(' ')).toContain('concat=n=2:v=1:a=1')
    expect(ffmpegArgs.join(' ')).toContain('amix=inputs=2')
    expect(ffmpegArgs.join(' ')).toContain('atempo=1.25')
    expect(ffmpegArgs.join(' ')).toContain(
      'tpad=stop_mode=clone:stop_duration=20',
    )
    expect(ffmpegArgs.join(' ')).toContain(
      'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720',
    )
    expect(ffmpegArgs.join(' ')).toContain('setsar=1')
    expect(ffmpegArgs.join(' ')).toContain('subtitles=')
    expect(ffmpegArgs.at(-1)).toBe(
      'C:\\workspace\\outputs\\explainer.mp4',
    )
    expect(
      files.get(
        'C:\\workspace\\working\\subtitles\\explainer.srt',
      ),
    ).toContain(
      '00:00:00,000 --> 00:00:20,000\nFirst, define the agent.',
    )
    expect(
      files.get(
        'C:\\workspace\\working\\subtitles\\explainer.srt',
      ),
    ).toContain(
      '00:00:20,000 --> 00:00:40,000\nThen connect its tools.',
    )
  })

  test('surfaces composition failures', async () => {
    const processResults: MediaProcessResult[] = [
      {exitCode: 0, stderr: '', stdout: '{"streams":[]}'},
      {
        exitCode: 1,
        stderr: 'Invalid media stream',
        stdout: '',
      },
    ]
    const composer = createFfmpegMediaComposer({
      run: async () => processResults.shift()!,
      writeFile: async () => undefined,
    })

    await expect(
      composer.compose({
        height: 720,
        outputPath: 'C:\\workspace\\outputs\\explainer.mp4',
        scenes: [
          {
            durationSeconds: 20,
            id: 'scene-1',
            narration: '',
            videoPath: 'C:\\workspace\\scene-1.mp4',
          },
        ],
        subtitles: false,
        width: 1280,
      }),
    ).rejects.toThrow(
      'FFmpeg composition failed: Invalid media stream',
    )
  })
})
