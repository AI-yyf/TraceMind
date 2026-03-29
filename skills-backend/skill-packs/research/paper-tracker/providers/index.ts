/**
 * 搜索提供者统一导出
 */

export { createArxivSearchProvider, type ArxivSearchProvider } from './arxiv-provider'
export { createOpenAlexSearchProvider, type OpenAlexSearchProvider } from './openalex-provider'

import type { ArxivSearchProvider } from './arxiv-provider'
import type { OpenAlexSearchProvider } from './openalex-provider'

export type SearchProvider = ArxivSearchProvider | OpenAlexSearchProvider

export function createAllProviders(): SearchProvider[] {
  return [
    createArxivSearchProvider(),
    createOpenAlexSearchProvider(),
  ]
}
