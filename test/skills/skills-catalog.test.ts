import {describe, expect, test} from 'vitest'

import {getSkillContent} from '../../src/adapters/skills/skills-catalog.js'

describe('getSkillContent', () => {
  test.each([
    ['initialize', undefined, 'mg init'],
    ['configure', 'foundry', 'mg configure foundry'],
    ['configure', 'speech', 'mg configure speech'],
    ['generate', 'video', 'mg generate video'],
    ['create', 'explainer-video', 'mg create explainer-video'],
    ['create', 'short-form-video', 'mg create short-form-video'],
    ['scenarios', undefined, 'mg scenarios list'],
    ['inspect', 'generations', 'mg generations list'],
    ['export', undefined, 'mg generations export'],
    ['troubleshoot', undefined, 'mg doctor'],
  ])(
    'returns focused %s guidance',
    (action, reference, expectedCommand) => {
      expect(getSkillContent(action, reference)).toContain(
        expectedCommand,
      )
    },
  )

  test('returns focused image generation guidance', () => {
    const content = getSkillContent('generate', 'image')

    expect(content).toContain('mg generate image')
    expect(content).toContain('--prompt')
    expect(content).toContain('--style')
    expect(content).toContain('--reference')
    expect(content).toContain('--link')
    expect(content).toContain('read the URL')
    expect(content).not.toContain('## Actions')
  })

  test('lists the current action and reference catalog', () => {
    const content = getSkillContent()

    expect(content).toContain('initialize')
    expect(content).toContain('configure')
    expect(content).toContain('generate')
    expect(content).toContain('create')
    expect(content).toContain('scenarios')
    expect(content).toContain('inspect')
    expect(content).toContain('export')
    expect(content).toContain('troubleshoot')
    expect(content).toContain('mg skills generate image')
    expect(content).toContain('mg skills create explainer-video')
  })
})
