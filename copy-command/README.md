# copy-command

An icon-only copy button beside every shell command in Claude's replies.

- **Shell code blocks** (` ```bash `, `sh`, `zsh`, `fish`, `shell`, `console`, `terminal`, or no language) get a `⧉` button on the last line. A leading `$ ` on every line is dropped from the copied text.
- **Inline code that looks like a command** (such as `git status`) is collected (deduped) into one list at the end of the reply, one command per row, in a dim rounded border, under a header ("Commands to copy") and a rule. A span counts when it has an argument and starts with a `./`, `../` or `~/` path, or with a lowercase program that `command -v` finds on your machine (one lookup per program, run through `sh`, so macOS and Linux). Names, code expressions, truncated commands (`npx wrangler …`) and programs you do not have installed are skipped; a plain English word that is also a program (`file`, `read`, `open`) still counts. Spans are paired as CommonMark does. More than five commands fold behind a "Show N more" / "Collapse" toggle.
- **Language:** the header, toggle and toasts follow Claude Code's `language` setting (Vietnamese or English). With no setting, a reply written with Vietnamese letters gets Vietnamese, anything else English. Other languages fall back to English; add one to `TEXT` in `hooks/register.tsx`.
- Hovering a button lights its command with a faint background. The colour is `HOVER_BG` in `hooks/register.tsx`, tuned for a dark terminal.

A reply that has a shell block or a multi-word inline span is redrawn by the mod, so it loses the bullet that opens the reply. Inline buttons sit in that closing list, not after the word, because splitting a paragraph would break its markdown.

## Test

```
claude plugin test .
claude plugin validate --strict .
```

Tested with Claude Code 2.1.292.
