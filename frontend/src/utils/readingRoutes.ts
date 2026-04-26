type PaperRouteResolutionArgs = {
  paperId: string
  route?: string | null
  anchorId?: string | null
  nodeRoute?: string | null
  relatedNodes?: Array<{
    route: string
  }> | null
  topicId?: string | null
}

function splitRouteParts(route: string) {
  const [pathname, search = ''] = route.split('?')
  return {
    pathname,
    params: new URLSearchParams(search),
  }
}

function canAttachReadingAnchor(route: string) {
  const { pathname } = splitRouteParts(route)
  return pathname.startsWith('/node/') || pathname.startsWith('/topic/')
}

export function buildNodeAnchorRoute(baseRoute: string, anchorId: string) {
  const { pathname, params } = splitRouteParts(baseRoute)
  params.set('anchor', anchorId)
  const nextSearch = params.toString()
  return nextSearch ? `${pathname}?${nextSearch}` : pathname
}

export function buildPaperAnchorRoute(
  baseRoute: string,
  paperId: string,
  anchorId?: string | null,
) {
  return buildNodeAnchorRoute(baseRoute, anchorId?.trim() || `paper:${paperId}`)
}

export function normalizeResolvedReadingRouteForPaper({
  paperId,
  route,
  anchorId,
}: Pick<PaperRouteResolutionArgs, 'paperId' | 'route' | 'anchorId'>) {
  const normalizedRoute = route?.trim()
  if (!normalizedRoute) return null

  if (!canAttachReadingAnchor(normalizedRoute)) return null

  const { params } = splitRouteParts(normalizedRoute)
  if (params.has('anchor')) {
    return normalizedRoute
  }

  return buildPaperAnchorRoute(normalizedRoute, paperId, anchorId)
}

export function canonicalizePaperLikeRoute({
  paperId,
  route,
  anchorId,
  nodeRoute,
  relatedNodes,
  topicId,
}: PaperRouteResolutionArgs) {
  return resolvePrimaryReadingRouteForPaper({
    paperId,
    route,
    anchorId,
    nodeRoute,
    relatedNodes,
    topicId,
  })
}

export function resolvePrimaryReadingRouteForPaper({
  paperId,
  route,
  anchorId,
  nodeRoute,
  relatedNodes,
  topicId,
}: PaperRouteResolutionArgs) {
  const preferredNodeRoute = nodeRoute?.trim() || relatedNodes?.[0]?.route?.trim()
  if (preferredNodeRoute) {
    return buildPaperAnchorRoute(preferredNodeRoute, paperId, anchorId)
  }

  const normalizedRoute = normalizeResolvedReadingRouteForPaper({
    paperId,
    route,
    anchorId,
  })
  if (normalizedRoute) {
    return normalizedRoute
  }

  if (topicId) {
    return buildPaperAnchorRoute(`/topic/${topicId}`, paperId, anchorId)
  }

  console.warn(`Cannot resolve route for paper ${paperId}: no node or topic association`)
  return '/'
}
