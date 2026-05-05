"use client"
import { useEffect, useState, useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { isTourSeen, markTourSeen, type TourStep, type Placement } from "@/lib/tour"

const SPOTLIGHT_PADDING = 12
const BUBBLE_GAP = 18
const BUBBLE_WIDTH = 380
// Conservative height for placement-fit check. Real bubbles are 240–340 tall;
// using 320 as the worst case keeps bubbles from being placed where they'd clip.
const BUBBLE_HEIGHT_ESTIMATE = 320
const VIEWPORT_MARGIN = 16
const ARROW_SIZE = 10
// Give a target this long to appear in the DOM before we give up and skip the step.
// Some targets render after a state transition (e.g. the intent textarea on /create
// only appears once tools have been added).
const TARGET_TIMEOUT_MS = 800

const OPPOSITE: Record<Placement, Placement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
  center: "center",
}

interface PositionResult {
  placement: Placement
  style: React.CSSProperties
  /** Where on the bubble the arrow sits, and how far from the start of that edge. */
  arrow?: { side: "top" | "bottom" | "left" | "right"; offsetPx: number }
}

interface SpotlightRect { top: number; left: number; width: number; height: number }
interface Viewport { width: number; height: number }

function fitsInViewport(top: number, left: number, w: number, h: number, vp: Viewport): boolean {
  return top >= VIEWPORT_MARGIN
      && left >= VIEWPORT_MARGIN
      && top + h <= vp.height - VIEWPORT_MARGIN
      && left + w <= vp.width - VIEWPORT_MARGIN
}

function tryPlacement(spotlight: SpotlightRect, placement: Placement, vp: Viewport): { top: number; left: number; arrowSide: "top" | "bottom" | "left" | "right" } | null {
  const w = BUBBLE_WIDTH
  const h = BUBBLE_HEIGHT_ESTIMATE
  const sCx = spotlight.left + spotlight.width / 2
  const sCy = spotlight.top + spotlight.height / 2

  if (placement === "bottom") {
    return { top: spotlight.top + spotlight.height + BUBBLE_GAP, left: sCx - w / 2, arrowSide: "top" }
  }
  if (placement === "top") {
    return { top: spotlight.top - BUBBLE_GAP - h, left: sCx - w / 2, arrowSide: "bottom" }
  }
  if (placement === "right") {
    return { top: sCy - h / 2, left: spotlight.left + spotlight.width + BUBBLE_GAP, arrowSide: "left" }
  }
  if (placement === "left") {
    return { top: sCy - h / 2, left: spotlight.left - BUBBLE_GAP - w, arrowSide: "right" }
  }
  return null
}

function computeBubblePosition(
  spotlight: SpotlightRect | null,
  preferred: Placement,
  vp: Viewport
): PositionResult {
  const w = BUBBLE_WIDTH

  // Centered modal step — no spotlight, just dead center.
  if (!spotlight || preferred === "center") {
    return {
      placement: "center",
      style: { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: w },
    }
  }

  const sCx = spotlight.left + spotlight.width / 2
  const sCy = spotlight.top + spotlight.height / 2

  // Preferred → opposite → perpendiculars. First one that fits wins.
  const order: Placement[] = preferred === "top" || preferred === "bottom"
    ? [preferred, OPPOSITE[preferred], "right", "left"]
    : [preferred, OPPOSITE[preferred], "bottom", "top"]

  for (const placement of order) {
    const r = tryPlacement(spotlight, placement, vp)
    if (!r) continue
    if (fitsInViewport(r.top, r.left, w, BUBBLE_HEIGHT_ESTIMATE, vp)) {
      return finalize(r.top, r.left, placement, r.arrowSide, sCx, sCy, vp)
    }
  }

  // Nothing fit cleanly — clamp the preferred placement so the bubble at least
  // stays inside the viewport, even if it overlaps the spotlight a bit.
  const r = tryPlacement(spotlight, preferred, vp)
  if (r) {
    const clampedTop = Math.max(VIEWPORT_MARGIN, Math.min(vp.height - BUBBLE_HEIGHT_ESTIMATE - VIEWPORT_MARGIN, r.top))
    const clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(vp.width - w - VIEWPORT_MARGIN, r.left))
    return finalize(clampedTop, clampedLeft, preferred, r.arrowSide, sCx, sCy, vp)
  }

  // Final fallback: dead center, no arrow.
  return {
    placement: "center",
    style: { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: w },
  }
}

function finalize(top: number, left: number, placement: Placement, arrowSide: "top" | "bottom" | "left" | "right", sCx: number, sCy: number, vp: Viewport): PositionResult {
  const w = BUBBLE_WIDTH

  // Re-clamp horizontally for top/bottom placements so an off-center spotlight
  // doesn't push the bubble off the edge.
  let clampedLeft = left
  let clampedTop = top
  if (arrowSide === "top" || arrowSide === "bottom") {
    clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(vp.width - w - VIEWPORT_MARGIN, left))
  }
  if (arrowSide === "left" || arrowSide === "right") {
    clampedTop = Math.max(VIEWPORT_MARGIN, Math.min(vp.height - BUBBLE_HEIGHT_ESTIMATE - VIEWPORT_MARGIN, top))
  }

  // Arrow offset from the bubble's leading edge so the arrow visually points at
  // the spotlight center, even after horizontal clamping.
  let arrowOffsetPx = ARROW_SIZE * 2
  if (arrowSide === "top" || arrowSide === "bottom") {
    arrowOffsetPx = Math.max(ARROW_SIZE * 2, Math.min(w - ARROW_SIZE * 2, sCx - clampedLeft))
  } else {
    arrowOffsetPx = Math.max(ARROW_SIZE * 2, Math.min(BUBBLE_HEIGHT_ESTIMATE - ARROW_SIZE * 2, sCy - clampedTop))
  }

  return {
    placement,
    style: { top: clampedTop, left: clampedLeft, width: w },
    arrow: { side: arrowSide, offsetPx: arrowOffsetPx },
  }
}

interface TourOverlayProps {
  tourId: string
  steps: TourStep[]
  forceShow?: boolean
}

export function TourOverlay({ tourId, steps, forceShow = false }: TourOverlayProps) {
  const [active, setActive] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null)
  const [mounted, setMounted] = useState(false)
  const [viewport, setViewport] = useState<Viewport>({ width: 1920, height: 1080 })
  const rafRef = useRef<number | null>(null)

  // Mount + decide whether to start the tour
  useEffect(() => {
    setMounted(true)
    setViewport({ width: window.innerWidth, height: window.innerHeight })
    if (forceShow || !isTourSeen(tourId)) {
      // Wait one tick so the page has finished its entrance animation
      const t = setTimeout(() => setActive(true), 400)
      return () => clearTimeout(t)
    }
  }, [tourId, forceShow])

  // Track viewport size for placement math
  useEffect(() => {
    if (!active) return
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [active])

  const step = active ? steps[stepIdx] : null

  // Locate the target element. Re-measure on scroll/resize/step-change.
  // If it can't be found within TARGET_TIMEOUT_MS, auto-advance to next step.
  useLayoutEffect(() => {
    if (!step) return
    if (step.centered || !step.target) {
      setTargetRect(null)
      return
    }

    let cancelled = false
    let attempts = 0
    const maxAttempts = Math.ceil(TARGET_TIMEOUT_MS / 50)

    const measure = (): SpotlightRect | null => {
      const el = document.querySelector(step.target!) as HTMLElement | null
      if (!el) return null
      const rect = el.getBoundingClientRect()
      // If the target is offscreen, scroll it into view (one-shot per try).
      if (rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        return null  // re-measure next tick
      }
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }

    const tick = () => {
      if (cancelled) return
      const rect = measure()
      if (rect) {
        setTargetRect(rect)
        return
      }
      attempts++
      if (attempts >= maxAttempts) {
        // Give up — skip this step instead of leaving the bubble in limbo
        if (stepIdx < steps.length - 1) {
          setStepIdx(i => i + 1)
        } else {
          markTourSeen(tourId)
          setActive(false)
          setStepIdx(0)
        }
        return
      }
      rafRef.current = window.setTimeout(tick, 50) as unknown as number
    }
    tick()

    const onScroll = () => {
      const rect = measure()
      if (rect) setTargetRect(rect)
    }
    window.addEventListener("resize", onScroll)
    window.addEventListener("scroll", onScroll, true)

    return () => {
      cancelled = true
      if (rafRef.current) clearTimeout(rafRef.current)
      window.removeEventListener("resize", onScroll)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [step, stepIdx, steps.length, tourId])

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

  const spotlight = useMemo<SpotlightRect | null>(() => {
    if (!step || step.centered || !targetRect) return null
    return {
      top: targetRect.top - SPOTLIGHT_PADDING,
      left: targetRect.left - SPOTLIGHT_PADDING,
      width: targetRect.width + SPOTLIGHT_PADDING * 2,
      height: targetRect.height + SPOTLIGHT_PADDING * 2,
    }
  }, [step, targetRect])

  const position = useMemo<PositionResult | null>(() => {
    if (!step) return null
    const preferred: Placement = step.centered ? "center" : (step.placement ?? "bottom")
    return computeBubblePosition(spotlight, preferred, viewport)
  }, [step, spotlight, viewport])

  if (!mounted || !active || !step || !position) return null

  const isFirst = stepIdx === 0
  const isLast = stepIdx === steps.length - 1
  const arrow = position.arrow

  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 100 }}
      aria-live="polite"
    >
      {/* ── Dim layer (full-screen) — pointer-events:none so the user can still
          interact with the page if they want to. ─── */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.55)" }} />

      {/* ── Spotlight cutout. Layered ABOVE the dim with a giant inverse
          box-shadow that re-darkens everything outside its bounds. The plain
          dim above is a safety net for the brief moment between target loads. ─── */}
      {spotlight && (
        <div
          className="absolute rounded-2xl pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            // The huge box-shadow paints over the dim layer with the same color, so
            // visually only the inner area appears illuminated.
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 2px rgba(201,168,76,0.55), 0 0 24px 4px rgba(201,168,76,0.30)",
          }}
        />
      )}

      {/* ── Bubble ──────────────────────────────────────────────── */}
      <div
        className="absolute pointer-events-auto animate-fade-up"
        style={position.style}
      >
        {/* Arrow pointing at the spotlight. CSS triangle via borders. */}
        {arrow && (
          <div
            aria-hidden="true"
            className="absolute"
            style={{
              ...(arrow.side === "top" && {
                top: -ARROW_SIZE,
                left: arrow.offsetPx - ARROW_SIZE,
                width: 0, height: 0,
                borderLeft: `${ARROW_SIZE}px solid transparent`,
                borderRight: `${ARROW_SIZE}px solid transparent`,
                borderBottom: `${ARROW_SIZE}px solid rgba(10,10,10,0.93)`,
              }),
              ...(arrow.side === "bottom" && {
                bottom: -ARROW_SIZE,
                left: arrow.offsetPx - ARROW_SIZE,
                width: 0, height: 0,
                borderLeft: `${ARROW_SIZE}px solid transparent`,
                borderRight: `${ARROW_SIZE}px solid transparent`,
                borderTop: `${ARROW_SIZE}px solid rgba(10,10,10,0.93)`,
              }),
              ...(arrow.side === "left" && {
                left: -ARROW_SIZE,
                top: arrow.offsetPx - ARROW_SIZE,
                width: 0, height: 0,
                borderTop: `${ARROW_SIZE}px solid transparent`,
                borderBottom: `${ARROW_SIZE}px solid transparent`,
                borderRight: `${ARROW_SIZE}px solid rgba(10,10,10,0.93)`,
              }),
              ...(arrow.side === "right" && {
                right: -ARROW_SIZE,
                top: arrow.offsetPx - ARROW_SIZE,
                width: 0, height: 0,
                borderTop: `${ARROW_SIZE}px solid transparent`,
                borderBottom: `${ARROW_SIZE}px solid transparent`,
                borderLeft: `${ARROW_SIZE}px solid rgba(10,10,10,0.93)`,
              }),
            }}
          />
        )}

        <div
          className="rounded-2xl px-6 py-5 flex flex-col gap-4
            shadow-[0_24px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(201,168,76,0.18)]
            backdrop-blur-xl"
          style={{
            background: "rgba(10,10,10,0.93)",
            borderColor: "rgba(201,168,76,0.45)",
            borderWidth: 1,
            borderStyle: "solid",
          }}
        >
          {/* Top row — counter + close */}
          <div className="flex items-center justify-between">
            <span className="font-[family-name:--font-cinzel] text-[11px] tracking-[0.22em] text-[#E8C46A] uppercase">
              Step {stepIdx + 1} of {steps.length}
            </span>
            <button
              onClick={close}
              aria-label="Close tour"
              className="text-white/55 hover:text-white transition-colors p-1 -m-1"
            >
              <X size={16} />
            </button>
          </div>

          {/* Title */}
          <h3 className="font-[family-name:--font-cinzel] text-[18px] tracking-[0.04em] text-white leading-snug">
            {step.title}
          </h3>

          {/* Body */}
          <p className="font-[family-name:--font-cormorant] text-[16px] italic text-white/88 leading-relaxed">
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
              className="font-[family-name:--font-cinzel] text-[11px] tracking-[0.18em] text-white/55 hover:text-white transition-colors uppercase"
            >
              Skip
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={prev}
                  aria-label="Previous step"
                  className="rounded-lg p-2 text-white/65 hover:text-white hover:bg-white/[0.08] transition-all"
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
