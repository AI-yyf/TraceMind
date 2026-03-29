import { Link } from 'react-router-dom'
import { ArrowRight, Search, Settings, Play } from 'lucide-react'
import { useState } from 'react'

import { useTopicRegistry, useConfig } from '@/hooks'
import { getTopicDisplay } from '@/data/topicDisplay'
import { SettingsPanel } from '@/components/SettingsPanel'
import { BatchResearchLauncher } from '@/components/BatchResearchLauncher'

export function HomePage() {
  const { activeTopics } = useTopicRegistry()
  const { isApiConfigured } = useConfig()
  const [showSettings, setShowSettings] = useState(false)
  const [showBatchResearch, setShowBatchResearch] = useState(false)
  
  const topicDisplays = activeTopics.map((topic) => ({
    topic,
    display: getTopicDisplay(topic.id),
  }))

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



  return (
    <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1100px]">
        {/* 书籍封面风格首页 */}
        <section className="overflow-hidden rounded-[32px] border border-black/8 bg-white px-8 py-12 md:px-12 md:py-16">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[12px] tracking-[0.4em] text-black/30 uppercase">ArXiv Chronicle · Tracing Knowledge</div>
              <h1 className="mt-6 font-display text-[48px] leading-[1.05] text-black md:text-[72px]">
                溯知集
              </h1>
              <p className="mt-4 max-w-2xl text-[18px] leading-8 text-black/60">
                一本追溯知识源头的研究之书。以起源论文为根，以问题为脉，
                记录每个研究领域从最初追问到当下探索的完整旅程——
                让思想的河流，在时间的纸上留下可溯的轨迹。
              </p>
            </div>
            
            {/* 顶部工具按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-2 rounded-full border border-black/10 px-4 py-2.5 text-[13px] text-black/70 transition hover:bg-black/5"
              >
                <Settings className="h-4 w-4" />
                设置
              </button>
              <button
                onClick={() => setShowBatchResearch(true)}
                className="flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-black/85"
              >
                <Play className="h-4 w-4" />
                开始研究
              </button>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {activeTopics[0] && (
              <Link
                to={`/topic/${activeTopics[0].id}`}
                className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85"
              >
                浏览主题
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('global-search-open'))}
              className="inline-flex items-center gap-2 rounded-full border border-black/12 px-5 py-3 text-sm font-medium text-black/70 transition hover:border-black/20 hover:text-black"
            >
              <Search className="h-4 w-4" />
              检索论文
            </button>
          </div>
        </section>

        {/* 时间线风格主题列表 */}
        <section className="mt-12">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-black/10"></div>
            <span className="text-[11px] tracking-[0.3em] text-black/40 uppercase">追踪主题 · Tracked Topics</span>
            <div className="h-px flex-1 bg-black/10"></div>
          </div>

          <div className="relative">
            {/* 主时间线 - 红色 */}
            <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-red-500/30 md:left-[11px]"></div>

            <div className="space-y-6">
              {topicDisplays.map(({ topic, display }, index) => {
                const color = branchColors[index % branchColors.length]
                return (
                  <div key={topic.id} className="relative pl-8 md:pl-12">
                    {/* 时间节点 - 彩色 */}
                    <div
                      className="absolute left-0 top-2 h-4 w-4 rounded-full border-2 border-white shadow-sm md:top-3 md:h-5 md:w-5"
                      style={{ backgroundColor: color }}
                    ></div>

                    {/* 连接线 - 彩色 */}
                    <div
                      className="absolute left-[7px] top-4 h-[2px] w-4 md:left-[11px] md:top-5 md:w-6"
                      style={{ backgroundColor: `${color}40` }}
                    ></div>

                    {/* 白色卡片 */}
                    <div className="group rounded-[24px] border border-black/8 bg-white p-6 transition hover:border-black/12 hover:shadow-sm">
                      {/* 第一行：时间和标签 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* 彩色标签点缀 */}
                          <span
                            className="rounded-full px-3 py-1 text-[11px] font-medium"
                            style={{
                              backgroundColor: `${color}12`,
                              color: color,
                            }}
                          >
                            {display?.hero.subtitle ?? topic.focusLabel}
                          </span>
                        </div>
                        {/* 时间 - 最醒目 */}
                        <span 
                          className="text-[28px] font-light tracking-tight"
                          style={{ color }}
                        >
                          {topic.originPaper.published.slice(0, 4)}
                        </span>
                      </div>

                      <Link to={`/topic/${topic.id}`}>
                        <h3 className="mt-4 text-[22px] font-semibold leading-[1.3] text-black transition group-hover:text-black/80">
                          {topic.nameZh}
                        </h3>
                      </Link>
                      
                      <p className="mt-3 text-[15px] leading-7 text-black/60 line-clamp-2">
                        {display?.hero.summary ?? topic.summary ?? topic.timelineDigest}
                      </p>

                      {/* 操作按钮 */}
                      <div className="mt-5 flex items-center gap-3">
                        <Link
                          to={`/topic/${topic.id}`}
                          className="flex items-center gap-2 text-sm text-black/50 transition hover:text-black"
                        >
                          <span>追溯知识脉络</span>
                          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* 页面底部详细总结 */}
        <section className="mt-16 rounded-[24px] border border-black/8 bg-[#fafafa] px-6 py-8 md:px-8">
          <h3 className="text-[13px] font-medium tracking-wide text-black/70">溯知之法 · The Way of Tracing</h3>
          <div className="mt-4 space-y-4 text-[14px] leading-7 text-black/60">
            <p>
              <strong className="text-black/80">【核心架构】</strong>
              本系统采用问题驱动（Problem-Driven）架构，以单一起源论文（Origin Paper）为根节点构建学术谱系。
              源头筛选遵循 earliest-representative 标准：选取首次系统性定义核心问题空间的代表性工作，
              确保研究脉络的完整性与可追溯性。每个主题独立维护问题树（Problem Tree）与分支注册表（Branch Registry）。
            </p>
            <p>
              <strong className="text-black/80">【阶段优先发现 Stage-First Discovery】</strong>
              研究演进采用阶段性递进模型组织。Stage 代表特定研究时期，同一 Stage 内允许多个 Branch 横向并行。
              这种二维组织（纵向时间、横向分支）支持观察：同一时期针对同一问题的多种解决方案如何共存、竞争与融合。
              Branch 状态包括：active（活跃）、candidate（候选）、merged（已汇流）、dormant（休眠）。
            </p>
            <p>
              <strong className="text-black/80">【双轮准入 Dual-Round Admission】</strong>
              候选论文通过两轮评估准入：Round 1 基于问题相关性进行广度搜索（Breadth Search），
              Round 2 基于方法论进行深度筛选（Depth Screening）。
              准入标准：论文必须对问题空间有实质性推进，并明确关联研究约束（Constraints）与所需能力（Required Capabilities）。
              当前系统追踪 {activeTopics.length} 个活跃主题。
            </p>
            <p>
              <strong className="text-black/80">【可视化编码】</strong>
              红色时间线（#dc2626）标识主脉演进，彩色节点对应不同分支贡献。
              卡片左侧色条指示分支归属，标签展示分支名称与论文状态。
              支持快速识别 Merge Nodes（汇流节点）：同时承接多条分支方法论贡献的关键论文。
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-[12px] text-black/40">
            <span>origin-criteria: earliest-representative</span>
            <span>·</span>
            <span>evolution-model: stage-first</span>
            <span>·</span>
            <span>admission: dual-round</span>
            <span>·</span>
            <span>structure: temporal-problem-tree</span>
          </div>
        </section>
      </div>

      {/* 设置面板 */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
      
      {/* 批量研究启动器 */}
      <BatchResearchLauncher 
        isOpen={showBatchResearch} 
        onClose={() => setShowBatchResearch(false)}
      />
    </main>
  )
}
