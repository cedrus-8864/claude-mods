# open-link: build decisions

Small ones, resolved without asking. The architectural ones are in `docs/decisions/0001-open-link-hints-in-the-tui.md`.

- **Chord `ctrl+x h`, not `ctrl+shift+e`.** Kitty consumes the user's own shortcut; the user agreed to another chord. The mod binds nothing itself, the README tells the person to bind their own to `app:toggleReplTab`.
- **Keep `/hints`.** The user wanted a shortcut, not a command, but a slash command is the only entry that needs no `keybindings.json` edit. It prints nothing.
- **Snapshot window 400 ms.** A fixed wait, not a signal that every row reported; no event says so. Raise it if a slow terminal misses rows.
- **Message-level visibility.** A partly visible message labels all its URLs. Line-level needs row coordinates the mod does not get.
- **36 labels.** `0-9a-z`; later URLs are not labelled.
- **Row background `#373737`.** Read from a dark-theme screenshot; no theme API, so documented as a limit.
- **Fetch redrawn like Bash**, losing the engine's "Received …" line. Chosen over listing Fetch in the pane only, because the user wanted labels where the URL stands. Revisit if the lost line bothers.
- **Pane stays a sidebar.** Placement is the engine's; a one-line pane with hidden Buttons was tried at the user's request and the plain list was kept.
- **No spec/plan file.** One `register.tsx`; the design went to the user in chat, was approved, and lives in the README and ADR 0001.
- **Windows unsupported.** No machine to test, and the opener is POSIX shell.
