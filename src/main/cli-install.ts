import { accessSync, constants, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import type { CliStatus } from "../shared/types"

/** Another copy of ctrl's launcher (another app location, a dev checkout): ours to relink. */
const CTRL_LAUNCHER = /\/(Contents\/Resources|dist)\/cli\/ctrl$/

/**
 * Puts `ctrl` on PATH as a symlink in ~/.local/bin to the launcher inside the app (docs/CLI.md).
 * CTRL_BIN_DIR is a test hook (docs/DEVELOPMENT.md).
 */
export class CliInstall {
  private link: string

  constructor(private target: string) {
    this.link = join(process.env.CTRL_BIN_DIR || join(homedir(), ".local", "bin"), "ctrl")
  }

  current: CliStatus = { state: "missing", link: "", target: "" }

  private linkTarget() {
    try {
      if (!lstatSync(this.link).isSymbolicLink()) return "other"
      return resolve(join(this.link, ".."), readlinkSync(this.link))
    } catch {
      return null
    }
  }

  /** The first `ctrl` in PATH, when it isn't ours (e.g. another tool with the same name). */
  private shadow(): string | undefined {
    for (const dir of (process.env.PATH ?? "").split(":")) {
      if (!dir) continue
      const candidate = join(dir, "ctrl")
      try {
        accessSync(candidate, constants.X_OK)
      } catch {
        continue
      }
      if (candidate === this.link || resolve(candidate) === this.target) return undefined
      try {
        if (lstatSync(candidate).isSymbolicLink() && resolve(dir, readlinkSync(candidate)) === this.target) return undefined
      } catch {}
      return candidate
    }
  }

  refresh(): CliStatus {
    const target = this.linkTarget()
    const state =
      target === this.target
        ? "installed"
        : target === null
          ? "missing"
          : target !== "other" && CTRL_LAUNCHER.test(target)
            ? "stale"
            : "other"
    const shadowedBy = state === "installed" ? this.shadow() : undefined
    const notOnPath = !(process.env.PATH ?? "").split(":").includes(dirname(this.link))
    this.current = {
      state,
      link: this.link,
      target: this.target,
      ...(shadowedBy ? { shadowedBy } : {}),
      ...(notOnPath ? { notOnPath } : {}),
    }
    return this.current
  }

  install() {
    const state = this.refresh().state
    if (state === "other") throw new Error(`${this.link} already exists and isn't ctrl's, not replacing it`)
    mkdirSync(dirname(this.link), { recursive: true })
    if (state === "installed" || state === "stale") rmSync(this.link)
    symlinkSync(this.target, this.link)
    return this.refresh()
  }

  uninstall() {
    if (this.refresh().state === "installed") rmSync(this.link)
    return this.refresh()
  }
}
