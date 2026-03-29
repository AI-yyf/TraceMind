import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Box,
  ChevronDown,
  ChevronRight,
  Circle,
  GitBranch,
  GitMerge,
  Route,
} from 'lucide-react'
import type { TrackerPaper } from '../../types/tracker'

export interface BranchNode {
  id: string
  name: string
  type: 'main' | 'problem-branch' | 'method-branch' | 'inspiration-branch'
  status: 'active' | 'dormant' | 'dead' | 'absorbed'
  color: string
  lane: number
  paperIds: string[]
  parentBranchId?: string
  childBranchIds: string[]
  mergedIntoBranchId?: string
  startDate: string
  endDate: string
}

export interface TimelinePaperNode extends TrackerPaper {
  branchId: string
  role: 'origin' | 'trunk' | 'fork-point' | 'branch-first' | 'merge-point' | 'dead-end'
  parentId?: string
  childrenIds: string[]
  mergeTargetId?: string
  position?: {
    x: number
    y: number
    lane: number
  }
}

export interface BranchConnection {
  from: string
  to: string
  type: 'continues' | 'branches' | 'merges' | 'cross-reference'
  strength: number
}

export interface BranchTimelineData {
  papers: Map<string, TimelinePaperNode>
  branches: Map<string, BranchNode>
  connections: BranchConnection[]
  timeGroups: Array<{
    date: string
    year: string
    month: string
    papers: string[]
  }>
}

interface BranchTimelineProps {
  data: BranchTimelineData
  onPaperClick: (paperId: string) => void
  className?: string
}

type TimelineGroupWithBranches = BranchTimelineData['timeGroups'][number] & {
  branchEntries: Array<{
    branch: BranchNode
    papers: TimelinePaperNode[]
  }>
}

function formatBranchStatus(status: BranchNode['status']) {
  switch (status) {
    case 'active':
      return '活跃'
    case 'dormant':
      return '休眠'
    case 'absorbed':
      return '已吸收'
    case 'dead':
      return '已终止'
    default:
      return status
  }
}

function formatBranchType(type: BranchNode['type']) {
  switch (type) {
    case 'main':
      return '主线'
    case 'method-branch':
      return '方法支线'
    case 'inspiration-branch':
      return '迁移支线'
    default:
      return '问题支线'
  }
}

function formatRoleLabel(role: TimelinePaperNode['role']) {
  switch (role) {
    case 'origin':
      return '源头论文'
    case 'fork-point':
      return '分叉节点'
    case 'branch-first':
      return '支线起点'
    case 'merge-point':
      return '合流节点'
    case 'dead-end':
      return '阶段终点'
    default:
      return '延续节点'
  }
}

function getRoleIcon(role: TimelinePaperNode['role']) {
  switch (role) {
    case 'origin':
      return <Circle className="h-4 w-4 fill-current" />
    case 'fork-point':
      return <GitBranch className="h-4 w-4" />
    case 'merge-point':
      return <GitMerge className="h-4 w-4" />
    case 'dead-end':
      return <Box className="h-4 w-4" />
    default:
      return <Circle className="h-3 w-3 fill-current" />
  }
}

function formatBranchPeriod(branch: BranchNode) {
  const start = branch.startDate.slice(0, 10)
  const end = branch.endDate.slice(0, 10)
  if (!start && !end) return '时间未补齐'
  if (start === end) return start
  return `${start} 至 ${end}`
}

function getInitialExpandedBranches(data: BranchTimelineData) {
  const activeBranches = Array.from(data.branches.values())
    .sort((left, right) => left.lane - right.lane)
    .filter((branch) => branch.id === 'main' || branch.status === 'active')
    .slice(0, 5)
    .map((branch) => branch.id)

  if (!activeBranches.includes('main') && data.branches.has('main')) {
    activeBranches.unshift('main')
  }

  return new Set(activeBranches)
}

export const BranchTimeline: React.FC<BranchTimelineProps> = ({
  data,
  onPaperClick,
  className = '',
}) => {
  const sortedBranches = useMemo(
    () => Array.from(data.branches.values()).sort((left, right) => left.lane - right.lane),
    [data.branches],
  )
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(() => getInitialExpandedBranches(data))

  useEffect(() => {
    const fallback = getInitialExpandedBranches(data)
    const validBranchIds = new Set(sortedBranches.map((branch) => branch.id))

    setExpandedBranches((previous) => {
      const next = new Set<string>()
      previous.forEach((branchId) => {
        if (validBranchIds.has(branchId)) {
          next.add(branchId)
        }
      })

      if (next.size === 0) {
        fallback.forEach((branchId) => next.add(branchId))
      }

      if (validBranchIds.has('main')) {
        next.add('main')
      }

      return next
    })
  }, [data, sortedBranches])

  const timelineStats = useMemo(() => {
    const values = Array.from(data.connections.values())
    return {
      branchCount: sortedBranches.filter((branch) => branch.id !== 'main').length,
      activeCount: sortedBranches.filter((branch) => branch.status === 'active').length,
      mergeCount: values.filter((connection) => connection.type === 'merges').length,
      branchEventCount: values.filter((connection) => connection.type === 'branches').length,
    }
  }, [data.connections, sortedBranches])

  const visibleGroups = useMemo<TimelineGroupWithBranches[]>(() => {
    return data.timeGroups
      .map((group) => {
        const branchEntries = sortedBranches
          .map((branch) => {
            const papers = group.papers
              .map((paperId) => data.papers.get(paperId))
              .filter((paper): paper is TimelinePaperNode => Boolean(paper))
              .filter((paper) => paper.branchId === branch.id)
              .sort(
                (left, right) =>
                  new Date(left.published).getTime() - new Date(right.published).getTime(),
              )

            return { branch, papers }
          })
          .filter((entry) => entry.papers.length > 0 && expandedBranches.has(entry.branch.id))

        return {
          ...group,
          branchEntries,
        }
      })
      .filter((group) => group.branchEntries.length > 0)
  }, [data.papers, data.timeGroups, expandedBranches, sortedBranches])

  const toggleBranch = (branchId: string) => {
    if (branchId === 'main') return

    setExpandedBranches((previous) => {
      const next = new Set(previous)
      if (next.has(branchId)) {
        next.delete(branchId)
      } else {
        next.add(branchId)
      }
      next.add('main')
      return next
    })
  }

  if (sortedBranches.length === 0) {
    return null
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="活跃轨道" value={String(timelineStats.activeCount)} detail="当前仍在推进的主线或支线" />
        <SummaryCard label="已识别支线" value={String(timelineStats.branchCount)} detail="围绕问题节点展开的研究分支" />
        <SummaryCard label="分叉事件" value={String(timelineStats.branchEventCount)} detail="从锚点论文继续向外展开的跳转" />
        <SummaryCard label="合流事件" value={String(timelineStats.mergeCount)} detail="多个分支被同一论文吸收或汇合" />
      </section>

      <section className="rounded-[28px] border border-black/8 bg-[#fafafa] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-red-600">轨道看板</div>
            <h3 className="mt-2 text-[20px] font-semibold leading-8 text-black">按分支查看研究推进状态</h3>
          </div>
          <div className="text-sm text-black/48">主线固定展开，其它支线可按需要折叠。</div>
        </div>

        <BranchNavigator
          branches={sortedBranches}
          expandedBranches={expandedBranches}
          onToggleBranch={toggleBranch}
        />
      </section>

      <section className="space-y-6">
        {visibleGroups.length === 0 ? (
          <div className="rounded-[28px] border border-black/8 bg-[#fafafa] px-5 py-6 text-[15px] leading-8 text-black/56">
            当前没有可展示的阶段化轨道数据，请先展开支线或等待后端生成新的阶段结果。
          </div>
        ) : (
          visibleGroups.map((group, index) => (
            <TimelineGroupBlock
              key={group.date}
              group={group}
              index={index}
              onPaperClick={onPaperClick}
            />
          ))
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="rounded-[22px] border border-black/8 bg-white px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-black/36">{label}</div>
      <div className="mt-2 text-[28px] font-semibold leading-none text-black">{value}</div>
      <p className="mt-2 text-[13px] leading-6 text-black/58">{detail}</p>
    </article>
  )
}

function BranchNavigator({
  branches,
  expandedBranches,
  onToggleBranch,
}: {
  branches: BranchNode[]
  expandedBranches: Set<string>
  onToggleBranch: (branchId: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {branches.map((branch) => {
        const isMain = branch.id === 'main'
        const isExpanded = expandedBranches.has(branch.id)

        return (
          <button
            key={branch.id}
            type="button"
            onClick={() => onToggleBranch(branch.id)}
            disabled={isMain}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-left text-sm transition-all ${
              isExpanded
                ? 'bg-white shadow-sm'
                : 'bg-neutral-100 text-black/66 hover:bg-neutral-200'
            } ${isMain ? 'cursor-default' : 'cursor-pointer'}`}
            style={{
              borderColor: isExpanded ? `${branch.color}40` : undefined,
              color: isExpanded ? branch.color : undefined,
              marginLeft: isMain ? 0 : Math.min(branch.lane, 3) * 8,
            }}
          >
            {!isMain && branch.childBranchIds.length > 0 && (
              isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            )}
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: branch.color }} />
            <span>{branch.name}</span>
            <span className="text-[11px] opacity-60">{formatBranchStatus(branch.status)}</span>
            <span className="text-[11px] opacity-45">{branch.paperIds.length} 篇</span>
          </button>
        )
      })}
    </div>
  )
}

function TimelineGroupBlock({
  group,
  index,
  onPaperClick,
}: {
  group: TimelineGroupWithBranches
  index: number
  onPaperClick: (paperId: string) => void
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      className="rounded-[30px] border border-black/8 bg-white px-5 py-5 sm:px-6"
    >
      <div className="mb-5 flex items-center gap-4">
        <div>
          <div className="text-[28px] font-semibold leading-none text-black">{group.year}</div>
          <div className="mt-1 text-[13px] text-black/44">{group.month} 月</div>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-red-200 via-red-100 to-transparent" />
        <div className="text-[12px] text-black/42">{group.branchEntries.length} 条轨道有更新</div>
      </div>

      <div className="space-y-4">
        {group.branchEntries.map(({ branch, papers }) => (
          <article
            key={`${group.date}-${branch.id}`}
            className="rounded-[24px] border px-4 py-4"
            style={{
              borderColor: `${branch.color}26`,
              background: `linear-gradient(135deg, ${branch.color}08 0%, rgba(255,255,255,1) 60%)`,
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
                    style={{
                      borderColor: `${branch.color}33`,
                      color: branch.color,
                      backgroundColor: `${branch.color}12`,
                    }}
                  >
                    <Route className="h-3.5 w-3.5" />
                    {branch.name}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-black/36">
                    {formatBranchType(branch.type)}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-black/36">
                    {formatBranchStatus(branch.status)}
                  </span>
                </div>
                <div className="mt-2 text-[13px] text-black/48">{formatBranchPeriod(branch)}</div>
              </div>

              <div className="text-[12px] text-black/44">{papers.length} 篇论文进入本时间点</div>
            </div>

            <div className="mt-4 space-y-3">
              {papers.map((paper) => (
                <PaperNodeCard key={paper.id} paper={paper} branch={branch} onClick={onPaperClick} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </motion.section>
  )
}

function PaperNodeCard({
  paper,
  branch,
  onClick,
}: {
  paper: TimelinePaperNode
  branch: BranchNode
  onClick: (paperId: string) => void
}) {
  const problemCount = paper.branchContext.problemNodeIds.length
  const mergeCount = paper.branchContext.mergedBranchIds.length

  return (
    <button
      type="button"
      onClick={() => onClick(paper.id)}
      className="block w-full rounded-[20px] border border-white/70 bg-white/90 p-4 text-left transition-all hover:border-black/10 hover:bg-white hover:shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-black/38">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ color: branch.color, backgroundColor: `${branch.color}12` }}
        >
          {getRoleIcon(paper.role)}
          {formatRoleLabel(paper.role)}
        </span>
        {paper.branchContext.stageIndex !== null && <span>第 {paper.branchContext.stageIndex} 阶段</span>}
        {paper.branchContext.isMergePaper && <span>合流论文</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-[18px] font-semibold leading-7 text-black">
            {paper.titleZh || paper.title}
          </h4>
          <p className="mt-2 text-[14px] leading-7 text-black/62">
            {paper.timelineDigest || paper.cardDigest || paper.highlight || paper.summary}
          </p>
        </div>
        <div className="text-right text-[12px] text-black/42">
          <div>{paper.published.slice(0, 10)}</div>
          {paper.authors.length > 0 && <div className="mt-1">{paper.authors.slice(0, 2).join('、')}</div>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {paper.tags.slice(0, 4).map((tag) => (
          <span
            key={`${paper.id}-${tag}`}
            className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600"
          >
            {tag}
          </span>
        ))}
        {problemCount > 0 && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
            关联 {problemCount} 个问题节点
          </span>
        )}
        {mergeCount > 0 && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">
            吸收 {mergeCount} 条分支
          </span>
        )}
      </div>
    </button>
  )
}

export default BranchTimeline
