/**
 * Research-related translations for backend.
 * Keys match frontend structure where possible.
 */

import type { TranslationDictionary } from '../index'

const translations: TranslationDictionary = {
  // Stage labels
  'stage.discovery': {
    zh: '论文发现',
    en: 'Paper Discovery',
  },
  'stage.filtering': {
    zh: '论文筛选',
    en: 'Paper Filtering',
  },
  'stage.extraction': {
    zh: '证据抽取',
    en: 'Evidence Extraction',
  },
  'stage.modeling': {
    zh: '节点建模',
    en: 'Node Modeling',
  },
  'stage.synthesis': {
    zh: '研究综合',
    en: 'Research Synthesis',
  },
  'stage.generation': {
    zh: '内容生成',
    en: 'Content Generation',
  },

  // Stage progress labels
  'stage.progress.current': {
    zh: '当前阶段',
    en: 'Current Stage',
  },
  'stage.progress.total': {
    zh: '总阶段数',
    en: 'Total Stages',
  },
  'stage.progress.rounds': {
    zh: '轮次',
    en: 'Rounds',
  },

  // Lens labels (research perspectives)
  'lens.coreMainline': {
    zh: '核心主线',
    en: 'Core Mainline',
  },
  'lens.methodDesign': {
    zh: '方法设计',
    en: 'Method Design',
  },
  'lens.evidenceAudit': {
    zh: '证据审计',
    en: 'Evidence Audit',
  },
  'lens.boundaryFailure': {
    zh: '边界与失败',
    en: 'Boundary and Failure',
  },
  'lens.artifactGrounding': {
    zh: '工件锚定',
    en: 'Artifact Grounding',
  },
  'lens.theoreticalFoundation': {
    zh: '理论基础',
    en: 'Theoretical Foundation',
  },
  'lens.scalabilityEfficiency': {
    zh: '扩展性与效率',
    en: 'Scalability and Efficiency',
  },
  'lens.crossDomainTransfer': {
    zh: '跨域迁移',
    en: 'Cross-Domain Transfer',
  },

  // Research mode labels
  'mode.duration': {
    zh: '持续研究',
    en: 'Continuous Research',
  },
  'mode.stageRounds': {
    zh: '阶段轮次',
    en: 'Stage Rounds',
  },

  // Task status labels
  'status.running': {
    zh: '运行中',
    en: 'Running',
  },
  'status.paused': {
    zh: '已暂停',
    en: 'Paused',
  },
  'status.completed': {
    zh: '已完成',
    en: 'Completed',
  },
  'status.failed': {
    zh: '已中断',
    en: 'Failed',
  },
  'status.pending': {
    zh: '等待中',
    en: 'Pending',
  },

  // Action labels
  'action.discover': {
    zh: '论文发现 + 生成',
    en: 'Paper Discovery + Generation',
  },
  'action.refresh': {
    zh: '刷新内容',
    en: 'Refresh Content',
  },
  'action.sync': {
    zh: '同步状态',
    en: 'Sync Status',
  },

  // Paper status labels
  'paper.status.admitted': {
    zh: '已准入',
    en: 'Admitted',
  },
  'paper.status.candidate': {
    zh: '候选',
    en: 'Candidate',
  },
  'paper.status.rejected': {
    zh: '已拒绝',
    en: 'Rejected',
  },

  // Research metrics
  'metric.discovered': {
    zh: '发现论文',
    en: 'Discovered Papers',
  },
  'metric.admitted': {
    zh: '准入论文',
    en: 'Admitted Papers',
  },
  'metric.generated': {
    zh: '已生成内容',
    en: 'Generated Content',
  },
  'metric.figures': {
    zh: '图表',
    en: 'Figures',
  },
  'metric.tables': {
    zh: '表格',
    en: 'Tables',
  },
  'metric.formulas': {
    zh: '公式',
    en: 'Formulas',
  },

  // Duration labels
  'duration.hours': {
    zh: '小时',
    en: 'hours',
  },
  'duration.days': {
    zh: '天',
    en: 'days',
  },
  'duration.remaining': {
    zh: '剩余时间',
    en: 'Remaining Time',
  },
  'duration.elapsed': {
    zh: '已用时间',
    en: 'Elapsed Time',
  },

  // Stage summary templates
  'summary.stageRun': {
    zh: '第 {stage} 阶段 · 发现 {discovered} · 准入 {admitted} · 生成 {generated}',
    en: 'Stage {stage} · Discovered {discovered} · Admitted {admitted} · Generated {generated}',
  },
  'summary.progressDuration': {
    zh: '持续研究 · {durationHours}h · 第 {currentStage}/{totalStages} 阶段',
    en: 'Continuous research · {durationHours}h · stage {currentStage}/{totalStages}',
  },

  // Research labels
  'research.title': {
    zh: '研究编排',
    en: 'Research Orchestration',
  },
  'research.topic': {
    zh: '主题',
    en: 'Topic',
  },
  'research.node': {
    zh: '节点',
    en: 'Node',
  },
  'research.evidence': {
    zh: '证据',
    en: 'Evidence',
  },
}

export default translations
