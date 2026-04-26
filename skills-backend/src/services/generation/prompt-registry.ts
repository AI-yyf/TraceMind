import fs from 'node:fs/promises'
import path from 'node:path'

import { prisma } from '../../lib/prisma'
import type { ModelSlot } from '../omni/types'
import {
  listVersionedSystemConfigHistory,
  readVersionedSystemConfig,
  writeVersionedSystemConfig,
  type VersionedSystemConfigHistoryEntry,
  type VersionedSystemConfigMeta,
} from '../system-config-journal'

export const PROMPT_STUDIO_SYSTEM_KEY = 'prompt-studio:runtime:v1'
const PROMPT_TEMPLATE_KEY_PREFIX = 'prompt-studio:template:v1:'
const PRODUCT_COPY_KEY_PREFIX = 'prompt-studio:copy:v1:'
const EXTERNAL_AGENT_ASSET_KEY_PREFIX = 'prompt-studio:external-agent:v1:'

export const PROMPT_LANGUAGES = [
  { code: 'zh', label: '中文', nativeName: '简体中文', isDefault: true },
  { code: 'en', label: 'English', nativeName: 'English', isDefault: false },
  { code: 'ja', label: 'Japanese', nativeName: '日本語', isDefault: false },
  { code: 'ko', label: 'Korean', nativeName: '한국어', isDefault: false },
  { code: 'de', label: 'German', nativeName: 'Deutsch', isDefault: false },
  { code: 'fr', label: 'French', nativeName: 'Français', isDefault: false },
  { code: 'es', label: 'Spanish', nativeName: 'Español', isDefault: false },
  { code: 'ru', label: 'Russian', nativeName: 'Русский', isDefault: false },
] as const

export type PromptLanguage = (typeof PROMPT_LANGUAGES)[number]['code']
export type PromptFamily = 'topic' | 'article' | 'evidence' | 'visual'
export type ProductCopySection =
  | 'brand'
  | 'navigation'
  | 'home'
  | 'create'
  | 'search'
  | 'assistant'
  | 'research'
  | 'reading'
  | 'library'
  | 'management'
  | 'studio'
  | 'topic'

export const PROMPT_TEMPLATE_IDS = {
  TOPIC_PREVIEW: 'topic.preview',
  TOPIC_BLUEPRINT_CORE: 'topic.blueprintCore',
  TOPIC_BLUEPRINT: 'topic.blueprint',
  TOPIC_LOCALIZATION: 'topic.localization',
  TOPIC_LOCALE_PATCH: 'topic.localePatch',
  TOPIC_HERO: 'topic.hero',
  TOPIC_STAGE_TIMELINE: 'topic.stageTimeline',
  TOPIC_NODE_CARD: 'topic.nodeCard',
  TOPIC_CHAT: 'topic.chat',
  TOPIC_SESSION_MEMORY: 'topic.sessionMemory',
  TOPIC_RESEARCH_REPORT: 'topic.researchReport',
  TOPIC_RESEARCH_ORCHESTRATION: 'topic.researchOrchestration',
  TOPIC_CLOSING: 'topic.closing',
  ARTICLE_NODE: 'article.node',
  ARTICLE_PAPER: 'article.paper',
  ARTICLE_CROSS_PAPER: 'article.crossPaper',
  ARTICLE_EVIDENCE: 'article.evidence',
  ARTICLE_REVIEWER: 'article.reviewer',
  VISUAL_BRIEF: 'visual.brief',
  VISUAL_NODE_COVER: 'visual.nodeCover',
} as const

export type PromptTemplateId = (typeof PROMPT_TEMPLATE_IDS)[keyof typeof PROMPT_TEMPLATE_IDS]

export const PRODUCT_COPY_IDS = {
  BRAND_TITLE: 'brand.title',
  BRAND_SUBTITLE: 'brand.subtitle',
  NAV_HOME: 'nav.home',
  NAV_ORCHESTRATION: 'nav.orchestration',
  NAV_FAVORITES: 'nav.favorites',
  NAV_SNAPSHOT: 'nav.snapshot',
  NAV_SETTINGS: 'nav.settings',
  NAV_SEARCH: 'nav.search',
  NAV_CHAT: 'nav.chat',
  NAV_TOPICS: 'nav.topics',
  NAV_REFRESH_TOPIC: 'nav.refreshTopic',
  NAV_REFRESH_TOPIC_SHORT: 'nav.refreshTopicShort',
  APP_LOADING: 'app.loading',
  HOME_HERO_TAGLINE: 'home.heroTagline',
  HOME_HERO_MISSION: 'home.heroMission',
  HOME_TOPICS_EYEBROW: 'home.topicsEyebrow',
  HOME_TOPICS_TITLE: 'home.topicsTitle',
  HOME_TOPICS_EMPTY: 'home.topicsEmpty',
  HOME_CREATE_BUTTON: 'home.createButton',
  CREATE_TITLE: 'create.title',
  CREATE_DESCRIPTION: 'create.description',
  CREATE_DESCRIPTION_LABEL: 'create.descriptionLabel',
  CREATE_DESCRIPTION_PLACEHOLDER: 'create.descriptionPlaceholder',
  CREATE_ENGLISH_LABEL: 'create.englishLabel',
  CREATE_ENGLISH_PLACEHOLDER: 'create.englishPlaceholder',
  CREATE_CLOSE: 'create.close',
  CREATE_GLOBAL_CONFIG_NOTE: 'create.globalConfigNote',
  CREATE_PREVIEW_EMPTY: 'create.previewEmpty',
  CREATE_PREVIEW_BUTTON: 'create.previewButton',
  CREATE_PREVIEW_LOADING: 'create.previewLoading',
  CREATE_PREVIEW_TITLE: 'create.previewTitle',
  CREATE_SAVE_BUTTON: 'create.saveButton',
  CREATE_SAVE_LOADING: 'create.saveLoading',
  CREATE_SUMMARY_TITLE: 'create.summaryTitle',
  CREATE_KEYWORDS_TITLE: 'create.keywordsTitle',
  CREATE_FOCUS_TITLE: 'create.focusTitle',
  CREATE_STAGE_COUNT_TITLE: 'create.stageCountTitle',
  CREATE_LANGUAGE_OPTION_ZH: 'create.languageOption.zh',
  CREATE_LANGUAGE_OPTION_EN: 'create.languageOption.en',
  CREATE_LANGUAGE_OPTION_JA: 'create.languageOption.ja',
  CREATE_LANGUAGE_OPTION_KO: 'create.languageOption.ko',
  CREATE_LANGUAGE_OPTION_DE: 'create.languageOption.de',
  CREATE_LANGUAGE_OPTION_FR: 'create.languageOption.fr',
  CREATE_LANGUAGE_OPTION_ES: 'create.languageOption.es',
  CREATE_LANGUAGE_OPTION_RU: 'create.languageOption.ru',
  CREATE_LANGUAGE_LEGACY_TITLE: 'create.languageLegacyTitle',
  CREATE_LANGUAGE_LEGACY_DESCRIPTION: 'create.languageLegacyDescription',
  CREATE_NATIVE_EIGHT_LANGUAGES: 'create.nativeEightLanguages',
  CREATE_MODEL_READY: 'create.modelReady',
  CREATE_MODEL_MISSING: 'create.modelMissing',
  CREATE_COMPATIBLE_HINT: 'create.compatibleHint',
  CREATE_PREVIEW_FAILED: 'create.previewFailed',
  CREATE_SAVE_FAILED: 'create.saveFailed',
  SEARCH_TITLE: 'search.title',
  SEARCH_DESCRIPTION: 'search.description',
  SEARCH_PLACEHOLDER: 'search.placeholder',
  SEARCH_CLOSE: 'search.close',
  SEARCH_CLEAR: 'search.clear',
  SEARCH_RECENT_TITLE: 'search.recentTitle',
  SEARCH_RECENT_EMPTY: 'search.recentEmpty',
  SEARCH_RECOMMEND_TITLE: 'search.recommendTitle',
  SEARCH_EMPTY: 'search.empty',
  SEARCH_IDLE: 'search.idle',
  SEARCH_ALL_TOPICS: 'search.allTopics',
  SEARCH_RESULTS_LABEL: 'search.resultsLabel',
  SEARCH_OPEN_ACTION: 'search.openAction',
  SEARCH_CONTEXT_ACTION: 'search.contextAction',
  SEARCH_FOLLOW_UP_ACTION: 'search.followUpAction',
  SEARCH_KEYBOARD_HINT: 'search.keyboardHint',
  SEARCH_HINT_LOCATE: 'search.hintLocate',
  SEARCH_HINT_CONTEXT: 'search.hintContext',
  SEARCH_HINT_FILTER: 'search.hintFilter',
  SEARCH_TOPIC_PLACEHOLDER: 'search.topicPlaceholder',
  SEARCH_TOPIC_DESCRIPTION: 'search.topicDescription',
  ASSISTANT_TITLE: 'assistant.title',
  ASSISTANT_EMPTY: 'assistant.empty',
  ASSISTANT_CAPABILITY_LINE: 'assistant.capabilityLine',
  ASSISTANT_INPUT_PLACEHOLDER: 'assistant.inputPlaceholder',
  ASSISTANT_DRAWER_BUTTON: 'assistant.drawerButton',
  ASSISTANT_STARTER_PROMPT: 'assistant.starterPrompt',
  ASSISTANT_ACTION_NEW_CHAT: 'assistant.actionNewChat',
  ASSISTANT_ACTION_HISTORY: 'assistant.actionHistory',
  ASSISTANT_ACTION_MODEL: 'assistant.actionModel',
  ASSISTANT_ACTION_COLLAPSE: 'assistant.actionCollapse',
  ASSISTANT_TAB_ASSISTANT: 'assistant.tabAssistant',
  ASSISTANT_TAB_SIMILAR: 'assistant.tabSimilar',
  ASSISTANT_TAB_RESOURCES: 'assistant.tabResources',
  ASSISTANT_CONTEXT_LABEL: 'assistant.contextLabel',
  ASSISTANT_CONTEXT_TITLE: 'assistant.contextTitle',
  ASSISTANT_CONTEXT_EMPTY: 'assistant.contextEmpty',
  ASSISTANT_EVIDENCE_TITLE: 'assistant.evidenceTitle',
  ASSISTANT_RESOURCES_TITLE: 'assistant.resourcesTitle',
  ASSISTANT_CAPTURE_SELECTION: 'assistant.captureSelection',
  ASSISTANT_SEARCH_TOGGLE: 'assistant.searchToggle',
  ASSISTANT_THINKING_TOGGLE: 'assistant.thinkingToggle',
  ASSISTANT_STYLE_BRIEF: 'assistant.styleBrief',
  ASSISTANT_STYLE_BALANCED: 'assistant.styleBalanced',
  ASSISTANT_STYLE_DEEP: 'assistant.styleDeep',
  ASSISTANT_STATUS_WORKING: 'assistant.statusWorking',
  ASSISTANT_STATUS_READY: 'assistant.statusReady',
  ASSISTANT_SEND: 'assistant.send',
  ASSISTANT_MODEL_READY: 'assistant.modelReady',
  ASSISTANT_MODEL_PARTIAL: 'assistant.modelPartial',
  ASSISTANT_MODEL_MISSING: 'assistant.modelMissing',
  ASSISTANT_REQUEST_FAILED: 'assistant.requestFailed',
  ASSISTANT_TAB_NOTES: 'assistant.tabNotes',
  ASSISTANT_CALIBRATION_EYEBROW: 'assistant.calibrationEyebrow',
  ASSISTANT_CALIBRATION_CONTRACT: 'assistant.calibrationContract',
  ASSISTANT_CALIBRATION_APPLYING_NEXT: 'assistant.calibrationApplyingNext',
  ASSISTANT_CALIBRATION_PRESERVE: 'assistant.calibrationPreserve',
  ASSISTANT_CALIBRATION_ADJUST: 'assistant.calibrationAdjust',
  ASSISTANT_GUIDANCE_EYEBROW: 'assistant.guidanceEyebrow',
  ASSISTANT_GUIDANCE_DEK: 'assistant.guidanceDek',
  ASSISTANT_GUIDANCE_ACTIVE_COUNT: 'assistant.guidanceActiveCount',
  ASSISTANT_GUIDANCE_EMPTY_TITLE: 'assistant.guidanceEmptyTitle',
  ASSISTANT_GUIDANCE_EMPTY_DEK: 'assistant.guidanceEmptyDek',
  ASSISTANT_GUIDANCE_LATEST_DEK: 'assistant.guidanceLatestDek',
  ASSISTANT_GUIDANCE_STAT_ACCEPTED: 'assistant.guidanceStatAccepted',
  ASSISTANT_GUIDANCE_STAT_DEFERRED: 'assistant.guidanceStatDeferred',
  ASSISTANT_GUIDANCE_STAT_TRACKED: 'assistant.guidanceStatTracked',
  ASSISTANT_GUIDANCE_PROMPT_CTA: 'assistant.guidancePromptCta',
  ASSISTANT_WORLD_EYEBROW: 'assistant.worldEyebrow',
  ASSISTANT_WORLD_CONTINUITY: 'assistant.worldContinuity',
  ASSISTANT_WORLD_STAGE_COUNT: 'assistant.worldStageCount',
  ASSISTANT_WORLD_NODE_COUNT: 'assistant.worldNodeCount',
  ASSISTANT_WORLD_PAPER_COUNT: 'assistant.worldPaperCount',
  ASSISTANT_WORLD_AGENDA: 'assistant.worldAgenda',
  ASSISTANT_WORLD_CLAIMS: 'assistant.worldClaims',
  ASSISTANT_WORLD_TENSIONS: 'assistant.worldTensions',
  ASSISTANT_NOTES_TITLE: 'assistant.notesTitle',
  ASSISTANT_NOTES_DESCRIPTION: 'assistant.notesDescription',
  ASSISTANT_NOTES_COUNT: 'assistant.notesCount',
  ASSISTANT_NOTES_EMPTY: 'assistant.notesEmpty',
  ASSISTANT_NOTES_LAST_SAVED: 'assistant.notesLastSaved',
  ASSISTANT_NOTES_RECENT: 'assistant.notesRecent',
  ASSISTANT_NOTES_UNTITLED: 'assistant.notesUntitled',
  ASSISTANT_OPEN_NOTE_SOURCE: 'assistant.openNoteSource',
  ASSISTANT_OPEN_NOTEBOOK: 'assistant.openNotebook',
  ASSISTANT_CAPTURE_ANSWER: 'assistant.captureAnswer',
  ASSISTANT_CAPTURE_EVIDENCE: 'assistant.captureEvidence',
  ASSISTANT_EXPORT_DOSSIER: 'assistant.exportDossier',
  ASSISTANT_EXPORT_DOSSIER_FAILED: 'assistant.exportDossierFailed',
  ASSISTANT_EXPORT_HIGHLIGHTS: 'assistant.exportHighlights',
  ASSISTANT_EXPORT_MARKDOWN: 'assistant.exportMarkdown',
  ASSISTANT_EXPORT_JSON: 'assistant.exportJson',
  ASSISTANT_RESEARCH_TITLE: 'assistant.researchTitle',
  ASSISTANT_RESEARCH_EYEBROW: 'assistant.researchEyebrow',
  ASSISTANT_RESEARCH_DEK: 'assistant.researchDek',
  ASSISTANT_RESEARCH_DURATION_LABEL: 'assistant.researchDurationLabel',
  ASSISTANT_RESEARCH_DURATION_UNIT: 'assistant.researchDurationUnit',
  ASSISTANT_RESEARCH_STAT_DISCOVERED: 'assistant.researchStatDiscovered',
  ASSISTANT_RESEARCH_STAT_ADMITTED: 'assistant.researchStatAdmitted',
  ASSISTANT_RESEARCH_STAT_GENERATED: 'assistant.researchStatGenerated',
  ASSISTANT_RESEARCH_START: 'assistant.researchStart',
  ASSISTANT_RESEARCH_STARTING: 'assistant.researchStarting',
  ASSISTANT_RESEARCH_STOP: 'assistant.researchStop',
  ASSISTANT_RESEARCH_STOP_PENDING: 'assistant.researchStopPending',
  ASSISTANT_RESEARCH_STATUS_RUNNING: 'assistant.researchStatusRunning',
  ASSISTANT_RESEARCH_STATUS_PAUSED: 'assistant.researchStatusPaused',
  ASSISTANT_RESEARCH_STATUS_IDLE: 'assistant.researchStatusIdle',
  ASSISTANT_RESEARCH_STATUS_COMPLETED: 'assistant.researchStatusCompleted',
  ASSISTANT_RESEARCH_STATUS_FAILED: 'assistant.researchStatusFailed',
  ASSISTANT_RESEARCH_STATUS_STOPPING: 'assistant.researchStatusStopping',
  ASSISTANT_RESEARCH_RUNNING_HINT: 'assistant.researchRunningHint',
  ASSISTANT_RESEARCH_STOPPING_HINT: 'assistant.researchStoppingHint',
  ASSISTANT_RESEARCH_IDLE_HINT: 'assistant.researchIdleHint',
  ASSISTANT_RESEARCH_KEY_MOVES: 'assistant.researchKeyMoves',
  ASSISTANT_RESEARCH_OPEN_QUESTIONS: 'assistant.researchOpenQuestions',
  ASSISTANT_RESEARCH_RECEIPT_TOGGLE: 'assistant.researchReceiptToggle',
  ASSISTANT_RESEARCH_DECISION_EYEBROW: 'assistant.researchDecisionEyebrow',
  ASSISTANT_RESEARCH_DECISION_ADVANCE: 'assistant.researchDecisionAdvance',
  ASSISTANT_RESEARCH_DECISION_CYCLE_RESET: 'assistant.researchDecisionCycleReset',
  ASSISTANT_RESEARCH_DECISION_STAY: 'assistant.researchDecisionStay',
  ASSISTANT_RESEARCH_DECISION_REASON_PROGRESS_MADE: 'assistant.researchDecisionReasonProgressMade',
  ASSISTANT_RESEARCH_DECISION_REASON_AWAIT_EVIDENCE: 'assistant.researchDecisionReasonAwaitEvidence',
  ASSISTANT_RESEARCH_DECISION_REASON_ORCHESTRATION: 'assistant.researchDecisionReasonOrchestration',
  ASSISTANT_RESEARCH_DECISION_REASON_STALL_LIMIT: 'assistant.researchDecisionReasonStallLimit',
  RESEARCH_TITLE: 'research.title',
  RESEARCH_DESCRIPTION: 'research.description',
  RESEARCH_CREATE_TITLE: 'research.createTitle',
  RESEARCH_TASKS_TITLE: 'research.tasksTitle',
  RESEARCH_EMPTY: 'research.empty',
  RESEARCH_LOADING: 'research.loading',
  RESEARCH_CREATE_BUTTON: 'research.createButton',
  RESEARCH_SETTINGS_BUTTON: 'research.settingsButton',
  RESEARCH_WINDOW_EYEBROW: 'research.windowEyebrow',
  RESEARCH_FREQUENCY_LABEL: 'research.frequencyLabel',
  RESEARCH_ACTION_LABEL: 'research.actionLabel',
  RESEARCH_ACTION_DISCOVER: 'research.actionDiscover',
  RESEARCH_ACTION_REFRESH: 'research.actionRefresh',
  RESEARCH_ACTION_SYNC: 'research.actionSync',
  RESEARCH_STAGE_ROUNDS_LABEL: 'research.stageRoundsLabel',
  RESEARCH_SNAPSHOT_TITLE: 'research.snapshotTitle',
  RESEARCH_TASK_COUNT_LABEL: 'research.taskCountLabel',
  RESEARCH_ACTIVE_COUNT_LABEL: 'research.activeCountLabel',
  RESEARCH_TOPIC_COUNT_LABEL: 'research.topicCountLabel',
  RESEARCH_SELECTION_TITLE: 'research.selectionTitle',
  RESEARCH_SELECTION_READY: 'research.selectionReady',
  RESEARCH_SELECTION_EMPTY: 'research.selectionEmpty',
  RESEARCH_TASKS_EYEBROW: 'research.tasksEyebrow',
  RESEARCH_GLOBAL_TASK: 'research.globalTask',
  RESEARCH_STATUS_RUNNING: 'research.statusRunning',
  RESEARCH_STATUS_PAUSED: 'research.statusPaused',
  RESEARCH_RUN_BUTTON: 'research.runButton',
  RESEARCH_PAUSE_BUTTON: 'research.pauseButton',
  RESEARCH_RESUME_BUTTON: 'research.resumeButton',
  RESEARCH_RESET_BUTTON: 'research.resetButton',
  RESEARCH_DELETE_BUTTON: 'research.deleteButton',
  RESEARCH_DETAIL_EYEBROW: 'research.detailEyebrow',
  RESEARCH_DETAIL_EMPTY_TITLE: 'research.detailEmptyTitle',
  RESEARCH_DETAIL_EMPTY: 'research.detailEmpty',
  RESEARCH_DETAIL_STAGE_LABEL: 'research.detailStageLabel',
  RESEARCH_DETAIL_PROGRESS_LABEL: 'research.detailProgressLabel',
  RESEARCH_DETAIL_DISCOVERED_LABEL: 'research.detailDiscoveredLabel',
  RESEARCH_DETAIL_GENERATED_LABEL: 'research.detailGeneratedLabel',
  RESEARCH_NOTICE_SELECT_TOPIC: 'research.noticeSelectTopic',
  RESEARCH_NOTICE_CREATED: 'research.noticeCreated',
  RESEARCH_NOTICE_CREATE_FAILED: 'research.noticeCreateFailed',
  RESEARCH_WAITING_FIRST_RUN: 'research.waitingFirstRun',
  RESEARCH_STAGE_LABEL_TEMPLATE: 'research.stageLabelTemplate',
  RESEARCH_PROGRESS_SUMMARY: 'research.progressSummary',
  RESEARCH_RUN_SUMMARY: 'research.runSummary',
  READING_BACK_HOME: 'reading.backHome',
  READING_BACK_TOPIC: 'reading.backTopic',
  READING_NODE_LOADING: 'reading.nodeLoading',
  READING_NODE_LOADING_TITLE: 'reading.nodeLoadingTitle',
  READING_NODE_UNAVAILABLE_TITLE: 'reading.nodeUnavailableTitle',
  READING_PAPER_LOADING: 'reading.paperLoading',
  READING_PAPER_LOADING_TITLE: 'reading.paperLoadingTitle',
  READING_PAPER_UNAVAILABLE_TITLE: 'reading.paperUnavailableTitle',
  READING_OPEN_PAPER: 'reading.openPaper',
  READING_WHY_IT_MATTERS: 'reading.whyItMatters',
  TODAY_EYEBROW: 'today.eyebrow',
  TODAY_TITLE: 'today.title',
  TODAY_DESCRIPTION: 'today.description',
  TODAY_LOADING: 'today.loading',
  TODAY_EMPTY: 'today.empty',
  TODAY_CARD_EYEBROW: 'today.cardEyebrow',
  TODAY_STAGE_LABEL: 'today.stageLabel',
  TODAY_STAGE_UNIT: 'today.stageUnit',
  TODAY_NODE_UNIT: 'today.nodeUnit',
  TODAY_NO_NODE: 'today.noNode',
  TODAY_OPEN_NODE: 'today.openNode',
  TODAY_OPEN_TOPIC: 'today.openTopic',
  FAVORITES_EYEBROW: 'favorites.eyebrow',
  FAVORITES_TITLE: 'favorites.title',
  FAVORITES_DESCRIPTION: 'favorites.description',
  FAVORITES_EMPTY: 'favorites.empty',
  FAVORITES_BACK_HOME: 'favorites.backHome',
  FAVORITES_EXPORT: 'favorites.export',
  FAVORITES_OPEN_PAPER: 'favorites.openPaper',
  FAVORITES_REMOVE: 'favorites.remove',
  FAVORITES_TOPIC_LABEL: 'favorites.topicLabel',
  FAVORITES_GENERAL_LABEL: 'favorites.generalLabel',
  MANAGE_BACK_HOME: 'manage.backHome',
  MANAGE_CREATE_ON_HOME: 'manage.createOnHome',
  MANAGE_EYEBROW: 'manage.eyebrow',
  MANAGE_TITLE: 'manage.title',
  MANAGE_DESCRIPTION: 'manage.description',
  MANAGE_EMPTY: 'manage.empty',
  MANAGE_OPEN: 'manage.open',
  MANAGE_DELETE: 'manage.delete',
  MANAGE_CONFIRM_DELETE: 'manage.confirmDelete',
  MANAGE_PAPER_UNIT: 'manage.paperUnit',
  MANAGE_NODE_UNIT: 'manage.nodeUnit',
  STUDIO_TITLE: 'studio.title',
  STUDIO_DESCRIPTION: 'studio.description',
  STUDIO_EYEBROW: 'studio.eyebrow',
  STUDIO_TAB_MODELS: 'studio.tabModels',
  STUDIO_TAB_PIPELINE: 'studio.tabPipeline',
  STUDIO_TAB_PROMPTS: 'studio.tabPrompts',
  STUDIO_TAB_COPY: 'studio.tabCopy',
  STUDIO_TAB_AGENTS: 'studio.tabAgents',
  STUDIO_STAT_LANGUAGE: 'studio.statLanguage',
  STUDIO_STAT_MULTIMODAL: 'studio.statMultimodal',
  STUDIO_STAT_PROMPTS: 'studio.statPrompts',
  STUDIO_STAT_COPY: 'studio.statCopy',
  STUDIO_UNCONFIGURED: 'studio.unconfigured',
  STUDIO_TEMPLATE_UNIT: 'studio.templateUnit',
  STUDIO_COPY_UNIT: 'studio.copyUnit',
  STUDIO_LOADING: 'studio.loading',
  STUDIO_LANGUAGE_EDITOR_LABEL: 'studio.languageEditorLabel',
  STUDIO_FAMILY_TOPIC: 'studio.family.topic',
  STUDIO_FAMILY_ARTICLE: 'studio.family.article',
  STUDIO_FAMILY_EVIDENCE: 'studio.family.evidence',
  STUDIO_FAMILY_VISUAL: 'studio.family.visual',
  STUDIO_SECTION_BRAND: 'studio.section.brand',
  STUDIO_SECTION_NAVIGATION: 'studio.section.navigation',
  STUDIO_SECTION_HOME: 'studio.section.home',
  STUDIO_SECTION_CREATE: 'studio.section.create',
  STUDIO_SECTION_SEARCH: 'studio.section.search',
  STUDIO_SECTION_ASSISTANT: 'studio.section.assistant',
  STUDIO_SECTION_RESEARCH: 'studio.section.research',
  STUDIO_SECTION_READING: 'studio.section.reading',
  STUDIO_SECTION_LIBRARY: 'studio.section.library',
  STUDIO_SECTION_MANAGEMENT: 'studio.section.management',
  STUDIO_SECTION_STUDIO: 'studio.section.studio',
  STUDIO_SECTION_TOPIC: 'studio.section.topic',
  STUDIO_POLICY_IDENTITY: 'studio.policy.identity',
  STUDIO_POLICY_MISSION: 'studio.policy.mission',
  STUDIO_POLICY_REASONING: 'studio.policy.reasoning',
  STUDIO_POLICY_STYLE: 'studio.policy.style',
  STUDIO_POLICY_EVIDENCE: 'studio.policy.evidence',
  STUDIO_POLICY_INDUSTRY_LENS: 'studio.policy.industryLens',
  STUDIO_POLICY_CONTINUITY: 'studio.policy.continuity',
  STUDIO_POLICY_REFINEMENT: 'studio.policy.refinement',
  STUDIO_NOTICE_MODEL_UNAVAILABLE_TITLE: 'studio.notice.modelUnavailableTitle',
  STUDIO_NOTICE_MODEL_UNAVAILABLE_MESSAGE: 'studio.notice.modelUnavailableMessage',
  STUDIO_NOTICE_MODELS_SAVED: 'studio.notice.modelsSaved',
  STUDIO_NOTICE_MODELS_SAVE_FAILED_TITLE: 'studio.notice.modelsSaveFailedTitle',
  STUDIO_NOTICE_MODELS_SAVE_FAILED_MESSAGE: 'studio.notice.modelsSaveFailedMessage',
  STUDIO_NOTICE_RUNTIME_SAVED: 'studio.notice.runtimeSaved',
  STUDIO_NOTICE_RUNTIME_SAVE_FAILED: 'studio.notice.runtimeSaveFailed',
  STUDIO_NOTICE_PROMPTS_SAVED: 'studio.notice.promptsSaved',
  STUDIO_NOTICE_PROMPTS_SAVE_FAILED: 'studio.notice.promptsSaveFailed',
  STUDIO_NOTICE_COPY_SAVED: 'studio.notice.copySaved',
  STUDIO_NOTICE_COPY_SAVE_FAILED: 'studio.notice.copySaveFailed',
  STUDIO_NOTICE_TEMPLATE_RESET: 'studio.notice.templateReset',
  STUDIO_NOTICE_COPY_RESET: 'studio.notice.copyReset',
  STUDIO_NOTICE_LANGUAGE_RESET: 'studio.notice.languageReset',
  STUDIO_NOTICE_IMPORTED: 'studio.notice.imported',
  STUDIO_MODELS_LANGUAGE_TITLE: 'studio.models.languageTitle',
  STUDIO_MODELS_LANGUAGE_DESC: 'studio.models.languageDesc',
  STUDIO_MODELS_MULTIMODAL_TITLE: 'studio.models.multimodalTitle',
  STUDIO_MODELS_MULTIMODAL_DESC: 'studio.models.multimodalDesc',
  STUDIO_MODELS_SAVE: 'studio.models.save',
  STUDIO_MODELS_REFRESH: 'studio.models.refresh',
  STUDIO_MODELS_SAVED_KEY: 'studio.models.savedKey',
  STUDIO_MODELS_PROVIDER_PLACEHOLDER: 'studio.models.providerPlaceholder',
  STUDIO_MODELS_MODEL_PLACEHOLDER: 'studio.models.modelPlaceholder',
  STUDIO_MODELS_CUSTOM_MODEL_PLACEHOLDER: 'studio.models.customModelPlaceholder',
  STUDIO_MODELS_BASE_URL_PLACEHOLDER: 'studio.models.baseUrlPlaceholder',
  STUDIO_MODELS_API_KEY_PLACEHOLDER: 'studio.models.apiKeyPlaceholder',
  STUDIO_PIPELINE_TITLE: 'studio.pipeline.title',
  STUDIO_PIPELINE_DESC: 'studio.pipeline.desc',
  STUDIO_PIPELINE_DEFAULT_LANGUAGE: 'studio.pipeline.defaultLanguage',
  STUDIO_PIPELINE_MAX_RETRIES: 'studio.pipeline.maxRetriesPerPass',
  STUDIO_PIPELINE_STAGE_NAMING: 'studio.pipeline.stageNamingPasses',
  STUDIO_PIPELINE_NODE_ARTICLE: 'studio.pipeline.nodeArticlePasses',
  STUDIO_PIPELINE_PAPER_ARTICLE: 'studio.pipeline.paperArticlePasses',
  STUDIO_PIPELINE_SELF_REFINE: 'studio.pipeline.selfRefinePasses',
  STUDIO_PIPELINE_MAX_EVIDENCE: 'studio.pipeline.maxEvidencePerArticle',
  STUDIO_PIPELINE_STAGE_WINDOW: 'studio.pipeline.contextWindowStages',
  STUDIO_PIPELINE_NODE_WINDOW: 'studio.pipeline.contextWindowNodes',
  STUDIO_PIPELINE_LANGUAGE_TEMPERATURE: 'studio.pipeline.languageTemperature',
  STUDIO_PIPELINE_MULTIMODAL_TEMPERATURE: 'studio.pipeline.multimodalTemperature',
  STUDIO_PIPELINE_CACHE_OUTPUTS: 'studio.pipeline.cacheGeneratedOutputs',
  STUDIO_PIPELINE_USE_TOPIC_MEMORY: 'studio.pipeline.useTopicMemory',
  STUDIO_PIPELINE_USE_PREVIOUS_OUTPUTS: 'studio.pipeline.usePreviousPassOutputs',
  STUDIO_PIPELINE_PREFER_MULTIMODAL: 'studio.pipeline.preferMultimodalEvidence',
  STUDIO_PIPELINE_POLICY_TITLE: 'studio.pipeline.policyTitle',
  STUDIO_PIPELINE_POLICY_DESC: 'studio.pipeline.policyDesc',
  STUDIO_PIPELINE_SAVE: 'studio.pipeline.save',
  STUDIO_PROMPTS_EXPORT: 'studio.prompts.export',
  STUDIO_PROMPTS_IMPORT: 'studio.prompts.import',
  STUDIO_PROMPTS_RESET_LANGUAGE: 'studio.prompts.resetLanguage',
  STUDIO_PROMPTS_SAVE: 'studio.prompts.save',
  STUDIO_PROMPTS_RESET_ITEM: 'studio.prompts.resetItem',
  STUDIO_COPY_RESET_LANGUAGE: 'studio.copy.resetLanguage',
  STUDIO_COPY_SAVE: 'studio.copy.save',
  STUDIO_COPY_DESC: 'studio.copy.desc',
  STUDIO_COPY_RESET_ITEM: 'studio.copy.resetItem',
  STUDIO_AGENTS_TITLE: 'studio.agents.title',
  STUDIO_AGENTS_DESC: 'studio.agents.desc',
  STUDIO_AGENTS_PROMPT_GUIDE: 'studio.agents.promptGuide',
  STUDIO_AGENTS_CONFIG_EXAMPLE: 'studio.agents.configExample',
  STUDIO_AGENTS_USAGE_TITLE: 'studio.agents.usageTitle',
  STUDIO_AGENTS_USAGE_DESC: 'studio.agents.usageDesc',
  STUDIO_AGENTS_README_ACTION: 'studio.agents.readmeAction',
  STUDIO_AGENTS_PROMPT_GUIDE_ACTION: 'studio.agents.promptGuideAction',
  STUDIO_AGENTS_CONFIG_ACTION: 'studio.agents.configAction',
  TOPIC_BACK_HOME: 'topic.backHome',
  TOPIC_LOADING: 'topic.loading',
  TOPIC_UNAVAILABLE: 'topic.unavailable',
  TOPIC_BADGE_MAINLINE: 'topic.badgeMainline',
  TOPIC_BADGE_MERGE: 'topic.badgeMerge',
  TOPIC_BADGE_BRANCH: 'topic.badgeBranch',
  TOPIC_ADD_CONTEXT: 'topic.addContext',
} as const

export type ProductCopyId = (typeof PRODUCT_COPY_IDS)[keyof typeof PRODUCT_COPY_IDS]

export const EXTERNAL_AGENT_ASSET_IDS = {
  README: 'readme',
  PROMPT_GUIDE: 'promptGuide',
  SUPER_PROMPT: 'superPrompt',
  CONFIG_EXAMPLE: 'configExample',
} as const

export type ExternalAgentAssetId =
  (typeof EXTERNAL_AGENT_ASSET_IDS)[keyof typeof EXTERNAL_AGENT_ASSET_IDS]

export interface PromptTemplateContent {
  system: string
  user: string
  notes: string
}

export interface PromptTemplateDefinition {
  id: PromptTemplateId
  family: PromptFamily
  title: string
  description: string
  slot: ModelSlot
  order: number
  tags: string[]
  languageContents: Record<PromptLanguage, PromptTemplateContent>
}

export interface PromptTemplateRecord extends PromptTemplateDefinition {
  builtIn: boolean
}

export interface ProductCopyDefinition {
  id: ProductCopyId
  section: ProductCopySection
  title: string
  description: string
  order: number
  multiline: boolean
  languageContents: Record<PromptLanguage, string>
}

export interface ProductCopyRecord extends ProductCopyDefinition {
  builtIn: boolean
}

export interface PromptTemplatePatch {
  id: PromptTemplateId
  languageContents: Partial<Record<PromptLanguage, Partial<PromptTemplateContent>>>
}

export interface ProductCopyPatch {
  id: ProductCopyId
  languageContents: Partial<Record<PromptLanguage, string>>
}

export interface ExternalAgentAssetDefinition {
  id: ExternalAgentAssetId
  title: string
  description: string
  pathSegments: string[]
  format: 'markdown' | 'json'
}

export interface ExternalAgentAssetRecord extends ExternalAgentAssetDefinition {
  builtIn: boolean
  path: string
  content: string
}

export interface ExternalAgentAssetPatch {
  id: ExternalAgentAssetId
  content: string
}

export interface GenerationRuntimeConfig {
  defaultLanguage: PromptLanguage
  cacheGeneratedOutputs: boolean
  contextAwareCacheReuse: boolean
  staleContextRefinePasses: number
  useTopicMemory: boolean
  usePreviousPassOutputs: boolean
  preferMultimodalEvidence: boolean
  maxRetriesPerPass: number
  topicPreviewPasses: number
  topicBlueprintPasses: number
  topicLocalizationPasses: number
  topicChatPasses: number
  stageNamingPasses: number
  nodeArticlePasses: number
  paperArticlePasses: number
  selfRefinePasses: number
  researchOrchestrationPasses: number
  researchReportPasses: number
  researchCycleDelayMs: number
  researchStageStallLimit: number
  researchStagePaperLimit: number
  researchArtifactRebuildLimit: number
  nodeCardFigureCandidateLimit: number
  topicSessionMemoryEnabled: boolean
  topicSessionMemoryInitEventCount: number
  topicSessionMemoryChatTurnsBetweenCompaction: number
  topicSessionMemoryResearchCyclesBetweenCompaction: number
  topicSessionMemoryTokenThreshold: number
  topicSessionMemoryRecentEventLimit: number
  topicSessionMemoryRecallEnabled: boolean
  topicSessionMemoryRecallLimit: number
  topicSessionMemoryRecallLookbackLimit: number
  topicSessionMemoryRecallRecencyBias: number
  languageTemperature: number
  multimodalTemperature: number
  maxEvidencePerArticle: number
  contextWindowStages: number
  contextWindowNodes: number
  unlimitedMemoryMode: boolean
  editorialPolicies: Record<PromptLanguage, GenerationEditorialPolicy>
}

export interface GenerationEditorialPolicy {
  identity: string
  mission: string
  reasoning: string
  style: string
  evidence: string
  industryLens: string
  continuity: string
  refinement: string
}

export interface GenerationRuntimePatch
  extends Omit<Partial<GenerationRuntimeConfig>, 'editorialPolicies'> {
  editorialPolicies?: Partial<Record<PromptLanguage, Partial<GenerationEditorialPolicy>>>
}

export interface PromptStudioBundle {
  languages: typeof PROMPT_LANGUAGES
  templates: PromptTemplateRecord[]
  productCopies: ProductCopyRecord[]
  runtime: GenerationRuntimeConfig
  runtimeMeta: VersionedSystemConfigMeta
  runtimeHistory: VersionedSystemConfigHistoryEntry[]
  externalAgents: {
    rootDir: string
    readmePath: string
    promptGuidePath: string
    superPromptPath: string
    configExamplePath: string
    assets: ExternalAgentAssetRecord[]
  }
}

export const DEFAULT_NODE_ARTICLE_PASSES = 5
export const DEFAULT_SELF_REFINE_PASSES = 2
export const DEFAULT_RESEARCH_ORCHESTRATION_PASSES = 4
export const DEFAULT_RESEARCH_STAGE_PAPER_LIMIT = 20
export const DEFAULT_RESEARCH_ARTIFACT_REBUILD_LIMIT = 20
const MAX_RESEARCH_STAGE_PAPER_LIMIT = 40
const MAX_RESEARCH_ARTIFACT_REBUILD_LIMIT = 40

const DEFAULT_RUNTIME_CONFIG: GenerationRuntimeConfig = {
  defaultLanguage: 'zh',
  cacheGeneratedOutputs: true,
  contextAwareCacheReuse: true,
  staleContextRefinePasses: 1,
  useTopicMemory: true,
  usePreviousPassOutputs: true,
  preferMultimodalEvidence: true,
  maxRetriesPerPass: 2,
  topicPreviewPasses: 2,
  topicBlueprintPasses: 2,
  topicLocalizationPasses: 1,
  topicChatPasses: 2,
  stageNamingPasses: 2,
  nodeArticlePasses: DEFAULT_NODE_ARTICLE_PASSES,
  paperArticlePasses: 2,
  selfRefinePasses: DEFAULT_SELF_REFINE_PASSES,
  researchOrchestrationPasses: DEFAULT_RESEARCH_ORCHESTRATION_PASSES,
  researchReportPasses: 2,
  researchCycleDelayMs: 60000,
  researchStageStallLimit: 2,
  researchStagePaperLimit: DEFAULT_RESEARCH_STAGE_PAPER_LIMIT,
  researchArtifactRebuildLimit: DEFAULT_RESEARCH_ARTIFACT_REBUILD_LIMIT,
  nodeCardFigureCandidateLimit: 8,
  topicSessionMemoryEnabled: true,
  topicSessionMemoryInitEventCount: 6,  // Increased from 3 to reduce premature compaction
  topicSessionMemoryChatTurnsBetweenCompaction: 8,  // Increased from 4 to reduce LLM calls
  topicSessionMemoryResearchCyclesBetweenCompaction: 4,  // Increased from 2
  topicSessionMemoryTokenThreshold: 6000,  // Increased from 2600 for more tolerance
  topicSessionMemoryRecentEventLimit: 20,
  topicSessionMemoryRecallEnabled: true,
  topicSessionMemoryRecallLimit: 4,
  topicSessionMemoryRecallLookbackLimit: 18,
  topicSessionMemoryRecallRecencyBias: 0.35,
  languageTemperature: 0.18,
  multimodalTemperature: 0.12,
  maxEvidencePerArticle: 10,
  contextWindowStages: 6,
  contextWindowNodes: 16,
  unlimitedMemoryMode: true,
  editorialPolicies: {
    zh: {
      identity:
        '你是“研究编年史编辑”和“行业分析写作者”的合体。你要像真正长期浸泡在该方向里的专家一样写作，既懂论文，也懂产业，也懂工程落地。',
      mission:
        '你的使命不是把摘要改写得更长，而是把主题、节点、论文、图表、公式真正讲清楚。你必须写出判断、依据、层次、风格和气质，让页面内容有灵魂、有方向感、有可信度。',
      reasoning:
        '坚持第一性原理。先澄清问题，再辨认约束、机制、证据和边界。区分“作者声称了什么”“证据实际支持了什么”“行业真正关心什么”。遇到多篇论文时，要写清推进关系、替代关系、分歧和汇流。',
      style:
        '以清楚中文为主，必要时保留论文标题、方法名、模型名、数据集名等英文锚点。少空话，少术语墙，句子要稳、准、密。可以有克制的浪漫感，但不能漂浮，更不能装腔。',
      evidence:
        '所有关键判断都应落回证据。图、表、公式不能只描述表面内容，必须解释它证明了什么、支撑了哪段判断、还有什么限制。没有依据就不要下结论。',
      industryLens:
        '要理解产业界、工业界、研究机构视角的差异。产业界看可落地性、成本、鲁棒性、维护代价和供应链约束；研究机构看机制新意、基准表现和学术影响力。写作时要明确区分这些立场。',
      continuity:
        '你必须把当前 topic 的已知内容当成长期记忆。生成新内容时要主动衔接既有阶段、既有节点、既有批评和未解问题，保证内容是在续写一条真实研究主线，而不是每次从零开始。',
      refinement:
        '完成初稿后，像资深主编和严厉审稿人一起复读全文：删掉废话，补足论证，把多篇论文的角色说清，把产业与研究机构的视角差异讲透，确保内容既有判断力也有根据。',
    },
    en: {
      identity:
        'Write like a true research chronicle editor and industry analyst who genuinely understands the field, not like a generic summarizer.',
      mission:
        'Turn topics, nodes, papers, figures, tables, and formulas into clear expert narratives with judgment, evidence, and texture.',
      reasoning:
        'Use first-principles reasoning. Separate author claims, actual evidence, engineering constraints, and industry relevance.',
      style:
        'Keep the prose precise, vivid, low on filler, and structurally clear. Preserve only necessary English anchors.',
      evidence:
        'Every major judgment must be grounded. Explain what each figure, table, or formula proves, supports, and fails to settle.',
      industryLens:
        'Distinguish the incentives and styles of academia, research labs, and industry deployment teams.',
      continuity:
        'Treat prior topic outputs as long-term memory and continue the same research line rather than restarting from scratch.',
      refinement:
        'Refine drafts like a senior editor plus a strict reviewer: compress filler, sharpen claims, and keep the evidence chain intact.',
    },
    ja: {
      identity:
        '汎用要約者ではなく、この分野を本当に理解している研究クロニクル編集者兼業界アナリストとして書いてください。',
      mission:
        'テーマ、ノード、論文、図表、数式を、判断と根拠を備えた専門的な叙述へ変換してください。',
      reasoning:
        '第一原理で考え、主張と証拠、学術的新規性と実装上の制約を切り分けてください。',
      style:
        '冗長さを避け、明快で密度の高い文章にしてください。必要な英語アンカーのみ残してください。',
      evidence:
        '重要な判断は必ず証拠に戻し、図・表・数式が何を示し何を示せていないかを説明してください。',
      industryLens:
        '学術界、研究機関、産業導入チームの視点差を区別して書いてください。',
      continuity:
        '既存の topic 記憶を継続的な知識として扱い、毎回ゼロから書き直さないでください。',
      refinement:
        '初稿後に上級編集者と厳しい査読者の目で見直し、余計な文を削り、根拠と判断を磨いてください。',
    },
    ko: {
      identity:
        '범용 요약기가 아니라 이 분야를 실제로 이해하는 연구 연대기 편집자이자 산업 분석가처럼 작성하세요.',
      mission:
        '주제, 노드, 논문, 그림, 표, 수식을 판단과 근거가 살아 있는 전문 서사로 바꾸세요.',
      reasoning:
        '제1원리로 사고하고, 저자 주장과 실제 근거, 학술적 가치와 산업적 제약을 구분하세요.',
      style:
        '군더더기를 줄이고, 밀도 높고 명확한 문장으로 쓰세요. 필요한 영어 앵커만 남기세요.',
      evidence:
        '핵심 판단은 반드시 근거에 닿아야 하며, 그림·표·수식이 무엇을 입증하고 무엇은 못 하는지 설명하세요.',
      industryLens:
        '학계, 연구기관, 산업 현장의 입장과 스타일 차이를 구분해서 서술하세요.',
      continuity:
        '기존 topic 기억을 장기 기억처럼 활용해 같은 연구 주선을 이어가고, 매번 처음부터 다시 쓰지 마세요.',
      refinement:
        '초안 후에는 선임 편집자와 엄격한 리뷰어의 시선으로 다시 읽고, 불필요한 문장을 줄이며 판단과 근거를 강화하세요.',
    },
    de: {
      identity:
        'Schreiben Sie wie ein Forschungs-Chronik-Redakteur und Branchenanalyst, der das Feld wirklich versteht, nicht wie ein generischer Zusammenfasser.',
      mission:
        'Verwandeln Sie Themen, Knoten, Papers, Figuren, Tabellen und Formeln in klare Experten-Erzählungen mit Urteil, Beweis und Textur.',
      reasoning:
        'Verwenden Sie First-Principles-Denken. Trennen Sie Autorenbehauptungen, tatsächliche Beweise, technische Einschränkungen und Branchenrelevanz.',
      style:
        'Halten Sie die Prosa präzise, lebendig, frei von Füllwörtern und strukturell klar. Bewahren Sie nur notwendige englische Anker.',
      evidence:
        'Jedes wichtige Urteil muss begründet sein. Erklären Sie, was jede Figur, Tabelle oder Formel beweist, unterstützt und nicht klären kann.',
      industryLens:
        'Unterscheiden Sie die Anreize und Stile von Akademie, Forschungslaboren und Industrie-Deployment-Teams.',
      continuity:
        'Behandeln Sie vorherige Topic-Ausgaben als Langzeitgedächtnis und setzen Sie dieselbe Forschungslinie fort, anstatt von vorne zu beginnen.',
      refinement:
        'Verfeinern Sie Entwürfe wie ein Senior-Editor plus ein strenger Reviewer: Komprimieren Sie Füllwörter, schärfen Sie Behauptungen und halten Sie die Beweiskette intakt.',
    },
    fr: {
      identity:
        'Écrivez comme un éditeur de chroniques de recherche et un analyste industriel qui comprend vraiment le domaine, pas comme un résumeur générique.',
      mission:
        'Transformez les sujets, nœuds, articles, figures, tableaux et formules en récits d\'experts clairs avec jugement, preuves et texture.',
      reasoning:
        'Utilisez le raisonnement de premiers principes. Séparez les affirmations des auteurs, les preuves réelles, les contraintes techniques et la pertinence industrielle.',
      style:
        'Gardez la prose précise, vivante, faible en remplissage et structurellement claire. Préservez uniquement les ancres anglaises nécessaires.',
      evidence:
        'Chaque jugement majeur doit être fondé. Expliquez ce que chaque figure, tableau ou formule prouve, soutient et ne parvient pas à trancher.',
      industryLens:
        'Distinguez les incitations et les styles de l\'académie, des laboratoires de recherche et des équipes de déploiement industriel.',
      continuity:
        'Traitez les sorties précédentes du topic comme une mémoire à long terme et continuez la même ligne de recherche plutôt que de recommencer à zéro.',
      refinement:
        'Affinez les brouillons comme un éditeur senior plus un reviewer strict: compressez le remplissage, aiguisez les affirmations et gardez la chaîne de preuves intacte.',
    },
    es: {
      identity:
        'Escriba como un editor de crónicas de investigación y un analista industrial que realmente entiende el campo, no como un resumidor genérico.',
      mission:
        'Convierta temas, nodos, artículos, figuras, tablas y fórmulas en narrativas de expertos claras con juicio, evidencia y textura.',
      reasoning:
        'Use el razonamiento de primeros principios. Separe las afirmaciones de los autores, la evidencia real, las restricciones técnicas y la relevancia industrial.',
      style:
        'Mantenga la prosa precisa, vívida, baja en relleno y estructuralmente clara. Preserve solo las anclas en inglés necesarias.',
      evidence:
        'Cada juicio importante debe estar fundamentado. Explique qué prueba, apoya y no logra resolver cada figura, tabla o fórmula.',
      industryLens:
        'Distinga los incentivos y estilos de la academia, laboratorios de investigación y equipos de despliegue industrial.',
      continuity:
        'Trate las salidas anteriores del topic como memoria a largo plazo y continúe la misma línea de investigación en lugar de reiniciar desde cero.',
      refinement:
        'Refine borradores como un editor senior más un reviewer estricto: comprima el relleno, afirme las afirmaciones y mantenga la cadena de evidencia intacta.',
    },
    ru: {
      identity:
        'Пишите как редактор исследовательских хроник и отраслевой аналитик, который действительно понимает область, а не как универсальный резюмер.',
      mission:
        'Превращайте темы, узлы, статьи, фигуры, таблицы и формулы в четкие экспертные повествования с суждением, доказательствами и текстурой.',
      reasoning:
        'Используйте рассуждения от первых принципов. Разделяйте утверждения авторов, фактические доказательства, технические ограничения и отраслевую значимость.',
      style:
        'Держите прозу точной, живой, с малым количеством наполнителя и структурно четкой. Сохраняйте только необходимые английские якоря.',
      evidence:
        'Каждое важное суждение должно быть обосновано. Объясняйте, что доказывает, поддерживает и не может урегулировать каждая фигура, таблица или формула.',
      industryLens:
        'Различайте стимулы и стили академии, исследовательских лабораторий и команд промышленного развертывания.',
      continuity:
        'Рассматривайте предыдущие выходы topic как долгосрочную память и продолжайте ту же линию исследований, а не начинайте с нуля.',
      refinement:
        'Уточняйте черновики как старший редактор плюс строгий рецензент: сжимайте наполнитель, точьте утверждения и сохраняйте цепочку доказательств нетронутой.',
    },
  },
}

function buildMirrorContent(language: string, title: string, description: string): PromptTemplateContent {
  return {
    system: `You are the "research chronicle editor". Keep the same judgment-first voice as the Chinese mother prompt and write in ${language}.`,
    user: `Write the ${title} prompt in ${language}. Preserve the same structure and rigor as the Chinese mother template. ${description}`,
    notes: `Mirror of the Chinese mother template for ${language}.`,
  }
}

function promptContent(system: string, user: string, notes: string): Record<PromptLanguage, PromptTemplateContent> {
  return {
    zh: { system, user, notes },
    en: buildMirrorContent('English', 'editorial generation', notes),
    ja: buildMirrorContent('Japanese', 'editorial generation', notes),
    ko: buildMirrorContent('Korean', 'editorial generation', notes),
    de: buildMirrorContent('German', 'editorial generation', notes),
    fr: buildMirrorContent('French', 'editorial generation', notes),
    es: buildMirrorContent('Spanish', 'editorial generation', notes),
    ru: buildMirrorContent('Russian', 'editorial generation', notes),
  }
}

function copyContent(
  zh: string,
  en: string,
  ja?: string,
  ko?: string,
  de?: string,
  fr?: string,
  es?: string,
  ru?: string,
): Record<PromptLanguage, string> {
  return {
    zh,
    en,
    ja: ja ?? zh,
    ko: ko ?? zh,
    de: de ?? en,
    fr: fr ?? en,
    es: es ?? en,
    ru: ru ?? en,
  }
}

function defineCopy(
  id: ProductCopyId,
  section: ProductCopySection,
  title: string,
  description: string,
  order: number,
  zh: string,
  en: string,
  multiline = false,
): ProductCopyDefinition {
  return {
    id,
    section,
    title,
    description,
    order,
    multiline,
    languageContents: copyContent(zh, en),
  }
}

function defineAssistantSupplementalCopy(
  id: ProductCopyId,
  order: number,
  zh: string,
  en: string,
  multiline = false,
): ProductCopyDefinition {
  return defineCopy(
    id,
    'assistant',
    `工作台补充文案·${id}`,
    `补齐右侧工作台中的可编辑文案：${id}`,
    order,
    zh,
    en,
    multiline,
  )
}

const STUDIO_META_COPY_DEFINITIONS = {
  [PRODUCT_COPY_IDS.STUDIO_LOADING]: defineCopy(
    PRODUCT_COPY_IDS.STUDIO_LOADING,
    'studio',
    '设置中心加载中',
    '设置中心的加载状态文案。',
    444.1,
    '正在加载设置与内容生成中心…',
    'Loading the settings and generation studio…',
  ),
  [PRODUCT_COPY_IDS.STUDIO_LANGUAGE_EDITOR_LABEL]: defineCopy(
    PRODUCT_COPY_IDS.STUDIO_LANGUAGE_EDITOR_LABEL,
    'studio',
    '编辑语言标签',
    '设置中心里当前编辑语言的标签。',
    444.2,
    '当前编辑语言',
    'Editing language',
  ),
  [PRODUCT_COPY_IDS.STUDIO_FAMILY_TOPIC]: defineCopy(
    PRODUCT_COPY_IDS.STUDIO_FAMILY_TOPIC,
    'studio',
    '提示词分类·主题',
    '主题类提示词的家族标签。',
    444.3,
    '主题生成',
    'Topic generation',
  ),
  [PRODUCT_COPY_IDS.STUDIO_FAMILY_ARTICLE]: defineCopy(
    PRODUCT_COPY_IDS.STUDIO_FAMILY_ARTICLE,
    'studio',
    '提示词分类·文章',
    '文章类提示词的家族标签。',
    444.4,
    '文章生成',
    'Article generation',
  ),
  [PRODUCT_COPY_IDS.STUDIO_FAMILY_EVIDENCE]: defineCopy(
    PRODUCT_COPY_IDS.STUDIO_FAMILY_EVIDENCE,
    'studio',
    '提示词分类·证据',
    '证据类提示词的家族标签。',
    444.5,
    '证据解释',
    'Evidence interpretation',
  ),
  [PRODUCT_COPY_IDS.STUDIO_FAMILY_VISUAL]: defineCopy(
    PRODUCT_COPY_IDS.STUDIO_FAMILY_VISUAL,
    'studio',
    '提示词分类·视觉',
    '视觉类提示词的家族标签。',
    444.6,
    '视觉 brief',
    'Visual brief',
  ),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_BRAND]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_BRAND, 'studio', '文案分区·品牌', '设置中心固定文案页里的品牌分区名称。', 444.7, '品牌', 'Brand'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_NAVIGATION]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_NAVIGATION, 'studio', '文案分区·导航', '设置中心固定文案页里的导航分区名称。', 444.8, '导航', 'Navigation'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_HOME]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_HOME, 'studio', '文案分区·首页', '设置中心固定文案页里的首页分区名称。', 444.9, '首页', 'Home'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_CREATE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_CREATE, 'studio', '文案分区·创建主题', '设置中心固定文案页里的创建主题分区名称。', 445.0, '创建主题', 'Create Topic'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_SEARCH]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_SEARCH, 'studio', '文案分区·搜索', '设置中心固定文案页里的搜索分区名称。', 445.1, '搜索', 'Search'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_ASSISTANT]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_ASSISTANT, 'studio', '文案分区·工作台', '设置中心固定文案页里的工作台分区名称。', 445.2, '工作台', 'Workbench'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_RESEARCH]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_RESEARCH, 'studio', '文案分区·研究编排', '设置中心固定文案页里的研究编排分区名称。', 445.3, '研究编排', 'Research Orchestration'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_READING]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_READING, 'studio', '文案分区·阅读页', '设置中心固定文案页里的阅读页分区名称。', 445.4, '阅读页', 'Reading'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_LIBRARY]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_LIBRARY, 'studio', '文案分区·快照与收藏', '设置中心固定文案页里的快照与收藏分区名称。', 445.5, '快照与收藏', 'Snapshots & Favorites'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_MANAGEMENT]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_MANAGEMENT, 'studio', '文案分区·主题管理', '设置中心固定文案页里的主题管理分区名称。', 445.6, '主题管理', 'Topic Management'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_STUDIO]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_STUDIO, 'studio', '文案分区·设置中心', '设置中心固定文案页里的设置中心分区名称。', 445.7, '设置中心', 'Settings Studio'),
  [PRODUCT_COPY_IDS.STUDIO_SECTION_TOPIC]: defineCopy(PRODUCT_COPY_IDS.STUDIO_SECTION_TOPIC, 'studio', '文案分区·主题页', '设置中心固定文案页里的主题页分区名称。', 445.8, '主题页', 'Topic Page'),
  [PRODUCT_COPY_IDS.STUDIO_POLICY_IDENTITY]: defineCopy(PRODUCT_COPY_IDS.STUDIO_POLICY_IDENTITY, 'studio', '母规则字段·身份设定', '生成母规则里的身份设定字段标题。', 445.9, '身份设定', 'Identity'),
  [PRODUCT_COPY_IDS.STUDIO_POLICY_MISSION]: defineCopy(PRODUCT_COPY_IDS.STUDIO_POLICY_MISSION, 'studio', '母规则字段·任务目标', '生成母规则里的任务目标字段标题。', 446.0, '任务目标', 'Mission'),
  [PRODUCT_COPY_IDS.STUDIO_POLICY_REASONING]: defineCopy(PRODUCT_COPY_IDS.STUDIO_POLICY_REASONING, 'studio', '母规则字段·推理标准', '生成母规则里的推理标准字段标题。', 446.1, '推理标准', 'Reasoning'),
  [PRODUCT_COPY_IDS.STUDIO_POLICY_STYLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_POLICY_STYLE, 'studio', '母规则字段·写作风格', '生成母规则里的写作风格字段标题。', 446.2, '写作风格', 'Style'),
  [PRODUCT_COPY_IDS.STUDIO_POLICY_EVIDENCE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_POLICY_EVIDENCE, 'studio', '母规则字段·证据要求', '生成母规则里的证据要求字段标题。', 446.3, '证据要求', 'Evidence'),
  [PRODUCT_COPY_IDS.STUDIO_POLICY_INDUSTRY_LENS]: defineCopy(PRODUCT_COPY_IDS.STUDIO_POLICY_INDUSTRY_LENS, 'studio', '母规则字段·行业视角', '生成母规则里的行业视角字段标题。', 446.4, '行业视角', 'Industry Lens'),
  [PRODUCT_COPY_IDS.STUDIO_POLICY_CONTINUITY]: defineCopy(PRODUCT_COPY_IDS.STUDIO_POLICY_CONTINUITY, 'studio', '母规则字段·记忆与续写', '生成母规则里的记忆与续写字段标题。', 446.5, '记忆与续写', 'Continuity'),
  [PRODUCT_COPY_IDS.STUDIO_POLICY_REFINEMENT]: defineCopy(PRODUCT_COPY_IDS.STUDIO_POLICY_REFINEMENT, 'studio', '母规则字段·自我精修', '生成母规则里的自我精修字段标题。', 446.6, '自我精修', 'Refinement'),
} satisfies Partial<Record<ProductCopyId, ProductCopyDefinition>>

const STUDIO_NOTICE_COPY_DEFINITIONS = {
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_MODEL_UNAVAILABLE_TITLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_MODEL_UNAVAILABLE_TITLE, 'studio', '提示·模型中心不可用标题', '模型中心不可用时的标题。', 446.7, '模型中心暂时不可用', 'Model center is temporarily unavailable'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_MODEL_UNAVAILABLE_MESSAGE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_MODEL_UNAVAILABLE_MESSAGE, 'studio', '提示·模型中心不可用说明', '模型中心不可用时的说明。', 446.8, '模型接口暂时没有返回结果，但你仍然可以继续编辑提示词、固定文案和生成链路。', 'Model endpoints did not respond, but prompts, product copy, and runtime settings are still editable.', true),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_MODELS_SAVED]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_MODELS_SAVED, 'studio', '提示·模型已保存', '保存模型后的提示。', 446.9, '模型接入已保存。', 'Model access saved.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_MODELS_SAVE_FAILED_TITLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_MODELS_SAVE_FAILED_TITLE, 'studio', '提示·模型保存失败标题', '模型保存失败时的标题。', 447.0, '模型保存失败', 'Failed to save models'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_MODELS_SAVE_FAILED_MESSAGE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_MODELS_SAVE_FAILED_MESSAGE, 'studio', '提示·模型保存失败说明', '模型保存失败时的说明。', 447.1, '请检查 base URL、密钥和后端状态。', 'Check the base URL, credentials, and backend status.', true),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_RUNTIME_SAVED]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_RUNTIME_SAVED, 'studio', '提示·链路已保存', '保存生成链路后的提示。', 447.2, '生成链路已保存。', 'Generation runtime saved.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_RUNTIME_SAVE_FAILED]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_RUNTIME_SAVE_FAILED, 'studio', '提示·链路保存失败', '保存生成链路失败后的提示。', 447.3, '生成链路保存失败。', 'Failed to save generation runtime.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_PROMPTS_SAVED]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_PROMPTS_SAVED, 'studio', '提示·提示词已保存', '保存提示词模板后的提示。', 447.4, '提示词模板已保存。', 'Prompt templates saved.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_PROMPTS_SAVE_FAILED]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_PROMPTS_SAVE_FAILED, 'studio', '提示·提示词保存失败', '保存提示词模板失败后的提示。', 447.5, '提示词模板保存失败。', 'Failed to save prompt templates.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_COPY_SAVED]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_COPY_SAVED, 'studio', '提示·固定文案已保存', '保存固定文案后的提示。', 447.6, '固定文案已保存。', 'Product copy saved.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_COPY_SAVE_FAILED]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_COPY_SAVE_FAILED, 'studio', '提示·固定文案保存失败', '保存固定文案失败后的提示。', 447.7, '固定文案保存失败。', 'Failed to save product copy.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_TEMPLATE_RESET]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_TEMPLATE_RESET, 'studio', '提示·模板已恢复', '恢复模板后的提示。', 447.8, '当前语言下的模板已恢复。', 'Templates for the current language were restored.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_COPY_RESET]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_COPY_RESET, 'studio', '提示·固定文案已恢复', '恢复固定文案后的提示。', 447.9, '当前语言下的固定文案已恢复。', 'Product copy for the current language was restored.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_LANGUAGE_RESET]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_LANGUAGE_RESET, 'studio', '提示·当前语言已恢复', '恢复当前语言全部配置后的提示。', 448.0, '当前语言下的模板与固定文案已恢复。', 'Templates and product copy for the current language were restored.'),
  [PRODUCT_COPY_IDS.STUDIO_NOTICE_IMPORTED]: defineCopy(PRODUCT_COPY_IDS.STUDIO_NOTICE_IMPORTED, 'studio', '提示·设置已导入', '导入设置后的提示。', 448.1, '设置已导入。', 'Settings imported.'),
} satisfies Partial<Record<ProductCopyId, ProductCopyDefinition>>

const STUDIO_PAGE_COPY_DEFINITIONS = {
  [PRODUCT_COPY_IDS.STUDIO_MODELS_LANGUAGE_TITLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_LANGUAGE_TITLE, 'studio', '模型页·语言模型标题', '设置中心模型页的语言模型标题。', 448.2, '语言模型槽位', 'Language model slot'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_LANGUAGE_DESC]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_LANGUAGE_DESC, 'studio', '模型页·语言模型说明', '设置中心模型页的语言模型说明。', 448.3, '负责主题卡、阶段命名、节点长文、论文长文以及右侧工作台里的主要回答。', 'Handles topic cards, stage naming, long-form node/paper writing, and primary assistant answers.', true),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_MULTIMODAL_TITLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_MULTIMODAL_TITLE, 'studio', '模型页·多模态标题', '设置中心模型页的多模态模型标题。', 448.4, '多模态模型槽位', 'Multimodal model slot'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_MULTIMODAL_DESC]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_MULTIMODAL_DESC, 'studio', '模型页·多模态说明', '设置中心模型页的多模态模型说明。', 448.5, '负责图、表、公式解释与其他需要视觉判断的生成任务。', 'Handles figures, tables, formula explanation, and other visually grounded generation tasks.', true),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_SAVE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_SAVE, 'studio', '模型页·保存按钮', '设置中心模型页的保存按钮文案。', 448.6, '保存模型接入', 'Save model access'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_REFRESH]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_REFRESH, 'studio', '模型页·刷新按钮', '设置中心模型页的刷新按钮文案。', 448.7, '刷新状态', 'Refresh status'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_SAVED_KEY]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_SAVED_KEY, 'studio', '模型页·已保存密钥', '设置中心模型页显示已保存密钥时的标签。', 448.8, '已保存密钥', 'Saved key'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_PROVIDER_PLACEHOLDER]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_PROVIDER_PLACEHOLDER, 'studio', '模型页·提供商占位', '设置中心模型页提供商选择器占位文案。', 448.9, '选择提供商', 'Choose provider'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_MODEL_PLACEHOLDER]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_MODEL_PLACEHOLDER, 'studio', '模型页·模型占位', '设置中心模型页模型选择器占位文案。', 449.0, '选择模型', 'Choose model'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_CUSTOM_MODEL_PLACEHOLDER]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_CUSTOM_MODEL_PLACEHOLDER, 'studio', '模型页·自定义模型占位', '设置中心模型页自定义模型输入框占位文案。', 449.1, '自定义模型标识', 'Custom model id'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_BASE_URL_PLACEHOLDER]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_BASE_URL_PLACEHOLDER, 'studio', '模型页·Base URL 占位', '设置中心模型页 Base URL 输入框占位文案。', 449.2, '接入地址', 'Base URL'),
  [PRODUCT_COPY_IDS.STUDIO_MODELS_API_KEY_PLACEHOLDER]: defineCopy(PRODUCT_COPY_IDS.STUDIO_MODELS_API_KEY_PLACEHOLDER, 'studio', '模型页·API Key 占位', '设置中心模型页 API Key 输入框占位文案。', 449.3, '留空则继续使用已保存密钥', 'Leave empty to keep the saved key'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_TITLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_TITLE, 'studio', '链路页·标题', '设置中心链路页标题。', 449.4, '多次生成链路', 'Multi-pass runtime'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_DESC]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_DESC, 'studio', '链路页·说明', '设置中心链路页说明。', 449.5, '这些参数决定后端 skill 如何多轮生成、续写、精修，并沿着主题记忆继续写下去。', 'These settings control how the backend skill generates, revises, and continues writing across multiple passes.', true),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_DEFAULT_LANGUAGE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_DEFAULT_LANGUAGE, 'studio', '链路页·默认语言', '设置中心链路页默认输出语言字段标题。', 449.6, '默认输出语言', 'Default output language'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_MAX_RETRIES]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_MAX_RETRIES, 'studio', '链路页·最大重试', '设置中心链路页单次 pass 最大重试字段标题。', 449.7, '单次 pass 最大重试次数', 'Max retries per pass'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_STAGE_NAMING]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_STAGE_NAMING, 'studio', '链路页·阶段命名轮数', '设置中心链路页阶段命名轮数字段标题。', 449.8, '阶段命名轮数', 'Stage naming passes'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_NODE_ARTICLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_NODE_ARTICLE, 'studio', '链路页·节点文章轮数', '设置中心链路页节点文章轮数字段标题。', 449.9, '节点文章轮数', 'Node article passes'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_PAPER_ARTICLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_PAPER_ARTICLE, 'studio', '链路页·论文文章轮数', '设置中心链路页论文文章轮数字段标题。', 450.0, '论文文章轮数', 'Paper article passes'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_SELF_REFINE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_SELF_REFINE, 'studio', '链路页·自我精修轮数', '设置中心链路页自我精修轮数字段标题。', 450.1, '自我精修轮数', 'Self-refine passes'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_MAX_EVIDENCE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_MAX_EVIDENCE, 'studio', '链路页·证据上限', '设置中心链路页每篇正文最多证据数字段标题。', 450.2, '每篇正文最多证据数', 'Max evidence blocks per article'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_STAGE_WINDOW]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_STAGE_WINDOW, 'studio', '链路页·阶段记忆窗口', '设置中心链路页阶段记忆窗口字段标题。', 450.3, '阶段记忆窗口', 'Stage memory window'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_NODE_WINDOW]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_NODE_WINDOW, 'studio', '链路页·节点记忆窗口', '设置中心链路页节点记忆窗口字段标题。', 450.4, '节点记忆窗口', 'Node memory window'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_LANGUAGE_TEMPERATURE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_LANGUAGE_TEMPERATURE, 'studio', '链路页·LLM 温度', '设置中心链路页语言模型温度字段标题。', 450.5, 'LLM 温度', 'LLM temperature'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_MULTIMODAL_TEMPERATURE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_MULTIMODAL_TEMPERATURE, 'studio', '链路页·VLM 温度', '设置中心链路页多模态模型温度字段标题。', 450.6, 'VLM 温度', 'VLM temperature'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_CACHE_OUTPUTS]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_CACHE_OUTPUTS, 'studio', '链路页·缓存结果', '设置中心链路页缓存生成结果开关文案。', 450.7, '缓存生成结果', 'Cache generated outputs'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_USE_TOPIC_MEMORY]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_USE_TOPIC_MEMORY, 'studio', '链路页·读取主题记忆', '设置中心链路页读取主题记忆开关文案。', 450.8, '读取主题记忆', 'Use topic memory'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_USE_PREVIOUS_OUTPUTS]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_USE_PREVIOUS_OUTPUTS, 'studio', '链路页·读取前序输出', '设置中心链路页读取前序输出开关文案。', 450.9, '读取前序输出', 'Use previous pass outputs'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_PREFER_MULTIMODAL]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_PREFER_MULTIMODAL, 'studio', '链路页·优先多模态证据', '设置中心链路页优先使用多模态证据开关文案。', 451.0, '优先使用多模态证据', 'Prefer multimodal evidence'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_POLICY_TITLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_POLICY_TITLE, 'studio', '链路页·母规则标题', '设置中心链路页母规则面板标题。', 451.1, '专家视角母规则', 'Editorial mother rules'),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_POLICY_DESC]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_POLICY_DESC, 'studio', '链路页·母规则说明', '设置中心链路页母规则面板说明。', 451.2, '这组文字会注入每一次主题、节点、论文、图表解释与 reviewer 生成。', 'These instructions are injected into every topic, node, paper, evidence, and reviewer generation pass.', true),
  [PRODUCT_COPY_IDS.STUDIO_PIPELINE_SAVE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PIPELINE_SAVE, 'studio', '链路页·保存按钮', '设置中心链路页保存按钮文案。', 451.3, '保存生成链路', 'Save generation runtime'),
  [PRODUCT_COPY_IDS.STUDIO_PROMPTS_EXPORT]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PROMPTS_EXPORT, 'studio', '提示词页·导出', '设置中心提示词页导出按钮文案。', 451.4, '导出', 'Export'),
  [PRODUCT_COPY_IDS.STUDIO_PROMPTS_IMPORT]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PROMPTS_IMPORT, 'studio', '提示词页·导入', '设置中心提示词页导入按钮文案。', 451.5, '导入', 'Import'),
  [PRODUCT_COPY_IDS.STUDIO_PROMPTS_RESET_LANGUAGE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PROMPTS_RESET_LANGUAGE, 'studio', '提示词页·恢复当前语言', '设置中心提示词页恢复当前语言按钮文案。', 451.6, '恢复当前语言', 'Restore current language'),
  [PRODUCT_COPY_IDS.STUDIO_PROMPTS_SAVE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PROMPTS_SAVE, 'studio', '提示词页·保存按钮', '设置中心提示词页保存按钮文案。', 451.7, '保存模板', 'Save templates'),
  [PRODUCT_COPY_IDS.STUDIO_PROMPTS_RESET_ITEM]: defineCopy(PRODUCT_COPY_IDS.STUDIO_PROMPTS_RESET_ITEM, 'studio', '提示词页·恢复本条', '设置中心提示词页恢复单条模板按钮文案。', 451.8, '恢复本条', 'Reset this item'),
  [PRODUCT_COPY_IDS.STUDIO_COPY_RESET_LANGUAGE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_COPY_RESET_LANGUAGE, 'studio', '文案页·恢复当前语言', '设置中心固定文案页恢复当前语言按钮文案。', 451.9, '恢复当前语言', 'Restore current language'),
  [PRODUCT_COPY_IDS.STUDIO_COPY_SAVE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_COPY_SAVE, 'studio', '文案页·保存按钮', '设置中心固定文案页保存按钮文案。', 452.0, '保存固定文案', 'Save product copy'),
  [PRODUCT_COPY_IDS.STUDIO_COPY_DESC]: defineCopy(PRODUCT_COPY_IDS.STUDIO_COPY_DESC, 'studio', '文案页·说明', '设置中心固定文案页分区说明。', 452.1, '这些文字会直接进入正式页面，而不是写给开发者看的内部说明。', 'These strings go directly into reader-facing pages instead of internal developer notes.', true),
  [PRODUCT_COPY_IDS.STUDIO_COPY_RESET_ITEM]: defineCopy(PRODUCT_COPY_IDS.STUDIO_COPY_RESET_ITEM, 'studio', '文案页·恢复单条', '设置中心固定文案页恢复单条文案按钮文案。', 452.2, '恢复', 'Reset'),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_TITLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_TITLE, 'studio', 'Agent 页·标题', '设置中心 Agent 页标题。', 452.3, '外部 CLI 协作入口', 'External CLI collaboration'),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_DESC]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_DESC, 'studio', 'Agent 页·说明', '设置中心 Agent 页说明。', 452.4, '允许 Codex、OpenClaw、Claude Code 等工具读取同一套模板并产出结构化结果，而不破坏现有 skill 框架。', 'Allow Codex, OpenClaw, Claude Code, and similar tools to read the same templates and return structured results without breaking the current skill stack.', true),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_PROMPT_GUIDE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_PROMPT_GUIDE, 'studio', 'Agent 页·Prompt Guide 标签', '设置中心 Agent 页 Prompt Guide 路径标签。', 452.5, 'Prompt Guide', 'Prompt Guide'),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_CONFIG_EXAMPLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_CONFIG_EXAMPLE, 'studio', 'Agent 页·配置示例标签', '设置中心 Agent 页配置示例路径标签。', 452.6, 'Config Example', 'Config Example'),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_USAGE_TITLE]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_USAGE_TITLE, 'studio', 'Agent 页·使用方式标题', '设置中心 Agent 页使用方式标题。', 452.7, '使用方式', 'How to use'),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_USAGE_DESC]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_USAGE_DESC, 'studio', 'Agent 页·使用方式说明', '设置中心 Agent 页使用方式说明。', 452.8, '先在本页保存模型、固定文案与提示词，再让外部 agent 读取 Prompt Guide；它输出的结构化 JSON 会继续回到现有 orchestrator、topic memory 与证据链里。', 'Save models, product copy, and prompts here first, then let external agents read the Prompt Guide and return structured JSON back into the existing orchestrator, topic memory, and evidence pipeline.', true),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_README_ACTION]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_README_ACTION, 'studio', 'Agent 页·查看说明', '设置中心 Agent 页查看脚手架说明按钮文案。', 452.9, '查看脚手架说明', 'Open adapter README'),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_PROMPT_GUIDE_ACTION]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_PROMPT_GUIDE_ACTION, 'studio', 'Agent 页·查看 Prompt Guide', '设置中心 Agent 页查看 Prompt Guide 按钮文案。', 453.0, '查看 Prompt Guide', 'Open Prompt Guide'),
  [PRODUCT_COPY_IDS.STUDIO_AGENTS_CONFIG_ACTION]: defineCopy(PRODUCT_COPY_IDS.STUDIO_AGENTS_CONFIG_ACTION, 'studio', 'Agent 页·查看配置示例', '设置中心 Agent 页查看配置示例按钮文案。', 453.1, '查看配置示例', 'Open config example'),
} satisfies Partial<Record<ProductCopyId, ProductCopyDefinition>>

const RESEARCH_FLOW_COPY_DEFINITIONS = {
  [PRODUCT_COPY_IDS.RESEARCH_NOTICE_SELECT_TOPIC]: defineCopy(PRODUCT_COPY_IDS.RESEARCH_NOTICE_SELECT_TOPIC, 'research', '研究编排提示·先选主题', '创建研究编排前未选择主题时的提示。', 453.2, '请至少选择一个主题。', 'Please choose at least one topic.'),
  [PRODUCT_COPY_IDS.RESEARCH_NOTICE_CREATED]: defineCopy(PRODUCT_COPY_IDS.RESEARCH_NOTICE_CREATED, 'research', '研究编排提示·创建成功', '创建研究编排成功后的提示。', 453.3, '新的研究编排任务已经创建。', 'A new orchestration task has been created.'),
  [PRODUCT_COPY_IDS.RESEARCH_NOTICE_CREATE_FAILED]: defineCopy(PRODUCT_COPY_IDS.RESEARCH_NOTICE_CREATE_FAILED, 'research', '研究编排提示·创建失败', '创建研究编排失败后的提示。', 453.4, '创建研究编排任务失败。', 'Failed to create the orchestration task.'),
  [PRODUCT_COPY_IDS.RESEARCH_WAITING_FIRST_RUN]: defineCopy(PRODUCT_COPY_IDS.RESEARCH_WAITING_FIRST_RUN, 'research', '研究编排状态·等待首次运行', '任务还未开始运行时的状态。', 453.5, '等待首次运行', 'Waiting for the first run'),
  [PRODUCT_COPY_IDS.RESEARCH_STAGE_LABEL_TEMPLATE]: defineCopy(PRODUCT_COPY_IDS.RESEARCH_STAGE_LABEL_TEMPLATE, 'research', '研究编排模板·阶段标签', '没有真实阶段名时的阶段标签模板。', 453.6, '第 {stage} 阶段', 'Stage {stage}'),
  [PRODUCT_COPY_IDS.RESEARCH_PROGRESS_SUMMARY]: defineCopy(PRODUCT_COPY_IDS.RESEARCH_PROGRESS_SUMMARY, 'research', '研究编排模板·任务进度', '任务列表里的进度摘要模板。', 453.7, '第 {currentStage} 阶段 / 共 {totalStages} 阶段 · 当前已跑 {currentRuns} / {targetRuns} 轮', 'Stage {currentStage} / {totalStages} · runs {currentRuns} / {targetRuns}', true),
  [PRODUCT_COPY_IDS.RESEARCH_RUN_SUMMARY]: defineCopy(PRODUCT_COPY_IDS.RESEARCH_RUN_SUMMARY, 'research', '研究编排模板·运行记录摘要', '任务详情里单次运行摘要模板。', 453.8, '第 {stage} 阶段 · 发现 {discovered} · 准入 {admitted} · 生成 {generated}', 'Stage {stage} · discovered {discovered} · admitted {admitted} · generated {generated}', true),
} satisfies Partial<Record<ProductCopyId, ProductCopyDefinition>>

const ASSISTANT_SUPPLEMENTAL_COPY_DEFINITIONS = {
  [PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_ADJUST]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_ADJUST, 3713, '会调整', 'Will adjust', false),
  [PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_APPLYING_NEXT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_APPLYING_NEXT, 3714, '下一轮将吸收', 'Applying next', false),
  [PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_CONTRACT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_CONTRACT, 3715, '接下来如何继续', 'How I should continue', false),
  [PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_EYEBROW]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_EYEBROW, 3716, '当前校准', 'Current calibration', false),
  [PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_PRESERVE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_CALIBRATION_PRESERVE, 3717, '会保留', 'Will preserve', false),
  [PRODUCT_COPY_IDS.ASSISTANT_CAPTURE_ANSWER]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_CAPTURE_ANSWER, 3718, '收录最新回答', 'Capture Latest Answer', false),
  [PRODUCT_COPY_IDS.ASSISTANT_CAPTURE_EVIDENCE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_CAPTURE_EVIDENCE, 3719, '收录当前证据', 'Save This Evidence', false),
  [PRODUCT_COPY_IDS.ASSISTANT_EXPORT_DOSSIER]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_EXPORT_DOSSIER, 3720, '导出研究档案', 'Export Research Dossier', false),
  [PRODUCT_COPY_IDS.ASSISTANT_EXPORT_DOSSIER_FAILED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_EXPORT_DOSSIER_FAILED, 3721, '导出研究档案失败，请稍后重试。', 'Failed to export the research dossier. Please try again later.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_EXPORT_HIGHLIGHTS]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_EXPORT_HIGHLIGHTS, 3722, '导出重点摘编', 'Export Highlights', false),
  [PRODUCT_COPY_IDS.ASSISTANT_EXPORT_JSON]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_EXPORT_JSON, 3723, '导出 JSON', 'Export JSON', false),
  [PRODUCT_COPY_IDS.ASSISTANT_EXPORT_MARKDOWN]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_EXPORT_MARKDOWN, 3724, '导出 Markdown', 'Export Markdown', false),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_ACTIVE_COUNT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_ACTIVE_COUNT, 3725, '生效中', 'active', false),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_DEK]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_DEK, 3726, '这条侧栏里的建议会成为后续研究与写作的持久校准，而不是消失在聊天记录里。', 'Suggestions in this rail become durable calibration for later research and writing instead of fading inside chat history.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_EMPTY_DEK]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_EMPTY_DEK, 3727, '你可以在这里收束重点、提出质疑，或调整写作语气。系统会在后续轮次中吸收这些要求。', 'Use this rail to tighten focus, raise challenges, or tune the writing voice. The system will absorb those instructions in later runs.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_EMPTY_TITLE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_EMPTY_TITLE, 3728, '尚无持久引导', 'No durable guidance yet', false),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_EYEBROW]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_EYEBROW, 3729, '研究引导', 'Guidance Ledger', false),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_LATEST_DEK]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_LATEST_DEK, 3730, '最近一轮研究已经吸收了这条侧栏中的部分校准，并把变化写回主题记忆。', 'The latest research cycle has already absorbed part of this rail and written the adjustment back into topic memory.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_PROMPT_CTA]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_PROMPT_CTA, 3731, '沿此继续', 'Continue from this', false),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_STAT_ACCEPTED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_STAT_ACCEPTED, 3732, '接受', 'Accepted', false),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_STAT_DEFERRED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_STAT_DEFERRED, 3733, '暂缓', 'Deferred', false),
  [PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_STAT_TRACKED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_GUIDANCE_STAT_TRACKED, 3734, '记录', 'Tracked', false),
  [PRODUCT_COPY_IDS.ASSISTANT_NOTES_COUNT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_NOTES_COUNT, 3735, '条目', 'Entries', false),
  [PRODUCT_COPY_IDS.ASSISTANT_NOTES_DESCRIPTION]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_NOTES_DESCRIPTION, 3736, '把 AI 的关键讲解、当前证据和节点线索沉淀下来，后续可以继续导出、回看和追问。', 'Save the key AI explanations, current evidence, and node threads so you can export, revisit, and continue from them later.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_NOTES_EMPTY]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_NOTES_EMPTY, 3737, '这里会保留围绕当前主题沉淀下来的回答、证据和关键线索。先收录一条，再让 AI 基于它继续展开。', 'Saved answers, evidence, and decisive threads for this topic appear here. Capture one first, then let the assistant continue from it.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_NOTES_LAST_SAVED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_NOTES_LAST_SAVED, 3738, '最近一次收录', 'Last saved', false),
  [PRODUCT_COPY_IDS.ASSISTANT_NOTES_RECENT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_NOTES_RECENT, 3739, '当前主题已收录', 'Saved in this topic', false),
  [PRODUCT_COPY_IDS.ASSISTANT_NOTES_TITLE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_NOTES_TITLE, 3740, '研究笔记', 'Research Notebook', false),
  [PRODUCT_COPY_IDS.ASSISTANT_NOTES_UNTITLED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_NOTES_UNTITLED, 3741, '研究笔记', 'Research Note', false),
  [PRODUCT_COPY_IDS.ASSISTANT_OPEN_NOTE_SOURCE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_OPEN_NOTE_SOURCE, 3742, '打开来源', 'Open source', false),
  [PRODUCT_COPY_IDS.ASSISTANT_OPEN_NOTEBOOK]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_OPEN_NOTEBOOK, 3743, '打开全部笔记', 'Open All Notes', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_ADVANCE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_ADVANCE, 3744, '推进阶段', 'Advance', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_CYCLE_RESET]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_CYCLE_RESET, 3745, '重启巡检', 'Cycle reset', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_EYEBROW]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_EYEBROW, 3746, '最新阶段判断', 'Latest stage decision', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_REASON_AWAIT_EVIDENCE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_REASON_AWAIT_EVIDENCE, 3747, '仍待更强证据', 'Awaiting stronger evidence', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_REASON_ORCHESTRATION]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_REASON_ORCHESTRATION, 3748, '编排判断', 'Orchestration judgment', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_REASON_PROGRESS_MADE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_REASON_PROGRESS_MADE, 3749, '已有实质推进', 'Progress made', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_REASON_STALL_LIMIT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_REASON_STALL_LIMIT, 3750, '达到停滞阈值', 'Stall limit reached', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_STAY]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DECISION_STAY, 3751, '继续停留', 'Stay', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DEK]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DEK, 3752, '发起后，后端会持续检索、吸收论文、修正节点与主线；你只需要在这里查看进展、接收回执，并继续追问。', 'Once started, the backend keeps searching papers, revising nodes, and sharpening the mainline while you follow the progress here.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DURATION_LABEL]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DURATION_LABEL, 3753, '研究时长', 'Duration', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DURATION_UNIT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_DURATION_UNIT, 3754, '小时', 'hours', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_EYEBROW]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_EYEBROW, 3755, '持续研究', 'Ongoing Research', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_IDLE_HINT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_IDLE_HINT, 3756, '还没有发起本主题的持续研究。', 'No ongoing research run has been started for this topic yet.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_KEY_MOVES]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_KEY_MOVES, 3757, '关键动作', 'Key moves', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_OPEN_QUESTIONS]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_OPEN_QUESTIONS, 3758, '待解问题', 'Open Questions', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_RECEIPT_TOGGLE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_RECEIPT_TOGGLE, 3759, '查看研究细节', 'View research details', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_RUNNING_HINT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_RUNNING_HINT, 3760, '研究进行中', 'Research is in progress', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_START]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_START, 3761, '开始研究', 'Start Research', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STARTING]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STARTING, 3762, '正在启动', 'Starting', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STAT_ADMITTED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STAT_ADMITTED, 3763, '纳入', 'Admitted', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STAT_DISCOVERED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STAT_DISCOVERED, 3764, '发现', 'Discovered', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STAT_GENERATED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STAT_GENERATED, 3765, '重建', 'Rebuilt', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_COMPLETED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_COMPLETED, 3766, '已完成', 'Completed', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_FAILED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_FAILED, 3767, '已中断', 'Interrupted', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_IDLE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_IDLE, 3768, '待启动', 'Idle', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_PAUSED]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_PAUSED, 3769, '已暂停', 'Paused', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_RUNNING]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_RUNNING, 3770, '研究中', 'Researching', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_STOPPING]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STATUS_STOPPING, 3771, '正在收束', 'Wrapping up', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STOP]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STOP, 3772, '收束本轮', 'End this round', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STOP_PENDING]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STOP_PENDING, 3773, '正在收束', 'Wrapping up', false),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STOPPING_HINT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_STOPPING_HINT, 3774, '当前轮次正在收束，本轮完成的判断与整理结果会保存在侧边栏回执里。', 'This round is wrapping up. The completed judgments and edits will be saved in the sidebar receipt.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_TITLE]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_RESEARCH_TITLE, 3775, '让 agent 在限定时长内持续研究，而不是按固定轮次机械停下。', 'Let the agent keep researching for a set duration instead of stopping after fixed rounds.', true),
  [PRODUCT_COPY_IDS.ASSISTANT_TAB_NOTES]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_TAB_NOTES, 3776, '笔记', 'Notes', false),
  [PRODUCT_COPY_IDS.ASSISTANT_WORLD_AGENDA]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_WORLD_AGENDA, 3777, '当前议程', 'Active agenda', false),
  [PRODUCT_COPY_IDS.ASSISTANT_WORLD_CLAIMS]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_WORLD_CLAIMS, 3778, '已建立论断', 'Established claims', false),
  [PRODUCT_COPY_IDS.ASSISTANT_WORLD_CONTINUITY]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_WORLD_CONTINUITY, 3779, '连续判断', 'Continuity', false),
  [PRODUCT_COPY_IDS.ASSISTANT_WORLD_EYEBROW]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_WORLD_EYEBROW, 3780, '研究世界', 'Research world', false),
  [PRODUCT_COPY_IDS.ASSISTANT_WORLD_NODE_COUNT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_WORLD_NODE_COUNT, 3781, '节点', 'Nodes', false),
  [PRODUCT_COPY_IDS.ASSISTANT_WORLD_PAPER_COUNT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_WORLD_PAPER_COUNT, 3782, '论文', 'Papers', false),
  [PRODUCT_COPY_IDS.ASSISTANT_WORLD_STAGE_COUNT]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_WORLD_STAGE_COUNT, 3783, '阶段', 'Stages', false),
  [PRODUCT_COPY_IDS.ASSISTANT_WORLD_TENSIONS]: defineAssistantSupplementalCopy(PRODUCT_COPY_IDS.ASSISTANT_WORLD_TENSIONS, 3784, '开放张力', 'Open tensions', false),
} satisfies Partial<Record<ProductCopyId, ProductCopyDefinition>>

const BUILT_IN_PRODUCT_COPIES: Record<ProductCopyId, ProductCopyDefinition> = {
  [PRODUCT_COPY_IDS.BRAND_TITLE]: {
    id: PRODUCT_COPY_IDS.BRAND_TITLE,
    section: 'brand',
    title: '品牌标题',
    description: '左侧栏与首页封面使用的中文品牌名。',
    order: 10,
    multiline: false,
    languageContents: copyContent('溯知', 'TraceMind'),
  },
  [PRODUCT_COPY_IDS.BRAND_SUBTITLE]: {
    id: PRODUCT_COPY_IDS.BRAND_SUBTITLE,
    section: 'brand',
    title: '品牌副标题',
    description: '品牌英文副标题，首页与侧栏统一使用 TraceMind。',
    order: 20,
    multiline: false,
    languageContents: copyContent('TraceMind', 'TraceMind'),
  },
  [PRODUCT_COPY_IDS.NAV_HOME]: {
    id: PRODUCT_COPY_IDS.NAV_HOME,
    section: 'navigation',
    title: '导航·首页',
    description: '左侧主导航文案。',
    order: 30,
    multiline: false,
    languageContents: copyContent('首页', 'Home'),
  },
  [PRODUCT_COPY_IDS.NAV_ORCHESTRATION]: {
    id: PRODUCT_COPY_IDS.NAV_ORCHESTRATION,
    section: 'navigation',
    title: '导航·编排',
    description: '左侧主导航文案。',
    order: 40,
    multiline: false,
    languageContents: copyContent('编排', 'Orchestrate'),
  },
  [PRODUCT_COPY_IDS.NAV_FAVORITES]: {
    id: PRODUCT_COPY_IDS.NAV_FAVORITES,
    section: 'navigation',
    title: '导航·收藏',
    description: '左侧主导航文案。',
    order: 50,
    multiline: false,
    languageContents: copyContent('收藏', 'Favorites'),
  },
  [PRODUCT_COPY_IDS.NAV_SNAPSHOT]: {
    id: PRODUCT_COPY_IDS.NAV_SNAPSHOT,
    section: 'navigation',
    title: '导航·快照',
    description: '左侧主导航文案。',
    order: 60,
    multiline: false,
    languageContents: copyContent('快照', 'Snapshots'),
  },
  [PRODUCT_COPY_IDS.NAV_SETTINGS]: {
    id: PRODUCT_COPY_IDS.NAV_SETTINGS,
    section: 'navigation',
    title: '导航·设置',
    description: '左侧主导航文案。',
    order: 70,
    multiline: false,
    languageContents: copyContent('设置', 'Settings'),
  },
  [PRODUCT_COPY_IDS.NAV_SEARCH]: {
    id: PRODUCT_COPY_IDS.NAV_SEARCH,
    section: 'navigation',
    title: '导航·搜索',
    description: '左侧主导航文案。',
    order: 80,
    multiline: false,
    languageContents: copyContent('搜索', 'Search'),
  },
  [PRODUCT_COPY_IDS.NAV_CHAT]: {
    id: PRODUCT_COPY_IDS.NAV_CHAT,
    section: 'navigation',
    title: '导航·对话',
    description: '主题页出现的工作台入口文案。',
    order: 90,
    multiline: false,
    languageContents: copyContent('对话', 'Assistant'),
  },
  [PRODUCT_COPY_IDS.NAV_TOPICS]: {
    id: PRODUCT_COPY_IDS.NAV_TOPICS,
    section: 'navigation',
    title: '导航·主题列表标题',
    description: '侧边栏主题列表区域标题。',
    order: 100,
    multiline: false,
    languageContents: copyContent('主题', 'Topics'),
  },
  [PRODUCT_COPY_IDS.NAV_REFRESH_TOPIC]: {
    id: PRODUCT_COPY_IDS.NAV_REFRESH_TOPIC,
    section: 'navigation',
    title: '导航·刷新主题',
    description: '主题页侧边栏的刷新主题入口。',
    order: 105,
    multiline: false,
    languageContents: copyContent('刷新主题', 'Refresh topic'),
  },
  [PRODUCT_COPY_IDS.NAV_REFRESH_TOPIC_SHORT]: {
    id: PRODUCT_COPY_IDS.NAV_REFRESH_TOPIC_SHORT,
    section: 'navigation',
    title: '导航·刷新主题短标签',
    description: '主题页侧边栏的刷新按钮短标签。',
    order: 106,
    multiline: false,
    languageContents: copyContent('刷新', 'Refresh'),
  },
  [PRODUCT_COPY_IDS.APP_LOADING]: {
    id: PRODUCT_COPY_IDS.APP_LOADING,
    section: 'navigation',
    title: '页面加载中',
    description: '全局路由懒加载时的占位文案。',
    order: 108,
    multiline: false,
    languageContents: copyContent('页面加载中…', 'Loading page...'),
  },
  [PRODUCT_COPY_IDS.HOME_HERO_TAGLINE]: {
    id: PRODUCT_COPY_IDS.HOME_HERO_TAGLINE,
    section: 'home',
    title: '首页导语短句',
    description: '首页品牌下方的短句，面向所有读者。',
    order: 110,
    multiline: false,
    languageContents: copyContent('让研究方向有迹可循，不让关键上下文在论文与摘要之间散失。', 'Trace the research line without losing the context.'),
  },
  [PRODUCT_COPY_IDS.HOME_HERO_MISSION]: {
    id: PRODUCT_COPY_IDS.HOME_HERO_MISSION,
    section: 'home',
    title: '首页使命说明',
    description: '首页中央的一整段连续说明，不写给开发者，只写给读者。',
    order: 120,
    multiline: true,
    languageContents: copyContent(
      '我们的初衷，是让研究方向真正有迹可循；我们的目标，是成为每一位研究者理解上下文、辨认主线、看清分支与证据关系的研究知心助手；我们的方法，是把主题、节点、论文、图表、公式和审稿式判断重新编织成可以顺着读下去的连续研究脉络，让你不必在零散摘要和原文之间反复拼图。',
      'Our aim is to turn fragmented papers, evidence, and judgments into a continuous research line that readers can actually follow.',
    ),
  },
  [PRODUCT_COPY_IDS.HOME_TOPICS_EYEBROW]: {
    id: PRODUCT_COPY_IDS.HOME_TOPICS_EYEBROW,
    section: 'home',
    title: '首页主题区眉标',
    description: '首页主题区上方小标题。',
    order: 130,
    multiline: false,
    languageContents: copyContent('主题', 'Topics'),
  },
  [PRODUCT_COPY_IDS.HOME_TOPICS_TITLE]: {
    id: PRODUCT_COPY_IDS.HOME_TOPICS_TITLE,
    section: 'home',
    title: '首页主题区标题',
    description: '首页主题列表标题。',
    order: 140,
    multiline: false,
    languageContents: copyContent('从这里进入当前研究主线', 'Enter the active research lines'),
  },
  [PRODUCT_COPY_IDS.HOME_TOPICS_EMPTY]: {
    id: PRODUCT_COPY_IDS.HOME_TOPICS_EMPTY,
    section: 'home',
    title: '首页空态',
    description: '首页没有主题时的文案。',
    order: 150,
    multiline: true,
    languageContents: copyContent('这里还没有可阅读的主题。新建一个主题后，系统会继续生成阶段命名、节点卡片、连续详情页和研究工作台。', 'No topics are ready yet. Create one to start building the line.'),
  },
  [PRODUCT_COPY_IDS.HOME_CREATE_BUTTON]: {
    id: PRODUCT_COPY_IDS.HOME_CREATE_BUTTON,
    section: 'home',
    title: '首页创建按钮',
    description: '首页主题区右上角创建主题入口。',
    order: 160,
    multiline: false,
    languageContents: copyContent('创建主题', 'Create Topic'),
  },
  [PRODUCT_COPY_IDS.CREATE_TITLE]: {
    id: PRODUCT_COPY_IDS.CREATE_TITLE,
    section: 'create',
    title: '创建主题标题',
    description: '创建主题弹窗标题。',
    order: 170,
    multiline: false,
    languageContents: copyContent('构建新主题', 'Build a New Topic'),
  },
  [PRODUCT_COPY_IDS.CREATE_DESCRIPTION]: {
    id: PRODUCT_COPY_IDS.CREATE_DESCRIPTION,
    section: 'create',
    title: '创建主题说明',
    description: '创建主题弹窗说明。',
    order: 180,
    multiline: true,
    languageContents: copyContent('输入你想持续追踪的研究方向。系统会先生成主题预览，再把它保存为可继续扩展的研究主线。全局模型、语言和提示词请在设置中心完成，这里只负责构建主题。', 'Describe the direction you want to track.'),
  },
  [PRODUCT_COPY_IDS.CREATE_DESCRIPTION_LABEL]: {
    id: PRODUCT_COPY_IDS.CREATE_DESCRIPTION_LABEL,
    section: 'create',
    title: '创建主题描述标签',
    description: '创建主题正文输入框标签。',
    order: 190,
    multiline: false,
    languageContents: copyContent('研究方向描述', 'Research Direction'),
  },
  [PRODUCT_COPY_IDS.CREATE_DESCRIPTION_PLACEHOLDER]: {
    id: PRODUCT_COPY_IDS.CREATE_DESCRIPTION_PLACEHOLDER,
    section: 'create',
    title: '创建主题描述占位',
    description: '创建主题正文输入框占位。',
    order: 200,
    multiline: true,
    languageContents: copyContent('描述你想追踪的问题、关键方法、应用场景，以及它为什么值得长期研究。', 'Describe the problem, methods, and why it matters.'),
  },
  [PRODUCT_COPY_IDS.CREATE_ENGLISH_LABEL]: {
    id: PRODUCT_COPY_IDS.CREATE_ENGLISH_LABEL,
    section: 'create',
    title: '创建主题英文补充标签',
    description: '双语模式下的英文补充标签。',
    order: 210,
    multiline: false,
    languageContents: copyContent('英文补充说明', 'English Notes'),
  },
  [PRODUCT_COPY_IDS.CREATE_ENGLISH_PLACEHOLDER]: {
    id: PRODUCT_COPY_IDS.CREATE_ENGLISH_PLACEHOLDER,
    section: 'create',
    title: '创建主题英文占位',
    description: '双语模式下的英文补充占位。',
    order: 220,
    multiline: true,
    languageContents: copyContent('补充论文标题、方法名或你希望保留的英文锚点。', 'Add paper titles, method names, or anchor terms.'),
  },
  [PRODUCT_COPY_IDS.CREATE_CLOSE]: {
    id: PRODUCT_COPY_IDS.CREATE_CLOSE,
    section: 'create',
    title: '创建主题关闭按钮',
    description: '创建主题弹窗的关闭按钮文案。',
    order: 225,
    multiline: false,
    languageContents: copyContent('关闭创建主题窗口', 'Close topic builder'),
  },
  [PRODUCT_COPY_IDS.CREATE_GLOBAL_CONFIG_NOTE]: {
    id: PRODUCT_COPY_IDS.CREATE_GLOBAL_CONFIG_NOTE,
    section: 'create',
    title: '创建主题全局配置说明',
    description: '说明创建主题将沿用全局语言、模型和提示词。',
    order: 226,
    multiline: true,
    languageContents: copyContent('当前会沿用全局语言、模型与提示词设置；创建主题时只需要把研究方向说清楚。', 'The topic builder uses your global language, model, and prompt settings.'),
  },
  [PRODUCT_COPY_IDS.CREATE_PREVIEW_EMPTY]: {
    id: PRODUCT_COPY_IDS.CREATE_PREVIEW_EMPTY,
    section: 'create',
    title: '创建主题预览空态',
    description: '预览面板空态说明。',
    order: 230,
    multiline: true,
    languageContents: copyContent('生成预览后，这里会出现主题名称、摘要、关键词和建议阶段数，方便你先确认方向是否准确。', 'The preview will appear here once generated.'),
  },
  [PRODUCT_COPY_IDS.CREATE_PREVIEW_BUTTON]: {
    id: PRODUCT_COPY_IDS.CREATE_PREVIEW_BUTTON,
    section: 'create',
    title: '创建主题预览按钮',
    description: '生成预览按钮。',
    order: 240,
    multiline: false,
    languageContents: copyContent('生成主题预览', 'Generate Preview'),
  },
  [PRODUCT_COPY_IDS.CREATE_PREVIEW_LOADING]: {
    id: PRODUCT_COPY_IDS.CREATE_PREVIEW_LOADING,
    section: 'create',
    title: '创建主题预览加载',
    description: '生成主题预览时的按钮文案。',
    order: 241,
    multiline: false,
    languageContents: copyContent('正在生成预览', 'Generating Preview'),
  },
  [PRODUCT_COPY_IDS.CREATE_PREVIEW_TITLE]: {
    id: PRODUCT_COPY_IDS.CREATE_PREVIEW_TITLE,
    section: 'create',
    title: '创建主题预览标题',
    description: '预览面板顶部标题。',
    order: 242,
    multiline: false,
    languageContents: copyContent('预览', 'Preview'),
  },
  [PRODUCT_COPY_IDS.CREATE_SAVE_BUTTON]: {
    id: PRODUCT_COPY_IDS.CREATE_SAVE_BUTTON,
    section: 'create',
    title: '创建主题保存按钮',
    description: '保存主题按钮。',
    order: 250,
    multiline: false,
    languageContents: copyContent('保存主题', 'Save Topic'),
  },
  [PRODUCT_COPY_IDS.CREATE_SAVE_LOADING]: {
    id: PRODUCT_COPY_IDS.CREATE_SAVE_LOADING,
    section: 'create',
    title: '创建主题保存加载',
    description: '保存主题时的按钮文案。',
    order: 251,
    multiline: false,
    languageContents: copyContent('保存中', 'Saving'),
  },
  [PRODUCT_COPY_IDS.CREATE_SUMMARY_TITLE]: {
    id: PRODUCT_COPY_IDS.CREATE_SUMMARY_TITLE,
    section: 'create',
    title: '创建主题摘要标题',
    description: '预览中的摘要区标题。',
    order: 252,
    multiline: false,
    languageContents: copyContent('摘要', 'Summary'),
  },
  [PRODUCT_COPY_IDS.CREATE_KEYWORDS_TITLE]: {
    id: PRODUCT_COPY_IDS.CREATE_KEYWORDS_TITLE,
    section: 'create',
    title: '创建主题关键词标题',
    description: '预览中的关键词区标题。',
    order: 253,
    multiline: false,
    languageContents: copyContent('关键词', 'Keywords'),
  },
  [PRODUCT_COPY_IDS.CREATE_FOCUS_TITLE]: {
    id: PRODUCT_COPY_IDS.CREATE_FOCUS_TITLE,
    section: 'create',
    title: '创建主题焦点标题',
    description: '预览中的焦点标签标题。',
    order: 254,
    multiline: false,
    languageContents: copyContent('焦点标签', 'Focus Label'),
  },
  [PRODUCT_COPY_IDS.CREATE_STAGE_COUNT_TITLE]: {
    id: PRODUCT_COPY_IDS.CREATE_STAGE_COUNT_TITLE,
    section: 'create',
    title: '创建主题阶段数标题',
    description: '预览中的建议阶段数标题。',
    order: 255,
    multiline: false,
    languageContents: copyContent('建议阶段数', 'Suggested Stages'),
  },
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_ZH]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_ZH, 'create', '创建主题语言选项·中文', '中文源语言选项说明。', 256, '以简体中文为原始输入创建主题，并同步生成完整的 8 语言研究蓝图。', 'Create the topic from Simplified Chinese and generate the full 8-language research blueprint.', true),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_EN]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_EN, 'create', '创建主题语言选项·英文', '英文源语言选项说明。', 257, '以英文作为源语言输入，再把它展开成完整的 8 语言研究蓝图。', 'Use English as the source language and expand it into a full 8-language research blueprint.', true),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_JA]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_JA, 'create', '创建主题语言选项·日文', '日文源语言选项说明。', 258, '从日文原始描述出发，在保留研究判断的同时生成 8 语言主题蓝图。', 'Start from Japanese and keep the same research judgment while building the 8-language blueprint.', true),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_KO]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_KO, 'create', '创建主题语言选项·韩文', '韩文源语言选项说明。', 259, '从韩文原始描述出发，不压平原有语义细节地生成 8 语言主题蓝图。', 'Start from Korean and turn it into an 8-language topic blueprint without flattening the original nuance.', true),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_DE]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_DE, 'create', '创建主题语言选项·德文', '德文源语言选项说明。', 259.1, '以德语作为起点，把同一套研究框架扩展成完整的多语言主题结构。', 'Use German as the origin language and generate the full multilingual topic structure from it.', true),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_FR]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_FR, 'create', '创建主题语言选项·法文', '法文源语言选项说明。', 259.2, '以法语作为源语言输入，再把它扩展成覆盖 8 语言的完整主题蓝图。', 'Use French as the source language and expand it into a complete topic blueprint across 8 languages.', true),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_ES]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_ES, 'create', '创建主题语言选项·西文', '西文源语言选项说明。', 259.3, '以西语作为源语言输入，并把它展开成完整的 8 语言研究主题蓝图。', 'Use Spanish as the source language and unfold it into a full research topic blueprint in 8 languages.', true),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_RU]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_OPTION_RU, 'create', '创建主题语言选项·俄文', '俄文源语言选项说明。', 259.4, '以俄语作为起点，在保留原有问题框架的前提下生成 8 语言主题蓝图。', 'Use Russian as the origin language and keep that framing while generating the 8-language blueprint.', true),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_LEGACY_TITLE]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_LEGACY_TITLE, 'create', '创建主题语言选项·兼容双语标题', '兼容双语模式标题。', 259.5, '中英双语（兼容）', 'Chinese + English (Legacy)'),
  [PRODUCT_COPY_IDS.CREATE_LANGUAGE_LEGACY_DESCRIPTION]: defineCopy(PRODUCT_COPY_IDS.CREATE_LANGUAGE_LEGACY_DESCRIPTION, 'create', '创建主题语言选项·兼容双语说明', '兼容双语模式说明。', 259.6, '保留旧的双语入口，适合仍然依赖中文主叙述加英文锚点的创建方式。', 'Keep the older bilingual entry point for workflows that still rely on Chinese narration plus English anchors.', true),
  [PRODUCT_COPY_IDS.CREATE_NATIVE_EIGHT_LANGUAGES]: defineCopy(PRODUCT_COPY_IDS.CREATE_NATIVE_EIGHT_LANGUAGES, 'create', '创建主题能力标签·八语原生', '创建主题页的能力标签。', 259.7, '8 语言原生蓝图', '8-language native blueprint'),
  [PRODUCT_COPY_IDS.CREATE_MODEL_READY]: defineCopy(PRODUCT_COPY_IDS.CREATE_MODEL_READY, 'create', '创建主题模型状态·就绪', 'Prompt Studio 模型就绪状态。', 259.8, 'Prompt Studio 模型已就绪', 'Prompt Studio model ready'),
  [PRODUCT_COPY_IDS.CREATE_MODEL_MISSING]: defineCopy(PRODUCT_COPY_IDS.CREATE_MODEL_MISSING, 'create', '创建主题模型状态·缺失', 'Prompt Studio 模型缺失状态。', 259.9, '请先在 Prompt Studio 配置模型', 'Configure model in Prompt Studio'),
  [PRODUCT_COPY_IDS.CREATE_COMPATIBLE_HINT]: defineCopy(PRODUCT_COPY_IDS.CREATE_COMPATIBLE_HINT, 'create', '创建主题兼容网关提示', 'OpenAI-compatible 网关提示。', 259.91, '当前语言槽位正在使用 OpenAI-compatible 网关。预览与 8 语言创建仍然可用，但如果提供商能力偏弱，系统会更频繁地退回到确定性脚手架。', 'The current language slot is using an OpenAI-compatible gateway. Preview and 8-language creation still work, but weaker providers may fall back to the deterministic scaffold more often.', true),
  [PRODUCT_COPY_IDS.CREATE_PREVIEW_FAILED]: defineCopy(PRODUCT_COPY_IDS.CREATE_PREVIEW_FAILED, 'create', '创建主题预览失败', '主题预览失败提示。', 259.92, '预览没有成功返回，请检查 Prompt Studio 的模型配置，或稍后再试。', 'Preview did not return successfully. Check the Prompt Studio model configuration or try again later.', true),
  [PRODUCT_COPY_IDS.CREATE_SAVE_FAILED]: defineCopy(PRODUCT_COPY_IDS.CREATE_SAVE_FAILED, 'create', '创建主题保存失败', '主题保存失败提示。', 259.93, '主题保存失败，请先确认预览已生成，再检查后端与模型配置。', 'Topic save failed. Confirm the preview exists first, then check the backend and model configuration.', true),
  [PRODUCT_COPY_IDS.SEARCH_TITLE]: {
    id: PRODUCT_COPY_IDS.SEARCH_TITLE,
    section: 'search',
    title: '全局搜索标题',
    description: '全局搜索弹窗标题。',
    order: 260,
    multiline: false,
    languageContents: copyContent('全局搜索', 'Global Search'),
  },
  [PRODUCT_COPY_IDS.SEARCH_DESCRIPTION]: {
    id: PRODUCT_COPY_IDS.SEARCH_DESCRIPTION,
    section: 'search',
    title: '全局搜索说明',
    description: '全局搜索说明文案。',
    order: 270,
    multiline: true,
    languageContents: copyContent('统一检索主题、节点、论文、章节、图表与公式，并支持直接打开、回到主题或加入工作台继续追问。', 'Search across topics, nodes, papers, sections, figures, tables, and formulas.'),
  },
  [PRODUCT_COPY_IDS.SEARCH_PLACEHOLDER]: {
    id: PRODUCT_COPY_IDS.SEARCH_PLACEHOLDER,
    section: 'search',
    title: '全局搜索占位',
    description: '全局搜索输入框占位。',
    order: 280,
    multiline: false,
    languageContents: copyContent('搜索主题、节点、论文、章节、图表与公式', 'Search topics, nodes, papers, sections, figures, tables, and formulas'),
  },
  [PRODUCT_COPY_IDS.SEARCH_CLOSE]: {
    id: PRODUCT_COPY_IDS.SEARCH_CLOSE,
    section: 'search',
    title: '全局搜索关闭按钮',
    description: '全局搜索弹窗关闭按钮文案。',
    order: 281,
    multiline: false,
    languageContents: copyContent('关闭搜索', 'Close search'),
  },
  [PRODUCT_COPY_IDS.SEARCH_CLEAR]: {
    id: PRODUCT_COPY_IDS.SEARCH_CLEAR,
    section: 'search',
    title: '全局搜索清空按钮',
    description: '全局搜索输入框清空按钮文案。',
    order: 282,
    multiline: false,
    languageContents: copyContent('清空搜索', 'Clear search'),
  },
  [PRODUCT_COPY_IDS.SEARCH_RECENT_TITLE]: {
    id: PRODUCT_COPY_IDS.SEARCH_RECENT_TITLE,
    section: 'search',
    title: '全局搜索最近搜索标题',
    description: '最近搜索区域标题。',
    order: 290,
    multiline: false,
    languageContents: copyContent('最近搜索', 'Recent Searches'),
  },
  [PRODUCT_COPY_IDS.SEARCH_RECENT_EMPTY]: {
    id: PRODUCT_COPY_IDS.SEARCH_RECENT_EMPTY,
    section: 'search',
    title: '全局搜索最近搜索空态',
    description: '还没有最近搜索时的提示。',
    order: 291,
    multiline: true,
    languageContents: copyContent('你的搜索会按主题记下来，方便回到之前的研究线索。', 'Recent searches will appear here as you explore topics.'),
  },
  [PRODUCT_COPY_IDS.SEARCH_RECOMMEND_TITLE]: {
    id: PRODUCT_COPY_IDS.SEARCH_RECOMMEND_TITLE,
    section: 'search',
    title: '全局搜索推荐起点标题',
    description: '推荐起点区域标题。',
    order: 292,
    multiline: false,
    languageContents: copyContent('推荐起点', 'Suggested Starting Points'),
  },
  [PRODUCT_COPY_IDS.SEARCH_EMPTY]: {
    id: PRODUCT_COPY_IDS.SEARCH_EMPTY,
    section: 'search',
    title: '全局搜索无结果',
    description: '无搜索结果时显示的文案。',
    order: 300,
    multiline: true,
    languageContents: copyContent('没有找到对应结果。可以换一个关键词，或先按类型和主题收窄范围。', 'No results found. Try another query or narrow the filters.'),
  },
  [PRODUCT_COPY_IDS.SEARCH_IDLE]: {
    id: PRODUCT_COPY_IDS.SEARCH_IDLE,
    section: 'search',
    title: '全局搜索空闲提示',
    description: '尚未输入搜索词时右侧结果区的提示。',
    order: 301,
    multiline: true,
    languageContents: copyContent('输入关键词后，这里会显示按主题、节点、论文和证据分组的结果。', 'Results grouped by topic, node, paper, and evidence will appear here.'),
  },
  [PRODUCT_COPY_IDS.SEARCH_ALL_TOPICS]: {
    id: PRODUCT_COPY_IDS.SEARCH_ALL_TOPICS,
    section: 'search',
    title: '全局搜索全部主题筛选',
    description: '全局搜索主题筛选中的“全部主题”按钮。',
    order: 302,
    multiline: false,
    languageContents: copyContent('全部主题', 'All Topics'),
  },
  [PRODUCT_COPY_IDS.SEARCH_RESULTS_LABEL]: {
    id: PRODUCT_COPY_IDS.SEARCH_RESULTS_LABEL,
    section: 'search',
    title: '全局搜索结果标题',
    description: '全局搜索结果区和主题内搜索结果区的标题。',
    order: 303,
    multiline: false,
    languageContents: copyContent('搜索结果', 'Results'),
  },
  [PRODUCT_COPY_IDS.SEARCH_OPEN_ACTION]: {
    id: PRODUCT_COPY_IDS.SEARCH_OPEN_ACTION,
    section: 'search',
    title: '全局搜索打开结果动作',
    description: '搜索结果上的打开动作按钮。',
    order: 304,
    multiline: false,
    languageContents: copyContent('打开结果', 'Open'),
  },
  [PRODUCT_COPY_IDS.SEARCH_CONTEXT_ACTION]: {
    id: PRODUCT_COPY_IDS.SEARCH_CONTEXT_ACTION,
    section: 'search',
    title: '全局搜索加入上下文动作',
    description: '搜索结果上的加入上下文动作按钮。',
    order: 305,
    multiline: false,
    languageContents: copyContent('加入上下文', 'Add Context'),
  },
  [PRODUCT_COPY_IDS.SEARCH_FOLLOW_UP_ACTION]: {
    id: PRODUCT_COPY_IDS.SEARCH_FOLLOW_UP_ACTION,
    section: 'search',
    title: '全局搜索继续追问动作',
    description: '搜索结果上的继续追问动作按钮。',
    order: 306,
    multiline: false,
    languageContents: copyContent('继续追问', 'Follow Up'),
  },
  [PRODUCT_COPY_IDS.SEARCH_KEYBOARD_HINT]: {
    id: PRODUCT_COPY_IDS.SEARCH_KEYBOARD_HINT,
    section: 'search',
    title: '全局搜索键盘提示',
    description: '全局搜索左栏的键盘提示文案。',
    order: 307,
    multiline: true,
    languageContents: copyContent('按 Enter 打开结果，按上下方向键切换候选项。', 'Press Enter to open a result and use the arrow keys to move through candidates.'),
  },
  [PRODUCT_COPY_IDS.SEARCH_HINT_LOCATE]: {
    id: PRODUCT_COPY_IDS.SEARCH_HINT_LOCATE,
    section: 'search',
    title: '全局搜索提示·直接定位',
    description: '全局搜索辅助提示。',
    order: 310,
    multiline: true,
    languageContents: copyContent('搜索 section、figure、table 或 formula 时，可以直接跳到正文锚点。', 'Section, figure, table, and formula hits can jump directly to anchors.'),
  },
  [PRODUCT_COPY_IDS.SEARCH_HINT_CONTEXT]: {
    id: PRODUCT_COPY_IDS.SEARCH_HINT_CONTEXT,
    section: 'search',
    title: '全局搜索提示·加入工作台',
    description: '全局搜索辅助提示。',
    order: 320,
    multiline: true,
    languageContents: copyContent('结果可以直接带回主题右侧工作台，继续追问而不重新找上下文。', 'Results can be sent straight into the workbench as context.'),
  },
  [PRODUCT_COPY_IDS.SEARCH_HINT_FILTER]: {
    id: PRODUCT_COPY_IDS.SEARCH_HINT_FILTER,
    section: 'search',
    title: '全局搜索提示·缩窄范围',
    description: '全局搜索辅助提示。',
    order: 330,
    multiline: true,
    languageContents: copyContent('先筛类型，再按主题收窄，适合快速查多分支主题里的某一跳。', 'Filter by type, then narrow by topic for dense multi-branch searches.'),
  },
  [PRODUCT_COPY_IDS.SEARCH_TOPIC_PLACEHOLDER]: {
    id: PRODUCT_COPY_IDS.SEARCH_TOPIC_PLACEHOLDER,
    section: 'search',
    title: '主题内搜索占位',
    description: '主题页右侧 Similar 搜索面板的输入框占位。',
    order: 335,
    multiline: false,
    languageContents: copyContent('在当前主题内搜索节点、论文、章节和证据', 'Search nodes, papers, sections, and evidence within this topic'),
  },
  [PRODUCT_COPY_IDS.SEARCH_TOPIC_DESCRIPTION]: {
    id: PRODUCT_COPY_IDS.SEARCH_TOPIC_DESCRIPTION,
    section: 'search',
    title: '主题内搜索说明',
    description: '主题页右侧 Similar 搜索面板的说明文案。',
    order: 336,
    multiline: true,
    languageContents: copyContent('输入关键词后，这里会返回当前主题内最相关的节点、论文与证据，并支持直接打开或加入上下文。', 'Results stay scoped to the current topic and can be opened directly or added into context.'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_TITLE]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_TITLE,
    section: 'assistant',
    title: '工作台标题',
    description: '右侧工作台主标题。',
    order: 340,
    multiline: false,
    languageContents: copyContent('围绕当前主题继续提问', 'Continue with the current topic'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_EMPTY]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_EMPTY,
    section: 'assistant',
    title: '工作台空态说明',
    description: '右侧工作台空态提示。',
    order: 350,
    multiline: true,
    languageContents: copyContent('这里适合继续问主线、分支、证据、图表、相似论文和下一步问题。你也可以先把节点、图表或搜索结果加入上下文，再发问。', 'Ask about the line, branches, evidence, figures, related papers, or next questions.'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_CAPABILITY_LINE]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_CAPABILITY_LINE,
    section: 'assistant',
    title: '工作台能力说明',
    description: '右侧工作台空态中的能力说明文案。',
    order: 355,
    multiline: true,
    languageContents: copyContent('支持高亮后提问、加入上下文、追问证据、扩展相似论文，也支持把当前节点重新放回整条研究主线里解释。', 'Highlight, add context, inspect evidence, expand into related papers, or place a node back into the full research line.'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_INPUT_PLACEHOLDER]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_INPUT_PLACEHOLDER,
    section: 'assistant',
    title: '工作台输入占位',
    description: '右侧工作台输入框占位。',
    order: 360,
    multiline: false,
    languageContents: copyContent('围绕当前主题、节点、论文或证据继续追问', 'Ask about the current topic, node, paper, or evidence'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_DRAWER_BUTTON]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_DRAWER_BUTTON,
    section: 'assistant',
    title: '工作台入口按钮',
    description: '主题页右下角打开工作台的按钮文案。',
    order: 365,
    multiline: false,
    languageContents: copyContent('对话侧栏', 'Open Workbench'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_STARTER_PROMPT]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_STARTER_PROMPT,
    section: 'assistant',
    title: '工作台起始提问',
    description: '右侧工作台空态里默认展示的起始提问。',
    order: 366,
    multiline: true,
    languageContents: copyContent('请按研究主线解释当前主题最关键的分叉、代表节点和最稳固的证据。', 'Explain the key branch, representative nodes, and strongest evidence along this topic’s main research line.'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_ACTION_NEW_CHAT]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_ACTION_NEW_CHAT,
    section: 'assistant',
    title: '工作台新对话按钮',
    description: '右侧工作台头部的新对话动作。',
    order: 367,
    multiline: false,
    languageContents: copyContent('新对话', 'New Chat'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_ACTION_HISTORY]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_ACTION_HISTORY,
    section: 'assistant',
    title: '工作台历史按钮',
    description: '右侧工作台头部的历史动作。',
    order: 368,
    multiline: false,
    languageContents: copyContent('历史', 'History'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_ACTION_MODEL]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_ACTION_MODEL,
    section: 'assistant',
    title: '工作台模型入口',
    description: '右侧工作台头部的模型入口文案。',
    order: 369,
    multiline: false,
    languageContents: copyContent('模型入口', 'Model'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_ACTION_COLLAPSE]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_ACTION_COLLAPSE,
    section: 'assistant',
    title: '工作台收起按钮',
    description: '右侧工作台收起按钮文案。',
    order: 3691,
    multiline: false,
    languageContents: copyContent('收起工作台', 'Collapse Workbench'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_TAB_ASSISTANT]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_TAB_ASSISTANT,
    section: 'assistant',
    title: '工作台标签·助手',
    description: '右侧工作台的助手 tab。',
    order: 3692,
    multiline: false,
    languageContents: copyContent('助手', 'Assistant'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_TAB_SIMILAR]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_TAB_SIMILAR,
    section: 'assistant',
    title: '工作台标签·搜索',
    description: '右侧工作台的搜索 tab。',
    order: 3693,
    multiline: false,
    languageContents: copyContent('搜索', 'Search'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_TAB_RESOURCES]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_TAB_RESOURCES,
    section: 'assistant',
    title: '工作台标签·资料',
    description: '右侧工作台的资料 tab。',
    order: 3694,
    multiline: false,
    languageContents: copyContent('资料', 'Resources'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_CONTEXT_LABEL]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_CONTEXT_LABEL,
    section: 'assistant',
    title: '工作台上下文标签',
    description: '输入框上方的上下文标签。',
    order: 3695,
    multiline: false,
    languageContents: copyContent('上下文', 'Context'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_CONTEXT_TITLE]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_CONTEXT_TITLE,
    section: 'assistant',
    title: '工作台上下文区标题',
    description: '资源面板中的上下文标题。',
    order: 3696,
    multiline: false,
    languageContents: copyContent('当前上下文', 'Current Context'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_CONTEXT_EMPTY]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_CONTEXT_EMPTY,
    section: 'assistant',
    title: '工作台上下文空态',
    description: '资源面板中上下文为空时的提示。',
    order: 3697,
    multiline: true,
    languageContents: copyContent('这里还没有加入上下文。你可以从主题卡、搜索结果、图表证据或正文锚点继续补充。', 'No context has been added yet. You can pull in topic cards, search hits, evidence, or article anchors.'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_EVIDENCE_TITLE]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_EVIDENCE_TITLE,
    section: 'assistant',
    title: '工作台证据标题',
    description: '资源面板中的关键证据标题。',
    order: 3698,
    multiline: false,
    languageContents: copyContent('关键证据', 'Key Evidence'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_RESOURCES_TITLE]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_RESOURCES_TITLE,
    section: 'assistant',
    title: '工作台资料标题',
    description: '资源面板中的延伸资料标题。',
    order: 3699,
    multiline: false,
    languageContents: copyContent('延伸资料', 'Reading References'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_CAPTURE_SELECTION]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_CAPTURE_SELECTION,
    section: 'assistant',
    title: '工作台加入选区',
    description: '上下文托盘中的加入当前选区动作。',
    order: 3700,
    multiline: false,
    languageContents: copyContent('加入当前选区', 'Add Selection'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_SEARCH_TOGGLE]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_SEARCH_TOGGLE,
    section: 'assistant',
    title: '工作台检索开关',
    description: '输入框上方的检索开关。',
    order: 3701,
    multiline: false,
    languageContents: copyContent('检索', 'Search'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_THINKING_TOGGLE]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_THINKING_TOGGLE,
    section: 'assistant',
    title: '工作台推理开关',
    description: '输入框上方的推理开关。',
    order: 3702,
    multiline: false,
    languageContents: copyContent('推理', 'Thinking'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_STYLE_BRIEF]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_STYLE_BRIEF,
    section: 'assistant',
    title: '工作台风格·简洁',
    description: '输入框上方的简洁风格按钮。',
    order: 3703,
    multiline: false,
    languageContents: copyContent('简洁', 'Brief'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_STYLE_BALANCED]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_STYLE_BALANCED,
    section: 'assistant',
    title: '工作台风格·平衡',
    description: '输入框上方的平衡风格按钮。',
    order: 3704,
    multiline: false,
    languageContents: copyContent('平衡', 'Balanced'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_STYLE_DEEP]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_STYLE_DEEP,
    section: 'assistant',
    title: '工作台风格·深入',
    description: '输入框上方的深入风格按钮。',
    order: 3705,
    multiline: false,
    languageContents: copyContent('深入', 'Deep'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_STATUS_WORKING]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_STATUS_WORKING,
    section: 'assistant',
    title: '工作台状态·处理中',
    description: '输入框底部的处理中状态。',
    order: 3706,
    multiline: false,
    languageContents: copyContent('正在整理回答', 'Preparing the answer'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_STATUS_READY]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_STATUS_READY,
    section: 'assistant',
    title: '工作台状态·可提问',
    description: '输入框底部的可提问状态。',
    order: 3707,
    multiline: false,
    languageContents: copyContent('随时可以继续追问', 'Ready for the next question'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_SEND]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_SEND,
    section: 'assistant',
    title: '工作台发送按钮',
    description: '输入框发送按钮文案。',
    order: 3708,
    multiline: false,
    languageContents: copyContent('发送', 'Send'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_MODEL_READY]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_MODEL_READY,
    section: 'assistant',
    title: '工作台模型状态·就绪',
    description: '模型槽位都已配置时的文案。',
    order: 3709,
    multiline: false,
    languageContents: copyContent('模型已就绪', 'Models Ready'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_MODEL_PARTIAL]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_MODEL_PARTIAL,
    section: 'assistant',
    title: '工作台模型状态·部分可用',
    description: '只有一个模型槽位可用时的文案。',
    order: 3710,
    multiline: false,
    languageContents: copyContent('模型部分可用', 'Partially Ready'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_MODEL_MISSING]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_MODEL_MISSING,
    section: 'assistant',
    title: '工作台模型状态·缺失',
    description: '没有可用模型槽位时的文案。',
    order: 3711,
    multiline: false,
    languageContents: copyContent('配置模型', 'Configure Model'),
  },
  [PRODUCT_COPY_IDS.ASSISTANT_REQUEST_FAILED]: {
    id: PRODUCT_COPY_IDS.ASSISTANT_REQUEST_FAILED,
    section: 'assistant',
    title: '工作台请求失败提示',
    description: '请求失败时保留在对话中的提示。',
    order: 3712,
    multiline: true,
    languageContents: copyContent('这次请求未能完成，但当前工作台、草稿和上下文都还在。', 'The request did not complete, but your workbench, draft, and context are still here.'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_TITLE]: {
    id: PRODUCT_COPY_IDS.RESEARCH_TITLE,
    section: 'research',
    title: '研究编排标题',
    description: '研究编排页标题。',
    order: 370,
    multiline: false,
    languageContents: copyContent('全局研究编排', 'Research Orchestration'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DESCRIPTION]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DESCRIPTION,
    section: 'research',
    title: '研究编排说明',
    description: '研究编排页导语。',
    order: 380,
    multiline: true,
    languageContents: copyContent('在这里统一安排多个主题的自动化研究、定时任务与阶段轮次，让主题主线持续生长，而不把编排压回单个主题页里。', 'Coordinate multi-topic research, schedules, and stage rounds from one place.'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_CREATE_TITLE]: {
    id: PRODUCT_COPY_IDS.RESEARCH_CREATE_TITLE,
    section: 'research',
    title: '研究编排创建区标题',
    description: '研究编排创建区域标题。',
    order: 390,
    multiline: false,
    languageContents: copyContent('一次安排多个主题', 'Create Multi-topic Runs'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_TASKS_TITLE]: {
    id: PRODUCT_COPY_IDS.RESEARCH_TASKS_TITLE,
    section: 'research',
    title: '研究编排任务区标题',
    description: '研究编排任务区域标题。',
    order: 400,
    multiline: false,
    languageContents: copyContent('当前编排任务', 'Active Runs'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_EMPTY]: {
    id: PRODUCT_COPY_IDS.RESEARCH_EMPTY,
    section: 'research',
    title: '研究编排空态',
    description: '研究编排没有任务时的提示。',
    order: 410,
    multiline: true,
    languageContents: copyContent('还没有研究编排任务。先选择主题，再确定每个阶段需要多少轮请求来收束内容。', 'No orchestration runs yet. Select topics and define stage rounds to begin.'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_LOADING]: {
    id: PRODUCT_COPY_IDS.RESEARCH_LOADING,
    section: 'research',
    title: '研究编排加载提示',
    description: '研究编排页加载中的提示文案。',
    order: 411,
    multiline: false,
    languageContents: copyContent('正在加载研究编排…', 'Loading research orchestration…'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_CREATE_BUTTON]: {
    id: PRODUCT_COPY_IDS.RESEARCH_CREATE_BUTTON,
    section: 'research',
    title: '研究编排创建按钮',
    description: '研究编排页的主操作按钮文案。',
    order: 412,
    multiline: false,
    languageContents: copyContent('创建编排任务', 'Create orchestration task'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_SETTINGS_BUTTON]: {
    id: PRODUCT_COPY_IDS.RESEARCH_SETTINGS_BUTTON,
    section: 'research',
    title: '研究编排设置按钮',
    description: '研究编排页通往设置中心的按钮文案。',
    order: 413,
    multiline: false,
    languageContents: copyContent('调整模型与提示词', 'Adjust models and prompts'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_WINDOW_EYEBROW]: {
    id: PRODUCT_COPY_IDS.RESEARCH_WINDOW_EYEBROW,
    section: 'research',
    title: '研究编排窗口眉标',
    description: '研究编排主窗口顶部眉标。',
    order: 414,
    multiline: false,
    languageContents: copyContent('自动研究窗口', 'Automation Window'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_FREQUENCY_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_FREQUENCY_LABEL,
    section: 'research',
    title: '研究编排调度节奏标签',
    description: '研究编排页中的调度节奏字段标签。',
    order: 415,
    multiline: false,
    languageContents: copyContent('调度节奏', 'Schedule'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_ACTION_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_ACTION_LABEL,
    section: 'research',
    title: '研究编排动作类型标签',
    description: '研究编排页中的动作类型字段标签。',
    order: 416,
    multiline: false,
    languageContents: copyContent('动作类型', 'Action'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_ACTION_DISCOVER]: {
    id: PRODUCT_COPY_IDS.RESEARCH_ACTION_DISCOVER,
    section: 'research',
    title: '研究编排动作·发现',
    description: '研究编排页中的发现+生成动作。',
    order: 417,
    multiline: false,
    languageContents: copyContent('论文发现 + 生成', 'Discovery + Generation'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_ACTION_REFRESH]: {
    id: PRODUCT_COPY_IDS.RESEARCH_ACTION_REFRESH,
    section: 'research',
    title: '研究编排动作·刷新',
    description: '研究编排页中的刷新动作。',
    order: 418,
    multiline: false,
    languageContents: copyContent('刷新内容', 'Refresh Content'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_ACTION_SYNC]: {
    id: PRODUCT_COPY_IDS.RESEARCH_ACTION_SYNC,
    section: 'research',
    title: '研究编排动作·同步',
    description: '研究编排页中的同步动作。',
    order: 419,
    multiline: false,
    languageContents: copyContent('同步状态', 'Sync Status'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_STAGE_ROUNDS_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_STAGE_ROUNDS_LABEL,
    section: 'research',
    title: '研究编排阶段轮数标签',
    description: '研究编排页中的阶段轮数说明。',
    order: 4191,
    multiline: true,
    languageContents: copyContent('每个阶段需要多少轮请求才能确定', 'How many passes each stage needs before it settles'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_SNAPSHOT_TITLE]: {
    id: PRODUCT_COPY_IDS.RESEARCH_SNAPSHOT_TITLE,
    section: 'research',
    title: '研究编排快照标题',
    description: '研究编排页当前快照卡片标题。',
    order: 4192,
    multiline: false,
    languageContents: copyContent('当前快照', 'Current Snapshot'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_TASK_COUNT_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_TASK_COUNT_LABEL,
    section: 'research',
    title: '研究编排任务数量标签',
    description: '研究编排页快照中的任务数量。',
    order: 4193,
    multiline: false,
    languageContents: copyContent('任务', 'Tasks'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_ACTIVE_COUNT_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_ACTIVE_COUNT_LABEL,
    section: 'research',
    title: '研究编排运行中数量标签',
    description: '研究编排页快照中的运行中数量。',
    order: 4194,
    multiline: false,
    languageContents: copyContent('运行中', 'Active'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_TOPIC_COUNT_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_TOPIC_COUNT_LABEL,
    section: 'research',
    title: '研究编排主题数量标签',
    description: '研究编排页快照中的主题数量。',
    order: 4195,
    multiline: false,
    languageContents: copyContent('主题', 'Topics'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_SELECTION_TITLE]: {
    id: PRODUCT_COPY_IDS.RESEARCH_SELECTION_TITLE,
    section: 'research',
    title: '研究编排本次编排标题',
    description: '研究编排页本次编排卡片标题。',
    order: 4196,
    multiline: false,
    languageContents: copyContent('本次编排', 'This Run'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_SELECTION_READY]: {
    id: PRODUCT_COPY_IDS.RESEARCH_SELECTION_READY,
    section: 'research',
    title: '研究编排本次编排已选择提示',
    description: '研究编排页在已选主题时的说明。',
    order: 4197,
    multiline: true,
    languageContents: copyContent('已选主题会按同一调度节奏进入自动研究，阶段轮数会分别作为每一步的收束阈值。', 'Selected topics will follow the same schedule, while stage rounds act as convergence thresholds for each step.'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_SELECTION_EMPTY]: {
    id: PRODUCT_COPY_IDS.RESEARCH_SELECTION_EMPTY,
    section: 'research',
    title: '研究编排本次编排空态',
    description: '研究编排页尚未选择主题时的说明。',
    order: 4198,
    multiline: true,
    languageContents: copyContent('先选择一个或多个主题，再决定调度节奏和阶段轮数。', 'Select one or more topics first, then decide the schedule and stage rounds.'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_TASKS_EYEBROW]: {
    id: PRODUCT_COPY_IDS.RESEARCH_TASKS_EYEBROW,
    section: 'research',
    title: '研究编排任务眉标',
    description: '任务列表区域顶部眉标。',
    order: 4199,
    multiline: false,
    languageContents: copyContent('任务运行', 'Runs'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_GLOBAL_TASK]: {
    id: PRODUCT_COPY_IDS.RESEARCH_GLOBAL_TASK,
    section: 'research',
    title: '研究编排全局任务标签',
    description: '任务缺少主题时的兜底标签。',
    order: 4200,
    multiline: false,
    languageContents: copyContent('全局任务', 'Global Task'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_STATUS_RUNNING]: {
    id: PRODUCT_COPY_IDS.RESEARCH_STATUS_RUNNING,
    section: 'research',
    title: '研究编排状态·运行中',
    description: '任务运行中的状态标签。',
    order: 4201,
    multiline: false,
    languageContents: copyContent('运行中', 'Running'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_STATUS_PAUSED]: {
    id: PRODUCT_COPY_IDS.RESEARCH_STATUS_PAUSED,
    section: 'research',
    title: '研究编排状态·已暂停',
    description: '任务暂停时的状态标签。',
    order: 4202,
    multiline: false,
    languageContents: copyContent('已暂停', 'Paused'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_RUN_BUTTON]: {
    id: PRODUCT_COPY_IDS.RESEARCH_RUN_BUTTON,
    section: 'research',
    title: '研究编排立即运行按钮',
    description: '任务卡片上的立即运行按钮。',
    order: 4203,
    multiline: false,
    languageContents: copyContent('立即运行', 'Run Now'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_PAUSE_BUTTON]: {
    id: PRODUCT_COPY_IDS.RESEARCH_PAUSE_BUTTON,
    section: 'research',
    title: '研究编排暂停按钮',
    description: '任务卡片上的暂停按钮。',
    order: 4204,
    multiline: false,
    languageContents: copyContent('暂停', 'Pause'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_RESUME_BUTTON]: {
    id: PRODUCT_COPY_IDS.RESEARCH_RESUME_BUTTON,
    section: 'research',
    title: '研究编排恢复按钮',
    description: '任务卡片上的恢复按钮。',
    order: 4205,
    multiline: false,
    languageContents: copyContent('恢复', 'Resume'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_RESET_BUTTON]: {
    id: PRODUCT_COPY_IDS.RESEARCH_RESET_BUTTON,
    section: 'research',
    title: '研究编排重置按钮',
    description: '任务卡片上的重置按钮。',
    order: 4206,
    multiline: false,
    languageContents: copyContent('重置', 'Reset'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DELETE_BUTTON]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DELETE_BUTTON,
    section: 'research',
    title: '研究编排删除按钮',
    description: '任务卡片上的删除按钮。',
    order: 4207,
    multiline: false,
    languageContents: copyContent('删除', 'Delete'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DETAIL_EYEBROW]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DETAIL_EYEBROW,
    section: 'research',
    title: '研究编排细节眉标',
    description: '运行细节区域的顶部眉标。',
    order: 4208,
    multiline: false,
    languageContents: copyContent('运行细节', 'Run Details'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DETAIL_EMPTY_TITLE]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DETAIL_EMPTY_TITLE,
    section: 'research',
    title: '研究编排细节空态标题',
    description: '尚未选择任务时右侧区域标题。',
    order: 4209,
    multiline: false,
    languageContents: copyContent('选择一个任务查看细节', 'Select a run to inspect'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DETAIL_EMPTY]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DETAIL_EMPTY,
    section: 'research',
    title: '研究编排细节空态说明',
    description: '尚未选择任务时右侧区域说明。',
    order: 4210,
    multiline: true,
    languageContents: copyContent('从左侧选择一个任务后，这里会展开当前阶段、阶段进度和运行历史。', 'Choose a run from the left to inspect the current stage, stage progress, and execution history.'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DETAIL_STAGE_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DETAIL_STAGE_LABEL,
    section: 'research',
    title: '研究编排细节当前阶段标签',
    description: '运行细节中的当前阶段统计标签。',
    order: 4211,
    multiline: false,
    languageContents: copyContent('当前阶段', 'Current Stage'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DETAIL_PROGRESS_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DETAIL_PROGRESS_LABEL,
    section: 'research',
    title: '研究编排细节阶段进度标签',
    description: '运行细节中的阶段进度统计标签。',
    order: 4212,
    multiline: false,
    languageContents: copyContent('阶段进度', 'Stage Progress'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DETAIL_DISCOVERED_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DETAIL_DISCOVERED_LABEL,
    section: 'research',
    title: '研究编排细节累计发现标签',
    description: '运行细节中的累计发现统计标签。',
    order: 4213,
    multiline: false,
    languageContents: copyContent('累计发现', 'Discovered'),
  },
  [PRODUCT_COPY_IDS.RESEARCH_DETAIL_GENERATED_LABEL]: {
    id: PRODUCT_COPY_IDS.RESEARCH_DETAIL_GENERATED_LABEL,
    section: 'research',
    title: '研究编排细节已生成内容标签',
    description: '运行细节中的已生成内容统计标签。',
    order: 4214,
    multiline: false,
    languageContents: copyContent('已生成内容', 'Generated'),
  },
  [PRODUCT_COPY_IDS.READING_BACK_HOME]: {
    id: PRODUCT_COPY_IDS.READING_BACK_HOME,
    section: 'reading',
    title: '文章页返回首页',
    description: '节点页或论文页不可用时的返回首页入口。',
    order: 4300,
    multiline: false,
    languageContents: copyContent('返回首页', 'Back Home'),
  },
  [PRODUCT_COPY_IDS.READING_BACK_TOPIC]: {
    id: PRODUCT_COPY_IDS.READING_BACK_TOPIC,
    section: 'reading',
    title: '文章页返回主题',
    description: '节点页与论文页顶部返回主题的入口。',
    order: 4301,
    multiline: false,
    languageContents: copyContent('返回主题', 'Back to Topic'),
  },
  [PRODUCT_COPY_IDS.READING_NODE_LOADING]: {
    id: PRODUCT_COPY_IDS.READING_NODE_LOADING,
    section: 'reading',
    title: '节点页加载中',
    description: '节点文章页面的加载文案。',
    order: 4302,
    multiline: false,
    languageContents: copyContent('正在加载节点文章…', 'Loading node article...'),
  },
  [PRODUCT_COPY_IDS.READING_NODE_LOADING_TITLE]: {
    id: PRODUCT_COPY_IDS.READING_NODE_LOADING_TITLE,
    section: 'reading',
    title: '节点页加载标题',
    description: '节点文章加载阶段的文档标题。',
    order: 4303,
    multiline: false,
    languageContents: copyContent('节点文章', 'Node Article'),
  },
  [PRODUCT_COPY_IDS.READING_NODE_UNAVAILABLE_TITLE]: {
    id: PRODUCT_COPY_IDS.READING_NODE_UNAVAILABLE_TITLE,
    section: 'reading',
    title: '节点页不可用标题',
    description: '节点文章不可用时的标题。',
    order: 4304,
    multiline: false,
    languageContents: copyContent('节点暂时不可用', 'Node Unavailable'),
  },
  [PRODUCT_COPY_IDS.READING_PAPER_LOADING]: {
    id: PRODUCT_COPY_IDS.READING_PAPER_LOADING,
    section: 'reading',
    title: '论文页加载中',
    description: '论文文章页面的加载文案。',
    order: 4305,
    multiline: false,
    languageContents: copyContent('正在加载论文文章…', 'Loading paper article...'),
  },
  [PRODUCT_COPY_IDS.READING_PAPER_LOADING_TITLE]: {
    id: PRODUCT_COPY_IDS.READING_PAPER_LOADING_TITLE,
    section: 'reading',
    title: '论文页加载标题',
    description: '论文文章加载阶段的文档标题。',
    order: 4306,
    multiline: false,
    languageContents: copyContent('论文深读', 'Paper Reading'),
  },
  [PRODUCT_COPY_IDS.READING_PAPER_UNAVAILABLE_TITLE]: {
    id: PRODUCT_COPY_IDS.READING_PAPER_UNAVAILABLE_TITLE,
    section: 'reading',
    title: '论文页不可用标题',
    description: '论文文章不可用时的标题。',
    order: 4307,
    multiline: false,
    languageContents: copyContent('论文暂时不可用', 'Paper Unavailable'),
  },
  [PRODUCT_COPY_IDS.READING_OPEN_PAPER]: {
    id: PRODUCT_COPY_IDS.READING_OPEN_PAPER,
    section: 'reading',
    title: '节点页打开论文',
    description: '节点文章中逐篇论文段落的入口。',
    order: 4308,
    multiline: false,
    languageContents: copyContent('打开论文', 'Open Paper'),
  },
  [PRODUCT_COPY_IDS.READING_WHY_IT_MATTERS]: {
    id: PRODUCT_COPY_IDS.READING_WHY_IT_MATTERS,
    section: 'reading',
    title: '证据块为什么重要',
    description: '图表公式解释后的“为什么重要”标签。',
    order: 4309,
    multiline: false,
    languageContents: copyContent('为什么重要：', 'Why it matters:'),
  },
  [PRODUCT_COPY_IDS.TODAY_EYEBROW]: {
    id: PRODUCT_COPY_IDS.TODAY_EYEBROW,
    section: 'library',
    title: '快照页眉标',
    description: '今日研究快照页顶部眉标。',
    order: 4400,
    multiline: false,
    languageContents: copyContent('Daily Snapshot', 'Daily Snapshot'),
  },
  [PRODUCT_COPY_IDS.TODAY_TITLE]: {
    id: PRODUCT_COPY_IDS.TODAY_TITLE,
    section: 'library',
    title: '快照页标题',
    description: '快照页标题。',
    order: 4401,
    multiline: false,
    languageContents: copyContent('今日研究快照', 'Research Snapshot'),
  },
  [PRODUCT_COPY_IDS.TODAY_DESCRIPTION]: {
    id: PRODUCT_COPY_IDS.TODAY_DESCRIPTION,
    section: 'library',
    title: '快照页说明',
    description: '快照页主说明文案。',
    order: 4402,
    multiline: true,
    languageContents: copyContent('把每个主题截至所选日期的最新推进位置收成一页连续快照，方便你判断今天应该从哪条主线继续往下读。', 'Compress each topic into a date-bound snapshot so you can immediately see where to continue reading.'),
  },
  [PRODUCT_COPY_IDS.TODAY_LOADING]: {
    id: PRODUCT_COPY_IDS.TODAY_LOADING,
    section: 'library',
    title: '快照页加载中',
    description: '快照页加载文案。',
    order: 4403,
    multiline: false,
    languageContents: copyContent('正在加载主题快照…', 'Loading snapshots...'),
  },
  [PRODUCT_COPY_IDS.TODAY_EMPTY]: {
    id: PRODUCT_COPY_IDS.TODAY_EMPTY,
    section: 'library',
    title: '快照页空态',
    description: '快照页无结果时的文案。',
    order: 4404,
    multiline: true,
    languageContents: copyContent('当前日期范围内还没有可展示的主题快照。你可以先创建主题，或切换日期后再查看。', 'No topic snapshots are available for the selected date range yet.'),
  },
  [PRODUCT_COPY_IDS.TODAY_CARD_EYEBROW]: {
    id: PRODUCT_COPY_IDS.TODAY_CARD_EYEBROW,
    section: 'library',
    title: '快照卡片眉标',
    description: '每个快照卡片顶部的小眉标。',
    order: 4405,
    multiline: false,
    languageContents: copyContent('Today View', 'Today View'),
  },
  [PRODUCT_COPY_IDS.TODAY_STAGE_LABEL]: {
    id: PRODUCT_COPY_IDS.TODAY_STAGE_LABEL,
    section: 'library',
    title: '快照阶段标签',
    description: '快照卡片里“阶段”前缀。',
    order: 4406,
    multiline: false,
    languageContents: copyContent('阶段', 'Stage'),
  },
  [PRODUCT_COPY_IDS.TODAY_STAGE_UNIT]: {
    id: PRODUCT_COPY_IDS.TODAY_STAGE_UNIT,
    section: 'library',
    title: '快照阶段数量单位',
    description: '快照页统计里的阶段数量单位。',
    order: 4407,
    multiline: false,
    languageContents: copyContent('个阶段', 'stages'),
  },
  [PRODUCT_COPY_IDS.TODAY_NODE_UNIT]: {
    id: PRODUCT_COPY_IDS.TODAY_NODE_UNIT,
    section: 'library',
    title: '快照节点数量单位',
    description: '快照页统计里的节点数量单位。',
    order: 4408,
    multiline: false,
    languageContents: copyContent('个节点', 'nodes'),
  },
  [PRODUCT_COPY_IDS.TODAY_NO_NODE]: {
    id: PRODUCT_COPY_IDS.TODAY_NO_NODE,
    section: 'library',
    title: '快照无节点更新',
    description: '主题在所选日期前没有可展示节点时的说明。',
    order: 4409,
    multiline: true,
    languageContents: copyContent('截至所选日期，这个主题还没有可展示的节点更新。你仍然可以进入主题页查看完整研究结构。', 'This topic has no visible node update before the selected date, but you can still open the topic page for the full structure.'),
  },
  [PRODUCT_COPY_IDS.TODAY_OPEN_NODE]: {
    id: PRODUCT_COPY_IDS.TODAY_OPEN_NODE,
    section: 'library',
    title: '快照打开节点',
    description: '快照卡片操作按钮。',
    order: 4410,
    multiline: false,
    languageContents: copyContent('打开节点', 'Open Node'),
  },
  [PRODUCT_COPY_IDS.TODAY_OPEN_TOPIC]: {
    id: PRODUCT_COPY_IDS.TODAY_OPEN_TOPIC,
    section: 'library',
    title: '快照打开主题',
    description: '快照卡片操作按钮。',
    order: 4411,
    multiline: false,
    languageContents: copyContent('打开主题', 'Open Topic'),
  },
  [PRODUCT_COPY_IDS.FAVORITES_EYEBROW]: {
    id: PRODUCT_COPY_IDS.FAVORITES_EYEBROW,
    section: 'library',
    title: '收藏页眉标',
    description: '收藏页顶部眉标。',
    order: 4420,
    multiline: false,
    languageContents: copyContent(
      '研究笔记',
      'Research Notebook',
      '研究ノート',
      '연구 노트',
      'Forschungsnotizen',
      'Carnet de recherche',
      'Cuaderno de investigación',
      'Исследовательский блокнот',
    ),
  },
  [PRODUCT_COPY_IDS.FAVORITES_TITLE]: {
    id: PRODUCT_COPY_IDS.FAVORITES_TITLE,
    section: 'library',
    title: '收藏页标题',
    description: '收藏页标题。',
    order: 4421,
    multiline: false,
    languageContents: copyContent(
      '研究笔记',
      'Research Notebook',
      '研究ノート',
      '연구 노트',
      'Forschungsnotizen',
      'Carnet de recherche',
      'Cuaderno de investigación',
      'Исследовательский блокнот',
    ),
  },
  [PRODUCT_COPY_IDS.FAVORITES_DESCRIPTION]: {
    id: PRODUCT_COPY_IDS.FAVORITES_DESCRIPTION,
    section: 'library',
    title: '收藏页说明',
    description: '收藏页主说明文案。',
    order: 4422,
    multiline: true,
    languageContents: copyContent(
      '这里保存你在阅读过程中真正想带走的内容，包括 AI 的讲解、关键证据、节点线索与论文摘录，方便后续统一回看、整理和导出。',
      'This is where the material worth keeping lives: AI explanations, decisive evidence, node threads, and paper excerpts you can revisit, organize, and export later.',
      'ここには、読み進める中で本当に持ち帰りたい内容を残します。AI の解説、重要な証拠、ノードの線索、論文抜粋をあとから振り返り、整理し、書き出せます。',
      '여기에는 읽는 과정에서 정말 남겨 둘 가치가 있는 내용을 모읍니다. AI 해설, 핵심 증거, 노드 흐름, 논문 발췌를 나중에 다시 보고 정리하고 내보낼 수 있습니다.',
      'Hier liegt das Material, das es wirklich wert ist, festzuhalten: KI-Einordnungen, entscheidende Evidenz, Knotenfäden und Paper-Auszüge, die Sie später erneut prüfen, ordnen und exportieren können.',
      'Ici se trouvent les éléments qui méritent vraiment d’être conservés : analyses IA, preuves décisives, fils de nœuds et extraits de papiers à relire, organiser et exporter plus tard.',
      'Aquí vive el material que realmente merece conservarse: explicaciones de IA, evidencia decisiva, hilos de nodos y extractos de papers que luego puedes revisar, ordenar y exportar.',
      'Здесь собраны материалы, которые действительно стоит сохранить: пояснения ИИ, ключевые доказательства, нити узлов и фрагменты статей, к которым можно позже вернуться, упорядочить и экспортировать.',
    ),
  },
  [PRODUCT_COPY_IDS.FAVORITES_EMPTY]: {
    id: PRODUCT_COPY_IDS.FAVORITES_EMPTY,
    section: 'library',
    title: '收藏页空态',
    description: '收藏页为空时的文案。',
    order: 4423,
    multiline: true,
    languageContents: copyContent(
      '还没有沉淀下来的研究笔记。你可以在主题工作台里收录 AI 回答、当前证据或论文摘录，这里会自动汇总。',
      'No research notes have been saved yet. Capture AI answers, current evidence, or paper excerpts from a topic workbench and they will collect here automatically.',
      'まだ研究ノートは保存されていません。トピック作業台で AI の回答、現在の証拠、論文抜粋を収録すると、ここに自動で集約されます。',
      '아직 저장된 연구 노트가 없습니다. 주제 작업대에서 AI 답변, 현재 증거, 논문 발췌를 저장하면 이곳에 자동으로 모입니다.',
      'Es wurden noch keine Forschungsnotizen gespeichert. Halten Sie KI-Antworten, aktuelle Evidenz oder Paper-Auszüge im Themen-Workbench fest, dann sammeln sie sich hier automatisch.',
      'Aucune note de recherche n’a encore été enregistrée. Capturez des réponses IA, des preuves actuelles ou des extraits de papiers depuis un workbench de sujet, et ils seront rassemblés ici automatiquement.',
      'Todavía no se ha guardado ninguna nota de investigación. Guarda respuestas de IA, evidencia actual o extractos de papers desde un workbench de tema y se reunirán aquí automáticamente.',
      'Исследовательские заметки пока не сохранены. Сохраняйте ответы ИИ, текущие доказательства или фрагменты статей из рабочего стола темы, и они автоматически соберутся здесь.',
    ),
  },
  [PRODUCT_COPY_IDS.FAVORITES_BACK_HOME]: {
    id: PRODUCT_COPY_IDS.FAVORITES_BACK_HOME,
    section: 'library',
    title: '收藏页返回首页',
    description: '收藏页顶部返回入口。',
    order: 4424,
    multiline: false,
    languageContents: copyContent(
      '返回首页',
      'Back to Home',
      'ホームに戻る',
      '홈으로 돌아가기',
      'Zurück zur Startseite',
      'Retour à l’accueil',
      'Volver al inicio',
      'Вернуться на главную',
    ),
  },
  [PRODUCT_COPY_IDS.FAVORITES_EXPORT]: {
    id: PRODUCT_COPY_IDS.FAVORITES_EXPORT,
    section: 'library',
    title: '收藏页导出',
    description: '收藏页导出按钮。',
    order: 4425,
    multiline: false,
    languageContents: copyContent('导出 PDF', 'Export PDF'),
  },
  [PRODUCT_COPY_IDS.FAVORITES_OPEN_PAPER]: {
    id: PRODUCT_COPY_IDS.FAVORITES_OPEN_PAPER,
    section: 'library',
    title: '收藏页打开论文',
    description: '收藏卡片的打开论文按钮。',
    order: 4426,
    multiline: false,
    languageContents: copyContent('打开论文', 'Open Paper'),
  },
  [PRODUCT_COPY_IDS.FAVORITES_REMOVE]: {
    id: PRODUCT_COPY_IDS.FAVORITES_REMOVE,
    section: 'library',
    title: '收藏页移除',
    description: '收藏卡片的移除按钮。',
    order: 4427,
    multiline: false,
    languageContents: copyContent('移除', 'Remove'),
  },
  [PRODUCT_COPY_IDS.FAVORITES_TOPIC_LABEL]: {
    id: PRODUCT_COPY_IDS.FAVORITES_TOPIC_LABEL,
    section: 'library',
    title: '收藏页主题摘录标签',
    description: '收藏卡片没有主题名时的主题摘录标签。',
    order: 4428,
    multiline: false,
    languageContents: copyContent('主题摘录', 'Topic Excerpt'),
  },
  [PRODUCT_COPY_IDS.FAVORITES_GENERAL_LABEL]: {
    id: PRODUCT_COPY_IDS.FAVORITES_GENERAL_LABEL,
    section: 'library',
    title: '收藏页研究摘录标签',
    description: '收藏卡片没有具体主题时的标签。',
    order: 4429,
    multiline: false,
    languageContents: copyContent(
      '未归类主题',
      'Unsorted Topic',
      '未分類トピック',
      '미분류 주제',
      'Unsortiertes Thema',
      'Sujet non classé',
      'Tema sin clasificar',
      'Несортированная тема',
    ),
  },
  [PRODUCT_COPY_IDS.MANAGE_BACK_HOME]: {
    id: PRODUCT_COPY_IDS.MANAGE_BACK_HOME,
    section: 'management',
    title: '主题管理返回总览',
    description: '主题管理页顶部返回入口。',
    order: 4440,
    multiline: false,
    languageContents: copyContent('返回总览', 'Back to Overview'),
  },
  [PRODUCT_COPY_IDS.MANAGE_CREATE_ON_HOME]: {
    id: PRODUCT_COPY_IDS.MANAGE_CREATE_ON_HOME,
    section: 'management',
    title: '主题管理返回首页创建',
    description: '主题管理页顶部创建入口，回到首页打开主题构建弹窗。',
    order: 4441,
    multiline: false,
    languageContents: copyContent('回到首页创建主题', 'Create on Home'),
  },
  [PRODUCT_COPY_IDS.MANAGE_EYEBROW]: {
    id: PRODUCT_COPY_IDS.MANAGE_EYEBROW,
    section: 'management',
    title: '主题管理眉标',
    description: '主题管理页的顶部眉标。',
    order: 4442,
    multiline: false,
    languageContents: copyContent('主题管理', 'Topic Management'),
  },
  [PRODUCT_COPY_IDS.MANAGE_TITLE]: {
    id: PRODUCT_COPY_IDS.MANAGE_TITLE,
    section: 'management',
    title: '主题管理标题',
    description: '主题管理页主标题。',
    order: 4443,
    multiline: false,
    languageContents: copyContent('管理研究主题', 'Manage Topics'),
  },
  [PRODUCT_COPY_IDS.MANAGE_DESCRIPTION]: {
    id: PRODUCT_COPY_IDS.MANAGE_DESCRIPTION,
    section: 'management',
    title: '主题管理说明',
    description: '主题管理页说明文案。',
    order: 4444,
    multiline: true,
    languageContents: copyContent('在这里统一查看主题状态、摘要和更新时间，确保首页、主题页与研究编排看到的是同一份主题信息。', 'Review topic status, summaries, and update time from one place so every surface reflects the same source of truth.'),
  },
  [PRODUCT_COPY_IDS.MANAGE_EMPTY]: {
    id: PRODUCT_COPY_IDS.MANAGE_EMPTY,
    section: 'management',
    title: '主题管理空态',
    description: '主题管理页没有主题时的文案。',
    order: 4445,
    multiline: true,
    languageContents: copyContent('还没有可管理的正式主题。你可以先在首页创建一个主题，再回到这里统一维护状态与内容。', 'No formal topics are ready to manage yet. Create one on the home page first.'),
  },
  [PRODUCT_COPY_IDS.MANAGE_OPEN]: {
    id: PRODUCT_COPY_IDS.MANAGE_OPEN,
    section: 'management',
    title: '主题管理打开',
    description: '主题管理卡片的打开按钮。',
    order: 4446,
    multiline: false,
    languageContents: copyContent('打开', 'Open'),
  },
  [PRODUCT_COPY_IDS.MANAGE_DELETE]: {
    id: PRODUCT_COPY_IDS.MANAGE_DELETE,
    section: 'management',
    title: '主题管理删除',
    description: '主题管理卡片的删除按钮。',
    order: 4447,
    multiline: false,
    languageContents: copyContent('删除', 'Delete'),
  },
  [PRODUCT_COPY_IDS.MANAGE_CONFIRM_DELETE]: {
    id: PRODUCT_COPY_IDS.MANAGE_CONFIRM_DELETE,
    section: 'management',
    title: '主题管理删除确认',
    description: '删除主题前的确认文案。',
    order: 4448,
    multiline: true,
    languageContents: copyContent('确定要删除这个主题吗？', 'Are you sure you want to delete this topic?'),
  },
  [PRODUCT_COPY_IDS.MANAGE_PAPER_UNIT]: {
    id: PRODUCT_COPY_IDS.MANAGE_PAPER_UNIT,
    section: 'management',
    title: '主题管理论文单位',
    description: '主题统计中的论文数量单位。',
    order: 4449,
    multiline: false,
    languageContents: copyContent('篇论文', 'papers'),
  },
  [PRODUCT_COPY_IDS.MANAGE_NODE_UNIT]: {
    id: PRODUCT_COPY_IDS.MANAGE_NODE_UNIT,
    section: 'management',
    title: '主题管理节点单位',
    description: '主题统计中的节点数量单位。',
    order: 4450,
    multiline: false,
    languageContents: copyContent('个节点', 'nodes'),
  },
  [PRODUCT_COPY_IDS.STUDIO_TITLE]: {
    id: PRODUCT_COPY_IDS.STUDIO_TITLE,
    section: 'studio',
    title: '设置中心标题',
    description: '设置中心主标题。',
    order: 420,
    multiline: false,
    languageContents: copyContent('设置与内容生成中心', 'Settings & Generation Studio'),
  },
  [PRODUCT_COPY_IDS.STUDIO_DESCRIPTION]: {
    id: PRODUCT_COPY_IDS.STUDIO_DESCRIPTION,
    section: 'studio',
    title: '设置中心说明',
    description: '设置中心说明文案，强调给使用者配置全局模型、提示词与产品文案。',
    order: 430,
    multiline: true,
    languageContents: copyContent('这里统一管理全局语言、LLM/VLM 接入、研究生成链路、产品固定文案与提示词模板，保证前端展示、后端 skill 和外部 agent 使用的是同一套规则。', 'Manage global language, model slots, generation runtime, UI copy, and prompt templates from one place.'),
  },
  [PRODUCT_COPY_IDS.STUDIO_EYEBROW]: {
    id: PRODUCT_COPY_IDS.STUDIO_EYEBROW,
    section: 'studio',
    title: '设置中心眉标',
    description: '设置中心页面顶部的小标题。',
    order: 431,
    multiline: false,
    languageContents: copyContent('Settings Center', 'Settings Center'),
  },
  [PRODUCT_COPY_IDS.STUDIO_TAB_MODELS]: {
    id: PRODUCT_COPY_IDS.STUDIO_TAB_MODELS,
    section: 'studio',
    title: '设置中心页签·模型',
    description: '设置中心中模型配置页签。',
    order: 432,
    multiline: false,
    languageContents: copyContent('模型', 'Models'),
  },
  [PRODUCT_COPY_IDS.STUDIO_TAB_PIPELINE]: {
    id: PRODUCT_COPY_IDS.STUDIO_TAB_PIPELINE,
    section: 'studio',
    title: '设置中心页签·链路',
    description: '设置中心中生成链路页签。',
    order: 433,
    multiline: false,
    languageContents: copyContent('链路', 'Runtime'),
  },
  [PRODUCT_COPY_IDS.STUDIO_TAB_PROMPTS]: {
    id: PRODUCT_COPY_IDS.STUDIO_TAB_PROMPTS,
    section: 'studio',
    title: '设置中心页签·提示词',
    description: '设置中心中提示词页签。',
    order: 434,
    multiline: false,
    languageContents: copyContent('提示词', 'Prompts'),
  },
  [PRODUCT_COPY_IDS.STUDIO_TAB_COPY]: {
    id: PRODUCT_COPY_IDS.STUDIO_TAB_COPY,
    section: 'studio',
    title: '设置中心页签·固定文案',
    description: '设置中心中固定文案页签。',
    order: 435,
    multiline: false,
    languageContents: copyContent('固定文案', 'Product Copy'),
  },
  [PRODUCT_COPY_IDS.STUDIO_TAB_AGENTS]: {
    id: PRODUCT_COPY_IDS.STUDIO_TAB_AGENTS,
    section: 'studio',
    title: '设置中心页签·Agent 脚手架',
    description: '设置中心中外部 agent 脚手架页签。',
    order: 436,
    multiline: false,
    languageContents: copyContent('Agent 脚手架', 'Agent Adapters'),
  },
  [PRODUCT_COPY_IDS.STUDIO_STAT_LANGUAGE]: {
    id: PRODUCT_COPY_IDS.STUDIO_STAT_LANGUAGE,
    section: 'studio',
    title: '设置中心统计·语言模型',
    description: '设置中心顶部统计卡标题。',
    order: 437,
    multiline: false,
    languageContents: copyContent('语言模型', 'Language Model'),
  },
  [PRODUCT_COPY_IDS.STUDIO_STAT_MULTIMODAL]: {
    id: PRODUCT_COPY_IDS.STUDIO_STAT_MULTIMODAL,
    section: 'studio',
    title: '设置中心统计·多模态模型',
    description: '设置中心顶部统计卡标题。',
    order: 438,
    multiline: false,
    languageContents: copyContent('多模态模型', 'Multimodal Model'),
  },
  [PRODUCT_COPY_IDS.STUDIO_STAT_PROMPTS]: {
    id: PRODUCT_COPY_IDS.STUDIO_STAT_PROMPTS,
    section: 'studio',
    title: '设置中心统计·提示词模板',
    description: '设置中心顶部统计卡标题。',
    order: 439,
    multiline: false,
    languageContents: copyContent('提示词模板', 'Prompt Templates'),
  },
  [PRODUCT_COPY_IDS.STUDIO_STAT_COPY]: {
    id: PRODUCT_COPY_IDS.STUDIO_STAT_COPY,
    section: 'studio',
    title: '设置中心统计·固定文案',
    description: '设置中心顶部统计卡标题。',
    order: 440,
    multiline: false,
    languageContents: copyContent('固定文案', 'Product Copy'),
  },
  [PRODUCT_COPY_IDS.STUDIO_UNCONFIGURED]: {
    id: PRODUCT_COPY_IDS.STUDIO_UNCONFIGURED,
    section: 'studio',
    title: '设置中心未配置状态',
    description: '设置中心内模型未配置时的状态文案。',
    order: 441,
    multiline: false,
    languageContents: copyContent('未配置', 'Not configured'),
  },
  [PRODUCT_COPY_IDS.STUDIO_TEMPLATE_UNIT]: {
    id: PRODUCT_COPY_IDS.STUDIO_TEMPLATE_UNIT,
    section: 'studio',
    title: '设置中心模板计数单位',
    description: '提示词模板数量的单位。',
    order: 442,
    multiline: false,
    languageContents: copyContent('套', 'sets'),
  },
  [PRODUCT_COPY_IDS.STUDIO_COPY_UNIT]: {
    id: PRODUCT_COPY_IDS.STUDIO_COPY_UNIT,
    section: 'studio',
    title: '设置中心文案计数单位',
    description: '固定文案数量的单位。',
    order: 443,
    multiline: false,
    languageContents: copyContent('条', 'items'),
  },
  [PRODUCT_COPY_IDS.TOPIC_BACK_HOME]: {
    id: PRODUCT_COPY_IDS.TOPIC_BACK_HOME,
    section: 'topic',
    title: '主题页返回首页',
    description: '主题页顶部的返回首页入口。',
    order: 444,
    multiline: false,
    languageContents: copyContent('返回首页', 'Back Home'),
  },
  [PRODUCT_COPY_IDS.TOPIC_LOADING]: {
    id: PRODUCT_COPY_IDS.TOPIC_LOADING,
    section: 'topic',
    title: '主题页加载中',
    description: '主题页加载状态文案。',
    order: 445,
    multiline: false,
    languageContents: copyContent('正在加载主题页…', 'Loading topic…'),
  },
  [PRODUCT_COPY_IDS.TOPIC_UNAVAILABLE]: {
    id: PRODUCT_COPY_IDS.TOPIC_UNAVAILABLE,
    section: 'topic',
    title: '主题页不可用',
    description: '主题页无法加载时的提示。',
    order: 446,
    multiline: false,
    languageContents: copyContent('当前主题暂不可用。', 'This topic is currently unavailable.'),
  },
  [PRODUCT_COPY_IDS.TOPIC_BADGE_MAINLINE]: {
    id: PRODUCT_COPY_IDS.TOPIC_BADGE_MAINLINE,
    section: 'topic',
    title: '主题页卡片徽标·主线',
    description: '主题页节点卡上的主线徽标。',
    order: 447,
    multiline: false,
    languageContents: copyContent('主线', 'Mainline'),
  },
  [PRODUCT_COPY_IDS.TOPIC_BADGE_MERGE]: {
    id: PRODUCT_COPY_IDS.TOPIC_BADGE_MERGE,
    section: 'topic',
    title: '主题页卡片徽标·汇流',
    description: '主题页节点卡上的汇流徽标。',
    order: 448,
    multiline: false,
    languageContents: copyContent('汇流', 'Merge'),
  },
  [PRODUCT_COPY_IDS.TOPIC_BADGE_BRANCH]: {
    id: PRODUCT_COPY_IDS.TOPIC_BADGE_BRANCH,
    section: 'topic',
    title: '主题页卡片徽标·分支',
    description: '主题页节点卡上的分支徽标。',
    order: 449,
    multiline: false,
    languageContents: copyContent('分支', 'Branch'),
  },
  [PRODUCT_COPY_IDS.TOPIC_ADD_CONTEXT]: {
    id: PRODUCT_COPY_IDS.TOPIC_ADD_CONTEXT,
    section: 'topic',
    title: '主题页添加上下文',
    description: '主题页节点卡上的添加上下文按钮。',
    order: 450,
    multiline: false,
    languageContents: copyContent('添加上下文', 'Add Context'),
  },
  ...STUDIO_META_COPY_DEFINITIONS,
  ...STUDIO_NOTICE_COPY_DEFINITIONS,
  ...STUDIO_PAGE_COPY_DEFINITIONS,
  ...RESEARCH_FLOW_COPY_DEFINITIONS,
  ...ASSISTANT_SUPPLEMENTAL_COPY_DEFINITIONS,
}

const BUILT_IN_PROMPTS: Record<PromptTemplateId, PromptTemplateDefinition> = {
  [PROMPT_TEMPLATE_IDS.TOPIC_PREVIEW]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_PREVIEW,
    family: 'topic',
    title: '主题创建预览',
    description: '用于创建主题时生成主题名、摘要、关键词与阶段建议。',
    slot: 'language',
    order: 5,
    tags: ['topic', 'preview', 'create'],
    languageContents: promptContent(
      `你是“溯知 TraceMind”的主题策划编辑。你现在要把用户给出的研究方向整理成可以直接进入产品界面的主题预览。不要写成营销文案，也不要把用户原话简单改写得更长。你要像一个真正懂研究线索和读者阅读负担的人一样做判断。`,
      `请根据输入内容输出一个 JSON 对象，字段必须严格符合以下结构：
{"nameZh":"","nameEn":"","keywords":[{"zh":"","en":""}],"summary":"","summaryZh":"","summaryEn":"","recommendedStages":4,"focusLabel":"","focusLabelZh":"","focusLabelEn":"","primaryLanguage":"","locales":{"zh":{"name":"","summary":"","focusLabel":"","description":""},"en":{"name":"","summary":"","focusLabel":"","description":""},"ja":{"name":"","summary":"","focusLabel":"","description":""},"ko":{"name":"","summary":"","focusLabel":"","description":""},"de":{"name":"","summary":"","focusLabel":"","description":""},"fr":{"name":"","summary":"","focusLabel":"","description":""},"es":{"name":"","summary":"","focusLabel":"","description":""},"ru":{"name":"","summary":"","focusLabel":"","description":""}}}

写作要求：
1. 先以 input.sourceLanguage / input.sourceDescription 为主线理解研究方向，再结合 input.anchorDescriptions 与 input.descriptionByLanguage 稳定跨语言锚点。
2. nameZh / nameEn 要适合作为产品里的正式主题名，不要像任务名或草稿名。
3. summaryZh / summaryEn 要简洁但足够清楚，能让读者知道这个主题究竟在追踪什么；如果源语言不是中文或英文，也要保证对应 locale 的表述自然成立。
4. keywords 最多 5 组，适合直接显示在界面上。
5. recommendedStages 只能返回 3、4、5 之一。
6. focusLabel 是主题焦点标签，适合在列表与详情页快速识别主题方向。
7. primaryLanguage 必须等于真正的源语言；8 个 locales 尽量填满，不要只写中文和英文。
8. 只返回 JSON，不要额外解释。`,
      '用于创建主题弹窗与主题预览生成，应与主题页内容生成保持同一写作风格。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_BLUEPRINT_CORE]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_BLUEPRINT_CORE,
    family: 'topic',
    title: 'Topic Blueprint Core',
    description:
      'Generates the compact source-language and English core blueprint for compatible gateways.',
    slot: 'language',
    order: 6,
    tags: ['topic', 'create', 'blueprint', 'compatible'],
    languageContents: promptContent(
      `You are the first-pass topic architect for model-compatible gateways. Decide the topic framing, source-language naming, English anchors, and stage structure. Another pass will localize the remaining languages, so focus on semantic clarity and strong research framing instead of full multilingual expansion.`,
      `Return strict JSON with this shape:
{"topic":{"primaryLanguage":"","recommendedStages":4,"name":"","nameEn":"","summary":"","summaryEn":"","focusLabel":"","focusLabelEn":"","keywords":[{"source":"","en":""}]},"stages":[{"order":1,"name":"","nameEn":"","description":"","descriptionEn":""}]}

Requirements:
1. Use input.sourceLanguage and input.sourceDescription as the semantic source of truth.
2. Use input.anchorDescriptions and input.descriptionByLanguage only to stabilize cross-language anchors.
3. topic.name / summary / focusLabel must read naturally in the source language.
4. topic.nameEn / summaryEn / focusLabelEn must be stable English anchors suitable for UI and search.
5. keywords must be short, displayable, and aligned with the actual research direction.
6. recommendedStages must be 3, 4, or 5, and the stages array must match it exactly.
7. Stage names must sound like research moves, not numbered pipeline labels.
8. Return JSON only.`,
      'Compact compatible-gateway blueprint pass for topic creation.',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_BLUEPRINT]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_BLUEPRINT,
    family: 'topic',
    title: '主题创建蓝图',
    description: '用于真正创建主题时生成 8 语言主题信息、阶段命名与结构蓝图。',
    slot: 'language',
    order: 7,
    tags: ['topic', 'create', 'blueprint', 'multilingual'],
    languageContents: promptContent(
      `你是“研究编年史编辑”和“主题总设计师”。你现在不是做预览，而是要把一个研究方向落成真正可持续追踪的主题蓝图。你要一次性决定主题名称、焦点标签、8 种语言的正式表述、阶段命名，以及每个阶段究竟承担什么推进任务。输出必须像一份可直接写入产品数据库的主题设计稿。`,
      `请输出严格 JSON，字段结构必须满足：
{"topic":{"primaryLanguage":"","recommendedStages":4,"nameZh":"","nameEn":"","summary":"","summaryZh":"","summaryEn":"","focusLabel":"","focusLabelZh":"","focusLabelEn":"","keywords":[{"zh":"","en":"","localized":{"zh":"","en":"","ja":"","ko":"","de":"","fr":"","es":"","ru":""}}],"locales":{"zh":{"name":"","summary":"","focusLabel":"","description":""},"en":{"name":"","summary":"","focusLabel":"","description":""},"ja":{"name":"","summary":"","focusLabel":"","description":""},"ko":{"name":"","summary":"","focusLabel":"","description":""},"de":{"name":"","summary":"","focusLabel":"","description":""},"fr":{"name":"","summary":"","focusLabel":"","description":""},"es":{"name":"","summary":"","focusLabel":"","description":""},"ru":{"name":"","summary":"","focusLabel":"","description":""}}},"stages":[{"order":1,"name":"","nameEn":"","description":"","descriptionEn":"","locales":{"zh":{"name":"","description":""},"en":{"name":"","description":""},"ja":{"name":"","description":""},"ko":{"name":"","description":""},"de":{"name":"","description":""},"fr":{"name":"","description":""},"es":{"name":"","description":""},"ru":{"name":"","description":""}}}]}

要求：
1. 必须优先围绕 input.sourceLanguage / input.sourceDescription 建立主题主线，再用 input.anchorDescriptions / input.descriptionByLanguage 稳住跨语言命名。
2. 必须真正输出 8 种语言的 topic locales 和 stage locales，不能偷懒留空。
3. 主题与阶段命名要有研究判断力，不要写成“阶段一/阶段二”或流水线标签。
4. summary / focusLabel 要能直接进入正式界面，语言要稳、准、可读。
5. keywords 最多 6 组，每组都应有 8 语言 localized 值，且适合 UI 直接展示。
6. 阶段数量必须等于 recommendedStages，且为 3 到 5 之间的整数。
7. 每个阶段 description 要说明该阶段真正推进了什么、为什么单独成段。
8. 如果用户主要使用某一种语言，也必须同时给出中文和英文锚点，保证系统后续跨语言展示与搜索稳定。
9. 只返回 JSON，不要额外解释。`,
      '用于主题真正创建时的 8 语言蓝图生成，决定主题本体与阶段骨架。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_LOCALIZATION]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_LOCALIZATION,
    family: 'topic',
    title: 'Topic Multilingual Localization',
    description: 'Repairs and completes the 8-language topic blueprint before persistence.',
    slot: 'language',
    order: 8,
    tags: ['topic', 'create', 'localization', 'multilingual'],
    languageContents: promptContent(
      `You are the multilingual finishing editor for topic creation. Your only job is to take an existing topic blueprint scaffold and make every topic locale, stage locale, and keyword localization read like intentional product copy instead of fallback placeholders.`,
      `Return strict JSON matching the provided outputContract.

Requirements:
1. Use input.sourceLanguage and input.descriptionByLanguage as the semantic source of truth, then repair input.blueprint so all 8 locales are complete and mutually aligned.
2. Preserve the topic structure, recommended stage count, stage ordering, and the overall research framing unless the scaffold is internally inconsistent.
3. Rewrite weak fallback text, direct copies, empty strings, or English-only carryovers into natural localized labels, summaries, focus labels, descriptions, and stage names.
4. Every topic locale and every stage locale must be filled. Every keyword.localized entry must also be filled for zh, en, ja, ko, de, fr, es, and ru.
5. Keep zh and en anchors stable enough for downstream search and UI display.
6. Do not add extra stages, do not drop stages, and do not return commentary outside JSON.`,
      'Runs after blueprint generation to make the full 8-language payload publication-ready.',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_LOCALE_PATCH]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_LOCALE_PATCH,
    family: 'topic',
    title: 'Topic Locale Patch',
    description: 'Localizes one target language at a time for compatible gateways.',
    slot: 'language',
    order: 9,
    tags: ['topic', 'create', 'localization', 'compatible'],
    languageContents: promptContent(
      `You are the per-language finishing editor for topic creation. You localize exactly one target language at a time while keeping the topic structure fixed.`,
      `Return strict JSON with this shape:
{"language":"{targetLanguage}","topic":{"name":"","summary":"","focusLabel":"","description":"","keywords":[""]},"stages":[{"order":1,"name":"","description":""}]}

Requirements:
1. The target language is {targetLanguage} ({targetLanguageLabel}).
2. Use input.sourceDescription, input.targetDescription, input.descriptionByLanguage, input.preview, and input.blueprint as grounding.
3. Rewrite only the target-language fields. Preserve meaning, stage ordering, and the overall research framing.
4. Prefer natural product-ready wording over literal translation.
5. topic.keywords must stay short and suitable for UI chips.
6. The stages array must contain one entry per existing stage order and may not add or remove stages.
7. Return JSON only.`,
      'Compatible-gateway single-language localization patch for topic creation.',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_HERO]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_HERO,
    family: 'topic',
    title: '主题页导语',
    description: '生成主题页 hero 标题、导语和 thesis。',
    slot: 'language',
    order: 10,
    tags: ['topic', 'hero', 'editorial'],
    languageContents: promptContent(
      `你是“研究编年史编辑”。你现在写的是主题页开场，不是宣传文案，不是泛泛趋势总结，也不是摘要改写。你的职责是把一个主题真正写成可进入的研究主线，让读者一上来就知道：这个主题在研究什么，它沿着什么线索推进，现在最关键的张力在哪里。`,
      `请基于输入的 topic、stage、node、paper 与已有记忆，输出 JSON：
{"kicker":"","title":"","standfirst":"","strapline":"","thesis":""}

要求：
1. title 要像一条研究主线标题，不要口号感。
2. standfirst 用连续中文写清主问题、推进线索和当前张力。
3. thesis 用一句话概括这个主题真正的核心判断。
4. 中文为主，只保留必要英文锚点。
5. 不要废话，不要把节点列表机械重述。`,
      '用于主题页头部，负责把读者带进主题主线。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_STAGE_TIMELINE]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_STAGE_TIMELINE,
    family: 'topic',
    title: '阶段命名与时间线',
    description: '生成阶段名称、阶段 thesis 与转场说明。',
    slot: 'language',
    order: 20,
    tags: ['topic', 'stage', 'timeline'],
    languageContents: promptContent(
      `你是“研究编年史编辑”。你现在写的是阶段时间线文案。阶段名称必须有研究判断力，也要带一点克制的叙事感和浪漫感，但不能悬浮、不能诗化过度。用户会把月份与具体日期放在最醒目的位置，你要负责为这段日期命名，让读者一眼看出：这一段时间里主线到底变了什么，哪一层问题真正被推开了。`,
      `请基于输入的 stage 时间、代表节点、代表论文、前序阶段记忆，输出 JSON：
{"title":"","titleEn":"","kicker":"","summary":"","transition":"","stageThesis":""}

要求：
1. title 是阶段中文名，不要写“阶段一/阶段二”；它应该像研究者给一段关键推进命名，而不是项目经理编号。
2. titleEn 保留可扩展的英文名，但要自然，不要直译腔。
3. kicker 要像一枚短而准的阶段副题，可以略有锋芒。
4. summary 说明这一阶段真正解决了什么、把哪条主线推实了、又留下了什么悬念；不要空泛，不要写成“承上启下”的套话。
5. transition 说明它和上一阶段真正不同在哪里，最好点出驱动变化的论文、方法或证据转折，要写出转折的锋利感。
6. stageThesis 用一句判断收束，让读者知道先看什么，也让右侧工作台后续能接着追问；这句话要像一枚立得住的判断，而不是总结标题。
7. 日期、月份和年份由程序提供，你不要重复日期，而要让命名与总结能够配得上这组日期。
8. 可以有一点浪漫，但必须建立在真实研究推进上，不能浮夸。
9. 如果这一阶段只是验证、收束或汇流，也要把它写得有辨识度，不能退化成平庸的“综合分析”或“阶段总结”。`,
      '用于主题页时间线，阶段名要有关键水平、轻微浪漫感和明确判断，尤其要让月份与具体日期下面的阶段名称更有辨识度，也让阶段总结更有锋芒。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_NODE_CARD]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_NODE_CARD,
    family: 'topic',
    title: '节点卡片文案',
    description: '生成节点卡片上的导航型 editorial。',
    slot: 'language',
    order: 30,
    tags: ['topic', 'node-card'],
    languageContents: promptContent(
      `你是“研究编年史编辑”。你现在写的是主题页节点卡，不是正文，不是摘要压缩，也不是宣传语。卡片只负责导航：告诉读者这一跳为什么成立、这一节点在解决什么、为什么值得点进去。`,
      `请输出 JSON：
{"eyebrow":"","digest":"","whyNow":"","nextQuestion":""}

要求：
1. digest 2-3 句，短，但要有判断。
2. whyNow 说明它为什么会出现在这条主线上。
3. nextQuestion 写出最值得继续追问的问题。
4. 中文清楚，不堆术语，必要术语保留英文。`,
      '用于主题页横向节点卡，必须短、准、能导航。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_CHAT]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_CHAT,
    family: 'topic',
    title: '主题侧边栏对话',
    description: '用于主题页右侧对话，要求像该主题的作者一样回答。',
    slot: 'language',
    order: 35,
    tags: ['topic', 'chat', 'grounded'],
    languageContents: promptContent(
      `你是当前主题页的作者、编排者与讲解者。你记得自己如何命名阶段、组织节点、归纳论文、挑选证据，也记得哪些判断仍有边界。你和用户保持交流关系，但不能装作知道不存在的内容。`,
      `请基于输入中的 authorContext、question、selectedEvidence 与 outputContract 回答。要求：
1. 必须先直接回答问题，再说明它在主题主线中的位置，最后指出关键证据、证据边界或未决问题。
2. 只能引用 selectedEvidence 里给出的 anchorId，不能编造节点、论文关系或引用。
3. 回答要像一段真正研究写作中的清晰解释，不要像客服，也不要像提示词回显。
4. 若证据不足，要明确承认不足并说明下一步该补什么。
5. 输出纯正文，不要返回 JSON、代码块或自我反思。`,
      '用于主题页右侧对话，要求强 grounding、强记忆、强作者人格。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_SESSION_MEMORY]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_SESSION_MEMORY,
    family: 'topic',
    title: '主题会话记忆压缩',
    description: '将持续研究过程中的聊天、阶段推进和修正动作压缩成可回灌给 topic chat 与研究编排层的显式记忆。',
    slot: 'language',
    order: 34,
    tags: ['topic', 'memory', 'session', 'continuity'],
    languageContents: promptContent(
      `你是“主题会话记忆编辑”。你不负责直接回答用户，而是把长期研究过程里真正值得保留的判断、问题、上下文和表达口吻，压缩成一份稳定、可复用、可持续更新的显式记忆。你的目标不是做流水账，而是保留真正会影响后续研究判断与对话回答的内容。`,
      `请围绕输入中的 topic、existingSummary、recentEvents、memoryStats 输出 JSON。要求：
1. currentFocus 用 1-2 句话写清当前主题主线正在推进什么。
2. continuity 用 1-2 句话写清“上一轮研究做到哪里、下一轮该从哪里接着想”。
3. establishedJudgments 保留 3-6 条已经形成但仍需带边界意识的判断。
4. openQuestions 保留 3-6 条仍值得继续追问的问题。
5. researchMomentum 保留 2-5 条最近最关键的研究推进、修正或结构调整。
6. conversationStyle 写清这个主题侧边栏回答时应保持的语气、立场与约束。
7. lastResearchMove 与 lastUserIntent 要尽量短，但要具体。
8. 只保留真正会影响后续生成与回答的内容，不要重复 recentEvents 原文。
9. 只返回 JSON。`,
      '用于 topic session memory 的后台压缩。输出会被回灌给研究流水线、主题对话和导出内容，因此必须强调连续性、判断边界与下一步问题。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_RESEARCH_REPORT]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_RESEARCH_REPORT,
    family: 'topic',
    title: '研究会话简报',
    description: '用于将 XX 小时持续研究的过程整理成右侧侧边栏可读的研究简报。',
    slot: 'language',
    order: 36,
    tags: ['topic', 'research', 'report', 'sidebar'],
    languageContents: promptContent(
      `你是“研究总编辑”在收工时写给读者的工作简报作者。你要把这轮持续研究写成一份能放进右侧侧边栏的简报：既说明做了什么，也要说明哪里仍然值得追问。你的口吻要像一个固执、严谨、讲究结构和品位的研究写作者，而不是任务执行器。`,
      `请围绕输入中的 topic、task、progress、latestCycle、recentHistory、error 与 outputContract 输出 JSON。要求：
1. headline 要像这轮研究的标题，不要写成系统提示。
2. dek 用一句话说清这轮研究最关键的推进。
3. summary 要像侧边栏顶部可读的摘要，不要堆数字。
4. paragraphs 写成 2-4 段连续说明，要讲出结构推进、节点修正、论文吸收与证据边界。
5. keyMoves 只保留最重要的 3-6 条动作或判断。
6. openQuestions 只保留仍值得继续追问的关键问题。
7. 只返回 JSON。`,
      '用于右侧侧边栏里的最新研究简报，强调“本轮做了什么、改了什么、还缺什么”。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_RESEARCH_ORCHESTRATION]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_RESEARCH_ORCHESTRATION,
    family: 'topic',
    title: '研究编排与节点归纳',
    description: '用于多 stage 多轮研究后，决定如何分组论文、命名节点、修正阶段与推进下一轮。',
    slot: 'language',
    order: 37,
    tags: ['topic', 'research', 'orchestration', 'nodes'],
    languageContents: promptContent(
      `你是“研究编排总编辑”。你要把一个 stage 中新进入的论文与既有节点放进同一张研究地图里，判断应该新建节点、修正节点、合并节点还是仅做证据补强。你的任务不是机械挂载论文，而是保持主题主线的结构清晰、命名准确、分工合理。`,
      `请围绕输入中的 topic、stage、existingNodes、candidatePapers、history 与 outputContract 输出 JSON。要求：
1. nodeActions 必须给出明确的结构决定，不能只说“继续观察”。
2. 每个节点标题都要像研究节点，不要写成论文标题列表，也不要写成空泛方法名。
3. paperIds 的分配必须有逻辑，说明这些论文为何属于同一个节点。
4. 如果某篇论文会修正既有判断，要在 rationale 或 stageSummary 中明确指出“修正了什么”。
5. shouldAdvanceStage 只有在当前阶段已经形成足够清晰的节点结构时才可为 true。
6. 输出的 stageTitle / stageSummary 要足以直接影响主题页时间线与阶段名称。
7. 只返回 JSON。`,
      '用于真正的后端研究编排层，决定阶段续写、节点分组、矫正与推进。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.TOPIC_CLOSING]: {
    id: PROMPT_TEMPLATE_IDS.TOPIC_CLOSING,
    family: 'topic',
    title: '主题页结尾总评',
    description: '生成主题最末总结和 reviewer note。',
    slot: 'language',
    order: 40,
    tags: ['topic', 'closing', 'review'],
    languageContents: promptContent(
      `你是“研究编年史编辑”。你现在写的是主题页结尾总评，要把整条主线和主要分支收束成一段真正可读的结论，不要写成统计卡说明，也不要把前文机械拼接。`,
      `请输出 JSON：
{"title":"","paragraphs":["",""],"reviewerNote":""}

要求：
1. paragraphs 用连续中文写清主线推进、稳定结论、暂时解释和未解决问题。
2. reviewerNote 单独指出严厉审稿人最会追问什么。
3. 不分点，不口号化，不要空洞展望。`,
      '用于主题页最末总评。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.ARTICLE_NODE]: {
    id: PROMPT_TEMPLATE_IDS.ARTICLE_NODE,
    family: 'article',
    title: '节点详情长文',
    description: '生成多论文节点的连续文章。',
    slot: 'language',
    order: 50,
    tags: ['node', 'article', 'multi-paper'],
    languageContents: promptContent(
      `你是“研究编年史编辑”。你现在写的是节点详情页长文。一个节点可能包含多篇论文，你不能把它们压缩成一串摘要。你必须让读者在不回原文拼图的情况下，理解这个节点为什么成立、每篇论文各自做了什么、它们如何推进或分歧。`,
      `请围绕输入数据生成节点级连续文章相关内容。输出 JSON 时必须遵守每个 pass 的输出契约。通用约束：
1. 中文为主，只保留必要英文锚点。
2. 不要术语墙，不要空话。
3. 多篇论文必须逐篇讲清角色。
4. Figure / Table / Formula 必须解释它在论证中的作用。
5. 节点全文必须遵守“总 - 分 - 总”结构：先总述节点问题与判断，再逐篇拆开写，最后回到跨论文收束与未解问题。
6. 不允许忽略输入里任意一篇论文；每篇论文至少要交代它为何出现、推进了什么、证据靠什么成立、边界是什么。
7. 如果 input.mode = "paper-pass"，你输出的是单篇论文在节点中的展开段落：
   - overviewTitle 要像真正的小标题，不能写成“论文一”。
   - body 至少 4 段，建议覆盖“为何出现 / 方法机制 / 关键证据 / 图表公式 / 边界与 handoff”。
   - 如果输入里提供了 section、figure、table、formula，不要假装没看见，必须把它们用自然中文纳入叙述。
8. 如果 input.mode = "node-synthesis"，headline 必须是判断句，不是目录名；leadTitle、evidenceTitle、closingTitle 都要可直接上页面，不能空泛。
9. 结尾要保留严厉审稿式问题。`,
      '用于节点详情页，多论文节点必须讲透。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.ARTICLE_PAPER]: {
    id: PROMPT_TEMPLATE_IDS.ARTICLE_PAPER,
    family: 'article',
    title: '论文详情长文',
    description: '生成单篇论文的连续文章。',
    slot: 'language',
    order: 60,
    tags: ['paper', 'article'],
    languageContents: promptContent(
      `你是“研究编年史编辑”。你现在写的是单篇论文深读文章，不是把章节标题重新串起来。你要把问题、方法、证据、边界和批评写成一篇完整文章。`,
      `请围绕输入数据生成论文级连续文章相关内容。输出 JSON 时必须遵守每个 pass 的输出契约。通用约束：
1. 中文清楚，少废话。
2. 必要英文仅限论文标题、方法名、模型名、数据集名等锚点。
3. 图、表、公式必须解释它们支撑了哪一段判断。
4. 全文同样遵守“总 - 分 - 总”：先说明问题与位置，再按论证展开，最后回到边界和 handoff。
5. 如果输入里存在多个 section，不要只重复摘要；要沿着 section 把方法、实验、证据和限制讲明白。
6. 最后要指出审稿人最可能抓的问题。`,
      '用于单篇论文深读页。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.ARTICLE_CROSS_PAPER]: {
    id: PROMPT_TEMPLATE_IDS.ARTICLE_CROSS_PAPER,
    family: 'article',
    title: '跨论文比较',
    description: '生成节点内部多篇论文的横向比较。',
    slot: 'language',
    order: 70,
    tags: ['node', 'comparison', 'multi-paper'],
    languageContents: promptContent(
      `你是“研究编年史编辑”。你现在只做跨论文比较。不要再写长文导语，而要直接指出这些论文在同一问题线上是如何推进、替代、补强或分歧的。`,
      `请输出 JSON，必须清楚回答：
1. 共同问题是什么；
2. 每篇论文的角色是什么；
3. 彼此之间是推进、替代、补强还是分歧；
4. 真正还没解决的问题是什么。
5. 不允许跳过任何输入论文；要按时间与逻辑关系把它们串起来，而不是只挑两篇代表作。`,
      '用于节点内部的横向比较 pass。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.ARTICLE_EVIDENCE]: {
    id: PROMPT_TEMPLATE_IDS.ARTICLE_EVIDENCE,
    family: 'evidence',
    title: '图表公式解释',
    description: '生成 figure/table/formula 的正文解释。',
    slot: 'multimodal',
    order: 80,
    tags: ['evidence', 'figure', 'table', 'formula'],
    languageContents: promptContent(
      `你是“研究编年史编辑”中的证据解释器。你要解释图、表、公式在论证中的作用，而不是只描述画面内容。`,
      `请输出 JSON：
{"title":"","quote":"","content":"","explanation":"","whyItMatters":"","placementHint":"","importance":0}

要求：
1. 说明这条证据想证明什么。
2. 说明它真正展示了什么。
3. 说明它支撑了正文中的哪一段判断。
4. 指出它可能存在的替代解释或边界条件。
5. importance 取 0 到 1。`,
      '用于 figure / table / formula explanation，优先走 VLM。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.ARTICLE_REVIEWER]: {
    id: PROMPT_TEMPLATE_IDS.ARTICLE_REVIEWER,
    family: 'article',
    title: '审稿式批评',
    description: '生成节点或论文的 reviewer critique。',
    slot: 'language',
    order: 90,
    tags: ['reviewer', 'critique'],
    languageContents: promptContent(
      `你现在扮演严厉审稿人，但要保持学术中文克制。不要骂人，不要夸张，只指出证据不足、比较不公平、结论超出证据、还缺哪一步验证。`,
      `请输出 JSON：
{"summary":"","bullets":["","",""]}

要求：
1. summary 先给总体判断。
2. bullets 用清楚中文逐条指出关键问题。
3. 每条批评都要落回输入给出的证据与比较，不要空泛。
4. 如果输入里有图、表、公式或跨论文比较关系，要明确指出它们哪里还不够支撑结论。`,
      '用于节点与论文的 reviewer critique。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.VISUAL_BRIEF]: {
    id: PROMPT_TEMPLATE_IDS.VISUAL_BRIEF,
    family: 'visual',
    title: '视觉 brief',
    description: '为缺失封面或配图时生成统一风格的 visual brief。',
    slot: 'multimodal',
    order: 100,
    tags: ['visual', 'brief'],
    languageContents: promptContent(
      `你是研究产品的视觉 brief 编辑。你要基于研究主题或节点内容，为后续图像生成或裁图提供统一、克制、学术化的视觉说明。`,
      `请输出 JSON：
{"artDirection":"","shotList":["",""],"caption":""}

要求：
1. 风格克制、白底优先、学术感强。
2. 不是海报，不要夸张营销图像。
3. 需要能服务主题页方块卡和首页封面区。`,
      '用于主题 hero 或节点卡缺少真实配图时的备用视觉 brief。',
    ),
  },
  [PROMPT_TEMPLATE_IDS.VISUAL_NODE_COVER]: {
    id: PROMPT_TEMPLATE_IDS.VISUAL_NODE_COVER,
    family: 'visual',
    title: '节点关键原理图选择',
    description: '用于从候选 figure 中挑出最适合主题页节点卡片的关键原理图。',
    slot: 'multimodal',
    order: 110,
    tags: ['visual', 'node-cover', 'figure-selection'],
    languageContents: promptContent(
      `你是研究产品里的“节点封面编辑”。你要从候选论文 figure 中选出最能代表该节点核心机制、关键对比或原理贡献的一张图，而不是最花哨或最像封面的图。`,
      `请基于输入中的 node、candidateFigures、stage 与 outputContract 输出 JSON。要求：
1. 优先选择能代表节点核心原理、关键机制、或决定性对比结果的 figure。
2. 不要选择纯装饰图、流程图噪声过高的图、或与节点主题关联太弱的图。
3. 如果没有足够好的 figure，要明确返回 shouldUseFallback=true。
4. reason 要写清楚这张图为什么最能代表该节点，而不是只复述 caption。
5. 只返回 JSON。`,
      '用于节点卡片自动挑选“论文关键原理图”。',
    ),
  },
}

const EXTERNAL_AGENT_ASSET_DEFINITIONS: Record<
  ExternalAgentAssetId,
  ExternalAgentAssetDefinition
> = {
  [EXTERNAL_AGENT_ASSET_IDS.README]: {
    id: EXTERNAL_AGENT_ASSET_IDS.README,
    title: 'Adapter README',
    description: 'How external agent adapters plug into the backend research pipeline.',
    pathSegments: ['README.md'],
    format: 'markdown',
  },
  [EXTERNAL_AGENT_ASSET_IDS.PROMPT_GUIDE]: {
    id: EXTERNAL_AGENT_ASSET_IDS.PROMPT_GUIDE,
    title: 'Prompt Guide',
    description: 'Execution rules that external agents must obey when consuming exported jobs.',
    pathSegments: ['PROMPT_GUIDE.md'],
    format: 'markdown',
  },
  [EXTERNAL_AGENT_ASSET_IDS.SUPER_PROMPT]: {
    id: EXTERNAL_AGENT_ASSET_IDS.SUPER_PROMPT,
    title: 'Super Prompt',
    description: 'A higher-level orchestration prompt for multi-pass external agent runs.',
    pathSegments: ['SUPER_PROMPT.md'],
    format: 'markdown',
  },
  [EXTERNAL_AGENT_ASSET_IDS.CONFIG_EXAMPLE]: {
    id: EXTERNAL_AGENT_ASSET_IDS.CONFIG_EXAMPLE,
    title: 'Config Example',
    description: 'Sample adapter wiring and output directories for Codex, OpenClaw, and Claude Code.',
    pathSegments: ['adapters.example.json'],
    format: 'json',
  },
}

function templateSystemKey(id: PromptTemplateId) {
  return `${PROMPT_TEMPLATE_KEY_PREFIX}${id}`
}

function externalAgentAssetSystemKey(id: ExternalAgentAssetId) {
  return `${EXTERNAL_AGENT_ASSET_KEY_PREFIX}${id}`
}

function cloneContent(content: PromptTemplateContent): PromptTemplateContent {
  return {
    system: content.system,
    user: content.user,
    notes: content.notes,
  }
}

function cloneDefinition(definition: PromptTemplateDefinition): PromptTemplateDefinition {
  return {
    ...definition,
    tags: [...definition.tags],
    languageContents: mapPromptLanguageRecord((language) =>
      cloneContent(definition.languageContents[language]),
    ),
  }
}

function copySystemKey(id: ProductCopyId) {
  return `${PRODUCT_COPY_KEY_PREFIX}${id}`
}

function cloneCopyDefinition(definition: ProductCopyDefinition): ProductCopyDefinition {
  return {
    ...definition,
    languageContents: mapPromptLanguageRecord((language) => definition.languageContents[language]),
  }
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function mergeContent(
  base: PromptTemplateContent,
  patch?: Partial<PromptTemplateContent> | null,
): PromptTemplateContent {
  if (!patch) return cloneContent(base)
  return {
    system: normalizeText(patch.system, base.system),
    user: normalizeText(patch.user, base.user),
    notes: normalizeText(patch.notes, base.notes),
  }
}

function cloneEditorialPolicy(policy: GenerationEditorialPolicy): GenerationEditorialPolicy {
  return {
    identity: policy.identity,
    mission: policy.mission,
    reasoning: policy.reasoning,
    style: policy.style,
    evidence: policy.evidence,
    industryLens: policy.industryLens,
    continuity: policy.continuity,
    refinement: policy.refinement,
  }
}

function mergeEditorialPolicy(
  base: GenerationEditorialPolicy,
  patch?: Partial<GenerationEditorialPolicy> | null,
): GenerationEditorialPolicy {
  if (!patch) return cloneEditorialPolicy(base)
  return {
    identity: normalizeText(patch.identity, base.identity),
    mission: normalizeText(patch.mission, base.mission),
    reasoning: normalizeText(patch.reasoning, base.reasoning),
    style: normalizeText(patch.style, base.style),
    evidence: normalizeText(patch.evidence, base.evidence),
    industryLens: normalizeText(patch.industryLens, base.industryLens),
    continuity: normalizeText(patch.continuity, base.continuity),
    refinement: normalizeText(patch.refinement, base.refinement),
  }
}

function mapPromptLanguageRecord<T>(builder: (language: PromptLanguage) => T): Record<PromptLanguage, T> {
  return Object.fromEntries(
    PROMPT_LANGUAGES.map(({ code }) => [code, builder(code)]),
  ) as Record<PromptLanguage, T>
}

function hasAnyLanguageOverride<T>(record: Partial<Record<PromptLanguage, T>> | undefined) {
  if (!record) return false
  return PROMPT_LANGUAGES.some(({ code }) => Boolean(record[code]))
}

function parseStoredOverride(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value) as PromptTemplatePatch
  } catch {
    return null
  }
}

function parseStoredCopyOverride(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value) as ProductCopyPatch
  } catch {
    return null
  }
}

function _parseStoredRuntime(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value) as GenerationRuntimePatch
  } catch {
    return null
  }
}

function parseStoredRuntimeValue(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as GenerationRuntimePatch
}

function parseStoredRuntimeConfig(value: unknown): GenerationRuntimeConfig | null {
  const patch = parseStoredRuntimeValue(value)
  if (!patch) return null
  return sanitizeRuntimePatch(patch)
}

function parseStoredExternalAgentAssetOverride(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value) as ExternalAgentAssetPatch
  } catch {
    return null
  }
}

function getExternalAgentsRootDir() {
  return path.resolve(__dirname, '../../../external-agents')
}

function resolveExternalAgentAssetPath(definition: ExternalAgentAssetDefinition) {
  return path.join(getExternalAgentsRootDir(), ...definition.pathSegments)
}

async function readExternalAgentAssetBase(
  definition: ExternalAgentAssetDefinition,
): Promise<ExternalAgentAssetRecord> {
  const filePath = resolveExternalAgentAssetPath(definition)
  const content = await fs.readFile(filePath, 'utf8')

  return {
    ...definition,
    builtIn: true,
    path: filePath,
    content,
  }
}

function mergeExternalAgentAsset(
  base: ExternalAgentAssetRecord,
  override: ExternalAgentAssetPatch | null,
): ExternalAgentAssetRecord {
  return {
    ...base,
    content: normalizeText(override?.content, base.content),
  }
}

function mergeDefinitionWithOverride(
  definition: PromptTemplateDefinition,
  override: PromptTemplatePatch | null,
): PromptTemplateRecord {
  const base = cloneDefinition(definition)
  return {
    ...base,
    builtIn: true,
    languageContents: mapPromptLanguageRecord((language) =>
      mergeContent(base.languageContents[language], override?.languageContents?.[language]),
    ),
  }
}

function mergeCopyDefinitionWithOverride(
  definition: ProductCopyDefinition,
  override: ProductCopyPatch | null,
): ProductCopyRecord {
  const base = cloneCopyDefinition(definition)
  return {
    ...base,
    builtIn: true,
    languageContents: mapPromptLanguageRecord((language) =>
      normalizeText(override?.languageContents?.[language], base.languageContents[language]),
    ),
  }
}

function sanitizeRuntimePatch(
  patch?: GenerationRuntimePatch | null,
): GenerationRuntimeConfig {
  const next = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...patch,
  }

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  return {
    defaultLanguage:
      PROMPT_LANGUAGES.some((item) => item.code === next.defaultLanguage)
        ? next.defaultLanguage
        : DEFAULT_RUNTIME_CONFIG.defaultLanguage,
    cacheGeneratedOutputs: Boolean(next.cacheGeneratedOutputs),
    contextAwareCacheReuse: Boolean(next.contextAwareCacheReuse),
    staleContextRefinePasses: clamp(Number(next.staleContextRefinePasses), 0, 4),
    useTopicMemory: Boolean(next.useTopicMemory),
    usePreviousPassOutputs: Boolean(next.usePreviousPassOutputs),
    preferMultimodalEvidence: Boolean(next.preferMultimodalEvidence),
    maxRetriesPerPass: clamp(Number(next.maxRetriesPerPass), 0, 6),
    topicPreviewPasses: clamp(Number(next.topicPreviewPasses), 1, 4),
    topicBlueprintPasses: clamp(Number(next.topicBlueprintPasses), 1, 4),
    topicLocalizationPasses: clamp(Number(next.topicLocalizationPasses), 1, 4),
    topicChatPasses: clamp(Number(next.topicChatPasses), 1, 4),
    stageNamingPasses: clamp(Number(next.stageNamingPasses), 1, 6),
    nodeArticlePasses: clamp(Number(next.nodeArticlePasses), DEFAULT_NODE_ARTICLE_PASSES, 8),
    paperArticlePasses: clamp(Number(next.paperArticlePasses), 1, 6),
    selfRefinePasses: clamp(Number(next.selfRefinePasses), DEFAULT_SELF_REFINE_PASSES, 6),
    researchOrchestrationPasses: clamp(Number(next.researchOrchestrationPasses), DEFAULT_RESEARCH_ORCHESTRATION_PASSES, 6),
    researchReportPasses: clamp(Number(next.researchReportPasses), 1, 4),
    researchCycleDelayMs: clamp(Number(next.researchCycleDelayMs), 1000, 1800000),
    researchStageStallLimit: clamp(Number(next.researchStageStallLimit), 1, 6),
    researchStagePaperLimit: clamp(Number(next.researchStagePaperLimit), DEFAULT_RESEARCH_STAGE_PAPER_LIMIT, MAX_RESEARCH_STAGE_PAPER_LIMIT),
    researchArtifactRebuildLimit: clamp(Number(next.researchArtifactRebuildLimit), DEFAULT_RESEARCH_ARTIFACT_REBUILD_LIMIT, MAX_RESEARCH_ARTIFACT_REBUILD_LIMIT),
    nodeCardFigureCandidateLimit: clamp(Number(next.nodeCardFigureCandidateLimit), 1, 16),
    topicSessionMemoryEnabled: Boolean(next.topicSessionMemoryEnabled),
    topicSessionMemoryInitEventCount: clamp(Number(next.topicSessionMemoryInitEventCount), 1, 12),
    topicSessionMemoryChatTurnsBetweenCompaction: clamp(
      Number(next.topicSessionMemoryChatTurnsBetweenCompaction),
      1,
      12,
    ),
    topicSessionMemoryResearchCyclesBetweenCompaction: clamp(
      Number(next.topicSessionMemoryResearchCyclesBetweenCompaction),
      1,
      8,
    ),
    topicSessionMemoryTokenThreshold: clamp(Number(next.topicSessionMemoryTokenThreshold), 400, 12000),
    topicSessionMemoryRecentEventLimit: clamp(Number(next.topicSessionMemoryRecentEventLimit), 6, 40),
    topicSessionMemoryRecallEnabled: Boolean(next.topicSessionMemoryRecallEnabled),
    topicSessionMemoryRecallLimit: clamp(Number(next.topicSessionMemoryRecallLimit), 1, 8),
    topicSessionMemoryRecallLookbackLimit: clamp(
      Number(next.topicSessionMemoryRecallLookbackLimit),
      6,
      40,
    ),
    topicSessionMemoryRecallRecencyBias: clamp(
      Number(next.topicSessionMemoryRecallRecencyBias),
      0,
      1,
    ),
    languageTemperature: clamp(Number(next.languageTemperature), 0, 1),
    multimodalTemperature: clamp(Number(next.multimodalTemperature), 0, 1),
    maxEvidencePerArticle: clamp(Number(next.maxEvidencePerArticle), 1, 24),
    contextWindowStages: clamp(Number(next.contextWindowStages), 1, 12),
    contextWindowNodes: clamp(Number(next.contextWindowNodes), 1, 32),
    unlimitedMemoryMode: Boolean(next.unlimitedMemoryMode),
    editorialPolicies: mapPromptLanguageRecord((language) =>
      mergeEditorialPolicy(
        DEFAULT_RUNTIME_CONFIG.editorialPolicies[language],
        next.editorialPolicies?.[language],
      ),
    ),
  }
}

export function listPromptLanguages() {
  return PROMPT_LANGUAGES
}

export function getBuiltInPromptDefinitions() {
  return Object.values(BUILT_IN_PROMPTS).sort((left, right) => left.order - right.order)
}

export function getBuiltInProductCopyDefinitions() {
  return Object.values(BUILT_IN_PRODUCT_COPIES).sort((left, right) => left.order - right.order)
}

export async function listPromptTemplates(): Promise<PromptTemplateRecord[]> {
  const records = await prisma.system_configs.findMany({
    where: {
      key: {
        startsWith: PROMPT_TEMPLATE_KEY_PREFIX,
      },
    },
  })

  const overrides = new Map<PromptTemplateId, PromptTemplatePatch>()
  records.forEach((record) => {
    const id = record.key.replace(PROMPT_TEMPLATE_KEY_PREFIX, '') as PromptTemplateId
    if (!(id in BUILT_IN_PROMPTS)) return
    const parsed = parseStoredOverride(record.value)
    if (parsed) overrides.set(id, parsed)
  })

  return getBuiltInPromptDefinitions().map((definition) =>
    mergeDefinitionWithOverride(definition, overrides.get(definition.id) ?? null),
  )
}

export async function getPromptTemplate(id: PromptTemplateId): Promise<PromptTemplateRecord> {
  const definition = BUILT_IN_PROMPTS[id]
  const record = await prisma.system_configs.findUnique({
    where: { key: templateSystemKey(id) },
  })
  return mergeDefinitionWithOverride(definition, parseStoredOverride(record?.value))
}

export async function listProductCopies(): Promise<ProductCopyRecord[]> {
  const records = await prisma.system_configs.findMany({
    where: {
      key: {
        startsWith: PRODUCT_COPY_KEY_PREFIX,
      },
    },
  })

  const overrides = new Map<ProductCopyId, ProductCopyPatch>()
  records.forEach((record) => {
    const id = record.key.replace(PRODUCT_COPY_KEY_PREFIX, '') as ProductCopyId
    if (!(id in BUILT_IN_PRODUCT_COPIES)) return
    const parsed = parseStoredCopyOverride(record.value)
    if (parsed) overrides.set(id, parsed)
  })

  return getBuiltInProductCopyDefinitions().map((definition) =>
    mergeCopyDefinitionWithOverride(definition, overrides.get(definition.id) ?? null),
  )
}

export async function getProductCopy(id: ProductCopyId): Promise<ProductCopyRecord> {
  const definition = BUILT_IN_PRODUCT_COPIES[id]
  const record = await prisma.system_configs.findUnique({
    where: { key: copySystemKey(id) },
  })
  return mergeCopyDefinitionWithOverride(definition, parseStoredCopyOverride(record?.value))
}

export async function listExternalAgentAssets(): Promise<ExternalAgentAssetRecord[]> {
  const definitions = Object.values(EXTERNAL_AGENT_ASSET_DEFINITIONS)
  const records = await prisma.system_configs.findMany({
    where: {
      key: {
        startsWith: EXTERNAL_AGENT_ASSET_KEY_PREFIX,
      },
    },
  })

  const overrides = new Map<ExternalAgentAssetId, ExternalAgentAssetPatch>()
  records.forEach((record) => {
    const id = record.key.replace(EXTERNAL_AGENT_ASSET_KEY_PREFIX, '') as ExternalAgentAssetId
    if (!(id in EXTERNAL_AGENT_ASSET_DEFINITIONS)) return
    const parsed = parseStoredExternalAgentAssetOverride(record.value)
    if (parsed) overrides.set(id, parsed)
  })

  const assets = await Promise.all(
    definitions.map(async (definition) =>
      mergeExternalAgentAsset(
        await readExternalAgentAssetBase(definition),
        overrides.get(definition.id) ?? null,
      ),
    ),
  )

  return assets
}

export async function getExternalAgentAsset(
  id: ExternalAgentAssetId,
): Promise<ExternalAgentAssetRecord> {
  const definition = EXTERNAL_AGENT_ASSET_DEFINITIONS[id]
  const [base, record] = await Promise.all([
    readExternalAgentAssetBase(definition),
    prisma.system_configs.findUnique({
      where: { key: externalAgentAssetSystemKey(id) },
    }),
  ])

  return mergeExternalAgentAsset(base, parseStoredExternalAgentAssetOverride(record?.value))
}

export async function saveExternalAgentAssetPatch(
  patch: ExternalAgentAssetPatch,
): Promise<ExternalAgentAssetRecord> {
  const definition = EXTERNAL_AGENT_ASSET_DEFINITIONS[patch.id]
  const base = await readExternalAgentAssetBase(definition)
  const nextContent = normalizeText(patch.content, base.content)

  await fs.mkdir(path.dirname(resolveExternalAgentAssetPath(definition)), { recursive: true })
  await fs.writeFile(resolveExternalAgentAssetPath(definition), nextContent, 'utf8')

  await prisma.system_configs.upsert({
    where: { key: externalAgentAssetSystemKey(patch.id) },
    update: { value: JSON.stringify({ id: patch.id, content: nextContent }), updatedAt: new Date() },
    create: {
      id: crypto.randomUUID(),
      updatedAt: new Date(),
      key: externalAgentAssetSystemKey(patch.id),
      value: JSON.stringify({ id: patch.id, content: nextContent }),
    },
  })

  return getExternalAgentAsset(patch.id)
}

export async function saveProductCopyPatch(
  patch: ProductCopyPatch,
): Promise<ProductCopyRecord> {
  const base = BUILT_IN_PRODUCT_COPIES[patch.id]
  const mergedPatch: ProductCopyPatch = {
    id: patch.id,
    languageContents: mapPromptLanguageRecord((language) =>
      normalizeText(patch.languageContents[language], base.languageContents[language]),
    ),
  }

  await prisma.system_configs.upsert({
    where: { key: copySystemKey(patch.id) },
    update: { value: JSON.stringify(mergedPatch), updatedAt: new Date() },
    create: { id: crypto.randomUUID(), key: copySystemKey(patch.id), value: JSON.stringify(mergedPatch), updatedAt: new Date() },
  })

  return getProductCopy(patch.id)
}

export async function getPromptTemplateContent(
  id: PromptTemplateId,
  language: PromptLanguage,
): Promise<PromptTemplateContent> {
  const record = await getPromptTemplate(id)
  return record.languageContents[language] ?? record.languageContents.zh
}

export async function savePromptTemplatePatch(
  patch: PromptTemplatePatch,
): Promise<PromptTemplateRecord> {
  const base = BUILT_IN_PROMPTS[patch.id]
  const mergedPatch: PromptTemplatePatch = {
    id: patch.id,
    languageContents: mapPromptLanguageRecord((language) =>
      patch.languageContents[language]
        ? mergeContent(base.languageContents[language], patch.languageContents[language])
        : undefined,
    ),
  }

  await prisma.system_configs.upsert({
    where: { key: templateSystemKey(patch.id) },
    update: { value: JSON.stringify(mergedPatch), updatedAt: new Date() },
    create: { id: crypto.randomUUID(), key: templateSystemKey(patch.id), value: JSON.stringify(mergedPatch), updatedAt: new Date() },
  })

  return getPromptTemplate(patch.id)
}

export async function savePromptStudioBundle(input: {
  templates?: PromptTemplatePatch[]
  productCopies?: ProductCopyPatch[]
  externalAgentAssets?: ExternalAgentAssetPatch[]
  runtime?: GenerationRuntimePatch
}) {
  if (input.templates?.length) {
    for (const template of input.templates) {
      if (!(template.id in BUILT_IN_PROMPTS)) continue
      await savePromptTemplatePatch(template)
    }
  }

  if (input.productCopies?.length) {
    for (const copy of input.productCopies) {
      if (!(copy.id in BUILT_IN_PRODUCT_COPIES)) continue
      await saveProductCopyPatch(copy)
    }
  }

  if (input.externalAgentAssets?.length) {
    for (const asset of input.externalAgentAssets) {
      if (!(asset.id in EXTERNAL_AGENT_ASSET_DEFINITIONS)) continue
      await saveExternalAgentAssetPatch(asset)
    }
  }

  if (input.runtime) {
    const current = await getGenerationRuntimeConfig()
    const next = sanitizeRuntimePatch({
      ...current,
      ...input.runtime,
    })

    await writeVersionedSystemConfig({
      key: PROMPT_STUDIO_SYSTEM_KEY,
      value: next,
      parse: parseStoredRuntimeValue,
      fallback: DEFAULT_RUNTIME_CONFIG,
      source: 'prompt-studio.runtime',
      actor: 'prompt-studio',
    })
  }

  return getPromptStudioBundle()
}

export async function resetPromptStudio(options?: {
  templateId?: PromptTemplateId
  productCopyId?: ProductCopyId
  language?: PromptLanguage
  runtime?: boolean
}) {
  if (options?.runtime) {
    await prisma.system_configs.deleteMany({
      where: { key: PROMPT_STUDIO_SYSTEM_KEY },
    })
  }

  if (options?.templateId) {
    if (!options.language) {
      await prisma.system_configs.deleteMany({
        where: { key: templateSystemKey(options.templateId) },
      })
    } else {
      const current = await prisma.system_configs.findUnique({
        where: { key: templateSystemKey(options.templateId) },
      })

      const parsed = parseStoredOverride(current?.value)
      if (parsed?.languageContents?.[options.language]) {
        delete parsed.languageContents[options.language]
        if (hasAnyLanguageOverride(parsed.languageContents)) {
          await prisma.system_configs.upsert({
            where: { key: templateSystemKey(options.templateId) },
            update: { value: JSON.stringify(parsed), updatedAt: new Date() },
            create: { id: crypto.randomUUID(), key: templateSystemKey(options.templateId), value: JSON.stringify(parsed), updatedAt: new Date() },
          })
        } else {
          await prisma.system_configs.deleteMany({
            where: { key: templateSystemKey(options.templateId) },
          })
        }
      }
    }
  }

  if (options?.productCopyId) {
    if (!options.language) {
      await prisma.system_configs.deleteMany({
        where: { key: copySystemKey(options.productCopyId) },
      })
    } else {
      const current = await prisma.system_configs.findUnique({
        where: { key: copySystemKey(options.productCopyId) },
      })

      const parsed = parseStoredCopyOverride(current?.value)
      if (parsed?.languageContents?.[options.language]) {
        delete parsed.languageContents[options.language]
        if (hasAnyLanguageOverride(parsed.languageContents)) {
          await prisma.system_configs.upsert({
            where: { key: copySystemKey(options.productCopyId) },
            update: { value: JSON.stringify(parsed), updatedAt: new Date() },
            create: { id: crypto.randomUUID(), key: copySystemKey(options.productCopyId), value: JSON.stringify(parsed), updatedAt: new Date() },
          })
        } else {
          await prisma.system_configs.deleteMany({
            where: { key: copySystemKey(options.productCopyId) },
          })
        }
      }
    }
  }

  if (options?.language && !options.templateId && !options.productCopyId) {
    const templateIds = Object.keys(BUILT_IN_PROMPTS) as PromptTemplateId[]
    for (const templateId of templateIds) {
      const current = await prisma.system_configs.findUnique({
        where: { key: templateSystemKey(templateId) },
      })

      const parsed = parseStoredOverride(current?.value)
      if (!parsed?.languageContents?.[options.language]) continue

      delete parsed.languageContents[options.language]
      if (hasAnyLanguageOverride(parsed.languageContents)) {
await prisma.system_configs.upsert({
            where: { key: templateSystemKey(templateId) },
            update: { value: JSON.stringify(parsed), updatedAt: new Date() },
            create: { id: crypto.randomUUID(), key: templateSystemKey(templateId), value: JSON.stringify(parsed), updatedAt: new Date() },
          })
      } else {
        await prisma.system_configs.deleteMany({
          where: { key: templateSystemKey(templateId) },
        })
      }
    }
  }

  if (options?.language && !options.templateId && !options.productCopyId) {
    const productCopyIds = Object.keys(BUILT_IN_PRODUCT_COPIES) as ProductCopyId[]
    for (const productCopyId of productCopyIds) {
      const current = await prisma.system_configs.findUnique({
        where: { key: copySystemKey(productCopyId) },
      })

      const parsed = parseStoredCopyOverride(current?.value)
      if (!parsed?.languageContents?.[options.language]) continue

      delete parsed.languageContents[options.language]
      if (hasAnyLanguageOverride(parsed.languageContents)) {
await prisma.system_configs.upsert({
            where: { key: copySystemKey(productCopyId) },
            update: { value: JSON.stringify(parsed), updatedAt: new Date() },
            create: { id: crypto.randomUUID(), key: copySystemKey(productCopyId), value: JSON.stringify(parsed), updatedAt: new Date() },
          })
      } else {
        await prisma.system_configs.deleteMany({
          where: { key: copySystemKey(productCopyId) },
        })
      }
    }
  }

  return getPromptStudioBundle()
}

export async function getGenerationRuntimeConfig(): Promise<GenerationRuntimeConfig> {
  const record = await readVersionedSystemConfig<GenerationRuntimeConfig>({
    key: PROMPT_STUDIO_SYSTEM_KEY,
    parse: parseStoredRuntimeConfig,
    fallback: DEFAULT_RUNTIME_CONFIG,
  })

  return record.value
}

export async function getGenerationRuntimeConfigRecord() {
  const [record, history] = await Promise.all([
    readVersionedSystemConfig<GenerationRuntimeConfig>({
      key: PROMPT_STUDIO_SYSTEM_KEY,
      parse: parseStoredRuntimeConfig,
      fallback: DEFAULT_RUNTIME_CONFIG,
    }),
    listVersionedSystemConfigHistory(PROMPT_STUDIO_SYSTEM_KEY, 12),
  ])

  return {
    runtime: sanitizeRuntimePatch(record.value),
    meta: record.meta,
    history,
  }
}

export async function getGenerationEditorialPolicy(language: PromptLanguage) {
  const runtime = await getGenerationRuntimeConfig()
  return runtime.editorialPolicies[language] ?? runtime.editorialPolicies.zh
}

export function renderPromptVariables(
  template: string,
  variables: Record<string, string | number | null | undefined>,
) {
  let output = template
  for (const [key, value] of Object.entries(variables)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'gu'), String(value ?? ''))
  }
  return output
}

export async function getPromptStudioBundle(): Promise<PromptStudioBundle> {
  const [templates, productCopies, runtimeRecord, externalAgentAssets] = await Promise.all([
    listPromptTemplates(),
    listProductCopies(),
    getGenerationRuntimeConfigRecord(),
    listExternalAgentAssets(),
  ])

  const externalRoot = getExternalAgentsRootDir()

  return {
    languages: PROMPT_LANGUAGES,
    templates,
    productCopies,
    runtime: runtimeRecord.runtime,
    runtimeMeta: runtimeRecord.meta,
    runtimeHistory: runtimeRecord.history,
    externalAgents: {
      rootDir: externalRoot,
      readmePath: path.join(externalRoot, 'README.md'),
      promptGuidePath: path.join(externalRoot, 'PROMPT_GUIDE.md'),
      superPromptPath: path.join(externalRoot, 'SUPER_PROMPT.md'),
      configExamplePath: path.join(externalRoot, 'adapters.example.json'),
      assets: externalAgentAssets,
    },
  }
}

export async function exportPromptStudioBundle() {
  return getPromptStudioBundle()
}
