/**
 * Zotero Web API v3 Export Service for TraceMind
 * Exports papers from topics/nodes to Zotero library
 * 
 * API Reference: https://www.zotero.org/support/dev/web_api/v3/basics
 */

// ============================================================================
// Types
// ============================================================================

export interface ZoteroConfig {
  userId: string
  apiKey: string
}

export interface ZoteroItem {
  itemType: 'journalArticle' | 'conferencePaper' | 'preprint'
  title: string
  creators: Array<{
    creatorType: string
    firstName: string
    lastName: string
  }>
  date?: string
  DOI?: string
  url?: string
  abstractNote?: string
  tags?: Array<{ tag: string }>
  collections?: string[]
}

export interface ZoteroResponseItem {
  key: string
  version: number
  data: ZoteroItem
}

export interface ZoteroCollection {
  key: string
  version: number
  data: {
    key: string
    name: string
    parentCollection?: string | false
  }
}

export interface PaperData {
  title: string
  authors: string
  published: Date
  summary?: string | null
  arxivUrl?: string | null
  pdfUrl?: string | null
  doi?: string | null
  tags?: string | null
}

export interface ExportResult {
  success: boolean
  exportedCount: number
  errors: string[]
  collectionKey?: string
}

// ============================================================================
// Constants
// ============================================================================

const ZOTERO_API_BASE = 'https://api.zotero.org'
const MAX_ITEMS_PER_REQUEST = 50
const RATE_LIMIT_DELAY_MS = 1000

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse authors string into Zotero creator format
 * Supports formats: "First Last", "Last, First", "First Last; Another Author"
 */
function parseAuthors(authorsStr: string): Array<{
  creatorType: string
  firstName: string
  lastName: string
}> {
  if (!authorsStr || !authorsStr.trim()) {
    return []
  }

  // Split by semicolon, comma+space patterns that aren't "Last, First"
  const authors: Array<{ creatorType: string; firstName: string; lastName: string }> = []
  
  // Try splitting by semicolon first
  let authorList = authorsStr.split(';').map(a => a.trim()).filter(Boolean)
  
  // If no semicolons, try comma (but handle "Last, First" format)
  if (authorList.length === 1 && authorsStr.includes(',')) {
    // Check if it looks like "Last, First; Last2, First2" pattern
    const commaParts = authorsStr.split(',')
    if (commaParts.length === 2 && commaParts[0].length < 50 && commaParts[1].length < 50) {
      // Single author in "Last, First" format
      authorList = [authorsStr]
    } else {
      // Multiple authors separated by comma
      authorList = authorsStr.split(',').map(a => a.trim()).filter(Boolean)
    }
  }

  for (const author of authorList) {
    if (!author) continue
    
    // Check for "Last, First" format
    const commaMatch = author.match(/^([^,]+),\s*(.+)$/)
    if (commaMatch) {
      authors.push({
        creatorType: 'author',
        lastName: commaMatch[1].trim(),
        firstName: commaMatch[2].trim()
      })
      continue
    }

    // Try to split by space for "First Last" format
    const parts = author.trim().split(/\s+/)
    if (parts.length >= 2) {
      // Last word is last name, rest is first name
      const lastName = parts[parts.length - 1]
      const firstName = parts.slice(0, -1).join(' ')
      authors.push({
        creatorType: 'author',
        lastName,
        firstName
      })
    } else if (parts.length === 1) {
      // Only one name, use as last name
      authors.push({
        creatorType: 'author',
        lastName: parts[0],
        firstName: ''
      })
    }
  }

  return authors
}

/**
 * Parse tags string into array
 */
function parseTags(tagsStr: string | null | undefined): Array<{ tag: string }> {
  if (!tagsStr || !tagsStr.trim()) {
    return []
  }

  // Support comma, semicolon, or space separated tags
  const tags = tagsStr
    .split(/[,;]/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(tag => ({ tag }))

  return tags
}

/**
 * Extract DOI from URL or return as-is
 */
function extractDOI(doiOrUrl: string | null | undefined): string | undefined {
  if (!doiOrUrl) return undefined

  const trimmed = doiOrUrl.trim()
  
  // Already a DOI
  if (/^10\.\d{4,}/.test(trimmed)) {
    return trimmed
  }

  // DOI URL format: https://doi.org/10.xxxx/...
  const doiMatch = trimmed.match(/doi\.org\/(10\.\d{4,}\/[^\s]+)/)
  if (doiMatch) {
    return doiMatch[1]
  }

  // arXiv DOI format
  const arxivDoiMatch = trimmed.match(/arxiv\.org\/(abs|pdf)\/([\d.]+)/)
  if (arxivDoiMatch) {
    // arXiv papers have DOIs like: 10.48550/arXiv.2301.12345
    return `10.48550/arXiv.${arxivDoiMatch[2]}`
  }

  return undefined
}

/**
 * Format date for Zotero (YYYY-MM-DD or YYYY)
 */
function formatDate(date: Date | null | undefined): string | undefined {
  if (!date) return undefined
  
  try {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch {
    return undefined
  }
}

/**
 * Convert Paper data to Zotero item
 */
function paperToZoteroItem(paper: PaperData, collectionKey?: string): ZoteroItem {
  const item: ZoteroItem = {
    itemType: 'journalArticle', // Default to journalArticle, could be enhanced to detect type
    title: paper.title,
    creators: parseAuthors(paper.authors),
    date: formatDate(paper.published),
    DOI: extractDOI(paper.doi || paper.arxivUrl),
    url: paper.arxivUrl || paper.pdfUrl || undefined,
    abstractNote: paper.summary || undefined,
    tags: parseTags(paper.tags)
  }

  if (collectionKey) {
    item.collections = [collectionKey]
  }

  return item
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Make API request with retry logic for rate limiting
 */
async function zoteroRequest(
  config: ZoteroConfig,
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
  } = {}
): Promise<{ data: unknown; status: number; headers: Headers }> {
  const { method = 'GET', body } = options
  const url = `${ZOTERO_API_BASE}/users/${config.userId}${endpoint}`

  const headers: Record<string, string> = {
    'Zotero-API-Key': config.apiKey,
    'Zotero-API-Version': '3',
    'Content-Type': 'application/json'
  }

  let lastError: Error | null = null
  let retryCount = 0
  const maxRetries = 3

  while (retryCount < maxRetries) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      })

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const delayMs = retryAfter 
          ? parseInt(retryAfter, 10) * 1000 
          : RATE_LIMIT_DELAY_MS * (retryCount + 1) * 2
        
        console.log(`[Zotero] Rate limited, waiting ${delayMs}ms before retry...`)
        await sleep(delayMs)
        retryCount++
        continue
      }

      // Handle errors
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Zotero API error (${response.status}): ${errorText}`)
      }

      const data = response.status === 204 ? null : await response.json()
      return { data, status: response.status, headers: response.headers }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      retryCount++
      
      if (retryCount < maxRetries) {
        await sleep(RATE_LIMIT_DELAY_MS * retryCount)
      }
    }
  }

  throw lastError || new Error('Unknown error after retries')
}

/**
 * Test Zotero API connection
 */
export async function testZoteroConnection(
  config: ZoteroConfig
): Promise<{ success: boolean; username?: string; error?: string }> {
  try {
    const { data } = await zoteroRequest(config, '')
    
    if (data && typeof data === 'object') {
      const userData = data as { username?: string }
      return {
        success: true,
        username: userData.username
      }
    }
    
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown connection error'
    }
  }
}

/**
 * Get all collections from Zotero library
 */
export async function getZoteroCollections(
  config: ZoteroConfig
): Promise<ZoteroCollection[]> {
  const { data } = await zoteroRequest(config, '/collections')
  return data as ZoteroCollection[]
}

/**
 * Find existing collection by name
 */
export async function findZoteroCollection(
  config: ZoteroConfig,
  name: string
): Promise<ZoteroCollection | null> {
  const collections = await getZoteroCollections(config)
  return collections.find(c => c.data.name === name) || null
}

/**
 * Create a new Zotero collection
 */
export async function createZoteroCollection(
  config: ZoteroConfig,
  name: string,
  parentKey?: string
): Promise<{ key: string } | null> {
  try {
    const collectionData: {
      name: string
      parentCollection?: string
    } = { name }
    
    if (parentKey) {
      collectionData.parentCollection = parentKey
    }

    const { data } = await zoteroRequest(config, '/collections', {
      method: 'POST',
      body: [collectionData]
    })

    // Response is an array of created items
    if (data && Array.isArray(data) && data.length > 0) {
      const result = data[0] as { successful?: Record<string, unknown>; success?: Record<string, unknown> }
      
      // Handle successful response format
      if (result.successful) {
        const keys = Object.keys(result.successful)
        if (keys.length > 0) {
          return { key: keys[0] }
        }
      }
      
      if (result.success) {
        const keys = Object.keys(result.success)
        if (keys.length > 0) {
          return { key: keys[0] }
        }
      }
    }

    return null
  } catch (error) {
    console.error('[Zotero] Failed to create collection:', error)
    return null
  }
}

/**
 * Batch create items in Zotero (max 50 per request)
 */
async function batchCreateItems(
  config: ZoteroConfig,
  items: ZoteroItem[]
): Promise<{ success: number; errors: string[] }> {
  if (items.length === 0) {
    return { success: 0, errors: [] }
  }

  const errors: string[] = []
  let successCount = 0

  // Split into chunks of MAX_ITEMS_PER_REQUEST
  const chunks: ZoteroItem[][] = []
  for (let i = 0; i < items.length; i += MAX_ITEMS_PER_REQUEST) {
    chunks.push(items.slice(i, i + MAX_ITEMS_PER_REQUEST))
  }

  for (const chunk of chunks) {
    try {
      const { data } = await zoteroRequest(config, '/items', {
        method: 'POST',
        body: chunk
      })

      if (data && typeof data === 'object') {
        const result = data as {
          successful?: Record<string, unknown>
          failed?: Record<string, { code: number; message: string }>
          unchanged?: Record<string, unknown>
        }

        if (result.successful) {
          successCount += Object.keys(result.successful).length
        }

        if (result.failed) {
          for (const [, error] of Object.entries(result.failed)) {
            errors.push(`Item failed: ${error.code} - ${error.message}`)
          }
        }
      }

      // Rate limiting between batches
      if (chunks.length > 1) {
        await sleep(RATE_LIMIT_DELAY_MS)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      errors.push(`Batch failed: ${errorMsg}`)
    }
  }

  return { success: successCount, errors }
}

/**
 * Export papers to Zotero
 */
export async function exportPapersToZotero(
  config: ZoteroConfig,
  papers: Array<PaperData>,
  options?: { collectionName?: string; collectionKey?: string }
): Promise<ExportResult> {
  const errors: string[] = []
  let collectionKey = options?.collectionKey

  try {
    // Create or find collection if name provided
    if (options?.collectionName && !collectionKey) {
      const existingCollection = await findZoteroCollection(config, options.collectionName)
      
      if (existingCollection) {
        collectionKey = existingCollection.key
      } else {
        const newCollection = await createZoteroCollection(config, options.collectionName)
        if (newCollection) {
          collectionKey = newCollection.key
        } else {
          errors.push(`Failed to create collection "${options.collectionName}"`)
        }
      }
    }

    // Convert papers to Zotero items
    const zoteroItems: ZoteroItem[] = papers.map(paper => 
      paperToZoteroItem(paper, collectionKey)
    )

    // Batch create items
    const result = await batchCreateItems(config, zoteroItems)
    
    errors.push(...result.errors)

    return {
      success: result.success > 0,
      exportedCount: result.success,
      errors,
      collectionKey
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error during export')
    return {
      success: false,
      exportedCount: 0,
      errors
    }
  }
}

/**
 * Export papers from a Prisma Paper result
 */
export async function exportPrismaPapersToZotero(
  config: ZoteroConfig,
  papers: Array<{
    title: string
    authors: string
    published: Date
    summary?: string | null
    arxivUrl?: string | null
    pdfUrl?: string | null
    tags?: string | null
  }>,
  options?: { collectionName?: string; collectionKey?: string }
): Promise<ExportResult> {
  const paperData: PaperData[] = papers.map(p => ({
    title: p.title,
    authors: p.authors,
    published: p.published,
    summary: p.summary,
    arxivUrl: p.arxivUrl,
    pdfUrl: p.pdfUrl,
    tags: p.tags
  }))

  return exportPapersToZotero(config, paperData, options)
}

/**
 * Delete all items in a collection (optional utility)
 */
export async function clearZoteroCollection(
  config: ZoteroConfig,
  collectionKey: string
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  try {
    // Get items in collection
    const { data } = await zoteroRequest(
      config, 
      `/collections/${collectionKey}/items?limit=1000`
    )
    
    const items = data as Array<{ key: string }>
    
    if (!items || items.length === 0) {
      return { success: true, deletedCount: 0 }
    }

    // Delete items in batches
    const keys = items.map(item => item.key)
    let deletedCount = 0

    for (let i = 0; i < keys.length; i += MAX_ITEMS_PER_REQUEST) {
      const batch = keys.slice(i, i + MAX_ITEMS_PER_REQUEST)
      await zoteroRequest(config, '/items', {
        method: 'DELETE',
        body: batch
      })
      deletedCount += batch.length
    }

    return { success: true, deletedCount }
  } catch (error) {
    return {
      success: false,
      deletedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Default export object
export default {
  testZoteroConnection,
  getZoteroCollections,
  findZoteroCollection,
  createZoteroCollection,
  exportPapersToZotero,
  exportPrismaPapersToZotero,
  clearZoteroCollection
}
