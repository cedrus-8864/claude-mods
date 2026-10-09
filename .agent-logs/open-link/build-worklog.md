# open-link: build worklog

Goal: a mod giving Kitty-style hints mode (labels `0-9a-z` at the first character of every URL on screen, press one to open it in the default browser).

## Probe (throwaway), in stages

1. **Slash command + one pane.** `/hints` listed the last message's URLs in a pane with hotkey Buttons; opening worked. Problems seen: labels hard to see against the URL, the transcript jumped to the bottom, Esc did not leave, `/hints` echoed a noise line, mode stayed on after opening a link.
2. **Labels in place for assistant text.** `Markdown` cannot colour one character, so a block with a URL is drawn as `Text`: dim text around, label black on `#5fd75f`, rest of the URL bright. Esc via `closeOnEscape` on a focused pane; `command.run` returning `{}` prints nothing.
3. **Every row on screen (step B).** URLs from every site (`UserMessage`, `CommandOutput`, `ToolUse`, `AssistantMessage`) tracked through `onScreen`, numbered in transcript order using `$.session.messages()` text matching.
4. **Snapshot (step C).** Fast scrolling stuttered (reading 4096 messages per `onScreen` change) and left stale rows: `onScreen` is only re-reported for rows at the viewport's edges. Fixed with a rank cache and a 400 ms freeze after entry.
5. **Prompt and tool rows.** Prompt URLs needed the `UserMessage` redrawn as `Text` (green labels). `Fetch(https://...)` was missed until the URL regex accepted a `(` before it. Rewriting `ToolUse.input` made the engine drop the row; `ToolResult.output` holds the whole page. Fixed by redrawing `Bash`/`Fetch` rows in full, result included.
6. **Chord.** `ctrl+x h` bound in `keybindings.json` to `app:toggleReplTab`, pressed through a zero-height `Button` in the band.
7. **Pane.** A trial with a one-line pane and hidden Buttons was dropped for the plain list (user preference): hint line, rule, `0: URL` rows cut in the middle.

Findings worth keeping are in `docs/decisions/0001-open-link-hints-in-the-tui.md`.

## Real mod

- `open-link/` cleaned from the probe: dropped the `from` field and probe comments, `AbovePrompt` now keeps the band's own tree (`next(e)`) and yields to a survey, `ROW_BG` shared by prompt and tool rows, opener moved to one `sh -c` using `uname`.
- Test pitfalls hit:
  - **`process is not defined`** inside a hook: a mod has no `process` global (only seen by running the tests; it would have failed in use). Opener now `sh -c 'if [ "$(uname)" = Darwin ]; then open "$0"; else xdg-open "$0"; fi' <url>`.
  - **A stubbed `clock.after` runs its callback at once**, so the mode froze before any row was drawn and every row looked unlabelled. Use `mock.clock(on)` and `clock.advance(400)`.
  - **A local variable named `on`** is refused by `validate --strict` (shadows the hook registrar).
- `claude plugin test .`: 6 pass. `claude plugin validate --strict .`: passes.
- Packaging: `marketplace.json` entry, `all` bundle gets `open-link` (0.1.0 to 0.2.0), root README row, `open-link/README.md`, ADR 0001.

Tested with Claude Code 2.1.295.
