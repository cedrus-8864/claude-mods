# Worklog: copy-command inline list placement

- Symptom: the "Commands to copy:" block (rule + header + inline spans) appeared between a lead-in sentence and the shell fence it introduces, mid-reply.
- Cause (confirmed by a red test): `hooks/register.tsx` rendered one inline-span list after every prose part, and a shell fence splits a reply into several prose parts.
- Loop: new test in `hooks/register.test.tsx` (inline span in prose before a fence, prose after it; header must be drawn after the trailing prose). `claude plugin test copy-command` went red (header at 423, trailing prose at 1783), 0.4s.
- Fix: collect spans from all prose parts (deduped), draw one list at the end of the reply; single fold state keyed by `requestId`. Copy keys became `copy:inline:<j>` / `fold`; existing tests and README updated.
- Result: 14 pass, `claude plugin validate --strict` passes.

## Round 2: precision of inline spans

- Symptom (screenshot of a reply rendered by the mod): list held junk (`)**: vẫn có nút`, `Test`), code expressions (`p.kind === 'command'`) and truncated commands (`bash …`, `npx wrangler …`).
- Causes: (1) regex `` `([^`\n]+)` `` re-paired single backticks around an inline "```" run; (2) "has whitespace" was the only command test.
- Constraint: mods run without Node and cannot import libraries, so no remark/marked. No published standard for "is this span a shell command"; closest advice (issue on the Run-in-terminal button) is known program plus shell cues.
- Red test first (`only real commands are listed, even when a reply has stray backtick runs`), then: CommonMark-style backtick pairing (`codeSpans`), `isCommand` (known program / path / program + flag, needs an argument, no `…`).
- Fold-test fixtures changed from `a b` to `npm run a`, since `a b` is no longer a command. 15 pass, validate passes.

## Round 3: program lookup through `$.process.run`

- Replaced the `PROGRAMS` allowlist and the flag fallback with `command -v` (`sh -c 'command -v "$1"' sh <program>`), one lookup per program, cached in a module `Map` and dropped from it when the call rejects. Docs: `$.process.run` takes an argv with no shell, 30 s default timeout.
- Red tests first: `a span is a command when its program is on PATH, whatever the program` (an unlisted `mytool` found, `git` missing), then the capitalised-name case.
- Real `command -v` on this machine: `Test`, `test`, `time`, `file`, `read`, `open` are all FOUND; `p.kind`, `hub_settings.key`, `copy` are missing. So a lowercase English word that is also a program still passes; a capital first letter is now never looked up (macOS file system is case-insensitive).
- Existing tests mock `process.run` with an `installed()` helper. Not run in a real session: the mod is not loaded here, so the real `$.process.run` path inside a render hook is untested.

## Round 4: presentation

- Screenshot from a session running the worktree mod via `--plugin-dir`: all detection cases correct, buttons work. Two layout complaints: shell block sits flush against the prose around it (the mod's own doing: sibling elements with no margin, where the engine's renderer leaves blank lines), and the "Commands to copy:" block is hard to tell apart.
- Red tests first, then: `marginY={1}` on the shell block box; the inline list in a `borderStyle="round"` `borderDimColor` box with the header as its first row; the `RULE` line removed.
- A `Box` border has no title slot and no per-side borders, so the requested "header in the top rule" is not possible with a real border; it would need a hand-drawn frame (width maths per row, breaks when a long command wraps).
- 17 pass, validate passes.
- Screenshot of the bordered list confirmed the frame; the user asked for a separator between the header and the commands. Added a dim `─` rule as the second row, as wide as the widest line (command text + 5 columns, header, or the fold label; checked against the screenshot: `codegraph init -i` row is 22 columns). Red test first; 18 pass, validate passes.
