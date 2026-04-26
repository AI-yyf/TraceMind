// MathJax 全局类型定义
// 这个文件在整个应用中只定义一次，避免重复声明冲突

declare global {
  interface Window {
    __mathJaxLoadingPromise?: Promise<unknown>
    MathJax?: {
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>
      typesetClear?: (elements?: HTMLElement[]) => void
      startup?: {
        promise?: Promise<unknown>
        defaultReady?: () => void
      }
    } & Record<string, unknown>
  }
}

export {}
