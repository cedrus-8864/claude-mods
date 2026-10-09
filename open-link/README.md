# open-link

Kitty-style hints mode for Claude Code: label every link on screen, press a key, open it in a new tab of your default browser.

- **Enter** with `ctrl+x h` (set up below), or `/hints`.
- Every URL in view gets a label, `0`-`9` then `a`-`z`, drawn black on green over the URL's first character. Numbers run top to bottom.
- **Press the label** and the URL opens (`open` on macOS, `xdg-open` elsewhere). The mode ends.
- **Esc** leaves without opening anything.
- A pane beside the transcript lists what each label opens, a long URL cut in the middle. It is also what holds the keyboard for the label keys.

Like Kitty, the mode works on the screen as it was when you entered it: scrolling afterwards changes nothing, so the numbers stay put. Only the first 36 URLs in view get a label.

## Install

```
/plugin install open-link --marketplace cedrus-8864/claude-mods
```

## What gets labelled

| Where the URL is | How it is drawn in the mode |
| --- | --- |
| Your prompt, Claude's reply | Redrawn with a green label. The text of a reply that holds a URL is shown as plain text, so markdown styling (bold, code) is lost in that paragraph |
| `Bash(...)` command and its first 10 lines of output, `Fetch(...)` | Redrawn with a green label |
| Output of a slash command | Plain-text label, no colour |
| Any other tool | Listed in the pane, not labelled in place |

A URL in a code span or in plain parentheses counts. A markdown link target `[text](url)` does not: only a URL written out as text is labelled.

## Set up the chord

The mod listens to an engine action nothing else uses, `app:toggleReplTab`, so the chord is yours to choose. Add this to `~/.claude/keybindings.json`:

```json
{
  "bindings": [
    { "context": "Global", "bindings": { "ctrl+x h": "app:toggleReplTab" } }
  ]
}
```

Any chord works. `ctrl+shift+e` reaches Claude Code only if your terminal does not take it for itself (Kitty does).

`/hints` needs no setup and does the same.

## Limits

- The chord works only while the band above the prompt is drawn (not during a survey). `app:toggleReplTab` must also be free: the built-in `cc-plugin-diff` mod leaves it alone, but another mod that handles it would take the chord.
- The background of the redrawn prompt and tool rows, `ROW_BG` in `hooks/register.tsx`, is tuned for a dark theme.
- A row redrawn by the mod loses the engine's own styling of it: pasted-text colour and `[Image #n]` in your prompt, the "Received …" line of `Fetch`.
- A message that is only partly in view labels all of its URLs, not only those in view.
- The order of the numbers is found by matching row text against the saved transcript; an identical text twice may be numbered in the wrong order.
- Windows is not supported.

## Test

```
claude plugin test .
claude plugin validate --strict .
```

Tested with Claude Code 2.1.295.
