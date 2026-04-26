/**
 * 搜索服务模块导出
 * 提供论文搜索、聚合、引用分析等功能
 *
 * "广纳贤文" - 多来源论文发现
 */

// Semantic Scholar 服务
export {
  searchPapers,
  getPaperDetails,
  getCitations,
  getReferences,
  getAuthorDetails,
  getAuthorPapers,
  analyzeAuthorNetwork,
  analyzeVenueCluster,
  performEnhancedExpandedSearch,
  performExpandedSearch,
  executeDiscoveryQueries,
  identifyOriginPapers,
  calculateImpactScore,
  generateExpandedQueries,
} from './semantic-scholar'

export type {
  SemanticScholarPaper,
  SemanticScholarAuthor,
  CitationChainResult,
  QueryExpansionResult,
  AuthorNetworkResult,
  VenueClusterResult,
  ExpandedSearchConfig,
  EnhancedExpandedSearchResult,
} from './semantic-scholar'

// OpenAlex 服务 (广纳贤文补充来源)
export {
  searchWorks,
  getWork,
  batchGetWorks,
  getCitationNetwork,
  getAuthor,
  getAuthorWorks,
  getSource,
  searchWorksByVenue,
  reconstructAbstract,
  discoverySearch,
  extractArxivId,
  normalizePaperId,
  transformToInternalPaper,
  transformToInternalPapers,
} from './openalex'

export type {
  OpenAlexWork,
  OpenAlexAuthor,
  OpenAlexSource,
  OpenAlexSearchFilters,
  OpenAlexSearchResult,
  OpenAlexPaper,
  SearchWorksOptions,
  CitationNetworkResult,
} from './openalex'

export {
  searchWorksByTitle as searchCrossrefWorksByTitle,
  getWorkByDoi as getCrossrefWorkByDoi,
  transformCrossrefWork,
} from './crossref'

export type { CrossrefWork, CrossrefPaper } from './crossref'

// 搜索聚合器
export {
  SearchAggregator,
  createSearchAggregator,
  aggregatePapers,
} from './search-aggregator'

export type {
  AggregatorConfig,
  AggregatedPaper,
  AggregationResult,
} from './search-aggregator'

// 网页搜索服务（用于增强论文发现）
export { WebSearchService } from './web-search'

export type {
  WebSearchResult,
  WebSearchConfig,
} from './web-search'
