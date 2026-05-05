// Per-page guided tour types + persistence.
//
// Tours are shown ONCE per device (localStorage), not once per session — users
// shouldn't get re-toured every time they open a new tab.

import type { ReactNode } from "react"

export type Placement = "top" | "bottom" | "left" | "right" | "center"

export interface TourStep {
  /** CSS selector for the element to spotlight. Omit for a centered modal step. */
  target?: string
  /** Short headline above the body — Cinzel-styled in the bubble. */
  title: string
  /** Body copy — Cormorant italic. */
  body: string
  /** Where the bubble sits relative to the target. Defaults to "bottom". */
  placement?: Placement
  /** Optional JSX rendered inside the bubble below the body — used for the star demo. */
  extra?: ReactNode
  /** If true, the spotlight + bubble float in screen center (no target needed). */
  centered?: boolean
}

const STORAGE_PREFIX = "helios_tour_seen_"

function safeWindow(): boolean {
  return typeof window !== "undefined"
}

export function isTourSeen(tourId: string): boolean {
  if (!safeWindow()) return true  // SSR: don't trigger on server
  try {
    return localStorage.getItem(STORAGE_PREFIX + tourId) === "1"
  } catch {
    return false
  }
}

export function markTourSeen(tourId: string): void {
  if (!safeWindow()) return
  try { localStorage.setItem(STORAGE_PREFIX + tourId, "1") } catch {}
}

/** Dev / debug helper — clears all tour completions so they replay on next visit. */
export function resetAllTours(): void {
  if (!safeWindow()) return
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch {}
}
