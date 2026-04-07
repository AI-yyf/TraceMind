/**
 * 论文子节组件 - 8-Pass深度解析
 * 
 * 展示单篇论文的8个子节：
 * 背景、问题、方法、实验、结果、贡献、局限、意义
 */

import React, { useState } from 'react'
import { Box, Typography, Chip, Collapse, IconButton, Divider } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import type { PaperSubsection, PaperRoleInNode } from '@/types/article'
import { useI18n } from '@/i18n'

interface PaperSectionBlockProps {
  paperId: string
  title: string
  titleEn?: string
  authors: string[]
  publishedAt: string
  citationCount: number | null
  role: PaperRoleInNode
  introduction: string
  subsections: PaperSubsection[]
  conclusion: string
  anchorId: string
}

const ROLE_COLORS: Record<PaperRoleInNode, string> = {
  origin: '#4CAF50',
  milestone: '#FF9800',
  branch: '#2196F3',
  confluence: '#9C27B0',
  extension: '#607D8B',
  baseline: '#795548',
}

const ROLE_LABELS: Record<PaperRoleInNode, string> = {
  origin: '源头论文',
  milestone: '里程碑',
  branch: '分支点',
  confluence: '汇流点',
  extension: '扩展',
  baseline: '基线',
}

export const PaperSectionBlock: React.FC<PaperSectionBlockProps> = ({
  paperId,
  title,
  titleEn,
  authors,
  publishedAt,
  citationCount,
  role,
  introduction,
  subsections,
  conclusion,
  anchorId,
}) => {
  const { t } = useI18n()
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    introduction: true,
    conclusion: true,
  })

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }))
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })
  }

  return (
    <Box
      id={anchorId}
      component="article"
      sx={{
        mb: 6,
        p: 4,
        bgcolor: 'background.paper',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: ROLE_COLORS[role],
          borderRadius: '2px 0 0 2px',
        },
      }}
    >
      {/* 论文头部 */}
      <Box sx={{ mb: 3, pl: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Chip
            label={ROLE_LABELS[role]}
            size="small"
            sx={{
              bgcolor: ROLE_COLORS[role] + '20',
              color: ROLE_COLORS[role],
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          />
          {citationCount !== null && (
            <Typography variant="caption" color="text.secondary">
              {t('node.citations', { count: citationCount })}
            </Typography>
          )}
        </Box>

        <Typography variant="h5" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
          {title}
        </Typography>
        
        {titleEn && titleEn !== title && (
          <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
            {titleEn}
          </Typography>
        )}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {authors.slice(0, 5).map((author, idx) => (
            <Typography key={idx} variant="caption" color="text.secondary">
              {author}{idx < Math.min(authors.length, 5) - 1 ? ',' : ''}
            </Typography>
          ))}
          {authors.length > 5 && (
            <Typography variant="caption" color="text.secondary">
              +{authors.length - 5}
            </Typography>
          )}
        </Box>

        <Typography variant="caption" color="text.secondary">
          {formatDate(publishedAt)}
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* 引言 */}
      <Box sx={{ mb: 3, pl: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
          onClick={() => toggleSection('introduction')}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
            {t('node.paper.introduction')}
          </Typography>
          <IconButton size="small">
            {expandedSections.introduction ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
        <Collapse in={expandedSections.introduction}>
          <Typography
            variant="body1"
            sx={{
              mt: 1,
              lineHeight: 1.8,
              color: 'text.primary',
            }}
          >
            {introduction}
          </Typography>
        </Collapse>
      </Box>

      {/* 8个子节 */}
      <Box sx={{ pl: 2 }}>
        {subsections.map((subsection, index) => (
          <PaperSubsectionItem
            key={subsection.kind}
            subsection={subsection}
            index={index}
            expanded={expandedSections[subsection.kind] ?? false}
            onToggle={() => toggleSection(subsection.kind)}
          />
        ))}
      </Box>

      {/* 总结 */}
      <Box sx={{ mt: 3, pl: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
          onClick={() => toggleSection('conclusion')}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
            {t('node.paper.conclusion')}
          </Typography>
          <IconButton size="small">
            {expandedSections.conclusion ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
        <Collapse in={expandedSections.conclusion}>
          <Typography
            variant="body1"
            sx={{
              mt: 1,
              lineHeight: 1.8,
              color: 'text.primary',
            }}
          >
            {conclusion}
          </Typography>
        </Collapse>
      </Box>
    </Box>
  )
}

// 子节项组件
interface PaperSubsectionItemProps {
  subsection: PaperSubsection
  index: number
  expanded: boolean
  onToggle: () => void
}

const PaperSubsectionItem: React.FC<PaperSubsectionItemProps> = ({
  subsection,
  index,
  expanded,
  onToggle,
}) => {
  const SUBSECTION_ICONS: Record<string, string> = {
    background: '📚',
    problem: '❓',
    method: '⚙️',
    experiment: '🧪',
    results: '📊',
    contribution: '💡',
    limitation: '⚠️',
    significance: '🌟',
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          py: 1,
          px: 1.5,
          borderRadius: 1,
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
        onClick={onToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 24 }}>
            {index + 1}.
          </Typography>
          <Typography sx={{ fontSize: '1.1rem' }}>{SUBSECTION_ICONS[subsection.kind]}</Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {subsection.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({subsection.wordCount} 字)
          </Typography>
        </Box>
        <IconButton size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ pl: 6, pr: 2, py: 1 }}>
          <Typography
            variant="body2"
            sx={{
              lineHeight: 1.8,
              color: 'text.primary',
              mb: subsection.keyPoints.length > 0 ? 2 : 0,
            }}
          >
            {subsection.content}
          </Typography>

          {subsection.keyPoints.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              {subsection.keyPoints.map((point, idx) => (
                <Chip
                  key={idx}
                  label={point}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.75rem' }}
                />
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}
