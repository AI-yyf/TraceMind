import type { ReactNode } from 'react'

export type TopicGraphStage = {
  stageIndex: number
  chronologyLabel: string
  badgeLabel: string
  displayTitle: string
  overview: string
  countsLabel?: string
  /** Optional time label format for this stage */
  timeLabelFormat?: 'year' | 'year-month' | 'month' | 'month-range' | 'date-range'
  /** Optional formatted time label override */
  formattedTimeLabel?: string
}

export type TopicGraphTimeline = {
  timelineId: string
  label: string
  color: string
  isPrimary: boolean
  /** Lane index range this timeline covers [start, end] */
  laneRange: [number, number]
  periodLabel: string
  /** Sort order for display */
  order?: number
  /** Optional description */
  description?: string
}

export type TopicGraphLane = {
  id: string
  laneIndex: number
  branchIndex?: number | null
  label: string
  legendLabel?: string
  roleLabel: string
  description: string
  periodLabel: string
  color: string
  nodeCount: number
  side: 'left' | 'center' | 'right'
  isMainline: boolean
  /** Reference to parent timeline for multi-timeline support */
  timelineId?: string
}

export type TopicGraphNode = {
  nodeId: string
  anchorId: string
  stageIndex: number
  laneIndex: number
  parentNodeIds: string[]
  branchColor: string
  emphasis: 'primary' | 'merge' | 'branch'
  side: 'left' | 'center' | 'right'
  isMainline: boolean
  chronologyLabel?: string
  row?: number
  column?: number
  title?: string
  summary?: string
  explanation?: string
  paperCount?: number
  figureCount?: number
  tableCount?: number
  formulaCount?: number
  evidenceCount?: number
  cardHeightEstimate?: number
}

const STAGE_RAIL_CONTENT_WIDTH = 220
const STAGE_RAIL_SCRIM_WIDTH = 272
const CANVAS_PADDING_X = 28
const STAGE_RAIL_SAFE_GAP = 24
const STAGE_GAP = 30
const STAGE_VERTICAL_PADDING = 22
const STAGE_RAIL_TEXT_SAFETY_BUFFER = 54
const CARD_ROW_GAP = 20
const MIN_CARD_HEIGHT = 170

const MAINLINE_COLOR = '#7d1938'
const HIGHLIGHT_COLOR = '#d1aa5c'

type StageLayout = {
  stageIndex: number
  top: number
  height: number
}

type NodePlacement = {
  row: number
  offsetY: number
  height: number
}

type LayoutMetrics = {
  canvasWidth: number
  bodyWidth: number
  contentOffsetX: number
  cardWidth: number
  cardHeight: number
  columnGap: number
  trackCenterXMap: Map<string, number>
  timelineCenterX: number
}

type TrackSlot = {
  key: string
  order: number
  isMainline: boolean
  color: string
}

type NodePosition = {
  nodeId: string
  stageIndex: number
  laneIndex: number
  trackKey: string
  x: number
  y: number
  leftX: number
  rightX: number
  cardCenterX: number
  cardCenterY: number
  topY: number
  bottomY: number
  color: string
  isMainline: boolean
}

type Connection = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
  isMainline: boolean
  sameStage: boolean
  route: 'horizontal' | 'vertical'
  isBranch: boolean
  isMerge: boolean
  /** Indicates this is a derive connection (single node to multiple outputs) */
  isDerive: boolean
  /** Indicates cross-timeline connection */
  isCrossTimeline: boolean
  /** Source timeline ID for cross-timeline connections */
  sourceTimelineId?: string
  /** Target timeline ID for cross-timeline connections */
  targetTimelineId?: string
}

function hasFiniteNumber(value: number | null | undefined): value is number {
  return Number.isFinite(value)
}

function sortNodes(left: TopicGraphNode, right: TopicGraphNode) {
  if (left.stageIndex !== right.stageIndex) return left.stageIndex - right.stageIndex
  const leftTrackOrder = hasFiniteNumber(left.column) ? left.column : left.laneIndex
  const rightTrackOrder = hasFiniteNumber(right.column) ? right.column : right.laneIndex
  if (leftTrackOrder !== rightTrackOrder) return leftTrackOrder - rightTrackOrder
  if (left.column !== right.column) {
    const leftColumn = hasFiniteNumber(left.column) ? left.column : Number.MAX_SAFE_INTEGER
    const rightColumn = hasFiniteNumber(right.column) ? right.column : Number.MAX_SAFE_INTEGER
    if (leftColumn !== rightColumn) return leftColumn - rightColumn
  }
  if (left.laneIndex !== right.laneIndex) return left.laneIndex - right.laneIndex
  const leftRow = Number.isFinite(left.row) ? left.row ?? 1 : 1
  const rightRow = Number.isFinite(right.row) ? right.row ?? 1 : 1
  if (leftRow !== rightRow) return leftRow - rightRow
  if (left.isMainline !== right.isMainline) return left.isMainline ? -1 : 1
  return left.nodeId.localeCompare(right.nodeId)
}

function resolveNodeTrackOrder(
  node: TopicGraphNode,
  laneOrderMap: Map<number, number>,
) {
  if (hasFiniteNumber(node.column)) return node.column
  return laneOrderMap.get(node.laneIndex) ?? node.laneIndex
}

function resolveNodeTrackKey(
  node: TopicGraphNode,
  laneOrderMap: Map<number, number>,
) {
  if (hasFiniteNumber(node.column)) return `column:${node.column}`
  const laneOrder = laneOrderMap.get(node.laneIndex)
  return laneOrder == null ? `lane:${node.laneIndex}` : `lane:${laneOrder}:${node.laneIndex}`
}

function buildLaneOrderMap(nodes: TopicGraphNode[]) {
  const laneOrders = new Map<number, number[]>()

  for (const node of nodes) {
    if (!hasFiniteNumber(node.column)) continue
    const current = laneOrders.get(node.laneIndex) ?? []
    current.push(node.column)
    laneOrders.set(node.laneIndex, current)
  }

  return new Map(
    [...laneOrders.entries()].map(([laneIndex, orders]) => [
      laneIndex,
      Math.min(...orders),
    ]),
  )
}

function resolveLaneTracks(lanes: TopicGraphLane[], nodes: TopicGraphNode[]) {
  const laneOrderMap = buildLaneOrderMap(nodes)

  return [...lanes].sort((left, right) => {
    const leftOrder = laneOrderMap.get(left.laneIndex) ?? left.laneIndex
    const rightOrder = laneOrderMap.get(right.laneIndex) ?? right.laneIndex
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    if (left.isMainline !== right.isMainline) return left.isMainline ? -1 : 1
    return left.laneIndex - right.laneIndex
  })
}

function resolveTrackSlots(args: {
  lanes: TopicGraphLane[]
  nodes: TopicGraphNode[]
}) {
  const laneOrderMap = buildLaneOrderMap(args.nodes)
  const laneColorMap = new Map(args.lanes.map((lane) => [lane.laneIndex, lane.color || MAINLINE_COLOR]))
  const laneMainlineMap = new Map(args.lanes.map((lane) => [lane.laneIndex, lane.isMainline]))
  const trackMap = new Map<string, TrackSlot>()
  const nodeTrackKeyMap = new Map<string, string>()

  for (const node of [...args.nodes].sort(sortNodes)) {
    const key = resolveNodeTrackKey(node, laneOrderMap)
    const existing = trackMap.get(key)
    const order = resolveNodeTrackOrder(node, laneOrderMap)
    const color = laneColorMap.get(node.laneIndex) ?? node.branchColor ?? MAINLINE_COLOR

    nodeTrackKeyMap.set(node.nodeId, key)

    if (!existing) {
      trackMap.set(key, {
        key,
        order,
        isMainline: node.isMainline || laneMainlineMap.get(node.laneIndex) === true,
        color,
      })
      continue
    }

    trackMap.set(key, {
      ...existing,
      order: Math.min(existing.order, order),
      isMainline: existing.isMainline || node.isMainline,
      color: existing.isMainline ? existing.color : color,
    })
  }

  if (trackMap.size === 0) {
    for (const lane of args.lanes) {
      trackMap.set(`lane:${lane.laneIndex}`, {
        key: `lane:${lane.laneIndex}`,
        order: lane.laneIndex,
        isMainline: lane.isMainline,
        color: lane.color || MAINLINE_COLOR,
      })
    }
  }

  return {
    laneOrderMap,
    nodeTrackKeyMap,
    tracks: [...trackMap.values()].sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order
      if (left.isMainline !== right.isMainline) return left.isMainline ? -1 : 1
      return left.key.localeCompare(right.key)
    }),
  }
}

function resolveCardWidth(trackCount: number) {
  if (trackCount <= 1) return 268
  if (trackCount === 2) return 244
  if (trackCount === 3) return 224
  if (trackCount === 4) return 212
  if (trackCount <= 6) return 198
  if (trackCount <= 8) return 184
  return 168
}

function resolveCardGap(trackCount: number) {
  if (trackCount >= 9) return 18
  if (trackCount >= 6) return 19
  return 20
}

function resolveMinimumBodyWidth(trackCount: number) {
  if (trackCount <= 1) return 560
  if (trackCount === 2) return 720
  if (trackCount === 3) return 860
  if (trackCount === 4) return 980
  return 0
}

function approximateWrappedLineCount(value: string | null | undefined, maxCharsPerLine: number) {
  const normalized = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!normalized) return 0

  return normalized
    .split(/\n+/u)
    .reduce((count, line) => {
      const visualUnits = Array.from(line).reduce((sum, character) => {
        if (/\s/u.test(character)) return sum + 0.38
        if (/[.,;:!?()[\]{}'"`|/-]/u.test(character)) return sum + 0.58
        if (/[A-Z0-9]/u.test(character)) return sum + 0.92
        if (character.charCodeAt(0) > 0x7f) return sum + 1.72
        return sum + 1
      }, 0)

      return count + Math.max(1, Math.ceil(visualUnits / maxCharsPerLine))
    }, 0)
}

function estimateStageRailHeight(stage: TopicGraphStage, cardHeight: number) {
  const chronologyBlockHeight = 52
  const titleBlockHeight =
    stage.displayTitle && stage.displayTitle !== stage.chronologyLabel
      ? approximateWrappedLineCount(stage.displayTitle, 12) * 20 + 12
      : 0
  const overviewBlockHeight = stage.overview
    ? approximateWrappedLineCount(
        stage.overview,
        stage.displayTitle ? 14 : 13,
      ) *
        20 +
      12
    : 0
  const countsBlockHeight = stage.countsLabel
    ? approximateWrappedLineCount(stage.countsLabel, 18) * 18 + 8
    : 0

  return Math.max(
    cardHeight + STAGE_VERTICAL_PADDING * 2,
    chronologyBlockHeight +
      titleBlockHeight +
      overviewBlockHeight +
      countsBlockHeight +
      STAGE_VERTICAL_PADDING * 2 +
      STAGE_RAIL_TEXT_SAFETY_BUFFER,
  )
}

function estimateNodeCardHeight(node: TopicGraphNode) {
  if (Number.isFinite(node.cardHeightEstimate)) {
    return Math.max(MIN_CARD_HEIGHT, Math.round(node.cardHeightEstimate ?? MIN_CARD_HEIGHT))
  }

  const titleLines = Math.max(1, approximateWrappedLineCount(node.title, 18))
  const summaryLines = Math.min(
    3,
    Math.max(1, approximateWrappedLineCount(node.summary || node.explanation, 24)),
  )
  const badgeCount =
    1 +
    (node.figureCount ? 1 : 0) +
    (node.tableCount ? 1 : 0) +
    (node.formulaCount ? 1 : 0) +
    (node.evidenceCount ? 1 : 0)
  const badgeRows = Math.max(1, Math.ceil(badgeCount / 3))
  const estimatedHeight =
    84 +
    titleLines * 22 +
    summaryLines * 20 +
    Math.max(0, badgeRows - 1) * 18

  return Math.max(MIN_CARD_HEIGHT, estimatedHeight)
}

function calculateLayoutMetrics(args: {
  tracks: TrackSlot[]
  rightSafetyInset: number
}): LayoutMetrics {
  const trackCount = Math.max(1, args.tracks.length)
  const gapCount = Math.max(0, trackCount - 1)
  const cardWidth = resolveCardWidth(trackCount)
  const columnGap = resolveCardGap(trackCount)
  const packedWidth = trackCount * cardWidth + gapCount * columnGap
  const bodyWidth = Math.max(packedWidth, resolveMinimumBodyWidth(trackCount))
  const leadingInset = Math.max(0, (bodyWidth - packedWidth) / 2)
  const contentOffsetX = STAGE_RAIL_SCRIM_WIDTH + STAGE_RAIL_SAFE_GAP
  const trackCenterXMap = new Map(
    args.tracks.map((track, index) => [
      track.key,
      contentOffsetX + leadingInset + index * (cardWidth + columnGap) + cardWidth / 2,
    ]),
  )
  const mainlineTrack =
    args.tracks.find((track) => track.isMainline) ?? args.tracks[Math.floor(args.tracks.length / 2)]

  return {
    canvasWidth: contentOffsetX + bodyWidth + CANVAS_PADDING_X + Math.max(0, args.rightSafetyInset),
    bodyWidth,
    contentOffsetX,
    cardWidth,
    cardHeight: MIN_CARD_HEIGHT,
    columnGap,
    trackCenterXMap,
    timelineCenterX:
      trackCenterXMap.get(mainlineTrack?.key ?? '') ?? contentOffsetX + bodyWidth / 2,
  }
}

function buildStagePlacements(args: {
  stages: TopicGraphStage[]
  nodes: TopicGraphNode[]
  nodeTrackKeyMap: Map<string, string>
  cardHeight: number
}) {
  const orderedNodes = [...args.nodes].sort(sortNodes)
  const placementMap = new Map<string, NodePlacement>()
  const stageLayoutMap = new Map<number, StageLayout>()

  let top = 0

  for (const stage of args.stages) {
    const stageNodes = orderedNodes.filter((node) => node.stageIndex === stage.stageIndex)
    const rowTokens = [...new Set(stageNodes.map((node) => (Number.isFinite(node.row) ? node.row ?? 1 : 1)))]
      .sort((left, right) => left - right)
    const rowIndexMap = new Map(
      (rowTokens.length > 0 ? rowTokens : [1]).map((token, index) => [token, index]),
    )
    const duplicateRowCounts = new Map<string, number>()
    const stageNodePlacements = new Map<string, { row: number; height: number }>()
    const rowHeights = new Map<number, number>()
    let rowCount = Math.max(1, rowIndexMap.size)

    for (const node of stageNodes) {
      const rawRow = Number.isFinite(node.row) ? node.row ?? 1 : 1
      const rowIndex = rowIndexMap.get(rawRow) ?? 0
      const duplicateKey = `${args.nodeTrackKeyMap.get(node.nodeId) ?? `lane:${node.laneIndex}`}:${rawRow}`
      const duplicateIndex = duplicateRowCounts.get(duplicateKey) ?? 0
      duplicateRowCounts.set(duplicateKey, duplicateIndex + 1)

      const resolvedRow = rowIndex + duplicateIndex
      const height = estimateNodeCardHeight(node)
      stageNodePlacements.set(node.nodeId, { row: resolvedRow, height })
      rowHeights.set(resolvedRow, Math.max(rowHeights.get(resolvedRow) ?? 0, height))
      rowCount = Math.max(rowCount, resolvedRow + 1)
    }

    let rowOffset = 0
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowHeight = rowHeights.get(rowIndex) ?? args.cardHeight
      for (const [nodeId, placement] of stageNodePlacements) {
        if (placement.row !== rowIndex) continue
        placementMap.set(nodeId, {
          row: placement.row,
          offsetY: rowOffset,
          height: placement.height,
        })
      }
      rowOffset += rowHeight
      if (rowIndex < rowCount - 1) {
        rowOffset += CARD_ROW_GAP
      }
    }

    const cardDrivenHeight = STAGE_VERTICAL_PADDING * 2 + Math.max(args.cardHeight, rowOffset)
    const height = Math.max(cardDrivenHeight, estimateStageRailHeight(stage, args.cardHeight))

    stageLayoutMap.set(stage.stageIndex, {
      stageIndex: stage.stageIndex,
      top,
      height,
    })

    top += height + STAGE_GAP
  }

  return {
    placementMap,
    stageLayoutMap,
    totalHeight: Math.max(0, top - STAGE_GAP),
  }
}

function calculateNodePositions(args: {
  nodes: TopicGraphNode[]
  nodeTrackKeyMap: Map<string, string>
  placementMap: Map<string, NodePlacement>
  stageLayoutMap: Map<number, StageLayout>
  trackCenterXMap: Map<string, number>
  cardWidth: number
  timelineCenterX: number
  laneColorMap: Map<number, string>
}) {
  const positions: NodePosition[] = []

  for (const node of args.nodes) {
    const placement = args.placementMap.get(node.nodeId)
    const stageLayout = args.stageLayoutMap.get(node.stageIndex)
    if (!placement || !stageLayout) continue

    const trackKey = args.nodeTrackKeyMap.get(node.nodeId) ?? `lane:${node.laneIndex}`
    const centerX = args.trackCenterXMap.get(trackKey) ?? args.timelineCenterX
    const x = centerX - args.cardWidth / 2
    const y = stageLayout.top + STAGE_VERTICAL_PADDING + placement.offsetY
    const color = args.laneColorMap.get(node.laneIndex) ?? node.branchColor ?? MAINLINE_COLOR

    positions.push({
      nodeId: node.nodeId,
      stageIndex: node.stageIndex,
      laneIndex: node.laneIndex,
      trackKey,
      x,
      y,
      leftX: x,
      rightX: x + args.cardWidth,
      cardCenterX: centerX,
      cardCenterY: y + placement.height / 2,
      topY: y,
      bottomY: y + placement.height,
      color,
      isMainline: node.isMainline,
    })
  }

  return positions
}

function calculateConnections(
  nodes: TopicGraphNode[],
  positions: NodePosition[],
  laneMap: Map<number, TopicGraphLane>,
) {
  const positionMap = new Map(positions.map((position) => [position.nodeId, position]))
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]))
  const connections: Connection[] = []

  // Track derive relationships (nodes with multiple children)
  const nodeChildrenMap = new Map<string, string[]>()
  for (const node of nodes) {
    for (const parentId of node.parentNodeIds) {
      const current = nodeChildrenMap.get(parentId) ?? []
      current.push(node.nodeId)
      nodeChildrenMap.set(parentId, current)
    }
  }

  for (const node of nodes) {
    if (node.parentNodeIds.length === 0) continue

    const target = positionMap.get(node.nodeId)
    if (!target) continue

    for (const parentId of node.parentNodeIds) {
      const source = positionMap.get(parentId)
      if (!source) continue
      const sameStage = source.stageIndex === target.stageIndex
      const sourceNode = nodeMap.get(parentId)

      // Determine connection types
      const isMerge = node.emphasis === 'merge' || node.parentNodeIds.length > 1
      const isBranch =
        node.emphasis === 'branch' ||
        source.laneIndex !== target.laneIndex ||
        source.trackKey !== target.trackKey ||
        sourceNode?.emphasis === 'branch'

      // Derive detection: source node has multiple children
      const children = nodeChildrenMap.get(parentId) ?? []
      const isDerive = children.length > 1

      // Cross-timeline detection
      const sourceLane = laneMap.get(source.laneIndex)
      const targetLane = laneMap.get(target.laneIndex)
      const isCrossTimeline = sourceLane?.timelineId !== targetLane?.timelineId &&
                             Boolean(sourceLane?.timelineId) &&
                             Boolean(targetLane?.timelineId)

      const color =
        source.isMainline && target.isMainline
          ? MAINLINE_COLOR
          : source.isMainline
            ? target.color
            : source.color

      const sameStageVertical =
        sameStage && Math.abs(target.cardCenterY - source.cardCenterY) > 24
      const targetOnRight = target.cardCenterX >= source.cardCenterX
      const fromX = sameStage && !sameStageVertical
        ? targetOnRight
          ? source.rightX
          : source.leftX
        : source.cardCenterX
      const toX = sameStage && !sameStageVertical
        ? targetOnRight
          ? target.leftX
          : target.rightX
        : target.cardCenterX
      const fromY = sameStage
        ? sameStageVertical
          ? target.cardCenterY >= source.cardCenterY
            ? source.bottomY
            : source.topY
          : source.cardCenterY
        : source.bottomY
      const toY = sameStage
        ? sameStageVertical
          ? target.cardCenterY >= source.cardCenterY
            ? target.topY
            : target.bottomY
          : target.cardCenterY
        : target.topY

      connections.push({
        id: `${parentId}-${node.nodeId}`,
        sourceNodeId: parentId,
        targetNodeId: node.nodeId,
        fromX,
        fromY,
        toX,
        toY,
        color,
        isMainline: source.isMainline && target.isMainline,
        sameStage,
        route: sameStage && !sameStageVertical ? 'horizontal' : 'vertical',
        isBranch,
        isMerge,
        isDerive,
        isCrossTimeline,
        sourceTimelineId: sourceLane?.timelineId,
        targetTimelineId: targetLane?.timelineId,
      })
    }
  }

  return connections
}

function buildConnectionPath(connection: Connection) {
  // Cross-timeline connections use a more pronounced S-curve
  if (connection.isCrossTimeline) {
    const direction = connection.toX >= connection.fromX ? 1 : -1
    const horizontalSpan = Math.abs(connection.toX - connection.fromX)
    const verticalSpan = Math.abs(connection.toY - connection.fromY)

    // Use asymmetric control points for cross-timeline flows
    const cp1x = connection.fromX + direction * Math.max(40, horizontalSpan * 0.4)
    const cp1y = connection.fromY + Math.min(80, verticalSpan * 0.3)
    const cp2x = connection.toX - direction * Math.max(40, horizontalSpan * 0.4)
    const cp2y = connection.toY - Math.min(80, verticalSpan * 0.3)

    return `
      M ${connection.fromX} ${connection.fromY}
      C ${cp1x} ${cp1y},
        ${cp2x} ${cp2y},
        ${connection.toX} ${connection.toY}
    `
  }

  // Derive connections (single to multiple) use wider curves
  if (connection.isDerive && !connection.sameStage) {
    const middleY = connection.fromY + (connection.toY - connection.fromY) / 2
    const spread = Math.abs(connection.toX - connection.fromX)
    const cpOffset = Math.max(30, spread * 0.25)

    return `
      M ${connection.fromX} ${connection.fromY}
      C ${connection.fromX} ${middleY - cpOffset},
        ${connection.toX} ${middleY + cpOffset},
        ${connection.toX} ${connection.toY}
    `
  }

  if (connection.sameStage && connection.route === 'horizontal') {
    const direction = connection.toX >= connection.fromX ? 1 : -1
    const controlOffset = Math.max(
      24,
      Math.min(60, Math.abs(connection.toX - connection.fromX) * 0.3),
    )

    return `
      M ${connection.fromX} ${connection.fromY}
      C ${connection.fromX + direction * controlOffset} ${connection.fromY},
        ${connection.toX - direction * controlOffset} ${connection.toY},
        ${connection.toX} ${connection.toY}
    `
  }

  if (connection.sameStage) {
    const controlOffset = Math.max(
      26,
      Math.min(56, Math.abs(connection.toY - connection.fromY) * 0.38),
    )

    return `
      M ${connection.fromX} ${connection.fromY}
      C ${connection.fromX} ${connection.fromY + controlOffset},
        ${connection.toX} ${connection.toY - controlOffset},
        ${connection.toX} ${connection.toY}
    `
  }

  const middleY = connection.fromY + (connection.toY - connection.fromY) / 2

  return `
    M ${connection.fromX} ${connection.fromY}
    C ${connection.fromX} ${middleY},
      ${connection.toX} ${middleY},
      ${connection.toX} ${connection.toY}
  `
}

function resolveStageBandBackground(highlighted: boolean) {
  return highlighted ? 'rgba(255,248,234,0.48)' : 'rgba(255,255,255,0.58)'
}

function resolveStageRailScrim(highlighted: boolean) {
  const solid = highlighted ? 'rgba(255,248,234,0.97)' : 'rgba(255,255,255,0.97)'
  const mid = highlighted ? 'rgba(255,248,234,0.88)' : 'rgba(255,255,255,0.9)'
  const edge = highlighted ? 'rgba(255,248,234,0.22)' : 'rgba(255,255,255,0.18)'

  return `linear-gradient(90deg, ${solid} 0%, ${solid} 62%, ${mid} 82%, ${edge} 94%, rgba(255,255,255,0) 100%)`
}

export function TopicGraphSection({
  stages,
  lanes,
  nodes,
  timelines,
  activeAnchor,
  getStageDomId,
  onFocusStage,
  renderNode,
  rightSafetyInset = 0,
  maxCardsPerStage = 10,
  maxTimelines = 10,
}: {
  stages: TopicGraphStage[]
  lanes: TopicGraphLane[]
  nodes: TopicGraphNode[]
  timelines?: TopicGraphTimeline[]
  activeAnchor: string | null
  getStageDomId: (anchorId: string) => string
  onFocusStage: (anchorId: string) => void
  renderNode: (node: TopicGraphNode) => ReactNode
  rightSafetyInset?: number
  maxCardsPerStage?: number
  maxTimelines?: number
}) {
  const orderedStages = [...stages].sort((left, right) => left.stageIndex - right.stageIndex)
  const { nodeTrackKeyMap, tracks } = resolveTrackSlots({ lanes, nodes })
  const laneTracks = resolveLaneTracks(lanes, nodes)
  const laneMap = new Map(laneTracks.map((lane) => [lane.laneIndex, lane]))

  // Process timelines with limits
  const processedTimelines = (timelines ?? []).slice(0, maxTimelines).sort((left, right) =>
    (left.order ?? 0) - (right.order ?? 0)
  )

  // Build timeline lane groups for header rendering
  const timelineLaneGroups = processedTimelines.length > 0
    ? processedTimelines.map((timeline) => ({
        ...timeline,
        lanes: laneTracks.filter(
          (lane) => lane.laneIndex >= timeline.laneRange[0] && lane.laneIndex <= timeline.laneRange[1]
        ),
      }))
    : [{ timelineId: 'default', label: '', color: MAINLINE_COLOR, isPrimary: true, laneRange: [0, laneTracks.length - 1] as [number, number], periodLabel: '', lanes: laneTracks }]

  const legendLanes = [...laneTracks].sort((left, right) => {
    if (left.isMainline !== right.isMainline) return left.isMainline ? -1 : 1

    const leftBranchIndex = left.branchIndex ?? Number.MAX_SAFE_INTEGER
    const rightBranchIndex = right.branchIndex ?? Number.MAX_SAFE_INTEGER
    if (leftBranchIndex !== rightBranchIndex) return leftBranchIndex - rightBranchIndex

    return left.laneIndex - right.laneIndex
  })
  const metrics = calculateLayoutMetrics({
    tracks,
    rightSafetyInset,
  })
  const laneColorMap = new Map(laneTracks.map((lane) => [lane.laneIndex, lane.color || MAINLINE_COLOR]))
  const { placementMap, stageLayoutMap, totalHeight } = buildStagePlacements({
    stages: orderedStages,
    nodes,
    nodeTrackKeyMap,
    cardHeight: metrics.cardHeight,
  })
  const nodePositions = calculateNodePositions({
    nodes,
    nodeTrackKeyMap,
    placementMap,
    stageLayoutMap,
    trackCenterXMap: metrics.trackCenterXMap,
    cardWidth: metrics.cardWidth,
    timelineCenterX: metrics.timelineCenterX,
    laneColorMap,
  })
  const nodePositionMap = new Map(nodePositions.map((position) => [position.nodeId, position]))
  const connections = calculateConnections(nodes, nodePositions, laneMap)

  // Count nodes per stage for "+N more" indicators
  const stageNodeCounts = new Map<number, number>()
  for (const node of nodes) {
    stageNodeCounts.set(node.stageIndex, (stageNodeCounts.get(node.stageIndex) ?? 0) + 1)
  }

  // Helper to format stage chronology label with time format
  const formatStageLabel = (stage: TopicGraphStage): string => {
    if (stage.formattedTimeLabel) return stage.formattedTimeLabel
    if (stage.timeLabelFormat && stage.chronologyLabel) {
      return stage.chronologyLabel
    }
    return stage.chronologyLabel
  }

  return (
    <section className="mt-8">
      <div className="mb-6 flex items-center gap-2 px-1 text-black/50">
        <div
          className="h-[2px] w-8 rounded-full"
          style={{ background: `linear-gradient(90deg, ${MAINLINE_COLOR}, ${HIGHLIGHT_COLOR})` }}
        />
        <span className="text-[12px] font-medium uppercase tracking-wide">Research Graph</span>
        {processedTimelines.length > 1 && (
          <span className="text-[11px] text-black/40">
            ({processedTimelines.length} timelines, max {maxCardsPerStage} cards/stage)
          </span>
        )}
      </div>

      {/* Timeline Headers */}
      {processedTimelines.length > 1 && (
        <div className="mb-4 flex flex-wrap items-start gap-4 px-1">
          {timelineLaneGroups.map((timeline) => (
            <div
              key={timeline.timelineId}
              className="flex items-center gap-2 rounded-[12px] border px-3 py-2"
              style={{
                borderColor: `${timeline.color}40`,
                backgroundColor: `${timeline.color}08`,
              }}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: timeline.color }}
              />
              <div className="flex flex-col">
                <span className="text-[12px] font-semibold text-black/80">
                  {timeline.label}
                  {timeline.isPrimary && (
                    <span className="ml-1.5 text-[10px] font-normal text-black/50">(primary)</span>
                  )}
                </span>
                {timeline.periodLabel && (
                  <span className="text-[10px] text-black/50">{timeline.periodLabel}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lane Legend */}
      {laneTracks.length > 0 ? (
        <div
          data-testid="topic-graph-legend"
          className="mb-5 flex flex-wrap items-center gap-2 px-1"
        >
          {legendLanes.slice(0, 10).map((lane) => {
            const parentTimeline = processedTimelines.find((t) => t.timelineId === lane.timelineId)
            return (
              <div
                key={lane.id}
                data-testid={`topic-graph-legend-${lane.laneIndex}`}
                className="inline-flex max-w-[340px] items-center gap-2 rounded-[16px] border border-black/8 bg-white px-3 py-2 text-[11px] text-black/60"
                style={parentTimeline ? { borderColor: `${parentTimeline.color}30` } : undefined}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: lane.color || MAINLINE_COLOR }}
                />
                <span
                  className="whitespace-normal break-words font-medium leading-4 text-black/72"
                  title={lane.legendLabel || lane.label}
                >
                  {lane.legendLabel || lane.label}
                </span>
                {parentTimeline && (
                  <span
                    className="ml-1 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: parentTimeline.color }}
                  />
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="overflow-x-auto px-1 pb-6" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div data-testid="topic-stage-map" className="relative min-w-full">
          <div
            data-testid="topic-stage-map-canvas"
            className="relative isolate"
            style={{
              width: metrics.canvasWidth,
              minHeight: totalHeight,
            }}
          >
            <div className="absolute inset-0 z-0">
              {tracks.map((track) => {
                const x = metrics.trackCenterXMap.get(track.key)
                if (typeof x !== 'number') return null

                return (
                  <div key={track.key} className="pointer-events-none absolute inset-y-0">
                    <div
                      className="absolute top-0 h-full -translate-x-1/2 rounded-full"
                      style={{
                        left: x,
                        width: track.isMainline ? 4 : 2,
                        background: track.isMainline
                          ? `linear-gradient(180deg, ${MAINLINE_COLOR} 0%, rgba(125,25,56,0.52) 45%, ${MAINLINE_COLOR} 100%)`
                          : `linear-gradient(180deg, ${track.color} 0%, rgba(255,255,255,0) 100%)`,
                        opacity: track.isMainline ? 0.95 : 0.42,
                        boxShadow: track.isMainline
                          ? '0 0 10px rgba(125,25,56,0.18)'
                          : `0 0 8px ${track.color}22`,
                      }}
                    />
                  </div>
                )
              })}
            </div>

            <div className="absolute inset-0 z-0">
              {orderedStages.map((stage) => {
                const stageLayout = stageLayoutMap.get(stage.stageIndex)
                if (!stageLayout) return null
                const highlighted = activeAnchor === `stage:${stage.stageIndex}`

                return (
                  <div
                    key={stage.stageIndex}
                    data-testid={`topic-stage-band-${stage.stageIndex}`}
                    className="absolute left-0 right-0 rounded-[28px] transition"
                    style={{
                      top: stageLayout.top,
                      height: stageLayout.height,
                      backgroundColor: resolveStageBandBackground(highlighted),
                      boxShadow: highlighted
                        ? 'inset 0 0 0 1px rgba(209,170,92,0.24), 0 12px 32px rgba(15,23,42,0.04)'
                        : 'inset 0 0 0 1px rgba(0,0,0,0.04)',
                    }}
                  />
                )
              })}
            </div>

            <svg
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                width: metrics.canvasWidth,
                height: totalHeight,
                overflow: 'visible',
              }}
              aria-hidden="true"
            >
              {connections.map((connection) => (
                <g
                  key={connection.id}
                  style={{ filter: 'drop-shadow(0 1px 4px rgba(255,255,255,0.72))' }}
                >
                  {/* White outline for visibility */}
                  <path
                    d={buildConnectionPath(connection)}
                    stroke="rgba(255,255,255,0.96)"
                    strokeWidth={
                      connection.isMainline
                        ? 6.2
                        : connection.isMerge || connection.isDerive || connection.isBranch
                          ? 5.4
                          : connection.isCrossTimeline
                            ? 5.0
                            : 4.8
                    }
                    fill="none"
                    strokeOpacity={0.98}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Main connection line */}
                  <path
                    d={buildConnectionPath(connection)}
                    stroke={connection.isMainline ? MAINLINE_COLOR : connection.color}
                    strokeWidth={
                      connection.isMainline
                        ? 2.9
                        : connection.isMerge || connection.isDerive
                          ? 3.2
                          : connection.isCrossTimeline
                            ? 2.6
                            : 2.15
                    }
                    fill="none"
                    strokeOpacity={
                      connection.isMainline
                        ? 0.74
                        : connection.isMerge || connection.isDerive
                          ? 0.88
                          : connection.isCrossTimeline
                            ? 0.72
                            : 0.62
                    }
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={connection.isCrossTimeline ? '4,3' : undefined}
                  />

                  {/* Merge point indicator - dot at target */}
                  {connection.isMerge && (
                    <circle
                      cx={connection.toX}
                      cy={connection.toY}
                      r={4}
                      fill={connection.isMainline ? MAINLINE_COLOR : connection.color}
                      fillOpacity={0.95}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  )}

                  {/* Derive point indicator - dot at source */}
                  {connection.isDerive && (
                    <circle
                      cx={connection.fromX}
                      cy={connection.fromY}
                      r={3.2}
                      fill={connection.isMainline ? MAINLINE_COLOR : connection.color}
                      fillOpacity={0.9}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  )}

                  {/* Branch indicator */}
                  {connection.isBranch && !connection.isMerge && !connection.isDerive && (
                    <circle
                      cx={connection.toX}
                      cy={connection.toY}
                      r={2.4}
                      fill={connection.isMainline ? MAINLINE_COLOR : connection.color}
                      fillOpacity={0.8}
                    />
                  )}
                </g>
              ))}
            </svg>

            <div className="absolute inset-0 z-20">
              {orderedStages.map((stage) => {
                const stageLayout = stageLayoutMap.get(stage.stageIndex)
                if (!stageLayout) return null
                const highlighted = activeAnchor === `stage:${stage.stageIndex}`
                const totalNodesInStage = stageNodeCounts.get(stage.stageIndex) ?? 0
                const hasMoreIndicator = totalNodesInStage > maxCardsPerStage

                return (
                  <div
                    key={stage.stageIndex}
                    className="pointer-events-none absolute left-0 rounded-[28px]"
                    style={{
                      top: stageLayout.top,
                      width: STAGE_RAIL_SCRIM_WIDTH,
                      height: stageLayout.height,
                      background: resolveStageRailScrim(highlighted),
                    }}
                  >
                    <button
                      type="button"
                      id={getStageDomId(`stage:${stage.stageIndex}`)}
                      data-testid={`topic-stage-rail-${stage.stageIndex}`}
                      onClick={() => onFocusStage(`stage:${stage.stageIndex}`)}
                      className="pointer-events-auto absolute left-0 top-0 flex h-full flex-col justify-center rounded-[22px] px-4 text-left transition hover:bg-black/[0.025]"
                      style={{
                        width: STAGE_RAIL_CONTENT_WIDTH,
                        backgroundColor: highlighted ? 'rgba(209,170,92,0.08)' : 'transparent',
                      }}
                    >
                      <div
                        className="font-semibold tracking-tight tabular-nums"
                        style={{
                          fontSize: highlighted ? '28px' : '26px',
                          lineHeight: 1,
                          color: highlighted ? HIGHLIGHT_COLOR : MAINLINE_COLOR,
                        }}
                      >
                        {formatStageLabel(stage)}
                      </div>

                      {stage.displayTitle && stage.displayTitle !== stage.chronologyLabel ? (
                        <div className="mt-2 text-[13px] font-medium leading-5 text-black/72">
                          {stage.displayTitle}
                        </div>
                      ) : null}

                      {stage.overview ? (
                        <p className="mt-2 text-[12px] leading-5 text-black/56">
                          {stage.overview}
                        </p>
                      ) : null}

                      {stage.countsLabel ? (
                        <div className="mt-2 text-[11px] leading-5 text-black/38">
                          {stage.countsLabel}
                        </div>
                      ) : null}

                      {/* +N more indicator */}
                      {hasMoreIndicator && (
                        <div className="mt-2 inline-flex items-center gap-1">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${HIGHLIGHT_COLOR}20`,
                              color: HIGHLIGHT_COLOR,
                            }}
                          >
                            +{totalNodesInStage - maxCardsPerStage} more
                          </span>
                        </div>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="absolute inset-0 z-30">
              {orderedStages.map((stage) => {
                const stageLayout = stageLayoutMap.get(stage.stageIndex)
                if (!stageLayout) return null
                const stageNodes = nodes
                  .filter((node) => node.stageIndex === stage.stageIndex)
                  .sort(sortNodes)

                return (
                  <div
                    key={stage.stageIndex}
                    className="absolute left-0 right-0"
                    style={{
                      top: stageLayout.top,
                      height: stageLayout.height,
                    }}
                  >
                    {stageNodes.map((node) => {
                      const position = nodePositionMap.get(node.nodeId)
                      if (!position) return null

                      return (
                        <div
                          key={node.nodeId}
                          className="absolute"
                          style={{
                            left: position.x,
                            top: position.y - stageLayout.top,
                            width: metrics.cardWidth,
                          }}
                        >
                          {renderNode(node)}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
