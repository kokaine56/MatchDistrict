import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const EXPORT_W = 1200
const EXPORT_H = 1600

export default function CropModal({ imageSrc, onCrop, onCancel }) {
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragAnchor = useRef({ x: 0, y: 0 })
  const posAnchor = useRef({ x: 0, y: 0 })
  const cropRef = useRef(null)
  const imgRef = useRef(null)
  const imgNatural = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const onLoad = () => {
      imgNatural.current = { w: img.naturalWidth, h: img.naturalHeight }
      const c = cropRef.current
      if (!c) return
      const cw = c.clientWidth, ch = c.clientHeight
      const base = Math.max(cw / img.naturalWidth, ch / img.naturalHeight)
      setZoom(base)
    }
    if (img.complete) onLoad()
    else img.addEventListener('load', onLoad)
    return () => img.removeEventListener('load', onLoad)
  }, [])

  const pointerDown = useCallback((e) => {
    const pt = e.touches ? e.touches[0] : e
    setIsDragging(true)
    dragAnchor.current = { x: pt.clientX, y: pt.clientY }
    posAnchor.current = { ...position }
  }, [position])

  const pointerMove = useCallback((e) => {
    if (!isDragging) return
    const pt = e.touches ? e.touches[0] : e
    setPosition({
      x: posAnchor.current.x + (pt.clientX - dragAnchor.current.x),
      y: posAnchor.current.y + (pt.clientY - dragAnchor.current.y),
    })
  }, [isDragging])

  const pointerUp = useCallback(() => setIsDragging(false), [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    setZoom(z => Math.max(0.1, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1))))
  }, [])

  const doCrop = useCallback(() => {
    const c = cropRef.current
    const img = imgRef.current
    const n = imgNatural.current
    if (!c || !img || !n.w || !n.h) return
    const cw = c.clientWidth, ch = c.clientHeight
    const effZoom = zoom
    const dispW = n.w * effZoom
    const dispH = n.h * effZoom
    const imgCX = cw / 2 + position.x
    const imgCY = ch / 2 + position.y
    const srcX = -(imgCX - dispW / 2) * (n.w / dispW)
    const srcY = -(imgCY - dispH / 2) * (n.h / dispH)
    const srcW = cw * (n.w / dispW)
    const srcH = ch * (n.h / dispH)
    const canvas = document.createElement('canvas')
    canvas.width = EXPORT_W
    canvas.height = EXPORT_H
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, EXPORT_W, EXPORT_H)
    canvas.toBlob((blob) => { if (blob) onCrop(blob) }, 'image/jpeg', 0.92)
  }, [zoom, position, onCrop])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-surface-container border border-outline-variant/20 rounded-2xl w-full max-w-[600px] overflow-hidden shadow-2xl"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/10">
            <h3 className="text-sm font-bold text-on-background">Crop Cover Image</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-on-surface-variant">Zoom</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(((zoom - 0.1) / 4.9) * 100)}
                onChange={(e) => setZoom(0.1 + (Number(e.target.value) / 100) * 4.9)}
                className="w-24 h-1.5 bg-slate-600 rounded-full appearance-none cursor-pointer accent-indigo-500"
              />
              <span className="text-[11px] text-on-surface-variant font-semibold w-10 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <div className="flex items-center justify-center bg-black/60 h-[420px] sm:h-[480px] select-none"
            onMouseDown={pointerDown}
            onMouseMove={pointerMove}
            onMouseUp={pointerUp}
            onMouseLeave={pointerUp}
            onTouchStart={pointerDown}
            onTouchMove={pointerMove}
            onTouchEnd={pointerUp}
            onWheel={handleWheel}
          >
            <div ref={cropRef} className="relative h-full aspect-[3/4] overflow-hidden cursor-grab active:cursor-grabbing">
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop"
                draggable={false}
                className="absolute pointer-events-none"
                style={{
                  left: '50%', top: '50%',
                  transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${zoom})`,
                  transformOrigin: 'center center',
                  maxWidth: 'none', maxHeight: 'none',
                }}
              />
              <div className="absolute inset-0 ring-1 ring-primary/50 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.3)] pointer-events-none" />
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-outline-variant/10 space-y-3">
            <p className="text-[11px] text-on-surface-variant/70 text-center">Drag to reposition · Scroll to zoom · Crop locked to 3:4 (1200 × 1600)</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCancel}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-outline-variant/30 text-on-surface-variant hover:bg-surface/50 transition-colors"
              >Cancel</button>
              <button type="button" onClick={doCrop}
                className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-all"
              >Apply Crop</button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
