"use client"
import Link from "next/link"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Trash2, ChevronRight, Eye, EyeOff, Check, ExternalLink, Sparkles } from "lucide-react"
import {
  getAnthropicKey,
  setAnthropicKey,
  clearAnthropicKey,
  hasAnthropicKey,
  looksLikeAnthropicKey,
} from "@/lib/byok"
import { getSavedServers, deleteSavedServer, type SavedServer } from "@/lib/savedServers"

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
  const [savedKeyState, setSavedKeyState] = useState<string | null>(null)

  useEffect(() => {
    document.fonts.ready.then(() => requestAnimationFrame(() => setPageReady(true)))
    setServers(getSavedServers())
    setSavedKeyState(getAnthropicKey())
  }, [])

  // Re-read on focus — handles building a server in another tab
  useEffect(() => {
    const onFocus = () => {
      setServers(getSavedServers())
      setSavedKeyState(getAnthropicKey())
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
    setSavedKeyState(trimmed)
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

  function handleClearKey() {
    clearAnthropicKey()
    setSavedKeyState(null)
  }

  function handleBuildClick() {
    withKey(() => router.push("/create"))
  }

  function handleServerClick(serverId: string) {
    withKey(() => router.push(`/sandbox?specId=${encodeURIComponent(serverId)}`))
  }

  function handleDeleteConfirm() {
    if (!confirmDelete) return
    const id = confirmDelete
    setConfirmDelete(null)
    deleteSavedServer(id)
    setServers(getSavedServers())
  }

  const maskedKey = savedKeyState
    ? `${savedKeyState.slice(0, 10)}••••••••${savedKeyState.slice(-4)}`
    : null

  return (
    <div className={cn("min-h-screen transition-opacity duration-500", pageReady ? "opacity-100" : "opacity-0")}>
      {/* ── Star constellation layer (decorative) ─────────────────────── */}
      {servers.length > 0 && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
          {servers.map(server => (
            <div
              key={`star-${server.id}`}
              className="absolute"
              style={{
                left: `${server.starX}%`,
                top: `${server.starY}vh`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: 18,
                  height: 18,
                  background: "radial-gradient(circle, rgba(255,220,140,0.95) 0%, rgba(255,180,80,0.55) 40%, rgba(255,140,40,0) 75%)",
                  filter: "blur(0.4px)",
                }}
              />
            </div>
          ))}
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
          <Link href="/info" className="group relative font-[family-name:--font-cinzel] text-[15px] tracking-[0.15em] px-5 py-2.5 text-white/60 hover:text-white transition-all duration-200 cursor-pointer hover:-translate-y-[1px]">
            Info
            <span className="absolute bottom-1 left-5 right-5 h-[1px] bg-white/70 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
          </Link>
          {savedKeyState && (
            <button
              onClick={handleClearKey}
              title={`Key: ${maskedKey} — click to clear`}
              className="group relative font-[family-name:--font-cinzel] text-[15px] tracking-[0.15em] px-5 py-2.5 text-white/60 hover:text-white transition-all duration-200 cursor-pointer hover:-translate-y-[1px]"
            >
              Sign Out
              <span className="absolute bottom-1 left-5 right-5 h-[1px] bg-white/70 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
            </button>
          )}
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
          <div className="max-w-5xl mx-auto">
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
                Save & Continue
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
    </div>
  )
}
