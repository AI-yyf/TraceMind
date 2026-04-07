/**
 * LazySection - 懒加载容器组件
 *
 * 使用 IntersectionObserver 实现渐进渲染，
 * 未进入视口时显示骨架屏，进入后渲染实际内容。
 *
 * 用法：
 * <LazySection fallback={<Skeleton />}>
 *   <HeavyContent />
 * </LazySection>
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface LazySectionProps {
  children: ReactNode
  /** 懒加载前显示的占位内容 */
  fallback?: ReactNode
  /** 触发可见的比例阈值 (0~1) */
  threshold?: number
  /** 提前加载的边距（px） */
  rootMargin?: string
  /** 是否打印时强制渲染 */
  printAlways?: boolean
}

export function LazySection({
  children,
  fallback,
  threshold = 0.05,
  rootMargin = '300px',
  printAlways = true,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 打印时强制显示
    const mql = window.matchMedia('print')
    if (mql.matches && printAlways) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold },
    )

    observer.observe(el)

    const handlePrint = (e: MediaQueryListEvent) => {
      if (e.matches) setVisible(true)
    }
    mql.addEventListener('change', handlePrint)

    return () => {
      observer.disconnect()
      mql.removeEventListener('change', handlePrint)
    }
  }, [threshold, rootMargin, printAlways])

  return (
    <div ref={ref}>
      {visible ? children : fallback || <DefaultSkeleton />}
    </div>
  )
}

function DefaultSkeleton() {
  return (
    <div className="space-y-4 animate-pulse py-6">
      <div className="h-4 bg-neutral-100 rounded w-3/4" />
      <div className="h-4 bg-neutral-100 rounded w-1/2" />
      <div className="h-32 bg-neutral-50 rounded-lg" />
      <div className="h-4 bg-neutral-100 rounded w-5/6" />
      <div className="h-4 bg-neutral-100 rounded w-2/3" />
    </div>
  )
}
