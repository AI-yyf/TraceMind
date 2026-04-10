import type { TranslationDictionary } from '../types'

const translations: TranslationDictionary = {
  // 引导流程按钮
  'onboarding.skip': {
    zh: '跳过',
    en: 'Skip',
    ja: 'スキップ',
    ko: '건너뛰기',
    de: 'Überspringen',
    fr: 'Passer',
    es: 'Omitir',
    ru: 'Пропустить',
  },
  'onboarding.previous': {
    zh: '上一步',
    en: 'Previous',
    ja: '前へ',
    ko: '이전',
    de: 'Zurück',
    fr: 'Précédent',
    es: 'Anterior',
    ru: 'Назад',
  },
  'onboarding.next': {
    zh: '下一步',
    en: 'Next',
    ja: '次へ',
    ko: '다음',
    de: 'Weiter',
    fr: 'Suivant',
    es: 'Siguiente',
    ru: 'Далее',
  },
  'onboarding.finish': {
    zh: '完成',
    en: 'Finish',
    ja: '完了',
    ko: '완료',
    de: 'Fertig',
    fr: 'Terminer',
    es: 'Finalizar',
    ru: 'Готово',
  },

  // 欢迎步骤
  'onboarding.welcome.title': {
    zh: '欢迎使用溯知 TraceMind',
    en: 'Welcome to TraceMind',
    ja: 'TraceMindへようこそ',
    ko: 'TraceMind에 오신 것을 환영합니다',
    de: 'Willkommen bei TraceMind',
    fr: 'Bienvenue sur TraceMind',
    es: 'Bienvenido a TraceMind',
    ru: 'Добро пожаловать в TraceMind',
  },
  'onboarding.welcome.description': {
    zh: '溯知 TraceMind 是一款 AI 驱动的学术研究追踪系统，帮助您高效发现、筛选和深入分析学术论文。',
    en: 'TraceMind is an AI-powered academic research tracking system that helps you efficiently discover, screen, and deeply analyze academic papers.',
    ja: 'TraceMindは、学術論文を効率的に発見、選別、深く分析するのに役立つAI駆動の学術研究追跡システムです。',
    ko: 'TraceMind는 학술 논문을 효율적으로 발견, 선별 및 심층 분석하는 데 도움이 되는 AI 기반 학술 연구 추적 시스템입니다.',
    de: 'TraceMind ist ein KI-gestütztes System zur Verfolgung akademischer Forschung, das Ihnen hilft, wissenschaftliche Arbeiten effizient zu entdecken, zu filtern und tiefgehend zu analysieren.',
    fr: 'TraceMind est un système de suivi de recherche académique propulsé par l\'IA qui vous aide à découvrir, filtrer et analyser en profondeur les articles académiques.',
    es: 'TraceMind es un sistema de seguimiento de investigación académica impulsado por IA que le ayuda a descubrir, filtrar y analizar en profundidad artículos académicos.',
    ru: 'TraceMind — это система отслеживания академических исследований на основе ИИ, которая помогает эффективно находить, отбирать и глубоко анализировать научные статьи.',
  },

  // 创建主题步骤
  'onboarding.createTopic.title': {
    zh: '创建研究主题',
    en: 'Create Research Topic',
    ja: '研究トピックを作成',
    ko: '연구 주제 생성',
    de: 'Forschungsthema erstellen',
    fr: 'Créer un sujet de recherche',
    es: 'Crear tema de investigación',
    ru: 'Создать тему исследования',
  },
  'onboarding.createTopic.description': {
    zh: '点击「创建主题」按钮开始您的研究之旅，输入主题关键词，AI 将自动为您追踪相关论文。',
    en: 'Click the "Create Topic" button to start your research journey. Enter topic keywords and AI will automatically track relevant papers for you.',
    ja: '「トピックを作成」ボタンをクリックして研究を始めましょう。トピックのキーワードを入力すると、AIが関連論文を自動的に追跡します。',
    ko: '"주제 생성" 버튼을 클릭하여 연구를 시작하세요. 주제 키워드를 입력하면 AI가 관련 논문을 자동으로 추적합니다.',
    de: 'Klicken Sie auf "Thema erstellen", um Ihre Forschungsreise zu beginnen. Geben Sie Themen-Schlüsselwörter ein und die KI verfolgt automatisch relevante Arbeiten für Sie.',
    fr: 'Cliquez sur "Créer un sujet" pour commencer votre recherche. Entrez des mots-clés de sujet et l\'IA suivra automatiquement les articles pertinents pour vous.',
    es: 'Haga clic en "Crear tema" para comenzar su investigación. Ingrese palabras clave del tema y la IA rastreará automáticamente los artículos relevantes para usted.',
    ru: 'Нажмите кнопку "Создать тему", чтобы начать исследование. Введите ключевые слова темы, и ИИ автоматически отследит соответствующие статьи.',
  },

  // 搜索步骤
  'onboarding.search.title': {
    zh: '全局搜索',
    en: 'Global Search',
    ja: 'グローバル検索',
    ko: '전역 검색',
    de: 'Globale Suche',
    fr: 'Recherche globale',
    es: 'Búsqueda global',
    ru: 'Глобальный поиск',
  },
  'onboarding.search.description': {
    zh: '使用全局搜索功能快速查找论文、主题和节点，支持语义搜索和关键词匹配。',
    en: 'Use the global search feature to quickly find papers, topics, and nodes. Supports semantic search and keyword matching.',
    ja: 'グローバル検索機能を使用して、論文、トピック、ノードをすばやく見つけます。セマンティック検索とキーワードマッチングをサポートしています。',
    ko: '전역 검색 기능을 사용하여 논문, 주제 및 노드를 빠르게 찾을 수 있습니다. 시맨틱 검색과 키워드 매칭을 지원합니다.',
    de: 'Verwenden Sie die globale Suchfunktion, um schnell Arbeiten, Themen und Knoten zu finden. Unterstützt semantische Suche und Schlüsselwort-Abgleich.',
    fr: 'Utilisez la recherche globale pour trouver rapidement des articles, sujets et nœuds. Prend en charge la recherche sémantique et la correspondance de mots-clés.',
    es: 'Use la búsqueda global para encontrar rápidamente artículos, temas y nodos. Admite búsqueda semántica y coincidencia de palabras clave.',
    ru: 'Используйте глобальный поиск для быстрого поиска статей, тем и узлов. Поддерживает семантический поиск и сопоставление ключевых слов.',
  },

  // 设置步骤
  'onboarding.settings.title': {
    zh: '个性化设置',
    en: 'Personalization Settings',
    ja: '個人設定',
    ko: '개인 설정',
    de: 'Personalisierungseinstellungen',
    fr: 'Paramètres de personnalisation',
    es: 'Configuración de personalización',
    ru: 'Настройки персонализации',
  },
  'onboarding.settings.description': {
    zh: '在设置面板中配置语言、主题、AI 模型等选项，打造专属的研究环境。',
    en: 'Configure language, theme, AI model, and other options in the settings panel to create your personalized research environment.',
    ja: '設定パネルで言語、テーマ、AIモデルなどのオプションを設定し、専用の研究環境を作成しましょう。',
    ko: '설정 패널에서 언어, 테마, AI 모델 등의 옵션을 구성하여 개인화된 연구 환경을 만드세요.',
    de: 'Konfigurieren Sie Sprache, Design, KI-Modell und andere Optionen im Einstellungsbereich, um Ihre personalisierte Forschungsumgebung zu erstellen.',
    fr: 'Configurez la langue, le thème, le modèle IA et d\'autres options dans le panneau de paramètres pour créer votre environnement de recherche personnalisé.',
    es: 'Configure el idioma, tema, modelo de IA y otras opciones en el panel de configuración para crear su entorno de investigación personalizado.',
    ru: 'Настройте язык, тему, модель ИИ и другие параметры в панели настроек, чтобы создать персонализированную среду исследования.',
  },

  // 完成步骤
  'onboarding.complete.title': {
    zh: '准备就绪！',
    en: 'All Set!',
    ja: '準備完了！',
    ko: '준비 완료!',
    de: 'Alles bereit!',
    fr: 'Tout est prêt !',
    es: '¡Todo listo!',
    ru: 'Всё готово!',
  },
  'onboarding.complete.description': {
    zh: '您已了解 TraceMind 的基本功能，现在开始探索学术研究的新方式吧！',
    en: 'You\'ve learned the basics of TraceMind. Now start exploring a new way of academic research!',
    ja: 'TraceMindの基本機能を理解しました。今すぐ学術研究の新しい方法を探索しましょう！',
    ko: 'TraceMind의 기본 기능을 익혔습니다. 이제 학술 연구의 새로운 방법을 탐색해 보세요!',
    de: 'Sie haben die Grundlagen von TraceMind kennengelernt. Beginnen Sie jetzt, neue Wege der akademischen Forschung zu erkunden!',
    fr: 'Vous avez appris les bases de TraceMind. Commencez maintenant à explorer une nouvelle façon de faire de la recherche académique !',
    es: 'Ha aprendido los conceptos básicos de TraceMind. ¡Ahora comience a explorar una nueva forma de investigación académica!',
    ru: 'Вы изучили основы TraceMind. Теперь начните исследовать новый способ академических исследований!',
  },
}

export default translations