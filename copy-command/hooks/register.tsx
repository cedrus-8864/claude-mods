import { atom, memberOf, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const SHELL = /^(|sh|bash|shell|zsh|fish|console|terminal)$/i
const FENCE = /^```([\w-]*)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm
// A faint lift on a dark terminal; the one colour to change for another theme.
const HOVER_BG = '#2b303b'
const BACKTICKS = /`+/g
// A bare program name, lowercase first: a capital starts a sentence, and a case-insensitive file system would find "Test" as `test`.
// Anything else (a leading dash, shell syntax) is never looked up.
const PROGRAM = /^[a-z0-9][\w.+-]*$/
const PATH_LIKE = /^(\.{1,2}|~)\//
// ponytail: one lookup per program until the module reloads; a program installed later stays "missing" until then.
const onPath = new Map<string, Promise<boolean>>()
// More commands than this fold behind a toggle.
const FOLD_AFTER = 5
const VIETNAMESE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i

const TEXT = {
  en: {
    header: 'Commands to copy',
    more: (n: number) => `Show ${n} more`,
    less: 'Collapse',
    copied: 'Copied',
    failed: 'Copy failed',
  },
  vi: {
    header: 'Các lệnh để sao chép',
    more: (n: number) => `Xem thêm ${n} lệnh`,
    less: 'Thu gọn',
    copied: 'Đã sao chép',
    failed: 'Sao chép thất bại',
  },
}

// Claude Code's own `language` setting wins; unset, the reply's own text decides. Other languages fall back to English.
const pickText = (setting: unknown, reply: string) => {
  const isVietnamese = typeof setting === 'string' && setting !== '' ? /^(vi|vietnam|tiếng việt)/i.test(setting) : VIETNAMESE.test(reply)

  return isVietnamese ? TEXT.vi : TEXT.en
}

const isExpanded = atom({ plugin: 'copy-command', key: 'isExpanded' } as const, false)

type Part = { kind: 'prose' | 'command'; text: string }

// Splits a reply into prose and shell fences; a fence still streaming has no closing line, so stays prose.
const split = (text: string): Part[] => {
  const parts: Part[] = []
  let at = 0

  for (const m of text.matchAll(FENCE)) {
    if (!SHELL.test(m[1])) continue
    parts.push({ kind: 'prose', text: text.slice(at, m.index) })
    parts.push({ kind: 'command', text: m[2].replace(/\n$/, '') })
    at = m.index + m[0].length
  }

  parts.push({ kind: 'prose', text: text.slice(at) })

  return parts.filter(p => p.text.trim() !== '')
}

// Code spans per CommonMark: a run of N backticks opens a span and the next run of exactly N closes it,
// so a stray "```" inside a line cannot re-pair the single backticks around it. An unmatched run is plain text.
const codeSpans = (text: string): string[] => {
  const runs = [...text.matchAll(BACKTICKS)].filter(m => text[m.index - 1] !== '\\')
  const spans: string[] = []

  for (let i = 0; i < runs.length; i++) {
    const close = runs.findIndex((r, k) => k > i && r[0].length === runs[i][0].length)

    if (close === -1) continue

    spans.push(text.slice(runs[i].index + runs[i][0].length, runs[close].index))
    i = close
  }

  return spans
}

// The program a span would run, when the span is a whole command: one line with an argument, not truncated ("npx wrangler …").
const programOf = (span: string): string | undefined => {
  const words = span.replace(/^\$ /, '').split(/\s+/)
  const first = words.findIndex(w => !/^[A-Z_][A-Z0-9_]*=/.test(w))
  const [program, ...args] = first === -1 ? [] : words.slice(first)

  if (!program || args.length === 0 || span.includes('\n') || words.some(w => w === '…' || w === '...')) {
    return undefined
  }

  return program
}

// [span, program] of a prose part's command-shaped spans; other fences (ts, json...) are skipped so their backticks do not count.
const candidateSpans = (prose: string): [string, string][] =>
  codeSpans(prose.replace(FENCE, '')).flatMap(s => {
    const span = s.trim()
    const program = programOf(span)

    return program === undefined ? [] : [[span, program]]
  })

// "$ npm i" copies as "npm i" when every line carries the prompt.
const toCopy = (src: string): string => {
  const lines = src.split('\n').filter(l => l.trim() !== '')

  return lines.every(l => l.startsWith('$ ')) ? src.replace(/^\$ /gm, '') : src
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const parts = split(e.props.text)
    // One list for the whole reply, drawn last: a list after each prose part would cut in between a lead-in line and its shell block.
    const candidates = new Map(parts.flatMap(p => (p.kind === 'prose' ? candidateSpans(p.text) : [])))

    if (candidates.size === 0 && !parts.some(p => p.kind === 'command')) {
      return next(e)
    }

    // `command -v` says whether a program exists without running it; the name is its $1, never spliced into the script.
    const hasProgram = (program: string): Promise<boolean> => {
      if (PATH_LIKE.test(program)) return Promise.resolve(true)
      if (!PROGRAM.test(program)) return Promise.resolve(false)

      let known = onPath.get(program)

      if (!known) {
        known = $.process.run(['sh', '-c', 'command -v "$1"', 'sh', program]).then(
          r => r.exitCode === 0,
          () => {
            onPath.delete(program)

            return false
          },
        )
        onPath.set(program, known)
      }

      return known
    }

    const entries = [...candidates]
    const found = await Promise.all(entries.map(([, program]) => hasProgram(program)))
    const spans = entries.filter((_, i) => found[i]).map(([span]) => span)

    const t = pickText((await $.settings.read()).language, e.props.text)
    const isFolded = spans.length > FOLD_AFTER
    // Written inline: validate reads state sources statically.
    const isOpen = isFolded && (await read($, memberOf(isExpanded, { requestId: e.requestId })))
    const shown = isFolded && !isOpen ? spans.slice(0, FOLD_AFTER) : spans

    const { Box, Button, Code, Markdown, Text } = $.ui.resolve(e)

    // One hover group per command. A scope is shared across the whole transcript, so it carries the message id.
    const lit = (key: string) => ({ scope: `${e.requestId}:${key}`.slice(-64), backgroundColor: HOVER_BG })

    const copyButton = (key: string, text: string) => (
      <Button
        key={key}
        label={' \u29C9 '}
        plain
        dimColor
        hover={lit(key)}
        onPress={async press => {
          const { isCopied } = await $.ui.copy({ text, surface: press.surface })
          $.ui.toast(isCopied ? t.copied : t.failed)
        }}
      />
    )

    return (
      <Box flexDirection="column">
        {parts.map((p, i) => {
          if (p.kind === 'command') {
            const key = `copy:${i}`
            // The button sits on the last line: that line is its own row, so no cross-axis alignment is relied on.
            const lines = p.text.split('\n')
            const head = lines.slice(0, -1).join('\n')
            const pad = { paddingLeft: 1, paddingRight: 1, hover: lit(key) }

            return (
              <Box flexDirection="column" alignSelf="flex-start" marginY={1}>
                {head !== '' && (
                  <Box {...pad}>
                    <Code source={head} language="bash" />
                  </Box>
                )}
                <Box flexDirection="row">
                  <Box {...pad}>
                    <Code source={lines[lines.length - 1]} language="bash" />
                  </Box>
                  {copyButton(key, toCopy(p.text))}
                </Box>
              </Box>
            )
          }

          return <Markdown text={p.text} />
        })}
        {spans.length > 0 && (
          // The border sets the command list apart from the reply above it.
          <Box flexDirection="column" alignSelf="flex-start" marginTop={1} paddingX={1} borderStyle="round" borderDimColor>
            <Text dimColor>{`${t.header}:`}</Text>
            <Box flexDirection="column">
              {shown.map((s, j) => {
                const key = `copy:inline:${j}`

                return (
                  <Box flexDirection="row" alignSelf="flex-start" hover={lit(key)}>
                    <Text dimColor hover={lit(key)}>{` ${s} `}</Text>
                    {copyButton(key, s)}
                  </Box>
                )
              })}
              {isFolded && (
                <Button
                  key="fold"
                  label={isOpen ? ` \u25B4 ${t.less}` : ` \u25BE ${t.more(spans.length - FOLD_AFTER)}`}
                  plain
                  dimColor
                  onPress={() => update($, memberOf(isExpanded, { requestId: e.requestId }), v => !v)}
                />
              )}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
