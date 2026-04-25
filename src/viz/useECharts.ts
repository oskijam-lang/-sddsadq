import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts'

export type EChartsOption = echarts.EChartsCoreOption

export function useECharts() {
  const elRef = useRef<HTMLDivElement | null>(null)

  const chart = useMemo(() => ({ current: null as echarts.ECharts | null }), [])

  useEffect(() => {
    if (!elRef.current) return
    const inst = echarts.init(elRef.current, undefined, { renderer: 'canvas' })
    chart.current = inst

    const ro = new ResizeObserver(() => inst.resize({ animation: { duration: 0 } }))
    ro.observe(elRef.current)

    return () => {
      ro.disconnect()
      inst.dispose()
      chart.current = null
    }
  }, [chart])

  return { elRef, chart }
}

