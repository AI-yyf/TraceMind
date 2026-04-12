import type { ReactNode } from 'react'

export type TopicGraphStage = {
  stageIndex: number
  chronologyLabel: string
  badgeLabel: string
  displayTitle: string
  overview: string
  countsLabel?: string
}

export type TopicGraphLane = {
  id: string
  laneIndex: number
  label: string
  roleLabel: string
  description: string
  periodLabel: string
  color: string
  nodeCount: number
  side: 'left' | 'center' | 'right'
  isMainline: boolean
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
  chronologyLabel?: string // 节点时间标签
}

// 纵向时间线布局常量 - 简洁设计
const TIMELINE_WIDTH = 32 // 时间线宽度（更窄）
const STAGE_CONTAINER_WIDTH = 480 // 每阶段容器宽度
const STAGE_LABEL_HEIGHT = 60 // 阶段标签高度（更紧凑）
const NODE_ROW_HEIGHT = 180 // 每节点行高度
const TIMELINE_DOT_SIZE = 12 // 时间线节点圆点大小（更小）

// Branch lane configuration
const MAX_BRANCH_LANES = 10
const LANE_OFFSET_PX = 80 // Horizontal offset for each branch lane from timeline center
const NODE_CARD_APPROX_WIDTH = 140 // Approximate width of node card
const NODE_CARD_APPROX_HEIGHT = 120 // Approximate height of node card

type NodePosition = {
  nodeId: string
  stageIndex: number
  laneIndex: number
  side: 'left' | 'center' | 'right'
  x: number // X position relative to container left edge
  y: number // Y position relative to container top
  color: string
}

function calculateNodePositions(
  stages: TopicGraphStage[],
  nodes: TopicGraphNode[],
  lanes: TopicGraphLane[]
): NodePosition[] {
  const positions: NodePosition[] = []
  const laneColorMap = new Map(lanes.map((l) => [l.laneIndex, l.color]))
  
  // Calculate Y position for each stage
  let cumulativeY = 0
  const stageYPositions = new Map<number, number>()

  stages.forEach((stage) => {
    const stageNodes = nodes.filter((n) => n.stageIndex === stage.stageIndex)
    const nodeRowCount = Math.max(1, Math.ceil(stageNodes.length / 3))
    const stageHeight = STAGE_LABEL_HEIGHT + nodeRowCount * NODE_ROW_HEIGHT
    stageYPositions.set(stage.stageIndex, cumulativeY)
    cumulativeY += stageHeight
  })

  // Calculate X,Y for each node
  nodes.forEach((node) => {
    const stageY = stageYPositions.get(node.stageIndex) ?? 0
    const stageNodes = nodes.filter((n) => n.stageIndex === node.stageIndex)
    const nodeIndex = stageNodes.findIndex((n) => n.nodeId === node.nodeId)
    const row = Math.floor(nodeIndex / 3)

    // X position: based on side and laneIndex
    // Timeline center is at TIMELINE_WIDTH (16px from left)
    // Stage content starts after TIMELINE_WIDTH
    const timelineCenterX = TIMELINE_WIDTH
    let x: number

    if (node.isMainline || node.side === 'center') {
      // Mainline nodes near center timeline
      x = timelineCenterX + 20
    } else if (node.side === 'left') {
      // Left branch lanes
      const laneOffset = Math.min(node.laneIndex, MAX_BRANCH_LANES) * LANE_OFFSET_PX
      x = timelineCenterX - laneOffset - NODE_CARD_APPROX_WIDTH
    } else {
      // Right branch lanes
      const laneOffset = Math.min(node.laneIndex, MAX_BRANCH_LANES) * LANE_OFFSET_PX
      x = timelineCenterX + laneOffset + 20
    }

    // Y position within stage
    const y = stageY + STAGE_LABEL_HEIGHT + row * NODE_ROW_HEIGHT + NODE_CARD_APPROX_HEIGHT / 2

    const color = laneColorMap.get(node.laneIndex) ?? node.branchColor ?? '#7d1938'

    positions.push({
      nodeId: node.nodeId,
      stageIndex: node.stageIndex,
      laneIndex: node.laneIndex,
      side: node.side,
      x,
      y,
      color,
    })
  })

  return positions
}

type Connection = {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
  isMainline: boolean
}

function calculateConnections(
  nodes: TopicGraphNode[],
  positions: NodePosition[]
): Connection[] {
  const connections: Connection[] = []
  const positionMap = new Map(positions.map((p) => [p.nodeId, p]))

  nodes.forEach((node) => {
    if (node.parentNodeIds.length === 0) return

    const toPos = positionMap.get(node.nodeId)
    if (!toPos) return

    node.parentNodeIds.forEach((parentId) => {
      const fromPos = positionMap.get(parentId)
      if (!fromPos) return

      // Don't connect nodes within the same stage
      if (fromPos.stageIndex === toPos.stageIndex) return

      connections.push({
        id: `${parentId}-${node.nodeId}`,
        fromX: fromPos.x,
        fromY: fromPos.y,
        toX: toPos.x,
        toY: toPos.y,
        color: toPos.color,
        isMainline: node.isMainline,
      })
    })
  })

  return connections
}

export function TopicGraphSection({
  stages,
  lanes,
  nodes,
  activeAnchor,
  getStageDomId,
  onFocusStage,
  renderNode,
}: {
  stages: TopicGraphStage[]
  lanes: TopicGraphLane[]
  nodes: TopicGraphNode[]
  activeAnchor: string | null
  getStageDomId: (anchorId: string) => string
  onFocusStage: (anchorId: string) => void
  renderNode: (node: TopicGraphNode) => ReactNode
}) {
  const orderedStages = [...stages].sort((left, right) => left.stageIndex - right.stageIndex)
  const orderedLanes = [...lanes].sort((left, right) => left.laneIndex - right.laneIndex)
  // Keep orderedLanes for potential future use in filtering
  void orderedLanes

  // Calculate node positions and connections
  const nodePositions = calculateNodePositions(orderedStages, nodes, orderedLanes)
  const connections = calculateConnections(nodes, nodePositions)

  // Calculate total height for SVG
  const totalHeight = orderedStages.reduce((acc, stage) => {
    const stageNodes = nodes.filter((n) => n.stageIndex === stage.stageIndex)
    const nodeRowCount = Math.max(1, Math.ceil(stageNodes.length / 3))
    return acc + STAGE_LABEL_HEIGHT + nodeRowCount * NODE_ROW_HEIGHT
  }, 0)

  return (
    <section className="mt-8 overflow-x-auto rounded-[28px] border border-black/8 bg-white px-3 py-3 md:px-4 md:py-4">
      <div
        data-testid="topic-stage-map"
        className="relative"
        style={{
          minWidth: TIMELINE_WIDTH + STAGE_CONTAINER_WIDTH,
        }}
      >
        {/* 纵向时间线布局 */}
        <div className="flex flex-col">
          {orderedStages.map((stage) => {
            const highlighted = activeAnchor === `stage:${stage.stageIndex}`
            const stageNodes = nodes.filter((n) => n.stageIndex === stage.stageIndex)
            const nodeRowCount = Math.max(1, Math.ceil(stageNodes.length / 3))

            return (
              <div
                key={stage.stageIndex}
                className="flex items-stretch border-b border-black/6 last:border-b-0"
                style={{ minHeight: STAGE_LABEL_HEIGHT + nodeRowCount * NODE_ROW_HEIGHT }}
              >
                {/* 时间线区域 */}
                <div
                  className="relative flex flex-col items-center justify-start py-4"
                  style={{ width: TIMELINE_WIDTH, minWidth: TIMELINE_WIDTH }}
                >
                  {/* 时间线垂直线 */}
                  <div
                    className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2"
                    style={{ backgroundColor: '#7d1938', opacity: 0.35 }}
                  />
                  {/* 时间线节点圆点 */}
                  <div
                    className="relative z-10 mt-2 flex items-center justify-center rounded-full"
                    style={{
                      width: TIMELINE_DOT_SIZE,
                      height: TIMELINE_DOT_SIZE,
                      backgroundColor: highlighted ? '#7d1938' : '#7d1938',
                      opacity: highlighted ? 1 : 0.6,
                      boxShadow: highlighted ? '0 0 8px rgba(125,25,56,0.25)' : undefined,
                    }}
                  />
                </div>

                {/* 阶段内容区域 */}
                <button
                  type="button"
                  id={getStageDomId(`stage:${stage.stageIndex}`)}
                  onClick={() => onFocusStage(`stage:${stage.stageIndex}`)}
                  className={`flex-1 px-4 py-3 text-left transition ${
                    highlighted ? 'bg-[#fff8ea]' : 'bg-white/88'
                  }`}
                  style={{ minWidth: STAGE_CONTAINER_WIDTH }}
                >
                  {/* 阶段时间标签 - 适中大小 */}
                  <div className="text-[22px] font-bold leading-tight tracking-tight text-black tabular-nums">
                    {stage.chronologyLabel}
                  </div>

                  {/* 节点卡片网格 - 左上角显示时间 */}
                  {stageNodes.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {stageNodes.map((node) => renderNode({ ...node, chronologyLabel: stage.chronologyLabel }))}
                    </div>
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>

        {/* SVG连线层 - Lane-based connections */}
        <svg
          className="pointer-events-none absolute inset-0"
          style={{
            width: STAGE_CONTAINER_WIDTH + TIMELINE_WIDTH,
            height: totalHeight,
            overflow: 'visible',
          }}
          aria-hidden="true"
        >
          <defs>
            {/* Gradient definitions for smooth transitions */}
            {connections.map((conn) => (
              <linearGradient
                key={`gradient-${conn.id}`}
                id={`gradient-${conn.id}`}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor={conn.color} stopOpacity={conn.isMainline ? 0.8 : 0.6} />
                <stop offset="100%" stopColor={conn.color} stopOpacity={conn.isMainline ? 0.8 : 0.6} />
              </linearGradient>
            ))}
          </defs>
          
          {/* Lane connection lines */}
          {connections.map((conn) => {
            // Calculate bezier curve control points for smooth transitions
            const midY = (conn.fromY + conn.toY) / 2
            const isToMainline = conn.toX === TIMELINE_WIDTH + 20
            const isFromMainline = conn.fromX === TIMELINE_WIDTH + 20
            
            // Adjust control points based on whether it's merging to/from mainline
            const cp1Y = conn.fromY + (midY - conn.fromY) * 0.4
            const cp2Y = conn.toY - (conn.toY - midY) * 0.4
            
            // Path: bezier curve from parent to child
            const path = isFromMainline || isToMainline
              ? // Merge/split path with smooth curve toward center
                `M ${conn.fromX} ${conn.fromY} 
                 C ${conn.fromX} ${cp1Y}, 
                   ${conn.toX} ${cp2Y}, 
                   ${conn.toX} ${conn.toY}`
              : // Standard vertical-ish path
                `M ${conn.fromX} ${conn.fromY} 
                 C ${conn.fromX} ${cp1Y}, 
                   ${conn.toX} ${cp2Y}, 
                   ${conn.toX} ${conn.toY}`

            return (
              <path
                key={conn.id}
                d={path}
                stroke={conn.color}
                strokeWidth={conn.isMainline ? 2.5 : 2}
                fill="none"
                strokeOpacity={conn.isMainline ? 0.85 : 0.55}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          })}
          
          {/* Mainline center timeline accent */}
          {connections
            .filter((c) => c.isMainline)
            .map((conn) => (
              <line
                key={`mainline-accent-${conn.id}`}
                x1={TIMELINE_WIDTH}
                y1={conn.fromY}
                x2={TIMELINE_WIDTH}
                y2={conn.toY}
                stroke="#7d1938"
                strokeWidth={1.5}
                strokeOpacity={0.25}
                strokeDasharray="4 4"
              />
            ))}
        </svg>
      </div>
    </section>
  )
}
