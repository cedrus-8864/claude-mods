import { expect, mock, test } from 'claude-code/testing'

const GREEN = '#5fd75f'
// Written as code points, so the source holds no invisible character itself.
const ESC = String.fromCharCode(0x1b)
const RLO = String.fromCharCode(0x202e)
const ZWSP = String.fromCharCode(0x200b)
const BAND = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80 } as never

type Test = Parameters<Parameters<typeof test>[1]>
type Engine = Test[0]
type On = Test[1]

// What the engine under the mod answers, and what the test reads back from it.
function stubEngine(on: On) {
  const seen = { opened: [] as string[], ran: [] as string[][] }

  on('session.messages', () => ({ value: [] }))
  on('ui.open', (_$, e) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  const clock = mock.clock(on)
  on('process.run', (_$, e) => {
    seen.ran.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  return { ...seen, clock }
}

// Draws the band and presses its chord: the mode is on until the returned handle presses it again.
async function enter($: Engine) {
  const band = await $.ui.mount({ plugin: 'open-link', surface: 'terminal', component: 'AbovePrompt', props: BAND })

  await band.press({ key: 'chord' })

  return band
}

const labelsOf = async (row: { findAll: (q: { type: string }) => Promise<{ text: string; props: Record<string, unknown> }[]> }) =>
  (await row.findAll({ type: 'Text' })).filter(t => t.props.backgroundColor === GREEN).map(t => t.text)

test('the chord button sits beside the engine band and opens the pane', async ($, on) => {
  const seen = stubEngine(on)
  const band = await enter($)

  expect(await band.find({ text: 'engine' })).toBeDefined()
  expect(await band.find({ key: 'chord' })).toBeDefined()
  expect(seen.opened).toEqual(['open-link'])

  await band.press({ key: 'chord' })
})

test('a user message labels its URLs in green, first character replaced', async ($, on) => {
  stubEngine(on)
  const band = await enter($)
  const row = await $.ui.mount({
    plugin: 'open-link',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'see https://a.test/x and `https://b.test/y`.' } as never,
  })

  expect(await labelsOf(row)).toEqual(['0', '1'])

  await band.press({ key: 'chord' })
})

test('a Bash row labels the command and its stdout in one sequence', async ($, on) => {
  stubEngine(on)
  const band = await enter($)
  const row = await $.ui.mount({
    plugin: 'open-link',
    surface: 'terminal',
    component: 'ToolUse',
    props: {
      tool_use_id: 't1',
      tool: 'Bash',
      input: { command: 'echo https://c.test/z' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { stdout: 'https://c.test/z\n' },
    } as never,
  })

  expect(await labelsOf(row)).toEqual(['0', '1'])

  await band.press({ key: 'chord' })
})

test('a row off screen or without a URL is left to the engine', async ($, on) => {
  stubEngine(on)
  const band = await enter($)
  const plain = await $.ui.mount({ plugin: 'open-link', surface: 'terminal', component: 'UserMessage', props: { text: 'no links here' } as never })
  const away = await $.ui.mount({ plugin: 'open-link', surface: 'terminal', component: 'UserMessage', props: { text: 'https://d.test/', onScreen: null } as never })

  expect(await plain.find({ text: 'engine' })).toBeDefined()
  expect(await away.find({ text: 'engine' })).toBeDefined()

  await band.press({ key: 'chord' })
})

test('a row that arrives after the entry window is not numbered', async ($, on) => {
  const { clock } = stubEngine(on)
  const band = await enter($)
  const early = await $.ui.mount({ plugin: 'open-link', surface: 'terminal', component: 'UserMessage', props: { text: 'https://a.test/x' } as never })

  await clock.advance(400)

  const late = await $.ui.mount({ plugin: 'open-link', surface: 'terminal', component: 'UserMessage', props: { text: 'https://b.test/y' } as never })

  expect(await labelsOf(early)).toEqual(['0'])
  expect(await labelsOf(late)).toEqual([])

  await band.press({ key: 'chord' })
})

test('the pane cuts a long URL in its path, never in its host', async ($, on) => {
  stubEngine(on)

  const host = 'https://accounts.google.com.verify-login.evil.example'
  const url = `${host}/${'a'.repeat(80)}/end`

  const band = await enter($)
  await $.ui.mount({ plugin: 'open-link', surface: 'terminal', component: 'UserMessage', props: { text: url } as never })

  const pane = await $.ui.mount({
    plugin: 'open-link',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'open-link',
    props: { title: 'Links', isFocused: true, bodyColumns: 60 } as never,
  })
  const shown = (await pane.find({ key: 'hint:0' }))?.props.label as string

  expect(shown.startsWith(host)).toBe(true)
  expect(shown).toContain('…')
  expect(shown.endsWith('/end')).toBe(true)

  await band.press({ key: 'chord' })
})

test('a URL stops at a control or direction-changing character', async ($, on) => {
  stubEngine(on)

  const band = await enter($)
  const row = await $.ui.mount({
    plugin: 'open-link',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: ['https://a.test/x' + RLO + 'evil', 'https://b.test/' + ESC + '[31mred', 'https://c.test/y' + ZWSP + 'z'].join(' ') } as never,
  })
  const drawn = (await row.findAll({ type: 'Text' })).map(t => t.text).join('')

  expect(await labelsOf(row)).toEqual(['0', '1', '2'])
  expect(drawn).not.toMatch(new RegExp('[' + ESC + RLO + ZWSP + ']'))

  const pane = await $.ui.mount({
    plugin: 'open-link',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'open-link',
    props: { title: 'Links', isFocused: true, bodyColumns: 60 } as never,
  })
  const labels = await Promise.all(['hint:0', 'hint:1', 'hint:2'].map(async key => (await pane.find({ key }))?.props.label))

  expect(labels).toEqual(['https://a.test/x', 'https://b.test/', 'https://c.test/y'])

  await band.press({ key: 'chord' })
})

test('pressing a label in the pane opens that URL and ends the mode', async ($, on) => {
  const seen = stubEngine(on)

  await enter($)
  await $.ui.mount({ plugin: 'open-link', surface: 'terminal', component: 'UserMessage', props: { text: 'https://a.test/x https://b.test/y' } as never })

  const pane = await $.ui.mount({
    plugin: 'open-link',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'open-link',
    props: { title: 'Links', isFocused: true, bodyColumns: 60 } as never,
  })

  expect(await pane.find({ key: 'hint:1' })).toBeDefined()
  await pane.press({ key: 'hint:1' })

  expect(seen.ran).toHaveLength(1)
  expect(seen.ran[0].at(-1)).toBe('https://b.test/y')
})
