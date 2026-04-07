import type {
  NodeViewModel,
  PaperViewModel,
  ResearchPipelineContextSummary,
  TopicGuidanceLedgerState,
  TopicResearchExportBatch,
  TopicResearchExportBundle,
  TopicResearchWorld,
} from '@/types/alpha'
import type { LanguageCode } from '@/i18n/types'
import type { FavoriteExcerpt, ResearchNoteKind } from '@/types/tracker'

type NotebookLanguage = LanguageCode

const NOTE_KIND_LABELS: Record<NotebookLanguage, Record<ResearchNoteKind, string>> = {
  zh: {
    excerpt: '论文摘录',
    assistant: 'AI 讲解',
    evidence: '证据卡片',
    node: '节点笔记',
    paper: '论文笔记',
    stage: '阶段线索',
    context: '上下文线索',
  },
  en: {
    excerpt: 'Paper Excerpt',
    assistant: 'AI Insight',
    evidence: 'Evidence Card',
    node: 'Node Note',
    paper: 'Paper Note',
    stage: 'Stage Thread',
    context: 'Context Thread',
  },
  ja: {
    excerpt: '論文抜粋',
    assistant: 'AI 解説',
    evidence: '証拠カード',
    node: 'ノードノート',
    paper: '論文ノート',
    stage: '段階メモ',
    context: '文脈メモ',
  },
  ko: {
    excerpt: '논문 발췌',
    assistant: 'AI 해설',
    evidence: '증거 카드',
    node: '노드 노트',
    paper: '논문 노트',
    stage: '단계 메모',
    context: '맥락 메모',
  },
  de: {
    excerpt: 'Paper-Auszug',
    assistant: 'KI-Einordnung',
    evidence: 'Evidenzkarte',
    node: 'Knoten-Notiz',
    paper: 'Paper-Notiz',
    stage: 'Stufenfaden',
    context: 'Kontextfaden',
  },
  fr: {
    excerpt: 'Extrait du papier',
    assistant: 'Analyse IA',
    evidence: 'Carte de preuve',
    node: 'Note de nœud',
    paper: 'Note de papier',
    stage: 'Fil d’étape',
    context: 'Fil de contexte',
  },
  es: {
    excerpt: 'Extracto del paper',
    assistant: 'Explicación de IA',
    evidence: 'Tarjeta de evidencia',
    node: 'Nota de nodo',
    paper: 'Nota de paper',
    stage: 'Hilo de etapa',
    context: 'Hilo de contexto',
  },
  ru: {
    excerpt: 'Фрагмент статьи',
    assistant: 'Пояснение ИИ',
    evidence: 'Карточка доказательства',
    node: 'Заметка узла',
    paper: 'Заметка статьи',
    stage: 'Нить этапа',
    context: 'Контекстная нить',
  },
}

const NOTEBOOK_COPY = {
  zh: {
    generalTopic: '未归类主题',
    notebookExportTitle: '研究笔记导出',
    researchDossierTitle: '研究档案',
    researchHighlightsTitle: '研究重点摘编',
    multiTopicCollectionTitle: '多主题研究总集',
    exportedAt: '导出时间',
    updatedAt: '更新时间',
    entryCount: '条目数量',
    savedAt: '保存时间',
    source: '来源',
    relatedPaper: '关联论文',
    summary: '摘要',
    path: '路径',
    tags: '标签',
    unknown: '未知',
    none: '暂无',
    stage: '阶段',
    round: '轮次',
    yes: '是',
    no: '否',
    researchContinuity: '研究连续性',
    continuityThreads: '连续性线索',
    globalOpenQuestions: '全局开放问题',
    trackedContinuity: '持续追踪线索',
    pendingAnswers: '仍待回答的问题',
    recentResearchRounds: '最近研究轮次',
    time: '时间',
    discoveredPapers: '新发现论文',
    admittedPapers: '纳入论文',
    rebuiltContent: '重建内容',
    advanceNextStage: '是否推进下一阶段',
    actionLog: '动作记录',
    unresolvedQuestions: '未决问题',
    researchWorld: '研究世界',
    maturity: '成熟度',
    stagesNodesPapers: '阶段 / 节点 / 论文',
    establishedClaims: '已建立判断',
    openQuestions: '开放问题',
    activeAgenda: '当前议程',
    critiquesAndDoubts: '批评与疑点',
    guidanceLedger: '引导账本',
    activeAcceptedDeferred: '激活 / 接纳 / 延后',
    activeDirectives: '当前指令',
    effect: '影响',
    followUp: '后续',
    topic: '主题',
    language: '语言',
    noteEntries: '笔记条目',
    topicOverview: '主题总览',
    closingAndJudgment: '收束与判断',
    currentResearchRound: '本轮研究回合',
    status: '状态',
    mode: '模式',
    startedAt: '开始时间',
    latestUpdatedAt: '最近更新时间',
    discoveredAdmittedGenerated: '发现 / 纳入 / 生成',
    keyMovesThisRound: '本轮关键动作',
    nodeAdjustments: '节点调整',
    currentOpenQuestions: '当前开放问题',
    stageMap: '阶段地图',
    branch: '分支',
    nodeCount: '节点数',
    paperCount: '论文数',
    stageCorrections: '阶段内关键修正',
    stageQuestions: '阶段仍待回答',
    nodeDossiers: '节点档案',
    stageAffiliation: '所属阶段',
    node: '节点',
    paper: '论文',
    figuresTablesFormulas: '图 / 表 / 公式',
    nodePaperRoles: '节点内论文角色',
    role: '角色',
    contribution: '贡献',
    keyComparisons: '关键比较',
    nodeBody: '节点正文',
    critiqueSection: '评价与质疑',
    keyEvidence: '关键证据',
    nodeClosing: '节点收束',
    authors: '作者',
    linkedNodes: '节点关联',
    figuresTablesFormulasSections: '图 / 表 / 公式 / 正文段落',
    paperBody: '论文正文',
    paperClosing: '论文收束',
    paperDossiers: '论文档案',
    notebookAppendix: '研究笔记附录',
    coveredTopics: '覆盖主题',
    candidateNotes: '候选笔记',
    highlightEntries: '重点条目',
    noteKinds: '涉及类型',
    topicCount: '主题数',
    totalNodes: '节点总数',
    totalPapers: '论文总数',
  },
  en: {
    generalTopic: 'Unsorted Topic',
    notebookExportTitle: 'Research Notebook Export',
    researchDossierTitle: 'Research Dossier',
    researchHighlightsTitle: 'Research Highlights',
    multiTopicCollectionTitle: 'Multi-Topic Research Collection',
    exportedAt: 'Exported',
    updatedAt: 'Updated',
    entryCount: 'Entry Count',
    savedAt: 'Saved',
    source: 'Source',
    relatedPaper: 'Related Paper',
    summary: 'Summary',
    path: 'Path',
    tags: 'Tags',
    unknown: 'Unknown',
    none: 'None',
    stage: 'Stage',
    round: 'Round',
    yes: 'Yes',
    no: 'No',
    researchContinuity: 'Research Continuity',
    continuityThreads: 'Continuity Threads',
    globalOpenQuestions: 'Global Open Questions',
    trackedContinuity: 'Tracked Continuity',
    pendingAnswers: 'Questions Still Open',
    recentResearchRounds: 'Recent Research Rounds',
    time: 'Time',
    discoveredPapers: 'Discovered Papers',
    admittedPapers: 'Admitted Papers',
    rebuiltContent: 'Rebuilt Content',
    advanceNextStage: 'Advance To Next Stage',
    actionLog: 'Action Log',
    unresolvedQuestions: 'Unresolved Questions',
    researchWorld: 'Research World',
    maturity: 'Maturity',
    stagesNodesPapers: 'Stages / Nodes / Papers',
    establishedClaims: 'Established Claims',
    openQuestions: 'Open Questions',
    activeAgenda: 'Active Agenda',
    critiquesAndDoubts: 'Critiques And Doubts',
    guidanceLedger: 'Guidance Ledger',
    activeAcceptedDeferred: 'Active / Accepted / Deferred',
    activeDirectives: 'Active Directives',
    effect: 'Effect',
    followUp: 'Follow-up',
    topic: 'Topic',
    language: 'Language',
    noteEntries: 'Notebook Entries',
    topicOverview: 'Topic Overview',
    closingAndJudgment: 'Closing And Judgment',
    currentResearchRound: 'Current Research Round',
    status: 'Status',
    mode: 'Mode',
    startedAt: 'Started',
    latestUpdatedAt: 'Last Updated',
    discoveredAdmittedGenerated: 'Discovered / Admitted / Generated',
    keyMovesThisRound: 'Key Moves This Round',
    nodeAdjustments: 'Node Adjustments',
    currentOpenQuestions: 'Current Open Questions',
    stageMap: 'Stage Map',
    branch: 'Branch',
    nodeCount: 'Node Count',
    paperCount: 'Paper Count',
    stageCorrections: 'Key Corrections In This Stage',
    stageQuestions: 'Questions Still Open In This Stage',
    nodeDossiers: 'Node Dossiers',
    stageAffiliation: 'Stage',
    node: 'Node',
    paper: 'Paper',
    figuresTablesFormulas: 'Figures / Tables / Formulae',
    nodePaperRoles: 'Paper Roles In Node',
    role: 'Role',
    contribution: 'Contribution',
    keyComparisons: 'Key Comparisons',
    nodeBody: 'Node Body',
    critiqueSection: 'Critique And Doubts',
    keyEvidence: 'Key Evidence',
    nodeClosing: 'Node Closing',
    authors: 'Authors',
    linkedNodes: 'Linked Nodes',
    figuresTablesFormulasSections: 'Figures / Tables / Formulae / Sections',
    paperBody: 'Paper Body',
    paperClosing: 'Paper Closing',
    paperDossiers: 'Paper Dossiers',
    notebookAppendix: 'Notebook Appendix',
    coveredTopics: 'Covered Topics',
    candidateNotes: 'Candidate Notes',
    highlightEntries: 'Highlighted Entries',
    noteKinds: 'Note Types',
    topicCount: 'Topic Count',
    totalNodes: 'Total Nodes',
    totalPapers: 'Total Papers',
  },
} as const

type NotebookCopyKey = keyof (typeof NOTEBOOK_COPY)['en']
type NotebookCopy = Record<NotebookCopyKey, string>

const NOTEBOOK_COPY_OVERRIDES: Record<
  Exclude<NotebookLanguage, 'zh' | 'en'>,
  Partial<NotebookCopy>
> = {
  ja: {
    generalTopic: '未分類トピック',
    notebookExportTitle: '研究ノート書き出し',
    researchDossierTitle: '研究ドシエ',
    researchHighlightsTitle: '研究ハイライト',
    multiTopicCollectionTitle: 'マルチトピック研究コレクション',
    exportedAt: '書き出し日時',
    updatedAt: '更新日時',
    entryCount: '項目数',
    savedAt: '保存日時',
    source: '出典',
    relatedPaper: '関連論文',
    summary: '要約',
    tags: 'タグ',
    unknown: '不明',
    none: 'なし',
    stage: '段階',
    round: 'ラウンド',
    yes: 'はい',
    no: 'いいえ',
    topic: 'トピック',
    noteEntries: 'ノート項目',
    topicOverview: 'トピック概観',
    researchWorld: '研究世界',
    openQuestions: '未解決の問い',
    guidanceLedger: 'ガイダンス台帳',
    currentResearchRound: '現在の研究ラウンド',
    status: '状態',
    mode: 'モード',
    latestUpdatedAt: '最終更新',
    node: 'ノード',
    paper: '論文',
    keyEvidence: '重要な証拠',
    notebookAppendix: '研究ノート付録',
    coveredTopics: '対象トピック',
    candidateNotes: '候補ノート',
    highlightEntries: '注目項目',
    noteKinds: 'ノート種別',
    topicCount: 'トピック数',
    totalNodes: 'ノード総数',
    totalPapers: '論文総数',
  },
  ko: {
    generalTopic: '미분류 주제',
    notebookExportTitle: '연구 노트 내보내기',
    researchDossierTitle: '연구 도시에',
    researchHighlightsTitle: '연구 하이라이트',
    multiTopicCollectionTitle: '다중 주제 연구 컬렉션',
    exportedAt: '내보낸 시각',
    updatedAt: '업데이트 시각',
    entryCount: '항목 수',
    savedAt: '저장 시각',
    source: '출처',
    relatedPaper: '연결 논문',
    summary: '요약',
    tags: '태그',
    unknown: '알 수 없음',
    none: '없음',
    stage: '단계',
    round: '라운드',
    yes: '예',
    no: '아니오',
    topic: '주제',
    noteEntries: '노트 항목',
    topicOverview: '주제 개요',
    researchWorld: '연구 세계',
    openQuestions: '열린 질문',
    guidanceLedger: '가이던스 원장',
    currentResearchRound: '현재 연구 라운드',
    status: '상태',
    mode: '모드',
    latestUpdatedAt: '최근 업데이트',
    node: '노드',
    paper: '논문',
    keyEvidence: '핵심 증거',
    notebookAppendix: '연구 노트 부록',
    coveredTopics: '포함 주제',
    candidateNotes: '후보 노트',
    highlightEntries: '주요 항목',
    noteKinds: '노트 종류',
    topicCount: '주제 수',
    totalNodes: '총 노드 수',
    totalPapers: '총 논문 수',
  },
  de: {
    generalTopic: 'Unsortiertes Thema',
    notebookExportTitle: 'Export der Forschungsnotizen',
    researchDossierTitle: 'Forschungsdossier',
    researchHighlightsTitle: 'Forschungshighlights',
    multiTopicCollectionTitle: 'Mehrthemen-Forschungssammlung',
    exportedAt: 'Exportiert am',
    updatedAt: 'Aktualisiert am',
    entryCount: 'Anzahl Einträge',
    savedAt: 'Gespeichert am',
    source: 'Quelle',
    relatedPaper: 'Zugehöriges Paper',
    summary: 'Zusammenfassung',
    tags: 'Tags',
    unknown: 'Unbekannt',
    none: 'Keine',
    stage: 'Stufe',
    round: 'Runde',
    yes: 'Ja',
    no: 'Nein',
    topic: 'Thema',
    noteEntries: 'Notizeinträge',
    topicOverview: 'Themenüberblick',
    researchWorld: 'Forschungswelt',
    openQuestions: 'Offene Fragen',
    guidanceLedger: 'Guidance-Ledger',
    currentResearchRound: 'Aktuelle Forschungsrunde',
    status: 'Status',
    mode: 'Modus',
    latestUpdatedAt: 'Zuletzt aktualisiert',
    node: 'Knoten',
    paper: 'Paper',
    keyEvidence: 'Wichtige Evidenz',
    notebookAppendix: 'Anhang der Forschungsnotizen',
    coveredTopics: 'Abgedeckte Themen',
    candidateNotes: 'Kandidatennotizen',
    highlightEntries: 'Hervorgehobene Einträge',
    noteKinds: 'Notiztypen',
    topicCount: 'Anzahl Themen',
    totalNodes: 'Gesamte Knoten',
    totalPapers: 'Gesamte Papers',
  },
  fr: {
    generalTopic: 'Sujet non classé',
    notebookExportTitle: 'Export du carnet de recherche',
    researchDossierTitle: 'Dossier de recherche',
    researchHighlightsTitle: 'Points forts de recherche',
    multiTopicCollectionTitle: 'Collection de recherche multi-sujets',
    exportedAt: 'Exporté le',
    updatedAt: 'Mis à jour le',
    entryCount: 'Nombre d’entrées',
    savedAt: 'Enregistré le',
    source: 'Source',
    relatedPaper: 'Papier lié',
    summary: 'Résumé',
    tags: 'Étiquettes',
    unknown: 'Inconnu',
    none: 'Aucun',
    stage: 'Étape',
    round: 'Tour',
    yes: 'Oui',
    no: 'Non',
    topic: 'Sujet',
    noteEntries: 'Entrées du carnet',
    topicOverview: 'Vue d’ensemble du sujet',
    researchWorld: 'Monde de recherche',
    openQuestions: 'Questions ouvertes',
    guidanceLedger: 'Registre de guidage',
    currentResearchRound: 'Tour de recherche actuel',
    status: 'Statut',
    mode: 'Mode',
    latestUpdatedAt: 'Dernière mise à jour',
    node: 'Nœud',
    paper: 'Papier',
    keyEvidence: 'Preuves clés',
    notebookAppendix: 'Annexe du carnet de recherche',
    coveredTopics: 'Sujets couverts',
    candidateNotes: 'Notes candidates',
    highlightEntries: 'Entrées mises en avant',
    noteKinds: 'Types de notes',
    topicCount: 'Nombre de sujets',
    totalNodes: 'Nombre total de nœuds',
    totalPapers: 'Nombre total de papiers',
  },
  es: {
    generalTopic: 'Tema sin clasificar',
    notebookExportTitle: 'Exportación del cuaderno de investigación',
    researchDossierTitle: 'Dosier de investigación',
    researchHighlightsTitle: 'Aspectos destacados de investigación',
    multiTopicCollectionTitle: 'Colección de investigación multitema',
    exportedAt: 'Exportado el',
    updatedAt: 'Actualizado el',
    entryCount: 'Cantidad de entradas',
    savedAt: 'Guardado el',
    source: 'Fuente',
    relatedPaper: 'Paper relacionado',
    summary: 'Resumen',
    tags: 'Etiquetas',
    unknown: 'Desconocido',
    none: 'Ninguno',
    stage: 'Etapa',
    round: 'Ronda',
    yes: 'Sí',
    no: 'No',
    topic: 'Tema',
    noteEntries: 'Entradas del cuaderno',
    topicOverview: 'Resumen del tema',
    researchWorld: 'Mundo de investigación',
    openQuestions: 'Preguntas abiertas',
    guidanceLedger: 'Registro de guía',
    currentResearchRound: 'Ronda de investigación actual',
    status: 'Estado',
    mode: 'Modo',
    latestUpdatedAt: 'Última actualización',
    node: 'Nodo',
    paper: 'Paper',
    keyEvidence: 'Evidencia clave',
    notebookAppendix: 'Apéndice del cuaderno',
    coveredTopics: 'Temas cubiertos',
    candidateNotes: 'Notas candidatas',
    highlightEntries: 'Entradas destacadas',
    noteKinds: 'Tipos de nota',
    topicCount: 'Cantidad de temas',
    totalNodes: 'Total de nodos',
    totalPapers: 'Total de papers',
  },
  ru: {
    generalTopic: 'Несортированная тема',
    notebookExportTitle: 'Экспорт исследовательского блокнота',
    researchDossierTitle: 'Исследовательское досье',
    researchHighlightsTitle: 'Ключевые выводы исследования',
    multiTopicCollectionTitle: 'Многотемная исследовательская коллекция',
    exportedAt: 'Экспортировано',
    updatedAt: 'Обновлено',
    entryCount: 'Количество записей',
    savedAt: 'Сохранено',
    source: 'Источник',
    relatedPaper: 'Связанная статья',
    summary: 'Сводка',
    tags: 'Теги',
    unknown: 'Неизвестно',
    none: 'Нет',
    stage: 'Этап',
    round: 'Раунд',
    yes: 'Да',
    no: 'Нет',
    topic: 'Тема',
    noteEntries: 'Записи блокнота',
    topicOverview: 'Обзор темы',
    researchWorld: 'Исследовательский мир',
    openQuestions: 'Открытые вопросы',
    guidanceLedger: 'Реестр указаний',
    currentResearchRound: 'Текущий исследовательский раунд',
    status: 'Статус',
    mode: 'Режим',
    latestUpdatedAt: 'Последнее обновление',
    node: 'Узел',
    paper: 'Статья',
    keyEvidence: 'Ключевые доказательства',
    notebookAppendix: 'Приложение к блокноту',
    coveredTopics: 'Охваченные темы',
    candidateNotes: 'Кандидатные заметки',
    highlightEntries: 'Выделенные записи',
    noteKinds: 'Типы заметок',
    topicCount: 'Количество тем',
    totalNodes: 'Всего узлов',
    totalPapers: 'Всего статей',
  },
}

const NOTEBOOK_COPY_BY_LANGUAGE: Record<NotebookLanguage, NotebookCopy> = {
  zh: NOTEBOOK_COPY.zh,
  en: NOTEBOOK_COPY.en,
  ja: { ...NOTEBOOK_COPY.en, ...NOTEBOOK_COPY_OVERRIDES.ja },
  ko: { ...NOTEBOOK_COPY.en, ...NOTEBOOK_COPY_OVERRIDES.ko },
  de: { ...NOTEBOOK_COPY.en, ...NOTEBOOK_COPY_OVERRIDES.de },
  fr: { ...NOTEBOOK_COPY.en, ...NOTEBOOK_COPY_OVERRIDES.fr },
  es: { ...NOTEBOOK_COPY.en, ...NOTEBOOK_COPY_OVERRIDES.es },
  ru: { ...NOTEBOOK_COPY.en, ...NOTEBOOK_COPY_OVERRIDES.ru },
}

// Kept temporarily so the original per-locale export copy remains in source for future curation.
void NOTEBOOK_COPY_BY_LANGUAGE

const CLEAN_NOTE_KIND_LABELS: Partial<
  Record<NotebookLanguage, Partial<Record<ResearchNoteKind, string>>>
> = {
  zh: {
    excerpt: '论文摘录',
    assistant: 'AI 解读',
    evidence: '证据卡片',
    node: '节点笔记',
    paper: '论文笔记',
    stage: '阶段线索',
    context: '上下文线索',
  },
  de: {
    assistant: 'KI-Einordnung',
  },
}

const CLEAN_ZH_NOTEBOOK_COPY_OVERRIDES: Partial<NotebookCopy> = {
  generalTopic: '未归类主题',
  notebookExportTitle: '研究笔记导出',
  researchDossierTitle: '研究档案',
  researchHighlightsTitle: '研究重点摘编',
  multiTopicCollectionTitle: '多主题研究合集',
  exportedAt: '导出时间',
  updatedAt: '更新时间',
  entryCount: '条目数量',
  savedAt: '保存时间',
  source: '来源',
  relatedPaper: '关联论文',
  summary: '摘要',
  path: '路径',
  tags: '标签',
  unknown: '未知',
  none: '暂无',
  stage: '阶段',
  round: '轮次',
  yes: '是',
  no: '否',
  researchContinuity: '研究连续性',
  continuityThreads: '连续性线索',
  globalOpenQuestions: '全局开放问题',
  trackedContinuity: '持续追踪线索',
  pendingAnswers: '仍待回答的问题',
  recentResearchRounds: '最近研究轮次',
  time: '时间',
  discoveredPapers: '新发现论文',
  admittedPapers: '纳入论文',
  rebuiltContent: '重建内容',
  advanceNextStage: '是否推进下一阶段',
  actionLog: '动作记录',
  unresolvedQuestions: '未决问题',
  researchWorld: '研究世界',
  maturity: '成熟度',
  stagesNodesPapers: '阶段 / 节点 / 论文',
  establishedClaims: '已建立判断',
  openQuestions: '开放问题',
  activeAgenda: '当前议程',
  critiquesAndDoubts: '批评与疑点',
  guidanceLedger: '引导账本',
  activeAcceptedDeferred: '激活 / 接受 / 延后',
  activeDirectives: '当前指令',
  effect: '影响',
  followUp: '后续',
  topic: '主题',
  language: '语言',
  noteEntries: '笔记条目',
  topicOverview: '主题总览',
  closingAndJudgment: '收束与判断',
  currentResearchRound: '当前研究回合',
  status: '状态',
  mode: '模式',
  startedAt: '开始时间',
  latestUpdatedAt: '最近更新时间',
  discoveredAdmittedGenerated: '发现 / 纳入 / 生成',
  keyMovesThisRound: '本轮关键动作',
  nodeAdjustments: '节点调整',
  currentOpenQuestions: '当前开放问题',
  stageMap: '阶段地图',
  branch: '分支',
  nodeCount: '节点数',
  paperCount: '论文数',
  stageCorrections: '阶段内关键修正',
  stageQuestions: '阶段仍待回答',
  nodeDossiers: '节点档案',
  stageAffiliation: '所属阶段',
  node: '节点',
  paper: '论文',
  figuresTablesFormulas: '图 / 表 / 公式',
  nodePaperRoles: '节点内论文角色',
  role: '角色',
  contribution: '贡献',
  keyComparisons: '关键比较',
  nodeBody: '节点正文',
  critiqueSection: '评价与质疑',
  keyEvidence: '关键证据',
  nodeClosing: '节点收束',
  authors: '作者',
  linkedNodes: '关联节点',
  figuresTablesFormulasSections: '图 / 表 / 公式 / 正文段落',
  paperBody: '论文正文',
  paperClosing: '论文收束',
  paperDossiers: '论文档案',
  notebookAppendix: '研究笔记附录',
  coveredTopics: '覆盖主题',
  candidateNotes: '候选笔记',
  highlightEntries: '重点条目',
  noteKinds: '涉及类型',
  topicCount: '主题数',
  totalNodes: '节点总数',
  totalPapers: '论文总数',
}

const CLEAN_NOTEBOOK_COPY_BY_LANGUAGE: Record<NotebookLanguage, NotebookCopy> = {
  zh: { ...NOTEBOOK_COPY.en, ...CLEAN_ZH_NOTEBOOK_COPY_OVERRIDES },
  en: NOTEBOOK_COPY.en,
  ja: NOTEBOOK_COPY.en,
  ko: NOTEBOOK_COPY.en,
  de: NOTEBOOK_COPY.en,
  fr: NOTEBOOK_COPY.en,
  es: NOTEBOOK_COPY.en,
  ru: NOTEBOOK_COPY.en,
}

const DOSSIER_SCHEMA_VERSION = 'topic-research-dossier-v1'
const BATCH_DOSSIER_SCHEMA_VERSION = 'topic-research-batch-dossier-v1'

const NOTE_KIND_PRIORITY: Record<ResearchNoteKind, number> = {
  evidence: 7,
  assistant: 6,
  stage: 5,
  node: 4,
  paper: 4,
  excerpt: 3,
  context: 2,
}

type TopicLookup = Record<string, string>

type DossierOptions = {
  title?: string
  locale?: string
}

function normalizeNotebookLanguage(locale = 'zh-CN'): NotebookLanguage {
  const normalized = locale.toLowerCase()
  if (normalized.startsWith('zh')) return 'zh'
  if (normalized.startsWith('ja')) return 'ja'
  if (normalized.startsWith('ko')) return 'ko'
  if (normalized.startsWith('de')) return 'de'
  if (normalized.startsWith('fr')) return 'fr'
  if (normalized.startsWith('es')) return 'es'
  if (normalized.startsWith('ru')) return 'ru'
  return 'en'
}

function getNotebookCopy(locale = 'zh-CN') {
  return CLEAN_NOTEBOOK_COPY_BY_LANGUAGE[normalizeNotebookLanguage(locale)]
}

function getClauseSeparator(locale = 'zh-CN') {
  return normalizeNotebookLanguage(locale) === 'zh' ? '；' : '; '
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
}

function normalizeParagraphs(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]

  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 12)
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]

  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 8)
}

function isNotebookKind(value: string): value is ResearchNoteKind {
  return value in NOTE_KIND_LABELS.zh
}

function toDisplayDate(value: string, locale = 'zh-CN') {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value
  return new Date(timestamp).toLocaleString(locale)
}

function renderParagraphs(lines: string[], paragraphs: Array<string | null | undefined>) {
  paragraphs
    .map((paragraph) => cleanText(paragraph))
    .filter(Boolean)
    .forEach((paragraph) => {
      lines.push(paragraph)
      lines.push('')
    })
}

function renderBullets(lines: string[], items: Array<string | null | undefined>) {
  items
    .map((item) => cleanText(item))
    .filter(Boolean)
    .forEach((item) => {
      lines.push(`- ${item}`)
    })

  if (lines[lines.length - 1] !== '') {
    lines.push('')
  }
}

function pickEvidenceHighlights<
  T extends {
    label: string
    type: string
    whyItMatters?: string
    quote: string
    sourcePaperTitle?: string
    importance?: number
  },
>(items: T[], limit = 3) {
  return [...items]
    .sort((left, right) => (right.importance ?? 0) - (left.importance ?? 0))
    .slice(0, limit)
}

function formatStageLabel(stageIndex: number | null, locale = 'zh-CN') {
  const copy = getNotebookCopy(locale)
  return stageIndex ? `${copy.stage} ${stageIndex}` : copy.stage
}

function dedupeNotes(notes: FavoriteExcerpt[]) {
  return [...notes].sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
}

function shiftMarkdownHeadings(markdown: string, offset = 1) {
  return markdown
    .split('\n')
    .map((line) => {
      const match = line.match(/^(#{1,6})(\s.*)$/u)
      if (!match) return line
      return `${'#'.repeat(Math.min(6, match[1].length + offset))}${match[2]}`
    })
    .join('\n')
}

function sortNotesForHighlights(notes: FavoriteExcerpt[]) {
  return [...notes].sort((left, right) => {
    const leftPriority = NOTE_KIND_PRIORITY[left.kind ?? 'excerpt'] ?? 0
    const rightPriority = NOTE_KIND_PRIORITY[right.kind ?? 'excerpt'] ?? 0
    if (leftPriority !== rightPriority) return rightPriority - leftPriority

    const leftLength = left.paragraphs.join(' ').length + cleanText(left.summary).length
    const rightLength = right.paragraphs.join(' ').length + cleanText(right.summary).length
    if (leftLength !== rightLength) return rightLength - leftLength

    return Date.parse(right.savedAt) - Date.parse(left.savedAt)
  })
}

function buildTopicNoteGroups(
  notes: FavoriteExcerpt[],
  topicLookup: TopicLookup = {},
  locale = 'zh-CN',
) {
  const copy = getNotebookCopy(locale)
  const grouped = notes.reduce<Record<string, FavoriteExcerpt[]>>((accumulator, note) => {
    const key = note.topicId ?? 'general'
    accumulator[key] = [...(accumulator[key] ?? []), note]
    return accumulator
  }, {})

  return Object.entries(grouped)
    .map(([topicId, entries]) => ({
      topicId,
      topicName:
        topicId === 'general'
          ? copy.generalTopic
          : entries[0]?.topicTitle || topicLookup[topicId] || topicId,
      notes: sortNotesForHighlights(entries),
    }))
    .sort((left, right) => right.notes.length - left.notes.length)
}

function appendPipelineSummary(
  lines: string[],
  pipeline: ResearchPipelineContextSummary,
  locale: string,
) {
  const copy = getNotebookCopy(locale)
  const clauseSeparator = getClauseSeparator(locale)

  lines.push(`## ${copy.researchContinuity}`)
  lines.push('')
  lines.push(`- ${copy.updatedAt}: ${pipeline.updatedAt ? toDisplayDate(pipeline.updatedAt, locale) : copy.none}`)
  lines.push(`- ${copy.continuityThreads}: ${pipeline.continuityThreads.length}`)
  lines.push(`- ${copy.globalOpenQuestions}: ${pipeline.globalOpenQuestions.length}`)
  lines.push('')

  if (pipeline.continuityThreads.length > 0) {
    lines.push(`### ${copy.trackedContinuity}`)
    lines.push('')
    renderBullets(lines, pipeline.continuityThreads)
  }

  if (pipeline.globalOpenQuestions.length > 0) {
    lines.push(`### ${copy.pendingAnswers}`)
    lines.push('')
    renderBullets(lines, pipeline.globalOpenQuestions)
  }

  if (pipeline.recentHistory.length > 0) {
    lines.push(`### ${copy.recentResearchRounds}`)
    lines.push('')
    pipeline.recentHistory.forEach((entry) => {
      const stageLabel = formatStageLabel(entry.stageIndex, locale)
      const roundLabel =
        typeof entry.roundIndex === 'number' ? ` / ${copy.round} ${entry.roundIndex}` : ''

      lines.push(`#### ${stageLabel}${roundLabel}`)
      lines.push('')
      lines.push(`- ${copy.time}: ${entry.timestamp ? toDisplayDate(entry.timestamp, locale) : copy.unknown}`)
      lines.push(`- ${copy.discoveredPapers}: ${entry.discovered}`)
      lines.push(`- ${copy.admittedPapers}: ${entry.admitted}`)
      lines.push(`- ${copy.rebuiltContent}: ${entry.contentsGenerated}`)
      lines.push(`- ${copy.advanceNextStage}: ${entry.shouldAdvanceStage ? copy.yes : copy.no}`)
      lines.push('')

      if (entry.stageSummary) {
        lines.push(entry.stageSummary)
        lines.push('')
      }

      if (entry.nodeActions.length > 0) {
        lines.push(`${copy.actionLog}:`)
        entry.nodeActions.forEach((action) => {
          const actionTitle = cleanText(action.title) || action.action
          const rationale = cleanText(action.rationale)
          lines.push(`- ${action.action}: ${actionTitle}${rationale ? `${clauseSeparator}${rationale}` : ''}`)
        })
        lines.push('')
      }

      if (entry.openQuestions.length > 0) {
        lines.push(`${copy.unresolvedQuestions}:`)
        renderBullets(lines, entry.openQuestions)
      }
    })
  }
}

function appendResearchWorldSummary(
  lines: string[],
  world: TopicResearchWorld | null | undefined,
  locale: string,
) {
  if (!world) return
  const copy = getNotebookCopy(locale)

  lines.push(`## ${copy.researchWorld}`)
  lines.push('')
  lines.push(`- ${copy.updatedAt}: ${toDisplayDate(world.updatedAt, locale)}`)
  lines.push(`- ${copy.maturity}: ${world.summary.maturity}`)
  lines.push(`- ${copy.stagesNodesPapers}: ${world.stages.length} / ${world.nodes.length} / ${world.papers.length}`)
  lines.push('')

  renderParagraphs(lines, [
    world.summary.thesis,
    world.summary.currentFocus,
    world.summary.continuity,
  ])

  if (world.claims.length > 0) {
    lines.push(`### ${copy.establishedClaims}`)
    lines.push('')
    renderBullets(
      lines,
      world.claims
        .slice(0, 6)
        .map((claim) => `${claim.statement} [${claim.confidence} / ${claim.status}]`),
    )
  }

  if (world.questions.length > 0) {
    lines.push(`### ${copy.openQuestions}`)
    lines.push('')
    renderBullets(
      lines,
      world.questions
        .slice(0, 6)
        .map((question) => `${question.question} [${question.priority}]`),
    )
  }

  if (world.agenda.length > 0) {
    lines.push(`### ${copy.activeAgenda}`)
    lines.push('')
    world.agenda.slice(0, 6).forEach((item) => {
      lines.push(`- ${item.title}: ${item.rationale}`)
    })
    lines.push('')
  }

  if (world.critiques.length > 0) {
    lines.push(`### ${copy.critiquesAndDoubts}`)
    lines.push('')
    renderBullets(
      lines,
      world.critiques
        .slice(0, 5)
        .map((critique) => `${critique.summary} [${critique.severity}]`),
    )
  }
}

function appendGuidanceSummary(
  lines: string[],
  guidance: TopicGuidanceLedgerState | null | undefined,
  locale: string,
) {
  if (!guidance) return
  const copy = getNotebookCopy(locale)

  lines.push(`## ${copy.guidanceLedger}`)
  lines.push('')
  lines.push(`- ${copy.updatedAt}: ${guidance.updatedAt ? toDisplayDate(guidance.updatedAt, locale) : 'N/A'}`)
  lines.push(`- ${copy.activeAcceptedDeferred}: ${guidance.summary.activeDirectiveCount} / ${guidance.summary.acceptedDirectiveCount} / ${guidance.summary.deferredDirectiveCount}`)
  lines.push('')

  renderParagraphs(lines, [
    guidance.summary.latestDirective,
    guidance.summary.focusHeadline,
    guidance.summary.styleHeadline,
    guidance.summary.challengeHeadline,
  ])

  if (guidance.directives.length > 0) {
    lines.push(`### ${copy.activeDirectives}`)
    lines.push('')
    guidance.directives
      .filter((directive) =>
        directive.status === 'accepted' ||
        directive.status === 'partial' ||
        directive.status === 'deferred',
      )
      .slice(0, 8)
      .forEach((directive) => {
        lines.push(`- [${directive.directiveType} / ${directive.status}] ${directive.scopeLabel}: ${directive.instruction}`)
        if (directive.effectSummary) {
          lines.push(`  ${copy.effect}: ${directive.effectSummary}`)
        }
        if (directive.promptHint) {
          lines.push(`  ${copy.followUp}: ${directive.promptHint}`)
        }
      })
    lines.push('')
  }
}

function appendNodeDossier(lines: string[], node: NodeViewModel, locale: string) {
  const copy = getNotebookCopy(locale)

  lines.push(`## ${copy.node}: ${node.title}`)
  lines.push('')
  lines.push(`- ${copy.stage}: ${node.stageIndex}`)
  lines.push(`- ${copy.paperCount}: ${node.stats.paperCount}`)
  lines.push(`- ${copy.figuresTablesFormulas}: ${node.stats.figureCount} / ${node.stats.tableCount} / ${node.stats.formulaCount}`)
  lines.push(`- ${copy.updatedAt}: ${toDisplayDate(node.updatedAt, locale)}`)
  lines.push('')

  if (node.headline) {
    lines.push(`> ${node.headline}`)
    lines.push('')
  }

  renderParagraphs(lines, [node.standfirst, node.summary, node.explanation])

  if (node.paperRoles.length > 0) {
    lines.push(`### ${copy.nodePaperRoles}`)
    lines.push('')
    node.paperRoles.forEach((paper) => {
      lines.push(`#### ${paper.title}`)
      lines.push('')
      lines.push(`- ${copy.role}: ${paper.role}`)
      lines.push(`- ${copy.contribution}: ${paper.contribution}`)
      lines.push(`- ${copy.time}: ${paper.publishedAt || copy.unknown}`)
      lines.push('')
      renderParagraphs(lines, [paper.summary])
    })
  }

  if (node.comparisonBlocks.length > 0) {
    lines.push(`### ${copy.keyComparisons}`)
    lines.push('')
    node.comparisonBlocks.forEach((block) => {
      lines.push(`#### ${block.title}`)
      lines.push('')
      renderParagraphs(lines, [block.summary])
      block.points.forEach((point) => {
        lines.push(`- ${point.label}: ${point.detail}`)
      })
      lines.push('')
    })
  }

  if (node.article.sections.length > 0) {
    lines.push(`### ${copy.nodeBody}`)
    lines.push('')
    node.article.sections.forEach((section) => {
      lines.push(`#### ${section.title}`)
      lines.push('')
      renderParagraphs(lines, section.body)
    })
  }

  lines.push(`### ${copy.critiqueSection}`)
  lines.push('')
  renderParagraphs(lines, [node.critique.summary])
  renderBullets(lines, node.critique.bullets)

  const evidenceHighlights = pickEvidenceHighlights(node.evidence)
  if (evidenceHighlights.length > 0) {
    lines.push(`### ${copy.keyEvidence}`)
    lines.push('')
    evidenceHighlights.forEach((item) => {
      lines.push(`- [${item.type}] ${item.label}: ${item.whyItMatters || item.quote}`)
    })
    lines.push('')
  }

  if (node.article.closing.length > 0) {
    lines.push(`### ${copy.nodeClosing}`)
    lines.push('')
    renderParagraphs(lines, node.article.closing)
  }
}

function appendPaperDossier(lines: string[], paper: PaperViewModel, locale: string) {
  const copy = getNotebookCopy(locale)

  lines.push(`## ${copy.paper}: ${paper.title}`)
  lines.push('')
  lines.push(`- ${copy.time}: ${paper.publishedAt || copy.unknown}`)
  lines.push(`- ${copy.authors}: ${paper.authors.length > 0 ? paper.authors.join(', ') : copy.unknown}`)
  lines.push(
    `- ${copy.linkedNodes}: ${paper.relatedNodes.length > 0 ? paper.relatedNodes.map((node) => node.title).join(' / ') : copy.none}`,
  )
  lines.push(
    `- ${copy.figuresTablesFormulasSections}: ${paper.stats.figureCount} / ${paper.stats.tableCount} / ${paper.stats.formulaCount} / ${paper.stats.sectionCount}`,
  )
  lines.push('')

  renderParagraphs(lines, [paper.standfirst, paper.summary, paper.explanation])

  if (paper.article.sections.length > 0) {
    lines.push(`### ${copy.paperBody}`)
    lines.push('')
    paper.article.sections.forEach((section) => {
      lines.push(`#### ${section.title}`)
      lines.push('')
      renderParagraphs(lines, section.body)
    })
  }

  lines.push(`### ${copy.critiqueSection}`)
  lines.push('')
  renderParagraphs(lines, [paper.critique.summary])
  renderBullets(lines, paper.critique.bullets)

  const evidenceHighlights = pickEvidenceHighlights(paper.evidence)
  if (evidenceHighlights.length > 0) {
    lines.push(`### ${copy.keyEvidence}`)
    lines.push('')
    evidenceHighlights.forEach((item) => {
      lines.push(`- [${item.type}] ${item.label}: ${item.whyItMatters || item.quote}`)
    })
    lines.push('')
  }

  if (paper.article.closing.length > 0) {
    lines.push(`### ${copy.paperClosing}`)
    lines.push('')
    renderParagraphs(lines, paper.article.closing)
  }
}

export function normalizeFavoriteExcerpt(value: unknown): FavoriteExcerpt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const id = cleanText(record.id)
  const excerptTitle = cleanText(record.excerptTitle)
  const legacyTitle = cleanText(record.paperTitleZh)
  const paragraphs = normalizeParagraphs(record.paragraphs)

  if (!id || (!excerptTitle && !legacyTitle) || paragraphs.length === 0) {
    return null
  }

  const rawKind = cleanText(record.kind)
  const topicId = cleanText(record.topicId) || undefined
  const paperId = cleanText(record.paperId)
  const nodeId = cleanText(record.nodeId) || undefined
  const anchorId = cleanText(record.anchorId) || undefined
  const route = cleanText(record.route)
  const fallbackNodeRoute = nodeId
    ? `/node/${nodeId}${
        anchorId
          ? `?anchor=${encodeURIComponent(anchorId)}`
          : paperId
            ? `?anchor=${encodeURIComponent(`paper:${paperId}`)}`
            : ''
      }`
    : undefined
  const normalizedRoute =
    route && !(route.startsWith('/paper/') && fallbackNodeRoute)
      ? route
      : fallbackNodeRoute || route || (topicId ? `/topic/${topicId}` : paperId ? `/paper/${paperId}` : undefined)

  return {
    id,
    kind: isNotebookKind(rawKind) ? rawKind : 'excerpt',
    topicId,
    topicTitle: cleanText(record.topicTitle) || undefined,
    paperId: paperId || undefined,
    paperTitleZh: legacyTitle || undefined,
    nodeId,
    nodeTitle: cleanText(record.nodeTitle) || undefined,
    excerptTitle: excerptTitle || legacyTitle,
    paragraphs,
    savedAt: cleanText(record.savedAt) || new Date().toISOString(),
    route: normalizedRoute,
    anchorId,
    sourceLabel: cleanText(record.sourceLabel) || undefined,
    summary: cleanText(record.summary) || undefined,
    tags: normalizeTags(record.tags),
  }
}

export function getResearchNoteKindLabel(
  kind: FavoriteExcerpt['kind'],
  locale = 'zh-CN',
) {
  const language = normalizeNotebookLanguage(locale)
  return CLEAN_NOTE_KIND_LABELS[language]?.[kind ?? 'excerpt'] ?? NOTE_KIND_LABELS.en[kind ?? 'excerpt']
}

export function buildResearchNotePreview(note: FavoriteExcerpt, maxParagraphs = 2) {
  return note.paragraphs.slice(0, maxParagraphs)
}

export function formatResearchNoteDate(value: string, locale = 'zh-CN') {
  return toDisplayDate(value, locale)
}

export function slugifyNotebookFilename(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'research-notebook'
  return trimmed.replace(/[\\/:*?"<>|]+/gu, '-')
}

export function downloadNotebookTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
) {
  if (typeof window === 'undefined') return

  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

export function buildNotebookMarkdown(
  notes: FavoriteExcerpt[],
  topicLookup: TopicLookup = {},
  options?: {
    title?: string
    locale?: string
  },
) {
  const locale = options?.locale ?? 'zh-CN'
  const copy = getNotebookCopy(locale)
  const title = options?.title ?? copy.notebookExportTitle
  const lines: string[] = [
    `# ${title}`,
    '',
    `- ${copy.exportedAt}: ${new Date().toLocaleString(locale)}`,
    `- ${copy.entryCount}: ${notes.length}`,
    '',
  ]

  const grouped = notes.reduce<Record<string, FavoriteExcerpt[]>>((accumulator, note) => {
    const key = note.topicId ?? 'general'
    accumulator[key] = [...(accumulator[key] ?? []), note]
    return accumulator
  }, {})

  Object.entries(grouped).forEach(([topicId, entries]) => {
    const heading =
      topicId === 'general'
        ? copy.generalTopic
        : entries[0]?.topicTitle || topicLookup[topicId] || topicId

    lines.push(`## ${heading}`)
    lines.push('')

    entries.forEach((note) => {
      lines.push(`### [${getResearchNoteKindLabel(note.kind, locale)}] ${note.excerptTitle}`)
      lines.push(`- ${copy.savedAt}: ${formatResearchNoteDate(note.savedAt, locale)}`)

      if (note.sourceLabel) {
        lines.push(`- ${copy.source}: ${note.sourceLabel}`)
      }

      if (note.paperTitleZh && note.paperTitleZh !== note.excerptTitle) {
        lines.push(`- ${copy.relatedPaper}: ${note.paperTitleZh}`)
      }

      if (note.summary) {
        lines.push(`- ${copy.summary}: ${note.summary}`)
      }

      if (note.route) {
        lines.push(`- ${copy.path}: ${note.route}`)
      }

      if ((note.tags ?? []).length > 0) {
        lines.push(`- ${copy.tags}: ${(note.tags ?? []).join(' / ')}`)
      }

      lines.push('')
      renderParagraphs(lines, note.paragraphs)
    })
  })

  return lines.join('\n').trim()
}

export function buildNotebookJson(notes: FavoriteExcerpt[]) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: notes.length,
      notes,
    },
    null,
    2,
  )
}

export function buildResearchDossierJson(
  bundle: TopicResearchExportBundle,
  notes: FavoriteExcerpt[],
) {
  return JSON.stringify(
    {
      schemaVersion: DOSSIER_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      noteCount: notes.length,
      bundle,
      notes: dedupeNotes(notes),
    },
    null,
    2,
  )
}

export function buildResearchDossierMarkdown(
  bundle: TopicResearchExportBundle,
  notes: FavoriteExcerpt[],
  options?: DossierOptions,
) {
  const locale = options?.locale ?? 'zh-CN'
  const copy = getNotebookCopy(locale)
  const clauseSeparator = getClauseSeparator(locale)
  const title = options?.title ?? `${bundle.topic.title} ${copy.researchDossierTitle}`
  const stageMap = new Map(bundle.stageDossiers.map((stage) => [stage.stageIndex, stage] as const))
  const topicNotes = dedupeNotes(notes).filter((note) => note.topicId === bundle.topic.topicId)
  const nodeDossiers = [...bundle.nodeDossiers].sort((left, right) => left.stageIndex - right.stageIndex)
  const paperDossiers = [...bundle.paperDossiers].sort(
    (left, right) => Date.parse(right.publishedAt || '') - Date.parse(left.publishedAt || ''),
  )
  const lines: string[] = [
    `# ${title}`,
    '',
    `- ${copy.exportedAt}: ${new Date().toLocaleString(locale)}`,
    `- ${copy.topic}: ${bundle.topic.title}`,
    `- ${copy.language}: ${bundle.topic.language || 'unknown'}`,
    `- ${copy.stagesNodesPapers}: ${bundle.topic.stats.stageCount} / ${bundle.topic.stats.nodeCount} / ${bundle.topic.stats.paperCount}`,
    `- ${copy.noteEntries}: ${topicNotes.length}`,
    '',
  ]

  lines.push(`## ${copy.topicOverview}`)
  lines.push('')
  renderParagraphs(lines, [
    bundle.topic.hero.standfirst,
    bundle.topic.hero.strapline,
    bundle.topic.summaryPanel?.thesis,
    bundle.topic.summary,
    bundle.topic.description,
    bundle.topic.narrativeArticle,
  ])

  if (bundle.topic.closingEditorial?.paragraphs.length > 0) {
    lines.push(`### ${copy.closingAndJudgment}`)
    lines.push('')
    renderParagraphs(lines, [
      bundle.topic.closingEditorial.title,
      ...bundle.topic.closingEditorial.paragraphs,
      bundle.topic.closingEditorial.reviewerNote,
    ])
  }

  if (bundle.report) {
    lines.push(`## ${copy.currentResearchRound}`)
    lines.push('')
    lines.push(`- ${copy.status}: ${bundle.report.status}`)
    lines.push(`- ${copy.mode}: ${bundle.report.researchMode}`)
    lines.push(`- ${copy.startedAt}: ${toDisplayDate(bundle.report.startedAt, locale)}`)
    lines.push(`- ${copy.latestUpdatedAt}: ${toDisplayDate(bundle.report.updatedAt, locale)}`)
    lines.push(
      `- ${copy.discoveredAdmittedGenerated}: ${bundle.report.discoveredPapers} / ${bundle.report.admittedPapers} / ${bundle.report.generatedContents}`,
    )
    lines.push('')
    renderParagraphs(lines, [
      bundle.report.headline,
      bundle.report.dek,
      bundle.report.summary,
      ...bundle.report.paragraphs,
    ])

    if (bundle.report.keyMoves.length > 0) {
      lines.push(`### ${copy.keyMovesThisRound}`)
      lines.push('')
      renderBullets(lines, bundle.report.keyMoves)
    }

    if (bundle.report.latestNodeActions.length > 0) {
      lines.push(`### ${copy.nodeAdjustments}`)
      lines.push('')
      bundle.report.latestNodeActions.forEach((action) => {
        lines.push(
          `- ${action.action} / ${formatStageLabel(action.stageIndex, locale)}: ${action.title}${action.rationale ? `${clauseSeparator}${action.rationale}` : ''}`,
        )
      })
      lines.push('')
    }

    if (bundle.report.openQuestions.length > 0) {
      lines.push(`### ${copy.currentOpenQuestions}`)
      lines.push('')
      renderBullets(lines, bundle.report.openQuestions)
    }
  }

  lines.push(`## ${copy.stageMap}`)
  lines.push('')
  appendResearchWorldSummary(lines, bundle.world, locale)
  appendGuidanceSummary(lines, bundle.guidance, locale)

  bundle.stageDossiers.forEach((stage) => {
    lines.push(`### ${formatStageLabel(stage.stageIndex, locale)} · ${stage.title}`)
    lines.push('')
    lines.push(`- ${copy.branch}: ${stage.branchLabel}`)
    lines.push(`- ${copy.nodeCount}: ${stage.nodeCount}`)
    lines.push(`- ${copy.paperCount}: ${stage.paperCount}`)
    if (stage.dateLabel || stage.yearLabel) {
      lines.push(`- ${copy.time}: ${stage.dateLabel || stage.yearLabel}`)
    }
    lines.push('')
    renderParagraphs(lines, [
      stage.stageThesis,
      stage.editorial.kicker,
      stage.editorial.summary,
      stage.editorial.transition,
      stage.description,
    ])

    if (stage.pipeline.subjectFocus.relatedNodeActions.length > 0) {
      lines.push(`${copy.stageCorrections}:`)
      renderBullets(lines, stage.pipeline.subjectFocus.relatedNodeActions)
    }

    if (stage.pipeline.globalOpenQuestions.length > 0) {
      lines.push(`${copy.stageQuestions}:`)
      renderBullets(lines, stage.pipeline.globalOpenQuestions)
    }
  })

  if (nodeDossiers.length > 0) {
    lines.push(`## ${copy.nodeDossiers}`)
    lines.push('')
    nodeDossiers.forEach((node) => {
      const stage = stageMap.get(node.stageIndex)
      if (stage) {
        lines.push(`### ${copy.stageAffiliation}: ${formatStageLabel(node.stageIndex, locale)} · ${stage.title}`)
        lines.push('')
      }
      appendNodeDossier(lines, node, locale)
    })
  }

  if (paperDossiers.length > 0) {
    lines.push(`## ${copy.paperDossiers}`)
    lines.push('')
    paperDossiers.forEach((paper) => appendPaperDossier(lines, paper, locale))
  }

  appendPipelineSummary(lines, bundle.pipeline.overview, locale)

  if (topicNotes.length > 0) {
    lines.push(`## ${copy.notebookAppendix}`)
    lines.push('')
    topicNotes.forEach((note) => {
      lines.push(`### [${getResearchNoteKindLabel(note.kind, locale)}] ${note.excerptTitle}`)
      lines.push('')
      lines.push(`- ${copy.savedAt}: ${toDisplayDate(note.savedAt, locale)}`)
      if (note.sourceLabel) {
        lines.push(`- ${copy.source}: ${note.sourceLabel}`)
      }
      if (note.summary) {
        lines.push(`- ${copy.summary}: ${note.summary}`)
      }
      if ((note.tags ?? []).length > 0) {
        lines.push(`- ${copy.tags}: ${(note.tags ?? []).join(' / ')}`)
      }
      lines.push('')
      renderParagraphs(lines, note.paragraphs)
    })
  }

  return lines.join('\n').trim()
}

export function buildResearchHighlightsMarkdown(
  notes: FavoriteExcerpt[],
  topicLookup: TopicLookup = {},
  options?: {
    title?: string
    locale?: string
    maxPerTopic?: number
  },
) {
  const locale = options?.locale ?? 'zh-CN'
  const copy = getNotebookCopy(locale)
  const title = options?.title ?? copy.researchHighlightsTitle
  const maxPerTopic = Math.max(3, Math.min(12, options?.maxPerTopic ?? 6))
  const normalizedNotes = dedupeNotes(notes)
  const groups = buildTopicNoteGroups(normalizedNotes, topicLookup, locale)
  const lines: string[] = [
    `# ${title}`,
    '',
    `- ${copy.exportedAt}: ${new Date().toLocaleString(locale)}`,
    `- ${copy.coveredTopics}: ${groups.length}`,
    `- ${copy.candidateNotes}: ${normalizedNotes.length}`,
    '',
  ]

  groups.forEach((group) => {
    const topicKinds = new Set(group.notes.map((note) => note.kind ?? 'excerpt'))
    lines.push(`## ${group.topicName}`)
    lines.push('')
    lines.push(`- ${copy.highlightEntries}: ${Math.min(group.notes.length, maxPerTopic)}`)
    lines.push(`- ${copy.noteKinds}: ${topicKinds.size}`)
    lines.push('')

    group.notes.slice(0, maxPerTopic).forEach((note) => {
      lines.push(`### [${getResearchNoteKindLabel(note.kind, locale)}] ${note.excerptTitle}`)
      lines.push('')
      lines.push(`- ${copy.savedAt}: ${toDisplayDate(note.savedAt, locale)}`)
      if (note.sourceLabel) {
        lines.push(`- ${copy.source}: ${note.sourceLabel}`)
      }
      if (note.summary) {
        lines.push(`- ${copy.summary}: ${note.summary}`)
      }
      if ((note.tags ?? []).length > 0) {
        lines.push(`- ${copy.tags}: ${(note.tags ?? []).join(' / ')}`)
      }
      lines.push('')
      renderParagraphs(lines, note.paragraphs.slice(0, 3))
    })
  })

  return lines.join('\n').trim()
}

export function buildBatchResearchDossierJson(
  batch: TopicResearchExportBatch,
  notes: FavoriteExcerpt[],
) {
  return JSON.stringify(
    {
      schemaVersion: BATCH_DOSSIER_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      noteCount: notes.length,
      batch,
      notes: dedupeNotes(notes),
    },
    null,
    2,
  )
}

export function buildBatchResearchDossierMarkdown(
  batch: TopicResearchExportBatch,
  notes: FavoriteExcerpt[],
  options?: DossierOptions,
) {
  const locale = options?.locale ?? 'zh-CN'
  const copy = getNotebookCopy(locale)
  const title = options?.title ?? copy.multiTopicCollectionTitle
  const topicIds = new Set(batch.bundles.map((bundle) => bundle.topic.topicId))
  const relevantNotes = dedupeNotes(notes).filter((note) => !note.topicId || topicIds.has(note.topicId))
  const lines: string[] = [
    `# ${title}`,
    '',
    `- ${copy.exportedAt}: ${new Date().toLocaleString(locale)}`,
    `- ${copy.topicCount}: ${batch.topicCount}`,
    `- ${copy.totalNodes}: ${batch.bundles.reduce((sum, bundle) => sum + bundle.topic.stats.nodeCount, 0)}`,
    `- ${copy.totalPapers}: ${batch.bundles.reduce((sum, bundle) => sum + bundle.topic.stats.paperCount, 0)}`,
    `- ${copy.noteEntries}: ${relevantNotes.length}`,
    '',
  ]

  if (relevantNotes.length > 0) {
    const topicLookup = Object.fromEntries(
      batch.bundles.map((bundle) => [bundle.topic.topicId, bundle.topic.title] as const),
    )

    lines.push(
      shiftMarkdownHeadings(
        buildResearchHighlightsMarkdown(relevantNotes, topicLookup, {
          title: copy.researchHighlightsTitle,
          locale,
          maxPerTopic: 5,
        }),
      ),
    )
    lines.push('')
  }

  batch.bundles.forEach((bundle) => {
    const dossier = buildResearchDossierMarkdown(bundle, relevantNotes, {
      title: `${bundle.topic.title} ${copy.researchDossierTitle}`,
      locale,
    })
    lines.push(shiftMarkdownHeadings(dossier))
    lines.push('')
  })

  return lines.join('\n').trim()
}
