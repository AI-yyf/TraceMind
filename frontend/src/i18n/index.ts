// 多语言支持入口
export * from './types'
export * from './translations'

// 重新导出 useI18n hook
export { useI18n, I18nProvider } from './useI18n'

// 导出双语支持
export { BilingualProvider, useBilingual, useBilingualText, useTopicBilingual } from './bilingual'
export type { BilingualContent, MultilingualContent, BilingualDisplayOptions } from './bilingual'
