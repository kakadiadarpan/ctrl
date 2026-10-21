import type { Harness, SessionStatus } from "../shared/types"

/** What the native helper (native/context.swift) prints, one JSON object per line. */
export type ProbeMessage =
  | { type: "permission"; trusted: boolean }
  | { type: "context"; app: string; bundleId: string; title: string; label?: string; urls: string[] }

export type CompanionSession = {
  id: string
  title: string
  harness: Harness
  status: SessionStatus
  archived: boolean
  /** Last time it mentioned the matched resource */
  last: number
  /** The resource it mentioned, e.g. "vercel/front#123" or "Thread" */
  via: string
  /** Mentioned the exact thing on screen (vs. its channel) */
  exact: boolean
}

export type CompanionView = {
  /** Accessibility granted: needed for Slack, Notion and Linear (not browsers) */
  trusted: boolean
  /** What's on screen; null until the first app is seen */
  context: {
    app: string
    /** Tab, channel or page title */
    label?: string
    /** The resource it recognized, e.g. "vercel/front#123"; none when nothing on screen is a link ctrl knows */
    resource?: string
  } | null
  /** Matching sessions grouped like the sidebar: by space, then Recents (no space), then Archived */
  groups: CompanionGroup[]
}

export type CompanionGroup = {
  /** Space id, "recents" or "archived" */
  id: string
  kind: "space" | "recents" | "archived"
  name: string
  sessions: CompanionSession[]
}

export type CompanionApi = {
  onView(cb: (view: CompanionView) => void): () => void
  open(sessionID: string): void
  resize(height: number): void
  close(): void
  requestAccess(): void
}
