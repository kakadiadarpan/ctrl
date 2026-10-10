# ctrl CLI (spec)

> **Status: draft spec, not implemented yet.** This is the design `ctrl` will be built against. Once a
> command ships, its entry moves from this spec into the generated reference (see
> [Single source of truth](#single-source-of-truth)) and into [FEATURES.md](FEATURES.md).

`ctrl` is a command line interface to the running ctrl app. It is built **for agents**, not humans: an agent
running inside a ctrl session (opencode or fx) uses it to do what you'd do with the mouse: create spaces and
sessions, file them, reference one session from another, change settings, and switch what's on screen.

```text
agent (bash tool) ──► ctrl session new --space spc_x ─┐
                                                      │ JSON over unix socket
                       ~/Library/Application Support/ctrl/ctrl.sock (0600)
                                                      ▼
                       Electron main ── same functions the sidebar calls (newSession, archive, …)
                                     └─► JSON reply ──► stdout, exit code
```

## Principles

Every command, flag and output follows these. When adding a command, check it against this list.

1. **Machine first.** Output is JSON on stdout, always. No colors, spinners, tables, pagers or prompts. Nothing
   ever waits on a TTY. Logs and warnings go to stderr as JSON lines.
2. **One envelope.** Every reply is `{"ok":true,"data":…}` or `{"ok":false,"error":{…}}`
   ([Output](#output)). An agent never has to parse prose.
3. **Stable, typed contracts.** Field names and types are part of the API. Fields are only added, never
   renamed or retyped, within a major version. Timestamps are Unix milliseconds. Ids are opaque strings.
4. **Self-describing.** `ctrl help --json` returns the full command tree with argument types, defaults, output
   shapes and examples. `ctrl docs` prints this reference for the installed version. An agent never needs to
   guess a flag.
5. **Errors that explain the fix.** Every error has a stable `code`, a one-line `message`, and a `hint` with
   the exact next command when there is one. Ambiguous names return the `candidates`.
6. **Same behavior as the UI.** A command calls the same main-process function the sidebar does, so ctrl
   behaves identically whether you click or an agent runs a command. No CLI-only shortcuts that bypass undo,
   toasts, or harness rules.
7. **Never yank the user's screen by default.** Creating or changing things doesn't switch the view. Only
   `ctrl focus` (or `--focus` on a command) changes what's on screen, and only `--raise` brings the window
   forward.
8. **The user stays in control.** Destructive commands (archive, delete) raise the same undo toast as the UI,
   so you can ⌘Z what an agent did. Deletes only accept exact ids, never names or prefixes.
9. **Idempotent where it can be.** Archiving an archived session, moving a session to the space it's in, or
   setting a setting to its value succeeds with `"changed":false`. Retrying is always safe for these.
10. **Bounded.** Lists default to `--limit 50` and return a `next` cursor. No command returns unbounded output
    or makes main do work proportional to total history ([ARCHITECTURE.md → Principles](ARCHITECTURE.md#principles)).
11. **Fast.** A command answers in well under 100ms for in-memory reads. The socket handler must not block
    main, which relays every keystroke of the TUIs: anything heavy is async or goes to the indexer.
12. **Explicit about harnesses.** When a command works differently for opencode and fx, the difference is in
    `ctrl help` and in the [support table](HARNESSES.md). An unsupported combination fails with
    `UNSUPPORTED_HARNESS`, never silently does less.

## Invocation

```text
ctrl <noun> <verb> [positionals] [--flags]
ctrl <shortcut>                     # a few top-level aliases: focus, search, ref, status
```

- **Nouns:** `app`, `session`, `space`, `settings`, `ui`, `search`, `resources`, `models`, `mcp`, `skill`,
  `events`.
- **Flags:** long form only (`--space`, never `-s`). Booleans are `--flag` / `--no-flag`. Values are
  `--key value` or `--key=value`. Repeated flags build a list (`--id a --id b`).
- **stdin:** any flag value can be `-` to read it from stdin (useful for prompts and instructions with
  newlines): `ctrl session send ses_x --text - <<'EOF'`.
- **Global flags:**

| Flag | Meaning |
|---|---|
| `--pretty` | Indent the JSON (for reading in a transcript; same content) |
| `--fields a,b.c` | Keep only these fields of each returned object (cuts tokens on lists) |
| `--dry-run` | Mutations only: validate and return what would change, without changing it |
| `--timeout <ms>` | Give up waiting on the app after this long (default 10000, `wait` has its own) |

### Environment

| Variable | Set by | Used for |
|---|---|---|
| `OPENCODE_SESSION_ID` | opencode, in its tool shells | resolves `self` for opencode sessions |
| `CTRL_SESSION_ID` | ctrl, in fx ptys it spawns | resolves `self` for fx sessions (see [Open questions](#open-questions)) |
| `CTRL_SOCKET` | you, for tests | socket path override (dev runs use `ctrl-dev`'s socket) |

## Identifiers

| Kind | Format | Example |
|---|---|---|
| opencode session | `ses_…` | `ses_ed8dd88cdffefeMVTaYvXMl7tF` |
| fx session | `fx:<id>` | `fx:KvHksYqL8l0C` |
| space | `spc_…` | `spc_m3x9lb` |

Wherever a command takes a session or space, it also accepts these **selectors**:

| Selector | Resolves to |
|---|---|
| `self` | the session the calling agent runs in (from the environment above) |
| `current` | the session on screen in ctrl |
| `name:<text>` | spaces: exact name (case-insensitive) · sessions: exact title |
| `recents` | spaces only: "no space" (for `--space recents` on `move` / `new`) |

- Ambiguous `name:` matches fail with `AMBIGUOUS` and list the `candidates`. Agents should then retry with
  an id.
- `self` outside a ctrl session fails with `NO_SELF`, with a hint to pass an id.
- Destructive commands (`session delete`, `space delete`) only take exact ids.

## Output

Success, on stdout, exit code 0:

```json
{"ok":true,"data":{"id":"ses_x","title":"Fix login","changed":true}}
```

Lists:

```json
{"ok":true,"data":{"items":[…],"next":"cur_8f2a"}}   // next: null on the last page; pass --cursor cur_8f2a
```

Failure, on stdout too (so one parser handles both), exit code ≠ 0:

```json
{"ok":false,"error":{"code":"AMBIGUOUS","message":"2 spaces are named \"reviews\"","hint":"Pass the id instead","candidates":[{"id":"spc_a","name":"reviews"},{"id":"spc_b","name":"Reviews"}]}}
```

### Exit codes and error codes

| Exit | `code` | When |
|---|---|---|
| 0 | | success |
| 1 | `INTERNAL` | a bug or an unexpected failure inside ctrl |
| 2 | `USAGE` | unknown command or flag, bad value (`message` says which, `hint` shows the usage line) |
| 3 | `NOT_FOUND` | no session / space / setting with that id or name |
| 4 | `AMBIGUOUS` | a selector matched more than one thing (`candidates`) |
| 4 | `CONFLICT` | the action can't happen in the current state, e.g. an fx session open in another terminal |
| 5 | `APP_NOT_RUNNING` | no ctrl to talk to (`hint`: `ctrl app launch`) |
| 5 | `HARNESS_MISSING` | the command needs opencode / fx and it isn't installed (`hint`: the install command) |
| 6 | `UNSUPPORTED_HARNESS` | the harness can't do this (see [HARNESSES.md](HARNESSES.md)) |
| 6 | `NO_SELF` | `self` used outside a ctrl session |
| 7 | `TIMEOUT` | `--timeout` or `wait --timeout` passed |

## Objects

The JSON shapes commands return. `ctrl help --json` has the full schema of each.

```ts
Session = {
  id: string                 // "ses_…" | "fx:…"
  harness: "opencode" | "fx"
  title: string
  directory: string
  spaceID: string | null     // null = no space (only in Recents)
  archived: number | null    // when it was archived (ms), null = not archived
  status: "needs-input" | "running" | "failed" | "unread" | "idle"
  statusDetail?: string      // e.g. "Waiting for permission: bash"
  updated: number
  current: boolean           // on screen right now
  open?: boolean             // fx: has a live fx process in ctrl
  elsewhere?: boolean        // fx: open in an fx outside ctrl
}

Space = {
  id: string
  name: string
  index: number              // position in the sidebar, 0 = top
  collapsed: boolean
  directory: string | null   // folder new sessions start in; null = ~
  harness: "opencode" | "fx" | null        // null = app default
  model: ModelRef | null                   // opencode model for new sessions
  fxModel: ModelRef | null
  modelEnabled: boolean
  instructions: string | null              // opencode only
  sessions: number           // non-archived sessions in it
  status: Session["status"]  // rollup, most urgent first
}

ModelRef = { providerID: string; id: string; variant?: string }
```

## Commands

Grouped by noun. Each entry: synopsis, what it does, what it returns, harness notes.

### `app`

| Command | Does | Returns |
|---|---|---|
| `ctrl app status` | Version, harnesses installed (with versions), skill state, update state, socket path | `{version, opencode, fx, skill, update, window:{visible,focused}}` |
| `ctrl app launch [--wait]` | Starts ctrl if it isn't running (works without the socket). `--wait` returns once it answers | `{launched:boolean}` |
| `ctrl app update check` | Checks GitHub Releases now | `{state, version?}` |
| `ctrl app update install` | Downloads and installs the update, then ctrl restarts | `{version}` |

`ctrl status` is an alias for `ctrl app status`.

### `session`

| Command | Does | Returns |
|---|---|---|
| `ctrl session list [filters]` | Sessions, newest first. Filters: `--space <space>`, `--no-space`, `--archived`, `--all` (archived too), `--status <s>` (repeatable), `--harness <h>`, `--query <text>` (title substring), `--limit`, `--cursor` | list of `Session` |
| `ctrl session get <session>` | One session | `Session` |
| `ctrl session new [--space <space>] [--harness <h>] [--directory <path>] [--model <provider/model>] [--variant <v>] [--title <t>] [--prompt <text>] [--focus]` | Starts a session with the same rules as the sidebar's **+** (space folder, harness, model and instructions apply unless overridden). `--prompt` sends a first message. Without `--focus` it's created in the background | `Session` |
| `ctrl session focus <session> [--raise]` | Puts the session on screen (alias: `ctrl focus`) | `Session` |
| `ctrl session rename <session> <title>` | Renames it | `Session` + `changed` |
| `ctrl session move <session> --space <space\|recents>` | Files it in a space (or takes it out). Unarchives, like the UI | `Session` + `changed` |
| `ctrl session archive <session>…` | Archives one or more, with the undo toast | `{archived:[id], changed}` |
| `ctrl session unarchive <session>…` | | `{unarchived:[id], changed}` |
| `ctrl session delete <id>` | Deletes after the undo window (8s), like the UI. `--wait` returns once it's gone for good | `{id, deleteAt}` |
| `ctrl session send <session> --text <text> [--no-submit]` | Sends a message to the session, as if typed. `--no-submit` only types it into the prompt (the session must be on screen) | `{id, sent:boolean}` |
| `ctrl session wait <session> [--for idle\|needs-input\|done] [--timeout <ms>]` | Blocks until the session reaches that status. `done` = idle, failed or needs-input. Default timeout 10 min | `Session` |
| `ctrl session ref <session>` | The reference string for this session (alias: `ctrl ref`) | `{ref:"@session[Title](ses_x)", plain:"session[Title](ses_x)"}` |
| `ctrl session reference <source> [--into <session>] [--text <text>] [--submit]` | Inserts a reference to `<source>` into another session's prompt, like dropping it on the terminal. `--into` defaults to `current`. `--text` adds a message after it; `--submit` sends it | `{into, ref, sent}` |
| `ctrl session read <session> [--turn <n>]` | Digest of the session (title, folder, turns, tools, files), the same one the read-session skill prints. Use it to load another session's context | `{id, digest:string}` |
| `ctrl session stop <session>` | Aborts the running turn | `{id, stopped}` |

Harness notes:
- **`new` with fx:** fx only reports its id once it has started, so `new` waits for it (up to 5s) before
  returning. The fx process runs in the background until focused.
- **`send` / `--prompt` with fx:** goes through the session's pty (opened in the background if needed).
  Fails with `CONFLICT` if the session is open in another terminal.
- **`reference` / `send --no-submit`:** typing into a prompt needs that session's terminal. For opencode the
  target must be on screen (one shared TUI), so it fails with `CONFLICT` unless `--focus` is passed. fx
  sessions can be typed into in the background. The reference uses `session[…]` without `@` for fx, as the UI
  does.
- **`rename` with fx:** returns `"pending":true` when fx has the session open; the title is written once it
  quits ([HARNESSES.md](HARNESSES.md)).
- **`stop` with fx:** sends Escape to its pty, only for sessions open in ctrl.

### `space`

| Command | Does | Returns |
|---|---|---|
| `ctrl space list` | Spaces in sidebar order | list of `Space` |
| `ctrl space get <space>` | One space, plus its sessions with `--sessions` | `Space` (+ `items`) |
| `ctrl space create <name> [--index <n>] [settings flags]` | New space, at the top unless `--index`. Accepts the `space set` flags | `Space` |
| `ctrl space rename <space> <name>` | | `Space` + `changed` |
| `ctrl space set <space> [--directory <path>\|--no-directory] [--harness <h>\|--no-harness] [--model <provider/model>] [--fx-model <model>] [--variant <v>] [--model-enabled\|--no-model-enabled] [--instructions <text>\|--no-instructions]` | Space settings for new sessions. `--no-*` clears back to the app default | `Space` + `changed` |
| `ctrl space move <space> --index <n>` | Reorders | `Space` + `changed` |
| `ctrl space fold <space>` / `unfold` | | `Space` + `changed` |
| `ctrl space archive-all <space>` | Archives every session in it, with the undo toast | `{archived:[id]}` |
| `ctrl space delete <id>` | Deletes it; its sessions go back to Recents. Undo toast | `{id}` |

### `settings`

Settings are flat dotted keys, typed, validated against the same `Settings` type the app uses.

| Command | Does | Returns |
|---|---|---|
| `ctrl settings list` | Every key with its type, allowed values, default and current value | `[{key, type, values?, default, value, description}]` |
| `ctrl settings get <key>` | | `{key, value}` |
| `ctrl settings set <key> <value>` | Value is parsed as JSON when it's valid JSON, else as a string | `{key, value, changed}` |
| `ctrl settings reset <key>` | Back to the default | `{key, value, changed}` |

Keys (from `Settings` in `src/shared/types.ts`):

| Key | Type |
|---|---|
| `appearance` | `"system" \| "light" \| "dark"` |
| `tuiTheme` | theme name or `null` (values from `ctrl settings list`) |
| `fontSize` | integer 9–24 |
| `defaultHarness` | `"opencode" \| "fx"` |
| `defaultModelEnabled` | boolean |
| `defaultModel` / `defaultFxModel` | `ModelRef` or `"provider/model[#variant]"` or `null` |
| `dockBadge`, `notifications`, `sounds`, `soundsWhenFocused` | boolean |
| `soundChoices.needs-input` / `.failed` / `.finished` | system sound name, absolute file path, or `null` |
| `shortcuts.<command>` | accelerator, e.g. `"Cmd+Shift+N"` (commands from `src/shared/shortcuts.ts`) |
| `adapterModes.<adapter>` | `"off" \| "links" \| "live"` |

### `ui`

What's on screen. Everything here is visible to the user, so agents should only use it when asked to.

| Command | Does | Returns |
|---|---|---|
| `ctrl focus <session> [--raise]` | Alias of `session focus` | `Session` |
| `ctrl ui get` | Current session, active terminal, panels, sidebar width, window visible / focused | `{currentSessionID, activeTerm, resources:{open,scope,width}, sidebarWidth, window}` |
| `ctrl ui home [--prefill <text>]` | opencode's new-session screen, optionally with a prompt typed in (not sent) | `{}` |
| `ctrl ui window show\|hide\|raise` | Shows, hides, or brings ctrl to the front | `{visible, focused}` |
| `ctrl ui resources open\|close [--scope session\|space]` | The resources panel | `{open, scope}` |
| `ctrl ui sidebar --width <px>` | 200–520 | `{width}` |
| `ctrl ui section <recents\|archived> fold\|unfold` | | `{collapsed}` |
| `ctrl ui settings [open\|close]` | The settings page | `{open}` |
| `ctrl ui palette [--query <text>]` | Opens ⌘P, optionally with a query | `{}` |
| `ctrl ui toast <message>` | Shows a toast, e.g. to tell the user an agent is done. Uses the one notification channel ([ARCHITECTURE.md → Notifications](ARCHITECTURE.md#notifications)) | `{id}` |

### `search`, `resources`, `models`

| Command | Does | Returns |
|---|---|---|
| `ctrl search <query> [--limit]` | Titles and message text, the ⌘P search | `{hits:[{sessionID,title,role,created,snippet}], index:{indexing,done,total}}` |
| `ctrl resources list [--session <s>…\|--space <space>] [--type <t>] [--live]` | Links shared in those sessions (default `current`). `--live` includes cached live details | list of `ResourceItem` |
| `ctrl models list --harness <h> [--directory <path>]` | Models and variants for that harness | `{models:[ModelOption], providers}` |

Snippets mark matches with `«` and `»` (not the UI's private-use characters).

### `mcp`, `skill`

| Command | Does | Returns |
|---|---|---|
| `ctrl mcp list` | opencode's MCP servers and their status | `[{name,status,error?}]` |
| `ctrl mcp reconnect <name>` | | `{name,status}` |
| `ctrl skill status` / `install` / `uninstall` | The read-session skill (and the ctrl CLI skill, see [Discovery](#discovery)) | `{state,path?}` |

### `events`

| Command | Does | Returns |
|---|---|---|
| `ctrl events [--type <t>…] [--session <s>…]` | Streams NDJSON, one event per line, until killed. Types: `session.status`, `session.created`, `session.updated`, `session.archived`, `session.deleted`, `space.changed`, `focus.changed`, `settings.changed` | `{"type":…, "at":…, …}` per line |

For a single "tell me when it's done", prefer `session wait`.

## Recipes

```bash
# File the session I'm running in under a new space
space=$(ctrl space create "PR reviews" --directory ~/w/vercel/front | jq -r .data.id)
ctrl session move self --space "$space"

# Fan out work, then wait for all of it
for pr in 101 102 103; do
  ctrl session new --space name:"PR reviews" --title "Review #$pr" --prompt "Review PR #$pr" | jq -r .data.id
done > ids
xargs -n1 ctrl session wait --for done < ids

# Pull another session's context into this one
ctrl session read ses_abc | jq -r .data.digest

# Hand the user a session: reference it in a new chat, put it on screen
new=$(ctrl session new --focus | jq -r .data.id)
ctrl session reference ses_abc --into "$new" --text "continue this for the WA drain"

# Settings
ctrl settings set appearance dark
ctrl settings set defaultModel "vercel/anthropic/claude-sonnet-5#high"
```

## Discovery

How an agent finds out `ctrl` exists and how to use it:

- **On PATH:** the app ships the CLI inside the bundle (`ctrl.app/Contents/Resources/bin/ctrl`). Settings →
  Agent skill installs a symlink at `~/.local/bin/ctrl` (and ctrl adds the bundle's `bin` to the PATH of
  terminals it spawns, so it works without the symlink inside ctrl).
- **A `ctrl` skill** next to read-session: a short `SKILL.md` saying when to use the CLI, the principles above
  in two lines, and "run `ctrl help --json` for the full reference". The skill stays tiny; the CLI documents
  itself, so they never drift.
- **`ctrl help [<noun> [<verb>]] [--json]`:** text help is for transcripts; `--json` is the machine contract.
- **`ctrl docs`:** prints this document's reference section for the installed version.

## Architecture

```text
bin/ctrl (sh) ─► node, else ctrl's Electron with ELECTRON_RUN_AS_NODE=1 (like digest.sh)
   └─ dist/cli.cjs: parse argv against the registry ─► validate ─► 1 request on the socket
src/main/cli-server.ts: net.Server on <userData>/ctrl.sock (0600, removed on quit)
   └─ dispatch(command, args) ─► handlers calling main's existing functions ─► reply
```

- **Transport:** a Unix domain socket in the state folder, mode `0600`, so only your user can drive ctrl.
  One JSON request per connection, one JSON reply (or an NDJSON stream for `events`). Dev runs use
  `ctrl-dev`'s socket, so a dev ctrl and the installed one never cross.
- **Handlers reuse main.** `session new` calls `newSession()`, `archive` calls `archive()`, `focus` calls
  `openSession()`. Main exposes them through a small `Actions` object instead of IPC-only closures, and both
  `registerIpc()` and the CLI server call it. No logic is duplicated.
- **No focus change in the background:** `newSession()` gets a `{focus}` option. The UI passes `true`, the CLI
  passes `--focus`.
- **`self`:** the CLI client resolves it from the environment before sending, so main only sees ids.
- **`wait` and `events`** subscribe to the same `sessionsChanged()` notifications as the sidebar. No polling.
- **`session read`** runs `skills/read-session/digest.mjs` in a child process, never in main.

### Single source of truth

```text
src/shared/cli/commands.ts   one entry per command: name, summary, args (typed), output type,
        │                    harness notes, examples
        ├─► dist/cli.cjs      argv parsing, validation, `ctrl help` (text + --json)
        ├─► cli-server.ts     handler lookup + arg validation on the server side too
        └─► scripts/cli-docs.mjs ─► the "Reference" section of docs/CLI.md (generated, checked in CI)
```

Adding a command = one registry entry + one handler. Docs and help can't drift from the code.

## Rollout

| Phase | Ships |
|---|---|
| 1 | Socket server, CLI client, `help`/`docs`, `app status`, `session list/get/new/focus/rename/move/archive/unarchive`, `space list/get/create/rename/set/move/delete`, `settings list/get/set`, `ref`, `reference` |
| 2 | `session send/wait/read/stop/delete`, `search`, `resources`, `models`, `ui *`, `ctrl` skill + PATH install |
| 3 | `events`, `mcp`, `skill`, `app update`, `--dry-run` everywhere |

## Open questions

- **`self` for fx:** opencode exports `OPENCODE_SESSION_ID` to its tool shells. fx doesn't seem to export
  its session id. ctrl can set `CTRL_SESSION_ID` when it spawns `fx resume --id`, but not for `fx` started
  with no id (the id isn't known yet) or after `/new` inside it. Ask fx for an env var?
- **Name:** `ctrl` might shadow something on some machines. Fallback name `ctrlc`?
- **Auth beyond the socket mode:** is `0600` enough, or should requests also carry the token the bridge
  uses?
- **Should `session delete` exist at all for agents,** or should agents only archive (always reversible)?
