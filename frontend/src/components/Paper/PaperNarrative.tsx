import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Grid3X3, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import { EvidenceBlock } from './EvidenceBlock';
import { FormulaRenderer } from './FormulaRenderer';
import { RobustImage } from './RobustImage';
import type { TrackerPaper, EvidenceItem } from '../../types/tracker';

interface PaperNarrativeProps {
  paper: TrackerPaper;
}

export const PaperNarrative: React.FC<PaperNarrativeProps> = ({ paper }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const narrativeSections = buildNarrativeSections(paper);

  // MathJax 渲染
  useEffect(() => {
    const renderMath = async () => {
      if (!containerRef.current || !window.MathJax?.typesetPromise) return;
      try {
        window.MathJax.typesetClear?.([containerRef.current]);
        await window.MathJax.typesetPromise([containerRef.current]);
      } catch (error) {
        console.warn('MathJax rendering error:', error);
      }
    };

    if (window.MathJax?.startup?.promise) {
      window.MathJax.startup.promise.then(renderMath);
    } else {
      renderMath();
    }
  }, [paper.id]);

  return (
    <article ref={containerRef} className="max-w-4xl mx-auto">
      {/* 背景介绍 */}
      <motion.section
        id="section-background"
        className="mb-14 lg:mb-18"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-gradient-to-br from-red-50/80 via-orange-50/40 to-white border-l-4 border-red-500 p-6 lg:p-8 rounded-r-2xl shadow-sm">
          <h2 className="text-[13px] font-bold text-red-600 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            研究背景
          </h2>
          <p className="text-[17px] lg:text-[19px] text-neutral-700 leading-relaxed">
            {paper.openingStandfirst}
          </p>
        </div>
      </motion.section>

      {/* 论文结构梳理 */}
      {narrativeSections.map((section, index) => (
        <motion.section
          key={index}
          id={`section-${index}`}
          className="mb-14 lg:mb-18"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 + 0.2 }}
        >
          <div className="mb-6">
            <h3 className="text-[24px] lg:text-[30px] font-bold text-neutral-900 leading-tight">
              {section.title}
            </h3>
            {section.sourceTitle && section.sourceTitle !== section.title && (
              <p className="mt-2 text-[14px] text-neutral-400">
                原文章节：{section.sourceTitle}
              </p>
            )}
          </div>

          <div className="space-y-6">
            {section.content.map((item, itemIndex) => {
              if (item.type === 'paragraph') {
                return (
                  <p
                    key={itemIndex}
                    className="text-[16px] lg:text-[17px] text-neutral-700 leading-[1.9]"
                  >
                    <MarkdownText text={item.text || ''} />
                  </p>
                );
              } else if (item.type === 'evidence' && item.evidence) {
                return renderEvidence(item.evidence, itemIndex);
              }
              return null;
            })}
          </div>

          {section.keyTakeaway && (
            <div className="mt-6 p-5 bg-gradient-to-r from-neutral-50 to-white rounded-xl border border-neutral-100">
              <p className="text-[14px] font-medium text-neutral-600 leading-relaxed">
                <span className="text-red-500 mr-2 font-bold">核心要点：</span>
                {section.keyTakeaway}
              </p>
            </div>
          )}
        </motion.section>
      ))}

      {/* 核心亮点 */}
      {paper.highlight && (
        <motion.section
          id="section-highlight"
          className="mb-14 lg:mb-18"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h3 className="text-[24px] lg:text-[30px] font-bold text-neutral-900 mb-6">
            核心亮点
          </h3>
          <div className="bg-gradient-to-br from-red-50/80 via-pink-50/40 to-white border-l-4 border-red-500 p-6 lg:p-8 rounded-r-2xl shadow-sm">
            <p className="text-[17px] lg:text-[18px] text-neutral-700 leading-relaxed">
              {paper.highlight}
            </p>
          </div>
        </motion.section>
      )}

      {/* 全部图片库 — 展示 figurePaths 中未被 sections 引用的图片 */}
      <AllFiguresGallery paper={paper} narrativeSections={narrativeSections} />

      {/* 未解决问题 */}
      {paper.problemsOut && paper.problemsOut.length > 0 && (
        <motion.section
          id="section-problems"
          className="mb-14 lg:mb-18"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h3 className="text-[24px] lg:text-[30px] font-bold text-neutral-900 mb-6">
            未解决的问题
          </h3>
          <div className="space-y-4">
            {paper.problemsOut.map((problem, index) => (
              <motion.div
                key={index}
                className="border border-neutral-200 rounded-xl p-5 lg:p-6 hover:border-red-200 hover:shadow-md transition-all bg-white"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + index * 0.1 }}
              >
                <div className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-red-100 to-red-50 text-red-600 flex items-center justify-center text-sm font-bold border border-red-200">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-[17px] font-semibold text-neutral-800 leading-relaxed mb-2">
                      {problem.question}
                    </p>
                    <p className="text-[15px] text-neutral-500 leading-relaxed">
                      {problem.whyItMatters}
                    </p>
                    {problem.tags && problem.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {problem.tags.map((tag, tIndex) => (
                          <span
                            key={tIndex}
                            className="px-3 py-1 bg-neutral-100 text-neutral-600 text-xs rounded-full border border-neutral-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* 封面说明 */}
      {paper.coverCaption && (
        <motion.section
          className="mt-14 lg:mt-18 pt-8 border-t border-neutral-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            {paper.coverCaption}
          </p>
        </motion.section>
      )}
    </article>
  );
};

// ============ 全部图片库 ============

interface AllFiguresGalleryProps {
  paper: TrackerPaper;
  narrativeSections: NarrativeSection[];
}

const AllFiguresGallery: React.FC<AllFiguresGalleryProps> = ({ paper, narrativeSections }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);

  // 收集已在 narrative 中展示过的图片路径
  const usedPaths = new Set<string>();
  for (const section of narrativeSections) {
    for (const item of section.content) {
      if (item.type === 'evidence' && item.evidence?.assetPath) {
        usedPaths.add(item.evidence.assetPath);
      }
    }
  }

  // 过滤出未展示的图片
  const allFigurePaths = paper.figurePaths || [];
  const unusedFigures = allFigurePaths.filter(p => !usedPaths.has(p));

  if (unusedFigures.length === 0) return null;

  const displayFigures = isExpanded ? unusedFigures : unusedFigures.slice(0, 3);

  return (
    <motion.section
      id="section-gallery"
      className="mb-14 lg:mb-18"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[24px] lg:text-[30px] font-bold text-neutral-900 flex items-center gap-3">
          <Grid3X3 className="w-7 h-7 text-red-500" />
          全部图表
        </h3>
        <span className="text-sm text-neutral-400">
          {unusedFigures.length} 张未展示
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {displayFigures.map((figPath, i) => (
          <div
            key={figPath}
            className="relative group cursor-pointer bg-white border border-neutral-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-red-200 transition-all duration-300"
            onClick={() => setZoomedIndex(i)}
          >
            <div className="aspect-[4/3] flex items-center justify-center bg-neutral-50 p-3">
              <RobustImage
                src={figPath}
                alt={figPath.split('/').pop() || `图 ${i + 1}`}
                paperId={paper.id}
                pdfUrl={paper.pdfUrl}
                className="max-w-full max-h-full object-contain"
                showZoom={false}
              />
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <p className="text-xs text-white/80 truncate">
                {figPath.split('/').pop()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {unusedFigures.length > 3 && (
        <motion.button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-6 w-full py-3 text-sm text-neutral-500 hover:text-red-600 bg-neutral-50 hover:bg-red-50 rounded-xl border border-neutral-200 hover:border-red-200 transition-all flex items-center justify-center gap-2"
          whileTap={{ scale: 0.98 }}
        >
          {isExpanded ? (
            <>收起 <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>展开全部 {unusedFigures.length} 张图 <ChevronDown className="w-4 h-4" /></>
          )}
        </motion.button>
      )}

      {/* PDF 查看降级 */}
      <div className="mt-4 flex justify-center">
        <a
          href={paper.pdfUrl || `https://arxiv.org/pdf/${paper.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs text-neutral-400 hover:text-red-500 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          在 PDF 中查看完整图表
        </a>
      </div>

      {/* 放大模态 */}
      <AnimatePresence>
        {zoomedIndex !== null && displayFigures[zoomedIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setZoomedIndex(null)}
          >
            {/* 关闭按钮 */}
            <button
              className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10"
              onClick={() => setZoomedIndex(null)}
            >
              <X className="w-6 h-6" />
            </button>

            {/* 前后导航 */}
            {zoomedIndex > 0 && (
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); setZoomedIndex(zoomedIndex - 1) }}
              >
                ←
              </button>
            )}
            {zoomedIndex < displayFigures.length - 1 && (
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); setZoomedIndex(zoomedIndex + 1) }}
              >
                →
              </button>
            )}

            {/* 图片 */}
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              key={displayFigures[zoomedIndex]}
              src={displayFigures[zoomedIndex]}
              alt=""
              className="max-w-[95vw] max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
              onError={() => {
                // 降级到 PDF
                window.open(paper.pdfUrl || `https://arxiv.org/pdf/${paper.id}`, '_blank');
              }}
            />

            {/* 文件名 */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2 text-white text-xs">
              {zoomedIndex + 1} / {displayFigures.length} — {displayFigures[zoomedIndex].split('/').pop()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
};

// ============ 渲染工具函数 ============

interface NarrativeSection {
  title: string;
  sourceTitle?: string;
  content: Array<{ type: 'paragraph' | 'evidence'; text?: string; evidence?: EvidenceItem }>;
  keyTakeaway?: string;
}

function localizeSectionSourceTitle(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  switch (trimmed) {
    case 'Background':
      return '研究背景';
    case 'Problem Framing':
      return '问题推进';
    case 'Method':
      return '方法抓手';
    case 'Implications':
      return '后续意义';
    case 'Evidence':
      return '证据与图表';
    default:
      return trimmed;
  }
}

function renderEvidence(evidence: EvidenceItem, index: number): React.ReactNode {
  if (evidence.type === 'figure') {
    return (
      <EvidenceBlock
        key={index}
        type="figure"
        src={evidence.assetPath || undefined}
        caption={evidence.caption}
        analysis={evidence.analysis}
        index={evidence.placement}
      />
    );
  } else if (evidence.type === 'formula') {
    return (
      <FormulaRenderer
        key={index}
        latex={evidence.latex || ''}
        caption={evidence.caption}
        analysis={evidence.analysis}
        index={evidence.placement}
      />
    );
  } else if (evidence.type === 'table' && evidence.table) {
    return (
      <EvidenceBlock
        key={index}
        type="table"
        caption={evidence.caption}
        analysis={evidence.analysis}
        index={evidence.placement}
        columns={evidence.table.columns}
        rows={evidence.table.rows}
        tableNote={evidence.table.note}
      />
    );
  }
  return null;
}

// 处理 Markdown 和 LaTeX 的文本渲染组件
function MarkdownText({ text }: { text: string }): React.ReactNode {
  if (!text) return null;

  // 处理加粗 **text**
  const boldPattern = /\*\*([^*]+)\*\*/g;
  // 处理行内公式 \( ... \) 和 $ ... $
  const inlineMathPattern = /\\\(([^]*?)\\\)/g;
  const dollarMathPattern = /(?<!\$)\$([^$]+)\$(?!\$)/g;
  // 处理斜体 *text*（但排除 ** 的情况）
  const italicPattern = /(?<!\*)\*([^*]+)\*(?!\*)/g;
  // 处理代码 `code`
  const codePattern = /`([^`]+)`/g;

  const tokens: Array<{ type: 'text' | 'bold' | 'math' | 'italic' | 'code'; content: string }> = [];
  
  // 提取所有特殊标记的位置
  const matches: Array<{ index: number; end: number; type: string; content: string; raw: string }> = [];
  
  let match;
  while ((match = boldPattern.exec(text)) !== null) {
    matches.push({ index: match.index, end: match.index + match[0].length, type: 'bold', content: match[1], raw: match[0] });
  }
  while ((match = inlineMathPattern.exec(text)) !== null) {
    matches.push({ index: match.index, end: match.index + match[0].length, type: 'math', content: match[1], raw: match[0] });
  }
  while ((match = dollarMathPattern.exec(text)) !== null) {
    matches.push({ index: match.index, end: match.index + match[0].length, type: 'math', content: match[1], raw: match[0] });
  }
  while ((match = italicPattern.exec(text)) !== null) {
    matches.push({ index: match.index, end: match.index + match[0].length, type: 'italic', content: match[1], raw: match[0] });
  }
  while ((match = codePattern.exec(text)) !== null) {
    matches.push({ index: match.index, end: match.index + match[0].length, type: 'code', content: match[1], raw: match[0] });
  }
  
  // 按位置排序
  matches.sort((a, b) => a.index - b.index);
  
  // 合并重叠的匹配（优先保留前面的）
  const filteredMatches: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.index >= lastEnd) {
      filteredMatches.push(m);
      lastEnd = m.end;
    }
  }
  
  // 构建 token 列表
  let currentPos = 0;
  for (const m of filteredMatches) {
    if (m.index > currentPos) {
      tokens.push({ type: 'text', content: text.slice(currentPos, m.index) });
    }
    tokens.push({ type: m.type as 'bold' | 'math' | 'italic' | 'code', content: m.content });
    currentPos = m.end;
  }
  if (currentPos < text.length) {
    tokens.push({ type: 'text', content: text.slice(currentPos) });
  }

  return (
    <>
      {tokens.map((token, index) => {
        switch (token.type) {
          case 'bold':
            return <strong key={index} className="font-semibold text-neutral-900">{token.content}</strong>;
          case 'italic':
            return <em key={index} className="italic text-neutral-700">{token.content}</em>;
          case 'code':
            return <code key={index} className="px-1.5 py-0.5 bg-neutral-100 text-neutral-800 rounded text-sm font-mono">{token.content}</code>;
          case 'math':
            return <MathSpan key={index} latex={token.content} />;
          default:
            return <span key={index}>{token.content}</span>;
        }
      })}
    </>
  );
}

// 独立的 Math 渲染组件，使用 useEffect 触发 MathJax
function MathSpan({ latex }: { latex: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const renderMath = async () => {
      if (!spanRef.current || !window.MathJax?.typesetPromise) return;
      try {
        await window.MathJax.typesetPromise([spanRef.current]);
      } catch {
        // Silent fail
      }
    };

    if (window.MathJax?.startup?.promise) {
      window.MathJax.startup.promise.then(renderMath);
    } else {
      renderMath();
    }
  }, [latex]);

  return <span ref={spanRef} className="math-inline">${latex}$</span>;
}

// 兼容旧接口

// 从章节的段落中提取有意义的核心要点
function extractKeyTakeaway(section: { paragraphs: string[]; editorialTitle: string; evidence: EvidenceItem[] }): string | undefined {
  // 优先从段落中提取包含核心/关键/要点/结果/表明/发现等关键词的句子
  const keywords = ['核心', '关键', '结果', '表明', '发现', '验证了', '证明了', '展示了', '实现了', '提出'];
  for (const para of section.paragraphs) {
    // 取段落中包含关键词的第一句话
    const sentences = para.split(/[。！？]/).filter(s => s.trim().length > 10);
    for (const sentence of sentences) {
      if (keywords.some(kw => sentence.includes(kw)) && sentence.length <= 80) {
        return sentence.trim() + '。';
      }
    }
  }
  // 降级：如果有关键证据项，使用第一条证据的标题
  if (section.evidence && section.evidence.length > 0) {
    const firstEvidence = section.evidence[0];
    if (firstEvidence?.caption) {
      return firstEvidence.caption;
    }
  }
  // 最终降级：不显示 keyTakeaway
  return undefined;
}

function buildNarrativeSections(paper: TrackerPaper): NarrativeSection[] {
  const sections: NarrativeSection[] = [];

  if (paper.sections && paper.sections.length > 0) {
    paper.sections.forEach((section) => {
      const localizedSourceTitle = localizeSectionSourceTitle(section.sourceSectionTitle);
      const content: NarrativeSection['content'] = [];

      section.paragraphs.forEach((paragraph) => {
        content.push({ type: 'paragraph', text: paragraph });
      });

      if (section.evidence && section.evidence.length > 0) {
        section.evidence.forEach((evidence) => {
          content.push({ type: 'evidence', evidence });
        });
      }

      sections.push({
        title: section.editorialTitle,
        sourceTitle: localizedSourceTitle,
        content,
        keyTakeaway: section.paragraphs.length > 0
          ? extractKeyTakeaway(section)
          : undefined,
      });
    });
  } else {
    sections.push({
      title: '研究概述',
      content: [{ type: 'paragraph', text: paper.summary || '暂无详细摘要' }],
    });

    if (paper.figurePaths && paper.figurePaths.length > 0) {
      const evidence: EvidenceItem = {
        id: 'default-figure',
        title: '方法架构',
        type: 'figure',
        assetPath: paper.figurePaths[0],
        caption: '方法架构示意图',
        analysis: ['该图展示了论文提出的核心方法框架。'],
        placement: 0,
      };

      sections.push({
        title: '方法与架构',
        content: [
          { type: 'paragraph', text: '该论文提出了新的方法框架，通过创新性的设计解决了现有方法的局限性。' },
          { type: 'evidence', evidence },
        ],
      });
    }
  }

  return sections;
}
