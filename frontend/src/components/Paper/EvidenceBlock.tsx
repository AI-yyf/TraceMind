import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, Table, Sigma, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { RobustImage, ImageZoomModal } from './RobustImage';

interface EvidenceBlockProps {
  type: 'figure' | 'table' | 'formula';
  src?: string;
  caption?: string;
  analysis?: string[];
  index?: number;
  /** 表格列标题 */
  columns?: string[];
  /** 表格数据行 */
  rows?: string[][];
  /** 表格注释 */
  tableNote?: string;
  /** 论文 ID，用于 PDF 降级链接 */
  paperId?: string;
  /** PDF 链接 */
  pdfUrl?: string;
}

export const EvidenceBlock: React.FC<EvidenceBlockProps> = ({
  type,
  src,
  caption,
  analysis,
  index = 0,
  columns,
  rows,
  tableNote,
  paperId,
  pdfUrl,
}) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);

  const icons = {
    figure: Image,
    table: Table,
    formula: Sigma,
  };

  const labels = {
    figure: '图',
    table: '表',
    formula: '公式',
  };

  const Icon = icons[type];
  const label = labels[type];

  return (
    <>
      <motion.figure
        className="my-10 lg:my-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
      >
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
          {/* ========== 图片 ========== */}
          {type === 'figure' && src && (
            <div className="p-6 lg:p-10 flex items-center justify-center min-h-[250px] lg:min-h-[350px] bg-gradient-to-br from-neutral-50 to-white">
              <RobustImage
                src={src}
                alt={caption || `${label} ${index + 1}`}
                paperId={paperId}
                pdfUrl={pdfUrl}
                onClick={() => setIsZoomed(true)}
                showZoom={true}
              />
            </div>
          )}

          {/* ========== 无图片的占位 ========== */}
          {type === 'figure' && !src && (
            <div className="p-6 lg:p-10 flex flex-col items-center justify-center min-h-[250px] lg:min-h-[350px] bg-gradient-to-br from-neutral-50 to-neutral-100/50">
              <Image className="w-10 h-10 text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-400 mb-1">图片资源暂缺</p>
              <p className="text-xs text-neutral-300 mb-4">{caption || `${label} ${index + 1}`}</p>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm rounded-lg transition-colors border border-red-100"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  打开 PDF 查看原图
                </a>
              )}
            </div>
          )}

          {/* ========== 表格 ========== */}
          {type === 'table' && (
            <div className="p-6 lg:p-8 overflow-x-auto">
              {columns && rows && rows.length > 0 ? (
                <TableRenderer columns={columns} rows={rows} />
              ) : (
                <div className="text-sm text-neutral-500 text-center py-12 bg-neutral-50 rounded-lg">
                  <Table className="w-8 h-8 mx-auto mb-3 text-neutral-300" />
                  <p>{caption || `表格 ${index + 1}`}</p>
                  <p className="text-xs text-neutral-400 mt-1">表格数据将在内容生成阶段填充</p>
                </div>
              )}
            </div>
          )}

          {/* ========== 公式 ========== */}
          {type === 'formula' && (
            <div className="p-6 lg:p-10 flex items-center justify-center min-h-[120px] bg-gradient-to-br from-neutral-50 to-white">
              <div className="text-lg text-neutral-700 font-serif math-block">
                {caption || `公式 ${index + 1}`}
              </div>
            </div>
          )}

          {/* ========== 标题栏 ========== */}
          <div className="px-6 py-4 bg-gradient-to-r from-neutral-50 to-white border-t border-neutral-100 flex items-center justify-between">
            <figcaption className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 text-[13px]">
                <Icon className="w-4 h-4 text-red-500" />
                <span className="font-semibold text-red-600">{label} {index + 1}</span>
                {caption && (
                  <>
                    <span className="text-neutral-300">|</span>
                    <span className="text-neutral-600 line-clamp-2">{caption}</span>
                  </>
                )}
              </span>
            </figcaption>

            {analysis && analysis.length > 0 && (
              <button
                onClick={() => setShowAnalysis(!showAnalysis)}
                className="flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-red-600 transition-colors"
              >
                <span>分析</span>
                {showAnalysis ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          {/* 表格注释 */}
          {tableNote && (
            <div className="px-6 py-2 text-[11px] text-neutral-400 italic border-t border-neutral-50">
              {tableNote}
            </div>
          )}
        </div>

        {/* 深度分析 */}
        <AnimatePresence>
          {showAnalysis && analysis && analysis.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-3">
                {analysis.map((item, aIndex) => (
                  <motion.div
                    key={aIndex}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + aIndex * 0.08 }}
                    className="text-[14px] text-neutral-600 leading-relaxed pl-4 border-l-3 border-red-300 bg-red-50/30 py-2.5 pr-4 rounded-r-lg"
                  >
                    {item}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.figure>

      {/* 放大模态框 */}
      {type === 'figure' && src && (
        <ImageZoomModal
          isOpen={isZoomed}
          onClose={() => setIsZoomed(false)}
          src={src}
          caption={caption}
        />
      )}
    </>
  );
};

// ============ 内联表格渲染器 ============

interface TableRendererProps {
  columns: string[];
  rows: string[][];
  maxRows?: number;
}

function TableRenderer({ columns, rows, maxRows = 20 }: TableRendererProps) {
  const displayRows = rows.slice(0, maxRows);
  const hasMore = rows.length > maxRows;

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-50 border-b border-neutral-200">
            {columns.map((col, i) => (
              <th key={i} className="px-4 py-2.5 text-left font-semibold text-neutral-700 text-xs uppercase tracking-wider whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-neutral-100 last:border-b-0 ${ri % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}`}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2 text-neutral-600 whitespace-nowrap max-w-[200px] truncate">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="px-4 py-2 text-xs text-neutral-400 text-center bg-neutral-50 border-t border-neutral-100">
          显示前 {maxRows} 行，共 {rows.length} 行
        </div>
      )}
    </div>
  );
}
