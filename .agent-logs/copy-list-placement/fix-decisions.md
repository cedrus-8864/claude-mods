# Decisions: copy-command inline list placement

- **One list at the end of the reply**, over keeping a list per prose part or per paragraph. A per-paragraph list would put the rule and header mid-text more often, which is the reported problem. Cost: a span's button can sit far from its sentence. The README already said the buttons are not inline with the word.
- **Dedupe across the whole reply**, not per prose part: the same command mentioned twice yields one row.
- **One fold toggle per reply** (state key `requestId` only), since there is one list.
- **Renamed copy/fold keys** rather than faking index `0`, so test keys describe what they find.
- Not committed: no commit was asked for.

## Round 2

- **Allowlist plus flag fallback** over shape-only heuristics: the allowlist keeps precision (prose and code expressions never start with `git`), the flag fallback keeps recall for unlisted CLIs. Ceiling: an unlisted program without a flag (`mytool run`) is missed; add it to `PROGRAMS`.
- **Reject any span containing a `…`/`...` word**: a truncated command pasted into a terminal fails.
- **Own CommonMark-style pairing** over a library: mods cannot import packages.
- Escaped backticks: the run is skipped, not split; rare enough.

## Round 3

- **`command -v` over the allowlist**: no list to maintain, and it follows the user's machine. Cost: a command for a tool not installed here gets no button; a process spawn per new program name.
- **Name passed as `$1`, validated by `PROGRAM`**: no model-written text is spliced into a shell script.
- **Lowercase-first rule**: cheap guard against sentence-initial words; the English-word-that-is-a-program case (`file`, `read`) is left as a known false positive rather than adding a stopword list.
- **Lookup failure returns false and is not cached**: a transient failure does not hide a program for the rest of the session; on a host with no `sh` every inline span is skipped.
