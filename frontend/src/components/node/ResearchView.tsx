import { useMemo } from 'react'
import { Chip, Card, CardContent, Box, Typography } from '@mui/material'
import { Lightbulb, TrendingUp, GitBranch, Merge, Zap, Target, FileText, Quote } from 'lucide-react'

import { MathFormula } from '@/components/MathFormula'
import { EvidenceChainVisualizer } from '@/components/node/EvidenceChainVisualizer'
import { useI18n } from '@/i18n'
import type { NodeViewModel } from '@/types/alpha'
import { resolveApiAssetUrl } from '@/utils/api'

export interface ResearchViewProps {
  viewModel: NodeViewModel
  language?: 'zh' | 'en'
  onOpenEvidence?: (anchorId: string) => void
  compact?: boolean
}

type RenderableEvidence = NodeViewModel['evidence'][number]
type PaperRole = NodeViewModel['paperRoles'][number]

function pickLabel(language: 'zh' | 'en', english: string, chinese: string) {
  return language === 'en' ? english : chinese
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function isMostlyEnglishText(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  const latinCount = normalized.match(/[A-Za-z]/gu)?.length ?? 0
  const hanCount = normalized.match(/[\u4e00-\u9fff]/gu)?.length ?? 0
  return latinCount >= 18 && hanCount * 2 < latinCount
}

function pickResearchNarrative(
  language: 'zh' | 'en',
  ...values: Array<string | null | undefined>
) {
  const normalized = values.map((value) => normalizeText(value)).filter(Boolean)
  if (language === 'zh') {
    const chineseFirst = normalized.find((value) => !isMostlyEnglishText(value))
    if (chineseFirst) return chineseFirst
  }
  return normalized[0] ?? ''
}

function clipText(value: string | null | undefined, maxLength: number) {
  const normalized = normalizeText(value)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

const ROLE_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string; gradient: string }> = {
  origin: { icon: Lightbulb, color: '#059669', bgColor: '#d1fae5', gradient: 'from-emerald-500/10 to-emerald-500/5' },
  milestone: { icon: Target, color: '#dc2626', bgColor: '#fee2e2', gradient: 'from-red-500/10 to-red-500/5' },
  branch: { icon: GitBranch, color: '#7c3aed', bgColor: '#ede9fe', gradient: 'from-violet-500/10 to-violet-500/5' },
  confluence: { icon: Merge, color: '#0891b2', bgColor: '#cffafe', gradient: 'from-cyan-500/10 to-cyan-500/5' },
  extension: { icon: TrendingUp, color: '#d97706', bgColor: '#fef3c7', gradient: 'from-amber-500/10 to-amber-500/5' },
  baseline: { icon: Zap, color: '#4b5563', bgColor: '#f3f4f6', gradient: 'from-gray-500/10 to-gray-500/5' },
}

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role] ?? ROLE_CONFIG.baseline
}

function dedupeEvidence(items: RenderableEvidence[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.anchorId)) return false
    seen.add(item.anchorId)
    return true
  })
}

function pickResearchEvidence(viewModel: NodeViewModel) {
  const featuredIds = new Set(viewModel.researchView.evidence.featuredAnchorIds)
  const supportingIds = new Set(viewModel.researchView.evidence.supportingAnchorIds)
  const byId = new Map(viewModel.evidence.map((item) => [item.anchorId, item] as const))

  const featured = viewModel.researchView.evidence.featured.length
    ? viewModel.researchView.evidence.featured
    : [...featuredIds].map((id) => byId.get(id)).filter(Boolean) as RenderableEvidence[]

  const supporting = viewModel.researchView.evidence.supporting.length
    ? viewModel.researchView.evidence.supporting
    : [...supportingIds].map((id) => byId.get(id)).filter(Boolean) as RenderableEvidence[]

  const priority = (item: RenderableEvidence) => {
    const hasImage = Boolean(resolveEvidenceImage(item))
    if (item.type === 'figure' && hasImage) return 0
    if (item.type === 'table') return 1
    if (item.type === 'formula') return 2
    return 3
  }

  return dedupeEvidence([...featured, ...supporting].filter((item) => item.type !== 'section')).sort(
    (left, right) => priority(left) - priority(right),
  )
}

function resolveEvidenceImage(item: RenderableEvidence) {
  return resolveApiAssetUrl(item.imagePath ?? item.thumbnailPath ?? null)
}

function normalizeTableRows(rows: unknown[] | undefined) {
  if (!Array.isArray(rows)) return [] as string[][]

  return rows
    .slice(0, 2)
    .map((row) => {
      if (Array.isArray(row)) {
        return row.map((value) => clipText(String(value ?? ''), 24))
      }
      if (row && typeof row === 'object') {
        return Object.values(row as Record<string, unknown>).slice(0, 3).map((value) => clipText(String(value ?? ''), 24))
      }
      return [clipText(String(row ?? ''), 24)]
    })
    .filter((row) => row.some(Boolean))
}

// ============================================================================
// Core Argument Card - Visual-first thesis display
// ============================================================================

interface CoreArgument {
  id: string
  title: string
  evidenceCount: number
  keyPaper?: PaperRole
  evidenceIds: string[]
}

function generateCoreArguments(viewModel: NodeViewModel, language: 'zh' | 'en'): CoreArgument[] {
  const arguments_data: CoreArgument[] = []
  const evidence = viewModel.evidence
  const papers = viewModel.paperRoles

  // Extract arguments from core judgment
  const coreJudgment = viewModel.researchView.coreJudgment
  if (coreJudgment) {
    const content = pickResearchNarrative(language, coreJudgment.contentEn, coreJudgment.content)
    if (content) {
      // Split content into sentences and create argument cards
      const sentences = content.split(/[。！？.!?]/).filter(s => s.trim().length > 10)
      sentences.slice(0, 3).forEach((sentence, index) => {
        const relatedEvidence = evidence.slice(index * 2, index * 2 + 2)
        arguments_data.push({
          id: `arg-${index}`,
          title: clipText(sentence.trim(), language === 'zh' ? 40 : 60),
          evidenceCount: relatedEvidence.length,
          keyPaper: papers[index % papers.length],
          evidenceIds: relatedEvidence.map(e => e.anchorId),
        })
      })
    }
  }

  // If not enough arguments from core judgment, add from open questions
  if (arguments_data.length < 3) {
    const questions = viewModel.researchView.problems.openQuestions.slice(0, 5 - arguments_data.length)
    questions.forEach((question, index) => {
      const text = pickResearchNarrative(language, question)
      if (text) {
        const relatedEvidence = evidence.slice((arguments_data.length + index) * 2, (arguments_data.length + index) * 2 + 2)
        arguments_data.push({
          id: `arg-q-${index}`,
          title: clipText(text, language === 'zh' ? 40 : 60),
          evidenceCount: relatedEvidence.length,
          keyPaper: papers[(arguments_data.length + index) % papers.length],
          evidenceIds: relatedEvidence.map(e => e.anchorId),
        })
      }
    })
  }

  return arguments_data.slice(0, 5)
}

function CoreArgumentCard({
  argument,
  index,
  onOpenEvidence,
  evidence,
}: {
  argument: CoreArgument
  index: number
  onOpenEvidence?: (anchorId: string) => void
  evidence: RenderableEvidence[]
}) {
  const { t } = useI18n()
  const config = argument.keyPaper ? getRoleConfig(argument.keyPaper.role) : ROLE_CONFIG.baseline
  const IconComponent = config.icon

  // Get thumbnail evidence for this argument
  const argumentEvidence = argument.evidenceIds
    .map(id => evidence.find(e => e.anchorId === id))
    .filter(Boolean) as RenderableEvidence[]
  const hasVisual = argumentEvidence.length > 0

  return (
    <Card
      sx={{
        cursor: 'pointer',
        height: '100%',
        borderRadius: '20px',
        border: '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${config.bgColor}80 0%, #ffffff 50%, #fafafa 100%)`,
        '&:hover': {
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          transform: 'translateY(-3px)',
          borderColor: 'rgba(0,0,0,0.08)',
        },
      }}
      onClick={() => {
        if (argumentEvidence[0] && onOpenEvidence) {
          onOpenEvidence(argumentEvidence[0].anchorId)
        }
      }}
    >
      <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header: Index + Role Badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: config.bgColor,
              color: config.color,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {index + 1}
          </Box>
          <Chip
            icon={<IconComponent size={10} />}
            label={t(`node.role.${argument.keyPaper?.role ?? 'baseline'}`, argument.keyPaper?.role ?? 'baseline')}
            size="small"
            sx={{
              height: 22,
              fontSize: 10,
              fontWeight: 600,
              bgcolor: config.bgColor,
              color: config.color,
              '& .MuiChip-icon': { ml: 0.5, mr: -0.3, color: config.color },
            }}
          />
        </Box>

        {/* Argument Title - Prominent */}
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: 'rgba(0,0,0,0.85)',
            lineHeight: 1.45,
            mb: 2,
            flex: 1,
          }}
        >
          {argument.title}
        </Typography>

        {/* Visual Thumbnail Row */}
        {hasVisual && (
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            {argumentEvidence.slice(0, 3).map((ev, i) => {
              const evImageUrl = resolveEvidenceImage(ev)
              return evImageUrl ? (
                <Box
                  key={ev.anchorId}
                  sx={{
                    width: i === 0 ? 80 : 48,
                    height: i === 0 ? 60 : 48,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    bgcolor: '#f5f5f5',
                    border: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  <img
                    src={evImageUrl}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    loading="lazy"
                  />
                </Box>
              ) : (
                <Box
                  key={ev.anchorId}
                  sx={{
                    width: i === 0 ? 80 : 48,
                    height: i === 0 ? 60 : 48,
                    borderRadius: '10px',
                    bgcolor: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Quote size={14} color="#999" />
                </Box>
              )
            })}
          </Box>
        )}

        {/* Footer: Evidence Count + Paper Reference */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto' }}>
          <Typography
            sx={{
              fontSize: 11,
              color: 'rgba(0,0,0,0.45)',
              fontWeight: 500,
            }}
          >
            {argument.evidenceCount} {t('node.coreArgument.supportingEvidence', 'supporting evidence')}
          </Typography>
          {argument.keyPaper && (
            <Typography
              sx={{
                fontSize: 10,
                color: config.color,
                fontWeight: 600,
                bgcolor: config.bgColor,
                px: 1,
                py: 0.3,
                borderRadius: '4px',
              }}
            >
              {clipText(argument.keyPaper.title, 20)}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Core Arguments Section - Visual Grid Layout
// ============================================================================

function CoreArgumentsSection({
  viewModel,
  language,
  onOpenEvidence,
  evidence,
}: {
  viewModel: NodeViewModel
  language: 'zh' | 'en'
  onOpenEvidence?: (anchorId: string) => void
  evidence: RenderableEvidence[]
}) {
  const { t } = useI18n()
  const arguments_data = useMemo(() => generateCoreArguments(viewModel, language), [viewModel, language])

  if (arguments_data.length === 0) return null

  return (
    <Box sx={{ mb: 4 }}>
      {/* Section Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Typography
          sx={{
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'rgba(0,0,0,0.35)',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {t('node.poster.argumentCards', 'Argument Cards')}
        </Typography>
        <Chip
          label={arguments_data.length}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 600,
            bgcolor: 'rgba(0,0,0,0.06)',
            color: 'rgba(0,0,0,0.5)',
          }}
        />
      </Box>

      {/* Arguments Grid - Responsive */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)',
            xl: arguments_data.length > 4 ? 'repeat(3, 1fr)' : `repeat(${arguments_data.length}, 1fr)`,
          },
          gap: 2,
        }}
      >
        {arguments_data.map((argument, index) => (
          <CoreArgumentCard
            key={argument.id}
            argument={argument}
            index={index}
            onOpenEvidence={onOpenEvidence}
            evidence={evidence}
          />
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// Poster-Style Figure Card - Optimized for Visual Dominance
// ============================================================================

function PosterFigureCard({
  evidence,
  featured = false,
  onOpenEvidence,
}: {
  evidence: RenderableEvidence
  featured?: boolean
  onOpenEvidence?: (anchorId: string) => void
}) {
  const imageUrl = resolveEvidenceImage(evidence)
  const headers = Array.isArray(evidence.tableHeaders) ? evidence.tableHeaders.slice(0, 3) : []
  const rows = normalizeTableRows(evidence.tableRows)

  return (
    <Card
      onClick={() => onOpenEvidence?.(evidence.anchorId)}
      sx={{
        cursor: 'pointer',
        height: '100%',
        borderRadius: '18px',
        border: featured ? '2px solid rgba(0,0,0,0.06)' : '1px solid rgba(0,0,0,0.04)',
        boxShadow: featured ? '0 4px 20px rgba(0,0,0,0.06)' : '0 1px 4px rgba(0,0,0,0.03)',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        '&:hover': {
          boxShadow: featured ? '0 8px 32px rgba(0,0,0,0.1)' : '0 4px 12px rgba(0,0,0,0.06)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      {/* Figure/Image Section - Dominant visual area */}
      {evidence.type === 'figure' && imageUrl && (
        <Box
          sx={{
            height: featured ? 480 : 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#fafafa',
            p: featured ? 3 : 2,
          }}
        >
          <img
            src={imageUrl}
            alt={evidence.label || evidence.title}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
            loading="lazy"
          />
        </Box>
      )}

      {/* Formula Section */}
      {evidence.type === 'formula' && evidence.formulaLatex && (
        <Box
          sx={{
            height: featured ? 320 : 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#fefefe',
            p: 3,
          }}
        >
          <MathFormula
            expression={evidence.formulaLatex}
            className="text-center text-[14px]"
          />
        </Box>
      )}

      {/* Table Section - Minimal */}
      {evidence.type === 'table' && (
        <Box sx={{ p: 2, bgcolor: '#fafafa', height: featured ? 320 : 220, overflow: 'hidden' }}>
          {headers.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
              {headers.map((header, index) => (
                <Box
                  key={`${header}:${index}`}
                  sx={{
                    flex: 1,
                    py: 0.5,
                    px: 1,
                    bgcolor: '#f0f0f0',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'rgba(0,0,0,0.5)',
                    textAlign: 'center',
                  }}
                >
                  {clipText(header, 16)}
                </Box>
              ))}
            </Box>
          )}
          {rows.slice(0, 3).map((row, rowIndex) => (
            <Box key={`${evidence.anchorId}:row:${rowIndex}`} sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
              {row.map((cell, cellIndex) => (
                <Box
                  key={`${evidence.anchorId}:cell:${rowIndex}:${cellIndex}`}
                  sx={{
                    flex: 1,
                    py: 0.5,
                    px: 1,
                    bgcolor: 'white',
                    fontSize: 10,
                    color: 'rgba(0,0,0,0.6)',
                    textAlign: 'center',
                  }}
                >
                  {cell}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}

      {/* Minimal Caption Section - 13px italic */}
      <CardContent sx={{ pt: 1.5, pb: 1.5, px: 2 }}>
        <Typography
          variant="caption"
          sx={{
            fontStyle: 'italic',
            color: 'rgba(0,0,0,0.6)',
            fontSize: 13,
            lineHeight: 1.4,
            display: 'block',
          }}
        >
          {clipText(evidence.label || evidence.title, featured ? 60 : 40)}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Masonry Figure Gallery - Visual-Heavy Layout (70%+ space)
// ============================================================================

function MasonryFigureGallery({
  evidence,
  compact,
  onOpenEvidence,
}: {
  evidence: RenderableEvidence[]
  compact: boolean
  onOpenEvidence?: (anchorId: string) => void
}) {
  const { t } = useI18n()

  if (evidence.length === 0) return null

  const visibleEvidence = evidence.slice(0, compact ? 6 : 15)
  const [heroFigure, ...rest] = visibleEvidence

  // Split remaining into columns for masonry effect
  const leftColumn: RenderableEvidence[] = []
  const rightColumn: RenderableEvidence[] = []
  rest.forEach((item, index) => {
    if (index % 2 === 0) {
      leftColumn.push(item)
    } else {
      rightColumn.push(item)
    }
  })

  return (
    <Box sx={{ mb: 4 }}>
      {/* Evidence Count Badge - Minimal */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography
          sx={{
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'rgba(0,0,0,0.35)',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {t('node.poster.keyEvidence', 'Key Evidence')}
        </Typography>
        <Chip
          label={evidence.length}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 600,
            bgcolor: 'rgba(0,0,0,0.06)',
            color: 'rgba(0,0,0,0.5)',
          }}
        />
      </Box>

      {/* Hero Figure - Full Width, 480px Height */}
      <Box sx={{ mb: 2.5 }}>
        <PosterFigureCard
          evidence={heroFigure}
          featured={true}
          onOpenEvidence={onOpenEvidence}
        />
      </Box>

      {/* Masonry Grid - Two Columns with varied heights */}
      {rest.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {/* Left Column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {leftColumn.map((item) => (
              <PosterFigureCard
                key={item.anchorId}
                evidence={item}
                onOpenEvidence={onOpenEvidence}
              />
            ))}
          </Box>

          {/* Right Column - Offset for masonry effect */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: { md: 4 } }}>
            {rightColumn.map((item) => (
              <PosterFigureCard
                key={item.anchorId}
                evidence={item}
                onOpenEvidence={onOpenEvidence}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}

// ============================================================================
// Poster-Style Paper Card - Visual thesis display
// ============================================================================

function PosterPaperCard({
  paper,
  language,
}: {
  paper: PaperRole
  language: 'zh' | 'en'
}) {
  const config = getRoleConfig(paper.role)
  const IconComponent = config.icon

  // Extract core thesis from paper data
  const coreThesis = pickResearchNarrative(
    language,
    paper.title,
    paper.summary,
  )

  // Truncate to 15 words for minimal text
  const maxChars = language === 'zh' ? 45 : 70
  const displayThesis = clipText(coreThesis, maxChars)

  // Generate 1-2 key arguments from paper summary
  const keyArguments: string[] = []
  if (paper.summary) {
    const sentences = paper.summary.split(/[。！？.!?]/).filter((s: string) => s.trim().length > 10)
    if (sentences[0]) keyArguments.push(clipText(sentences[0].trim(), language === 'zh' ? 25 : 40))
    if (sentences[1]) keyArguments.push(clipText(sentences[1].trim(), language === 'zh' ? 25 : 40))
  }

  // Extract year from publishedAt
  const year = paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : null

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: '20px',
        border: '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        transition: 'all 0.25s ease',
        overflow: 'hidden',
        background: `linear-gradient(145deg, #ffffff 0%, ${config.bgColor}40 100%)`,
        '&:hover': {
          boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Role Badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Chip
            icon={<IconComponent size={12} style={{ color: config.color }} />}
            label={paper.role}
            size="small"
            sx={{
              height: 24,
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'capitalize',
              bgcolor: config.bgColor,
              color: config.color,
              '& .MuiChip-icon': { ml: 0.5, mr: -0.5 },
            }}
          />
          {year && (
            <Typography sx={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', ml: 'auto' }}>
              {year}
            </Typography>
          )}
        </Box>

        {/* Core Thesis - Prominent */}
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(0,0,0,0.85)',
            lineHeight: 1.45,
            mb: 2,
          }}
        >
          {displayThesis}
        </Typography>

        {/* Key Arguments - Minimal */}
        {keyArguments.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
            {keyArguments.slice(0, 2).map((arg, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    bgcolor: config.color,
                    mt: 0.8,
                    flexShrink: 0,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: 11,
                    color: 'rgba(0,0,0,0.6)',
                    lineHeight: 1.4,
                  }}
                >
                  {arg}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Citation Info */}
        <Box sx={{ mt: 'auto', pt: 1.5, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
          <Typography
            sx={{
              fontSize: 10,
              color: 'rgba(0,0,0,0.45)',
              fontWeight: 500,
            }}
          >
            {paper.authors?.slice(0, 2).join(', ')}
            {paper.authors && paper.authors.length > 2 && ' et al.'}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Paper Section - Poster-Style Visual Cards
// ============================================================================

function PaperSection({
  paperRoles,
  language,
}: {
  paperRoles: NodeViewModel['paperRoles']
  language: 'zh' | 'en'
}) {
  const { t } = useI18n()

  if (paperRoles.length === 0) return null

  const orderedRoles = ['origin', 'milestone', 'branch', 'confluence', 'extension', 'baseline']
  const roleGroups = paperRoles.reduce((acc, paper) => {
    if (!acc[paper.role]) acc[paper.role] = []
    acc[paper.role].push(paper)
    return acc
  }, {} as Record<string, typeof paperRoles>)

  // Sort papers by role priority
  const sortedPapers = orderedRoles.flatMap(role => roleGroups[role] || [])

  return (
    <Box sx={{ mb: 4 }}>
      {/* Section Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Typography
          sx={{
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'rgba(0,0,0,0.35)',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {t('node.poster.contribution', 'Contribution')}
        </Typography>
        <Chip
          label={paperRoles.length}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 600,
            bgcolor: 'rgba(0,0,0,0.06)',
            color: 'rgba(0,0,0,0.5)',
          }}
        />
      </Box>

      {/* Papers Grid - 3 columns */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        {sortedPapers.slice(0, 6).map((paper) => (
          <PosterPaperCard
            key={paper.paperId}
            paper={paper}
            language={language}
          />
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// Key Insight Card - Visual Standalone Display
// ============================================================================

function KeyInsightCard({
  insight,
  index,
  language,
  paper,
}: {
  insight: string
  index: number
  language: 'zh' | 'en'
  paper?: PaperRole
}) {
  const { t } = useI18n()

  // Word count limit: < 25 words
  const maxWords = language === 'zh' ? 45 : 70
  const displayText = clipText(insight, maxWords)

  const config = paper ? getRoleConfig(paper.role) : ROLE_CONFIG.baseline

  return (
    <Card
      sx={{
        borderRadius: '16px',
        border: '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        background: 'linear-gradient(145deg, #ffffff 0%, #fafafa 100%)',
        '&:hover': {
          boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        {/* Insight Number + Visual Indicator */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: config.bgColor,
              color: config.color,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {index + 1}
          </Box>
          <FileText size={14} color="rgba(0,0,0,0.3)" />
        </Box>

        {/* Insight Text - Prominent */}
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(0,0,0,0.75)',
            lineHeight: 1.55,
            mb: 2,
          }}
        >
          {displayText}
        </Typography>

        {/* Source Paper Reference */}
        {paper && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              pt: 1.5,
              borderTop: '1px solid rgba(0,0,0,0.04)',
            }}
          >
            <Typography
              sx={{
                fontSize: 10,
                color: 'rgba(0,0,0,0.4)',
                fontWeight: 500,
              }}
            >
              {t('node.keyInsight.fromPaper', 'Source Paper')}:
            </Typography>
            <Typography
              sx={{
                fontSize: 10,
                color: config.color,
                fontWeight: 600,
                bgcolor: config.bgColor,
                px: 1,
                py: 0.3,
                borderRadius: '4px',
              }}
            >
              {clipText(paper.title, 25)}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Key Insights Section - Visual Card Grid
// ============================================================================

function KeyInsightsSection({
  viewModel,
  language,
}: {
  viewModel: NodeViewModel
  language: 'zh' | 'en'
}) {
  const { t } = useI18n()
  const insights = viewModel.researchView.problems.openQuestions.slice(0, 3)
  const papers = viewModel.paperRoles

  if (insights.length === 0) return null

  return (
    <Box sx={{ mb: 4 }}>
      {/* Section Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Typography
          sx={{
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'rgba(0,0,0,0.35)',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {t('node.poster.openQuestions', 'Open Questions')}
        </Typography>
        <Chip
          label={insights.length}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 600,
            bgcolor: 'rgba(0,0,0,0.06)',
            color: 'rgba(0,0,0,0.5)',
          }}
        />
      </Box>

      {/* Insights Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: insights.length === 1 ? '1fr' : insights.length === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        {insights.map((insight, index) => {
          const text = pickResearchNarrative(language, insight)
          if (!text) return null

          // Assign a paper reference to each insight
          const relatedPaper = papers[index % papers.length]

          return (
            <KeyInsightCard
              key={`insight:${index}`}
              insight={text}
              index={index}
              language={language}
              paper={relatedPaper}
            />
          )
        })}
      </Box>
    </Box>
  )
}

function SectionEyebrow({
  label,
  count,
}: {
  label: string
  count?: number
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.75 }}>
      <Typography
        sx={{
          fontSize: 11,
          letterSpacing: '0.1em',
          color: 'rgba(0,0,0,0.35)',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Typography>
      {typeof count === 'number' ? (
        <Chip
          label={count}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 700,
            bgcolor: 'rgba(0,0,0,0.06)',
            color: 'rgba(0,0,0,0.48)',
          }}
        />
      ) : null}
    </Box>
  )
}

function ResearchBriefHeader({
  viewModel,
  language,
  evidenceCount,
}: {
  viewModel: NodeViewModel
  language: 'zh' | 'en'
  evidenceCount: number
}) {
  const { t } = useI18n()
  const coreQuestion = pickResearchNarrative(
    language,
    viewModel.headline,
    viewModel.summary,
    viewModel.explanation,
  )
  const judgment = viewModel.researchView.coreJudgment
  const judgmentText = judgment
    ? pickResearchNarrative(language, judgment.contentEn, judgment.content)
    : pickResearchNarrative(language, viewModel.standfirst, viewModel.summary)
  const quickTags = judgment?.quickTags?.slice(0, 4) ?? []

  return (
    <Box sx={{ mb: 3.5 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.25fr 0.75fr' },
          gap: 2,
        }}
      >
        <Card
          sx={{
            borderRadius: '24px',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 12px 34px rgba(15,23,42,0.06)',
            bgcolor: '#fffdf8',
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <SectionEyebrow label={t('node.research.coreQuestion', 'Core question')} />
            <Typography
              sx={{
                fontSize: { xs: 22, md: 28 },
                lineHeight: 1.18,
                letterSpacing: '-0.04em',
                fontWeight: 700,
                color: 'rgba(0,0,0,0.9)',
              }}
            >
              {clipText(coreQuestion || viewModel.title, language === 'zh' ? 78 : 110)}
            </Typography>
            {judgmentText ? (
              <Typography
                sx={{
                  mt: 2,
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: 'rgba(0,0,0,0.58)',
                }}
              >
                {clipText(judgmentText, language === 'zh' ? 120 : 180)}
              </Typography>
            ) : null}
            {quickTags.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2.25 }}>
                {quickTags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: 11,
                      bgcolor: 'rgba(125,25,56,0.08)',
                      color: '#7d1938',
                      fontWeight: 700,
                    }}
                  />
                ))}
              </Box>
            ) : null}
          </CardContent>
        </Card>

        <Card
          sx={{
            borderRadius: '24px',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 8px 24px rgba(15,23,42,0.05)',
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <SectionEyebrow label={t('node.research.coverage', 'Coverage')} />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.25 }}>
              {[
                [viewModel.paperRoles.length, t('node.research.papers', 'papers')],
                [evidenceCount, t('node.research.evidence', 'evidence')],
                [viewModel.researchView.methods.entries.length, t('node.research.methods', 'methods')],
                [viewModel.researchView.problems.openQuestions.length, t('node.research.open', 'open')],
              ].map(([value, label]) => (
                <Box
                  key={String(label)}
                  sx={{
                    borderRadius: '16px',
                    border: '1px solid rgba(0,0,0,0.06)',
                    bgcolor: 'rgba(0,0,0,0.018)',
                    p: 1.5,
                  }}
                >
                  <Typography sx={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em' }}>
                    {value}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{label}</Typography>
                </Box>
              ))}
            </Box>
            {judgment?.confidence ? (
              <Chip
                label={`${t('node.research.confidence', 'confidence')}: ${judgment.confidence}`}
                size="small"
                sx={{
                  mt: 1.5,
                  height: 24,
                  bgcolor: 'rgba(0,0,0,0.86)',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

function KeyPapersStrip({
  paperRoles,
  language,
}: {
  paperRoles: NodeViewModel['paperRoles']
  language: 'zh' | 'en'
}) {
  const { t } = useI18n()
  const papers = paperRoles.slice(0, 5)
  if (papers.length === 0) return null

  return (
    <Box sx={{ mb: 3.5 }}>
      <SectionEyebrow label={t('node.research.keyPapers', 'Key papers')} count={papers.length} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
          gap: 1.5,
        }}
      >
        {papers.map((paper) => {
          const config = getRoleConfig(paper.role)
          const year = paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : null
          return (
            <Card
              key={paper.paperId}
              sx={{
                borderRadius: '18px',
                border: '1px solid rgba(0,0,0,0.06)',
                bgcolor: `${config.bgColor}55`,
                boxShadow: 'none',
                height: '100%',
              }}
            >
              <CardContent sx={{ p: 1.75 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1.25 }}>
                  <Chip
                    label={paper.role}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: 10,
                      bgcolor: config.bgColor,
                      color: config.color,
                      fontWeight: 800,
                    }}
                  />
                  {year ? (
                    <Typography sx={{ fontSize: 10, color: 'rgba(0,0,0,0.42)', mt: 0.5 }}>
                      {year}
                    </Typography>
                  ) : null}
                </Box>
                <Typography sx={{ fontSize: 12, lineHeight: 1.45, fontWeight: 700, color: 'rgba(0,0,0,0.76)' }}>
                  {clipText(paper.title, language === 'zh' ? 34 : 48)}
                </Typography>
                {paper.contribution ? (
                  <Typography sx={{ mt: 1, fontSize: 11, lineHeight: 1.45, color: 'rgba(0,0,0,0.52)' }}>
                    {clipText(paper.contribution, language === 'zh' ? 42 : 64)}
                  </Typography>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </Box>
    </Box>
  )
}

function MethodFindingLimitGrid({
  viewModel,
  language,
}: {
  viewModel: NodeViewModel
  language: 'zh' | 'en'
}) {
  const { t } = useI18n()
  const methodCards = viewModel.researchView.methods.entries.slice(0, 3).map((entry) => ({
    key: `method:${entry.paperId}:${entry.title}`,
    label: t('node.research.method', 'Method'),
    title: pickResearchNarrative(language, entry.titleEn, entry.title),
    body: pickResearchNarrative(language, entry.summary, entry.keyPoints[0]),
  }))
  const findingCards = viewModel.researchView.evidence.paperBriefs.slice(0, 3).map((brief) => ({
    key: `finding:${brief.paperId}`,
    label: t('node.research.finding', 'Finding'),
    title: brief.paperTitle,
    body: brief.contribution || brief.summary,
  }))
  const limitCards = viewModel.researchView.problems.items.slice(0, 3).map((item) => ({
    key: `limit:${item.paperId}:${item.title}`,
    label: item.status === 'open'
      ? t('node.research.unresolved', 'Unresolved')
      : item.status === 'partial'
        ? t('node.research.limited', 'Limited')
        : t('node.research.resolved', 'Resolved'),
    title: pickResearchNarrative(language, item.titleEn, item.title),
    body: item.paperTitle,
  }))
  const cards = [...methodCards, ...findingCards, ...limitCards].slice(0, 9)
  if (cards.length === 0) return null

  return (
    <Box sx={{ mb: 4 }}>
      <SectionEyebrow label={t('node.research.methodFindingLimit', 'Methods / findings / limits')} count={cards.length} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 1.5,
        }}
      >
        {cards.map((card) => (
          <Card
            key={card.key}
            sx={{
              borderRadius: '18px',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 4px 16px rgba(15,23,42,0.035)',
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7d1938' }}>
                {card.label}
              </Typography>
              <Typography sx={{ mt: 1, fontSize: 13, fontWeight: 800, lineHeight: 1.38, color: 'rgba(0,0,0,0.82)' }}>
                {clipText(card.title, language === 'zh' ? 34 : 54)}
              </Typography>
              {card.body ? (
                <Typography sx={{ mt: 1, fontSize: 12, lineHeight: 1.5, color: 'rgba(0,0,0,0.55)' }}>
                  {clipText(card.body, language === 'zh' ? 58 : 88)}
                </Typography>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  )
}

function DisputeOpenIssuePanel({
  viewModel,
  language,
}: {
  viewModel: NodeViewModel
  language: 'zh' | 'en'
}) {
  const { t } = useI18n()
  const openQuestions = viewModel.researchView.problems.openQuestions.slice(0, 4)
  const partialProblems = viewModel.researchView.problems.items
    .filter((item) => item.status !== 'solved')
    .slice(0, 4)

  if (openQuestions.length === 0 && partialProblems.length === 0) return null

  return (
    <Box sx={{ mb: 4 }}>
      <SectionEyebrow label={t('node.research.disputes', 'Disputes and open issues')} count={openQuestions.length + partialProblems.length} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' }, gap: 2 }}>
        <Card sx={{ borderRadius: '20px', border: '1px solid rgba(0,0,0,0.06)', bgcolor: '#fffaf0', boxShadow: 'none' }}>
          <CardContent sx={{ p: 2.25 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'rgba(0,0,0,0.72)', mb: 1.5 }}>
              {t('node.research.openQuestions', 'Open questions')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {openQuestions.map((question, index) => (
                <Box key={`${index}:${question}`} sx={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 1 }}>
                  <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: '#7d1938', color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {index + 1}
                  </Box>
                  <Typography sx={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(0,0,0,0.62)' }}>
                    {clipText(question, language === 'zh' ? 70 : 105)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
        <Card sx={{ borderRadius: '20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: 'none' }}>
          <CardContent sx={{ p: 2.25 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'rgba(0,0,0,0.72)', mb: 1.5 }}>
              {t('node.research.unsettledClaims', 'Unsettled claims')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {partialProblems.map((item) => (
                <Chip
                  key={`${item.paperId}:${item.title}`}
                  label={clipText(pickResearchNarrative(language, item.titleEn, item.title), language === 'zh' ? 34 : 52)}
                  sx={{
                    maxWidth: '100%',
                    height: 'auto',
                    py: 0.75,
                    borderRadius: '12px',
                    bgcolor: item.status === 'open' ? 'rgba(125,25,56,0.08)' : 'rgba(0,0,0,0.05)',
                    color: item.status === 'open' ? '#7d1938' : 'rgba(0,0,0,0.62)',
                    '& .MuiChip-label': { whiteSpace: 'normal', fontSize: 11, lineHeight: 1.35 },
                  }}
                />
              ))}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

function FinalJudgmentCard({
  viewModel,
  language,
}: {
  viewModel: NodeViewModel
  language: 'zh' | 'en'
}) {
  const { t } = useI18n()
  const judgment = viewModel.researchView.coreJudgment
  const judgmentText = judgment
    ? pickResearchNarrative(language, judgment.contentEn, judgment.content)
    : pickResearchNarrative(language, viewModel.standfirst, viewModel.summary, viewModel.explanation)

  if (!judgmentText) return null

  return (
    <Card
      sx={{
        mb: 4,
        borderRadius: '24px',
        border: '1px solid rgba(0,0,0,0.06)',
        bgcolor: '#111',
        color: 'white',
        boxShadow: '0 18px 50px rgba(0,0,0,0.16)',
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontWeight: 800 }}>
          {t('node.research.finalJudgment', 'Research judgment')}
        </Typography>
        <Typography sx={{ mt: 1.75, fontSize: { xs: 18, md: 23 }, lineHeight: 1.42, fontWeight: 700, letterSpacing: '-0.025em' }}>
          {clipText(judgmentText, language === 'zh' ? 140 : 210)}
        </Typography>
        {judgment?.confidence ? (
          <Chip
            label={`${t('node.research.confidence', 'confidence')}: ${judgment.confidence}`}
            size="small"
            sx={{ mt: 2, bgcolor: 'rgba(255,255,255,0.12)', color: 'white', fontSize: 11, fontWeight: 800 }}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Research View - Visual-First Poster Style
// ============================================================================

export function ResearchView({
  viewModel,
  language,
  onOpenEvidence,
  compact = false,
}: ResearchViewProps) {
  const { preference, t } = useI18n()
  const effectiveLanguage = language ?? (preference.primary === 'zh' ? 'zh' : 'en')
  const researchView = viewModel.researchView

  const evidence = useMemo(() => pickResearchEvidence(viewModel), [viewModel])

  const hasData =
    Boolean(researchView.coreJudgment) ||
    evidence.length > 0 ||
    viewModel.paperRoles.length > 0

  if (!hasData) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: compact ? 2 : 8,
          px: 3,
          color: 'rgba(0,0,0,0.5)',
        }}
      >
        <Typography sx={{ fontSize: 14 }}>
          {t(
            'node.researchView.empty',
            pickLabel(
              effectiveLanguage,
              'No structured research data available.',
              '暂无结构化研究数据。'
            )
          )}
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        maxWidth: compact ? 900 : 1200,
        mx: 'auto',
        px: { xs: 1.5, md: 2 },
        py: compact ? 1 : 2,
      }}
    >
      <ResearchBriefHeader
        viewModel={viewModel}
        language={effectiveLanguage}
        evidenceCount={evidence.length}
      />

      <KeyPapersStrip
        paperRoles={viewModel.paperRoles}
        language={effectiveLanguage}
      />

      {/* Core Arguments Section - NEW: Prominent Cards */}
      <CoreArgumentsSection
        viewModel={viewModel}
        language={effectiveLanguage}
        onOpenEvidence={onOpenEvidence}
        evidence={evidence}
      />

      {/* Figure-Dominant Gallery - ENHANCED: Masonry Layout (70%+ visual) */}
      <MasonryFigureGallery
        evidence={evidence}
        compact={compact}
        onOpenEvidence={onOpenEvidence}
      />

      {/* Evidence Chain Visualizer - NEW: Show evidence-to-paper relationships */}
      <EvidenceChainVisualizer
        viewModel={viewModel}
        language={effectiveLanguage}
        onOpenEvidence={onOpenEvidence}
        compact={compact}
      />

      <MethodFindingLimitGrid
        viewModel={viewModel}
        language={effectiveLanguage}
      />

      <DisputeOpenIssuePanel
        viewModel={viewModel}
        language={effectiveLanguage}
      />

      {/* Paper Section - REDESIGNED: Poster-style cards */}
      <PaperSection
        paperRoles={viewModel.paperRoles}
        language={effectiveLanguage}
      />

      {/* Key Insights - IMPROVED: Visual cards with references */}
      {!compact && (
        <KeyInsightsSection
          viewModel={viewModel}
          language={effectiveLanguage}
        />
      )}

      <FinalJudgmentCard
        viewModel={viewModel}
        language={effectiveLanguage}
      />
    </Box>
  )
}

export default ResearchView
