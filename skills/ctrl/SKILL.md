---
name: ctrl
description: Drive the ctrl app (the window running your opencode / fx sessions) from the shell with the `ctrl` CLI. Use when the user asks you to create, find, file, rename, archive or open sessions or spaces in ctrl, start parallel sessions and wait for them, reference or read another session, change ctrl settings, or switch what ctrl shows on screen.
---

# ctrl CLI

`ctrl` controls the running ctrl app: spaces, sessions, references between sessions, settings and
what's on screen. It's built for agents: every reply is one JSON object on stdout.

## Run it

```bash
sh <skill base directory>/ctrl.sh <command> [args]
```

`ctrl.sh` runs the CLI that ships with the app, even if another `ctrl` comes first in PATH. Inside
terminals ctrl runs, plain `ctrl` works too.

## Learn the commands

```bash
sh <skill base directory>/ctrl.sh help --json     # every command, typed arguments, output shapes, errors
sh <skill base directory>/ctrl.sh help session new  # one command
```

Don't guess flags: read `help` first. The most used ones:

| Command | Does |
|---|---|
| `session list [--space <s>] [--status needs-input]` | find sessions |
| `session new [--space <s>] [--title t] [--prompt p] [--focus]` | start one (background unless `--focus`) |
| `session wait <s> --for done` | block until its turn is over |
| `session read <s>` | digest of another session's context |
| `session reference <src> --into <dst> [--text t] [--submit]` | reference one session in another |
| `session move <s> --space <space\|none>` · `session archive <s>` | file / archive |
| `space create <name> [--directory d]` · `space list` | spaces |
| `settings list` · `settings set <key> <value>` | settings |
| `focus <s> [--raise]` | put a session on screen |

## Rules

- Sessions: an id (`ses_…`, `fx:…`), `self` (the session you're in), `current` (on screen) or
  `name:<title>`. Spaces: an id, `name:<name>`, or `current`.
- Check `ok`. On errors, read `error.code` and follow `error.hint`; `AMBIGUOUS` lists `candidates`
  (retry with an id).
- Don't change what's on screen (`focus`, `--focus`, `ui …`) unless the user asked for it.
- You can't delete sessions, only archive them (`session archive`, reversible, the user gets an undo
  toast). If the user wants a session deleted, tell them to do it from ctrl's sidebar.
- Use `--fields id,title` on lists to keep output small.
