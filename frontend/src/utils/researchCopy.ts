function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

const LOW_SIGNAL_RESEARCH_PATTERNS = [
  /并不是单篇论文结论/u,
  /围绕同一问题形成的一段研究推进/u,
  /如果节点目前主要由一篇论文支撑/u,
  /节点级判断不能只停在/u,
  /节点总结不能只停在/u,
  /多篇论文共同坐实/u,
  /this node is not a single-paper conclusion/iu,
  /formed around the same question/iu,
  /if the node is mainly supported by a single paper/iu,
]

type ResearchDisplayLanguage =
  | 'zh'
  | 'en'
  | 'ja'
  | 'ko'
  | 'de'
  | 'fr'
  | 'es'
  | 'ru'

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

export function isLowSignalResearchLine(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value || '')
  if (!normalized) return true
  return LOW_SIGNAL_RESEARCH_PATTERNS.some((pattern) => pattern.test(normalized))
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

function formatStagePrefix(
  language: ResearchDisplayLanguage,
  stage: string,
  round?: string,
) {
  switch (language) {
    case 'zh':
      return round ? `第 ${stage} 阶段 / 第 ${round} 轮` : `第 ${stage} 阶段`
    case 'ja':
      return round ? `第${stage}段階 / 第${round}ラウンド` : `第${stage}段階`
    case 'ko':
      return round ? `${stage}단계 / ${round}라운드` : `${stage}단계`
    case 'de':
      return round ? `Stufe ${stage} / Runde ${round}` : `Stufe ${stage}`
    case 'fr':
      return round ? `Étape ${stage} / tour ${round}` : `Étape ${stage}`
    case 'es':
      return round ? `Etapa ${stage} / ronda ${round}` : `Etapa ${stage}`
    case 'ru':
      return round ? `Этап ${stage} / раунд ${round}` : `Этап ${stage}`
    default:
      return round ? `Stage ${stage} / round ${round}` : `Stage ${stage}`
  }
}

function labelForCurrentThread(language: ResearchDisplayLanguage) {
  switch (language) {
    case 'zh':
      return '当前线索'
    case 'ja':
      return '現在の研究線'
    case 'ko':
      return '현재 흐름'
    case 'de':
      return 'Aktueller Faden'
    case 'fr':
      return 'Fil en cours'
    case 'es':
      return 'Hilo actual'
    case 'ru':
      return 'Текущая линия'
    default:
      return 'Current thread'
  }
}

function labelForLatestResearchMove(language: ResearchDisplayLanguage) {
  switch (language) {
    case 'zh':
      return '最近研究动作'
    case 'ja':
      return '直近の研究アクション'
    case 'ko':
      return '최근 연구 동작'
    case 'de':
      return 'Letzte Forschungsbewegung'
    case 'fr':
      return 'Dernier mouvement de recherche'
    case 'es':
      return 'Último movimiento de investigación'
    case 'ru':
      return 'Последний исследовательский ход'
    default:
      return 'Latest research move'
  }
}

function labelForResearchStage(language: ResearchDisplayLanguage) {
  switch (language) {
    case 'zh':
      return '研究阶段'
    case 'ja':
      return '研究段階'
    case 'ko':
      return '연구 단계'
    case 'de':
      return 'Forschungsphase'
    case 'fr':
      return 'Phase de recherche'
    case 'es':
      return 'Etapa de investigación'
    case 'ru':
      return 'Этап исследования'
    default:
      return 'Research stage'
  }
}

export function localizeResearchNarrativeLine(
  value: string | null | undefined,
  language: ResearchDisplayLanguage,
) {
  const normalized = normalizeWhitespace(value || '')
  if (!normalized) return ''

  const stageRoundMatch = normalized.match(/^Stage\s+(\d+)\s*\/\s*round\s+(\d+)\s*:\s*(.+)$/iu)
  if (stageRoundMatch) {
    return `${formatStagePrefix(language, stageRoundMatch[1], stageRoundMatch[2])}: ${stageRoundMatch[3]}`
  }

  const stageMatch = normalized.match(/^Stage\s+(\d+)\s*:\s*(.+)$/iu)
  if (stageMatch) {
    return `${formatStagePrefix(language, stageMatch[1])}: ${stageMatch[2]}`
  }

  const stageInlineMatch = normalized.match(/^Stage\s+(\d+)(.+)$/iu)
  if (stageInlineMatch) {
    return `${formatStagePrefix(language, stageInlineMatch[1])}${stageInlineMatch[2]}`
  }

  const researchStageMatch = normalized.match(/^Research stage\s*:\s*(.+)$/iu)
  if (researchStageMatch) {
    return `${labelForResearchStage(language)}: ${researchStageMatch[1]}`
  }

  const continuityMatch = normalized.match(/^Current thread:\s*(.+?)\s+Latest research move:\s*(.+)$/iu)
  if (continuityMatch) {
    return `${labelForCurrentThread(language)}: ${continuityMatch[1]} ${labelForLatestResearchMove(language)}: ${continuityMatch[2]}`
  }

  return normalized
}

export function uniqueResearchNarrativeLines(
  values: Array<string | null | undefined>,
  language: ResearchDisplayLanguage,
  limit = 4,
) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = localizeResearchNarrativeLine(value, language)
    if (!normalized || isLowSignalResearchLine(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}
