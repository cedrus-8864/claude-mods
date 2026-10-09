# claude-mods

Mods (plugins of function hooks) for Claude Code.

| Mod | What it does |
| --- | --- |
| [`copy-command`](copy-command) | An icon-only copy button beside every shell command in Claude's replies |
| [`open-link`](open-link) | Kitty-style hints mode: label every link on screen, press a key to open it |
| [`all`](all) | Bundle: installs every mod in this marketplace |

## Install

Everything at once:

```
/plugin install all --marketplace cedrus-8864/claude-mods
```

One mod:

```
/plugin install copy-command --marketplace cedrus-8864/claude-mods
```

After a new mod is added, run `claude plugin update all` and `/reload-plugins` to pick it up.

Or load a checkout for one session:

```
claude --plugin-dir ./copy-command
```

Mods run with the same access to your machine as Claude Code itself. Read the code before installing.

Tested with Claude Code 2.1.292. Mod events and methods can change between releases.

## License

MIT, see [LICENSE](LICENSE).
