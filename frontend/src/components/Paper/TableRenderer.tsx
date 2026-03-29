import React from 'react';
import { motion } from 'framer-motion';
import { InlineFormula } from './FormulaRenderer';

interface TableRendererProps {
  columns: string[];
  rows: string[][];
  caption?: string;
  analysis?: string[];
  note?: string;
  index?: number;
}

export const TableRenderer: React.FC<TableRendererProps> = ({
  columns,
  rows,
  caption,
  analysis,
  note,
  index = 0,
}) => {
  return (
    <motion.figure
      className="my-8 lg:my-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      {/* 表格容器 */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* 表头 */}
            <thead className="bg-gradient-to-r from-neutral-100 to-neutral-50 border-b border-neutral-200">
              <tr>
                {columns.map((col, cIndex) => (
                  <th
                    key={cIndex}
                    className="px-5 py-4 text-left text-[13px] font-semibold text-neutral-700 tracking-wide"
                  >
                    {renderCell(col)}
                  </th>
                ))}
              </tr>
            </thead>
            {/* 表体 */}
            <tbody>
              {rows.map((row, rIndex) => (
                <tr
                  key={rIndex}
                  className={`
                    ${rIndex % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}
                    hover:bg-red-50/30 transition-colors duration-200
                  `}
                >
                  {row.map((cell, cIndex) => (
                    <td
                      key={cIndex}
                      className="px-5 py-4 text-[14px] text-neutral-700 border-b border-neutral-100 last:border-b-0 leading-relaxed"
                    >
                      {renderCell(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 标题 */}
        {caption && (
          <div className="px-5 py-4 bg-gradient-to-r from-neutral-50 to-white border-t border-neutral-200">
            <figcaption className="text-center">
              <span className="inline-flex items-center gap-2 text-[13px] text-neutral-600">
                <span className="font-medium text-red-600">表 {index + 1}</span>
                <span className="text-neutral-300">|</span>
                <span>{caption}</span>
              </span>
            </figcaption>
          </div>
        )}

        {/* 注释 */}
        {note && (
          <div className="px-5 py-3 bg-amber-50/50 border-t border-neutral-200">
            <p className="text-[12px] text-neutral-500 leading-relaxed">
              <span className="text-amber-600 font-medium">注：</span>
              {note}
            </p>
          </div>
        )}
      </div>

      {/* 深度分析 */}
      {analysis && analysis.length > 0 && (
        <div className="mt-5 space-y-3">
          {analysis.map((item, aIndex) => (
            <motion.div
              key={aIndex}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + aIndex * 0.1 }}
              className="text-[14px] text-neutral-600 leading-relaxed pl-4 border-l-3 border-red-300 bg-red-50/30 py-2 pr-3 rounded-r-lg"
            >
              {renderCell(item)}
            </motion.div>
          ))}
        </div>
      )}
    </motion.figure>
  );
};

// 渲染单元格内容（处理LaTeX公式）
function renderCell(text: string): React.ReactNode {
  if (!text) return null;
  
  // 处理行内公式 \( ... \) 和 $...$
  const parts = text.split(/(\$[^$]+\$|\\\([^)]+\\\))/g);

  return parts.map((part, index) => {
    // 匹配 \( ... \) 格式
    if (part.startsWith('\\(') && part.endsWith('\\)')) {
      const formula = part.slice(2, -2);
      return <InlineFormula key={index} latex={formula} />;
    }
    // 匹配 $...$ 格式
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const formula = part.slice(1, -1);
      return <InlineFormula key={index} latex={formula} />;
    }
    return <span key={index}>{part}</span>;
  });
}
