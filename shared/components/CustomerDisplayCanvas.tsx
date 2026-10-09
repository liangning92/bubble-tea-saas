import React, { useLayoutEffect, useRef, useState } from 'react'

// One design coordinate system for the editor preview and the physical display.
export const CUSTOMER_CANVAS_WIDTH = 1280
export const CUSTOMER_CANVAS_HEIGHT = 720

export function CustomerDisplayCanvas({ children, background }: {
  children: React.ReactNode
  background: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(size.width / CUSTOMER_CANVAS_WIDTH, size.height / CUSTOMER_CANVAS_HEIGHT)
  return (
    <div ref={host} data-customer-display-viewport style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', background }}>
      <div data-customer-display-canvas style={{
        position: 'absolute', width: CUSTOMER_CANVAS_WIDTH, height: CUSTOMER_CANVAS_HEIGHT,
        left: (size.width - CUSTOMER_CANVAS_WIDTH * scale) / 2,
        top: (size.height - CUSTOMER_CANVAS_HEIGHT * scale) / 2,
        transform: `scale(${scale})`, transformOrigin: 'top left',
        visibility: scale > 0 ? 'visible' : 'hidden', overflow: 'hidden', background,
        fontFamily: 'Arial, "Noto Sans", sans-serif', fontSize: 16, lineHeight: 1.5,
      }}>{children}</div>
    </div>
  )
}
