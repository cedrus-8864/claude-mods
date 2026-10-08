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
