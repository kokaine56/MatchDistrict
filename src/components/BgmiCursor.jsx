import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const CURSOR_MEDIA = '(hover: hover) and (pointer: fine)'
const ROOT_CLASS = 'md-custom-cursor'

// Module-level singleton guard: only ONE cursor instance may ever own the
// global listeners and the `md-custom-cursor` root class, regardless of how
// many times the component is mounted (e.g. React StrictMode/dev remounts).
let cursorAttached = false

const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[contenteditable="true"]',
].join(',')

/**
 * Desktop-only BGMI-style aiming reticle that replaces the native mouse
 * pointer. Purely visual: `pointer-events: none`, max z-index, and no React
 * state updates during movement (position is written straight to the DOM via
 * a single requestAnimationFrame tick).
 *
 * Performance notes:
 * - `pointermove` only buffers coordinates + the hovered target; nothing is
 *   read from the DOM per event (the old per-event `closest()` traversal ran
 *   on the main thread up to ~1000x/sec on high-polling mice).
 * - Interactive-hover detection (`closest()`) is coalesced into the rAF flush
 *   and additionally only recomputed when the hovered element actually changes,
 *   so it is effectively zero-cost during uninterrupted movement.
 * - `transform` is only written when coordinates changed (no redundant style
 *   mutations while the pointer is stationary).
 * - A module-level singleton guard ensures only ONE cursor instance ever owns
 *   the global listeners / root class, even across StrictMode or route remounts.
 */
export default function BgmiCursor() {
  const wrapperRef = useRef(null)
  const svgRef = useRef(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const svg = svgRef.current
    if (!wrapper || !svg) return

    const media = window.matchMedia(CURSOR_MEDIA)

    let rafId = 0
    let x = -100
    let y = -100
    let lastX = null
    let lastY = null
    let visible = false
    let interactive = false
    let pressed = false
    let lastInteractive = null
    let lastVisible = null
    let lastPressed = null
    let hoverTarget = null
    let lastHoverTarget = null

    const flush = () => {
      rafId = 0
      if (x !== lastX || y !== lastY) {
        wrapper.style.transform = `translate3d(${x}px, ${y}px, 0)`
        lastX = x
        lastY = y
      }
      if (visible !== lastVisible) {
        wrapper.style.opacity = visible ? '1' : '0'
        lastVisible = visible
      }
      if (hoverTarget !== lastHoverTarget) {
        interactive = !!(hoverTarget && hoverTarget.closest && hoverTarget.closest(INTERACTIVE_SELECTOR))
        lastHoverTarget = hoverTarget
        if (interactive !== lastInteractive) {
          svg.classList.toggle('md-crosshair--active', interactive)
          lastInteractive = interactive
        }
      }
      if (pressed !== lastPressed) {
        svg.classList.toggle('md-crosshair--press', pressed)
        lastPressed = pressed
      }
    }

    const schedule = () => {
      if (!rafId) rafId = window.requestAnimationFrame(flush)
    }

    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      x = e.clientX
      y = e.clientY
      hoverTarget = e.target
      visible = true
      schedule()
    }

    const onLeave = () => { visible = false; schedule() }
    const onEnter = () => { visible = true; schedule() }
    const onDown = () => { pressed = true; schedule() }
    const onUp = () => { pressed = false; schedule() }
    const onBlur = () => { visible = false; schedule() }

    const attach = () => {
      if (cursorAttached) return
      cursorAttached = true
      document.documentElement.classList.add(ROOT_CLASS)
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerdown', onDown, { passive: true })
      window.addEventListener('pointerup', onUp, { passive: true })
      window.addEventListener('blur', onBlur)
      document.addEventListener('pointerleave', onLeave)
      document.addEventListener('pointerenter', onEnter)
    }

    const detach = () => {
      if (!cursorAttached) {
        if (rafId) {
          window.cancelAnimationFrame(rafId)
          rafId = 0
        }
        return
      }
      cursorAttached = false
      document.documentElement.classList.remove(ROOT_CLASS)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('pointerenter', onEnter)
      if (rafId) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    const sync = () => {
      if (media.matches) attach()
      else detach()
    }

    sync()
    if (typeof media.addEventListener === 'function') media.addEventListener('change', sync)
    else if (typeof media.addListener === 'function') media.addListener(sync)

    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', sync)
      else if (typeof media.removeListener === 'function') media.removeListener(sync)
      detach()
    }
  }, [])

  return createPortal(
    <div ref={wrapperRef} className="md-crosshair" aria-hidden="true">
      <svg
        ref={svgRef}
        className="md-crosshair__svg"
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g
          className="md-crosshair__halo"
          strokeWidth="3.2"
          strokeLinecap="round"
        >
          <line x1="13" y1="1" x2="13" y2="8.5" />
          <line x1="13" y1="17.5" x2="13" y2="25" />
          <line x1="1" y1="13" x2="8.5" y2="13" />
          <line x1="17.5" y1="13" x2="25" y2="13" />
          <circle cx="13" cy="13" r="2.3" />
        </g>

        <g
          className="md-crosshair__core"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <line x1="13" y1="1" x2="13" y2="8.5" />
          <line x1="13" y1="17.5" x2="13" y2="25" />
          <line x1="1" y1="13" x2="8.5" y2="13" />
          <line x1="17.5" y1="13" x2="25" y2="13" />
        </g>
        <circle className="md-crosshair__core-dot" cx="13" cy="13" r="1.4" fill="currentColor" />
      </svg>
    </div>,
    document.body
  )
}
