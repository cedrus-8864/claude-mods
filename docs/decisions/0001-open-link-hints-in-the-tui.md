# 0001: open-link draws its labels inside the TUI and enters on a chord bound to `app:toggleReplTab`

Status: Accepted, 2026-10-09

## Context

`open-link` should work like Kitty's hints mode: label the links on screen, open one by pressing its label. A mod gets the transcript's text and which rows are in view, but no screen coordinates, no way to hold the transcript's scroll, and no event for a key outside a component that holds the keyboard.

## Decision

1. **Labels are drawn by redrawing the rows that hold a URL** (`UserMessage`, `AssistantMessage`, `ToolUse` for Bash and Fetch), the label replacing the URL's first character. Other tools are listed in the pane only.
2. **The keys go through a pane** opened with `$.ui.open({ focus: true, closeOnEscape: true })`: a `Button` hotkey fires only while its site holds the keyboard, and the pane also gives Esc.
3. **The chord is a zero-height `Button` in the band above the prompt with `action="app:toggleReplTab"`**, so the person binds any chord to that action in `keybindings.json`. The action is unbound by default and unhandled while the built-in diff mod is on. `/hints` is the fallback that needs no setup.
4. **The mode works on a snapshot**: rows that report in view during the first 400 ms are numbered, then no row is added or dropped, so scrolling cannot renumber.

## Alternatives rejected

- **An overlay drawn by a script outside Claude Code** (terminal API for text, escape codes for labels): no coordinates reach the mod, Claude Code's own redraw clears or corrupts the overlay, and each terminal needs its own API.
- **Screenshot and OCR to find coordinates**: the URL to open would still come from the transcript, so OCR errors would not matter, but it needs Screen Recording permission, a helper binary and a transparent window, and is macOS only.
- **Rewriting a tool row's `input` or `output`** to put a label in it: the engine validates `ToolUse.input` and drops the row when a URL no longer parses; a result's `output` holds far more than the row shows.
- **A `ToolResult` hook for Bash output**: the engine never raises it for Bash, the result is drawn by the `ToolUse` row.
- **Labels only in the pane, no redraw**: loses the point of the mode, seeing which link each key opens in place.

## Consequences

- A redrawn row loses the engine's styling of it (pasted-text colour, image placeholders, Fetch's result line); the row background is a guess at the dark theme.
- The chord depends on `app:toggleReplTab` staying unhandled by other mods.
- A mod has no `process` global: the opener is chosen by `sh -c` and `uname`.
- If the engine adds an overlay or hints API, supersede this decision.
