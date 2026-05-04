"use client"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Check, ExternalLink } from "lucide-react"
import {
  getAnthropicKey,
  setAnthropicKey,
  clearAnthropicKey,
  hasAnthropicKey,
  looksLikeAnthropicKey,
} from "@/lib/byok"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

export default function Home() {
  const router = useRouter()
  const [pageReady, setPageReady] = useState(false)
  const [keyInput, setKeyInput] = useState("")
  const [show, setShow] = useState(false)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    document.fonts.ready.then(() => requestAnimationFrame(() => setPageReady(true)))
    setSavedKey(getAnthropicKey())
  }, [])

  function handleSave() {
    const trimmed = keyInput.trim()
    if (!trimmed) {
      setError("Paste a key first.")
      return
    }
    if (!looksLikeAnthropicKey(trimmed)) {
      setError("That doesn't look like an Anthropic key — they start with sk-ant-.")
      return
    }
    setError(null)
    setAnthropicKey(trimmed)
    setSavedKey(trimmed)
    setKeyInput("")
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  function handleClear() {
    clearAnthropicKey()
    setSavedKey(null)
    setKeyInput("")
    setError(null)
  }

  function handleStart() {
    if (!hasAnthropicKey()) {
      setError("Save your key first.")
      return
    }
    router.push("/create")
  }

  const masked = savedKey
    ? `${savedKey.slice(0, 10)}••••••••${savedKey.slice(-4)}`
    : ""

  return (
    <div className={cn("min-h-screen transition-opacity duration-500", pageReady ? "opacity-100" : "opacity-0")}>
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
        </div>
      </div>

      {/* ── Hero / BYOK panel ────────────────────────────────────────── */}
      <main className="relative z-[6] flex items-center justify-center min-h-[calc(100vh-80px)] px-6 pb-20">
        <div className="w-full max-w-[640px] flex flex-col items-center gap-10 animate-fade-up">
          {/* Headline */}
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-[family-name:--font-cinzel] text-[18px] tracking-[0.45em] uppercase text-white">
              MCP Server Generator
            </p>
            <p className="font-[family-name:--font-cormorant] text-[20px] italic text-white/75 max-w-[480px]">
              Transform any API into an agent-ready MCP server. Bring your own Anthropic key — runs entirely from your browser session.
            </p>
          </div>

          {/* BYOK panel */}
          <div className="w-full glass-mid rounded-3xl px-10 py-9 flex flex-col gap-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-2">
              <label className="font-[family-name:--font-cinzel] text-[13px] tracking-[0.18em] text-white/65 uppercase">
                Anthropic API Key
              </label>
              <p className="font-[family-name:--font-cormorant] text-[14px] italic text-white/45">
                Stored only in this tab&apos;s session storage. Never persisted server-side. Cleared when you close the tab.
              </p>
            </div>

            {savedKey ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.10]">
                  <code className="font-[family-name:--font-geist-mono] text-[14px] text-white/80 tracking-wider">
                    {masked}
                  </code>
                  {justSaved ? (
                    <span className="flex items-center gap-1.5 text-[13px] text-emerald-300/90">
                      <Check size={14} /> saved
                    </span>
                  ) : (
                    <button
                      onClick={handleClear}
                      className="font-[family-name:--font-cinzel] text-[12px] tracking-[0.15em] text-white/50 hover:text-red-300 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <button
                  onClick={handleStart}
                  className="btn-gold cursor-pointer rounded-xl py-4 font-[family-name:--font-cinzel] text-[15px] tracking-[0.15em]"
                >
                  Start Building →
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={keyInput}
                    onChange={e => { setKeyInput(e.target.value); setError(null) }}
                    onKeyDown={e => { if (e.key === "Enter") handleSave() }}
                    placeholder="sk-ant-api03-..."
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full pl-4 pr-12 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.12]
                      font-[family-name:--font-geist-mono] text-[13px] text-white/90 placeholder:text-white/30
                      focus:outline-none focus:border-white/30 transition-colors"
                  />
                  <button
                    onClick={() => setShow(s => !s)}
                    aria-label={show ? "Hide key" : "Show key"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white/80 transition-colors"
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {error && (
                  <p className="font-[family-name:--font-cormorant] text-[14px] italic text-red-300/90">
                    {error}
                  </p>
                )}
                <button
                  onClick={handleSave}
                  className="btn-gold cursor-pointer rounded-xl py-3.5 font-[family-name:--font-cinzel] text-[14px] tracking-[0.15em]"
                >
                  Save Key
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
            )}
          </div>

          {/* Footer note */}
          <p className="font-[family-name:--font-cormorant] text-[14px] italic text-white/35 text-center max-w-[460px]">
            This is a demo. The server only forwards your key to Anthropic on requests you initiate. No accounts, no databases, nothing stored.
          </p>
        </div>
      </main>
    </div>
  )
}
