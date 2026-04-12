/**
 * 搜索提供者统一导出
 */

import { createArxivSearchProvider, type ArxivSearchProvider } from './arxiv-provider'
import { createOpenAlexSearchProvider, type OpenAlexSearchProvider } from './openalex-provider'

export { createArxivSearchProvider, createOpenAlexSearchProvider }
export type { ArxivSearchProvider, OpenAlexSearchProvider }

export type SearchProvider = ArxivSearchProvider | OpenAlexSearchProvider

export function createAllProviders(): SearchProvider[] {
  return [
    createArxivSearchProvider(),
    createOpenAlexSearchProvider(),
  ]
}
