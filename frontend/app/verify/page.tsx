"use client"
import { Suspense, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { addSavedServer, getSavedServers, deleteSavedServer } from "@/lib/savedServers"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

const METHOD_STYLES: Record<string, string> = {
  GET:    "method-get",
  POST:   "method-post",
  PUT:    "method-put",
  PATCH:  "method-patch",
  DELETE: "method-delete",
}

interface CatalogEntry {
  name: string
  description: string
  enabled: boolean
  input_schema: {
    type: string
    properties: Record<string, unknown>
    required?: string[]
  }
  handler: {
    method: string
    path: string
    headers?: Record<string, string>
    query_params: string[]
    fixed_query_params?: Record<string, string>
    param_name_map?: Record<string, string>
    body_format?: "json" | "form"
    auto_path_params?: Record<string, "auth_username">
  }
  enrichment?: unknown
}

interface PendingRegistry {
  schema_version?: number
  baseUrl?: string
  tools: CatalogEntry[]
  auth?: unknown
}

const NAME_REGEX = /^[a-zA-Z0-9_-]{1,32}$/

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pendingId = searchParams.get("pending")
  const fromComposite = searchParams.get("from_composite")
  const fromSpec = searchParams.get("from_spec")

  const [pageReady, setPageReady] = useState(false)
  useEffect(() => {
    document.fonts.ready.then(() => requestAnimationFrame(() => setPageReady(true)))
  }, [])

  // Load the pending registry that sandbox staged for us. Bounce home if missing.
  const [registry, setRegistry] = useState<PendingRegistry | null>(null)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingId) { router.replace("/"); return }
    const raw = sessionStorage.getItem(`helios_registry_${pendingId}`)
    if (!raw) { setLoadError("This server's data couldn't be found. It may have expired."); return }
    try {
      const parsed = JSON.parse(raw) as PendingRegistry
      setRegistry(parsed)
      setCatalog((parsed.tools ?? []).map(t => ({ ...t, enabled: t.enabled !== false })))
    } catch {
      setLoadError("This server's data is malformed. Try rebuilding it.")
    }
  }, [pendingId, router])

  const [serverName, setServerName] = useState("")
  const [nameError, setNameError]   = useState("")
  const [isSaving, setIsSaving]     = useState(false)
  const [editingSet, setEditingSet] = useState<Set<number>>(new Set())
  const [existingServerIds, setExistingServerIds] = useState<Set<string>>(new Set())
  const [showReplaceModal, setShowReplaceModal]   = useState(false)

  // Read the dashboard's current saved-server list once for duplicate-name check.
  useEffect(() => {
    setExistingServerIds(new Set(getSavedServers().map(s => s.id)))
  }, [])

  useEffect(() => {
    if (!showReplaceModal) return
    document.documentElement.classList.add("popup-open")
    return () => document.documentElement.classList.remove("popup-open")
  }, [showReplaceModal])

  const handleNameChange = (index: number, value: string) =>
    setCatalog(prev => prev.map((entry, i) => i === index ? { ...entry, name: value } : entry))
  const handleDescriptionChange = (index: number, value: string) =>
    setCatalog(prev => prev.map((entry, i) => i === index ? { ...entry, description: value } : entry))
  const handleToggle = (index: number) =>
    setCatalog(prev => prev.map((entry, i) => i === index ? { ...entry, enabled: !entry.enabled } : entry))
  const toggleEdit = (index: number) =>
    setEditingSet(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index); else next.add(index)
      return next
    })

  const totalCount   = catalog.length
  const enabledCount = catalog.filter(e => e.enabled).length
  const disabledCount = totalCount - enabledCount

  const methodCounts: Record<string, number> = {}
  catalog.forEach(e => {
    const m = e.handler?.method?.toUpperCase() ?? "OTHER"
    methodCounts[m] = (methodCounts[m] ?? 0) + 1
  })
  const methodOrder = ["GET", "POST", "PUT", "PATCH", "DELETE"]
  const methodStatsStr = methodOrder
    .filter(m => methodCounts[m])
    .map(m => `${methodCounts[m]} ${m}`)
    .join(" · ")

  const trimmedName = serverName.trim()
  const nameConflicts = trimmedName.length > 0 && existingServerIds.has(trimmedName)

  const persistAndGo = (replace: boolean) => {
    if (!registry || !pendingId) return
    if (!trimmedName) { setNameError("Server name is required."); return }
    if (!NAME_REGEX.test(trimmedName)) {
      setNameError("Use 1–32 letters, numbers, hyphens, or underscores only.")
      return
    }
    if (enabledCount === 0) { setNameError("Enable at least one tool before saving."); return }

    setIsSaving(true); setNameError("")

    // Build the final registry with the user's edits applied
    const finalRegistry: PendingRegistry = {
      ...registry,
      tools: catalog,  // contains user-edited names, descriptions, enabled flags
    }

    // If replacing, drop the previous entry first so addSavedServer's dedup
    // doesn't preserve stale star coordinates from the old version.
    if (replace) deleteSavedServer(trimmedName)

    sessionStorage.setItem(`helios_registry_${trimmedName}`, JSON.stringify(finalRegistry))
    if (pendingId !== trimmedName) sessionStorage.removeItem(`helios_registry_${pendingId}`)

    addSavedServer({
      id: trimmedName,
      baseUrl: registry.baseUrl ?? "",
      toolCount: enabledCount,
    })
    sessionStorage.setItem("helios_new_server", trimmedName)

    // ── Build-flow cleanup ─────────────────────────────────────────
    // The user has committed. Drop the working set + spec drafts from /create
    // and the compositeId-keyed sandbox session blobs that fed this build.
    // These are scratch space, not history; clearing them here means the next
    // /create visit starts blank instead of rehydrating stale tools.
    sessionStorage.removeItem("helios_create_tools")
    sessionStorage.removeItem("helios_create_form")
    if (fromComposite) {
      sessionStorage.removeItem(`helios_session_${fromComposite}`)
      sessionStorage.removeItem(`helios_groups_${fromComposite}`)
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith("helios_draft_")) sessionStorage.removeItem(k)
    }

    router.push(`/download?specId=${encodeURIComponent(trimmedName)}`)
  }

  const attemptSave = () => {
    if (nameConflicts) { setShowReplaceModal(true); return }
    persistAndGo(false)
  }

  const confirmReplace = () => {
    setShowReplaceModal(false)
    persistAndGo(true)
  }

  // Back to the exact same sandbox session, not a blank /sandbox. Whichever
  // path got us here (composite or spec) determines the URL shape.
  const backHref = fromComposite
    ? `/sandbox?compositeId=${encodeURIComponent(fromComposite)}${fromSpec ? `&specId=${encodeURIComponent(fromSpec)}` : ""}`
    : fromSpec
    ? `/sandbox?specId=${encodeURIComponent(fromSpec)}`
    : "/"

  return (
    <div className={cn("flex flex-col h-screen w-full relative overflow-hidden", pageReady ? "animate-page-enter" : "opacity-0")}>

      {/* ── Header ───────────────────────────────────────────────────── */}
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
          <Link href={backHref} className="step-inactive cursor-pointer">Sandbox</Link>
          <span className="step-divider text-[10px]">✦</span>
          <span className="step-active pb-1">Verify</span>
          <span className="step-divider text-[10px]">✦</span>
          <span className="step-inactive">Download</span>
        </div>
        <div className="flex-1" />
      </div>

      {/* ── Main panel ──────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-4 pt-4 pb-12 min-h-0">
        <div
          className="glass-mid rounded-3xl w-full max-w-[900px] flex flex-col overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.4)] animate-fade-up relative z-[0]"
          style={{ maxHeight: "calc(100vh - 140px)", minHeight: "500px" }}
        >
          <div aria-hidden="true" className="absolute pointer-events-none" style={{
            inset: '-50px',
            backgroundImage: "var(--page-bg, url('/Background-Midday(4).jpg'))",
            backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
            filter: 'blur(18px) saturate(1.3) brightness(0.72)', zIndex: -1,
          }} />

          {/* ── Panel header ────────────────────────────────────────── */}
          <div className="px-8 py-5 flex items-center justify-between flex-shrink-0">
            <h1 className="font-[family-name:--font-cinzel] text-[20px] tracking-wide text-white/90">
              Tool Catalog
            </h1>
            {totalCount > 0 && (
              <span className="font-[family-name:--font-geist-mono] text-[11px] text-white/70 tracking-wide">
                {totalCount} tools&nbsp;·&nbsp;{enabledCount} enabled&nbsp;·&nbsp;{disabledCount} disabled
                {methodStatsStr ? <>&nbsp;·&nbsp;{methodStatsStr}</> : null}
              </span>
            )}
          </div>

          {/* ── Server name input ───────────────────────────────────── */}
          <div className="px-8 pb-4 flex-shrink-0 flex flex-col gap-1.5">
            <label className="font-[family-name:--font-cinzel] text-[14px] tracking-[0.2em] text-white uppercase">
              Server Name
            </label>
            <input
              type="text"
              value={serverName}
              onChange={e => { setServerName(e.target.value); setNameError("") }}
              placeholder="my-server-name"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              className="glass-input rounded-xl px-4 py-3 text-[17px] font-[family-name:--font-cinzel] tracking-wider !border-white/60 !text-white"
            />
            <span className="h-[14px] font-[family-name:--font-cinzel] text-[11px] tracking-wider">
              {nameError
                ? <span className="text-red-400">{nameError}</span>
                : nameConflicts
                ? <span className="text-amber-400/80">A server named &ldquo;{trimmedName}&rdquo; already exists — saving will replace it.</span>
                : <span className="text-white/35">Letters, numbers, hyphens, underscores. Up to 32 chars.</span>}
            </span>
          </div>

          <div className="h-px bg-white/[0.09] flex-shrink-0 mx-0" />

          {/* ── Scrollable tool list ─────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadError ? (
              <div className="flex items-center justify-center h-40">
                <span className="font-[family-name:--font-cinzel] text-red-400 text-[13px] tracking-widest">{loadError}</span>
              </div>
            ) : catalog.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <span className="font-[family-name:--font-cinzel] text-white/55 text-[13px] tracking-widest">Loading catalog...</span>
              </div>
            ) : (
              catalog.map((entry, i) => {
                const isEditing = editingSet.has(i)
                return (
                  <div
                    key={i}
                    className={cn(
                      "border-b border-white/[0.06]",
                      entry.enabled ? "bg-transparent" : "bg-black/[0.10]",
                      !isEditing && "hover:bg-white/[0.04]"
                    )}
                  >
                    <div className="flex items-center gap-3 pl-8 pr-6 py-5">
                      {/* Toggle */}
                      <div
                        onClick={() => handleToggle(i)}
                        className={cn(
                          "flex-shrink-0 w-5 h-5 rounded flex items-center justify-center cursor-pointer border",
                          entry.enabled
                            ? "border-[#C9A84C]/60 bg-[#C9A84C]/20"
                            : "border-white/[0.18] bg-transparent"
                        )}
                      >
                        {entry.enabled && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3L3.5 5.5L8 1" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      {/* Method badge */}
                      {entry.handler?.method && (
                        <span className={cn(
                          "flex-shrink-0 font-[family-name:--font-geist-mono] text-[9px] tracking-widest px-1.5 py-0.5 rounded",
                          entry.enabled
                            ? (METHOD_STYLES[entry.handler.method.toUpperCase()] ?? "method-get")
                            : "bg-white/[0.04] text-white/20 border border-white/[0.07]"
                        )}>
                          {entry.handler.method.toUpperCase()}
                        </span>
                      )}

                      {/* Name + description */}
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className={cn(
                          "font-[family-name:--font-cinzel] text-[14px] tracking-wider truncate",
                          entry.enabled ? "text-white/85" : "text-white/30"
                        )}>
                          {entry.name}
                        </span>
                        {entry.description && (
                          <span className="font-[family-name:--font-cormorant] text-[14px] text-white/60 leading-snug truncate">
                            {entry.description}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => toggleEdit(i)}
                        className={cn(
                          "flex-shrink-0 font-[family-name:--font-cinzel] text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 rounded-lg border cursor-pointer",
                          isEditing
                            ? "border-[#C9A84C]/50 bg-[#C9A84C]/15 text-[#C9A84C]"
                            : "border-white/[0.12] text-white/55 hover:border-white/25 hover:text-white/65"
                        )}
                      >
                        {isEditing ? "Done" : "Edit"}
                      </button>
                    </div>

                    {isEditing && (
                      <div className="px-6 pb-5 pt-1 flex flex-col gap-3 bg-white/[0.025]">
                        <div className="flex flex-col gap-1">
                          <label className="font-[family-name:--font-cinzel] text-[9px] tracking-[0.2em] text-white/55 uppercase">Tool Name</label>
                          <input
                            type="text"
                            value={entry.name}
                            onChange={e => handleNameChange(i, e.target.value)}
                            className="glass-input rounded-lg px-3 py-2 text-[12px] font-[family-name:--font-cinzel] tracking-wider"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="font-[family-name:--font-cinzel] text-[9px] tracking-[0.2em] text-white/55 uppercase">Description</label>
                          <textarea
                            value={entry.description}
                            onChange={e => {
                              handleDescriptionChange(i, e.target.value)
                              e.target.style.height = "auto"
                              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
                            }}
                            rows={2}
                            className="glass-input rounded-lg px-3 py-2 text-[13px] font-[family-name:--font-cormorant] leading-snug resize-none"
                          />
                        </div>
                        {entry.handler?.path && (
                          <span className="font-[family-name:--font-geist-mono] text-[10px] text-white/45">{entry.handler.path}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* ── Footer actions ──────────────────────────────────────── */}
          <div className="border-t border-white/[0.09] px-6 py-4 flex-shrink-0 flex flex-col gap-3">
            <div className="flex gap-3">
              <Link href={backHref} className="flex-1">
                <button className="font-[family-name:--font-cinzel] w-full cursor-pointer py-3.5 text-[13px] tracking-[0.15em]
                  glass rounded-xl text-white/75 !border-white/60 transition-all duration-200
                  hover:text-white hover:bg-white/[0.14] hover:!border-white/90 hover:-translate-y-[1px]
                  hover:shadow-[0_6px_28px_rgba(255,255,255,0.22)]">
                  ← Back to Sandbox
                </button>
              </Link>
              <button
                onClick={attemptSave}
                disabled={isSaving || !registry}
                className={cn(
                  "flex-1 font-[family-name:--font-cinzel] py-3.5 text-[13px] tracking-[0.15em] rounded-xl",
                  isSaving || !registry
                    ? "cursor-not-allowed bg-white/[0.06] border border-white/[0.12] text-white/25"
                    : "btn-gold cursor-pointer"
                )}
              >
                {isSaving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── Replace-confirmation modal ──────────────────────────────── */}
      {showReplaceModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20"
          onClick={() => setShowReplaceModal(false)}
        >
          <div
            className="glass-mid rounded-2xl px-7 py-6 w-[420px] max-w-[92vw] flex flex-col gap-5"
            style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2">
              <h3 className="font-[family-name:--font-cinzel] text-[15px] tracking-[0.16em] text-white/92 uppercase">
                Replace existing server?
              </h3>
              <p className="font-[family-name:--font-cormorant] text-[15px] leading-relaxed text-white/68">
                A server named <span className="text-[#C9A84C]/90">&ldquo;{trimmedName}&rdquo;</span> already exists.
                Saving will overwrite its catalog and configuration. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowReplaceModal(false)}
                className="flex-1 font-[family-name:--font-cinzel] py-3 text-[12px] tracking-[0.14em] rounded-xl
                  glass text-white/65 hover:text-white/85 hover:bg-white/[0.10] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmReplace}
                disabled={isSaving}
                className={cn(
                  "flex-1 font-[family-name:--font-cinzel] py-3 text-[12px] tracking-[0.14em] rounded-xl",
                  isSaving
                    ? "cursor-not-allowed bg-white/[0.06] border border-white/[0.12] text-white/25"
                    : "btn-gold cursor-pointer"
                )}
              >
                {isSaving ? "Replacing..." : "Replace"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
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
