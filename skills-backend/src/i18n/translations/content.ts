/**
 * Content generation templates for bilingual output.
 * Used by editorial agents and content generation services.
 */

import type { TranslationDictionary } from '../index'

const translations: TranslationDictionary = {
  // Article structure labels
  'content.introduction': {
    zh: '引言',
    en: 'Introduction',
  },
  'content.background': {
    zh: '背景',
    en: 'Background',
  },
  'content.methodology': {
    zh: '方法',
    en: 'Methodology',
  },
  'content.results': {
    zh: '结果',
    en: 'Results',
  },
  'content.discussion': {
    zh: '讨论',
    en: 'Discussion',
  },
  'content.conclusion': {
    zh: '结论',
    en: 'Conclusion',
  },
  'content.references': {
    zh: '参考文献',
    en: 'References',
  },
  'content.abstract': {
    zh: '摘要',
    en: 'Abstract',
  },
  'content.summary': {
    zh: '总结',
    en: 'Summary',
  },
  'content.synthesis': {
    zh: '综合分析',
    en: 'Synthesis',
  },
  'content.closing': {
    zh: '结语',
    en: 'Closing',
  },

  // Paper analysis labels
  'content.paperAnalysis': {
    zh: '论文分析',
    en: 'Paper Analysis',
  },
  'content.keyFindings': {
    zh: '关键发现',
    en: 'Key Findings',
  },
  'content.contributions': {
    zh: '主要贡献',
    en: 'Contributions',
  },
  'content.limitations': {
    zh: '局限性',
    en: 'Limitations',
  },
  'content.futureWork': {
    zh: '未来工作',
    en: 'Future Work',
  },

  // Node content labels
  'content.nodeOverview': {
    zh: '节点概述',
    en: 'Node Overview',
  },
  'content.evidenceSummary': {
    zh: '证据摘要',
    en: 'Evidence Summary',
  },
  'content.relatedWork': {
    zh: '相关工作',
    en: 'Related Work',
  },
  'content.implications': {
    zh: '研究启示',
    en: 'Implications',
  },

  // Figure/Table labels
  'content.figure': {
    zh: '图',
    en: 'Figure',
  },
  'content.table': {
    zh: '表',
    en: 'Table',
  },
  'content.formula': {
    zh: '公式',
    en: 'Formula',
  },
  'content.equation': {
    zh: '方程',
    en: 'Equation',
  },
  'content.caption': {
    zh: '标题',
    en: 'Caption',
  },
  'content.source': {
    zh: '来源',
    en: 'Source',
  },

  // Citation labels
  'content.citation': {
    zh: '引用',
    en: 'Citation',
  },
  'content.citedBy': {
    zh: '被引用',
    en: 'Cited by',
  },
  'content.bibliography': {
    zh: '文献目录',
    en: 'Bibliography',
  },

  // Quality indicators
  'content.qualityScore': {
    zh: '质量评分',
    en: 'Quality Score',
  },
  'content.relevanceScore': {
    zh: '相关性评分',
    en: 'Relevance Score',
  },
  'content.confidence': {
    zh: '置信度',
    en: 'Confidence',
  },

  // Generation prompts (for LLM)
  'prompt.generateIntroduction': {
    zh: '请为以下研究主题撰写引言部分，概述研究背景、问题和目标。',
    en: 'Please write an introduction section for the following research topic, outlining the background, problem, and objectives.',
  },
  'prompt.generateSummary': {
    zh: '请总结以下论文的核心贡献、方法和主要发现。',
    en: 'Please summarize the core contributions, methods, and key findings of the following paper.',
  },
  'prompt.generateSynthesis': {
    zh: '请综合分析以下论文集合，提炼共同主题、差异和未来研究方向。',
    en: 'Please synthesize the following collection of papers, extracting common themes, differences, and future research directions.',
  },
  'prompt.analyzeEvidence': {
    zh: '请分析以下证据如何支持或反驳研究假设。',
    en: 'Please analyze how the following evidence supports or refutes the research hypothesis.',
  },
  'prompt.compareMethods': {
    zh: '请比较以下方法的优缺点和适用场景。',
    en: 'Please compare the advantages, disadvantages, and applicable scenarios of the following methods.',
  },

  // Bilingual content markers
  'content.bilingual.primary': {
    zh: '主要语言',
    en: 'Primary Language',
  },
  'content.bilingual.secondary': {
    zh: '次要语言',
    en: 'Secondary Language',
  },
  'content.bilingual.toggle': {
    zh: '切换语言',
    en: 'Toggle Language',
  },

  // Content status
  'content.status.draft': {
    zh: '草稿',
    en: 'Draft',
  },
  'content.status.reviewing': {
    zh: '审核中',
    en: 'Reviewing',
  },
  'content.status.published': {
    zh: '已发布',
    en: 'Published',
  },
  'content.status.archived': {
    zh: '已归档',
    en: 'Archived',
  },

  // Content metadata
  'content.metadata.author': {
    zh: '作者',
    en: 'Author',
  },
  'content.metadata.date': {
    zh: '日期',
    en: 'Date',
  },
  'content.metadata.version': {
    zh: '版本',
    en: 'Version',
  },
  'content.metadata.lastModified': {
    zh: '最后修改',
    en: 'Last Modified',
  },
}

export default translations
