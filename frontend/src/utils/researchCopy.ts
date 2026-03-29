function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function replaceResearchTerms(value: string) {
  return value
    .replace(/\bReasoning-Acting\b/gi, '推理-行动')
    .replace(/\bTool Use\b/gi, '工具使用')
    .replace(/\bMulti-Agent\b/gi, '多智能体')
    .replace(/\bMemory\b/gi, '记忆')
    .replace(/\bNeural Circuits\b/gi, '神经回路')
    .replace(/\bLiquid Networks\b/gi, '液态网络')
    .replace(/\bContinuous-Time Models\b/gi, '连续时间模型')
    .replace(/\bRobot Foundation Models\b/gi, '机器人基础模型')
    .replace(/\bVision-Language-Action\b/gi, '视觉-语言-动作')
    .replace(/\bGrounding\b/gi, '具身落地')
    .replace(/\bAttention\b/gi, '注意力')
    .replace(/\bLong Context\b/gi, '长上下文')
    .replace(/\bAgent\b/gi, '智能体')
}

export function localizeFocusLabel(value: string | null | undefined, fallback = '') {
  const source = normalizeWhitespace(value || fallback)
  if (!source) return fallback
  return normalizeWhitespace(replaceResearchTerms(source))
}

export function buildPaperHighlightFallback(title: string) {
  return `《${title}》已经进入当前研究脉络，当前以前台展示所需的中文摘要作为保底说明。`
}

export function buildPaperCardDigestFallback(title: string) {
  return `《${title}》已经进入当前研究脉络，等待进一步补全中文解读。`
}

export function buildPaperTimelineDigestFallback(title: string) {
  return `《${title}》已经进入当前研究脉络，当前等待补全这一阶段的中文解读。`
}

export function isGenericBranchLabel(value: string | null | undefined) {
  const label = normalizeWhitespace(value || '')
  if (!label) return true
  return (
    label === 'Origin Branch' ||
    label === '主干候选分支' ||
    label === '迁移候选分支' ||
    /^迁移分支\s+/u.test(label) ||
    /^Branch\s+/u.test(label) ||
    /^Transfer Branch\s+/iu.test(label)
  )
}

export function compactResearchLabel(value: string | null | undefined, maxLength = 12) {
  const source = normalizeWhitespace(replaceResearchTerms(value || ''))
  if (!source) return ''
  const cleaned = source.replace(/[（）()]/g, '')
  const firstClause = cleaned.split(/[，。；:]/)[0]?.trim() || cleaned
  if (firstClause.length <= maxLength) return firstClause
  return `${firstClause.slice(0, maxLength).trimEnd()}…`
}

function isMainlineBranchId(branchId: string, mainlineBranchId?: string | null) {
  return (
    branchId === 'main' ||
    branchId.startsWith('main:') ||
    (mainlineBranchId ? branchId === mainlineBranchId : /:origin$/u.test(branchId))
  )
}

export function deriveDisplayBranchLabel(args: {
  branchId: string
  mainlineBranchId?: string | null
  explicitLabel?: string | null
  branchType?: string | null
  problemLabels?: string[]
}) {
  if (isMainlineBranchId(args.branchId, args.mainlineBranchId)) return '主线'

  if (args.explicitLabel && !isGenericBranchLabel(args.explicitLabel)) {
    return compactResearchLabel(args.explicitLabel, 14)
  }

  const problemLabel = (args.problemLabels || []).find(Boolean)
  if (problemLabel) {
    return compactResearchLabel(problemLabel, 14)
  }

  if (args.branchType === 'transfer') return '迁移研究线'
  if (args.branchType === 'merge') return '汇流研究线'
  return '研究支线'
}
