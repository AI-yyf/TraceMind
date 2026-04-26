import { useState, useMemo } from 'react'
import { Card, CardContent, Box, Typography, Chip, Collapse, IconButton } from '@mui/material'
import { Link2, FileText, ChevronDown, ChevronUp, Image, Table, FunctionSquare } from 'lucide-react'

import { useI18n } from '@/i18n'
import type { NodeViewModel, EvidenceExplanation } from '@/types/alpha'
import type { PaperSubsectionKind } from '@/types/article'
import { resolveApiAssetUrl } from '@/utils/api'

// ============================================================================
// Types
// ============================================================================

export interface EvidenceChainVisualizerProps {
  viewModel: NodeViewModel
  language?: 'zh' | 'en'
  onOpenEvidence?: (anchorId: string) => void
  compact?: boolean
}

type EvidenceChain = NodeViewModel['researchView']['evidence']['evidenceChains'][number]
type PaperRole = NodeViewModel['paperRoles'][number]
type RenderableEvidence = EvidenceExplanation

// ============================================================================
// Subsection Kind Configuration
// ============================================================================

const SUBSECTION_CONFIG: Record<
  PaperSubsectionKind,
  { label: string; labelEn: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  background: {
    label: '研究背景',
    labelEn: 'Background',
    color: '#6b7280',
    bgColor: '#f3f4f6',
    icon: FileText,
  },
  problem: {
    label: '问题定义',
    labelEn: 'Problem',
    color: '#dc2626',
    bgColor: '#fee2e2',
    icon: FileText,
  },
  method: {
    label: '方法详解',
    labelEn: 'Method',
    color: '#7c3aed',
    bgColor: '#ede9fe',
    icon: FunctionSquare,
  },
  experiment: {
    label: '实验设计',
    labelEn: 'Experiment',
    color: '#0891b2',
    bgColor: '#cffafe',
    icon: FileText,
  },
  results: {
    label: '结果分析',
    labelEn: 'Results',
    color: '#059669',
    bgColor: '#d1fae5',
    icon: Table,
  },
  contribution: {
    label: '核心贡献',
    labelEn: 'Contribution',
    color: '#d97706',
    bgColor: '#fef3c7',
    icon: FileText,
  },
  limitation: {
    label: '局限与边界',
    labelEn: 'Limitation',
    color: '#4b5563',
    bgColor: '#f3f4f6',
    icon: FileText,
  },
  significance: {
    label: '研究意义',
    labelEn: 'Significance',
    color: '#7c3aed',
    bgColor: '#ede9fe',
    icon: FileText,
  },
}

const ROLE_CONFIG: Record<string, { color: string; bgColor: string; gradient: string }> = {
  origin: { color: '#059669', bgColor: '#d1fae5', gradient: 'from-emerald-500/10 to-emerald-500/5' },
  milestone: { color: '#dc2626', bgColor: '#fee2e2', gradient: 'from-red-500/10 to-red-500/5' },
  branch: { color: '#7c3aed', bgColor: '#ede9fe', gradient: 'from-violet-500/10 to-violet-500/5' },
  confluence: { color: '#0891b2', bgColor: '#cffafe', gradient: 'from-cyan-500/10 to-cyan-500/5' },
  extension: { color: '#d97706', bgColor: '#fef3c7', gradient: 'from-amber-500/10 to-amber-500/5' },
  baseline: { color: '#4b5563', bgColor: '#f3f4f6', gradient: 'from-gray-500/10 to-gray-500/5' },
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSubsectionConfig(kind: PaperSubsectionKind) {
  return SUBSECTION_CONFIG[kind] ?? SUBSECTION_CONFIG.background
}

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role] ?? ROLE_CONFIG.baseline
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function clipText(value: string | null | undefined, maxLength: number) {
  const normalized = normalizeText(value)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

function resolveEvidenceImage(item: RenderableEvidence) {
  return resolveApiAssetUrl(item.imagePath ?? item.thumbnailPath ?? null)
}

function getEvidenceTypeIcon(type: string) {
  switch (type) {
    case 'figure':
      return Image
    case 'table':
      return Table
    case 'formula':
      return FunctionSquare
    default:
      return FileText
  }
}

function getEvidenceTypeLabel(type: string, language: 'zh' | 'en') {
  const labels: Record<string, { zh: string; en: string }> = {
    figure: { zh: '图表', en: 'Figure' },
    table: { zh: '表格', en: 'Table' },
    formula: { zh: '公式', en: 'Formula' },
    section: { zh: '章节', en: 'Section' },
  }
  return labels[type]?.[language] ?? type
}

// ============================================================================
// Evidence Chain Card Component
// ============================================================================

interface EvidenceChainCardProps {
  chain: EvidenceChain
  paper: PaperRole | undefined
  evidence: RenderableEvidence[]
  language: 'zh' | 'en'
  onOpenEvidence?: (anchorId: string) => void
  index: number
}

function EvidenceChainCard({
  chain,
  paper,
  evidence,
  language,
  onOpenEvidence,
  index,
}: EvidenceChainCardProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)

  const subsectionConfig = getSubsectionConfig(chain.subsectionKind)
  const roleConfig = paper ? getRoleConfig(paper.role) : ROLE_CONFIG.baseline
  const SubsectionIcon = subsectionConfig.icon

  // Get related evidence items
  const chainEvidence = useMemo(() => {
    return chain.evidenceAnchorIds
      .map((id) => evidence.find((e) => e.anchorId === id))
      .filter(Boolean) as RenderableEvidence[]
  }, [chain.evidenceAnchorIds, evidence])

  const hasEvidence = chainEvidence.length > 0

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: '20px',
        border: '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${roleConfig.bgColor}60 0%, #ffffff 50%, #fafafa 100%)`,
        '&:hover': {
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          transform: 'translateY(-3px)',
          borderColor: 'rgba(0,0,0,0.08)',
        },
      }}
    >
      <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header: Chain Index + Subsection Badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: roleConfig.bgColor,
              color: roleConfig.color,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {index + 1}
          </Box>
          <Chip
            icon={<SubsectionIcon size={10} />}
            label={language === 'en' ? subsectionConfig.labelEn : subsectionConfig.label}
            size="small"
            sx={{
              height: 22,
              fontSize: 10,
              fontWeight: 600,
              bgcolor: subsectionConfig.bgColor,
              color: subsectionConfig.color,
              '& .MuiChip-icon': { ml: 0.5, mr: -0.3, color: subsectionConfig.color },
            }}
          />
          {paper && (
            <Chip
              label={t(`node.role.${paper.role}`, paper.role)}
              size="small"
              sx={{
                height: 22,
                fontSize: 9,
                fontWeight: 600,
                bgcolor: roleConfig.bgColor,
                color: roleConfig.color,
                ml: 'auto',
              }}
            />
          )}
        </Box>

        {/* Paper Title */}
        {paper && (
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(0,0,0,0.7)',
              lineHeight: 1.4,
              mb: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <Link2 size={12} color={roleConfig.color} />
            {clipText(paper.title, language === 'zh' ? 40 : 60)}
          </Typography>
        )}

        {/* Chain Summary */}
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(0,0,0,0.85)',
            lineHeight: 1.5,
            mb: 2,
            flex: 1,
          }}
        >
          {clipText(chain.summary, language === 'zh' ? 100 : 140)}
        </Typography>

        {/* Evidence Preview Row */}
        {hasEvidence && (
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            {chainEvidence.slice(0, 3).map((ev) => {
              const evImageUrl = resolveEvidenceImage(ev)
              const EvidenceIcon = getEvidenceTypeIcon(ev.type)

              return (
                <Box
                  key={ev.anchorId}
                  onClick={() => onOpenEvidence?.(ev.anchorId)}
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    bgcolor: '#f5f5f5',
                    border: '1px solid rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    },
                  }}
                >
                  {evImageUrl ? (
                    <img
                      src={evImageUrl}
                      alt={ev.label || ev.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      loading="lazy"
                    />
                  ) : (
                    <Box
                      sx={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: 0.5,
                      }}
                    >
                      <EvidenceIcon size={16} color="#999" />
                      <Typography
                        sx={{
                          fontSize: 8,
                          color: 'rgba(0,0,0,0.4)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {getEvidenceTypeLabel(ev.type, language)}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )
            })}
            {chainEvidence.length > 3 && (
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '12px',
                  bgcolor: 'rgba(0,0,0,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'rgba(0,0,0,0.5)',
                }}
              >
                +{chainEvidence.length - 3}
              </Box>
            )}
          </Box>
        )}

        {/* Expandable Evidence List */}
        {hasEvidence && (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                pt: 1.5,
                borderTop: '1px solid rgba(0,0,0,0.04)',
                mt: 'auto',
              }}
            >
              <Typography
                sx={{
                  fontSize: 11,
                  color: 'rgba(0,0,0,0.45)',
                  fontWeight: 500,
                }}
              >
                {chainEvidence.length} {t('node.evidenceChain.supportingEvidence', 'supporting evidence')}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setExpanded(!expanded)}
                sx={{
                  width: 28,
                  height: 28,
                  color: 'rgba(0,0,0,0.4)',
                  '&:hover': {
                    bgcolor: 'rgba(0,0,0,0.04)',
                  },
                }}
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
            </Box>

            <Collapse in={expanded} timeout="auto" unmountOnExit>
              <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {chainEvidence.map((ev) => {
                  const EvidenceIcon = getEvidenceTypeIcon(ev.type)
                  return (
                    <Box
                      key={ev.anchorId}
                      onClick={() => onOpenEvidence?.(ev.anchorId)}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        p: 1.5,
                        borderRadius: '12px',
                        bgcolor: 'rgba(0,0,0,0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          bgcolor: 'rgba(0,0,0,0.04)',
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '6px',
                          bgcolor: `${subsectionConfig.bgColor}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <EvidenceIcon size={12} color={subsectionConfig.color} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'rgba(0,0,0,0.7)',
                            mb: 0.3,
                          }}
                        >
                          {clipText(ev.label || ev.title, 40)}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: 10,
                            color: 'rgba(0,0,0,0.5)',
                            lineHeight: 1.4,
                          }}
                        >
                          {clipText(ev.explanation || ev.whyItMatters || ev.content, 80)}
                        </Typography>
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Evidence Chain Connector Component
// ============================================================================

function EvidenceChainConnector({
  chains,
  language,
}: {
  chains: EvidenceChain[]
  language: 'zh' | 'en'
}) {
  const { t } = useI18n()

  // Group chains by subsection kind
  const groupedChains = useMemo(() => {
    const groups: Record<string, EvidenceChain[]> = {}
    chains.forEach((chain) => {
      if (!groups[chain.subsectionKind]) {
        groups[chain.subsectionKind] = []
      }
      groups[chain.subsectionKind].push(chain)
    })
    return groups
  }, [chains])

  const groupKeys = Object.keys(groupedChains)

  if (groupKeys.length <= 1) return null

  return (
    <Box sx={{ mb: 3, px: 1 }}>
      <Typography
        sx={{
          fontSize: 10,
          letterSpacing: '0.08em',
          color: 'rgba(0,0,0,0.35)',
          fontWeight: 600,
          textTransform: 'uppercase',
          mb: 1.5,
        }}
      >
        {t('node.evidenceChain.flow', 'Evidence Flow')}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {groupKeys.map((kind, idx) => {
          const config = getSubsectionConfig(kind as PaperSubsectionKind)
          const count = groupedChains[kind].length
          const Icon = config.icon

          return (
            <Box key={kind} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.8,
                  px: 1.5,
                  py: 0.8,
                  borderRadius: '20px',
                  bgcolor: config.bgColor,
                  border: `1px solid ${config.color}20`,
                }}
              >
                <Icon size={12} color={config.color} />
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: config.color,
                  }}
                >
                  {language === 'en' ? config.labelEn : config.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 9,
                    color: 'rgba(0,0,0,0.4)',
                    bgcolor: 'rgba(255,255,255,0.6)',
                    px: 0.6,
                    py: 0.2,
                    borderRadius: '8px',
                  }}
                >
                  {count}
                </Typography>
              </Box>
              {idx < groupKeys.length - 1 && (
                <Box
                  sx={{
                    width: 16,
                    height: 1,
                    bgcolor: 'rgba(0,0,0,0.1)',
                  }}
                />
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// ============================================================================
// Evidence Chain Statistics Component
// ============================================================================

function EvidenceChainStats({
  chains,
  language,
}: {
  chains: EvidenceChain[]
  language: 'zh' | 'en'
}) {

  const stats = useMemo(() => {
    const totalEvidenceInChains = chains.reduce(
      (sum, chain) => sum + chain.evidenceAnchorIds.length,
      0
    )
    const subsectionKinds = new Set(chains.map((c) => c.subsectionKind))
    const paperIds = new Set(chains.map((c) => c.paperId))

    return {
      chainCount: chains.length,
      evidenceCount: totalEvidenceInChains,
      subsectionCount: subsectionKinds.size,
      paperCount: paperIds.size,
    }
  }, [chains])

  const statItems = [
    {
      value: stats.chainCount,
      label: language === 'zh' ? '证据链' : 'Chains',
      color: '#7c3aed',
    },
    {
      value: stats.evidenceCount,
      label: language === 'zh' ? '关联证据' : 'Evidence',
      color: '#059669',
    },
    {
      value: stats.paperCount,
      label: language === 'zh' ? '来源论文' : 'Sources',
      color: '#0891b2',
    },
    {
      value: stats.subsectionCount,
      label: language === 'zh' ? '论证环节' : 'Sections',
      color: '#d97706',
    },
  ]

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        mb: 3,
        flexWrap: 'wrap',
      }}
    >
      {statItems.map((stat) => (
        <Box
          key={stat.label}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            px: 2,
            py: 1.5,
            borderRadius: '12px',
            bgcolor: `${stat.color}10`,
            border: `1px solid ${stat.color}20`,
            minWidth: 70,
          }}
        >
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 700,
              color: stat.color,
              lineHeight: 1,
            }}
          >
            {stat.value}
          </Typography>
          <Typography
            sx={{
              fontSize: 10,
              color: 'rgba(0,0,0,0.5)',
              mt: 0.5,
              fontWeight: 500,
            }}
          >
            {stat.label}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// ============================================================================
// Main Evidence Chain Visualizer Component
// ============================================================================

export function EvidenceChainVisualizer({
  viewModel,
  language = 'zh',
  onOpenEvidence,
  compact = false,
}: EvidenceChainVisualizerProps) {
  const { t } = useI18n()
  const chains = viewModel.researchView.evidence.evidenceChains
  const evidence = viewModel.evidence
  const papers = viewModel.paperRoles

  // Create paper lookup map
  const paperMap = useMemo(() => {
    return new Map(papers.map((p) => [p.paperId, p]))
  }, [papers])

  if (!chains || chains.length === 0) {
    return null
  }

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
          {t('node.evidenceChain.title', 'Evidence Chains')}
        </Typography>
        <Chip
          label={chains.length}
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

      {/* Statistics Overview */}
      {!compact && <EvidenceChainStats chains={chains} language={language} />}

      {/* Flow Connector */}
      {!compact && chains.length > 1 && (
        <EvidenceChainConnector chains={chains} language={language} />
      )}

      {/* Evidence Chain Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: compact ? '1fr' : 'repeat(2, 1fr)',
            lg: compact ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          },
          gap: 2,
        }}
      >
        {chains.slice(0, compact ? 4 : 9).map((chain, index) => (
          <EvidenceChainCard
            key={`${chain.paperId}-${chain.subsectionKind}-${index}`}
            chain={chain}
            paper={paperMap.get(chain.paperId)}
            evidence={evidence}
            language={language}
            onOpenEvidence={onOpenEvidence}
            index={index}
          />
        ))}
      </Box>

      {/* Show More Indicator */}
      {chains.length > (compact ? 4 : 9) && (
        <Box
          sx={{
            textAlign: 'center',
            mt: 2,
            py: 1.5,
            borderRadius: '12px',
            bgcolor: 'rgba(0,0,0,0.02)',
            border: '1px dashed rgba(0,0,0,0.1)',
          }}
        >
          <Typography
            sx={{
              fontSize: 11,
              color: 'rgba(0,0,0,0.4)',
              fontWeight: 500,
            }}
          >
            {language === 'zh'
              ? `还有 ${chains.length - (compact ? 4 : 9)} 条证据链`
              : `${chains.length - (compact ? 4 : 9)} more evidence chains`}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default EvidenceChainVisualizer
