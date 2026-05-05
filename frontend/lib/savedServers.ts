// Session-scoped saved server list — same shape the dashboard renders.
// Persists across page navigations within a tab; vanishes on close.
//
// We deliberately do NOT store the full tool registry here — that lives under
// `helios_registry_${id}` keys (already used by sandbox/try/download). This is
// just the dashboard metadata.

const KEY = "helios_saved_servers"

export interface SavedServer {
  id: string
  baseUrl: string
  toolCount: number
  createdAt: string  // ISO
  starX: number       // 0–100 (% across screen)
  starY: number       // 10–60 (vh from top)
}

function safeWindow(): boolean {
  return typeof window !== "undefined"
}

export function getSavedServers(): SavedServer[] {
  if (!safeWindow()) return []
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSavedServers(list: SavedServer[]): void {
  if (!safeWindow()) return
  sessionStorage.setItem(KEY, JSON.stringify(list))
}

/**
 * Stable star placement: same name → same position (within the session).
 * Avoids overlap with existing stars by hash-perturbing then nudging away
 * from neighbors. Pure function of the current list, no Math.random — so a
 * remount produces the same constellation.
 */
function assignStarPosition(name: string, existing: Array<{ starX: number; starY: number }>): { starX: number; starY: number } {
  // Cheap deterministic hash → 0..1
  let h = 5381
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0
  const seed = (Math.abs(h) || 1) >>> 0

  const r1 = ((seed * 9301 + 49297) % 233280) / 233280
  const r2 = ((seed * 16807 + 17711) % 233280) / 233280

  const side: "left" | "right" = r1 < 0.5 ? "left" : "right"
  let starX = side === "left" ? 6 + r1 * 60 : 38 + r2 * 56  // spread across the page
  let starY = 14 + r2 * 46

  // Nudge away from any neighbor closer than MIN_DIST
  const MIN_DIST = 9
  for (let attempt = 0; attempt < 8; attempt++) {
    const tooClose = existing.some(p => {
      const dx = p.starX - starX
      const dy = (p.starY - starY) * 0.55
      return Math.sqrt(dx * dx + dy * dy) < MIN_DIST
    })
    if (!tooClose) break
    starX += (attempt % 2 === 0 ? 1 : -1) * (3 + attempt)
    starY += (attempt % 2 === 0 ? -1 : 1) * (2 + attempt)
  }

  // Keep on screen
  starX = Math.max(4, Math.min(96, starX))
  starY = Math.max(10, Math.min(60, starY))

  return { starX, starY }
}

export function addSavedServer(input: { id: string; baseUrl: string; toolCount: number }): SavedServer {
  const list = getSavedServers()
  // Replace existing entry with the same id (rebuild)
  const filtered = list.filter(s => s.id !== input.id)
  const positions = filtered.map(s => ({ starX: s.starX, starY: s.starY }))
  const { starX, starY } = assignStarPosition(input.id, positions)
  const entry: SavedServer = {
    id: input.id,
    baseUrl: input.baseUrl,
    toolCount: input.toolCount,
    createdAt: new Date().toISOString(),
    starX,
    starY,
  }
  writeSavedServers([...filtered, entry])
  return entry
}

export function deleteSavedServer(id: string): void {
  const list = getSavedServers().filter(s => s.id !== id)
  writeSavedServers(list)
  // Best-effort: also drop the registry blob (sandbox/try/download read these)
  if (safeWindow()) {
    sessionStorage.removeItem(`helios_registry_${id}`)
  }
}
