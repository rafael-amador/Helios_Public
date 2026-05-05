"use client"
import { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { isTourSeen, markTourSeen, type TourStep, type Placement } from "@/lib/tour"

const cn = (...c: (string | undefined | null | false)[]) => c.filter(Boolean).join(" ")

const SPOTLIGHT_PADDING = 10  // px around the target
const BUBBLE_GAP = 16         // px between target rect and bubble
const BUBBLE_WIDTH = 360
const BUBBLE_MARGIN = 16      // keep bubble at least this far from viewport edges

interface TourOverlayProps {
  tourId: string
  steps: TourStep[]
  /** If true, force-show the tour even if it's been seen. Used by a "replay tour" button. */
  forceShow?: boolean
}

/**
 * Self-contained guided tour. Drop into a page once; it auto-checks localStorage,
 * waits for the target elements to mount, and renders a spotlight + bubble.
 *
 * Click handling: only the bubble itself captures clicks (Next/Prev/Skip/X).
 * The dim overlay is pointer-events:none so the user can interact with the
 * underlying page if they want to. The spotlight is purely visual.
 */
export function TourOverlay({ tourId, steps, forceShow = false }: TourOverlayProps) {
  const [active, setActive] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)
  const rafRef = useRef<number | null>(null)

  // Mount + decide whether to start the tour
  useEffect(() => {
    setMounted(true)
    if (forceShow || !isTourSeen(tourId)) {
      // Wait one tick so target elements are in the DOM (page mounted, fonts ready)
      const t = setTimeout(() => setActive(true), 350)
      return () => clearTimeout(t)
    }
  }, [tourId, forceShow])

  const step = active ? steps[stepIdx] : null

  // Track the target element's bounding rect; update on resize / scroll / step change.
  useLayoutEffect(() => {
    if (!step || step.centered || !step.target) {
      setTargetRect(null)
      return
    }

    let cancelled = false

    const measure = () => {
      const el = document.querySelector(step.target!) as HTMLElement | null
      if (!el) return null
      const rect = el.getBoundingClientRect()
      // Bring target into view if off-screen
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        // Re-measure after scroll settles
        return null
      }
      return rect
    }

    const tick = () => {
      if (cancelled) return
      const rect = measure()
      if (rect) {
        setTargetRect(rect)
      } else {
        // Target not yet rendered or just scrolled — re-check next frame
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    tick()

    const onResize = () => {
      const rect = measure()
      if (rect) setTargetRect(rect)
    }
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
    }
  }, [step, stepIdx])

  const close = useCallback(() => {
    markTourSeen(tourId)
    setActive(false)
    setStepIdx(0)
  }, [tourId])

  const next = useCallback(() => {
    if (stepIdx >= steps.length - 1) close()
    else setStepIdx(i => i + 1)
  }, [stepIdx, steps.length, close])

  const prev = useCallback(() => {
    setStepIdx(i => Math.max(0, i - 1))
  }, [])

  // Keyboard nav
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close() }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next() }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active, next, prev, close])

  if (!mounted || !active || !step) return null

  // Compute spotlight box. For centered steps, no spotlight — just dim.
  const spotlight = step.centered || !targetRect ? null : {
    top: targetRect.top - SPOTLIGHT_PADDING,
    left: targetRect.left - SPOTLIGHT_PADDING,
    width: targetRect.width + SPOTLIGHT_PADDING * 2,
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
  }

  // Compute bubble position. For centered steps, dead center. Otherwise relative
  // to the spotlight + step.placement, with viewport-edge clamping.
  const placement: Placement = step.centered ? "center" : (step.placement ?? "bottom")
  let bubbleStyle: React.CSSProperties = {}

  if (placement === "center" || !spotlight) {
    bubbleStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: BUBBLE_WIDTH,
    }
  } else {
    const cx = spotlight.left + spotlight.width / 2
    const cy = spotlight.top + spotlight.height / 2

    if (placement === "bottom") {
      bubbleStyle = {
        top: spotlight.top + spotlight.height + BUBBLE_GAP,
        left: cx,
        transform: "translateX(-50%)",
        width: BUBBLE_WIDTH,
      }
    } else if (placement === "top") {
      bubbleStyle = {
        bottom: window.innerHeight - spotlight.top + BUBBLE_GAP,
        left: cx,
        transform: "translateX(-50%)",
        width: BUBBLE_WIDTH,
      }
    } else if (placement === "right") {
      bubbleStyle = {
        top: cy,
        left: spotlight.left + spotlight.width + BUBBLE_GAP,
        transform: "translateY(-50%)",
        width: BUBBLE_WIDTH,
      }
    } else if (placement === "left") {
      bubbleStyle = {
        top: cy,
        right: window.innerWidth - spotlight.left + BUBBLE_GAP,
        transform: "translateY(-50%)",
        width: BUBBLE_WIDTH,
      }
    }

    // Clamp horizontally so the bubble never spills off-screen on small viewports.
    if (placement === "top" || placement === "bottom") {
      const halfWidth = BUBBLE_WIDTH / 2
      const clampedLeft = Math.max(BUBBLE_MARGIN + halfWidth, Math.min(window.innerWidth - BUBBLE_MARGIN - halfWidth, cx))
      bubbleStyle.left = clampedLeft
    }
  }

  const isFirst = stepIdx === 0
  const isLast = stepIdx === steps.length - 1

  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 100 }}
      aria-live="polite"
    >
      {/* ── Dim layer with spotlight cutout (box-shadow trick) ─── */}
      {spotlight ? (
        <div
          className="absolute rounded-2xl pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.65), 0 0 0 2px rgba(201,168,76,0.45), 0 0 30px rgba(201,168,76,0.20)",
          }}
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.55)" }} />
      )}

      {/* ── Bubble ──────────────────────────────────────────────── */}
      <div
        className="absolute pointer-events-auto animate-fade-up"
        style={bubbleStyle}
      >
        <div
          className="glass-mid rounded-2xl px-6 py-5 flex flex-col gap-4
            shadow-[0_24px_60px_rgba(0,0,0,0.55)] border-[#C9A84C]/30"
          style={{ borderWidth: 1 }}
        >
          {/* Top row — counter + close */}
          <div className="flex items-center justify-between">
            <span className="font-[family-name:--font-cinzel] text-[11px] tracking-[0.22em] text-[#C9A84C] uppercase">
              Step {stepIdx + 1} of {steps.length}
            </span>
            <button
              onClick={close}
              aria-label="Close tour"
              className="text-white/40 hover:text-white/85 transition-colors p-1 -m-1"
            >
              <X size={16} />
            </button>
          </div>

          {/* Title */}
          <h3 className="font-[family-name:--font-cinzel] text-[17px] tracking-[0.06em] text-white/95 leading-snug">
            {step.title}
          </h3>

          {/* Body */}
          <p className="font-[family-name:--font-cormorant] text-[15px] italic text-white/75 leading-relaxed">
            {step.body}
          </p>

          {/* Optional extra (e.g. star demo) */}
          {step.extra && (
            <div className="mt-1">
              {step.extra}
            </div>
          )}

          {/* Bottom row — Skip + Prev/Next */}
          <div className="flex items-center justify-between mt-1">
            <button
              onClick={close}
              className="font-[family-name:--font-cinzel] text-[11px] tracking-[0.18em] text-white/40 hover:text-white/85 transition-colors uppercase"
            >
              Skip
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={prev}
                  aria-label="Previous step"
                  className="rounded-lg p-2 text-white/55 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <button
                onClick={next}
                className="btn-gold cursor-pointer rounded-lg px-4 py-2 font-[family-name:--font-cinzel] text-[12px] tracking-[0.15em] inline-flex items-center gap-1.5"
              >
                {isLast ? "Got It" : "Next"}
                {!isLast && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
