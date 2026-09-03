import {join, resolve} from 'node:path'

import {describe, expect, test} from 'vitest'

import type {
  MediaCompositionRequest,
  MediaComposer,
} from '../../src/media/media-composer.js'
import {createMediaCompositionStepHandler} from '../../src/workflow/media-composition-step.js'

describe('MediaCompositionStepHandler', () => {
  test('resolves scene artifacts and publishes one composed video', async () => {
    const requests: MediaCompositionRequest[] = []
    const generationDirectory = resolve(
      'workspace',
      'generations',
      '01EXPLAINER',
    )
    const composer: MediaComposer = {
      compose: async (request) => {
        requests.push(request)
        return {
          durationSeconds: 40,
          mediaType: 'video/mp4',
          path: request.outputPath,
        }
      },
    }
    const handler = createMediaCompositionStepHandler({
      composer,
      generationDirectory,
    })

    const result = await handler.execute(
      {
        height: 720,
        output: {
          id: 'final-video',
          path: 'outputs/explainer.mp4',
        },
        scenes: [
          {
            durationSeconds: 20,
            id: 'scene-1',
            narration: 'First scene.',
            narrationArtifactId: 'scene-1-voice',
            videoArtifactId: 'scene-1-video',
          },
          {
            durationSeconds: 20,
            id: 'scene-2',
            narration: 'Second scene.',
            narrationArtifactId: 'scene-2-voice',
            videoArtifactId: 'scene-2-video',
          },
        ],
        subtitlePath: 'working/subtitles/explainer.srt',
        subtitles: true,
        width: 1280,
      },
      {
        dependencyArtifacts: [
          {
            disposition: 'working',
            id: 'scene-1-video',
            mediaType: 'video/mp4',
            path: 'working/scenes/scene-1/video.mp4',
          },
          {
            disposition: 'working',
            id: 'scene-1-voice',
            mediaType: 'audio/mpeg',
            path: 'working/scenes/scene-1/voice.mp3',
          },
          {
            disposition: 'working',
            id: 'scene-2-video',
            mediaType: 'video/mp4',
            path: 'working/scenes/scene-2/video.mp4',
          },
          {
            disposition: 'working',
            id: 'scene-2-voice',
            mediaType: 'audio/mpeg',
            path: 'working/scenes/scene-2/voice.mp3',
          },
        ],
        dependencyOutputs: {},
      },
    )

    expect(requests).toEqual([
      {
        height: 720,
        outputPath: join(
          generationDirectory,
          'outputs',
          'explainer.mp4',
        ),
        scenes: [
          {
            durationSeconds: 20,
            id: 'scene-1',
            narration: 'First scene.',
            narrationPath: join(
              generationDirectory,
              'working',
              'scenes',
              'scene-1',
              'voice.mp3',
            ),
            videoPath: join(
              generationDirectory,
              'working',
              'scenes',
              'scene-1',
              'video.mp4',
            ),
          },
          {
            durationSeconds: 20,
            id: 'scene-2',
            narration: 'Second scene.',
            narrationPath: join(
              generationDirectory,
              'working',
              'scenes',
              'scene-2',
              'voice.mp3',
            ),
            videoPath: join(
              generationDirectory,
              'working',
              'scenes',
              'scene-2',
              'video.mp4',
            ),
          },
        ],
        subtitlePath: join(
          generationDirectory,
          'working',
          'subtitles',
          'explainer.srt',
        ),
        subtitles: true,
        width: 1280,
      },
    ])
    expect(result).toEqual({
      artifacts: [
        {
          disposition: 'output',
          id: 'final-video',
          mediaType: 'video/mp4',
          path: 'outputs/explainer.mp4',
        },
      ],
      output: {durationSeconds: 40},
    })
  })
})
