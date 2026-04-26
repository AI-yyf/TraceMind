"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeepNodeArticle = generateDeepNodeArticle;
exports.generateNodeEnhancedArticle = generateNodeEnhancedArticle;
const logger_1 = require("../../utils/logger");
const gateway_1 = require("../omni/gateway");
const paper_links_1 = require("../paper-links");
const display_text_1 = require("./display-text");
const synthetic_formulas_1 = require("./synthetic-formulas");
const editorial_prompt_1 = require("../../../shared/editorial-prompt");
const TABLE_OCR_NOISE_RE = /(?:table of contents|list of figures|list of tables|acknowledg(?:e)?ments?|chapter\s+\d+|appendix|ieee xplore|personal use is permitted|copyright)/iu;
const TABLE_DOT_LEADER_RE = /\.{2,}/u;
function sanitizeDeepFormulaLatex(value) {
    return (value ?? '')
        .replace(/\r\n/gu, '\n')
        .replaceAll('\0', ' ')
        .replace(/\uFFFD/gu, ' ')
        .replace(/^\$+|\$+$/gu, '')
        .replace(/\s+/gu, ' ')
        .trim();
}
function looksLikeDeepFormulaNoise(value) {
    const latex = sanitizeDeepFormulaLatex(value);
    if (!latex || latex.length < 5)
        return true;
    if (/^[^A-Za-z\\\d]+$/u.test(latex))
        return true;
    const hasStructure = /[=+\-/*<>]/u.test(latex) ||
        /\\(?:frac|sum|prod|min|max|arg|max|min|log|exp|mathbb|mathbf|mathcal|cdot|left|right)/u.test(latex);
    const alphaCount = latex.match(/[A-Za-z]/gu)?.length ?? 0;
    if (!hasStructure && alphaCount < 2)
        return true;
    if ((latex.match(/[?]/gu)?.length ?? 0) >= 2)
        return true;
    return false;
}
function looksLikeNoisyTableEvidence(caption, rawText) {
    const text = cleanText([caption, rawText].filter(Boolean).join(' '));
    if (!text)
        return true;
    if (TABLE_OCR_NOISE_RE.test(text))
        return true;
    if (TABLE_DOT_LEADER_RE.test(text))
        return true;
    if ((text.match(/\b(?:examples?|figure|fig\.?|table|chapter|appendix)\b/giu)?.length ?? 0) >= 3 &&
        (text.match(/\b\d+\.\d+\b/gu)?.length ?? 0) >= 3) {
        return true;
    }
    return false;
}
function isHighSignalSourceEvidence(evidence) {
    const content = cleanText([evidence.quote, evidence.content, evidence.explanation, evidence.whyItMatters].join(' '));
    if (!content && evidence.type !== 'formula')
        return false;
    if (evidence.type === 'table') {
        return !looksLikeNoisyTableEvidence(evidence.title, evidence.content);
    }
    if (evidence.type === 'formula') {
        return !looksLikeDeepFormulaNoise(evidence.formulaLatex ?? evidence.content);
    }
    return true;
}
const SUBSECTION_ORDER = [
    'background',
    'problem',
    'method',
    'experiment',
    'results',
    'contribution',
    'limitation',
    'significance',
];
const SUBSECTION_TITLES = {
    background: { zh: '研究背景', en: 'Research Background' },
    problem: { zh: '问题界定', en: 'Problem Definition' },
    method: { zh: '方法解析', en: 'Methodology' },
    experiment: { zh: '实验设计', en: 'Experimental Design' },
    results: { zh: '结果分析', en: 'Results Analysis' },
    contribution: { zh: '核心贡献', en: 'Key Contributions' },
    limitation: { zh: '局限与边界', en: 'Limitations' },
    significance: { zh: '研究意义', en: 'Significance' },
};
const ROLE_LABELS = {
    origin: { zh: '源头论文', en: 'Origin paper' },
    milestone: { zh: '里程碑论文', en: 'Milestone paper' },
    branch: { zh: '分支论文', en: 'Branch paper' },
    confluence: { zh: '汇流论文', en: 'Confluence paper' },
    extension: { zh: '延展论文', en: 'Extension paper' },
    baseline: { zh: '基线论文', en: 'Baseline paper' },
};
const SECTION_KIND_PATTERNS = {
    background: [/background/iu, /introduction/iu, /motivation/iu, /related work/iu],
    problem: [/problem/iu, /task/iu, /objective/iu, /setting/iu, /challenge/iu],
    method: [/method/iu, /approach/iu, /model/iu, /architecture/iu, /algorithm/iu, /framework/iu],
    experiment: [/experiment/iu, /setup/iu, /implementation/iu, /dataset/iu, /evaluation/iu],
    results: [/result/iu, /analysis/iu, /ablation/iu, /discussion/iu, /performance/iu],
    contribution: [/contribution/iu, /finding/iu, /novelty/iu, /summary/iu],
    limitation: [/limitation/iu, /future work/iu, /weakness/iu, /error analysis/iu],
    significance: [/significance/iu, /implication/iu, /impact/iu, /conclusion/iu],
};
const TRANSITION_TYPES = [
    'method-evolution',
    'problem-shift',
    'scale-up',
    'scope-broaden',
    'complementary',
];
const PLACEHOLDER_ONLY_RE = /^[?._/:|()[\]{}<>\-\s]+$/u;
function normalizeLanguageCode(language) {
    const normalized = language?.toLowerCase()?.trim() ?? '';
    // Chinese variants
    if (normalized.startsWith('zh') || normalized === 'cn' || normalized === 'chinese')
        return 'zh';
    // English variants
    if (normalized.startsWith('en') || normalized === 'english')
        return 'en';
    // Japanese variants
    if (normalized.startsWith('ja') || normalized === 'jp' || normalized.startsWith('japanese'))
        return 'ja';
    // Korean variants
    if (normalized.startsWith('ko') || normalized === 'kor' || normalized.startsWith('korean'))
        return 'ko';
    // German variants
    if (normalized.startsWith('de') || normalized === 'ger' || normalized.startsWith('german'))
        return 'de';
    // French variants
    if (normalized.startsWith('fr') || normalized === 'fra' || normalized.startsWith('french'))
        return 'fr';
    // Spanish variants
    if (normalized.startsWith('es') || normalized === 'spa' || normalized.startsWith('spanish'))
        return 'es';
    // Russian variants
    if (normalized.startsWith('ru') || normalized === 'rus' || normalized.startsWith('russian'))
        return 'ru';
    // Default to Chinese
    return 'zh';
}
const ENHANCED_ARTICLE_MODEL_TIMEOUT_MS = (() => {
    const configured = Number.parseInt(process.env.ENHANCED_ARTICLE_MODEL_TIMEOUT_MS ?? '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 15000;
})();
const ENHANCED_ARTICLE_GENERATION_MODE = (() => {
    const configured = (process.env.ENHANCED_ARTICLE_GENERATION_MODE ?? '').trim().toLowerCase();
    return configured === 'model-assisted' ? 'model-assisted' : 'grounded-fast';
})();
const ENHANCED_ARTICLE_MODEL_CACHE_TTL_MS = (() => {
    const configured = Number.parseInt(process.env.ENHANCED_ARTICLE_MODEL_CACHE_TTL_MS ?? '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 60000;
})();
const ENHANCED_ARTICLE_MODEL_NEGATIVE_CACHE_TTL_MS = (() => {
    const configured = Number.parseInt(process.env.ENHANCED_ARTICLE_MODEL_NEGATIVE_CACHE_TTL_MS ?? '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 300000;
})();
const enhancedArticleModelAvailabilityCache = new Map();
function isZh(language) {
    return language.toLowerCase().startsWith('zh');
}
function shouldUseEnhancedArticleModelAssistance() {
    return ENHANCED_ARTICLE_GENERATION_MODE === 'model-assisted';
}
function normalizeBlockText(value) {
    return (value ?? '')
        .replace(/\r\n/gu, '\n')
        .replaceAll('\0', ' ')
        .replace(/\uFFFD/gu, ' ')
        .trim();
}
function cleanText(value) {
    return normalizeBlockText(value).replace(/\s+/gu, ' ').trim();
}
function clipText(value, maxLength) {
    const text = cleanText(value);
    if (!text)
        return '';
    if (text.length <= maxLength)
        return text;
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}
function stringifyTableCell(value) {
    if (typeof value === 'string')
        return cleanText(value);
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (Array.isArray(value)) {
        return cleanText(value.map((entry) => stringifyTableCell(entry)).filter(Boolean).join(' '));
    }
    if (value && typeof value === 'object') {
        return cleanText(Object.values(value)
            .map((entry) => stringifyTableCell(entry))
            .filter(Boolean)
            .join(' '));
    }
    return '';
}
function summarizeTableRows(rows, limit = 2) {
    if (typeof rows === 'string')
        return cleanText(rows);
    if (!Array.isArray(rows) || rows.length === 0)
        return '';
    return cleanText(rows
        .slice(0, limit)
        .map((row) => stringifyTableCell(row))
        .filter(Boolean)
        .join(' '));
}
function uniqueStrings(values, limit = 8, maxLength = 220) {
    const seen = new Set();
    const output = [];
    for (const value of values) {
        const normalized = clipText(value, maxLength);
        if (!normalized)
            continue;
        const key = normalized.toLocaleLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        output.push(normalized);
        if (output.length >= limit)
            break;
    }
    return output;
}
function uniqueNonEmpty(values, limit = Infinity) {
    const seen = new Set();
    const output = [];
    for (const value of values) {
        const normalized = cleanText(value);
        if (!normalized)
            continue;
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        output.push(normalized);
        if (output.length >= limit)
            break;
    }
    return output;
}
function hasNarrativeText(value) {
    const text = cleanText(value);
    if (!text)
        return false;
    if (PLACEHOLDER_ONLY_RE.test(text))
        return false;
    return true;
}
function pickNarrativeText(...candidates) {
    for (const candidate of candidates) {
        if (hasNarrativeText(candidate)) {
            return cleanText(candidate);
        }
    }
    return '';
}
function parseAuthors(value) {
    if (!value)
        return [];
    if (Array.isArray(value)) {
        return value
            .map((item) => {
            if (typeof item === 'string')
                return item.trim();
            if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') {
                return item.name.trim();
            }
            return '';
        })
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        try {
            return parseAuthors(JSON.parse(value));
        }
        catch {
            return value
                .split(/[;,\uFF0C\u3001]/u)
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }
    return [];
}
function paperDisplayTitle(paper) {
    return (0, display_text_1.pickMeaningfulDisplayText)(paper.titleZh, paper.titleEn, paper.title) || 'Untitled paper';
}
function paperDisplayTitleEn(paper) {
    return (0, display_text_1.pickMeaningfulDisplayText)(paper.titleEn, paper.title, paper.titleZh) || paperDisplayTitle(paper);
}
function nodeDisplayTitle(node) {
    return cleanText(node.title) || 'Research node';
}
function publishedTimestamp(paper) {
    const raw = paper.publishedAt ?? paper.published;
    if (!raw)
        return Number.MAX_SAFE_INTEGER;
    const timestamp = new Date(raw).getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}
function formatDate(value) {
    if (!value)
        return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return '';
    return date.toISOString();
}
function countWords(text, language) {
    const normalized = cleanText(text);
    if (!normalized)
        return 0;
    return isZh(language)
        ? normalized.replace(/\s+/gu, '').length
        : normalized.split(/\s+/u).filter(Boolean).length;
}
function readingMinutes(wordCount) {
    return Math.max(1, Math.ceil(wordCount / 260));
}
function localizedTitle(kind, language) {
    return isZh(language) ? SUBSECTION_TITLES[kind].zh : SUBSECTION_TITLES[kind].en;
}
function localizedCopy(language, zh, en) {
    return isZh(language) ? zh : en;
}
function parseJson(value) {
    const trimmed = value.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/iu)?.[1] ?? trimmed;
    try {
        return JSON.parse(fenced);
    }
    catch {
        return null;
    }
}
async function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
function modelAvailabilityCacheKey(request) {
    return [request.task, request.role, request.preferredSlot ?? 'default', request.json ? 'json' : 'text'].join(':');
}
async function hasEnhancedArticleModel(request) {
    const cacheKey = modelAvailabilityCacheKey(request);
    const now = Date.now();
    const cached = enhancedArticleModelAvailabilityCache.get(cacheKey);
    if (cached?.pending) {
        return cached.pending;
    }
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }
    const pending = withTimeout(gateway_1.omniGateway.hasAvailableModel(request), ENHANCED_ARTICLE_MODEL_TIMEOUT_MS, `Enhanced article model availability for ${request.role}`)
        .then((value) => {
        enhancedArticleModelAvailabilityCache.set(cacheKey, {
            value,
            expiresAt: Date.now() + (value ? ENHANCED_ARTICLE_MODEL_CACHE_TTL_MS : ENHANCED_ARTICLE_MODEL_NEGATIVE_CACHE_TTL_MS),
        });
        return value;
    })
        .catch((error) => {
        enhancedArticleModelAvailabilityCache.set(cacheKey, {
            value: false,
            expiresAt: Date.now() + ENHANCED_ARTICLE_MODEL_NEGATIVE_CACHE_TTL_MS,
        });
        throw error;
    });
    enhancedArticleModelAvailabilityCache.set(cacheKey, {
        value: false,
        expiresAt: 0,
        pending,
    });
    return pending;
}
function looksLanguageMismatched(value, language) {
    const text = cleanText(value);
    if (!text)
        return false;
    if (isZh(language)) {
        const hanCount = text.match(/[\p{Script=Han}]/gu)?.length ?? 0;
        const latinWordCount = text.match(/\b[A-Za-z]{3,}\b/gu)?.length ?? 0;
        return hanCount === 0 && latinWordCount >= 6;
    }
    return false;
}
function toStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => cleanText(entry))
        .filter(Boolean);
}
async function callOmniJson(role, system, user, maxTokens) {
    const request = {
        task: 'topic_summary',
        role,
        preferredSlot: 'language',
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        json: true,
        temperature: 0.2,
        maxTokens,
    };
    try {
        const hasAvailableModel = await hasEnhancedArticleModel(request);
        if (!hasAvailableModel)
            return null;
        const result = await withTimeout(gateway_1.omniGateway.complete(request), ENHANCED_ARTICLE_MODEL_TIMEOUT_MS, `Enhanced article completion for ${role}`);
        return result.issue ? null : parseJson(result.text);
    }
    catch (error) {
        logger_1.logger.warn('Enhanced article model call failed; falling back to grounded article copy.', {
            role,
            error: error instanceof Error ? error.message : String(error),
            timeoutMs: ENHANCED_ARTICLE_MODEL_TIMEOUT_MS,
        });
        return null;
    }
}
function parseStoredParagraphs(value) {
    const text = normalizeBlockText(value);
    if (!text)
        return [];
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((entry) => typeof entry === 'string')
                    .map((entry) => cleanText(entry))
                    .filter(Boolean);
            }
        }
        catch {
            // Ignore parse failure and continue with plain splitting.
        }
    }
    return text
        .split(/\n{2,}/u)
        .map((paragraph) => cleanText(paragraph))
        .filter(Boolean);
}
function looksLikeOperationalNarrativeText(value) {
    const text = cleanText(value);
    if (!text)
        return false;
    return /topic placement|node placement|currently grouped into|same stage window|stage-bounded paper|continuous article|paper cards|topic map|research cycle|reader artifact|problem line|mapped \/ tracked|让主题页看到|零散的论文卡片|同一阶段窗口|问题演进与证据接力/iu.test(text);
}
function looksLikeNoisyNarrativeText(value) {
    const text = cleanText(value);
    if (!text)
        return true;
    if (text.length < 24)
        return true;
    if (/^(?:[A-Z][A-Z.'&/ -]+(?:,\s*|:\s*)){2,}[A-Z][A-Z.'&/ -]+/u.test(text))
        return true;
    if (/^[A-Z0-9 ,.:;'&/()_-]{28,}$/u.test(text))
        return true;
    const upperMatches = text.match(/[A-Z]/gu) ?? [];
    const lowerMatches = text.match(/[a-z]/gu) ?? [];
    if (upperMatches.length >= 24 && upperMatches.length > lowerMatches.length * 2.5)
        return true;
    return false;
}
function isReadableNarrativeText(value, options) {
    const text = cleanText(value);
    if (!text)
        return false;
    if (looksLikeNoisyNarrativeText(text))
        return false;
    if (!options?.allowOperational && looksLikeOperationalNarrativeText(text))
        return false;
    return true;
}
function pickReadableParagraphs(value, limit = 2, options) {
    return parseStoredParagraphs(value)
        .map((paragraph) => cleanText(paragraph))
        .filter((paragraph) => isReadableNarrativeText(paragraph, options))
        .slice(0, limit);
}
function isLowSignalSectionExcerpt(title, content) {
    if (/topic placement|node placement|related nodes?/iu.test(title))
        return true;
    if (/^it is currently grouped into \d+ node\(s\)/iu.test(content))
        return true;
    return false;
}
function toSectionExcerpt(section) {
    if (!section)
        return null;
    const title = cleanText(section.editorialTitle || section.sourceSectionTitle || '');
    const content = pickReadableParagraphs(section.paragraphs, 2).join(' ');
    if (!title && !content)
        return null;
    if (isLowSignalSectionExcerpt(title, content))
        return null;
    return {
        id: section.id,
        title: title || 'Untitled section',
        content: clipText(content, 420),
    };
}
function inferSectionKinds(title) {
    const normalizedTitle = cleanText(title);
    const hits = SUBSECTION_ORDER.filter((kind) => SECTION_KIND_PATTERNS[kind].some((pattern) => pattern.test(normalizedTitle)));
    return hits.length > 0 ? hits : ['general'];
}
function buildSectionBuckets(paper) {
    const buckets = Object.fromEntries([...SUBSECTION_ORDER, 'general'].map((kind) => [kind, []]));
    for (const section of paper.paper_sections ?? []) {
        const excerpt = toSectionExcerpt(section);
        if (!excerpt)
            continue;
        const kinds = inferSectionKinds(excerpt.title);
        for (const kind of kinds) {
            buckets[kind].push(excerpt);
        }
        if (kinds[0] !== 'general') {
            buckets.general.push(excerpt);
        }
    }
    return buckets;
}
function joinNarrativeParagraphs(paragraphs) {
    return paragraphs
        .map((paragraph) => cleanText(paragraph))
        .filter(Boolean)
        .join('\n\n');
}
function paperSectionAnchors(paper) {
    return (paper.paper_sections ?? []).map((section) => `section:${section.id}`);
}
function paperFigureAnchors(paper) {
    return (paper.figures ?? []).map((figure) => `figure:${figure.id}`);
}
function paperTableAnchors(paper) {
    return (paper.tables ?? []).map((table) => `table:${table.id}`);
}
function paperFormulaAnchors(paper) {
    return (0, synthetic_formulas_1.collectPaperFormulaArtifacts)(paper).map((formula) => `formula:${formula.id}`);
}
function paperEvidenceCatalog(paper) {
    if (Array.isArray(paper.evidence) && paper.evidence.length > 0) {
        return paper.evidence.filter(isHighSignalSourceEvidence);
    }
    const title = paperDisplayTitle(paper);
    const reconstructedEvidence = buildSourceEvidenceFromPaper(paper);
    const coveredAnchors = new Set(reconstructedEvidence.map((item) => item.anchorId));
    const fallbackRenderableEvidence = [
        ...paperFigureAnchors(paper).map((anchorId) => ({
            id: anchorId.replace(/^figure:/u, ''),
            anchorId,
            type: 'figure',
            route: '',
            title: anchorId.replace(/^figure:/u, 'Figure '),
            label: `${title} / ${anchorId.replace(/^figure:/u, 'Figure ')}`,
            quote: '',
            content: 'Preserved figure asset attached to this paper.',
            page: null,
            sourcePaperId: paper.id,
            sourcePaperTitle: title,
            whyItMatters: 'This preserved figure still needs to be read together with the surrounding narrative, even when caption OCR is incomplete.',
            importance: 6,
        })),
        ...paperTableAnchors(paper).map((anchorId) => ({
            id: anchorId.replace(/^table:/u, ''),
            anchorId,
            type: 'table',
            route: '',
            title: anchorId.replace(/^table:/u, 'Table '),
            label: `${title} / ${anchorId.replace(/^table:/u, 'Table ')}`,
            quote: '',
            content: 'Preserved table artifact attached to this paper.',
            page: null,
            sourcePaperId: paper.id,
            sourcePaperTitle: title,
            whyItMatters: 'This preserved table should remain in the article even when row OCR is incomplete, because it is part of the paper evidence surface.',
            importance: 7,
        })),
        ...paperFormulaAnchors(paper).map((anchorId) => ({
            id: anchorId.replace(/^formula:/u, ''),
            anchorId,
            type: 'formula',
            route: '',
            title: anchorId.replace(/^formula:/u, 'Formula '),
            label: `${title} / ${anchorId.replace(/^formula:/u, 'Formula ')}`,
            quote: '',
            content: anchorId.replace(/^formula:/u, 'Formula '),
            page: null,
            sourcePaperId: paper.id,
            sourcePaperTitle: title,
            formulaLatex: anchorId.replace(/^formula:/u, 'Formula '),
            whyItMatters: 'This preserved formula anchor should stay connected to the surrounding mechanism explanation.',
            importance: 7,
        })),
    ]
        .filter((item) => !coveredAnchors.has(item.anchorId))
        .filter(isHighSignalSourceEvidence);
    return [...reconstructedEvidence, ...fallbackRenderableEvidence];
}
function evidenceLabel(evidence, language) {
    const raw = cleanText(evidence.title) ||
        cleanText(evidence.label) ||
        cleanText(evidence.anchorId) ||
        localizedCopy(language, '关键证据', 'Key evidence');
    return raw.replace(/\s+/gu, ' ').trim();
}
function evidenceNarrativeText(evidence) {
    return cleanText([evidence.quote, evidence.content, evidence.whyItMatters, evidence.explanation].join(' '));
}
function evidenceCountSummary(paper, language) {
    const catalog = paperEvidenceCatalog(paper);
    const figureCount = catalog.filter((item) => item.type === 'figure').length;
    const tableCount = catalog.filter((item) => item.type === 'table').length;
    const formulaCount = catalog.filter((item) => item.type === 'formula').length;
    return {
        figureCount,
        tableCount,
        formulaCount,
        summary: figureCount + tableCount + formulaCount === 0
            ? localizedCopy(language, '当前还没有保留下来的图、表或公式证据，只能先根据摘要与正文片段重建论证链。', 'No preserved figure, table, or formula evidence is attached to this paper yet.')
            : localizedCopy(language, `当前保留了 ${figureCount} 张图、${tableCount} 张表和 ${formulaCount} 个公式，可用于把方法、实验与结果重新落回证据层。`, `Preserved evidence for this paper includes ${figureCount} figures, ${tableCount} tables, and ${formulaCount} formulas.`),
    };
}
const SUBSECTION_EVIDENCE_KEYWORDS = {
    background: {
        preferredTypes: ['section'],
        keywords: [/background/iu, /motivation/iu, /related work/iu, /introduction/iu, /setting/iu],
    },
    problem: {
        preferredTypes: ['section', 'figure'],
        keywords: [/problem/iu, /objective/iu, /challenge/iu, /task/iu, /failure/iu],
    },
    method: {
        preferredTypes: ['formula', 'figure', 'section'],
        keywords: [/method/iu, /architecture/iu, /framework/iu, /pipeline/iu, /loss/iu, /objective/iu, /world model/iu, /latent/iu, /planner/iu],
    },
    experiment: {
        preferredTypes: ['table', 'figure', 'section'],
        keywords: [/experiment/iu, /setup/iu, /dataset/iu, /benchmark/iu, /evaluation/iu, /implementation/iu],
    },
    results: {
        preferredTypes: ['table', 'figure', 'section'],
        keywords: [/result/iu, /analysis/iu, /ablation/iu, /leaderboard/iu, /performance/iu, /score/iu, /collision/iu, /improve/iu],
    },
    contribution: {
        preferredTypes: ['table', 'figure', 'formula', 'section'],
        keywords: [/contribution/iu, /finding/iu, /novel/iu, /better/iu, /improve/iu, /insight/iu],
    },
    limitation: {
        preferredTypes: ['section', 'table', 'figure'],
        keywords: [/limitation/iu, /weakness/iu, /boundary/iu, /failure/iu, /error/iu, /future work/iu],
    },
    significance: {
        preferredTypes: ['section', 'table', 'figure', 'formula'],
        keywords: [/significance/iu, /impact/iu, /implication/iu, /generalization/iu, /conclusion/iu],
    },
};
function subsectionTypeWeight(kind, type) {
    const preferred = SUBSECTION_EVIDENCE_KEYWORDS[kind].preferredTypes;
    const position = preferred.indexOf(type);
    if (position === -1)
        return 0;
    return Math.max(1, preferred.length - position) * 10;
}
function scoreEvidenceForSubsection(kind, evidence) {
    const keywords = SUBSECTION_EVIDENCE_KEYWORDS[kind].keywords;
    const text = evidenceNarrativeText(evidence);
    let score = subsectionTypeWeight(kind, evidence.type) + (evidence.importance ?? 0);
    for (const keyword of keywords) {
        if (keyword.test(text)) {
            score += 8;
        }
    }
    if (kind === 'method' && evidence.type === 'formula' && evidence.formulaLatex)
        score += 8;
    if (kind === 'results' && evidence.type === 'table')
        score += 6;
    if (kind === 'experiment' && evidence.type === 'figure' && evidence.imagePath)
        score += 4;
    if (kind === 'limitation' && /failure|error|boundary|limitation/iu.test(text))
        score += 10;
    return score;
}
function selectEvidenceForSubsection(kind, paper) {
    const catalog = paperEvidenceCatalog(paper);
    const ranked = [...catalog]
        .map((evidence) => ({ evidence, score: scoreEvidenceForSubsection(kind, evidence) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => {
        if (right.score !== left.score)
            return right.score - left.score;
        return left.evidence.anchorId.localeCompare(right.evidence.anchorId);
    })
        .map((entry) => entry.evidence);
    if (ranked.length === 0) {
        return [];
    }
    const selected = [];
    const typeCaps = {
        section: kind === 'background' || kind === 'problem' || kind === 'limitation' ? 2 : 1,
        figure: 3,
        table: 3,
        formula: kind === 'method' ? 3 : 1,
    };
    const typeCounts = {
        section: 0,
        figure: 0,
        table: 0,
        formula: 0,
    };
    for (const evidence of ranked) {
        if (typeCounts[evidence.type] >= typeCaps[evidence.type])
            continue;
        selected.push(evidence);
        typeCounts[evidence.type] += 1;
    }
    return selected;
}
function splitNarrativeParagraphs(content) {
    return content
        .split(/\n{2,}/u)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}
function stripEmbeddedEvidenceMarkers(content) {
    return content.replace(/\[\[(figure|table|formula):[a-zA-Z0-9_-]+\]\]/gu, '').trim();
}
function buildEmbeddedEvidenceMarker(anchorId) {
    return `[[${anchorId}]]`;
}
function hasEmbeddedEvidenceMarker(content, anchorId) {
    return content.includes(buildEmbeddedEvidenceMarker(anchorId));
}
function synthesizeInlineEvidenceDescription(evidence, language) {
    const lead = clipText(cleanText(evidence.explanation ||
        evidence.whyItMatters ||
        evidence.quote ||
        evidence.content), 180) || evidenceLabel(evidence, language);
    if (evidence.type === 'formula') {
        return localizedCopy(language, `${evidenceLabel(evidence, language)} 给出了这篇论文最关键的目标、约束或更新关系，读这一节时需要把它和正文里的机制解释对应起来。${lead}`, `${evidenceLabel(evidence, language)} states the paper's key objective, constraint, or update rule, so this section should read it together with the surrounding mechanism. ${lead}`);
    }
    if (evidence.type === 'table') {
        const schema = evidence.tableHeaders && evidence.tableHeaders.length > 0
            ? evidence.tableHeaders.slice(0, 3).join(', ')
            : '';
        return localizedCopy(language, `${evidenceLabel(evidence, language)} 把核心比较压缩成可核对的结果表${schema ? `，重点列包括 ${schema}` : ''}。${lead}`, `${evidenceLabel(evidence, language)} compresses the decisive comparison into a table that can be checked directly${schema ? `, with key columns such as ${schema}` : ''}. ${lead}`);
    }
    return localizedCopy(language, `${evidenceLabel(evidence, language)} 提供了这篇论文最关键的可视化证据，需要把图中的结构、趋势或对比和正文判断一起读。${lead}`, `${evidenceLabel(evidence, language)} provides a visual checkpoint for the paper's claim, so the narrative should read the figure together with the structure, trend, or comparison it shows. ${lead}`);
}
function synthesizeInlineEvidenceNote(evidence, language) {
    const explicit = cleanText(evidence.whyItMatters);
    if (explicit)
        return explicit;
    if (evidence.type === 'formula') {
        return localizedCopy(language, '它决定了方法真正依赖的优化目标、约束条件或状态更新方式。', 'It makes the method\'s actual objective, constraint, or state update explicit.');
    }
    if (evidence.type === 'table') {
        return localizedCopy(language, '它把模型与基线之间的胜负关系落成了可以复核的比较矩阵。', 'It turns the comparison against baselines into a matrix that can be checked directly.');
    }
    return localizedCopy(language, '它把论文声称的机制或结果变成了读者可以直接核对的图像证据。', 'It turns the paper\'s claimed mechanism or result into evidence a reader can inspect directly.');
}
function buildInlineEvidenceFromSourceEvidence(evidence, language) {
    return {
        anchorId: evidence.anchorId,
        type: evidence.type,
        description: synthesizeInlineEvidenceDescription(evidence, language),
        whyItMatters: synthesizeInlineEvidenceNote(evidence, language),
    };
}
function pickBestSubsectionKindForEvidence(evidence, subsections) {
    const rankedKinds = SUBSECTION_ORDER
        .map((kind) => ({ kind, score: scoreEvidenceForSubsection(kind, evidence) }))
        .sort((left, right) => right.score - left.score);
    const bestKind = rankedKinds[0];
    if (bestKind && bestKind.score > 0) {
        return bestKind.kind;
    }
    if (evidence.type === 'formula')
        return 'method';
    if (evidence.type === 'table')
        return 'results';
    if (evidence.type === 'figure') {
        return subsections.some((item) => item.kind === 'experiment') ? 'experiment' : 'results';
    }
    return 'background';
}
function injectEvidenceMarkersIntoContent(content, anchorIds) {
    if (anchorIds.length === 0)
        return content;
    const existingAnchorIds = new Set();
    const matcher = /\[\[(figure|table|formula):([a-zA-Z0-9_-]+)\]\]/gu;
    for (const match of content.matchAll(matcher)) {
        existingAnchorIds.add(`${match[1]}:${match[2]}`);
    }
    const pendingAnchors = anchorIds.filter((anchorId) => !existingAnchorIds.has(anchorId));
    if (pendingAnchors.length === 0)
        return content;
    const paragraphs = splitNarrativeParagraphs(content);
    if (paragraphs.length === 0) {
        return pendingAnchors.map((anchorId) => buildEmbeddedEvidenceMarker(anchorId)).join('\n\n');
    }
    const nextParagraphs = [...paragraphs];
    pendingAnchors.forEach((anchorId, index) => {
        const slot = Math.min(nextParagraphs.length - 1, Math.max(0, Math.floor(((index + 1) * nextParagraphs.length) / (pendingAnchors.length + 1))));
        const marker = buildEmbeddedEvidenceMarker(anchorId);
        nextParagraphs.splice(slot + index + 1, 0, marker);
    });
    return nextParagraphs.join('\n\n');
}
function reconcilePaperSubsectionCoverage(subsections, paper, language) {
    const renderableEvidence = paperEvidenceCatalog(paper).filter((item) => item.type === 'figure' || item.type === 'table' || item.type === 'formula');
    if (renderableEvidence.length === 0) {
        return subsections;
    }
    const sectionAssignments = new Map();
    const coveredRenderableAnchors = new Set();
    for (const subsection of subsections) {
        const assigned = new Set();
        for (const anchorId of subsection.evidenceIds) {
            if (renderableEvidence.some((item) => item.anchorId === anchorId)) {
                assigned.add(anchorId);
                coveredRenderableAnchors.add(anchorId);
            }
        }
        for (const inlineEvidence of subsection.inlineEvidences ?? []) {
            if (renderableEvidence.some((item) => item.anchorId === inlineEvidence.anchorId)) {
                assigned.add(inlineEvidence.anchorId);
                coveredRenderableAnchors.add(inlineEvidence.anchorId);
            }
        }
        sectionAssignments.set(subsection.kind, assigned);
    }
    for (const evidence of renderableEvidence) {
        if (coveredRenderableAnchors.has(evidence.anchorId))
            continue;
        const kind = pickBestSubsectionKindForEvidence(evidence, subsections);
        const assigned = sectionAssignments.get(kind) ?? new Set();
        assigned.add(evidence.anchorId);
        sectionAssignments.set(kind, assigned);
        coveredRenderableAnchors.add(evidence.anchorId);
    }
    const evidenceByAnchorId = new Map(renderableEvidence.map((item) => [item.anchorId, item]));
    return subsections.map((subsection) => {
        const assignedAnchors = Array.from(sectionAssignments.get(subsection.kind) ?? []);
        const mergedEvidenceIds = Array.from(new Set([...subsection.evidenceIds, ...assignedAnchors]));
        const inlineEvidenceMap = new Map();
        for (const inlineEvidence of subsection.inlineEvidences ?? []) {
            inlineEvidenceMap.set(inlineEvidence.anchorId, inlineEvidence);
        }
        for (const anchorId of assignedAnchors) {
            const evidence = evidenceByAnchorId.get(anchorId);
            if (!evidence || inlineEvidenceMap.has(anchorId))
                continue;
            inlineEvidenceMap.set(anchorId, buildInlineEvidenceFromSourceEvidence(evidence, language));
        }
        const anchoredRenderableIds = mergedEvidenceIds.filter((anchorId) => evidenceByAnchorId.has(anchorId));
        const nextContent = injectEvidenceMarkersIntoContent(subsection.content, anchoredRenderableIds);
        return {
            ...subsection,
            content: nextContent,
            wordCount: countWords(stripEmbeddedEvidenceMarkers(nextContent), language),
            evidenceIds: mergedEvidenceIds,
            inlineEvidences: Array.from(inlineEvidenceMap.values()),
        };
    });
}
function formatEvidenceList(labels, language) {
    if (labels.length === 0)
        return '';
    if (labels.length === 1)
        return labels[0];
    if (isZh(language)) {
        return `${labels.slice(0, -1).join('、')}和${labels.at(-1)}`;
    }
    return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}
function buildEvidenceDiscussion(kind, paper, language) {
    const selected = selectEvidenceForSubsection(kind, paper);
    const renderable = selected.filter((evidence) => evidence.type !== 'section');
    if (renderable.length === 0)
        return '';
    const labels = renderable.slice(0, 3).map((evidence) => evidenceLabel(evidence, language));
    const whyNotes = renderable
        .map((evidence) => cleanText(evidence.whyItMatters))
        .filter(Boolean)
        .slice(0, 2);
    const leadByKind = {
        background: localizedCopy(language, `围绕这一部分最值得回看的证据是 ${formatEvidenceList(labels, language)}，它们把论文的起点和反应对象具体化了。`, `The most useful evidence for this part is ${formatEvidenceList(labels, language)}, which makes the paper's starting point concrete.`),
        problem: localizedCopy(language, `真正把问题轮廓钉住的，是 ${formatEvidenceList(labels, language)} 这组证据。`, `The problem statement becomes concrete when it is tied back to ${formatEvidenceList(labels, language)}.`),
        method: localizedCopy(language, `方法部分最需要和 ${formatEvidenceList(labels, language)} 一起读，因为这些证据直接交代了结构、目标函数或规划接口。`, `The method should be read together with ${formatEvidenceList(labels, language)}, because those pieces of evidence expose the architecture, objective, or planning interface.`),
        experiment: localizedCopy(language, `${formatEvidenceList(labels, language)} 说明实验不是装饰性的，而是在交代数据、评测设置与对比边界。`, `${formatEvidenceList(labels, language)} shows that the experiments are not decorative; they define the datasets, evaluation setup, and comparison boundary.`),
        results: localizedCopy(language, `如果只看结果判断，${formatEvidenceList(labels, language)} 是最应该反复核对的证据，因为它们决定了增益是否真实成立。`, `For the result claims, ${formatEvidenceList(labels, language)} are the pieces of evidence that most directly determine whether the gains truly hold.`),
        contribution: localizedCopy(language, `论文的贡献能否站住，最终还是要回到 ${formatEvidenceList(labels, language)} 这些证据上。`, `Whether the contribution really stands depends on returning to ${formatEvidenceList(labels, language)}.`),
        limitation: localizedCopy(language, `边界与不足往往藏在 ${formatEvidenceList(labels, language)} 的细节里，而不是口头声明里。`, `The limitations often appear in the details of ${formatEvidenceList(labels, language)}, not only in explicit caveats.`),
        significance: localizedCopy(language, `${formatEvidenceList(labels, language)} 让这篇论文的意义不只停留在口号层，而是能够落到可复核的机制与结果上。`, `${formatEvidenceList(labels, language)} keeps the paper's significance grounded in checkable mechanisms and results rather than slogans.`),
    };
    return joinNarrativeParagraphs([leadByKind[kind], ...whyNotes]);
}
function normalizeEvidenceReference(reference, paper) {
    const trimmed = cleanText(reference);
    if (!trimmed)
        return '';
    if (trimmed.includes(':'))
        return trimmed;
    const catalog = paperEvidenceCatalog(paper);
    const direct = catalog.find((item) => item.id === trimmed || item.anchorId === trimmed);
    if (direct) {
        return direct.anchorId;
    }
    if ((paper.paper_sections ?? []).some((section) => section.id === trimmed))
        return `section:${trimmed}`;
    if ((paper.figures ?? []).some((figure) => figure.id === trimmed))
        return `figure:${trimmed}`;
    if ((paper.tables ?? []).some((table) => table.id === trimmed))
        return `table:${trimmed}`;
    if ((0, synthetic_formulas_1.collectPaperFormulaArtifacts)(paper).some((formula) => formula.id === trimmed))
        return `formula:${trimmed}`;
    return trimmed;
}
function buildEvidenceSummary(paper) {
    return evidenceCountSummary(paper, 'en').summary;
}
function buildSourceEvidenceFromPaper(paper) {
    const paperTitle = paperDisplayTitle(paper);
    const sectionEvidence = (paper.paper_sections ?? []).flatMap((section) => {
        const excerpt = toSectionExcerpt(section);
        if (!excerpt)
            return [];
        return [{
                id: section.id,
                anchorId: `section:${section.id}`,
                type: 'section',
                route: '',
                title: excerpt.title || 'Section',
                label: `${paperTitle} / ${excerpt.title || 'Section'}`,
                quote: clipText(excerpt.content, 220),
                content: excerpt.content,
                page: null,
                sourcePaperId: paper.id,
                sourcePaperTitle: paperTitle,
                whyItMatters: 'This section provides the preserved narrative evidence for the argument chain.',
                importance: 5,
            }];
    });
    const figureEvidence = (paper.figures ?? []).map((figure) => ({
        id: figure.id,
        anchorId: `figure:${figure.id}`,
        type: 'figure',
        route: '',
        title: `Figure ${figure.number ?? figure.id}`.trim(),
        label: `${paperTitle} / Figure ${figure.number ?? figure.id}`.trim(),
        quote: clipText(figure.caption || `Figure ${figure.number ?? figure.id}`, 220),
        content: cleanText([figure.caption, figure.analysis].join(' ')) || `Preserved figure asset for ${paperTitle}.`,
        page: figure.page ?? null,
        sourcePaperId: paper.id,
        sourcePaperTitle: paperTitle,
        imagePath: (0, paper_links_1.resolvePaperAssetPath)({ assetPath: figure.imagePath ?? null, paperId: paper.id }) ?? null,
        thumbnailPath: (0, paper_links_1.resolvePaperAssetPath)({ assetPath: figure.thumbnailPath ?? null, paperId: paper.id }) ?? null,
        whyItMatters: 'This figure captures a visible mechanism, comparison, or outcome that the paper relies on.',
        importance: 7,
    }));
    const tableEvidence = (paper.tables ?? [])
        .map((table) => {
        const tableHeaders = Array.isArray(table.headers)
            ? table.headers.map((header) => cleanText(header)).filter(Boolean)
            : cleanText(table.headers)
                ? [cleanText(table.headers)]
                : undefined;
        const tableRows = Array.isArray(table.rows) ? table.rows : undefined;
        const tableRowsSummary = summarizeTableRows(table.rows);
        const tableContent = cleanText([table.caption, table.rawText, tableHeaders?.join(' '), tableRowsSummary].join(' ')) ||
            `Preserved table artifact for ${paperTitle}.`;
        return {
            id: table.id,
            anchorId: `table:${table.id}`,
            type: 'table',
            route: '',
            title: `Table ${table.number ?? table.id}`.trim(),
            label: `${paperTitle} / Table ${table.number ?? table.id}`.trim(),
            quote: clipText(table.caption || tableHeaders?.join(', ') || `Table ${table.number ?? table.id}`, 220),
            content: tableContent,
            page: table.page ?? null,
            sourcePaperId: paper.id,
            sourcePaperTitle: paperTitle,
            tableHeaders,
            tableRows,
            whyItMatters: tableHeaders?.length || tableRowsSummary || cleanText(table.caption) || cleanText(table.rawText)
                ? 'This table is part of the quantitative basis for judging whether the paper beats its baselines.'
                : 'This preserved table artifact should stay attached to the article even when OCR text is incomplete.',
            importance: 8,
        };
    });
    const formulaEvidence = (0, synthetic_formulas_1.collectPaperFormulaArtifacts)(paper).flatMap((formula) => {
        const normalizedLatex = sanitizeDeepFormulaLatex(formula.latex);
        const fallbackFormulaText = cleanText(formula.rawText) ||
            cleanText(`Formula ${formula.number ?? formula.id}`) ||
            cleanText(formula.id);
        const normalizedFormulaText = normalizedLatex || fallbackFormulaText;
        if (looksLikeDeepFormulaNoise(normalizedFormulaText))
            return [];
        return [{
                id: formula.id,
                anchorId: `formula:${formula.id}`,
                type: 'formula',
                route: '',
                title: `Formula ${formula.number ?? ''}`.trim(),
                label: `${paperTitle} / Formula ${formula.number ?? ''}`.trim(),
                quote: clipText(formula.rawText || normalizedFormulaText, 220),
                content: cleanText([normalizedFormulaText, formula.rawText].join(' ')),
                page: formula.page ?? null,
                sourcePaperId: paper.id,
                sourcePaperTitle: paperTitle,
                formulaLatex: normalizedLatex || normalizedFormulaText,
                whyItMatters: formula.synthetic
                    ? 'This formula signal was reconstructed from preserved table or section text so the method can still be read against its objective or update rule.'
                    : 'This formula defines the objective, constraint, or update rule that makes the method specific.',
                importance: 9,
            }];
    });
    return [...sectionEvidence, ...figureEvidence, ...tableEvidence, ...formulaEvidence].filter(isHighSignalSourceEvidence);
}
function collectFallbackEvidenceIds(kind, paper, buckets) {
    const excerptIds = (buckets[kind].length > 0 ? buckets[kind] : buckets.general)
        .slice(0, 2)
        .map((item) => `section:${item.id}`);
    const evidenceAnchors = selectEvidenceForSubsection(kind, paper).map((item) => item.anchorId);
    return Array.from(new Set([...excerptIds, ...evidenceAnchors].map((reference) => normalizeEvidenceReference(reference, paper)))).filter(Boolean);
}
function buildRoleAwareIntroduction(paper, role, language) {
    const summary = clipText(pickNarrativeText(paper.abstract, paper.summary, paper.explanation), 420);
    const sectionLead = clipText(toSectionExcerpt(paper.paper_sections?.[0])?.content ?? '', 420);
    const title = paperDisplayTitle(paper);
    const evidenceSummary = evidenceCountSummary(paper, language).summary;
    const roleLead = {
        origin: localizedCopy(language, '作为这个节点里的源头论文，', 'As the earliest paper in this node,'),
        milestone: localizedCopy(language, '作为把这条研究线推成里程碑的论文，', 'As the paper that turns this thread into a milestone,'),
        branch: localizedCopy(language, '作为主动岔开一条新路线的论文，', 'As a branch that tests a different route,'),
        confluence: localizedCopy(language, '作为把前面多条尝试重新汇回来的论文，', 'As the paper that pulls earlier strands back together,'),
        extension: localizedCopy(language, '作为承接前作继续推进的论文，', 'As a continuation of the current line,'),
        baseline: localizedCopy(language, '作为用来稳住比较基线的论文，', 'As a baseline used to anchor comparison,'),
    }[role];
    const topEvidenceMentions = paperEvidenceCatalog(paper)
        .filter((item) => item.type !== 'section')
        .sort((left, right) => (right.importance ?? 0) - (left.importance ?? 0))
        .slice(0, 4)
        .map((item) => evidenceLabel(item, language));
    const evidenceMentions = uniqueNonEmpty(topEvidenceMentions, 2);
    const evidenceSentence = evidenceMentions.length === 0
        ? ''
        : localizedCopy(language, `这里保留下来的关键证据包括 ${evidenceMentions.join('、')}，它们让后文关于方法、实验和结论的判断有了可以逐段核对的落点。`, `Anchoring this section, ${evidenceMentions.join(', ')} remind the reader of the artifacts that make the claim concrete.`);
    return joinNarrativeParagraphs([
        `${roleLead}${summary || sectionLead || localizedCopy(language, `${title} 为后面的论文提供了最直接的进入口。`, `${title} provides the clearest entry point for the papers that follow.`)}`,
        sectionLead && sectionLead !== summary
            ? localizedCopy(language, `从保留下来的正文片段看，这篇论文一上来就把重点压在了这里：${sectionLead}`, `The preserved section material makes its first emphasis explicit: ${sectionLead}`)
            : '',
        localizedCopy(language, `因此，这篇论文在本节点中的读法不该只停留在“它提出了什么”，还要继续往下看它如何用方法、实验和证据把自己的判断站稳。${evidenceSummary}`, `Inside this node, the paper should be read not only for what it proposes, but also for how its method, experiments, and evidence make that proposal stand. ${evidenceSummary}`),
        evidenceSentence,
    ]);
}
function buildRoleAwareConclusion(paper, role, language) {
    const roleLabel = ROLE_LABELS[role][isZh(language) ? 'zh' : 'en'].toLowerCase();
    return joinNarrativeParagraphs([
        localizedCopy(language, `放回这个节点的顺序里看，这篇${roleLabel}真正留下来的不是一句结论，而是一套后续论文必须继承、修正或反驳的判断框架。`, `Inside this node, the value of this ${roleLabel} is that later papers can inherit, revise, or challenge the judgment it leaves behind.`),
        localizedCopy(language, `${evidenceCountSummary(paper, language).summary} 这些证据决定了这篇论文是节点里的坚实台阶，还是只是一段尚未坐实的尝试。`, `${evidenceCountSummary(paper, language).summary} These pieces of evidence determine whether the paper becomes a durable step in the node or only a tentative attempt.`),
    ]);
}
async function buildPaperIntroduction(paper, role, nodeTitle, language) {
    const editorialSystemPrompt = (0, editorial_prompt_1.getEditorialSystemPrompt)('paper-introduction', normalizeLanguageCode(language));
    const title = paperDisplayTitle(paper);
    const summary = clipText(pickNarrativeText(paper.abstract, paper.summary, paper.explanation), 420);
    const roleLabel = ROLE_LABELS[role][isZh(language) ? 'zh' : 'en'];
    const generated = shouldUseEnhancedArticleModelAssistance()
        ? await callOmniJson('paper_writer', `${editorialSystemPrompt}

Return JSON with introduction field. Write 2-3 paragraphs that:
1. Position this paper within the node sequence - explain its role (${roleLabel}) and why it appears at this timeline point
2. Connect to the node's core question: "${nodeTitle}"
3. Preview the methodological contribution and evidence structure
4. Use academic review-article prose style, no bullet points
5. Reference concrete figures/tables/formulas when available

Do NOT write generic "this paper is important" filler. Be specific about what this paper brings to the node's evolving judgment chain.`, buildPaperPromptContext(paper, role, language), 1000)
        : null;
    const fallback = buildRoleAwareIntroduction(paper, role, language);
    const generatedContent = cleanText(generated?.introduction);
    return generatedContent &&
        !looksGenericPaperNarrativeText(generatedContent, paper, 'introduction') &&
        !looksLanguageMismatched(generatedContent, language)
        ? generatedContent
        : fallback;
}
async function buildPaperSubsection(kind, paper, language) {
    const editorialSystemPrompt = (0, editorial_prompt_1.getEditorialSystemPrompt)('paper-subsection', normalizeLanguageCode(language));
    const evidence = selectEvidenceForSubsection(kind, paper);
    const buckets = buildSectionBuckets(paper);
    const evidenceAnchors = evidence
        .filter((item) => item.type !== 'section')
        .map((item) => ({
        anchorId: item.anchorId,
        type: item.type,
        label: evidenceLabel(item, language),
        description: clipText(item.whyItMatters || item.quote || item.content, 180),
    }));
    const evidenceAnchorList = evidenceAnchors
        .map((e) => `- ${e.anchorId}: ${e.label} | ${e.description}`)
        .join('\n');
    const generated = shouldUseEnhancedArticleModelAssistance()
        ? await callOmniJson('paper_writer', `${editorialSystemPrompt}

Return JSON with content, contentEn (optional), keyPoints, evidenceIds, and inlineEvidences.

INLINE EVIDENCE EMBEDDING REQUIREMENTS:
1. Embed evidence descriptions NATURALLY within the prose - use format like "【图表XXX展示了...】" for Chinese or "Figure X illustrates..." for English
2. Each inline evidence should have a brief interpretation paragraph explaining its significance
3. DO NOT use placeholder reference format like [[figure:xxx]] - write actual descriptive prose
4. inlineEvidences array: for each embedded evidence, provide anchorId, type, description (LLM-generated interpretation), and whyItMatters

SUBSECTION CONTENT REQUIREMENTS:
1. Write 150-250 words of connected academic prose
2. Focus on this specific aspect (${SUBSECTION_TITLES[kind][isZh(language) ? 'zh' : 'en']})
3. Use available evidence anchors to ground claims
4. Avoid generic filler - be specific about what this paper establishes

Evidence anchors available for this subsection:
${evidenceAnchorList || 'No figure/table/formula evidence - rely on sections and summary.'}`, [
            `Paper: ${paperDisplayTitle(paper)}`,
            `Subsection kind: ${kind}`,
            `Title: ${SUBSECTION_TITLES[kind][isZh(language) ? 'zh' : 'en']}`,
            summaryLine('Summary', pickNarrativeText(paper.abstract, paper.summary, paper.explanation)),
            ...evidence.map((item) => `Evidence: ${evidenceLabel(item, language)} - ${clipText(item.whyItMatters || item.quote || item.content, 160)}`),
        ].filter(Boolean).join('\n'), 900)
        : null;
    const fallbackContent = buildFallbackSubsectionContent(kind, paper, buckets, language);
    const generatedContent = cleanText(generated?.content);
    const content = generatedContent &&
        !looksGenericSubsectionText(generatedContent, kind, paper, language)
        ? generatedContent
        : fallbackContent;
    const keyPoints = toStringArray(generated?.keyPoints);
    const evidenceIds = toStringArray(generated?.evidenceIds)
        .map((ref) => normalizeEvidenceReference(ref, paper));
    const inlineEvidences = (generated?.inlineEvidences ?? [])
        .filter((ie) => ie.anchorId && ie.type && ie.description)
        .map((ie) => ({
        anchorId: normalizeEvidenceReference(ie.anchorId, paper),
        type: ie.type,
        description: cleanText(ie.description),
        whyItMatters: cleanText(ie.whyItMatters) || '',
    }));
    return {
        kind,
        title: localizedTitle(kind, language),
        titleEn: SUBSECTION_TITLES[kind].en,
        content,
        contentEn: cleanText(generated?.contentEn) || undefined,
        wordCount: countWords(content, language),
        keyPoints: keyPoints.length > 0 ? keyPoints : [],
        evidenceIds: evidenceIds.length > 0
            ? Array.from(new Set(evidenceIds))
            : collectFallbackEvidenceIds(kind, paper, buckets),
        inlineEvidences,
    };
}
async function buildPaperConclusion(paper, role, language) {
    const editorialSystemPrompt = (0, editorial_prompt_1.getEditorialSystemPrompt)('paper-conclusion', normalizeLanguageCode(language));
    const title = paperDisplayTitle(paper);
    const roleLabel = ROLE_LABELS[role][isZh(language) ? 'zh' : 'en'].toLowerCase();
    const generated = shouldUseEnhancedArticleModelAssistance()
        ? await callOmniJson('paper_writer', `${editorialSystemPrompt}

Return JSON with conclusion field. Write 2 paragraphs that:
1. Summarize what this ${roleLabel} contributes to the node's judgment chain
2. State what later papers must inherit, revise, or challenge
3. Reference key evidence (figures/tables/formulas) that anchors the judgment
4. Be honest about limitations - not just "future work" filler

Use academic prose, no bullet points. Be specific about the judgment this paper leaves for the sequence.`, buildPaperPromptContext(paper, role, language), 800)
        : null;
    const fallback = buildRoleAwareConclusion(paper, role, language);
    const generatedContent = cleanText(generated?.conclusion);
    return generatedContent &&
        !looksGenericPaperNarrativeText(generatedContent, paper, 'conclusion') &&
        !looksLanguageMismatched(generatedContent, language)
        ? generatedContent
        : fallback;
}
function buildFallbackSubsectionContent(kind, paper, buckets, language) {
    const summary = clipText(pickNarrativeText(paper.abstract, paper.summary, paper.explanation), 360);
    const excerpts = (buckets[kind].length > 0 ? buckets[kind] : buckets.general).slice(0, 2);
    const title = paperDisplayTitle(paper);
    const evidenceSummary = evidenceCountSummary(paper, language).summary;
    const evidenceDiscussion = buildEvidenceDiscussion(kind, paper, language);
    const canRepeatEvidenceSummary = !/^(?:No preserved|当前还没有保留下来的图、表或公式证据)/iu.test(evidenceSummary);
    const lead = {
        background: localizedCopy(language, `要看清《${title}》在本节点中的位置，先要把它面对的研究背景、继承的假设和要回应的旧问题重新铺开。`, `To understand the place of "${title}" in this node, the background has to be reconstructed around its motivation, inherited assumptions, and the prior work it is reacting to.`),
        problem: localizedCopy(language, `这篇论文真正想解决的问题，不是一个泛泛的任务名，而是当时研究链条里还没有被打通的具体断点。`, `The paper's core problem can be restated as a precise question: what is still unresolved in the current pipeline, and what must change for the node to move forward?`),
        method: localizedCopy(language, `方法部分决定这篇论文究竟是在改变建模框架、训练目标和规划接口，还是只是在既有路线的表面做润色。`, `The method section matters because it tells us whether the paper truly changes the modeling frame, training recipe, or planning interface, rather than only polishing a surface detail.`),
        experiment: localizedCopy(language, `实验设计的关键在于：作者是否真的构造了足以检验自己主张的场景、数据、基线和评测协议。`, `The experimental design determines whether the claims in "${title}" are testable on the stage-specific evidence preserved for this node.`),
        results: localizedCopy(language, `结果部分不能只看一句“提升了多少”，还要把增益出现在哪里、代价是什么、结论是否稳定讲清楚。`, `Results need to show more than a headline gain. They should explain where the paper improves, what the improvement costs, and where the evidence remains thin.`),
        contribution: localizedCopy(language, `回到节点主线里，真正重要的是把《${title}》压缩成几条可以重复验证的判断，而不是一句模糊的新颖性声明。`, `Placed back into the node mainline, the contribution of "${title}" should compress into a set of repeatable judgments rather than a vague claim of novelty.`),
        limitation: localizedCopy(language, `局限部分之所以关键，是因为下一篇论文通常正是沿着这些缺口继续推进，或者试图修补这些边界。`, `Limitations are central to this article flow because they explain what the next paper in the sequence still has to solve.`),
        significance: localizedCopy(language, `研究意义要回答的不是“这项工作看起来很重要”，而是为什么《${title}》值得被保留在这条持续演进的研究线上。`, `Significance answers why "${title}" belongs in this node as part of a durable research line instead of being remembered as a one-off demonstration.`),
    }[kind];
    const excerptParagraphs = excerpts.map((excerpt) => localizedCopy(language, `这一部分最直接的论据来自“${excerpt.title}”：${excerpt.content}`, `This part is supported most directly by "${excerpt.title}": ${excerpt.content}`));
    return joinNarrativeParagraphs([
        lead,
        ...excerptParagraphs,
        excerpts.length === 0 && summary
            ? localizedCopy(language, `当正文片段还不够完整时，只能先根据论文摘要把这一部分的论证补全：${summary}`, `When the section text is incomplete, the remaining paper summary still lets us reconstruct the argument: ${summary}`)
            : '',
        ((['method', 'experiment', 'results'].includes(kind) && canRepeatEvidenceSummary) ||
            (excerpts.length === 0 && canRepeatEvidenceSummary))
            ? evidenceSummary
            : '',
        evidenceDiscussion,
    ]);
}
function summaryLine(label, value) {
    const text = cleanText(value);
    return text ? `${label}: ${clipText(text, 420)}` : '';
}
function buildPaperPromptContext(paper, role, language) {
    const sectionDigest = (paper.paper_sections ?? [])
        .map((section) => toSectionExcerpt(section))
        .filter((section) => Boolean(section))
        .slice(0, 6)
        .map((section) => `- ${section.title}: ${section.content}`)
        .join('\n');
    return [
        `Title: ${paperDisplayTitle(paper)}`,
        `Role: ${ROLE_LABELS[role][isZh(language) ? 'zh' : 'en']}`,
        summaryLine('Summary', pickNarrativeText(paper.abstract, paper.summary, paper.explanation)),
        `Evidence: ${evidenceCountSummary(paper, language).summary}`,
        (() => {
            const evidenceDigest = paperEvidenceCatalog(paper)
                .filter((item) => item.type !== 'section')
                .sort((left, right) => (right.importance ?? 0) - (left.importance ?? 0))
                .slice(0, 6)
                .map((item) => `- ${evidenceLabel(item, language)}: ${clipText(item.whyItMatters || item.quote || item.content, 180)}`)
                .join('\n');
            return evidenceDigest ? `Evidence detail:\n${evidenceDigest}` : '';
        })(),
        sectionDigest ? `Sections:\n${sectionDigest}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}
function fallbackSubsections(paper, language) {
    const buckets = buildSectionBuckets(paper);
    return SUBSECTION_ORDER.map((kind) => {
        const content = buildFallbackSubsectionContent(kind, paper, buckets, language);
        const excerpts = (buckets[kind].length > 0 ? buckets[kind] : buckets.general).slice(0, 2);
        const evidenceLabels = selectEvidenceForSubsection(kind, paper)
            .filter((item) => item.type !== 'section')
            .slice(0, 2)
            .map((item) => evidenceLabel(item, language));
        const keyPoints = Array.from(new Set([
            ...excerpts.map((excerpt) => excerpt.title),
            ...evidenceLabels,
            evidenceCountSummary(paper, language).summary,
        ])).filter(Boolean);
        return {
            kind,
            title: localizedTitle(kind, language),
            titleEn: SUBSECTION_TITLES[kind].en,
            content,
            wordCount: countWords(content, language),
            keyPoints: keyPoints.slice(0, 3),
            evidenceIds: collectFallbackEvidenceIds(kind, paper, buckets),
        };
    });
}
function mergeSubsections(generated, paper, language) {
    const fallback = new Map(fallbackSubsections(paper, language).map((item) => [item.kind, item]));
    return SUBSECTION_ORDER.map((kind) => {
        const generatedItem = generated?.find((entry) => entry.kind === kind);
        const base = fallback.get(kind);
        const generatedContent = cleanText(generatedItem?.content);
        const content = generatedContent &&
            !looksGenericSubsectionText(generatedContent, kind, paper, language)
            ? generatedContent
            : (base?.content ?? generatedContent ?? '');
        const keyPoints = toStringArray(generatedItem?.keyPoints);
        const evidenceIds = toStringArray(generatedItem?.evidenceIds).map((reference) => normalizeEvidenceReference(reference, paper));
        return {
            kind,
            title: localizedTitle(kind, language),
            titleEn: SUBSECTION_TITLES[kind].en,
            content,
            contentEn: cleanText(generatedItem?.contentEn) || undefined,
            wordCount: typeof generatedItem?.wordCount === 'number' && generatedItem.wordCount > 0
                ? generatedItem.wordCount
                : countWords(content, language),
            keyPoints: keyPoints.length > 0 ? keyPoints : (base?.keyPoints ?? []),
            evidenceIds: evidenceIds.length > 0
                ? Array.from(new Set(evidenceIds))
                : Array.from(new Set(base?.evidenceIds ?? [])),
        };
    });
}
function inferPaperRole(paper, index, total, milestoneId) {
    const summary = `${paper.title} ${paper.summary ?? ''} ${paper.explanation ?? ''}`.toLowerCase();
    if (index === 0)
        return 'origin';
    if (paper.id === milestoneId && (paper.citationCount ?? 0) >= 200)
        return 'milestone';
    if (/\bbaseline\b|\bbenchmark\b/u.test(summary))
        return 'baseline';
    if (/\bbranch\b|\balternative\b|\bvariant\b|\bdivers/i.test(summary))
        return 'branch';
    if (index === total - 1 && total >= 3 && /\bmerge\b|\bunif(y|ied)\b|\bfusion\b|\bjoint\b/i.test(summary)) {
        return 'confluence';
    }
    if (index === total - 1 && total >= 4)
        return 'confluence';
    return 'extension';
}
function determineRoles(papers) {
    const sorted = [...papers].sort((left, right) => {
        const byDate = publishedTimestamp(left) - publishedTimestamp(right);
        if (byDate !== 0)
            return byDate;
        return paperDisplayTitle(left).localeCompare(paperDisplayTitle(right));
    });
    const milestoneId = [...sorted].sort((left, right) => (right.citationCount ?? 0) - (left.citationCount ?? 0))[0]?.id;
    return sorted.map((paper, index) => ({
        paper,
        role: inferPaperRole(paper, index, sorted.length, milestoneId),
    }));
}
const GENERIC_METHOD_HINT_RE = /^(?:method(?: and structure)?|architecture|model|introduction|background(?: and motivation)?|abstract(?: and entry)?|experiment(?:al design)?|results?(?: and analysis)?|discussion|conclusion)$/iu;
const FOCUS_CUE_CATALOG = [
    { pattern: /\bvision[- ]language[- ]action\b|\bvla\b/iu, zh: 'VLA', en: 'VLA' },
    { pattern: /\blanguage[- ]conditioned\b|\binstruction\b/iu, zh: '语言条件控制', en: 'language-conditioned control' },
    { pattern: /\bworld models?\b/iu, zh: '世界模型', en: 'world modeling' },
    { pattern: /\breinforcement learning\b|\brl\b/iu, zh: '强化学习', en: 'reinforcement learning' },
    { pattern: /\bimitation learning\b/iu, zh: '模仿学习', en: 'imitation learning' },
    { pattern: /\bvirtual to real\b|\bsim(?:ulation)?[- ]to[- ]real\b/iu, zh: '仿真到真实迁移', en: 'sim-to-real transfer' },
    { pattern: /\brecovery\b/iu, zh: '恢复策略', en: 'recovery policies' },
    { pattern: /\bend[- ]to[- ]end\b/iu, zh: '端到端驾驶', en: 'end-to-end driving' },
    { pattern: /\battention\b/iu, zh: '注意力建模', en: 'attention modeling' },
    { pattern: /\bcognitive map\b/iu, zh: '认知图', en: 'cognitive maps' },
    { pattern: /\bevent camera\b|\bneuromorphic\b/iu, zh: '事件相机', en: 'event-camera sensing' },
    { pattern: /\blatent\b/iu, zh: '潜变量动力学', en: 'latent dynamics' },
    { pattern: /\bplanning\b/iu, zh: '闭环规划', en: 'planning' },
    { pattern: /\bforecasting\b|\bfuture prediction\b/iu, zh: '未来预测', en: 'forecasting' },
    { pattern: /\boccupancy\b/iu, zh: '占用建模', en: 'occupancy modeling' },
    { pattern: /\bdiffusion\b/iu, zh: '扩散生成', en: 'diffusion generation' },
    { pattern: /\binterpretable\b|\bdiagnos/i, zh: '可解释中间计划', en: 'interpretable plans' },
    { pattern: /\bquery[- ]efficient\b/iu, zh: '查询高效学习', en: 'query-efficient learning' },
];
function collectFocusCues(values, language, limit = 4) {
    const haystack = values
        .map((value) => cleanText(value))
        .filter(Boolean)
        .join(' ');
    if (!haystack)
        return [];
    const cues = [];
    for (const cue of FOCUS_CUE_CATALOG) {
        if (cue.pattern.test(haystack)) {
            cues.push(isZh(language) ? cue.zh : cue.en);
        }
    }
    return uniqueStrings(cues, limit);
}
function collectKeyMethodHints(papers, language) {
    const hints = new Set();
    for (const paper of papers) {
        for (const section of paper.paper_sections ?? []) {
            const title = cleanText(section.editorialTitle || section.sourceSectionTitle);
            if (!title)
                continue;
            if (SECTION_KIND_PATTERNS.method.some((pattern) => pattern.test(title)) &&
                !GENERIC_METHOD_HINT_RE.test(title) &&
                title.length <= 48) {
                hints.add(title);
            }
        }
    }
    if (hints.size > 0) {
        return Array.from(hints).slice(0, 4);
    }
    return collectFocusCues(papers.flatMap((paper) => [paper.titleZh, paper.titleEn, paper.title, paper.summary, paper.explanation, paper.abstract]), language, 4);
}
function extractAnchorSnippets(value) {
    const normalized = cleanText(value).toLowerCase();
    if (!normalized)
        return [];
    const cjkAnchors = Array.from(normalized.matchAll(/[\u4e00-\u9fff]{2,12}/gu)).map((match) => match[0]);
    const asciiAnchors = normalized
        .split(/[^a-z0-9]+/u)
        .filter((token) => token.length >= 4);
    return uniqueStrings([...cjkAnchors, ...asciiAnchors], 6, 48);
}
function textHasAnyAnchor(value, anchors) {
    const normalized = cleanText(value).toLowerCase();
    if (!normalized)
        return false;
    return anchors.some((anchor) => anchor.length >= 2 && normalized.includes(anchor.toLowerCase()));
}
function paperAnchorSnippets(paper) {
    return uniqueStrings([
        ...extractAnchorSnippets('title' in paper ? paper.title : paperDisplayTitle(paper)),
        ...extractAnchorSnippets('titleEn' in paper ? paper.titleEn : ''),
        ...extractAnchorSnippets('summary' in paper ? paper.summary : ''),
        ...extractAnchorSnippets('explanation' in paper ? paper.explanation : ''),
        ...extractAnchorSnippets('abstract' in paper ? paper.abstract : ''),
    ], 8, 48);
}
function describePaperNarrative(paper, language, maxLength = 180) {
    const sectionLead = (paper.paper_sections ?? [])
        .map((section) => pickReadableParagraphs(section.paragraphs, 1)[0] ?? '')
        .find((paragraph) => Boolean(paragraph));
    const narrative = pickNarrativeText(paper.summary, paper.explanation, paper.abstract, sectionLead) ||
        localizedCopy(language, `这篇论文为“${paperDisplayTitle(paper)}”提供了当前节点中的关键证据入口。`, `This paper provides a key evidence entry point for "${paperDisplayTitle(paper)}" inside the node.`);
    return clipText(narrative, maxLength);
}
function looksGenericIntroductionText(value, node, papers, methodHints) {
    const normalized = cleanText(value);
    if (!normalized || normalized.length < 80)
        return true;
    const lowered = normalized.toLowerCase();
    if (/\bflat list\b|\bevolving judgment chain\b|\bsame stage\b|\bcontinuous article\b|\breadable review article\b|\bpaper list\b|\btopic map\b|\bpaper cards\b|\bstage window\b/u.test(lowered)) {
        return true;
    }
    const anchors = uniqueStrings([
        ...extractAnchorSnippets(nodeDisplayTitle(node)),
        ...extractAnchorSnippets(node.summary),
        ...extractAnchorSnippets(node.explanation),
        ...methodHints.flatMap((hint) => extractAnchorSnippets(hint)),
        ...papers.flatMap((paper) => paperAnchorSnippets(paper)),
    ], 12, 48);
    return anchors.length > 0 ? !textHasAnyAnchor(normalized, anchors) : false;
}
function looksGenericPaperNarrativeText(value, paper, kind) {
    const normalized = cleanText(value);
    if (!normalized || normalized.length < 90)
        return true;
    const lowered = normalized.toLowerCase();
    if (/\bthis paper is important\b|\bmakes a significant contribution\b|\bshould be read carefully\b|\bin this stage\b|\bstage window\b/u.test(lowered)) {
        return true;
    }
    const anchors = uniqueStrings([
        ...paperAnchorSnippets(paper),
        ...((paper.paper_sections ?? []).flatMap((section) => extractAnchorSnippets(section.editorialTitle || section.sourceSectionTitle))),
        ...collectFocusCues([paper.title, paper.titleZh, paper.titleEn, paper.summary, paper.explanation, paper.abstract], 'en', 4),
    ], 14, 48);
    if (anchors.length > 0 && !textHasAnyAnchor(normalized, anchors)) {
        return true;
    }
    const evidenceAnchors = paperEvidenceCatalog(paper)
        .filter((item) => item.type !== 'section')
        .map((item) => item.anchorId.toLowerCase());
    if (kind === 'conclusion' && evidenceAnchors.length > 0) {
        return !evidenceAnchors.some((anchor) => lowered.includes(anchor));
    }
    return false;
}
function looksGenericSubsectionText(value, kind, paper, language) {
    const normalized = cleanText(value);
    if (!normalized || normalized.length < 120)
        return true;
    if (looksLanguageMismatched(normalized, language))
        return true;
    const lowered = normalized.toLowerCase();
    if (/\bthis section\b|\bgenerally speaking\b|\bin summary\b|\bstage window\b|\bevolving judgment chain\b/u.test(lowered)) {
        return true;
    }
    const subsectionAnchors = uniqueStrings([
        ...paperAnchorSnippets(paper),
        ...collectFocusCues(selectEvidenceForSubsection(kind, paper).map((item) => item.label || item.anchorId), 'en', 4),
    ], 12, 48);
    return subsectionAnchors.length > 0 ? !textHasAnyAnchor(normalized, subsectionAnchors) : false;
}
function looksGenericSynthesisText(value, node, papers, language) {
    const normalized = cleanText(value);
    if (!normalized || normalized.length < 120)
        return true;
    if (looksLanguageMismatched(normalized, language))
        return true;
    const lowered = normalized.toLowerCase();
    if (/\bunrelated entries\b|\bevolving judgment chain\b|\btopic map\b|\bpaper cards\b|\bsame stage\b/u.test(lowered)) {
        return true;
    }
    const anchors = uniqueStrings([
        ...extractAnchorSnippets(nodeDisplayTitle(node)),
        ...papers.flatMap((paper) => paperAnchorSnippets(paper)),
    ], 14, 48);
    return anchors.length > 0 ? !textHasAnyAnchor(normalized, anchors) : false;
}
function looksGenericClosingText(value, node, papers, language) {
    const normalized = cleanText(value);
    if (!normalized || normalized.length < 110)
        return true;
    if (looksLanguageMismatched(normalized, language))
        return true;
    const lowered = normalized.toLowerCase();
    if (/\bno longer just a list of papers\b|\bcontinuous stage-bounded argument\b|\bstage window\b/u.test(lowered)) {
        return true;
    }
    const anchors = uniqueStrings([
        ...extractAnchorSnippets(nodeDisplayTitle(node)),
        ...papers.flatMap((paper) => paperAnchorSnippets(paper)),
    ], 12, 48);
    return anchors.length > 0 ? !textHasAnyAnchor(normalized, anchors) : false;
}
function pickArticleSafeNodeNarrative(node) {
    const candidate = pickNarrativeText(node.summary, node.explanation);
    if (!candidate)
        return '';
    if (looksLikeOperationalNarrativeText(candidate))
        return '';
    return candidate;
}
function buildIntroductionFallback(node, papers, methodHints, language) {
    const firstPaper = papers[0];
    const lastPaper = papers.at(-1);
    const narrativeCues = uniqueStrings([
        ...methodHints,
        ...collectFocusCues(papers.flatMap((paper) => [
            paper.titleZh,
            paper.titleEn,
            paper.title,
            paper.summary,
            paper.explanation,
            paper.abstract,
        ]), language, 4),
    ], 4);
    const nodeNarrative = pickArticleSafeNodeNarrative(node) ||
        localizedCopy(language, `这个节点关注“${nodeDisplayTitle(node)}”在当前阶段窗口里的具体推进。`, `This node tracks how "${nodeDisplayTitle(node)}" advances inside the current stage window.`);
    return {
        content: joinNarrativeParagraphs([
            localizedCopy(language, `第 ${node.stageIndex} 阶段里的“${nodeDisplayTitle(node)}”并不是一个抽象标签，而是一条可以被逐篇论文追踪的问题线。`, `Within stage ${node.stageIndex}, "${nodeDisplayTitle(node)}" is not an abstract label but a concrete problem line that can be traced paper by paper.`),
            nodeNarrative,
            firstPaper
                ? localizedCopy(language, `文章先从《${paperDisplayTitle(firstPaper)}》读起，因为它把节点最早的任务设定与证据入口摆了出来：${describePaperNarrative(firstPaper, language, 200)}`, `The article opens with ${paperDisplayTitle(firstPaper)} because it lays out the earliest task framing and evidence entry point for the node: ${describePaperNarrative(firstPaper, language, 200)}`)
                : '',
            lastPaper && firstPaper && lastPaper.id !== firstPaper.id
                ? localizedCopy(language, `顺着这条线往后读，到《${paperDisplayTitle(lastPaper)}》时，节点的落点已经变成：${describePaperNarrative(lastPaper, language, 200)}`, `Following the line forward, the stage lands at ${paperDisplayTitle(lastPaper)}, where the emphasis becomes: ${describePaperNarrative(lastPaper, language, 200)}`)
                : '',
            narrativeCues.length > 0
                ? localizedCopy(language, `贯穿这个节点的技术抓手主要包括：${formatEvidenceList(narrativeCues, language)}。`, `The recurring technical handles across this node are ${formatEvidenceList(narrativeCues, language)}.`)
                : '',
        ]),
        contextStatement: localizedCopy(language, `这个节点属于第 ${node.stageIndex} 阶段，要求被归入的论文处在同一时间窗口里，并且共同回答同一类问题，而不是只共享表面关键词。`, `This node belongs to stage ${node.stageIndex}: papers belong here only if they live inside the same time window and answer the same problem family rather than merely sharing vocabulary.`),
        coreQuestion: localizedCopy(language, firstPaper && lastPaper && firstPaper.id !== lastPaper.id
            ? `从《${paperDisplayTitle(firstPaper)}》提出的起始问题，到《${paperDisplayTitle(lastPaper)}》给出的阶段性答案，中间究竟发生了哪些方法替换、证据接力与边界收缩？`
            : `围绕“${nodeDisplayTitle(node)}”，这一阶段到底建立了什么可靠判断，又还有哪些地方仍然缺少更硬的图表、公式与实验支撑？`, firstPaper && lastPaper && firstPaper.id !== lastPaper.id
            ? `How does the line move from the initial problem setup in ${paperDisplayTitle(firstPaper)} to the stage-level answer in ${paperDisplayTitle(lastPaper)}, and what method changes or evidence handoffs make that transition credible?`
            : `Within "${nodeDisplayTitle(node)}", what becomes reliable in this stage, and which claims still need stronger figures, formulas, or experiments?`),
    };
}
function looksGenericCoreJudgmentText(value, node, papers) {
    const normalized = cleanText(value);
    if (!normalized || normalized.length < 28)
        return true;
    const lowered = normalized.toLowerCase();
    if (/\bevolving judgment chain\b|\bisolated results\b|\bsame stage\b|\bcontinuous article\b|\blegible only when\b|\btopic map\b|\bpaper cards\b|\bstage window\b/u.test(lowered)) {
        return true;
    }
    const anchors = uniqueStrings([
        ...extractAnchorSnippets(nodeDisplayTitle(node)),
        ...extractAnchorSnippets(node.summary),
        ...extractAnchorSnippets(node.explanation),
        ...papers.flatMap((paper) => paperAnchorSnippets(paper)),
    ], 12, 48);
    return anchors.length > 0 ? !textHasAnyAnchor(normalized, anchors) : false;
}
function buildCoreJudgmentFallback(node, papers) {
    const firstPaper = papers[0];
    const lastPaper = papers.at(-1);
    const nodeNarrative = pickArticleSafeNodeNarrative(node);
    const focusCuesZh = collectFocusCues(papers.flatMap((paper) => [
        paper.title,
        paper.titleEn,
        paper.introduction,
        paper.conclusion,
        ...paper.subsections.map((subsection) => subsection.content),
    ]), 'zh', 4);
    const focusCuesEn = collectFocusCues(papers.flatMap((paper) => [
        paper.title,
        paper.titleEn,
        paper.introduction,
        paper.conclusion,
        ...paper.subsections.map((subsection) => subsection.contentEn || subsection.content),
    ]), 'en', 4);
    const focusCueLabelZh = formatEvidenceList(focusCuesZh, 'zh');
    const focusCueLabelEn = formatEvidenceList(focusCuesEn, 'en');
    if (!firstPaper) {
        return {
            content: `这个节点真正推进的判断是：第 ${node.stageIndex} 阶段里的“${nodeDisplayTitle(node)}”已经有了可以继续加厚证据的具体问题边界。`,
            contentEn: `The real advance in this node is that stage ${node.stageIndex} gives "${nodeDisplayTitle(node)}" a concrete problem boundary that later evidence can now thicken.`,
        };
    }
    if (!lastPaper || lastPaper.paperId === firstPaper.paperId) {
        return {
            content: focusCueLabelZh
                ? `这个节点真正建立的判断是：在第 ${node.stageIndex} 阶段里，《${firstPaper.title}》把“${nodeDisplayTitle(node)}”的关键入口具体化为围绕${focusCueLabelZh}展开的一组可检验主张。`
                : `这个节点真正建立的判断是：在第 ${node.stageIndex} 阶段里，《${firstPaper.title}》把“${nodeDisplayTitle(node)}”的关键问题入口和后续证据标准一起定了下来。`,
            contentEn: focusCueLabelEn
                ? `The real advance in this node is that, within stage ${node.stageIndex}, ${firstPaper.title} turns "${nodeDisplayTitle(node)}" into a testable line organized around ${focusCueLabelEn}.`
                : `The real advance in this node is that, within stage ${node.stageIndex}, ${firstPaper.title} fixes both the key entry point and the evidence standard for "${nodeDisplayTitle(node)}".`,
        };
    }
    return {
        content: focusCueLabelZh
            ? `这个节点真正推进的判断是：从《${firstPaper.title}》提出起始设定，到《${lastPaper?.title ?? '后续论文'}》给出阶段性落点，研究开始围绕${focusCueLabelZh}形成同一条可逐篇核对的方法分工与证据链，而不再只是泛泛讨论"${nodeDisplayTitle(node)}"。`
            : `这个节点真正推进的判断是：从《${firstPaper.title}》提出起始设定，到《${lastPaper?.title ?? '后续论文'}》给出阶段性落点，"${nodeDisplayTitle(node)}"不再只是一个话题，而被收束成了一条可以逐篇验证的问题线。`,
        contentEn: focusCueLabelEn
            ? `The real advance in this node is that, from the initial setup in ${firstPaper.title} to the stage-level landing point in ${lastPaper?.title ?? 'later papers'}, the line turns into a checkable evidence chain organized around ${focusCueLabelEn} rather than a loose topic label for "${nodeDisplayTitle(node)}".`
            : `The real advance in this node is that ${nodeDisplayTitle(node)} stops being a vague topic and becomes a testable problem line, moving from ${firstPaper.title}'s initial setup to the stage-level landing point in ${lastPaper?.title ?? 'later papers'}${nodeNarrative ? ` while preserving ${clipText(nodeNarrative, 96)}` : ''}.`,
    };
}
async function buildIntroduction(node, papers, language) {
    const paperTitles = papers.map((paper) => paperDisplayTitle(paper)).join(', ');
    const methodHints = collectKeyMethodHints(papers, language);
    const firstPaper = papers[0];
    const lastPaper = papers.at(-1);
    const editorialSystemPrompt = (0, editorial_prompt_1.getEditorialSystemPrompt)('node-introduction', normalizeLanguageCode(language));
    const generated = shouldUseEnhancedArticleModelAssistance()
        ? await callOmniJson('node_writer', `${editorialSystemPrompt}

Return JSON with content, contextStatement, coreQuestion, and keyMethods. Write 2-4 narrative paragraphs in formal review-article tone with no bullet lists. The introduction must:
1. Establish the stage-bounded problem and why this node exists at this timeline position
2. State the node-level thesis - what cognition this node truly advances
3. Explain how the following papers divide the work (method evolution, evidence handoff)
4. Mention concrete paper titles plus preserved figures/tables/formulas whenever they exist
5. Treat the node page as a full-length review article - prefer specificity and continuity over compression
6. Avoid process narration ("this paper discusses...") and generic survey filler
7. Use "总-分-总" structure opening: start with the core question, preview the paper sequence, set up the synthesis

Do NOT write developer-oriented text like "this node is grouped into..." or "papers are mapped to...". Write for a reader who wants to understand the research line.`, [
            `Node: ${nodeDisplayTitle(node)}`,
            summaryLine('Node summary', pickNarrativeText(node.summary, node.explanation)),
            `Stage index: ${node.stageIndex}`,
            `Paper count: ${papers.length}`,
            paperTitles ? `Papers: ${paperTitles}` : '',
            methodHints.length > 0 ? `Method cues: ${methodHints.join(', ')}` : '',
            firstPaper ? `First paper: ${paperDisplayTitle(firstPaper)} - ${describePaperNarrative(firstPaper, language, 200)}` : '',
            lastPaper && firstPaper && lastPaper.id !== firstPaper.id ? `Last paper: ${paperDisplayTitle(lastPaper)} - ${describePaperNarrative(lastPaper, language, 200)}` : '',
        ]
            .filter(Boolean)
            .join('\n'), 2200)
        : null;
    const introductionFallback = buildIntroductionFallback(node, papers, methodHints, language);
    const generatedContent = cleanText(generated?.content);
    const generatedContextStatement = cleanText(generated?.contextStatement);
    const generatedCoreQuestion = cleanText(generated?.coreQuestion);
    const keyMethods = toStringArray(generated?.keyMethods).length > 0
        ? toStringArray(generated?.keyMethods)
        : methodHints;
    return {
        type: 'introduction',
        id: `${node.nodeId}-introduction`,
        title: localizedCopy(language, '引言', 'Introduction'),
        content: looksGenericIntroductionText(generatedContent, node, papers, methodHints)
            ? introductionFallback.content
            : generatedContent,
        contextStatement: looksGenericIntroductionText(generatedContextStatement, node, papers, methodHints)
            ? introductionFallback.contextStatement
            : generatedContextStatement,
        coreQuestion: looksGenericIntroductionText(generatedCoreQuestion, node, papers, methodHints)
            ? introductionFallback.coreQuestion
            : generatedCoreQuestion,
        keyMethods,
    };
}
async function buildPaperArticle(paper, role, language, nodeTitle, reporter) {
    const paperTitle = paperDisplayTitle(paper);
    // Phase 1: Paper introduction (1 call)
    reporter?.onStageStart?.('paper-introduction', paper.id);
    const introduction = await buildPaperIntroduction(paper, role, nodeTitle, language);
    reporter?.onStageComplete?.('paper-introduction', introduction);
    // Phase 2: 8 subsections (8 calls)
    const subsections = [];
    for (const kind of SUBSECTION_ORDER) {
        reporter?.onStageStart?.(`paper-subsection-${kind}`, paper.id);
        const subsection = await buildPaperSubsection(kind, paper, language);
        subsections.push(subsection);
        reporter?.onStageComplete?.(`paper-subsection-${kind}`, subsection);
    }
    const reconciledSubsections = reconcilePaperSubsectionCoverage(subsections, paper, language);
    // Phase 3: Paper conclusion (1 call)
    reporter?.onStageStart?.('paper-conclusion', paper.id);
    const conclusion = await buildPaperConclusion(paper, role, language);
    reporter?.onStageComplete?.('paper-conclusion', conclusion);
    const totalWordCount = countWords(introduction, language) +
        countWords(conclusion, language) +
        reconciledSubsections.reduce((sum, subsection) => sum + subsection.wordCount, 0);
    return {
        type: 'paper-article',
        id: `${paper.id}-article`,
        paperId: paper.id,
        role,
        title: paperTitle,
        titleEn: paperDisplayTitleEn(paper),
        authors: parseAuthors(paper.authors),
        publishedAt: formatDate(paper.publishedAt || paper.published),
        citationCount: paper.citationCount ?? null,
        originalUrl: paper.originalUrl || paper.arxivUrl || undefined,
        pdfUrl: paper.pdfUrl || undefined,
        coverImage: (0, paper_links_1.resolvePaperAssetPath)({
            assetPath: paper.coverImage ?? paper.coverPath ?? null,
            paperId: paper.id,
        }) ?? null,
        introduction,
        subsections: reconciledSubsections,
        conclusion,
        totalWordCount,
        readingTimeMinutes: readingMinutes(totalWordCount),
        anchorId: `paper:${paper.id}`,
    };
}
function buildSynthesisFallback(node, papers, language) {
    const first = papers[0];
    const last = papers.at(-1);
    return {
        content: isZh(language)
            ? joinNarrativeParagraphs([
                `把“${nodeDisplayTitle(node)}”里的论文放在同一条时间线上阅读，重要的不是谁单独看起来最亮眼，而是谁真正把这条问题线往前推了一步。`,
                first && last && first.paperId !== last.paperId
                    ? `${first.title} 先把问题和最初的解法框起来，${last.title} 则代表这一阶段最后落下来的判断。`
                    : '',
                papers.length >= 3
                    ? '中间论文的价值，恰恰在于它们展示了这条研究线究竟是在补证据、改机制、扩边界，还是在重新定义原来的问题。'
                    : '',
            ])
            : joinNarrativeParagraphs([
                `Read together, the papers in "${nodeDisplayTitle(node)}" behave like a staged argument rather than unrelated entries.`,
                first && last && first.paperId !== last.paperId
                    ? `${first.title} sets the initial frame, while ${last.title} shows where the node lands by the end of the stage.`
                    : '',
                papers.length >= 3
                    ? 'The middle papers matter because they reveal whether the node advances by refining the same mechanism, broadening the benchmark surface, or changing the question itself.'
                    : '',
            ]),
        insights: isZh(language)
            ? [
                '把方法变化按时间顺序排开以后，节点里的推进关系会比单看论文摘要更清楚。',
                '只在同一阶段内部比较论文，才能看见证据是被复用、补强，还是彼此冲突。',
                '真正有用的综合，不是问哪篇论文单独最好，而是问每篇论文给这条判断链补上了什么。',
            ]
            : [
                'The node becomes easier to understand when method changes are read in chronological order.',
                'Comparing the papers inside a single stage window makes evidence reuse and disagreement visible.',
                'The strongest synthesis does not ask which paper is best in isolation; it asks what each paper adds to the evolving judgment chain.',
            ],
    };
}
async function buildSynthesis(node, papers, language) {
    if (papers.length < 2)
        return null;
    const editorialSystemPrompt = (0, editorial_prompt_1.getEditorialSystemPrompt)('synthesis', normalizeLanguageCode(language));
    const paperDigests = papers.map((paper) => `${paper.title}: ${clipText(paper.introduction, 220)} | Key evidence: ${paper.subsections.flatMap((s) => s.evidenceIds).slice(0, 3).join(', ')}`);
    const generated = shouldUseEnhancedArticleModelAssistance()
        ? await callOmniJson('critic', `${editorialSystemPrompt}

Return JSON with content and insights. The content should be 2-4 connected review-article paragraphs explaining:
1. How the method evolved across papers in this node - what changed and why
2. Which evidence (figures, tables, formulas) is reused or strengthened across papers
3. Where disagreements or alternative routes appear
4. What the overall node judgment is - NOT "which paper is best in isolation"
5. What each paper uniquely contributes to the judgment chain

Do NOT:
- Write parallel "this paper is good, that paper is also good" evaluations
- Skip cross-paper evidence chain analysis
- Give vague summary without concrete judgment
- Use bullet points - write continuous narrative

Stay grounded in the provided paper cues. Prefer concrete comparative analysis.`, [
            `Node: ${nodeDisplayTitle(node)}`,
            `Papers in sequence:`,
            ...paperDigests,
        ].join('\n'), 2400)
        : null;
    const fallback = buildSynthesisFallback(node, papers, language);
    const generatedInsights = toStringArray(generated?.insights).filter((item) => !looksLanguageMismatched(item, language));
    const generatedContent = cleanText(generated?.content);
    return {
        type: 'synthesis',
        id: `${node.nodeId}-synthesis`,
        title: localizedCopy(language, '综合讨论', 'Comparative Synthesis'),
        content: generatedContent &&
            !looksGenericSynthesisText(generatedContent, node, papers, language)
            ? generatedContent
            : fallback.content,
        insights: generatedInsights.length > 0 ? generatedInsights : fallback.insights,
    };
}
async function buildCoreJudgment(node, papers) {
    const editorialSystemPrompt = (0, editorial_prompt_1.getEditorialSystemPrompt)('core-judgment', 'zh');
    const paperTitles = papers.map((paper) => paper.title).join(', ');
    const nodeTitle = nodeDisplayTitle(node);
    const generated = shouldUseEnhancedArticleModelAssistance()
        ? await callOmniJson('critic', `${editorialSystemPrompt}

Return JSON with content and contentEn. Write ONE SENTENCE that captures the core cognition this node advances.

Requirements:
1. Direct strong judgment, not vague summary
2. Mention the node's historical position in the timeline
3. State what problem line it advances
4. Use paper titles if helpful for specificity
5. Avoid "this paper is important" language - focus on COGNITION

Example tone: "From [First Paper]'s initial frame to [Last Paper]'s stage landing, this node establishes that [specific method] can [specific capability] under [specific conditions], leaving [specific gap] for the next stage to address."

Keep it to 1-2 sentences, 40-60 Chinese characters or 25-40 English words.`, [
            `Node: ${nodeTitle}`,
            `Papers: ${paperTitles}`,
            ...papers.map((paper) => `Key point from ${paper.title}: ${clipText(paper.introduction, 150)}`),
        ].join('\n'), 800)
        : null;
    const fallback = buildCoreJudgmentFallback(node, papers);
    const generatedContent = cleanText(generated?.content);
    const generatedContentEn = cleanText(generated?.contentEn);
    return {
        content: looksGenericCoreJudgmentText(generatedContent, node, papers)
            ? fallback.content
            : generatedContent,
        contentEn: !looksGenericCoreJudgmentText(generatedContentEn, node, papers)
            ? generatedContentEn
            : !looksGenericCoreJudgmentText(generatedContent, node, papers)
                ? generatedContent
                : fallback.contentEn,
    };
}
async function buildClosing(node, papers, language) {
    const editorialSystemPrompt = (0, editorial_prompt_1.getEditorialSystemPrompt)('closing', normalizeLanguageCode(language));
    const paperConclusions = papers.map((paper) => `${paper.title}: ${clipText(paper.conclusion, 180)}`);
    const strongestEvidence = papers.flatMap((paper) => paper.subsections.flatMap((s) => s.evidenceIds)).slice(0, 6);
    const generated = shouldUseEnhancedArticleModelAssistance()
        ? await callOmniJson('critic', `${editorialSystemPrompt}

Return JSON with content and keyTakeaways. Write the content as the final section of a review article (2-3 paragraphs), NOT a UI summary.

Must address:
1. What is now firmly established in this node - which claims have strong evidence backing
2. Which figures/tables/formulas matter most for the node's judgment - be specific
3. What methodological boundaries are now clear
4. What limitations remain - honest assessment, not "future work" filler
5. What the next stage must solve - concrete research constraints, not vague directions

Do NOT:
- Write "this paper is important" style wrap-up
- Use bullet-point language in prose
- Skip the honest limitation assessment
- Give generic "in conclusion..." opening

The closing should feel like the conclusion of a publishable academic review article.`, [
            `Node: ${nodeDisplayTitle(node)}`,
            `Paper count: ${papers.length}`,
            `Strongest evidence IDs: ${strongestEvidence.join(', ')}`,
            ...paperConclusions,
        ].join('\n'), 2200)
        : null;
    const fallbackTakeaways = [
        'The node can now be read from top to bottom as one article.',
        'The remaining limitations indicate what later stages still need to solve.',
    ];
    const generatedContent = cleanText(generated?.content);
    return {
        type: 'closing',
        id: `${node.nodeId}-closing`,
        title: localizedCopy(language, '结论', 'Conclusion'),
        content: (generatedContent &&
            !looksGenericClosingText(generatedContent, node, papers, language)
            ? generatedContent
            : '') ||
            localizedCopy(language, `读到这里，“${nodeDisplayTitle(node)}”已经不再只是几篇论文的集合，而是一个有明确起点、推进方式和证据边界的阶段性研究判断。`, `At this point, "${nodeDisplayTitle(node)}" is no longer just a list of papers. It reads as one continuous stage-bounded argument about how the problem is posed, how the method changes, and where the evidence becomes convincing.`),
        keyTakeaways: toStringArray(generated?.keyTakeaways).length > 0
            ? toStringArray(generated?.keyTakeaways)
            : isZh(language)
                ? [
                    '这个节点已经把问题设定、方法推进和结果证据串成了一条可复述的研究线。',
                    '节点内部的局限恰好说明了下一阶段还需要解决哪些缺口。',
                    '真正稳定下来的不是某一篇论文的口号，而是多篇论文共同支撑的判断。',
                ]
                : fallbackTakeaways,
    };
}
function inferTransitionType(fromPaper, toPaper) {
    const fromText = `${fromPaper.title} ${fromPaper.introduction} ${fromPaper.conclusion}`.toLowerCase();
    const toText = `${toPaper.title} ${toPaper.introduction} ${toPaper.conclusion}`.toLowerCase();
    if (/\bscale\b|\blarger\b|\blonger horizon\b|\bmore data\b/i.test(toText))
        return 'scale-up';
    if (/\bscope\b|\bgeneral\b|\bmulti\b|\bbroaden\b/i.test(toText))
        return 'scope-broaden';
    if (/\bproblem\b|\bdiagnos/i.test(toText) && !/\bproblem\b|\bdiagnos/i.test(fromText)) {
        return 'problem-shift';
    }
    if (/\bmethod\b|\bdecoder\b|\barchitecture\b|\bplanner\b|\bworld model\b/i.test(toText)) {
        return 'method-evolution';
    }
    return 'complementary';
}
async function buildPaperTransition(fromPaper, toPaper, language) {
    const editorialSystemPrompt = (0, editorial_prompt_1.getEditorialSystemPrompt)('transition', normalizeLanguageCode(language));
    const generated = shouldUseEnhancedArticleModelAssistance()
        ? await callOmniJson('node_writer', `${editorialSystemPrompt}

Return JSON with content and transitionType. The content should be 60-120 words explaining HOW the second paper continues, revises, or broadens the first one.

Requirements:
1. State the specific change: method evolution, evidence strengthening, scope broadening, problem shift, or complementary finding
2. Mention what the first paper established and what the second paper takes from it
3. Explain what new element the second paper adds - not just "it continues"
4. Use evidence IDs if relevant (figure/table/formula handoff)
5. transitionType must be one of: method-evolution/problem-shift/scale-up/scope-broaden/complementary

Do NOT write generic "the second paper extends the first" - be specific about WHAT changes.`, [
            `Transition: ${fromPaper.title} → ${toPaper.title}`,
            `From paper intro: ${clipText(fromPaper.introduction, 260)}`,
            `To paper intro: ${clipText(toPaper.introduction, 260)}`,
            `From paper conclusion: ${clipText(fromPaper.conclusion, 220)}`,
            `To paper conclusion: ${clipText(toPaper.conclusion, 220)}`,
            `From key evidence: ${fromPaper.subsections.flatMap((s) => s.evidenceIds).slice(0, 3).join(', ')}`,
            `To key evidence: ${toPaper.subsections.flatMap((s) => s.evidenceIds).slice(0, 3).join(', ')}`,
        ].join('\n'), 600)
        : null;
    const transitionType = TRANSITION_TYPES.includes(generated?.transitionType)
        ? generated?.transitionType
        : inferTransitionType(fromPaper, toPaper);
    return {
        type: 'paper-transition',
        id: `transition-${fromPaper.paperId}-to-${toPaper.paperId}`,
        fromPaperId: fromPaper.paperId,
        fromPaperTitle: fromPaper.title,
        toPaperId: toPaper.paperId,
        toPaperTitle: toPaper.title,
        content: cleanText(generated?.content) ||
            localizedCopy(language, `${fromPaper.title} 把最初的答案搭起来之后，${toPaper.title} 并没有离开同一条问题线，而是通过改方法、补证据或扩大解释范围，把节点继续往前推了一步。`, `After ${fromPaper.title} sets up an initial answer, ${toPaper.title} keeps the same problem line in view but changes the method, evidence, or explanatory surface enough to move the node forward.`),
        transitionType,
        anchorId: `transition-${fromPaper.paperId}-to-${toPaper.paperId}`,
    };
}
async function buildPaperTransitions(papers, language) {
    return Promise.all(papers.slice(0, -1).map((paper, index) => buildPaperTransition(paper, papers[index + 1], language)));
}
async function buildArticleFlow(node, papers, language, reporter) {
    const orderedPapers = determineRoles(papers);
    const orderedSourcePapers = orderedPapers.map(({ paper }) => paper);
    const nodeTitle = nodeDisplayTitle(node);
    // Phase 1: Node introduction
    reporter?.onStageStart?.('node-introduction');
    reporter?.onProgress?.(2, 'Starting node introduction');
    const introduction = await buildIntroduction(node, orderedSourcePapers, language);
    reporter?.onStageComplete?.('node-introduction', introduction);
    reporter?.onProgress?.(5, 'Node introduction completed');
    // Phase 2: Paper articles (sequential for quality and progress tracking)
    const paperArticles = [];
    const paperCount = orderedPapers.length;
    const paperBaseProgress = 5;
    const paperProgressRange = 70;
    for (let i = 0; i < orderedPapers.length; i++) {
        const { paper, role } = orderedPapers[i];
        const paperProgress = paperBaseProgress + (i / paperCount) * paperProgressRange;
        reporter?.onStageStart?.(`paper-${paper.id}`, paper.id);
        reporter?.onProgress?.(paperProgress, `Starting paper ${paper.id} (${i + 1}/${paperCount})`);
        const paperArticle = await buildPaperArticle(paper, role, language, nodeTitle, reporter);
        paperArticles.push(paperArticle);
        reporter?.onStageComplete?.(`paper-${paper.id}`, paperArticle);
        reporter?.onProgress?.(paperProgress + (paperProgressRange / paperCount) * 0.9, `Paper ${paper.id} completed (${i + 1}/${paperCount})`);
    }
    // Phase 3: Paper transitions
    reporter?.onStageStart?.('paper-transitions');
    reporter?.onProgress?.(78, 'Generating paper transitions');
    const transitions = await buildPaperTransitions(paperArticles, language);
    reporter?.onStageComplete?.('paper-transitions', transitions);
    reporter?.onProgress?.(82, 'Paper transitions completed');
    const flow = [introduction];
    for (let index = 0; index < paperArticles.length; index += 1) {
        flow.push(paperArticles[index]);
        if (index < transitions.length) {
            flow.push(transitions[index]);
        }
    }
    // Phase 4: Synthesis, closing, core judgment
    reporter?.onStageStart?.('synthesis');
    reporter?.onProgress?.(85, 'Generating synthesis');
    const [synthesis, closing, coreJudgment] = await Promise.all([
        buildSynthesis(node, paperArticles, language),
        buildClosing(node, paperArticles, language),
        buildCoreJudgment(node, paperArticles),
    ]);
    reporter?.onStageComplete?.('synthesis', synthesis);
    reporter?.onProgress?.(95, 'Synthesis and closing completed');
    if (synthesis) {
        flow.push(synthesis);
    }
    flow.push(closing);
    reporter?.onProgress?.(100, 'Article generation completed');
    return { flow, coreJudgment };
}
async function generateDeepNodeArticle(prisma, params, reporter) {
    const node = await prisma.research_nodes.findUnique({
        where: { id: params.nodeId },
        select: { id: true, nodeLabel: true, stageIndex: true, nodeSummary: true, nodeExplanation: true },
    });
    if (!node) {
        throw new Error(`Node not found: ${params.nodeId}`);
    }
    const papers = await prisma.papers.findMany({
        where: { topicId: params.topicId, id: { in: params.paperIds } },
        include: {
            paper_sections: { orderBy: { order: 'asc' } },
            figures: true,
            tables: true,
            formulas: true,
        },
    });
    const { flow: articleFlow, coreJudgment } = await buildArticleFlow({
        nodeId: node.id,
        title: node.nodeLabel,
        stageIndex: node.stageIndex,
        summary: node.nodeSummary,
        explanation: node.nodeExplanation,
    }, papers.map((paper) => ({
        ...paper,
        publishedAt: paper.published,
        originalUrl: paper.arxivUrl,
        coverImage: (0, paper_links_1.resolvePaperAssetPath)({ assetPath: paper.coverPath, paperId: paper.id }) ?? null,
        evidence: buildSourceEvidenceFromPaper(paper),
    })), params.language, reporter);
    const totalWordCount = articleFlow.reduce((sum, block) => sum + ('totalWordCount' in block ? block.totalWordCount : countWords(block.content, params.language)), 0);
    return {
        nodeId: params.nodeId,
        schemaVersion: '2.0',
        articleFlow,
        coreJudgment,
        stats: {
            paperCount: articleFlow.filter((block) => block.type === 'paper-article').length,
            totalWordCount,
            readingTimeMinutes: readingMinutes(totalWordCount),
        },
    };
}
async function generateNodeEnhancedArticle(nodeId, options, reporter) {
    return buildArticleFlow({
        nodeId,
        title: options.nodeContext.title,
        stageIndex: options.nodeContext.stageIndex,
        summary: options.nodeContext.summary,
        explanation: options.nodeContext.explanation,
    }, options.papers.map((paper) => ({
        id: paper.id,
        title: paper.title,
        titleZh: paper.title,
        titleEn: paper.titleEn,
        authors: paper.authors,
        summary: paper.summary,
        explanation: paper.explanation,
        abstract: paper.abstract,
        publishedAt: paper.publishedAt,
        pdfUrl: paper.pdfUrl,
        originalUrl: paper.originalUrl,
        citationCount: paper.citationCount,
        coverImage: (0, paper_links_1.resolvePaperAssetPath)({ assetPath: paper.coverImage, paperId: paper.id }) ?? null,
        sections: paper.paper_sections,
        figures: paper.figures,
        tables: paper.tables,
        formulas: paper.formulas,
        evidence: paper.evidence ??
            buildSourceEvidenceFromPaper({
                id: paper.id,
                title: paper.title,
                titleZh: paper.title,
                titleEn: paper.titleEn,
                paper_sections: paper.paper_sections,
                figures: paper.figures,
                tables: paper.tables,
                formulas: paper.formulas,
            }),
    })), 'zh', reporter);
}
//# sourceMappingURL=deep-article-generator.js.map