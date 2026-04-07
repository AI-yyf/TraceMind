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

export function buildNodeAnchorRoute(baseRoute: string, anchorId: string) {
  const [pathname, search = ''] = baseRoute.split('?')
  const params = new URLSearchParams(search)
  params.set('anchor', anchorId)
  const nextSearch = params.toString()
  return nextSearch ? `${pathname}?${nextSearch}` : pathname
}

export function buildPaperAnchorRoute(baseRoute: string, paperId: string, anchorId?: string | null) {
  return buildNodeAnchorRoute(baseRoute, anchorId?.trim() || `paper:${paperId}`)
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

  const normalizedRoute = route?.trim()
  if (normalizedRoute && !normalizedRoute.startsWith('/paper/')) {
    return normalizedRoute
  }

  if (topicId) {
    return buildNodeAnchorRoute(`/topic/${topicId}`, anchorId?.trim() || `paper:${paperId}`)
  }

  return normalizedRoute || `/paper/${paperId}`
}
