import { useMemo, useRef, useState } from 'react'

export type PanZoomRotate = {
  x: number
  y: number
  k: number
  rotDeg: number
}

export function usePanZoomRotate() {
  const [t, setT] = useState<PanZoomRotate>({ x: 0, y: 0, k: 1, rotDeg: 0 })
  const dragRef = useRef({ dragging: false, last: { x: 0, y: 0 } })

  const api = useMemo(
    () => ({
      t,
      setT,
      reset: () => setT({ x: 0, y: 0, k: 1, rotDeg: 0 }),
      setRot: (rotDeg: number) => setT((s) => ({ ...s, rotDeg })),
      onWheel: (ev: React.WheelEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
        const delta = -ev.deltaY
        const z = delta > 0 ? 1.08 : 0.92
        setT((s) => {
          const nextK = Math.max(0.18, Math.min(8, s.k * z))
          return { ...s, k: nextK }
        })
      },
      onPointerDown: (ev: React.PointerEvent) => {
        dragRef.current.dragging = true
        dragRef.current.last = { x: ev.clientX, y: ev.clientY }
        ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
      },
      onPointerMove: (ev: React.PointerEvent) => {
        if (!dragRef.current.dragging) return
        const last = dragRef.current.last
        const dx = ev.clientX - last.x
        const dy = ev.clientY - last.y
        dragRef.current.last = { x: ev.clientX, y: ev.clientY }
        setT((s) => ({ ...s, x: s.x + dx, y: s.y + dy }))
      },
      onPointerUp: (ev: React.PointerEvent) => {
        dragRef.current.dragging = false
        try {
          ;(ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId)
        } catch {
          // ignore
        }
      },
    }),
    [t],
  )

  return api
}
