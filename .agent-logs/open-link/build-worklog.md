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

## Follow-up: spoofing review findings (2026-10-09)

Two background security reviews flagged display spoofing, one before and one after the push (no detail given, so the causes below are my reading).

- **Host hidden by the pane's middle cut** (commit `fix(open-link): never cut a URL's scheme or host in the pane`): only the path is cut now.
- **Control and invisible characters inside a URL** (this commit): `URL_RE` stops at control characters, zero-width, soft hyphen and bidi override. Text the mod draws itself goes through `clean`, which swaps those for U+FFFD. Without it the engine refuses the whole tree ("a text child holds a control character") and draws the row itself, unlabelled, while the pane still lists its URLs, shifting every later number.
- **The list of invisible characters was incomplete** (two more reviews, "incomplete denylist"): a node check showed tag characters (U+E0041), a variation selector (U+FE0F) and a Hangul filler (U+3164) still entered a URL and showed in the label. `HIDDEN` is now Unicode categories (`\p{Cc}`, `\p{Cf}`, `\p{Co}`, `\p{Cs}`, `\p{Zl}`, `\p{Zp}`, `\p{Variation_Selector}`) plus the invisible fillers that are letters or marks, with the `u` flag on `URL_RE` and `clean`. The toast that reports an `open` failure also passes its stderr through `clean`.
- **Editor pitfall:** the edit tool turned a ` ` written in a regex literal into the real character, which broke parsing. Code points live in strings (`'\\u2028'`) or `String.fromCharCode`, and a grep for invisible characters now runs before committing.
