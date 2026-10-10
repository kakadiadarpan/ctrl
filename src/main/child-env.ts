/**
 * Environment for the terminals ctrl spawns (the opencode TUI and fx), so agents inside them can run
 * the `ctrl` CLI: it's on PATH and talks to this ctrl's socket (docs/CLI.md).
 */
let extra: { socket?: string; binDir?: string } = {}

export function setChildEnv(opts: { socket: string; binDir: string }) {
  extra = opts
}

/** Variables that say who the caller is: never inherited from whatever launched ctrl. */
const CALLER_VARS = ["OPENCODE_SESSION_ID", "CTRL_TERM_ID", "CTRL_SESSION_ID"]

export function childEnv(vars: Record<string, string | undefined> = {}): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  for (const v of CALLER_VARS) delete env[v]
  if (extra.socket) env.CTRL_SOCKET = extra.socket
  if (extra.binDir && !(env.PATH ?? "").split(":").includes(extra.binDir)) {
    env.PATH = env.PATH ? `${extra.binDir}:${env.PATH}` : extra.binDir
  }
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) env[k] = v
  return env
}
