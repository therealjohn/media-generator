import {describe, expect, test, vi} from 'vitest'

import {createReferenceFilePicker} from '../../../src/adapters/http/reference-file-picker.js'

describe('ReferenceFilePicker', () => {
  test('opens the Windows picker with a source-video filter', async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout:
        '["C:\\\\media\\\\interview.mp4","C:\\\\media\\\\demo.mov"]',
    })
    const pick = createReferenceFilePicker({
      platform: 'win32',
      run,
    })

    await expect(
      pick({
        extensions: ['.mp4', '.mov'],
        multiple: false,
        title: 'Choose source video',
      }),
    ).resolves.toEqual([
      'C:\\media\\interview.mp4',
      'C:\\media\\demo.mov',
    ])
    expect(run).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-STA', '-Command']),
    )
    const script = run.mock.calls[0]![1].at(-1)
    expect(script).toContain('$dialog.Multiselect = $false')
    expect(script).toContain('*.mp4;*.mov')
  })

  test('parses macOS paths and treats cancellation as no selection', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 0,
        stderr: '',
        stdout: '/media/first.png\n/media/second.png\n',
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stderr: 'execution error: User canceled. (-128)',
        stdout: '',
      })
    const pick = createReferenceFilePicker({
      platform: 'darwin',
      run,
    })

    await expect(
      pick({multiple: true, title: 'Choose reference files'}),
    ).resolves.toEqual(['/media/first.png', '/media/second.png'])
    await expect(
      pick({multiple: true, title: 'Choose reference files'}),
    ).resolves.toEqual([])
  })
})
