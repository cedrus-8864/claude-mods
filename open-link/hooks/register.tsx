import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage } from 'claude-code'

const isOn = atom({ plugin: 'open-link', key: 'isOn' } as const, false)

const PANE = 'open-link'
const LABELS = '0123456789abcdefghijklmnopqrstuvwxyz'
// Kitty's own hint colours: black on green.
const LABEL_BG = '#5fd75f'
// The dark theme's background for a user message and a tool row, as far as a screenshot shows; a light theme will differ.
const ROW_BG = '#373737'
// Not a markdown link target `](url)`, not inside a word; no closing quote, backtick or trailing punctuation. A URL in
// plain parentheses, `Fetch(https://...)`, or in a code span counts.
const URL_RE = /(?<!\w|\]\()https?:\/\/[^\s)>\]`"'<]*[^\s)>\]`"'<.,;:!?]/g
// An engine action nothing handles while the built-in diff mod is on; the person binds their chord to it in keybindings.json.
const CHORD_ACTION = 'app:toggleReplTab'
const LAST = Number.MAX_SAFE_INTEGER
// Tool rows the mod redraws with coloured labels: the name the row shows and the input field in its parentheses. Any
// other tool keeps the engine's row and is only listed in the pane. A Bash row shows at most RESULT_LINES lines of stdout.
const HEADERS: Record<string, { name: string; arg: string }> = {
  Bash: { name: 'Bash', arg: 'command' },
  WebFetch: { name: 'Fetch', arg: 'url' },
}
const RESULT_LINES = 10
// The longest URL the pane lists whole; a longer one is cut in the middle so each entry takes one row.
const FIT = 52
// Time enough for every row in view to report once; a fixed wait, not a signal that the rows are all in.
const FREEZE_AFTER_MS = 400

// What is in view that holds a URL, keyed by site and row, each with where it sits in the transcript. A render hook
// fills it, so the numbers a row draws depend on its neighbours: a change in the set redraws every site once (resync).
const shown = new Map<string, { rank: number; urls: string[] }>()
let lastSig = ''
// A row's place in the transcript never changes while the mode is on, so it is looked up once per row, and the saved
// messages once per burst: scrolling fast raises many onScreen changes, and reading 4096 messages for each made it stutter.
const ranks = new Map<string, number>()
let savedOnce: Promise<SessionMessage[]> | undefined
// Like kitty, the mode works on the screen as it was at entry: the transcript's scroll cannot be held still, and onScreen
// is only re-reported for rows at the viewport's edges, so tracking it afterwards leaves stale rows listed. Once frozen,
// no row is added or dropped, so the numbers stay put while the person scrolls; epoch tells a late timer it is stale.
let frozen = false
let epoch = 0

const inOrder = () => [...shown.values()].sort((a, b) => a.rank - b.rank)
const allUrls = () => inOrder().flatMap(m => m.urls).slice(0, LABELS.length)
const urlsOf = (text: string) => [...text.matchAll(URL_RE)].map(m => m[0])
const stdoutLines = (tool: string, output: unknown) => {
  const stdout = tool === 'Bash' ? (output as { stdout?: unknown } | null)?.stdout : undefined

  return typeof stdout === 'string' && stdout !== '' ? stdout.trimEnd().split('\n').slice(0, RESULT_LINES) : []
}
const argOf = (tool: string, input: unknown) => {
  const value = HEADERS[tool] && (input as Record<string, unknown> | null)?.[HEADERS[tool].arg]

  return typeof value === 'string' ? value : undefined
}
// The scheme and host (with any user@ part) are never cut: the person decides from them, and a cut through a long host
// would show a trusted-looking prefix of an address that belongs to someone else.
const fit = (url: string) => {
  const origin = /^https?:\/\/[^/?#]*/.exec(url)?.[0] ?? ''
  const rest = url.slice(origin.length)
  const room = Math.max(FIT - origin.length, 8)

  if (rest.length <= room) return url

  const head = Math.floor((room - 1) / 2)

  return `${origin}${rest.slice(0, head)}…${rest.slice(-(room - 1 - head))}`
}

// How many URLs in view come before this row's.
const offsetOf = (key: string) => {
  const mine = shown.get(key)
  let n = 0

  for (const m of inOrder()) {
    if (m === mine) break
    n += m.urls.length
  }

  return n
}

function forget() {
  shown.clear()
  ranks.clear()
  savedOnce = undefined
  lastSig = ''
  frozen = false
  epoch += 1
}

// Every string of a value, in a fixed order (arrays by index, objects by key).
function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach(v => stringsIn(v, out))
  else if (value !== null && typeof value === 'object') Object.values(value).forEach(v => stringsIn(v, out))

  return out
}

// The label takes the URL's first character, as kitty draws it, so nothing shifts. Plain text, for a surface whose
// own component draws the string and cannot colour a part of it.
function relabel(text: string, n: { at: number }) {
  return text.replace(URL_RE, url => {
    const label = LABELS[n.at]

    n.at += 1

    return label === undefined ? url : label + url.slice(1)
  })
}

// The same in colour: the text before and after a URL is dimmed, the label drawn black on green, the rest of the URL
// bright. Empty when no URL is labelled. n.at runs on across calls.
function segments(Text: (props: Record<string, unknown>) => JSX.Element, text: string, n: { at: number }) {
  const parts: JSX.Element[] = []
  let at = 0

  for (const m of text.matchAll(URL_RE)) {
    const label = LABELS[n.at]

    n.at += 1

    if (label === undefined) continue

    if (m.index > at) parts.push(<Text dimColor>{text.slice(at, m.index)}</Text>)
    parts.push(<Text color="#000000" backgroundColor={LABEL_BG} bold>{label}</Text>)
    parts.push(<Text>{m[0].slice(1)}</Text>)
    at = m.index + m[0].length
  }

  if (parts.length > 0 && at < text.length) parts.push(<Text dimColor>{text.slice(at)}</Text>)

  return parts
}

// A message's place in the transcript: its index, then where in it the row sits (text before tool calls).
const rankText = (saved: SessionMessage[], role: 'user' | 'assistant', text: string) => {
  const i = saved.findIndex(m => m.role === role && m.text.includes(text))

  return i === -1 ? LAST : i * 1e6 + saved[i].text.indexOf(text)
}
const rankToolUse = (saved: SessionMessage[], id: string) => {
  const i = saved.findIndex(m => m.toolUses.some(t => t.tool_use_id === id))

  return i === -1 ? LAST : i * 1e6 + 5e5 + saved[i].toolUses.findIndex(t => t.tool_use_id === id)
}

function resync($: EngineInterface) {
  if (frozen) return

  const sig = [...shown].map(([key, m]) => `${key}:${m.rank}:${m.urls.length}`).sort().join('|')

  if (sig !== lastSig) {
    lastSig = sig
    $.ui.invalidate('ui.render')
  }
}

// Registers what a row in view holds, or forgets the row once it scrolls out or loses its URLs.
async function track($: EngineInterface, key: string, isInView: boolean, urls: string[], rank: (saved: SessionMessage[]) => number) {
  if (frozen) return

  if (isInView && urls.length > 0) {
    let at = ranks.get(key)

    if (at === undefined) {
      savedOnce = savedOnce ?? $.session.messages()
      at = rank(await savedOnce)
      ranks.set(key, at)
    }

    shown.set(key, { rank: at, urls })
  } else {
    shown.delete(key)
  }

  resync($)
}

// Ends the mode: forgets what was in view, switches the labels off, closes the pane.
async function stop($: EngineInterface) {
  forget()
  await update($, isOn, () => false)
  await $.ui.close({ id: PANE })
}

// The chord and /hints both land here.
async function toggle($: EngineInterface) {
  if (await read($, isOn)) {
    await stop($)

    return
  }

  await update($, isOn, () => true)
  await $.ui.open({ id: PANE, title: 'Links', focus: true, closeOnEscape: true, rows: 8, columns: 60 })

  const entry = epoch

  $.clock.after(FREEZE_AFTER_MS, () => {
    if (epoch === entry) frozen = true
  })
}

async function openUrl($: EngineInterface, url: string) {
  await stop($)

  // The URL is the script's $0, never part of the script text. A mod has no `process.platform`, so the shell picks the opener.
  const { exitCode, stderr } = await $.process.run(['sh', '-c', 'if [ "$(uname)" = Darwin ]; then open "$0"; else xdg-open "$0"; fi', url])

  $.ui.toast(exitCode === 0 ? `Opened ${url}` : `Could not open ${url}: ${stderr}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hints', description: 'Label the links in view; press a key to open one.' })

    return next(e)
  })

  on('command.run', { command: 'hints' }, async $ => {
    await toggle($)

    // Prints nothing in the transcript.
    return {}
  })

  // Esc: the mode ends with the pane.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    forget()
    await update($, isOn, () => false)

    return next(e)
  })

  // Rows the engine draws report their URLs. onScreen is null once scrolled out of view, absent on a surface that does
  // not say (counted as in view).
  //
  // A user message is redrawn by the mod so its labels can carry colour, which costs the engine's own styling of the
  // row (pasted-text colour, image placeholders).
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await read($, isOn))) {
      return next(e)
    }

    const key = `user:${e.requestId}`

    await track($, key, e.props.onScreen !== null, urlsOf(e.props.text), saved => rankText(saved, 'user', e.props.text))

    if (!shown.has(key)) {
      return next(e)
    }

    const n = { at: offsetOf(key) }
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box backgroundColor={ROW_BG} paddingRight={1}>
        <Text dimColor>{'❯ '}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {e.props.text.split('\n').map(line => {
            const parts = segments(Text, line, n)

            return <Text>{parts.length > 0 ? parts : line === '' ? ' ' : line}</Text>
          })}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!(await read($, isOn))) {
      return next(e)
    }

    const key = `command:${e.requestId}`

    await track($, key, true, urlsOf(e.props.text), () => LAST)

    return shown.has(key) ? next({ ...e, props: { ...e.props, text: relabel(e.props.text, { at: offsetOf(key) }) } }) : next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, isOn))) {
      return next(e)
    }

    const key = `use:${e.requestId}`
    const arg = argOf(e.props.tool, e.props.input)
    const lines = arg === undefined ? [] : stdoutLines(e.props.tool, e.props.output)

    // Relabelling `input` makes the engine drop the whole row (a url that no longer validates), so a row with a known
    // header is redrawn here, result included (a Bash result is drawn by this row, not by a ToolResult), and any other
    // is only listed in the pane. A ToolResult is never read: its `output` holds far more than its row shows.
    await track($, key, e.props.onScreen !== null, arg === undefined ? stringsIn(e.props.input).flatMap(urlsOf) : urlsOf([arg, ...lines].join('\n')), saved =>
      rankToolUse(saved, e.props.tool_use_id),
    )

    if (arg === undefined || !shown.has(key)) {
      return next(e)
    }

    const n = { at: offsetOf(key) }
    const { Box, Text } = $.ui.resolve(e)
    const head = segments(Text, arg, n)
    const dot = e.props.isErrored ? 'red' : e.props.isRunning ? undefined : 'green'
    const rows = [
      <Text>
        <Text color={dot} dimColor={e.props.isRunning}>{'● '}</Text>
        <Text bold>{HEADERS[e.props.tool].name}</Text>
        <Text>(</Text>
        {head.length > 0 ? head : arg}
        <Text>)</Text>
      </Text>,
    ]

    if (lines.length > 0) {
      rows.push(
        <Box>
          <Text dimColor>{'  ⎿  '}</Text>
          <Box flexDirection="column" flexGrow={1}>
            {lines.map(line => {
              const parts = segments(Text, line, n)

              return <Text>{parts.length > 0 ? parts : line === '' ? ' ' : line}</Text>
            })}
          </Box>
        </Box>,
      )
    }

    return (
      <Box backgroundColor={ROW_BG} flexDirection="column">
        {rows}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, isOn))) {
      return next(e)
    }

    const key = `assistant:${e.requestId}`

    await track($, key, e.props.onScreen !== null, urlsOf(e.props.text), saved => rankText(saved, 'assistant', e.props.text))

    if (!shown.has(key)) {
      return next(e)
    }

    const n = { at: offsetOf(key) }
    const { Box, Markdown, Text } = $.ui.resolve(e)

    // Markdown cannot colour one character, so a block holding a URL is drawn as plain Text while the mode is on.
    const blocks = e.props.text.split(/\n{2,}/).map((block, i) => {
      const parts = segments(Text, block, n)

      return (
        <Box marginTop={i === 0 ? 0 : 1}>
          {parts.length > 0 ? <Text>{parts}</Text> : <Markdown text={block} dimColor />}
        </Box>
      )
    })

    return <Box flexDirection="column">{blocks}</Box>
  })

  // The chord's landing place: a Button the band always holds, drawn zero rows high, beside whatever the band already shows.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button } = $.ui.resolve(e)
    const band = await next(e)
    const chord = (
      <Box height={0} overflow="hidden">
        <Button key="chord" label=" " action={CHORD_ACTION} onPress={() => toggle($)} />
      </Box>
    )

    return band ? <Box flexDirection="column">{band}{chord}</Box> : chord
  })

  // The pane holds the focus the label keys need; its list shows what each label opens.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const urls = allUrls()

    return (
      <Box flexDirection="column">
        <Text dimColor>{`${urls.length} links · press a label · Esc to exit`}</Text>
        {/* One row clips the line to the pane's width, whatever it is. */}
        <Box height={1} overflow="hidden">
          <Text dimColor>{'─'.repeat(200)}</Text>
        </Box>
        {urls.map((url, i) => (
          <Button key={`hint:${LABELS[i]}`} label={fit(url)} hotkey={LABELS[i]} plain onPress={() => openUrl($, url)} />
        ))}
      </Box>
    )
  })
}
