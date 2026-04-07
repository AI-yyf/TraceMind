import type { TranslationDictionary } from '../types'

const translations: TranslationDictionary = {
  'common.loading': { zh: '加载中…', en: 'Loading…' },
  'common.error': { zh: '加载失败', en: 'Load failed' },
  'common.retry': { zh: '重试', en: 'Retry' },
  'common.ok': { zh: '完成', en: 'OK' },
  'common.less': { zh: '收起', en: 'Less' },
  'common.saving': { zh: '保存中', en: 'Saving' },

  'brand.title': { zh: '溯知', en: 'TraceMind' },
  'brand.subtitle': { zh: 'AI 研究工作台', en: 'AI Research Workbench' },
  'brand.tagline': {
    zh: '让研究变成一条可追溯、可沉浸、可持续推进的认知脉络。',
    en: 'Turn research into a traceable line of thought you can revisit, refine, and extend.',
  },

  'nav.home': { zh: '首页', en: 'Home' },
  'nav.topics': { zh: '主题', en: 'Topics' },
  'nav.orchestration': { zh: '编排', en: 'Research' },
  'nav.favorites': { zh: '收藏', en: 'Favorites' },
  'nav.snapshot': { zh: '快照', en: 'Snapshot' },
  'nav.settings': { zh: '设置', en: 'Settings' },
  'nav.search': { zh: '搜索', en: 'Search' },
  'nav.chat': { zh: '对话', en: 'Workbench' },
  'nav.refreshTopic': { zh: '刷新主题', en: 'Refresh topic' },
  'nav.refreshTopicShort': { zh: '刷新', en: 'Refresh' },

  'home.title': { zh: '研究主题', en: 'Research Topics' },
  'home.subtitle': {
    zh: '选择一个主题继续阅读，或创建一个主题开始新的研究主线。',
    en: 'Open a topic to continue reading, or create one to start a new research thread.',
  },
  'home.create': { zh: '创建主题', en: 'Create Topic' },
  'home.empty': {
    zh: '还没有研究主题。先创建一个，让系统开始搭建你的研究地图。',
    en: 'No topics yet. Create one to let the system start building your research map.',
  },

  'language.switchLabel': { zh: '界面语言', en: 'Interface language' },
  'language.modeLabel': { zh: '显示模式', en: 'Display mode' },
  'language.modeMonolingual': { zh: '单语', en: 'Monolingual' },
  'language.modeBilingual': { zh: '双语', en: 'Bilingual' },
  'language.quickChinese': { zh: '中文', en: 'Chinese' },
  'language.quickEnglish': { zh: 'English', en: 'English' },

  'init.title': { zh: '系统初始化', en: 'System Setup' },
  'init.description': {
    zh: '首次使用前，请先确认后端连通、模型可用，并至少创建一个主题。',
    en: 'Before first use, connect the backend, configure at least one model, and create a topic.',
  },
  'init.backendTitle': { zh: '后端服务', en: 'Backend Service' },
  'init.backendReady': { zh: '已连接', en: 'Connected' },
  'init.backendMissing': { zh: '未连接', en: 'Not connected' },
  'init.modelsTitle': { zh: '模型配置', en: 'AI Model Setup' },
  'init.modelsReady': { zh: '已配置', en: 'Configured' },
  'init.modelsMissing': {
    zh: '请至少配置一个语言模型或多模态模型，再开始生成研究内容。',
    en: 'Configure at least one language or multimodal model before generating research content.',
  },
  'init.topicsTitle': { zh: '研究主题', en: 'Research Topics' },
  'init.topicsReady': { zh: '已有主题', en: 'Topics available' },
  'init.topicsMissing': {
    zh: '请先创建至少一个主题，再进入主题页、详情页和研究编排流程。',
    en: 'Create at least one topic before opening topic pages, detail pages, and orchestration flows.',
  },
  'init.goSettings': { zh: '前往设置', en: 'Open settings' },
  'init.goCreate': { zh: '创建主题', en: 'Create topic' },
  'init.recheck': { zh: '重新检查', en: 'Check again' },
  'init.connectionError': {
    zh: '无法连接后端服务，请确认后端正在运行。',
    en: 'Cannot reach the backend service. Please confirm it is running.',
  },

  'workbench.nodeStageLabel': { zh: '阶段 {stage}', en: 'Stage {stage}' },
}

export default translations
