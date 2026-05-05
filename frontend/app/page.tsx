"use client"
import Link from "next/link"
import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Trash2, ChevronRight, Eye, EyeOff, Check, ExternalLink, Sparkles } from "lucide-react"
import {
  getAnthropicKey,
  setAnthropicKey,
  hasAnthropicKey,
  looksLikeAnthropicKey,
} from "@/lib/byok"
import { getSavedServers, deleteSavedServer, type SavedServer } from "@/lib/savedServers"
import { TourOverlay } from "@/app/components/TourOverlay"
import { DASHBOARD_TOUR, FIRST_STAR_TOUR } from "@/lib/tourSteps"
import { API_BASE } from "@/lib/apiBase"
import { SERVER_STAR_COLORS, hashStr } from "@/lib/serverStars"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

export default function Home() {
  const router = useRouter()
  const [pageReady, setPageReady] = useState(false)
  const [servers, setServers] = useState<SavedServer[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // BYOK modal — only opens when an action requires the key
  const [keyModalOpen, setKeyModalOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [keyInput, setKeyInput] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  /** ID of the server that was just created — gets a one-time entrance animation. */
  const [newStarId, setNewStarId] = useState<string | null>(null)
  /** Becomes true after the shooting-star arrival animation has had time to
   *  settle (~4.5s). Used to delay the first-star tour bubble until the star
   *  is in its final spot. */
  const [firstStarTourReady, setFirstStarTourReady] = useState(false)
  /** "initial" while constellation lines are being drawn for the first time;
   *  flips to "steady" once they're all painted so subsequent re-renders
   *  don't restart the draw animation. */
  const [animateMode, setAnimateMode] = useState<"initial" | "steady">("initial")

  useEffect(() => {
    document.fonts.ready.then(() => requestAnimationFrame(() => setPageReady(true)))
    setServers(getSavedServers())
    setCurrentKey(getAnthropicKey())
    // Pull (and consume) the new-server flag so we can play an entrance
    // animation on that star exactly once.
    const justCreated = sessionStorage.getItem("helios_new_server")
    if (justCreated) {
      setNewStarId(justCreated)
      sessionStorage.removeItem("helios_new_server")
      // The shooting entry runs for 2.5s after a 1.5s delay = 4s total.
      // Wait for it to settle, then enable the first-star tour mount.
      // We deliberately keep newStarId set after this — the .is-new class
      // becomes visually neutral once the animation finishes (CSS uses `both`
      // so the end state is the same as default), and we need the data-tour-id
      // to stay on the star for as long as the tour is open.
      setTimeout(() => setFirstStarTourReady(true), 4200)
    }
    // Wake the Render free-tier container while the user is reading the
    // dashboard. Cold start is ~30-50s; doing this here means the sandbox/try
    // pages don't get a long stall on the first real request. Fire-and-forget.
    fetch(`${API_BASE}/api/health`).catch(() => {})
  }, [])

  // Re-read on focus — handles building a server in another tab
  useEffect(() => {
    const onFocus = () => {
      setServers(getSavedServers())
      setCurrentKey(getAnthropicKey())
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  // Anything that needs the key calls this. If key is set, run immediately.
  // If not, queue the action and open the modal — modal's save handler runs it.
  function withKey(action: () => void) {
    if (hasAnthropicKey()) {
      action()
      return
    }
    setPendingAction(() => action)
    setKeyInput("")
    setKeyError(null)
    setShowKey(false)
    setKeyModalOpen(true)
  }

  function handleSaveKey() {
    const trimmed = keyInput.trim()
    if (!trimmed) {
      setKeyError("Paste a key first.")
      return
    }
    if (!looksLikeAnthropicKey(trimmed)) {
      setKeyError("That doesn't look like an Anthropic key — they start with sk-ant-.")
      return
    }
    setAnthropicKey(trimmed)
    setCurrentKey(trimmed)
    setKeyError(null)
    setKeyModalOpen(false)
    // Run the queued action now that the key exists
    if (pendingAction) {
      const fn = pendingAction
      setPendingAction(null)
      // Defer to next tick so the modal close animation isn't fighting navigation
      setTimeout(fn, 0)
    }
  }

  function handleBuildClick() {
    withKey(() => router.push("/create"))
  }

  // Open the modal as a settings dialog — no pending action to run after save.
  function handleOpenKeyModal() {
    setPendingAction(null)
    setKeyInput("")
    setKeyError(null)
    setShowKey(false)
    setKeyModalOpen(true)
  }

  function handleServerClick(serverId: string) {
    // Stars open the LIVE Try mode — that's where users actually exercise the
    // server they built. Sandbox (simulation mode) is only relevant during the
    // build flow and is reachable via the in-app nav from /try.
    withKey(() => router.push(`/try?specId=${encodeURIComponent(serverId)}`))
  }

  // ── Constellation edges ──────────────────────────────────────────────────
  // Each star gets 1-3 connections (hash-seeded max degree per star), greedy
  // shortest-pair-first assignment. Every star is guaranteed at least one
  // connection. Draw delays are computed via BFS from the rightmost star so
  // the constellation appears to "light up" from one end.
  const constellationEdges = useMemo(() => {
    const valid = servers.filter(s => s.starX != null && s.starY != null)
    if (valid.length < 2) return []

    const maxDeg = (s: SavedServer) => (hashStr(s.id + "deg") % 3) + 1
    const degree = new Map<string, number>()
    valid.forEach(s => degree.set(s.id, 0))

    const pairs: Array<{ a: SavedServer; b: SavedServer; dist: number }> = []
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        const a = valid[i], b = valid[j]
        const dx = a.starX - b.starX
        const dy = a.starY - b.starY
        pairs.push({ a, b, dist: Math.sqrt(dx * dx + dy * dy) })
      }
    }
    pairs.sort((x, y) => x.dist - y.dist)

    const seen = new Set<string>()
    const edges: Array<[SavedServer, SavedServer]> = []

    const tryAdd = (a: SavedServer, b: SavedServer): boolean => {
      const key = [a.id, b.id].sort().join("|")
      if (seen.has(key)) return false
      if (degree.get(a.id)! >= maxDeg(a)) return false
      if (degree.get(b.id)! >= maxDeg(b)) return false
      seen.add(key)
      edges.push([a, b])
      degree.set(a.id, degree.get(a.id)! + 1)
      degree.set(b.id, degree.get(b.id)! + 1)
      return true
    }
    for (const p of pairs) tryAdd(p.a, p.b)

    // Guarantee: any orphan star force-connects to its nearest partner.
    for (const s of valid) {
      if (degree.get(s.id)! > 0) continue
      for (const { a, b } of pairs) {
        const other = a.id === s.id ? b : b.id === s.id ? a : null
        if (!other || degree.get(other.id)! >= 3) continue
        const key = [s.id, other.id].sort().join("|")
        if (seen.has(key)) continue
        seen.add(key)
        edges.push([s, other])
        degree.set(s.id, degree.get(s.id)! + 1)
        degree.set(other.id, degree.get(other.id)! + 1)
        break
      }
    }

    // BFS from rightmost star — each line's start delay = depth × draw duration.
    const DRAW_DUR = 1.4
    const adj = new Map<string, string[]>()
    valid.forEach(s => adj.set(s.id, []))
    edges.forEach(([a, b]) => {
      adj.get(a.id)!.push(b.id)
      adj.get(b.id)!.push(a.id)
    })
    const startNode = valid.reduce((best, s) => (s.starX > best.starX ? s : best), valid[0])
    const activationTime = new Map<string, number>()
    activationTime.set(startNode.id, 0)
    const queue = [startNode.id]
    while (queue.length > 0) {
      const curr = queue.shift()!
      const t = activationTime.get(curr)!
      for (const nbr of adj.get(curr) ?? []) {
        if (!activationTime.has(nbr)) {
          activationTime.set(nbr, t + DRAW_DUR)
          queue.push(nbr)
        }
      }
    }

    return edges.map(([a, b]) => {
      const tA = activationTime.get(a.id) ?? 0
      const tB = activationTime.get(b.id) ?? 0
      const [source, target] = tA <= tB ? [a, b] : [b, a]
      return { source, target, delay: Math.min(tA, tB) }
    })
  }, [servers])

  // Once the initial draw finishes, switch to steady so future re-renders
  // don't restart the draw animation.
  useEffect(() => {
    if (animateMode !== "initial" || constellationEdges.length === 0) return
    const maxDelay = constellationEdges.reduce((m, e) => Math.max(m, e.delay), 0)
    const t = setTimeout(() => setAnimateMode("steady"), (maxDelay + 1.4) * 1000 + 200)
    return () => clearTimeout(t)
  }, [constellationEdges, animateMode])

  function handleDeleteConfirm() {
    if (!confirmDelete) return
    const id = confirmDelete
    setConfirmDelete(null)
    deleteSavedServer(id)
    setServers(getSavedServers())
  }

  return (
    <div className={cn("min-h-screen transition-opacity duration-500", pageReady ? "opacity-100" : "opacity-0")}>
      {/* ── Constellation lines — between background and stars ──────── */}
      {constellationEdges.length > 0 && (
        <svg
          className="fixed inset-0 pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ zIndex: 2, width: "100vw", height: "100vh" }}
        >
          <defs>
            <linearGradient id="line-fade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="rgba(255,255,255,0.0)" />
              <stop offset="12%"  stopColor="rgba(255,255,255,0.55)" />
              <stop offset="88%"  stopColor="rgba(255,255,255,0.55)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.0)" />
            </linearGradient>
          </defs>
          {constellationEdges.map(({ source, target, delay }) => {
            const touchesNew = source.id === newStarId || target.id === newStarId
            // Steady mode: render fully drawn, no animation. Otherwise apply
            // the BFS-staggered draw (with extra delay for edges touching the
            // new star, so the line waits for the shooting-star arrival to
            // settle before connecting).
            if (animateMode === "steady" && !touchesNew) {
              return (
                <line
                  key={`${source.id}-${target.id}`}
                  x1={source.starX} y1={source.starY}
                  x2={target.starX} y2={target.starY}
                  stroke="url(#line-fade)"
                  strokeWidth="0.18"
                  strokeLinecap="round"
                  pathLength={1}
                  style={{ strokeDasharray: 1, strokeDashoffset: 0, opacity: 1 }}
                />
              )
            }
            const startDelay = touchesNew ? 4.2 : delay
            return (
              <line
                key={`${source.id}-${target.id}`}
                x1={source.starX} y1={source.starY}
                x2={target.starX} y2={target.starY}
                stroke="url(#line-fade)"
                strokeWidth="0.18"
                strokeLinecap="round"
                pathLength={1}
                style={{ animation: `constellation-draw 1.4s ease-out ${startDelay}s both` }}
              />
            )
          })}
        </svg>
      )}

      {/* ── Star constellation layer ──────────────────────────────────
          Restored from the original Helios. Each star uses .star-wrapper
          (positioning + 44px hit area) and .star-dot (4-pointed clip-path
          with per-server --star-color, --rotate-dur, --twinkle-dur,
          --twinkle-delay CSS vars). New stars get .is-new which triggers
          the shootingEntry animation + trail streak (CSS in globals.css). */}
      {servers.length > 0 && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 10 }}>
          {servers.map(server => {
            const h = hashStr(server.id)
            const size = 18 + (h % 3) * 4
            const twinkleDur = 2.5 + (h % 30) / 10
            const twinkleDelay = (h % 20) / 10
            const rotateDur = 20 + (h % 25)
            const starColor = SERVER_STAR_COLORS[h % SERVER_STAR_COLORS.length]
            const isNew = server.id === newStarId
            return (
              <div
                key={`star-${server.id}`}
                className={cn("star-wrapper", isNew ? "is-new" : "is-existing")}
                // Tag the most-recently-arrived star so the FIRST_STAR_TOUR
                // can target it. Stable for the lifetime of the dashboard
                // mount so the bubble doesn't lose its target mid-tour.
                data-tour-id={isNew ? "dashboard-first-star" : undefined}
                style={{
                  left: `${server.starX}%`,
                  top: `${server.starY}vh`,
                  transform: "translate(-50%, -50%)",
                }}
                onClick={() => handleServerClick(server.id)}
              >
                <div
                  className={cn("star-dot", isNew ? "is-new" : "is-existing")}
                  style={{
                    width: size,
                    height: size,
                    ["--twinkle-dur" as string]: `${twinkleDur}s`,
                    ["--twinkle-delay" as string]: `${twinkleDelay}s`,
                    ["--rotate-dur" as string]: `${rotateDur}s`,
                    ["--star-color" as string]: starColor,
                  }}
                />
                <span className="star-label">{server.id}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Sticky nav ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center px-8 h-[80px]">
        <div className="flex-1 flex items-center">
          <span
            className="font-[family-name:--font-cinzel] font-semibold text-[32px] tracking-[0.35em] pr-[0.35em] select-none"
            style={{ color: "#ffffff", textShadow: "0 0 40px rgba(255,255,255,0.15)" }}
          >
            HELIOS
          </span>
        </div>
        <div className="flex items-center justify-end gap-1">
          <Link data-tour-id="dashboard-info" href="/info" className="group relative font-[family-name:--font-cinzel] text-[15px] tracking-[0.15em] px-5 py-2.5 text-white/60 hover:text-white transition-all duration-200 cursor-pointer hover:-translate-y-[1px]">
            Info
            <span className="absolute bottom-1 left-5 right-5 h-[1px] bg-white/70 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
          </Link>
          <button
            data-tour-id="dashboard-key"
            onClick={handleOpenKeyModal}
            className="group relative font-[family-name:--font-cinzel] text-[15px] tracking-[0.15em] px-5 py-2.5 text-white/60 hover:text-white transition-all duration-200 cursor-pointer hover:-translate-y-[1px]"
          >
            Key
            <span className="absolute bottom-1 left-5 right-5 h-[1px] bg-white/70 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
          </button>
        </div>
      </div>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <div className="relative z-[6]">
        {/* ── Main CTA ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-center min-h-[60vh] pb-4">
          <div className="flex flex-col items-center gap-6 animate-fade-up">
            <p className="font-[family-name:--font-cinzel] text-[18px] tracking-[0.45em] uppercase text-white">
              MCP Server Generator
            </p>
            <button
              data-tour-id="dashboard-build"
              onClick={handleBuildClick}
              className="btn-gold font-[family-name:--font-cinzel] cursor-pointer px-20 py-7 text-[28px] tracking-[0.18em] rounded-2xl animate-gold-pulse"
            >
              Build Your Server
            </button>
            <p className="font-[family-name:--font-cormorant] text-[16px] italic text-white/85" style={{ letterSpacing: "0.04em" }}>
              Transform any API into an agent-ready MCP server
            </p>
            <p className="font-[family-name:--font-cormorant] text-[12px] italic text-white/40">
              Bring your own Anthropic key — runs entirely in this tab&apos;s session.
            </p>
          </div>
        </div>

        {/* ── Your Servers ─────────────────────────────────────────── */}
        <section className="px-16 pb-16">
          <div data-tour-id="dashboard-servers" className="max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-6 w-full">
              <div className="flex-1 h-[2px] bg-white/[0.30]" />
              <h2 className="font-[family-name:--font-cinzel] text-[18px] tracking-[0.3em] text-white/65 uppercase">
                Your Servers
              </h2>
              <div className="flex-1 h-[2px] bg-white/[0.30]" />
            </div>

            <div className="flex flex-wrap gap-5 justify-center">
              {servers.length === 0 ? (
                <span className="font-[family-name:--font-cinzel] text-white/50 text-[13px] tracking-widest">
                  No servers yet — build one above.
                </span>
              ) : (
                servers.map(server => (
                  <div
                    key={server.id}
                    onClick={() => handleServerClick(server.id)}
                    className="w-[260px] aspect-[4/3] relative z-[0] rounded-2xl cursor-pointer"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 pointer-events-none rounded-2xl"
                      style={{
                        backgroundImage: "var(--page-bg, url('/Background-Midnight(1).jpg'))",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundAttachment: "fixed",
                        filter: "blur(8px) saturate(1.2) brightness(0.72)",
                      }}
                    />
                    <div
                      className={cn(
                        "glass rounded-2xl w-full h-full",
                        "flex flex-col justify-between px-6 py-6",
                        "hover:-translate-y-2 hover:scale-[1.03] hover:bg-white/[0.13] hover:border-white/[0.2]",
                        "hover:shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.18)]",
                        "transition-all duration-250 ease-out group relative",
                      )}
                    >
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelete(server.id) }}
                        className="absolute top-3 right-3 z-10 p-1.5 text-[#C9A84C]/60 hover:text-[#C9A84C]
                          transition-colors duration-200 cursor-pointer"
                        aria-label="Delete server"
                      >
                        <Trash2 size={20} strokeWidth={1.5} />
                      </button>

                      <div className="flex flex-col gap-1">
                        <span className="font-[family-name:--font-cinzel] text-[20px] tracking-wider leading-snug text-white/90 group-hover:text-white transition-colors duration-250 break-words">
                          {server.id}
                        </span>
                        <span className="font-[family-name:--font-geist-mono] text-[10px] text-white/55 truncate">
                          {server.baseUrl || "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-[family-name:--font-cinzel] text-[11px] tracking-widest text-white/65">
                          {server.toolCount} tools
                        </span>
                        <div className="flex items-center gap-1.5 text-[#C9A84C]/50 group-hover:text-[#C9A84C] group-hover:translate-x-0.5 transition-all duration-250">
                          <span className="font-[family-name:--font-geist-mono] text-[10px]">
                            {server.createdAt ? new Date(server.createdAt).toLocaleDateString() : "—"}
                          </span>
                          <ChevronRight size={12} strokeWidth={1.5} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── BYOK Modal — opens when an action needs the key ─────────── */}
      {keyModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setKeyModalOpen(false)} />
          <div className="relative z-[1] glass-mid rounded-3xl px-10 py-9 w-full max-w-[480px] flex flex-col gap-6
            shadow-[0_30px_80px_rgba(0,0,0,0.5)] animate-fade-up">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <Sparkles size={18} className="text-[#C9A84C]" />
                <h2 className="font-[family-name:--font-cinzel] text-[18px] tracking-[0.18em] text-white/95 uppercase">
                  Anthropic API Key
                </h2>
              </div>
              <p className="font-[family-name:--font-cormorant] text-[14px] italic text-white/55">
                Stored only in this tab&apos;s session storage. Never persisted server-side. Cleared when you close the tab.
              </p>
              {currentKey && (
                <div className="mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                  <div className="font-[family-name:--font-cinzel] text-[10px] tracking-[0.18em] text-white/45 uppercase mb-1">
                    Currently set
                  </div>
                  <code className="font-[family-name:--font-geist-mono] text-[12px] text-white/70 tracking-wider">
                    {currentKey.slice(0, 12)}••••••••{currentKey.slice(-4)}
                  </code>
                  <div className="font-[family-name:--font-cormorant] text-[12px] italic text-white/40 mt-1">
                    Paste a new key below to replace it.
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={e => { setKeyInput(e.target.value); setKeyError(null) }}
                onKeyDown={e => { if (e.key === "Enter") handleSaveKey() }}
                placeholder="sk-ant-api03-..."
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="w-full pl-4 pr-12 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.12]
                  font-[family-name:--font-geist-mono] text-[13px] text-white/90 placeholder:text-white/30
                  focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                onClick={() => setShowKey(s => !s)}
                aria-label={showKey ? "Hide key" : "Show key"}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white/80 transition-colors"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {keyError && (
              <p className="font-[family-name:--font-cormorant] text-[14px] italic text-red-300/90 -mt-2">
                {keyError}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSaveKey}
                className="btn-gold cursor-pointer rounded-xl py-3.5 font-[family-name:--font-cinzel] text-[14px] tracking-[0.15em]"
              >
                {pendingAction ? "Save & Continue" : currentKey ? "Replace Key" : "Save Key"}
              </button>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="self-center flex items-center gap-1.5 text-[13px] text-white/45 hover:text-white/75 font-[family-name:--font-cormorant] italic transition-colors"
              >
                Don&apos;t have one? Get a key from console.anthropic.com
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete confirmation modal ─────────────────────────────── */}
      {confirmDelete && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-[1] glass-mid rounded-3xl px-12 py-10 flex flex-col items-center gap-6
            shadow-[0_32px_80px_rgba(0,0,0,0.5)] animate-fade-up">
            <span className="font-[family-name:--font-cinzel] text-[20px] tracking-widest text-white/90">
              Delete Server?
            </span>
            <span className="font-[family-name:--font-cormorant] text-[16px] text-white/50 text-center">
              <span className="text-white/80 font-semibold">{confirmDelete}</span> will be removed from this session.
            </span>
            <div className="flex gap-4">
              <button
                onClick={() => setConfirmDelete(null)}
                className="font-[family-name:--font-cinzel] cursor-pointer px-8 py-3 text-[13px] tracking-widest
                  glass rounded-xl text-white/55 hover:text-white hover:bg-white/[0.11] transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="font-[family-name:--font-cinzel] cursor-pointer px-8 py-3 text-[13px] tracking-widest
                  bg-red-500/80 hover:bg-red-500 text-white rounded-xl border border-red-400/40
                  transition-all duration-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── First-visit guided tour ───────────────────────────────── */}
      <TourOverlay tourId="dashboard" steps={DASHBOARD_TOUR} />
      {/* ── First-star tour: fires AFTER a new star arrives, only the very
          first time the user creates a server. Waits until the shooting-star
          arrival animation has settled (firstStarTourReady is set on a
          ~4.2s timer above), and only mounts when there's actually a star
          tagged data-tour-id="dashboard-first-star" to point at. */}
      {firstStarTourReady && newStarId && (
        <TourOverlay tourId="first-star" steps={FIRST_STAR_TOUR} />
      )}
    </div>
  )
}
