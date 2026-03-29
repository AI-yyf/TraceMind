import { useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  GitBranch, 
  Clock, 
  FileText, 
  Image as ImageIcon, 
  Table, 
  Calculator,
  Layers,
  BookOpen,
  Eye,
  ChevronRight
} from 'lucide-react'

import { getNodeById, getPaperRecord } from '@/data/tracker'
import { useTopicRegistry } from '@/hooks'
import type { TrackerNode, TrackerPaper } from '@/types/tracker'

// 三层架构类型定义
interface SummaryLayerData {
  oneLine: string
  keyContribution: string
  mainResults: string[]
  representativeFigure?: {
    id: string
    url: string
    caption: string
    paperId: string
    paperTitle: string
  } | null
}

interface NarrativeSection {
  title: string
  paragraphs: Array<{
    text: string
    figures?: string[]
    tables?: string[]
    formulas?: string[]
  }>
}

interface NarrativeLayerData {
  title: string
  subtitle: string
  openingStandfirst: string
  sections: NarrativeSection[]
  closingHandoff: string
}

interface CompleteFigure {
  id: string
  number: number
  caption: string
  page: number
  imageUrl: string
  paperId: string
  deepAnalysis?: {
    description: {
      type: string
      overall: string
      elements: string[]
      structure: string
    }
    interpretation: {
      mainFinding: string
      keyData: Array<{ location: string; value: string; meaning: string }>
      trends: string[]
      comparisons: string[]
      anomalies: string[]
    }
    significance: {
      supports: string
      proves: string
      limitations: string
      relationToText: string
    }
    crossPaperRelation?: {
      relationToPrevious: string
      evolutionSignificance: string
      uniqueContribution: string
    }
  }
}

interface CompleteTable {
  id: string
  number: number
  caption: string
  page: number
  headers: string[]
  rows: Array<Record<string, string>>
  rawText: string
}

interface CompleteFormula {
  id: string
  number: string
  latex: string
  rawText: string
  page: number
}

interface EvidenceLayerData {
  figures: CompleteFigure[]
  tables: CompleteTable[]
  formulas: CompleteFormula[]
}

interface FullNodeContent {
  summary: SummaryLayerData
  narrative: NarrativeLayerData
  details: NarrativeLayerData
  evidence: EvidenceLayerData
}

type ActiveLayer = 'summary' | 'narrative' | 'evidence'

interface NodeDetailPageProps {
  node?: TrackerNode | null
}

export function NodeDetailPage({ node: propNode }: NodeDetailPageProps = {}) {
  const { nodeId } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const { allTopicMap } = useTopicRegistry()
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>('summary')

  // 获取节点数据
  const node = useMemo(() => {
    if (propNode) return propNode
    if (nodeId) return getNodeById(nodeId)
    return null
  }, [propNode, nodeId])

  // 获取主题信息
  const topic = useMemo(() => {
    if (!node) return null
    return allTopicMap[node.topicId]
  }, [node, allTopicMap])

  // 获取所有相关论文
  const relatedPapers = useMemo(() => {
    if (!node) return []
    return node.paperIds
      .map(id => getPaperRecord(id))
      .filter((paper): paper is TrackerPaper => paper !== null)
  }, [node])

  // 模拟完整内容数据（实际应从API获取）
  const fullContent: FullNodeContent | null = useMemo(() => {
    if (!node) return null
    
    // 这里应该调用API获取完整内容
    // 目前使用模拟数据展示结构
    return generateMockFullContent(node, relatedPapers)
  }, [node, relatedPapers])

  if (!node) {
    return (
      <main className="px-4 py-10 md:px-6 xl:px-10">
        <div className="mx-auto max-w-[900px]">
          <Link to="/" className="text-sm underline underline-offset-4">
            返回首页
          </Link>
          <div className="mt-4 text-black/60">节点不存在或已被删除。</div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white px-4 pb-20 pt-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1000px]">
        {/* 返回导航 */}
        <nav className="mb-6 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-black/50 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          {topic && (
            <span className="text-sm text-black/40">
              <Link to={`/topic/${topic.id}`} className="hover:text-black hover:underline">
                {topic.nameZh}
              </Link>
              {' / '}
              <span className="text-black/60">{node.nodeLabel}</span>
            </span>
          )}
        </nav>

        {/* 节点头部 */}
        <header className="mb-8">
          {/* 标签 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {node.sourceBranchLabels.slice(0, 2).map((label, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-black/[0.02] px-3 py-1 text-[11px] text-black/60"
              >
                <GitBranch className="h-3 w-3" />
                {label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1 text-[11px] text-white">
              阶段 {node.stageIndex}
            </span>
            {node.isMergeNode && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-[11px] text-white">
                汇流节点
              </span>
            )}
            {node.provisional && (
              <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-black/20 px-3 py-1 text-[11px] text-black/50">
                临时节点
              </span>
            )}
          </div>

          {/* 标题 */}
          <h1 className="font-display text-[32px] leading-[1.2] text-black md:text-[40px]">
            {node.nodeLabel}
          </h1>

          {/* 元信息 */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px] text-black/50">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {new Date(node.updatedAt).toLocaleDateString('zh-CN')}
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              {node.paperCount} 篇论文
            </span>
          </div>
        </header>

        {/* 三层导航 */}
        <div className="mb-8 sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-black/8 py-3">
          <div className="flex items-center gap-1 rounded-xl bg-black/[0.03] p-1">
            <LayerTab
              active={activeLayer === 'summary'}
              onClick={() => setActiveLayer('summary')}
              icon={Layers}
              label="摘要"
              description="快速概览"
            />
            <LayerTab
              active={activeLayer === 'narrative'}
              onClick={() => setActiveLayer('narrative')}
              icon={BookOpen}
              label="评述"
              description="深度解读"
            />
            <LayerTab
              active={activeLayer === 'evidence'}
              onClick={() => setActiveLayer('evidence')}
              icon={Eye}
              label="证据"
              description="图表公式"
            />
          </div>
        </div>

        {/* 内容层 */}
        <div className="min-h-[400px]">
          {activeLayer === 'summary' && fullContent && (
            <SummaryLayer data={fullContent.summary} />
          )}
          {activeLayer === 'narrative' && fullContent && (
            <NarrativeLayer data={fullContent.narrative} />
          )}
          {activeLayer === 'evidence' && fullContent && (
            <EvidenceLayer 
              data={fullContent.evidence} 
              papers={relatedPapers}
            />
          )}
        </div>

        {/* 底部导航 */}
        <footer className="mt-16 border-t border-black/8 pt-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-[13px] text-black/50 transition hover:text-black"
            >
              <ArrowLeft className="h-4 w-4" />
              返回上一页
            </button>
            {topic && (
              <Link
                to={`/topic/${topic.id}`}
                className="inline-flex items-center gap-2 text-[13px] text-black/60 transition hover:text-black"
              >
                查看主题: {topic.nameZh}
                <ArrowLeft className="h-3 w-3 rotate-180" />
              </Link>
            )}
          </div>
        </footer>
      </div>
    </main>
  )
}

// 层级标签组件
function LayerTab({
  active,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-all ${
        active
          ? 'bg-white text-black shadow-sm'
          : 'text-black/50 hover:text-black/70'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="font-medium">{label}</span>
      <span className="hidden text-[11px] opacity-60 sm:inline">· {description}</span>
    </button>
  )
}

// 摘要层
function SummaryLayer({ data }: { data: SummaryLayerData }) {
  return (
    <div className="space-y-8">
      {/* 一句话总结 */}
      <section className="rounded-[24px] border border-black/8 bg-gradient-to-br from-black/[0.02] to-transparent p-6">
        <h2 className="mb-3 text-[12px] uppercase tracking-wider text-black/50">核心贡献</h2>
        <p className="text-[18px] leading-relaxed text-black">{data.oneLine}</p>
      </section>

      {/* 主要结果 */}
      {data.mainResults.length > 0 && (
        <section>
          <h2 className="mb-4 text-[16px] font-semibold text-black">主要结果</h2>
          <div className="space-y-3">
            {data.mainResults.map((result, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-[16px] border border-black/8 bg-white p-4"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-black text-[12px] text-white">
                  {i + 1}
                </span>
                <p className="text-[15px] leading-relaxed text-black/70">{result}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 代表性图片 */}
      {data.representativeFigure && (
        <section>
          <h2 className="mb-4 text-[16px] font-semibold text-black">关键图表</h2>
          <div className="overflow-hidden rounded-[20px] border border-black/8 bg-white">
            <div className="aspect-video bg-black/5">
              <img
                src={data.representativeFigure.url}
                alt={data.representativeFigure.caption}
                className="h-full w-full object-contain p-4"
              />
            </div>
            <div className="border-t border-black/5 p-4">
              <p className="text-[13px] text-black/60">{data.representativeFigure.caption}</p>
              <p className="mt-1 text-[11px] text-black/40">
                来自: {data.representativeFigure.paperTitle}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// 评述层
function NarrativeLayer({ data }: { data: NarrativeLayerData }) {
  return (
    <article className="space-y-8">
      {/* 文章头部 */}
      <header className="border-b border-black/8 pb-6">
        <h2 className="text-[24px] font-semibold text-black">{data.title}</h2>
        {data.subtitle && (
          <p className="mt-2 text-[16px] text-black/60">{data.subtitle}</p>
        )}
      </header>

      {/* 引子 */}
      {data.openingStandfirst && (
        <div className="rounded-[16px] border-l-4 border-black/20 bg-black/[0.02] p-5">
          <p className="text-[16px] leading-relaxed text-black/70 italic">
            {data.openingStandfirst}
          </p>
        </div>
      )}

      {/* 文章节 */}
      <div className="space-y-10">
        {data.sections.map((section, sectionIndex) => (
          <section key={sectionIndex} className="space-y-4">
            <h3 className="text-[18px] font-semibold text-black">{section.title}</h3>
            <div className="space-y-4">
              {section.paragraphs.map((paragraph, paraIndex) => (
                <div key={paraIndex} className="space-y-3">
                  <p className="text-[15px] leading-8 text-black/70">{paragraph.text}</p>
                  
                  {/* 内嵌图表 */}
                  {paragraph.figures && paragraph.figures.length > 0 && (
                    <div className="my-4 rounded-[16px] border border-black/8 bg-black/[0.02] p-4">
                      <div className="flex items-center gap-2 text-[12px] text-black/50">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>引用图表: {paragraph.figures.join(', ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* 结尾 */}
      {data.closingHandoff && (
        <footer className="border-t border-black/8 pt-6">
          <p className="text-[15px] leading-relaxed text-black/70">{data.closingHandoff}</p>
        </footer>
      )}
    </article>
  )
}

// 证据层
function EvidenceLayer({ 
  data, 
  papers 
}: { 
  data: EvidenceLayerData
  papers: TrackerPaper[]
}) {
  const [activeTab, setActiveTab] = useState<'figures' | 'tables' | 'formulas'>('figures')

  // 按论文分组图表
  const figuresByPaper = useMemo(() => {
    const map = new Map<string, CompleteFigure[]>()
    data.figures.forEach(fig => {
      const paperFigures = map.get(fig.paperId) || []
      paperFigures.push(fig)
      map.set(fig.paperId, paperFigures)
    })
    return map
  }, [data.figures])

  return (
    <div className="space-y-6">
      {/* 标签切换 */}
      <div className="flex items-center gap-2 border-b border-black/8 pb-4">
        <EvidenceTab
          active={activeTab === 'figures'}
          onClick={() => setActiveTab('figures')}
          icon={ImageIcon}
          label="图表"
          count={data.figures.length}
        />
        <EvidenceTab
          active={activeTab === 'tables'}
          onClick={() => setActiveTab('tables')}
          icon={Table}
          label="表格"
          count={data.tables.length}
        />
        <EvidenceTab
          active={activeTab === 'formulas'}
          onClick={() => setActiveTab('formulas')}
          icon={Calculator}
          label="公式"
          count={data.formulas.length}
        />
      </div>

      {/* 图表库 */}
      {activeTab === 'figures' && (
        <div className="space-y-8">
          {Array.from(figuresByPaper.entries()).map(([paperId, figures]) => {
            const paper = papers.find(p => p.id === paperId)
            return (
              <section key={paperId} className="space-y-4">
                <h3 className="text-[14px] font-medium text-black/60">
                  来自: {paper?.titleZh || paperId}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {figures.map((figure) => (
                    <FigureCard key={figure.id} figure={figure} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* 表格库 */}
      {activeTab === 'tables' && (
        <div className="space-y-4">
          {data.tables.map((table) => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}

      {/* 公式库 */}
      {activeTab === 'formulas' && (
        <div className="space-y-4">
          {data.formulas.map((formula) => (
            <FormulaCard key={formula.id} formula={formula} />
          ))}
        </div>
      )}
    </div>
  )
}

// 证据标签
function EvidenceTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
        active
          ? 'bg-black text-white'
          : 'text-black/60 hover:bg-black/[0.05]'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${
        active ? 'bg-white/20' : 'bg-black/10'
      }`}>
        {count}
      </span>
    </button>
  )
}

// 图表卡片
function FigureCard({ figure }: { figure: CompleteFigure }) {
  const [showAnalysis, setShowAnalysis] = useState(false)

  return (
    <div className="overflow-hidden rounded-[20px] border border-black/8 bg-white">
      <div className="aspect-[4/3] bg-black/5">
        <img
          src={figure.imageUrl}
          alt={figure.caption}
          className="h-full w-full object-contain p-4"
          loading="lazy"
        />
      </div>
      <div className="border-t border-black/5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[11px] text-black/40">图 {figure.number}</span>
            <p className="mt-1 text-[13px] text-black/70">{figure.caption}</p>
          </div>
          {figure.deepAnalysis && (
            <button
              onClick={() => setShowAnalysis(!showAnalysis)}
              className="flex-shrink-0 rounded-full bg-black/[0.05] p-2 text-black/50 transition hover:bg-black/[0.1] hover:text-black"
            >
              <ChevronRight className={`h-4 w-4 transition ${showAnalysis ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>

        {/* 深度分析 */}
        {showAnalysis && figure.deepAnalysis && (
          <div className="mt-4 space-y-3 border-t border-black/5 pt-4">
            <AnalysisSection
              title="图片描述"
              content={figure.deepAnalysis.description.overall}
            />
            <AnalysisSection
              title="内容解读"
              content={figure.deepAnalysis.interpretation.mainFinding}
            />
            <AnalysisSection
              title="研究意义"
              content={figure.deepAnalysis.significance.supports}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// 分析区块
function AnalysisSection({ title, content }: { title: string; content: string }) {
  if (!content) return null
  return (
    <div>
      <h4 className="mb-1 text-[11px] uppercase tracking-wider text-black/40">{title}</h4>
      <p className="text-[13px] leading-relaxed text-black/60">{content}</p>
    </div>
  )
}

// 表格卡片
function TableCard({ table }: { table: CompleteTable }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-black/8 bg-white">
      <div className="border-b border-black/5 p-4">
        <span className="text-[11px] text-black/40">表 {table.number}</span>
        <p className="mt-1 text-[14px] text-black">{table.caption}</p>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-black/10">
              {table.headers.map((header, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-black/60">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 5).map((row, i) => (
              <tr key={i} className="border-b border-black/5 last:border-0">
                {table.headers.map((header, j) => (
                  <td key={j} className="px-3 py-2 text-black/70">
                    {row[header] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length > 5 && (
          <p className="mt-2 text-center text-[11px] text-black/40">
            还有 {table.rows.length - 5} 行数据...
          </p>
        )}
      </div>
    </div>
  )
}

// 公式卡片
function FormulaCard({ formula }: { formula: CompleteFormula }) {
  return (
    <div className="rounded-[20px] border border-black/8 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] text-black/40">公式 {formula.number}</span>
      </div>
      <div className="rounded-[12px] bg-black/[0.03] p-4">
        <code className="text-[14px] text-black">{formula.latex}</code>
      </div>
      {formula.rawText && (
        <p className="mt-3 text-[13px] text-black/60">{formula.rawText}</p>
      )}
    </div>
  )
}

// 生成模拟完整内容
function generateMockFullContent(node: TrackerNode, papers: TrackerPaper[]): FullNodeContent {
  const primaryPaper = papers[0]
  
  return {
    summary: {
      oneLine: node.nodeSummary,
      keyContribution: `该节点包含 ${node.paperIds.length} 篇论文，主要贡献在于${node.sourceBranchLabels[0] || '该研究领域'}。`,
      mainResults: [
        '提出了新的方法论框架',
        '在多个数据集上取得了SOTA结果',
        '开源了代码和预训练模型',
      ],
      representativeFigure: primaryPaper?.coverPath ? {
        id: 'fig-1',
        url: primaryPaper.coverPath,
        caption: '主要实验结果',
        paperId: primaryPaper.id,
        paperTitle: primaryPaper.titleZh,
      } : null,
    },
    narrative: {
      title: node.nodeLabel,
      subtitle: `${node.sourceBranchLabels.join('、')} 研究方向`,
      openingStandfirst: node.nodeExplanation || node.nodeSummary,
      sections: [
        {
          title: '研究背景',
          paragraphs: [
            { text: '随着深度学习的快速发展，该领域面临着新的挑战和机遇。' },
            { text: '现有方法在处理复杂场景时存在局限性，亟需新的解决方案。' },
          ],
        },
        {
          title: '方法介绍',
          paragraphs: [
            { text: '本文提出了一种创新的方法，通过引入新的架构设计，显著提升了模型性能。' },
            { text: '核心思想是将传统方法与深度学习相结合，充分发挥两者的优势。' },
          ],
        },
        {
          title: '实验结果',
          paragraphs: [
            { text: '在多个基准数据集上的实验表明，该方法相比现有方法有显著提升。' },
            { text: '消融实验进一步验证了各个组件的有效性。' },
          ],
        },
      ],
      closingHandoff: '该方法为该领域的后续研究提供了新的思路和方向。',
    },
    details: {
      title: node.nodeLabel,
      subtitle: '详细技术解读',
      openingStandfirst: '以下是该节点涉及论文的详细技术解读。',
      sections: papers.map((paper, i) => ({
        title: `论文 ${String.fromCharCode(65 + i)}: ${paper.titleZh}`,
        paragraphs: [
          { text: paper.summary || paper.cardDigest || '暂无详细内容' },
        ],
      })),
      closingHandoff: '这些论文共同构成了该研究方向的完整技术体系。',
    },
    evidence: {
      figures: primaryPaper?.figurePaths?.map((path, i) => ({
        id: `fig-${i}`,
        number: i + 1,
        caption: `图 ${i + 1}`,
        page: i + 1,
        imageUrl: path,
        paperId: primaryPaper.id,
        deepAnalysis: {
          description: {
            type: 'result',
            overall: '展示了实验结果',
            elements: ['曲线', '数据点'],
            structure: '标准结果图',
          },
          interpretation: {
            mainFinding: '方法在各项指标上均优于基线',
            keyData: [],
            trends: ['性能随参数增加而提升'],
            comparisons: ['优于现有方法'],
            anomalies: [],
          },
          significance: {
            supports: '证明了方法的有效性',
            proves: '核心假设成立',
            limitations: '仅在特定数据集上验证',
            relationToText: '与正文论述一致',
          },
        },
      })) || [],
      tables: [],
      formulas: [],
    },
  }
}

export default NodeDetailPage
