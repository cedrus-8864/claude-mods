import { atom, memberOf, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const SHELL = /^(|sh|bash|shell|zsh|fish|console|terminal)$/i
const FENCE = /^```([\w-]*)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm
// A faint lift on a dark terminal; the one colour to change for another theme.
const HOVER_BG = '#2b303b'
const INLINE = /`([^`\n]+)`/g
// Sets the command list apart from the reply above it.
const RULE = '──────────'
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

// Inline spans of a prose part, deduped, multi-word only (a lone word is a name or path, not a command);
// other fences (ts, json...) are skipped so their backticks do not count.
const inlineSpans = (prose: string): string[] => {
  const bare = prose.replace(FENCE, '')

  return [...new Set([...bare.matchAll(INLINE)].map(m => m[1].trim()).filter(s => /\s/.test(s)))]
}

// "$ npm i" copies as "npm i" when every line carries the prompt.
const toCopy = (src: string): string => {
  const lines = src.split('\n').filter(l => l.trim() !== '')

  return lines.every(l => l.startsWith('$ ')) ? src.replace(/^\$ /gm, '') : src
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const parts = split(e.props.text)
    const hasWork = parts.some(p => p.kind === 'command' || inlineSpans(p.text).length > 0)

    if (!hasWork) {
      return next(e)
    }

    const t = pickText((await $.settings.read()).language, e.props.text)
    // One fold per paragraph's command list, keyed by message and paragraph. Written inline: validate reads state sources statically.
    const open = new Map<number, boolean>()

    for (const [i, p] of parts.entries()) {
      if (p.kind === 'prose' && inlineSpans(p.text).length > FOLD_AFTER) {
        open.set(i, await read($, memberOf(isExpanded, { requestId: `${e.requestId}:${i}` })))
      }
    }

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
              <Box flexDirection="column" alignSelf="flex-start">
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

          const spans = inlineSpans(p.text)
          const isFolded = spans.length > FOLD_AFTER
          const isOpen = open.get(i) === true
          const shown = isFolded && !isOpen ? spans.slice(0, FOLD_AFTER) : spans

          return (
            <Box flexDirection="column">
              <Markdown text={p.text} />
              {spans.length > 0 && (
                <Box flexDirection="column" alignSelf="flex-start" marginTop={1}>
                  <Text dimColor>{RULE}</Text>
                  <Text dimColor>{`${t.header}:`}</Text>
                  <Box flexDirection="column" paddingLeft={1}>
                    {shown.map((s, j) => {
                      const key = `copy:${i}:${j}`

                      return (
                        <Box flexDirection="row" alignSelf="flex-start" hover={lit(key)}>
                          <Text dimColor hover={lit(key)}>{` ${s} `}</Text>
                          {copyButton(key, s)}
                        </Box>
                      )
                    })}
                    {isFolded && (
                      <Button
                        key={`fold:${i}`}
                        label={isOpen ? ` \u25B4 ${t.less}` : ` \u25BE ${t.more(spans.length - FOLD_AFTER)}`}
                        plain
                        dimColor
                        onPress={() => update($, memberOf(isExpanded, { requestId: `${e.requestId}:${i}` }), v => !v)}
                      />
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
