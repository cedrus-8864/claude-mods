import { expect, test } from 'claude-code/testing'

const shell = 'Run:\n\n```bash\n$ npm install\n```\n\nthen done.'
const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(s => `\`npm run ${s}\``).join(' ')

for (const surface of ['terminal', 'desktop'] as const) {
  test(`copy button copies the command without its prompt (${surface})`, async ($, on) => {
    const copied: string[] = []
    on('settings.read', () => ({ value: {} }))
    on('ui.copy', (_$, e) => {
      copied.push(e.text)
      return { value: { isCopied: true } }
    })

    const ui = await $.ui.mount({
      plugin: 'copy-command',
      surface,
      component: 'AssistantMessage',
      props: { text: shell, isFirstOfReply: true },
    })

    expect(await ui.find({ key: 'copy:1' })).toBeDefined()
    await ui.press({ key: 'copy:1' })
    expect(copied).toEqual(['npm install'])
  })

  test(`engine draws a reply without a shell fence (${surface})`, async ($, on) => {
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })

    const ui = await $.ui.mount({
      plugin: 'copy-command',
      surface,
      component: 'AssistantMessage',
      props: { text: '```ts\nconst a = 1\n```', isFirstOfReply: true },
    })

    expect(await ui.find({ key: 'copy:1' })).toBeUndefined()
  })

  test(`inline code gets its own copy button (${surface})`, async ($, on) => {
    const copied: string[] = []
    on('settings.read', () => ({ value: {} }))
    on('ui.copy', (_$, e) => {
      copied.push(e.text)
      return { value: { isCopied: true } }
    })

    const ui = await $.ui.mount({
      plugin: 'copy-command',
      surface,
      component: 'AssistantMessage',
      props: { text: 'Use `git status` then `git status`, `name` and `ls -la`.\n\n```ts\nconst a = `x`\n```', isFirstOfReply: true },
    })

    expect(await ui.find({ key: 'copy:inline:1' })).toBeDefined()
    expect(await ui.find({ key: 'copy:inline:2' })).toBeUndefined()
    await ui.press({ key: 'copy:inline:1' })
    expect(copied).toEqual(['ls -la'])
  })

  test(`more than five commands fold behind a toggle (${surface})`, async ($, on) => {
    on('settings.read', () => ({ value: {} }))

    const ui = await $.ui.mount({
      plugin: 'copy-command',
      surface,
      component: 'AssistantMessage',
      props: { text: seven, isFirstOfReply: true },
    })

    expect(await ui.find({ key: 'copy:inline:4' })).toBeDefined()
    expect(await ui.find({ key: 'copy:inline:5' })).toBeUndefined()

    await ui.press({ key: 'fold' })
    expect(await ui.find({ key: 'copy:inline:6' })).toBeDefined()

    await ui.press({ key: 'fold' })
    expect(await ui.find({ key: 'copy:inline:5' })).toBeUndefined()
  })

  test(`five commands or fewer have no toggle (${surface})`, async ($, on) => {
    on('settings.read', () => ({ value: {} }))

    const ui = await $.ui.mount({
      plugin: 'copy-command',
      surface,
      component: 'AssistantMessage',
      props: { text: '`npm run a` `npm run b` `npm run c` `npm run d` `npm run e`', isFirstOfReply: true },
    })

    expect(await ui.find({ key: 'copy:inline:4' })).toBeDefined()
    expect(await ui.find({ key: 'fold' })).toBeUndefined()
  })
}

test('the language setting picks the toggle label', async ($, on) => {
  on('settings.read', () => ({ value: { language: 'vietnamese' } }))

  const ui = await $.ui.mount({
    plugin: 'copy-command',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: seven, isFirstOfReply: true },
  })

  expect(JSON.stringify(await ui.drawn())).toContain('Xem thêm 2 lệnh')
})

test('without a language setting the reply text decides', async ($, on) => {
  on('settings.read', () => ({ value: {} }))

  const ui = await $.ui.mount({
    plugin: 'copy-command',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: `Chạy các lệnh sau: ${seven}`, isFirstOfReply: true },
  })

  expect(JSON.stringify(await ui.drawn())).toContain('Các lệnh để sao chép:')
})

test('a rule sits above the command list header', async ($, on) => {
  on('settings.read', () => ({ value: {} }))

  const ui = await $.ui.mount({
    plugin: 'copy-command',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: 'Run `git status`.', isFirstOfReply: true },
  })

  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn.indexOf('──────────')).toBeGreaterThan(-1)
  expect(drawn.indexOf('──────────')).toBeLessThan(drawn.indexOf('Commands to copy:'))
})

test('only real commands are listed, even when a reply has stray backtick runs', async ($, on) => {
  const copied: string[] = []
  on('settings.read', () => ({ value: {} }))
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })

  const ui = await $.ui.mount({
    plugin: 'copy-command',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: {
      text: "Chỉ đổi span như `git status`, còn nhánh `p.kind === 'command'` giữ nguyên.\n\n- **Shell block (```bash …```)**: vẫn có nút ở dòng cuối, ngay tại chỗ. Test `copy button` vẫn pass.\n- Dòng `hub_settings.key = 'true'` và `npx wrangler …`, rồi `yarn install --frozen-lockfile`.",
      isFirstOfReply: true,
    },
  })

  await ui.press({ key: 'copy:inline:0' })
  await ui.press({ key: 'copy:inline:1' })
  expect(copied).toEqual(['git status', 'yarn install --frozen-lockfile'])
  expect(await ui.find({ key: 'copy:inline:2' })).toBeUndefined()
})

test('the inline command list closes the reply, after later prose and shell blocks', async ($, on) => {
  on('settings.read', () => ({ value: {} }))

  const ui = await $.ui.mount({
    plugin: 'copy-command',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: 'Check `git status` first, then run:\n\n```bash\nnpm install\n```\n\nAfter that we are done.', isFirstOfReply: true },
  })

  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn.indexOf('Commands to copy:')).toBeGreaterThan(drawn.indexOf('we are done'))
})
