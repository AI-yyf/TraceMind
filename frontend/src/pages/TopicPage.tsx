import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, GitBranch, Merge, Clock } from 'lucide-react'

import { getTopicDisplay } from '@/data/topicDisplay'
import { getTopicNodes, getPaperRecord } from '@/data/tracker'
import { useTopicRegistry } from '@/hooks'
import type { TopicId, TrackerNode } from '@/types/tracker'

// 分支颜色配置 - 与后端统一
const branchColors = [
  '#dc2626', // red-600 - 主线
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#db2777', // pink-600
  '#4f46e5', // indigo-600
]

interface NodeCardProps {
  node: TrackerNode
  color: string
  isMainline: boolean
}

function NodeCard({ node, color, isMainline }: NodeCardProps) {
  const primaryPaper = getPaperRecord(node.primaryPaperId)
  const titleZh = primaryPaper?.titleZh || node.nodeLabel || '未命名节点'
  const titleEn = primaryPaper?.titleEn
  const summary = node.nodeSummary || primaryPaper?.summary || '该节点暂无详细摘要。'
  const explanation = node.nodeExplanation || primaryPaper?.explanation
  
  // 获取配图 URL（优先使用节点配图，其次是论文封面）
  const coverImage = node.nodeCoverImage || primaryPaper?.coverPath

  return (
    <Link
      to={`/node/${node.nodeId}`}
      className="group block overflow-hidden rounded-[20px] border border-black/8 bg-white transition hover:border-black/12 hover:shadow-md"
    >
      {/* 配图区域 */}
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-black/5 to-black/[0.02]">
        {coverImage ? (
          <img
            src={coverImage}
            alt={titleZh}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div 
            className="flex h-full w-full items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${color}08 0%, ${color}03 100%)`,
            }}
          >
            <div className="text-center">
              <span 
                className="text-[64px] font-light leading-none opacity-10"
                style={{ color }}
              >
                {node.stageIndex}
              </span>
            </div>
          </div>
        )}
        
        {/* 左上角标签 */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {node.sourceBranchLabels.slice(0, 1).map((label, i) => (
            <span
              key={i}
              className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm"
              style={{ color }}
            >
              {label}
            </span>
          ))}
          {node.isMergeNode && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
              <Merge className="h-3 w-3" />
              汇流
            </span>
          )}
          {isMainline && (
            <span className="rounded-full bg-red-500/90 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
              主线
            </span>
          )}
        </div>

        {/* 右下角状态 */}
        {node.provisional && (
          <div className="absolute bottom-3 right-3">
            <span className="rounded-full bg-black/60 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
              临时
            </span>
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="p-5">
        {/* 中文标题 */}
        <h4 className="text-[16px] font-semibold leading-snug text-black line-clamp-2">
          {titleZh}
        </h4>

        {/* 英文标题 */}
        {titleEn && titleEn !== titleZh && (
          <p className="mt-1.5 text-[12px] italic leading-relaxed text-black/40 line-clamp-1">
            {titleEn}
          </p>
        )}

        {/* 简要讲解（优先使用 explanation，其次是 summary） */}
        <p className="mt-3 text-[13px] leading-relaxed text-black/60 line-clamp-3">
          {explanation || summary}
        </p>

        {/* 底部信息 */}
        <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-3">
          <div className="flex items-center gap-3 text-[11px] text-black/40">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(node.updatedAt).toLocaleDateString('zh-CN')}
            </span>
            <span>{node.paperCount} 篇论文</span>
          </div>
          
          {/* 阅读更多 */}
          <span className="flex items-center gap-1 text-[11px] font-medium text-black/60 transition group-hover:text-black">
            阅读详情
            <svg className="h-3 w-3 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  )
}

interface StageSectionProps {
  stageIndex: number
  nodes: TrackerNode[]
  branchColorMap: Map<string, string>
  mainlineBranchId?: string
}

function StageSection({ stageIndex, nodes, branchColorMap, mainlineBranchId }: StageSectionProps) {
  // 按分支分组节点
  const nodesByBranch = nodes.reduce((acc, node) => {
    const branchId = node.sourceBranchIds[0] || 'main'
    if (!acc[branchId]) acc[branchId] = []
    acc[branchId].push(node)
    return acc
  }, {} as Record<string, TrackerNode[]>)

  const branchIds = Object.keys(nodesByBranch)

  return (
    <div className="relative">
      {/* 阶段标题 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-[14px] font-bold text-white">
          {stageIndex}
        </div>
        <div>
          <h3 className="text-[16px] font-semibold text-black">阶段 {stageIndex}</h3>
          <p className="text-[12px] text-black/50">{nodes.length} 个节点 · {branchIds.length} 条分支</p>
        </div>
      </div>

      {/* 分支时间线 */}
      <div className="relative ml-5 border-l-2 border-black/10 pl-6">
        {branchIds.map((branchId) => {
          const branchNodes = nodesByBranch[branchId]
          const color = branchColorMap.get(branchId) || '#dc2626'
          const isMainline = branchId === mainlineBranchId || branchId === 'main'

          return (
            <div key={branchId} className="relative mb-4 last:mb-0">
              {/* 分支标签 */}
              <div className="mb-2 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }}></div>
                <span className="text-[12px] font-medium" style={{ color }}>
                  {branchNodes[0]?.sourceBranchLabels[0] || branchId}
                </span>
                {isMainline && (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">
                    主线
                  </span>
                )}
              </div>

              {/* 该分支的节点 - 网格布局 */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {branchNodes.map((node) => (
                  <NodeCard
                    key={node.nodeId}
                    node={node}
                    color={color}
                    isMainline={isMainline}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TopicPage() {
  const { topicId } = useParams<{ topicId: TopicId }>()
  const { allTopicMap } = useTopicRegistry()
  const topic = topicId ? allTopicMap[topicId] : null
  const display = topic ? getTopicDisplay(topic.id) : null
  const nodes = topicId ? getTopicNodes(topicId) : []

  // 按阶段分组节点
  const nodesByStage = nodes.reduce((acc, node) => {
    const stage = node.stageIndex
    if (!acc[stage]) acc[stage] = []
    acc[stage].push(node)
    return acc
  }, {} as Record<number, TrackerNode[]>)

  // 为每个分支分配颜色
  const branchColorMap = new Map<string, string>()
  display?.branchPalette.forEach((branch, index) => {
    branchColorMap.set(branch.branchId, branchColors[index % branchColors.length])
  })

  // 确定主线分支
  const mainlineBranchId = display?.branchPalette.find(b => b.branchId === 'main')?.branchId

  if (!topic || !display) {
    return (
      <div className="px-4 py-10 md:px-6 xl:px-10">
        <Link to="/" className="text-sm underline underline-offset-4">
          返回首页
        </Link>
        <div className="mt-4 text-black/60">这个主题不存在。</div>
      </div>
    )
  }

  const stages = Object.keys(nodesByStage)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1100px]">
        {/* 返回导航 */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-black/50 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            返回总览
          </Link>
        </div>

        {/* 主题头部 */}
        <section className="overflow-hidden rounded-[32px] border border-black/8 bg-white px-8 py-10 md:px-12 md:py-12">
          <div className="text-[11px] tracking-[0.3em] text-black/40 uppercase">
            {display.hero.subtitle}
          </div>
          <h1 className="mt-4 font-display text-[40px] leading-[1.1] text-black md:text-[56px]">
            {topic.nameZh}
          </h1>
          <p className="mt-5 max-w-3xl text-[16px] leading-8 text-black/60">
            {display.hero.summary}
          </p>
          
          {/* 统计信息 */}
          <div className="mt-8 flex flex-wrap gap-6 text-[13px] text-black/50">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>{display.branchPalette.length} 条分支</span>
            </div>
            <div className="flex items-center gap-2">
              <Merge className="h-4 w-4" />
              <span>{display.hero.mergeCount} 个汇流</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{stages.length} 个阶段</span>
            </div>
          </div>
        </section>

        {/* 节点时间树 */}
        <section className="mt-12">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-black/10"></div>
            <span className="text-[11px] tracking-[0.3em] text-black/40 uppercase">
              节点时间树 · Node Timeline
            </span>
            <div className="h-px flex-1 bg-black/10"></div>
          </div>

          {stages.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-black/12 bg-white px-6 py-12 text-center">
              <div className="text-[11px] tracking-[0.2em] text-black/40 uppercase">
                等待节点发现
              </div>
              <p className="mt-3 text-[15px] text-black/50">
                当前主题尚未发现任何研究节点，点击"开始研究"启动发现流程。
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {stages.map((stageIndex) => (
                <StageSection
                  key={stageIndex}
                  stageIndex={stageIndex}
                  nodes={nodesByStage[stageIndex]}
                  branchColorMap={branchColorMap}
                  mainlineBranchId={mainlineBranchId}
                />
              ))}
            </div>
          )}
        </section>

        {/* 页面底部文章 */}
        <section className="mt-16 rounded-[24px] border border-black/8 bg-[#fafafa] px-6 py-8 md:px-8">
          <h3 className="text-[13px] font-medium tracking-wide text-black/70">
            关于本主题 · About This Topic
          </h3>
          <div className="mt-4 text-[15px] leading-8 text-black/70 whitespace-pre-line">
            {display.narrativeArticle || '这个主题的故事仍在书写中……'}
          </div>

          <div className="mt-8 flex flex-wrap gap-4 text-[12px] text-black/40">
            <span>节点数：{nodes.length}</span>
            <span>·</span>
            <span>阶段数：{stages.length}</span>
            <span>·</span>
            <span>分支数：{display.branchPalette.length}</span>
          </div>
        </section>
      </div>
    </main>
  )
}
