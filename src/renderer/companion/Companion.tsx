import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CompanionApi, CompanionGroup, CompanionSession, CompanionView } from "../../companion/types"
import { age } from "../format"
import { Icon } from "../icons"
import { StatusIcon } from "../StatusIcon"

declare global {
  interface Window {
    companion: CompanionApi
  }
}

export function Companion() {
  const [view, setView] = useState<CompanionView | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => window.companion.onView(setView), [])

  // The window fits its content (main keeps it anchored to its corner).
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const fit = () => window.companion.resize(el.getBoundingClientRect().height)
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    fit()
    return () => observer.disconnect()
  }, [])

  // Ages tick without a new view.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const ctx = view?.context
  return (
    <div className="companion" ref={root}>
      <div className="companion-header">
        <span className="companion-app">{ctx?.app ?? "ctrl"}</span>
        {ctx?.label && <span className="companion-label">{ctx.label}</span>}
        <button className="icon-btn companion-close" title="Turn off the companion (Settings → Companion)" onClick={() => window.companion.close()}>
          <Icon name="close" />
        </button>
      </div>
      {view && !view.trusted && (
        <button className="companion-access" onClick={() => window.companion.requestAccess()}>
          <Icon name="alert" />
          <span>Allow Accessibility for ctrl to read Slack, Notion and Linear</span>
        </button>
      )}
      {view?.groups.length ? (
        view.groups.map((g) => <Group key={g.id} group={g} />)
      ) : (
        <div className="empty">
          {!ctx
            ? "Switch to an app to see related sessions"
            : ctx.resource
              ? `No session mentions ${ctx.resource}`
              : "Nothing here that sessions mention"}
        </div>
      )}
    </div>
  )
}

function Group({ group }: { group: CompanionGroup }) {
  return (
    <div className={`companion-group ${group.kind}`}>
      <div className="row space-header companion-space">
        <Icon name={group.kind === "space" ? "folder-open" : group.kind === "archived" ? "archive" : "compose"} />
        <span className="label">{group.name}</span>
      </div>
      {group.sessions.map((s) => (
        <Row key={s.id} session={s} />
      ))}
    </div>
  )
}

function Row({ session: s }: { session: CompanionSession }) {
  return (
    <button
      className="row session companion-session"
      onClick={() => window.companion.open(s.id)}
      title={[s.title, s.exact ? undefined : `Mentioned ${s.via} in the same channel`].filter(Boolean).join("\n")}
    >
      {s.harness === "fx" && <span className="harness-tag">fx</span>}
      <span className="label">{s.title || "Untitled"}</span>
      {!s.exact && (
        <span className="companion-via">
          <Icon name="hash" />
        </span>
      )}
      {s.status === "idle" || s.archived ? <span className="meta">{age(s.last)}</span> : <StatusIcon status={s.status} />}
    </button>
  )
}
