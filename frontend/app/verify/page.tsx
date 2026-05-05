"use client"
import { Suspense, useState, useEffect, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Check, Sparkles, ChevronLeft } from "lucide-react"
import { addSavedServer, getSavedServers } from "@/lib/savedServers"

const cn = (...c: (string | undefined | null | false)[]) => c.filter(Boolean).join(" ")

const NAME_REGEX = /^[a-zA-Z0-9_-]{1,32}$/

interface PendingRegistry {
  schema_version?: number
  baseUrl?: string
  tools: Array<{ name: string; enabled?: boolean; handler?: { method?: string }; }>
  auth?: unknown
}

function VerifyContent() {
  const params = useSearchParams()
  const router = useRouter()
  const pendingId = params.get("pending")  // session key under which the registry was saved

  const [pageReady, setPageReady] = useState(false)
  const [registry, setRegistry] = useState<PendingRegistry | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.fonts.ready.then(() => requestAnimationFrame(() => setPageReady(true)))
  }, [])

  // Load the pending registry that sandbox staged for us. If it's missing
  // (e.g. user navigated here directly), bounce back home.
  useEffect(() => {
    if (!pendingId) { router.replace("/"); return }
    const raw = sessionStorage.getItem(`helios_registry_${pendingId}`)
    if (!raw) { router.replace("/"); return }
    try {
      const parsed = JSON.parse(raw) as PendingRegistry
      setRegistry(parsed)
    } catch {
      router.replace("/")
    }
  }, [pendingId, router])

  const stats = useMemo(() => {
    if (!registry) return { tools: 0, base: "" }
    const enabled = registry.tools.filter(t => t.enabled !== false).length
    return { tools: enabled, base: registry.baseUrl || "—" }
  }, [registry])

  function handleConfirm() {
    if (!registry || !pendingId) return

    const trimmed = name.trim()
    if (!trimmed) { setError("Give your server a name."); return }
    if (!NAME_REGEX.test(trimmed)) {
      setError("Use 1–32 letters, numbers, hyphens, or underscores only.")
      return
    }
    // Reject duplicates so the dashboard doesn't get two cards with the same name.
    if (getSavedServers().some(s => s.id === trimmed)) {
      setError(`A server named "${trimmed}" already exists. Pick a different name.`)
      return
    }

    setError(null)

    // Re-key the registry under the chosen name and drop the temp key.
    sessionStorage.setItem(`helios_registry_${trimmed}`, JSON.stringify(registry))
    if (pendingId !== trimmed) sessionStorage.removeItem(`helios_registry_${pendingId}`)

    // Add to dashboard list (computes a star position) + flag for entry animation.
    addSavedServer({ id: trimmed, baseUrl: registry.baseUrl || "", toolCount: stats.tools })
    sessionStorage.setItem("helios_new_server", trimmed)

    router.push(`/download?specId=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className={cn("min-h-screen relative flex flex-col", pageReady ? "animate-page-enter" : "opacity-0")}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="relative z-30 flex items-center px-8 h-[93px] flex-shrink-0">
        <div className="flex-1 flex items-center">
          <div className="relative">
            <Link href="/" className="absolute inset-0 cursor-pointer z-10" aria-label="Home" />
            <span className="font-[family-name:--font-cinzel] font-semibold text-[32px] tracking-[0.35em] pr-[0.35em] select-none pointer-events-none"
              style={{ color: "#ffffff", textShadow: "0 0 40px rgba(255,255,255,0.15)" }}>
              HELIOS
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 font-[family-name:--font-cinzel] text-[22px] tracking-[0.18em]">
          <Link href="/create" className="step-inactive cursor-pointer">Create</Link>
          <span className="step-divider text-[10px]">✦</span>
          <span className="step-inactive">Sandbox</span>
          <span className="step-divider text-[10px]">✦</span>
          <span className="step-active pb-1">Verify</span>
          <span className="step-divider text-[10px]">✦</span>
          <span className="step-inactive">Download</span>
        </div>
        <div className="flex-1" />
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="glass-mid rounded-3xl px-12 py-10 w-full max-w-[560px] flex flex-col gap-7
          shadow-[0_40px_100px_rgba(0,0,0,0.4)] animate-fade-up relative overflow-hidden z-[0]">
          <div aria-hidden="true" className="absolute pointer-events-none" style={{
            inset: '-50px', backgroundImage: "var(--page-bg, url('/Background-Sunrise(3).jpg'))",
            backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
            filter: 'blur(8px) saturate(1.2) brightness(0.72)', zIndex: -1,
          }} />

          {/* Header — confirm icon + heading */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "rgba(201,168,76,0.15)", border: "2px solid rgba(201,168,76,0.45)" }}>
              <Sparkles size={22} style={{ color: "#E8C46A" }} />
            </div>
            <h1 className="font-[family-name:--font-cinzel] text-[26px] tracking-[0.06em] text-white/95">
              Name Your Server
            </h1>
            <p className="font-[family-name:--font-cormorant] italic text-[15px] text-white/55 text-center">
              Pick a name — this is how it&apos;ll show up on your dashboard and in the downloaded zip.
            </p>
          </div>

          {/* Stats row */}
          {registry && (
            <div className="flex items-center justify-around glass rounded-xl py-3 px-5 gap-6">
              <div className="flex flex-col items-center gap-0.5">
                <span className="font-[family-name:--font-cinzel] text-[18px] text-white/90">{stats.tools}</span>
                <span className="font-[family-name:--font-cinzel] text-[10px] tracking-[0.18em] text-white/45 uppercase">Tools</span>
              </div>
              <div className="h-8 w-px bg-white/15" />
              <div className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
                <span className="font-[family-name:--font-geist-mono] text-[12px] text-white/80 truncate max-w-full">
                  {stats.base || "composite"}
                </span>
                <span className="font-[family-name:--font-cinzel] text-[10px] tracking-[0.18em] text-white/45 uppercase">Base URL</span>
              </div>
            </div>
          )}

          {/* Name input */}
          <div className="flex flex-col gap-2">
            <label className="font-[family-name:--font-cinzel] text-[11px] tracking-[0.22em] text-white/60 uppercase">
              Server Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              onKeyDown={e => { if (e.key === "Enter") handleConfirm() }}
              placeholder="e.g. github_dev, twilio_sms, my_server"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.12]
                font-[family-name:--font-geist-mono] text-[14px] text-white/90 placeholder:text-white/30
                focus:outline-none focus:border-[#C9A84C]/50 transition-colors"
            />
            <p className="font-[family-name:--font-cormorant] italic text-[13px] text-white/40">
              Letters, numbers, hyphens, underscores. Up to 32 chars.
            </p>
            {error && (
              <p className="font-[family-name:--font-cormorant] italic text-[14px] text-red-300/90">
                {error}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleConfirm}
              disabled={!registry}
              className="btn-gold cursor-pointer rounded-xl py-3.5 flex items-center justify-center gap-2.5
                font-[family-name:--font-cinzel] text-[13px] tracking-[0.14em] disabled:opacity-50"
            >
              <Check size={16} strokeWidth={2} />
              Save & Continue to Download
            </button>
            <button
              onClick={() => router.back()}
              className="cursor-pointer rounded-xl py-3 flex items-center justify-center gap-1.5
                font-[family-name:--font-cinzel] text-[12px] tracking-[0.14em] text-white/55 hover:text-white
                transition-colors"
            >
              <ChevronLeft size={14} />
              Back to Sandbox
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  )
}
