import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CompanionApi, CompanionView } from "../../companion/types"
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
      <div className="header">
        <span className="app">{ctx?.app ?? "ctrl"}</span>
        {ctx?.label && <span className="label">{ctx.label}</span>}
        <button className="close" title="Turn off the companion (Settings → Companion)" onClick={() => window.companion.close()}>
          <Icon name="close" />
        </button>
      </div>
      {view && !view.trusted && (
        <button className="access" onClick={() => window.companion.requestAccess()}>
          <Icon name="alert" />
          <span>Allow Accessibility for ctrl to read Slack, Notion and Linear</span>
        </button>
      )}
      {view?.sessions.length ? (
        <div className="list">
          {view.sessions.map((s) => (
            <button key={s.id} className={`session ${s.archived ? "archived" : ""}`} onClick={() => window.companion.open(s.id)}>
              <span className="status">
                <StatusIcon status={s.status} />
              </span>
              <span className="text">
                <span className="title">{s.title || "Untitled"}</span>
                {!s.exact && <span className="via">via {s.via}</span>}
              </span>
              <span className="age">{s.archived ? "archived" : age(s.last)}</span>
            </button>
          ))}
        </div>
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
