import type { TranslationDictionary } from '../types'

const translations: TranslationDictionary = {
  'topic.backHome': {
    zh: '返回首页',
    en: 'Back to Home',
  },
  'node.loading': {
    zh: '正在加载节点...',
    en: 'Loading node...',
  },
  'node.readingTitle': {
    zh: '节点文章',
    en: 'Node article',
  },
  'node.unavailableTitle': {
    zh: '节点暂时不可用',
    en: 'Node unavailable',
  },
  'node.backTopic': {
    zh: '返回主题',
    en: 'Back to Topic',
  },
  'node.articleView': {
    zh: '文章视图',
    en: 'Article View',
  },
  'node.researchView': {
    zh: '研究视图',
    en: 'Research View',
  },
  'node.surfacePaperCount': {
    zh: '{count} 篇论文',
    en: '{count} papers',
  },
  'node.surfaceEvidenceCount': {
    zh: '{count} 个图表与公式',
    en: '{count} figures, tables, and formulas',
  },
  'node.researchHeaderPaperCoverage': {
    zh: '论文覆盖',
    en: 'Paper coverage',
  },
  'node.researchHeaderPaperCoverageDetail': {
    zh: '文章视图和研究视图都只围绕这个节点已经纳入的论文来展开，不再漂离节点边界。',
    en: 'The article and research views stay grounded in every paper folded into this node.',
  },
  'node.researchHeaderEvidenceCoverage': {
    zh: '证据覆盖',
    en: 'Evidence coverage',
  },
  'node.researchHeaderEvidenceCoverageDetail': {
    zh: '图、表和公式会被统一折回到节点判断里，优先保留真正推动论证的证据。',
    en: 'Figures, tables, and formulas are folded back into the node judgment, prioritizing the evidence that actually moves the argument forward.',
  },
  'node.intro.badge': {
    zh: 'I',
    en: 'I',
  },
  'node.intro.title': {
    zh: '节点概览',
    en: 'Node Overview',
  },
  'node.intro.titleEn': {
    zh: 'Node Overview',
    en: 'Node Overview',
  },
  'node.intro.contextLabel': {
    zh: '背景',
    en: 'Context',
  },
  'node.intro.coreQuestionLabel': {
    zh: '核心问题',
    en: 'Core Question',
  },
  'node.synthesis.badge': {
    zh: 'II',
    en: 'II',
  },
  'node.synthesis.title': {
    zh: '综合判断',
    en: 'Synthesis',
  },
  'node.synthesis.titleEn': {
    zh: 'Synthesis',
    en: 'Synthesis',
  },
  'node.synthesis.methodEvolutionLabel': {
    zh: '方法演进',
    en: 'Method Evolution',
  },
  'node.synthesis.insightsLabel': {
    zh: '关键洞见',
    en: 'Key Insights',
  },
  'node.synthesis.comparisonDimension': {
    zh: '比较维度',
    en: 'Dimension',
  },
  'node.critique.title': {
    zh: '批判分析',
    en: 'Critical Analysis',
  },
  'node.paper.background': {
    zh: '\u7814\u7a76\u80cc\u666f',
    en: 'Research Background',
  },
  'node.paper.problem': {
    zh: '\u95ee\u9898\u754c\u5b9a',
    en: 'Problem Definition',
  },
  'node.paper.method': {
    zh: '\u65b9\u6cd5\u89e3\u6790',
    en: 'Methodology',
  },
  'node.paper.experiment': {
    zh: '\u5b9e\u9a8c\u8bbe\u8ba1',
    en: 'Experimental Design',
  },
  'node.paper.results': {
    zh: '\u7ed3\u679c\u5206\u6790',
    en: 'Results Analysis',
  },
  'node.paper.contribution': {
    zh: '\u6838\u5fc3\u8d21\u732e',
    en: 'Key Contributions',
  },
  'node.paper.limitation': {
    zh: '\u5c40\u9650\u4e0e\u8fb9\u754c',
    en: 'Limitations',
  },
  'node.paper.significance': {
    zh: '\u7814\u7a76\u610f\u4e49',
    en: 'Significance',
  },
  'node.paper.conclusion': {
    zh: '\u7ed3\u8bed',
    en: 'Conclusion',
  },
  'node.role.origin': {
    zh: '源头论文',
    en: 'Origin',
  },
  'node.role.milestone': {
    zh: '里程碑论文',
    en: 'Milestone',
  },
  'node.role.branch': {
    zh: '分支论文',
    en: 'Branch',
  },
  'node.role.confluence': {
    zh: '汇流论文',
    en: 'Confluence',
  },
  'node.role.extension': {
    zh: '延展论文',
    en: 'Extension',
  },
  'node.role.baseline': {
    zh: '基线论文',
    en: 'Baseline',
  },
  'node.citations': {
    zh: '被引用 {count} 次',
    en: 'Cited {count} times',
  },
  'node.representativeFigureHint': {
    zh: '\u8fd9\u5f20\u4ee3\u8868\u56fe\u4fdd\u7559\u4e86\u7406\u89e3\u65b9\u6cd5\u7ed3\u6784\u65f6\u6700\u503c\u5f97\u5148\u770b\u7684\u89c6\u89c9\u5165\u53e3\u3002',
    en: 'This representative figure provides the clearest visual entry point into the method while reading the article.',
  },
  'node.whyItMatters': {
    zh: '为什么重要：',
    en: 'Why it matters: ',
  },
  'node.evidenceBoardEyebrow': {
    zh: '证据面板',
    en: 'Evidence Board',
  },
  'node.evidenceTotal': {
    zh: '{count} 条证据',
    en: '{count} evidence items',
  },
  'node.keyEvidenceCount': {
    zh: '{count} 条关键证据',
    en: '{count} key evidence',
  },
  'node.evidenceMore': {
    zh: '还有 {count} 条证据',
    en: '+{count} more evidence items',
  },
  'node.coreJudgmentEyebrow': {
    zh: '核心判断',
    en: 'Core Judgment',
  },
  'node.confidenceBasedOn': {
    zh: '基于当前证据强度',
    en: 'Based on evidence strength',
  },
  'node.problemTreeEyebrow': {
    zh: '问题树',
    en: 'Problem Tree',
  },
  'node.solvedCount': {
    zh: '{count} 个已解决',
    en: '{count} solved',
  },
  'node.partialCount': {
    zh: '{count} 个部分解决',
    en: '{count} partial',
  },
  'node.openCount': {
    zh: '{count} 个未解',
    en: '{count} open',
  },
  'node.openQuestions': {
    zh: '开放问题',
    en: 'Open Questions',
  },
  'node.methodMapEyebrow': {
    zh: '方法地图',
    en: 'Methodology Map',
  },
  'node.methodCount': {
    zh: '对比了 {count} 种方法路线',
    en: '{count} methodologies compared',
  },
  'node.methodEvolution': {
    zh: '方法演进',
    en: 'Method Evolution',
  },
  'node.researchAsideTitle': {
    zh: '节点研究视图',
    en: 'Node research view',
  },
  'node.researchAsideSummary': {
    zh: '这条侧栏直接使用后端返回的判断、证据与问题结构，不再和正文切换混在一起。',
    en: 'This rail reads directly from the backend research contract instead of replacing the article.',
  },
  'workbench.drawerButton': {
    zh: '打开工作台',
    en: 'Open Workbench',
  },
  'workbench.actionNewChat': {
    zh: '新对话',
    en: 'New Chat',
  },
  'workbench.actionHistory': {
    zh: '历史记录',
    en: 'History',
  },
  'workbench.actionCollapse': {
    zh: '收起工作台',
    en: 'Collapse Workbench',
  },
  'workbench.tabAssistant': {
    zh: '助手',
    en: 'Assistant',
  },
  'workbench.tabResearch': {
    zh: '研究',
    en: 'Research',
  },
  'workbench.tabSearch': {
    zh: '搜索',
    en: 'Search',
  },
  'workbench.tabReferences': {
    zh: '参考文献',
    en: 'References',
  },
  'workbench.tabResources': {
    zh: '资料',
    en: 'Resources',
  },
  'workbench.researchWorkspaceSummary': {
    zh: '统一使用这个研究工作台处理搜索、参考文献和上下文，不再和节点正文混在一起。',
    en: 'Use one shared research workspace across the topic map and node article for search, references, and grounded context.',
  },
  'workbench.nodeStageLabel': {
    zh: '阶段 {stage}',
    en: 'Stage {stage}',
  },
  'workbench.nodeExplainPromptTemplate': {
    zh: '把节点“{title}”放回完整主题主线，解释它承担了什么判断。',
    en: 'Put the node "{title}" back into the full topic mainline and explain what judgment it carries.',
  },
  'workbench.nodePapersPromptTemplate': {
    zh: '解释“{title}”下面的论文如何分工，以及哪一篇最关键。',
    en: 'Explain how the papers beneath "{title}" divide the work, and which one is most decisive.',
  },
  'workbench.nodeCritiquePromptTemplate': {
    zh: '从证据和反论证角度质疑节点“{title}”最薄弱的部分。',
    en: 'Question the weakest part of the node "{title}" from the standpoint of evidence and counterargument.',
  },
  'workbench.followUpPromptTemplate': {
    zh: '把“{title}”重新放回当前主题主线，并说明它解决了什么问题。',
    en: 'Put "{title}" back into the current topic mainline and explain what it solves.',
  },
  'workbench.contextIntakeTitle': {
    zh: '上下文入口',
    en: 'Context intake',
  },
  'workbench.contextIntakeHide': {
    zh: '收起',
    en: 'Hide',
  },
  'workbench.contextIntakeShow': {
    zh: '展开',
    en: 'Show',
  },
  'workbench.contextIntakeSummary': {
    zh: '当前阅读焦点和研究上下文会持续保留，不会把对话正文挤满。',
    en: 'Reading focus and research context stay available without taking over the thread.',
  },
  'workbench.emptyCompact': {
    zh: '直接沿着当前主题继续追问，不必重复页面正文。',
    en: 'Use the suggestions below to continue from the current topic without repeating the page body.',
  },
  'workbench.contextCollapsedFocus': {
    zh: '当前焦点：{label}',
    en: 'Current focus: {label}',
  },
  'workbench.contextPinnedEmpty': {
    zh: '暂无固定上下文',
    en: 'No pinned context',
  },
  'workbench.currentFocus': {
    zh: '当前焦点',
    en: 'Current focus',
  },
  'workbench.agentBrief': {
    zh: '引导代理',
    en: 'Guide agent',
  },
  'workbench.agentBriefLabel': {
    zh: '代理说明',
    en: 'Agent brief',
  },
  'workbench.clearBrief': {
    zh: '清空',
    en: 'Clear',
  },
  'workbench.agentBriefPlaceholder': {
    zh: '告诉后端研究代理下一轮应该优先什么、质疑什么、保留什么，或重点验证什么。',
    en: 'Tell the backend agent what to prioritize, challenge, preserve, or verify in the next turns.',
  },
  'workbench.agentBriefHint': {
    zh: '这段说明会进入工作台会话，并可经由 session memory 继承到后续后端研究回合。',
    en: 'This brief is passed to the workbench conversation and can be inherited by later backend turns through session memory.',
  },
  'workbench.materials': {
    zh: '补充材料',
    en: 'Add material',
  },
  'workbench.materialsReady': {
    zh: '材料已就绪',
    en: 'Materials ready',
  },
  'workbench.materialsLabel': {
    zh: '材料',
    en: 'Materials',
  },
  'workbench.addMaterial': {
    zh: '添加文件',
    en: 'Add files',
  },
  'workbench.clearMaterials': {
    zh: '清空材料',
    en: 'Clear',
  },
  'workbench.materialsHint': {
    zh: '可以加入图片、PDF 或文本笔记。图片会作为视觉 grounding，PDF 和笔记会先压缩成供代理使用的上下文。',
    en: 'Drop in figures, PDFs, or text notes. Images are sent as visual grounding, while PDFs and notes are distilled into compact context for the agent.',
  },
  'workbench.removeMaterial': {
    zh: '移除材料',
    en: 'Remove material',
  },
  'workbench.statusParsingMaterial': {
    zh: '正在为后端研究代理整理材料',
    en: 'Preparing material for the backend agent',
  },
  'workbench.statusMemoryReady': {
    zh: '你的说明和材料会在当前线程中持续可见',
    en: 'Your brief and materials will stay visible to this thread',
  },
  'node.evidenceChain.title': {
    zh: '证据链',
    en: 'Evidence Chains',
  },
  'node.evidenceChain.supportingEvidence': {
    zh: '支撑证据',
    en: 'supporting evidence',
  },
  'node.evidenceChain.flow': {
    zh: '证据流向',
    en: 'Evidence Flow',
  },
}

export default translations
