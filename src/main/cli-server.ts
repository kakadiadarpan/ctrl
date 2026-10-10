import { chmodSync, existsSync, unlinkSync } from "node:fs"
import { createConnection, createServer, type Server, type Socket } from "node:net"
import { commandByName } from "../shared/cli/commands"
import { CliError, PROTOCOL_VERSION, type CliReply, type CliRequest } from "../shared/cli/protocol"

/** Handles one command. Streaming commands get `emit` and resolve when the stream should end. */
export type Handler = (
  args: Record<string, any>,
  req: CliRequest,
  stream: { emit(obj: unknown): void; closed: Promise<void> },
) => Promise<unknown> | unknown

const MAX_REQUEST = 1024 * 1024

/**
 * The app side of the `ctrl` CLI: a unix socket in ctrl's state folder (0600, so only your user can
 * drive ctrl). One newline-terminated JSON request per connection, one JSON reply.
 */
export class CliServer {
  private server?: Server
  private sockets = new Set<Socket>()

  constructor(
    private path: string,
    private handlers: Record<string, Handler>,
  ) {}

  async start() {
    await this.clearStale()
    const server = createServer((sock) => this.connection(sock))
    this.server = server
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      // Created 0600 from the start, no window where another user could connect.
      const umask = process.umask(0o177)
      server.listen(this.path, () => {
        process.umask(umask)
        resolve()
      })
    })
    chmodSync(this.path, 0o600)
    console.log(`[ctrl] cli socket at ${this.path}`)
  }

  /** A socket file left by a ctrl that crashed: remove it, unless a live ctrl answers on it. */
  private async clearStale() {
    if (!existsSync(this.path)) return
    const alive = await new Promise<boolean>((resolve) => {
      const probe = createConnection(this.path)
      probe.once("connect", () => (probe.destroy(), resolve(true)))
      probe.once("error", () => resolve(false))
    })
    if (alive) throw new Error(`another ctrl is listening on ${this.path}`)
    unlinkSync(this.path)
  }

  stop() {
    for (const s of this.sockets) s.destroy()
    this.server?.close()
    try {
      unlinkSync(this.path)
    } catch {}
  }

  private connection(sock: Socket) {
    this.sockets.add(sock)
    let buf = ""
    let handled = false
    sock.setEncoding("utf8")
    let close!: () => void
    const closed = new Promise<void>((r) => (close = r))
    sock.on("close", () => {
      this.sockets.delete(sock)
      close()
    })
    sock.on("error", () => sock.destroy())
    sock.on("data", (chunk: string) => {
      if (handled) return
      buf += chunk
      if (buf.length > MAX_REQUEST) {
        handled = true
        return this.reply(sock, { ok: false, error: { code: "USAGE", message: "Request too large" } })
      }
      const nl = buf.indexOf("\n")
      if (nl === -1) return
      handled = true
      void this.handle(sock, buf.slice(0, nl), closed)
    })
  }

  private reply(sock: Socket, reply: CliReply) {
    if (!sock.destroyed) sock.end(JSON.stringify(reply) + "\n")
  }

  private async handle(sock: Socket, line: string, closed: Promise<void>) {
    let req: CliRequest
    try {
      req = JSON.parse(line)
    } catch {
      return this.reply(sock, { ok: false, error: { code: "USAGE", message: "Request isn't JSON" } })
    }
    try {
      if (req.v !== PROTOCOL_VERSION) {
        throw new CliError("USAGE", `CLI protocol ${req.v} doesn't match the app's (${PROTOCOL_VERSION})`, {
          hint: "Use the ctrl CLI that ships with the running app (Settings → Command line)",
        })
      }
      const spec = commandByName(req.command)
      const handler = this.handlers[req.command]
      if (!spec || !handler) throw new CliError("USAGE", `Unknown command: ${req.command}`, { hint: "Run: ctrl help" })
      const args = req.args && typeof req.args === "object" ? req.args : {}
      if (spec.stream) {
        const emit = (obj: unknown) => {
          if (!sock.destroyed) sock.write(JSON.stringify(obj) + "\n")
        }
        await handler(args, req, { emit, closed })
        if (!sock.destroyed) sock.end()
        return
      }
      const data = await handler(args, req, { emit: () => {}, closed })
      this.reply(sock, { ok: true, data: data ?? {} })
    } catch (err) {
      if (err instanceof CliError) return this.reply(sock, { ok: false, error: err.body() })
      console.error("[ctrl] cli command failed", err)
      this.reply(sock, {
        ok: false,
        error: { code: "INTERNAL", message: err instanceof Error ? err.message : String(err) },
      })
    }
  }
}
