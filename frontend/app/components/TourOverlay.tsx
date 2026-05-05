"use client"
import { useEffect, useState, useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { isTourSeen, markTourSeen, type TourStep, type Placement } from "@/lib/tour"

const SPOTLIGHT_PADDING = 12
const BUBBLE_GAP = 18
const BUBBLE_WIDTH = 380
// Conservative height for placement-fit math. Real bubbles are 240–340 tall.
const BUBBLE_HEIGHT_ESTIMATE = 320
const VIEWPORT_MARGIN = 16
const ARROW_SIZE = 10
// Time to wait for a target element to appear before auto-skipping the step.
const TARGET_TIMEOUT_MS = 800
// Animation duration for spotlight + bubble slide/resize.
const TRANSITION_MS = 420
// Single source of truth for the dim color — referenced by the box-shadow that
// darkens everything outside the spotlight. Lighter than the previous 0.55 so
// the page is still visible behind the cue.
const DIM_RGBA = "rgba(0,0,0,0.38)"

const OPPOSITE: Record<Placement, Placement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
  center: "center",
}

interface SpotlightRect { top: number; left: number; width: number; height: number }
interface Viewport { width: number; height: number }

interface PositionResult {
  placement: Placement
  /** Absolute pixel position of the bubble's top-left corner. */
  x: number
  y: number
  arrow?: { side: "top" | "bottom" | "left" | "right"; offsetPx: number }
}

function fitsInViewport(top: number, left: number, w: number, h: number, vp: Viewport): boolean {
  return top >= VIEWPORT_MARGIN
      && left >= VIEWPORT_MARGIN
      && top + h <= vp.height - VIEWPORT_MARGIN
      && left + w <= vp.width - VIEWPORT_MARGIN
}

function tryPlacement(spotlight: SpotlightRect, placement: Placement): { top: number; left: number; arrowSide: "top" | "bottom" | "left" | "right" } | null {
  const w = BUBBLE_WIDTH
  const h = BUBBLE_HEIGHT_ESTIMATE
  const sCx = spotlight.left + spotlight.width / 2
  const sCy = spotlight.top + spotlight.height / 2

  if (placement === "bottom") return { top: spotlight.top + spotlight.height + BUBBLE_GAP, left: sCx - w / 2, arrowSide: "top" }
  if (placement === "top") return { top: spotlight.top - BUBBLE_GAP - h, left: sCx - w / 2, arrowSide: "bottom" }
  if (placement === "right") return { top: sCy - h / 2, left: spotlight.left + spotlight.width + BUBBLE_GAP, arrowSide: "left" }
  if (placement === "left") return { top: sCy - h / 2, left: spotlight.left - BUBBLE_GAP - w, arrowSide: "right" }
  return null
}

function computeBubblePosition(
  spotlight: SpotlightRect | null,
  preferred: Placement,
  vp: Viewport
): PositionResult {
  const w = BUBBLE_WIDTH

  // Centered (no target) — pixel coords so it can smoothly transition into a
  // targeted position later.
  if (!spotlight || preferred === "center") {
    return {
      placement: "center",
      x: vp.width / 2 - w / 2,
      y: vp.height / 2 - BUBBLE_HEIGHT_ESTIMATE / 2,
    }
  }

  const sCx = spotlight.left + spotlight.width / 2
  const sCy = spotlight.top + spotlight.height / 2

  const order: Placement[] = preferred === "top" || preferred === "bottom"
    ? [preferred, OPPOSITE[preferred], "right", "left"]
    : [preferred, OPPOSITE[preferred], "bottom", "top"]

  for (const placement of order) {
    const r = tryPlacement(spotlight, placement)
    if (!r) continue
    if (fitsInViewport(r.top, r.left, w, BUBBLE_HEIGHT_ESTIMATE, vp)) {
      return finalize(r.top, r.left, placement, r.arrowSide, sCx, sCy, vp)
    }
  }

  // Nothing fit cleanly — clamp the preferred and accept some overlap.
  const r = tryPlacement(spotlight, preferred)
  if (r) {
    const clampedTop = Math.max(VIEWPORT_MARGIN, Math.min(vp.height - BUBBLE_HEIGHT_ESTIMATE - VIEWPORT_MARGIN, r.top))
    const clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(vp.width - w - VIEWPORT_MARGIN, r.left))
    return finalize(clampedTop, clampedLeft, preferred, r.arrowSide, sCx, sCy, vp)
  }

  return {
    placement: "center",
    x: vp.width / 2 - w / 2,
    y: vp.height / 2 - BUBBLE_HEIGHT_ESTIMATE / 2,
  }
}

function finalize(top: number, left: number, placement: Placement, arrowSide: "top" | "bottom" | "left" | "right", sCx: number, sCy: number, vp: Viewport): PositionResult {
  const w = BUBBLE_WIDTH

  let clampedLeft = left
  let clampedTop = top
  if (arrowSide === "top" || arrowSide === "bottom") {
    clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(vp.width - w - VIEWPORT_MARGIN, left))
  } else {
    clampedTop = Math.max(VIEWPORT_MARGIN, Math.min(vp.height - BUBBLE_HEIGHT_ESTIMATE - VIEWPORT_MARGIN, top))
  }

  let arrowOffsetPx: number
  if (arrowSide === "top" || arrowSide === "bottom") {
    arrowOffsetPx = Math.max(ARROW_SIZE * 2, Math.min(w - ARROW_SIZE * 2, sCx - clampedLeft))
  } else {
    arrowOffsetPx = Math.max(ARROW_SIZE * 2, Math.min(BUBBLE_HEIGHT_ESTIMATE - ARROW_SIZE * 2, sCy - clampedTop))
  }

  return {
    placement,
    x: clampedLeft,
    y: clampedTop,
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

  useEffect(() => {
    setMounted(true)
    setViewport({ width: window.innerWidth, height: window.innerHeight })
    if (forceShow || !isTourSeen(tourId)) {
      const t = setTimeout(() => setActive(true), 400)
      return () => clearTimeout(t)
    }
  }, [tourId, forceShow])

  useEffect(() => {
    if (!active) return
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [active])

  const step = active ? steps[stepIdx] : null

  // Measure target. Auto-skip if it doesn't appear within TARGET_TIMEOUT_MS.
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
      if (rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        return null
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
        if (stepIdx < steps.length - 1) setStepIdx(i => i + 1)
        else { markTourSeen(tourId); setActive(false); setStepIdx(0) }
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

  // Spotlight rect — always present (centered steps use a 0-size centered spot
  // so the box-shadow covers the whole screen and transitions are continuous).
  const spotlight = useMemo<SpotlightRect>(() => {
    if (!step || step.centered || !targetRect) {
      return { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 }
    }
    return {
      top: targetRect.top - SPOTLIGHT_PADDING,
      left: targetRect.left - SPOTLIGHT_PADDING,
      width: targetRect.width + SPOTLIGHT_PADDING * 2,
      height: targetRect.height + SPOTLIGHT_PADDING * 2,
    }
  }, [step, targetRect, viewport])

  const hasTarget = !!step && !step.centered && !!targetRect

  const position = useMemo<PositionResult | null>(() => {
    if (!step) return null
    const preferred: Placement = step.centered ? "center" : (step.placement ?? "bottom")
    return computeBubblePosition(hasTarget ? spotlight : null, preferred, viewport)
  }, [step, spotlight, viewport, hasTarget])

  if (!mounted || !active || !step || !position) return null

  const isFirst = stepIdx === 0
  const isLast = stepIdx === steps.length - 1
  const arrow = position.arrow

  const easing = "cubic-bezier(0.32, 0.72, 0.24, 1)"

  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 100 }}
      aria-live="polite"
    >
      {/* ── Spotlight: the ONLY dim source. The huge box-shadow paints DIM_RGBA
          everywhere outside this rect; inside the rect there's zero darkening
          so the spotlighted UI shows through cleanly. For centered steps the
          rect is 0×0 in the middle of the screen, which makes the shadow blanket
          everything — same dim, no spotlight. The size/position transition is on
          transform so it's GPU-accelerated. ─── */}
      <div
        className="absolute rounded-2xl pointer-events-none"
        style={{
          top: 0,
          left: 0,
          width: spotlight.width,
          height: spotlight.height,
          transform: `translate3d(${spotlight.left}px, ${spotlight.top}px, 0)`,
          transition: `transform ${TRANSITION_MS}ms ${easing}, width ${TRANSITION_MS}ms ${easing}, height ${TRANSITION_MS}ms ${easing}, box-shadow 220ms ease-out`,
          boxShadow: hasTarget
            ? `0 0 0 9999px ${DIM_RGBA}, 0 0 0 2px rgba(232,196,106,0.65), 0 0 28px 6px rgba(232,196,106,0.32)`
            : `0 0 0 9999px ${DIM_RGBA}`,
          willChange: "transform, width, height",
        }}
      />

      {/* ── Bubble — positioned via transform for the same smooth animation. ─── */}
      <div
        className="absolute pointer-events-auto"
        style={{
          top: 0,
          left: 0,
          width: BUBBLE_WIDTH,
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          transition: `transform ${TRANSITION_MS}ms ${easing}`,
          willChange: "transform",
        }}
      >
        {/* Arrow — fades in/out so it doesn't jump between sides during transitions */}
        {arrow && (
          <div
            aria-hidden="true"
            className="absolute"
            style={{
              transition: "opacity 220ms ease-out 100ms",
              opacity: 1,
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
            shadow-[0_24px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(232,196,106,0.20)]
            backdrop-blur-xl"
          style={{
            background: "rgba(10,10,10,0.93)",
            borderColor: "rgba(232,196,106,0.50)",
            borderWidth: 1,
            borderStyle: "solid",
          }}
        >
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

          <h3 className="font-[family-name:--font-cinzel] text-[18px] tracking-[0.04em] text-white leading-snug">
            {step.title}
          </h3>

          <p className="font-[family-name:--font-cormorant] text-[16px] italic text-white/88 leading-relaxed">
            {step.body}
          </p>

          {step.extra && (
            <div className="mt-1">
              {step.extra}
            </div>
          )}

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
