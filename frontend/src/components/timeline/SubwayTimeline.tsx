import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { GitBranch, GitMerge, Calendar, FileText, ArrowRight } from 'lucide-react'
import type { TrackerNode, TrackerPaper } from '@/types/tracker'

// 地铁线路主题页数据
export interface SubwayStage {
  index: number
  name: string
  year: number
  nodes: SubwayNode[]
}

export interface SubwayNode {
  id: string
  title: string
  summary: string
  coverImage?: string
  paperCount: number
  year: number
  month: number
  isMergeNode: boolean
  branchLabels: string[]
  branchColor: string
  position: 'left' | 'right' | 'center'
}

export interface SubwayTimelineProps {
  stages: SubwayStage[]
  topicName: string
  topicColor: string
  onNodeClick?: (nodeId: string) => void
}

// 分支颜色配置
const BRANCH_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#f43f5e', // rose
]

export const SubwayTimeline: React.FC<SubwayTimelineProps> = ({
  stages,
  topicColor,
  onNodeClick,
}) => {
  // 计算统计数据
  const stats = useMemo(() => {
    const totalNodes = stages.reduce((sum, stage) => sum + stage.nodes.length, 0)
    const totalPapers = stages.reduce(
      (sum, stage) => sum + stage.nodes.reduce((s, n) => s + n.paperCount, 0),
      0
    )
    const mergeNodes = stages.reduce(
      (sum, stage) => sum + stage.nodes.filter(n => n.isMergeNode).length,
      0
    )
    const yearRange = stages.length > 0 
      ? `${stages[0].year}-${stages[stages.length - 1].year}`
      : '-'

    return { totalNodes, totalPapers, mergeNodes, yearRange }
  }, [stages])

  if (stages.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-black/50">暂无研究时间线数据</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* 头部统计 */}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <StatCard label="研究阶段" value={stages.length} icon={Calendar} />
        <StatCard label="研究节点" value={stats.totalNodes} icon={GitBranch} />
        <StatCard label="包含论文" value={stats.totalPapers} icon={FileText} />
        <StatCard label="汇流节点" value={stats.mergeNodes} icon={GitMerge} />
      </div>

      {/* 地铁线路图 */}
      <div className="relative">
        {/* 中央主线 */}
        <div
          className="absolute left-1/2 top-0 bottom-0 w-1 -translate-x-1/2 rounded-full"
          style={{ backgroundColor: topicColor }}
        />

        {/* 阶段 */}
        <div className="space-y-12">
          {stages.map((stage, stageIndex) => (
            <StageSection
              key={stage.index}
              stage={stage}
              stageIndex={stageIndex}
              topicColor={topicColor}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>

        {/* 终点 */}
        <div className="relative mt-12 flex justify-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white shadow-lg"
            style={{ backgroundColor: topicColor }}
          >
            <span className="text-lg">🚩</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// 统计卡片
function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-[20px] border border-black/8 bg-white px-4 py-4">
      <div className="flex items-center gap-2 text-black/40">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 text-[28px] font-semibold text-black">{value}</div>
    </div>
  )
}

// 阶段区块
function StageSection({
  stage,
  stageIndex,
  topicColor,
  onNodeClick,
}: {
  stage: SubwayStage
  stageIndex: number
  topicColor: string
  onNodeClick?: (nodeId: string) => void
}) {
  // 将节点分配到左右两侧
  const { leftNodes, rightNodes } = useMemo(() => {
    const left: SubwayNode[] = []
    const right: SubwayNode[] = []
    
    stage.nodes.forEach((node, index) => {
      if (index % 2 === 0) {
        left.push(node)
      } else {
        right.push(node)
      }
    })

    return { leftNodes: left, rightNodes: right }
  }, [stage.nodes])

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: stageIndex * 0.1, duration: 0.4 }}
      className="relative"
    >
      {/* 阶段标题 */}
      <div className="relative mb-6 flex items-center justify-center">
        <div
          className="relative z-10 flex items-center gap-3 rounded-full border-2 border-white px-5 py-2 shadow-lg"
          style={{ backgroundColor: topicColor }}
        >
          <span className="text-white font-semibold">{stage.name}</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">
            {stage.year}
          </span>
        </div>
      </div>

      {/* 节点网格 */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
        {/* 左侧节点 */}
        <div className="space-y-4">
          {leftNodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              side="left"
              onClick={() => onNodeClick?.(node.id)}
            />
          ))}
        </div>

        {/* 中央时间线节点 */}
        <div className="relative flex w-8 flex-col items-center">
          {stage.nodes.map((node, index) => (
            <div
              key={node.id}
              className="relative flex h-24 w-full items-center justify-center"
            >
              {/* 连接线 */}
              <div
                className="absolute h-px w-8"
                style={{
                  backgroundColor: node.branchColor,
                  [index % 2 === 0 ? 'right' : 'left']: '50%',
                  width: 'calc(50% + 16px)',
                }}
              />
              
              {/* 节点圆点 */}
              <div
                className="relative z-10 h-4 w-4 rounded-full border-2 border-white shadow-md"
                style={{ backgroundColor: node.branchColor }}
              />
            </div>
          ))}
        </div>

        {/* 右侧节点 */}
        <div className="space-y-4">
          {rightNodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              side="right"
              onClick={() => onNodeClick?.(node.id)}
            />
          ))}
        </div>
      </div>
    </motion.section>
  )
}

// 节点卡片
function NodeCard({
  node,
  side,
  onClick,
}: {
  node: SubwayNode
  side: 'left' | 'right'
  onClick?: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: side === 'left' ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Link
        to={`/node/${node.id}`}
        onClick={onClick}
        className="group block overflow-hidden rounded-[20px] border border-black/8 bg-white transition-all hover:border-black/15 hover:shadow-lg"
      >
        {/* 封面图 */}
        {node.coverImage && (
          <div className="relative h-32 overflow-hidden bg-black/5">
            <img
              src={node.coverImage}
              alt={node.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* 年份标签 */}
            <div className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
              {node.year}
            </div>
            {/* 汇流标识 */}
            {node.isMergeNode && (
              <div className="absolute right-3 top-3 rounded-full bg-amber-500 px-2 py-1 text-xs text-white">
                汇流
              </div>
            )}
          </div>
        )}

        {/* 内容 */}
        <div className="p-4">
          {/* 分支标签 */}
          <div className="mb-2 flex flex-wrap gap-1">
            {node.branchLabels.slice(0, 2).map((label, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                style={{
                  backgroundColor: `${node.branchColor}15`,
                  color: node.branchColor,
                }}
              >
                <GitBranch className="h-2.5 w-2.5" />
                {label}
              </span>
            ))}
          </div>

          {/* 标题 */}
          <h3 className="mb-2 text-[15px] font-semibold leading-snug text-black group-hover:text-black/80 line-clamp-2">
            {node.title}
          </h3>

          {/* 摘要 */}
          <p className="mb-3 text-[13px] leading-relaxed text-black/60 line-clamp-2">
            {node.summary}
          </p>

          {/* 底部信息 */}
          <div className="flex items-center justify-between text-[11px] text-black/40">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {node.paperCount} 篇论文
            </span>
            <span className="flex items-center gap-1 text-black/60 transition group-hover:translate-x-0.5">
              查看详情
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

// 将 ResearchNode 转换为 SubwayNode
export function convertToSubwayNodes(
  nodes: TrackerNode[],
  papers: TrackerPaper[]
): SubwayStage[] {
  // 按阶段分组
  const stageMap = new Map<number, TrackerNode[]>()
  
  nodes.forEach(node => {
    const stageNodes = stageMap.get(node.stageIndex) || []
    stageNodes.push(node)
    stageMap.set(node.stageIndex, stageNodes)
  })

  // 转换为阶段数组
  const stages: SubwayStage[] = []
  
  stageMap.forEach((stageNodes, stageIndex) => {
    // 计算阶段年份（取节点年份的平均值）
    const years = stageNodes.map(node => {
      const nodePapers = node.paperIds
        .map(id => papers.find(p => p.id === id))
        .filter((p): p is TrackerPaper => Boolean(p))
      
      if (nodePapers.length === 0) return new Date().getFullYear()
      
      const yearSum = nodePapers.reduce((sum, p) => {
        const year = parseInt(p.published.slice(0, 4))
        return sum + (isNaN(year) ? new Date().getFullYear() : year)
      }, 0)
      
      return Math.round(yearSum / nodePapers.length)
    })
    
    const avgYear = years.length > 0 
      ? Math.round(years.reduce((a, b) => a + b, 0) / years.length)
      : new Date().getFullYear()

    // 生成阶段名称
    const stageNames = [
      '问题提出',
      '基础方法',
      '技术改进',
      '应用拓展',
      '综合分析',
    ]
    const stageName = stageNames[stageIndex - 1] || `阶段 ${stageIndex}`

    // 转换节点
    const subwayNodes: SubwayNode[] = stageNodes.map((node, index) => {
      const nodePapers = node.paperIds
        .map(id => papers.find(p => p.id === id))
        .filter((p): p is TrackerPaper => Boolean(p))
      
      const primaryPaper = nodePapers[0]
      const year = primaryPaper 
        ? parseInt(primaryPaper.published.slice(0, 4)) || avgYear
        : avgYear
      const month = primaryPaper
        ? parseInt(primaryPaper.published.slice(5, 7)) || 1
        : 1

      // 分配分支颜色
      const branchColor = BRANCH_COLORS[index % BRANCH_COLORS.length]

      return {
        id: node.nodeId,
        title: node.nodeLabel,
        summary: node.nodeSummary,
        coverImage: node.nodeCoverImage || primaryPaper?.coverPath || undefined,
        paperCount: node.paperIds.length,
        year,
        month,
        isMergeNode: node.isMergeNode,
        branchLabels: node.sourceBranchLabels,
        branchColor,
        position: index % 2 === 0 ? 'left' : 'right',
      }
    })

    stages.push({
      index: stageIndex,
      name: stageName,
      year: avgYear,
      nodes: subwayNodes,
    })
  })

  // 按阶段索引排序
  return stages.sort((a, b) => a.index - b.index)
}

export default SubwayTimeline
