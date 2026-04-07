/**
 * 主题仪表盘组件
 * 
 * 展示主题的研究主线、方法演进、活跃作者等宏观视角
 */

import React from 'react'
import { Box, Typography, Paper, Chip, Grid, Divider, LinearProgress } from '@mui/material'
import TimelineIcon from '@mui/icons-material/Timeline'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import PeopleIcon from '@mui/icons-material/People'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import { useI18n } from '@/i18n'

interface TopicDashboardProps {
  dashboard: TopicDashboardData
}

export const TopicDashboard: React.FC<TopicDashboardProps> = ({ dashboard }) => {
  const { t } = useI18n()

  return (
    <Box sx={{ p: 3 }}>
      {/* 标题 */}
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        {t('dashboard.title')}
      </Typography>

      {/* 统计摘要 */}
      <StatsSection dashboard={dashboard} />

      <Divider sx={{ my: 3 }} />

      {/* 研究主线 */}
      <ResearchThreadsSection threads={dashboard.researchThreads} />

      <Divider sx={{ my: 3 }} />

      {/* 方法演进 */}
      <MethodEvolutionSection evolution={dashboard.methodEvolution} />

      <Divider sx={{ my: 3 }} />

      {/* 活跃作者 */}
      <ActiveAuthorsSection authors={dashboard.activeAuthors} />

      {/* 关键洞察 */}
      {dashboard.keyInsights.length > 0 && (
        <>
          <Divider sx={{ my: 3 }} />
          <KeyInsightsSection insights={dashboard.keyInsights} />
        </>
      )}
    </Box>
  )
}

// 统计摘要
const StatsSection: React.FC<{ dashboard: TopicDashboardData }> = ({ dashboard }) => {
  const { t } = useI18n()
  const { stats } = dashboard

  const statItems = [
    { label: t('dashboard.stats.totalPapers'), value: stats.totalPapers },
    { label: t('dashboard.stats.totalNodes'), value: stats.totalNodes },
    { label: t('dashboard.stats.totalStages'), value: stats.totalStages },
    { label: t('dashboard.stats.timeSpan'), value: `${stats.timeSpanYears} ${t('dashboard.stats.years')}` },
    { label: t('dashboard.stats.avgPapersPerNode'), value: stats.avgPapersPerNode.toFixed(1) },
    { label: t('dashboard.stats.citationCoverage'), value: `${(stats.citationCoverage * 100).toFixed(0)}%` },
  ]

  return (
    <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <TimelineIcon fontSize="small" />
        {t('dashboard.stats.title')}
      </Typography>
      <Grid container spacing={2}>
        {statItems.map((item) => (
          <Grid item xs={6} sm={4} key={item.label}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {item.value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.label}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Paper>
  )
}

// 研究主线
const ResearchThreadsSection: React.FC<{ threads: TopicDashboardData['researchThreads'] }> = ({ threads }) => {
  const { t } = useI18n()

  if (!threads || threads.length === 0) {
    return (
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUpIcon fontSize="small" />
          {t('dashboard.threads.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('dashboard.empty.noThreads')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <TrendingUpIcon fontSize="small" />
        {t('dashboard.threads.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('dashboard.threads.description')}
      </Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {threads.map((thread, index) => (
          <Paper
            key={thread.nodeId}
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: thread.isMilestone ? 'primary.main' : 'divider',
              bgcolor: thread.isMilestone ? 'primary.50' : 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Chip
                label={`${t('dashboard.threads.stage')} ${thread.stageIndex + 1}`}
                size="small"
                color={thread.isMilestone ? 'primary' : 'default'}
                variant={thread.isMilestone ? 'filled' : 'outlined'}
              />
              {thread.isMilestone && (
                <Chip
                  label={t('dashboard.threads.milestone')}
                  size="small"
                  color="warning"
                  icon={<LightbulbIcon fontSize="small" />}
                />
              )}
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {thread.nodeTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {thread.thesis}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {thread.paperCount} {t('dashboard.threads.papers')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('dashboard.threads.keyPaper')}: {thread.keyPaperTitle}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  )
}

// 方法演进
const MethodEvolutionSection: React.FC<{ evolution: TopicDashboardData['methodEvolution'] }> = ({ evolution }) => {
  const { t } = useI18n()

  if (!evolution || evolution.length === 0) {
    return (
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUpIcon fontSize="small" />
          {t('dashboard.evolution.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('dashboard.empty.noEvolution')}
        </Typography>
      </Box>
    )
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'success'
      case 'medium': return 'warning'
      case 'low': return 'default'
      default: return 'default'
    }
  }

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <TrendingUpIcon fontSize="small" />
        {t('dashboard.evolution.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('dashboard.evolution.description')}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {evolution.map((item) => (
          <Paper
            key={`${item.paperId}-${item.year}`}
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Chip label={item.year} size="small" color="primary" variant="outlined" />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {item.methodName}
              </Typography>
              <Chip
                label={t(`dashboard.evolution.impact.${item.impact}`)}
                size="small"
                color={getImpactColor(item.impact) as any}
                variant="outlined"
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {item.contribution}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {item.paperTitle}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  )
}

// 活跃作者
const ActiveAuthorsSection: React.FC<{ authors: TopicDashboardData['activeAuthors'] }> = ({ authors }) => {
  const { t } = useI18n()

  if (!authors || authors.length === 0) {
    return (
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PeopleIcon fontSize="small" />
          {t('dashboard.authors.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('dashboard.empty.noAuthors')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <PeopleIcon fontSize="small" />
        {t('dashboard.authors.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('dashboard.authors.description')}
      </Typography>

      <Grid container spacing={2}>
        {authors.map((author) => (
          <Grid item xs={12} sm={6} key={author.name}>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {author.name}
              </Typography>
              {author.affiliation && (
                <Typography variant="caption" color="text.secondary" display="block">
                  {author.affiliation}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Typography variant="caption">
                  {author.paperCount} {t('dashboard.authors.paperCount')}
                </Typography>
                <Typography variant="caption">
                  {author.citationCount} {t('dashboard.authors.citations')}
                </Typography>
              </Box>
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('dashboard.authors.focus')}:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {author.researchFocus.map((focus) => (
                    <Chip key={focus} label={focus} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                  ))}
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}

// 关键洞察
const KeyInsightsSection: React.FC<{ insights: string[] }> = ({ insights }) => {
  const { t } = useI18n()

  return (
    <Paper elevation={0} sx={{ p: 2, bgcolor: 'info.50', borderRadius: 2, border: '1px solid', borderColor: 'info.200' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <LightbulbIcon fontSize="small" color="info" />
        {t('dashboard.insights.title')}
      </Typography>
      <Box component="ul" sx={{ pl: 2, m: 0 }}>
        {insights.map((insight, index) => (
          <Typography component="li" key={index} variant="body2" sx={{ mb: 1 }}>
            {insight}
          </Typography>
        ))}
      </Box>
    </Paper>
  )
}
