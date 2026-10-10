# ctrl CLI

`ctrl` is a command line interface to the running ctrl app. It's built **for agents**, not humans: an agent
running inside a session (opencode or fx) uses it to do what you'd do with the mouse: create spaces and
sessions, file them, reference one session from another, change settings, and switch what's on screen.

- **Every command, flag and output shape:** [CLI-REFERENCE.md](CLI-REFERENCE.md) (generated), or
  `ctrl help --json` for the installed version.
- **This page:** the principles, the conventions every command follows, and how it works inside.

```text
agent (bash tool) ──► ctrl session new --space spc_x ─┐
                                                      │ one JSON request over a unix socket
                       ~/Library/Application Support/ctrl/ctrl.sock (0600)
                                                      ▼
                       Electron main ── the same functions the sidebar calls (newSession, archive, …)
                                     └─► {"ok":true,"data":{…}} ──► stdout + exit code
```

## Principles

Every command, flag and output follows these. Check new commands against this list.

1. **Machine first.** Output is JSON on stdout, always: no colors, spinners, tables, pagers or prompts, and
   nothing ever waits on a TTY. The only text output is `ctrl help` without `--json` and `ctrl docs`.
2. **One envelope.** Every reply is `{"ok":true,"data":…}` or `{"ok":false,"error":{…}}`
   ([Output](#output)), so an agent never parses prose.
3. **Stable, typed contracts.** Field names and types are part of the API: fields get added, never renamed
   or retyped. Timestamps are Unix milliseconds. Ids are opaque strings.
4. **Self-describing.** `ctrl help --json` returns every command with typed arguments, defaults, output
   shapes, harness notes and examples. `ctrl docs` prints the reference. An agent never has to guess a flag.
5. **Errors that explain the fix.** Every error has a stable `code`, a one-line `message`, and usually a
   `hint` with the next command to run. Ambiguous names and typos return `candidates`.
6. **Same behavior as the UI.** A command calls the same main-process function the sidebar does, so it
   behaves the same whether you click or an agent runs it: undo toasts, harness rules, space settings.
7. **Never yank the user's screen by default.** Creating or changing things doesn't switch the view. Only
   `focus` (or `--focus`) changes what's on screen, and only `--raise` brings the window forward.
8. **The user stays in control.** Archive, delete and archive-all raise the same undo toast as the UI, so
   ⌘Z undoes what an agent did. Deletes only take exact ids, never names or selectors.
9. **Idempotent where it can be.** Archiving an archived session, moving a session where it already is, or
   setting a setting to its current value succeeds with `"changed":false`. Retrying is safe.
10. **Bounded.** Lists are paged (`--limit`, default 50, max 500, `next` cursor). No command returns
    unbounded output or makes main do work proportional to total history
    ([ARCHITECTURE.md → Principles](ARCHITECTURE.md#principles)).
11. **Fast.** In-memory reads answer in milliseconds. Handlers never block main, which relays every
    keystroke of the terminals: anything slow is async (opencode service calls) or runs in a child process
    (`session read`).
12. **Explicit about harnesses.** When opencode and fx behave differently, the command's `harness` notes say
    how ([HARNESSES.md](HARNESSES.md)). Something a harness can't do fails with `UNSUPPORTED_HARNESS` or
    `CONFLICT` instead of quietly doing less.

## Invocation

```text
ctrl <noun> <verb> [positionals] [--flags]
ctrl help [<noun> [<verb>]] [--json]
```

- **Nouns:** `app`, `session`, `space`, `settings`, `ui`, `resources`, `models`, `mcp`, `skill`, plus the
  top-level `search` and `events`. **Aliases:** `status`, `focus`, `ref`, `ls`.
- **Flags:** long form only. Booleans are `--flag` / `--no-flag` (or `--flag=false`). Values are
  `--key value` or `--key=value`. Repeatable flags build a list (`--status running --status failed`).
- **stdin:** a text value of `-` is read from stdin, for prompts and instructions with newlines:
  `ctrl session send ses_x --text - <<'EOF'`.
- **Global flags:** `--pretty` (indented JSON), `--fields id,title` (keep only these fields of the returned
  object, or of each item in `items`), `--timeout <ms>` (wait for the app, default 15s).
- **`--help`** on any command prints its usage. `ctrl <noun>` prints that noun's commands.

### Environment

| Variable | Set by | Used for |
|---|---|---|
| `CTRL_TERM_ID` | ctrl, in each fx pty | resolves `self` in fx sessions (follows `/new`, `/resume`) |
| `OPENCODE_SESSION_ID` | opencode, in its tool shells | resolves `self` in opencode sessions |
| `CTRL_SESSION_ID` | you | overrides `self` |
| `CTRL_SOCKET` | ctrl, in the terminals it runs | socket to talk to; defaults to the installed app's |

ctrl strips inherited `OPENCODE_SESSION_ID` / `CTRL_*` variables from the terminals it spawns, so `self` never
points at whatever launched ctrl.

## Identifiers and selectors

| Kind | Format | Example |
|---|---|---|
| opencode session | `ses_…` | `ses_ed8dd88cdffefeMVTaYvXMl7tF` |
| fx session | `fx:<id>` | `fx:KvHksYqL8l0C` |
| space | `spc_…` | `spc_mv2rapgeot60` |

Wherever a command takes a session or a space, it also takes a selector:

| Selector | Sessions | Spaces |
|---|---|---|
| `self` | the session the calling agent runs in | that session's space |
| `current` | the session on screen | its space |
| `name:<text>` | exact title, case-insensitive | exact name, case-insensitive |
| `none` | | "no space" (`session move`, `session list --space`) |

- Ambiguous `name:` matches fail with `AMBIGUOUS` and list `candidates`; retry with an id.
- `self` outside a session ctrl runs fails with `NO_SELF`.
- `session delete` and `space delete` only take exact ids.

## Output

```json
{"ok":true,"data":{"id":"ses_x","title":"Fix login","changed":true}}
{"ok":true,"data":{"items":[…],"next":"c50","total":130}}
{"ok":false,"error":{"code":"AMBIGUOUS","message":"2 spaces are named \"reviews\"","hint":"Pass an id instead","candidates":[{"id":"spc_a","name":"Reviews"},{"id":"spc_b","name":"reviews"}]}}
```

- Errors go to stdout too, so one parser handles both. The exit code is non-zero.
- `events` streams NDJSON instead: a `{"type":"ready"}` line, then one event per line.
- Object shapes (`Session`, `Space`, `Resource`), settings keys and the error table are in
  [CLI-REFERENCE.md](CLI-REFERENCE.md).

| Exit | `code` |
|---|---|
| 0 | success |
| 1 | `INTERNAL` |
| 2 | `USAGE` |
| 3 | `NOT_FOUND` |
| 4 | `AMBIGUOUS`, `CONFLICT` |
| 5 | `APP_NOT_RUNNING`, `HARNESS_MISSING` |
| 6 | `UNSUPPORTED_HARNESS`, `NO_SELF` |
| 7 | `TIMEOUT` |

## Behavior worth knowing

- **Sending and waiting:** `session send` and `session new --prompt` return once the turn has started, so
  `send` followed by `session wait --for done` can't see the idle state from before the prompt.
- **Typing vs sending:** `--submit` (and `session send`) sends through the opencode service, which works in
  the background. Typing without sending (`session send --no-submit`, `session reference` without
  `--submit`) needs the session's terminal: opencode has one TUI, so the session must be on screen
  (`--focus`), while fx sessions get typed into in the background.
- **New fx sessions:** fx only reports a session id once its process is up, so `session new` waits for it.
  If it doesn't come within 15s, `data` is `{pending:true, terminal}`.
- **Delete:** like the UI, it's held for the 8s undo window. `--wait` returns once it's really gone.

## Install and discovery

- **Inside ctrl's terminals:** nothing to install. ctrl puts its CLI first in `PATH` and sets `CTRL_SOCKET`
  in the TUI and fx terminals, and the installed app adds it to the `PATH` of the opencode service it starts.
- **Everywhere else:** **Settings → Agents → ctrl command line → Install** links `~/.local/bin/ctrl` to
  the launcher in the app, and installs the **ctrl skill** (`skills/ctrl`) next to read-session. Settings warns
  when another `ctrl` comes first in `PATH`.
- **The ctrl skill** tells agents when to reach for the CLI and to run `ctrl help --json` for the rest. It
  runs the CLI through its own `ctrl.sh`, which finds this app's CLI even when another `ctrl` is first in
  `PATH`. The skill stays short on purpose: the CLI documents itself, so they can't drift apart.
- **Not running?** Commands fail with `APP_NOT_RUNNING`; `ctrl app launch` starts the app (in the
  background) and waits until it answers.

## Architecture

```text
bin/ctrl (sh) ─► node, else ctrl's Electron with ELECTRON_RUN_AS_NODE=1
   └─ dist/cli/cli.cjs: parse argv against the registry ─► validate ─► one request on the socket
src/main/cli-server.ts: net.Server on <state folder>/ctrl.sock, created 0600
   └─ handler from src/main/cli-handlers.ts ─► CliHost (implemented in main.ts) ─► reply
```

- **Registry:** `src/shared/cli/commands.ts` lists every command: name, summary, typed arguments, output
  shape, harness notes, examples. The CLI parses and validates against it, `ctrl help` and `ctrl docs` render
  it (`src/shared/cli/docs.ts`), and the server looks handlers up by name. `npm run cli-docs` regenerates
  [CLI-REFERENCE.md](CLI-REFERENCE.md) from it.
- **Transport:** one newline-terminated JSON request per connection, one JSON reply
  (`src/shared/cli/protocol.ts`). The socket lives in the state folder, so dev runs (`ctrl-dev`) and test runs
  (`CTRL_USER_DATA`) each get their own. A stale socket from a crash is removed at launch, unless a live ctrl
  answers on it.
- **Handlers reuse main:** `CliHost` is the narrow interface handlers get (`newSession`, `archive`,
  `openSession`, `setSettings`, …). main.ts implements it with the functions the IPC handlers use, so nothing
  is duplicated. `newSession` takes `{focus}`: the UI passes `true`, the CLI only with `--focus`.
- **Waiting:** `session wait`, the "turn started" check and `events` subscribe to main's state pushes
  (`changeListeners`, run after each coalesced push). No polling. `events` diffs a small per-session snapshot
  only while a stream is open.
- **Shipping:** the CLI is built to `dist/cli/` (excluded from `app.asar`) and copied to
  `Contents/Resources/cli/`, so plain node can run it. ~45 KB, starts in ~30ms with node.

### Adding a command

1. Add an entry to `COMMANDS` in `src/shared/cli/commands.ts` (arguments, `returns`, `harness` notes if they
   differ, an example).
2. Add its handler in `src/main/cli-handlers.ts`. Reuse what main already does through `CliHost`; add to
   `CliHost` only what's missing.
3. Throw `CliError` with the right `code` and a `hint`. Return `changed` for mutations.
4. Run `npm run cli-docs`, and update [FEATURES.md](FEATURES.md) (and [HARNESSES.md](HARNESSES.md) if the
   harnesses differ).

## Recipes

```bash
# File the session I'm running in under a new space
space=$(ctrl space create "PR reviews" --directory ~/w/vercel/front | jq -r .data.id)
ctrl session move self --space "$space"

# Fan out work, then wait for all of it
for pr in 101 102 103; do
  ctrl session new --space name:"PR reviews" --title "Review #$pr" --prompt "Review PR #$pr" | jq -r .data.id
done > ids
xargs -n1 ctrl session wait --for done --timeout 1800000 < ids

# Pull another session's context into this one
ctrl session read ses_abc | jq -r .data.digest

# Hand the user a session: put it on screen with a reference typed in, ready to send
new=$(ctrl session new --focus --raise | jq -r .data.id)
ctrl session reference ses_abc --into "$new" --text "continue this for the WA drain"

# Settings
ctrl settings set appearance dark
ctrl settings set defaultModel "vercel/anthropic/claude-haiku-4.5"
```

## Open questions

- **Name:** another `ctrl` can already be on `PATH` (Settings flags it, and the skill works around it).
  Rename the command if that turns out to be common.
- **Auth beyond the socket mode:** `0600` keeps other users out; any process of yours can drive ctrl, like
  any process of yours can already run `opencode`.
- **Deletes:** agents can delete (with the undo window). Restrict them to archiving if that proves risky.
