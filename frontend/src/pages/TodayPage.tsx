import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Calendar } from 'lucide-react'
import { useTopicRegistry } from '@/hooks/useTopicRegistry'
import { getLatestNodesByTopic } from '@/data/tracker'
import type { TrackerNode, TrackerTopic } from '@/types/tracker'

// 分支颜色配置 - 与后端统一
// 主线使用红色 (#dc2626)，其他分支使用以下配色
const branchColors = [
  '#dc2626', // red-600 - 主线颜色
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#db2777', // pink-600
  '#4f46e5', // indigo-600
]

interface TopicNodeCardProps {
  topic: TrackerTopic
  node?: TrackerNode
  color: string
}

function TopicNodeCard({ topic, node, color }: TopicNodeCardProps) {
  // 无节点状态
  if (!node) {
    return (
      <div className="relative overflow-hidden rounded-[20px] border border-black/8 bg-white p-5">
        {/* 左边彩色点缀条 */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-black/10"></div>
        <div className="pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-0.5 text-[10px] text-black/50">
              {topic.focusLabel}
            </span>
          </div>
          <h3 className="mt-3 text-[18px] font-semibold text-black">{topic.nameZh}</h3>
          <p className="mt-2 text-[13px] text-black/40">该日期无更新</p>
        </div>
      </div>
    )
  }

  // 有节点状态
  return (
    <Link
      to={`/node/${node.nodeId}`}
      className="group relative block overflow-hidden rounded-[20px] border border-black/8 bg-white p-5 transition hover:border-black/12 hover:shadow-sm"
    >
      {/* 左边彩色点缀条 */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color }}></div>

      <div className="pl-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* 彩色标签 */}
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: `${color}12`,
              color: color,
            }}
          >
            {topic.focusLabel}
          </span>
          <span className="text-[10px] text-black/40">Stage {node.stageIndex}</span>
        </div>

        <h3 className="mt-3 text-[18px] font-semibold text-black">{topic.nameZh}</h3>

        <p className="mt-2 text-[13px] leading-5 text-black/50 line-clamp-2">
          {node.nodeSummary || node.nodeLabel}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {node.isMergeNode && (
              <span className="text-[10px] text-black/40">{node.paperCount} 篇论文</span>
            )}
            {node.status === 'provisional' && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">
                临时
              </span>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-black/30 transition group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  )
}

function DatePicker({
  value,
  onChange,
  maxDate,
}: {
  value: string
  onChange: (date: string) => void
  maxDate: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Calendar className="h-4 w-4 text-black/40" />
      <input
        type="date"
        value={value}
        max={maxDate}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-black/8 bg-white px-3 py-2 text-sm outline-none focus:border-black/20"
      />
      {value !== new Date().toISOString().slice(0, 10) && (
        <button
          onClick={() => onChange(new Date().toISOString().slice(0, 10))}
          className="text-sm text-black/50 hover:text-black"
        >
          回到今天
        </button>
      )}
    </div>
  )
}

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  )
  const { activeTopics } = useTopicRegistry()

  // 获取最新节点数据
  const latestNodes = useMemo(() => {
    return getLatestNodesByTopic(selectedDate)
  }, [selectedDate])

  // 按主题组织节点
  const topicNodes = useMemo(() => {
    return activeTopics.map((topic, index) => ({
      topic,
      node: latestNodes[topic.id],
      color: branchColors[index % branchColors.length],
    }))
  }, [activeTopics, latestNodes])

  const isToday = selectedDate === new Date().toISOString().slice(0, 10)

  // 计算有更新的主题数
  const updatedCount = topicNodes.filter(({ node }) => node).length

  return (
    <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1100px]">
        {/* 页面头部 - 简约风格 */}
        <section className="overflow-hidden rounded-[32px] border border-black/8 bg-white px-8 py-10 md:px-12 md:py-12">
          <div className="text-[12px] tracking-[0.4em] text-black/30 uppercase">Temporal Node Snapshot · 时序节点快照</div>
          <h1 className="mt-4 font-display text-[40px] leading-[1.1] text-black md:text-[56px]">
            {isToday ? '今日节点' : selectedDate}
          </h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-7 text-black/60">
            按日期检索各主题的最新研究节点（Research Node）。节点是学术谱系的核心单元，
            代表特定时间点上的研究状态快照，可包含单篇或多篇论文的聚合解读。
          </p>

          {/* 日期选择器 */}
          <div className="mt-6">
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              maxDate={new Date().toISOString().slice(0, 10)}
            />
          </div>
        </section>

        {/* 时间线风格主题节点 */}
        <section className="mt-10">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-black/10"></div>
            <span className="text-[11px] tracking-[0.3em] text-black/40 uppercase">
              {updatedCount} 个主题存在节点更新 · Node Updates
            </span>
            <div className="h-px flex-1 bg-black/10"></div>
          </div>

          <div className="relative">
            {/* 主时间线 - 红色 */}
            <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-red-500/30 md:left-[11px]"></div>

            <div className="space-y-4">
              {topicNodes.map(({ topic, node, color }) => (
                <div key={topic.id} className="relative pl-8 md:pl-12">
                  {/* 时间节点 - 彩色 */}
                  <div
                    className="absolute left-0 top-3 h-4 w-4 rounded-full border-2 border-white shadow-sm md:h-5 md:w-5"
                    style={{ backgroundColor: node ? color : '#e5e7eb' }}
                  ></div>

                  <TopicNodeCard topic={topic} node={node} color={color} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 页面底部详细总结 */}
        <section className="mt-16 rounded-[24px] border border-black/8 bg-[#fafafa] px-6 py-8 md:px-8">
          <h3 className="text-[13px] font-medium tracking-wide text-black/70">节点状态说明 · Node Status Reference</h3>
          <div className="mt-4 space-y-4 text-[14px] leading-7 text-black/60">
            <p>
              <strong className="text-black/80">【数据单元定义】</strong>
              Research Node 是学术谱系系统的核心数据单元，代表特定 Stage 内的状态快照。
              数据结构包含：paperIds（关联论文集合）、sourceBranchIds（所属分支）、
              sourceProblemNodeIds（问题节点映射）、nodeLabel / nodeSummary（节点级摘要）。
              状态枚举：provisional（临时）、canonical（规范）、archived（归档）、deprecated（废弃）。
            </p>
            <p>
              <strong className="text-black/80">【生命周期管理】</strong>
              节点经由 Dual-Round Discovery 产生，初始状态 provisional。
              通过方法论审计（Methodology Audit）与问题空间验证（Problem Space Validation）后，
              晋升为 canonical，成为学术谱系正式组成部分。
              当研究路径被取代或合并时，节点进入 archived 状态，保留历史追溯价值。
              deprecated 用于标识数据错误或重复收录的失效节点。
            </p>
            <p>
              <strong className="text-black/80">【可视化编码】</strong>
              节点颜色对应 primaryBranchId 的分支标识色。
              Merge Node（汇流节点）同时承接多条分支，卡片显示多来源分支标签。
              卡片左侧色条指示分支归属，provisional 节点以 amber badge 标识。
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-[12px] text-black/40">
            <span>snapshot-date: {selectedDate}</span>
            <span>·</span>
            <span>tracked-topics: {activeTopics.length}</span>
            <span>·</span>
            <span>node-updates: {updatedCount}</span>
            <span>·</span>
            <span>status-types: provisional / canonical / archived</span>
          </div>
        </section>
      </div>
    </main>
  )
}
