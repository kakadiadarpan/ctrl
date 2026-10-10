import type { ResourceAdapter, ResourceData, ResourceType } from "./adapter"

/** Ids the read-session skill accepts: opencode's `ses_…` and fx's `fx:<id>`. */
export const SESSION_REF_ID = /^(?:ses_[A-Za-z0-9]+|fx:[A-Za-z0-9_-]+)$/

/**
 * Session mentions aren't links: `@session[Title](id)` (or `session[Title](id)` in fx), as ctrl types
 * them when a session is dropped on the terminal. extractResources() turns them into `ctrl://session/<id>`.
 */
export const sessionRefUrl = (id: string) => `ctrl://session/${encodeURIComponent(id)}`

const session: ResourceType = {
  id: "session",
  label: "Sessions",
  icon: "terminal",
  parse(url) {
    if (url.protocol !== "ctrl:" || url.hostname !== "session") return null
    let id: string
    try {
      id = decodeURIComponent(url.pathname.slice(1))
    } catch {
      return null
    }
    if (!SESSION_REF_ID.test(id)) return null
    const data: ResourceData = { id }
    const title = url.searchParams.get("title")?.trim()
    if (title) data.title = title
    return { identity: id, url: sessionRefUrl(id), data }
  },
  // The panel shows the session's current title and state from the sidebar's list instead.
  describe: (d) => ({ title: d.title || "Session", subtitle: d.id }),
}

/** No live part: titles and archived/deleted state come from ctrl's own session list. */
export const sessions: ResourceAdapter = {
  id: "sessions",
  name: "Sessions",
  description: "Sessions referenced with @session[…], with their current title and state",
  types: [session],
}
