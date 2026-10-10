# Using ctrl

## Install, update, uninstall

The one-liner in the [README](../README.md#-install) installs the latest release into `/Applications`.

- **The `ctrl` command:** the script also links `~/.local/bin/ctrl`, the command line agents use to drive
  ctrl ([below](#let-agents-drive-ctrl)).
- **Why a script:** ctrl isn't notarized. Files curl downloads aren't quarantined, so the app opens without a
  Gatekeeper prompt.
- **Downloaded the zip from the browser instead?** macOS will say it's damaged. Run
  `xattr -dr com.apple.quarantine /Applications/ctrl.app` once.
- **Updates:** ctrl checks GitHub for a new release every few hours and offers it in a toast.
  **Settings → About** has a manual check. The same one-liner also reinstalls.
- **First launch:** a welcome screen shows which harnesses (fx, opencode) are installed, with install commands
  for the missing ones. With both, you pick the one new sessions start with. **Settings → About → Welcome
  screen** shows it again. Then ctrl offers to install the `read-session` skill (also in **Settings → Agents**), so agents can read sessions you drag onto the terminal.
- **Uninstall:** delete `/Applications/ctrl.app` and `~/Library/Application Support/ctrl`, plus
  `~/.config/opencode/skills/read-session` and `~/.config/opencode/skills/ctrl` if you installed the skills,
  and `~/.local/bin/ctrl` if you installed the command line. Your opencode sessions aren't touched.

## Everyday use

- **+** next to Spaces: create a space
- Drag sessions between spaces, or onto **Recents** to unassign
- Hover a space: **+** new session in it, **⋯** for rename / space settings / delete
- Double-click a space to rename
- Right-click a session: move to / delete
- **Space settings** apply to new sessions started from ctrl in that space:
  - folder: where they start (defaults to `~`)
  - harness: opencode or fx. Default follows **Settings → Sessions → Harness**. Sessions of both kinds can
    live in the same space either way ([HARNESSES.md](HARNESSES.md))
  - model (toggle), one per harness: passed to opencode's `session.create`, or as `fx --model --effort`. Off
    falls back to **Settings → Custom model**; when that's off too, ctrl passes no model and the harness picks
  - instructions (opencode only): attached as a session instruction entry (`ctrl.space`), invisible in the
    chat but part of the model's context on every turn
- ⌘1–9 jumps to the Nth visible session; hold ⌘ to see the numbers
- Drag a session onto the terminal to reference it: ctrl pastes `@session[Title](id)` (`session[…]` in
  fx, where `@` attaches a file) and
  the `read-session` skill lets the agent read its context via `digest.sh <id>`. ctrl installs it
  into `~/.config/opencode/skills` as a copy it manages (`src/main/skill.ts`), refreshed when ctrl's
  version changes. Copies it didn't make (like a dev symlink of `skills/read-session` in
  `~/.agents/skills`) are left alone. `digest.sh` runs with `node`, or with ctrl's own runtime when
  node isn't installed
- ⌘P search · ⌘N new chat · ⌘T new session in the current session's folder and space ·
  ⌘W archive the current session · ⌘, settings. All rebindable in **Settings → Shortcuts**
  (`src/shared/shortcuts.ts`)
- Archive, archive all, delete space and delete session show an undo toast (⌘Z while it's up).
  Session deletes are held back until the toast expires (or ctrl quits), since opencode can't
  restore them. Deleted fx sessions go to the Trash

## Let agents drive ctrl

Agents in ctrl's terminals can run `ctrl` to create spaces and sessions, file and archive them, reference
one session from another, change settings and switch what's on screen. Ask them in plain words ("start a
session per PR in the reviews space"); the `ctrl` skill tells them how.

- The installer links it at `~/.local/bin/ctrl`, and the first launch offers to install the ctrl skill
  that teaches agents about it. Inside ctrl's terminals it works either way.
- **Settings → Agents → ctrl command line** shows its status, and warns if `~/.local/bin` isn't in your PATH
  or another `ctrl` comes first.
- Agents can archive sessions but never delete them. What they archive shows the usual undo toast, so ⌘Z
  undoes it.
- Details: [CLI.md](CLI.md), every command: [CLI-REFERENCE.md](CLI-REFERENCE.md).
