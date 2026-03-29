import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface FormulaRendererProps {
  latex: string | string[];
  caption?: string;
  analysis?: string[];
  index?: number;
}

// 公式预处理：处理常见的 LaTeX 兼容性问题
function preprocessLatex(formula: string): string {
  return formula
    // 处理 \mathbf{...} 向量
    .replace(/\\mathbf\{([^}]+)\}/g, '\\vec{$1}')
    // 处理 \boldsymbol{...} 
    .replace(/\\boldsymbol\{([^}]+)\}/g, '\\vec{$1}')
    // 处理 \text{...} 中的特殊字符
    .replace(/\\text\{([^}]*)\}/g, (match, content) => {
      // 保留 text 内容但确保不会破坏 math 环境
      return `\\text{${content}}`;
    })
    // 处理省略号
    .replace(/\\dots/g, '\\ldots')
    .replace(/\\cdots/g, '\\cdots')
    // 处理矩阵环境
    .replace(/\\begin\{bmatrix\}/g, '\\begin{bmatrix}')
    .replace(/\\end\{bmatrix\}/g, '\\end{bmatrix}')
    // 确保括号正确匹配
    .replace(/\\left\(/g, '\\left(')
    .replace(/\\right\)/g, '\\right)')
    .replace(/\\left\[/g, '\\left[')
    .replace(/\\right\]/g, '\\right]')
    .replace(/\\left\{/g, '\\left\\{')
    .replace(/\\right\}/g, '\\right\\}');
}

export const FormulaRenderer: React.FC<FormulaRendererProps> = ({
  latex,
  caption,
  analysis,
  index = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  
  // 处理多行公式
  const formulas = Array.isArray(latex) ? latex : [latex];
  
  // 预处理公式
  const processedFormulas = formulas.map(preprocessLatex);
  
  // 使用 MathJax 渲染公式
  useEffect(() => {
    const renderMath = async () => {
      if (!containerRef.current) return;
      
      // 检查 MathJax 是否可用
      if (!window.MathJax) {
        console.warn('MathJax not loaded yet, waiting...');
        // 等待 MathJax 加载
        const checkMathJax = setInterval(() => {
          if (window.MathJax?.typesetPromise) {
            clearInterval(checkMathJax);
            renderMath();
          }
        }, 100);
        // 5秒后超时
        setTimeout(() => clearInterval(checkMathJax), 5000);
        return;
      }
      
      if (!window.MathJax.typesetPromise) {
        console.warn('MathJax typesetPromise not available');
        return;
      }
      
      try {
        setRenderError(null);
        // 清除之前的渲染
        window.MathJax.typesetClear?.([containerRef.current]);
        // 重新渲染
        await window.MathJax.typesetPromise([containerRef.current]);
      } catch (error) {
        console.warn('MathJax rendering error:', error);
        setRenderError('公式渲染出错，请检查 LaTeX 语法');
      }
    };
    
    // 等待 MathJax 加载完成
    if (window.MathJax?.startup?.promise) {
      window.MathJax.startup.promise.then(renderMath);
    } else {
      renderMath();
    }
  }, [latex]);

  return (
    <motion.figure
      className="my-8 lg:my-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      {/* 公式容器 */}
      <div 
        ref={containerRef}
        className="bg-gradient-to-br from-neutral-50 to-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm"
      >
        <div className="p-6 lg:p-10 flex flex-col items-center justify-center gap-6">
          {processedFormulas.map((formula, fIndex) => (
            <div
              key={fIndex}
              className="text-lg lg:text-xl text-neutral-800 text-center overflow-x-auto max-w-full"
            >
              {/* 使用 display math 模式 */}
              <div className="min-w-fit">
                {'$$' + formula + '$$'}
              </div>
            </div>
          ))}
        </div>

        {/* 标题 */}
        {caption && (
          <div className="px-6 py-4 bg-white border-t border-neutral-100">
            <figcaption className="text-center">
              <span className="inline-flex items-center gap-2 text-[13px] text-neutral-500">
                <span className="font-medium text-red-600">公式 {index + 1}</span>
                <span className="text-neutral-300">|</span>
                <span>{caption}</span>
              </span>
            </figcaption>
          </div>
        )}
        
        {/* 渲染错误提示 */}
        {renderError && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-100">
            <p className="text-sm text-red-600">{renderError}</p>
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
              {item}
            </motion.div>
          ))}
        </div>
      )}
    </motion.figure>
  );
};

// 行内公式组件
export const InlineFormula: React.FC<{ latex: string; className?: string }> = ({ 
  latex, 
  className = '' 
}) => {
  const spanRef = useRef<HTMLSpanElement>(null);
  
  // 预处理公式
  const processedLatex = preprocessLatex(latex);
  
  useEffect(() => {
    const renderMath = async () => {
      if (!spanRef.current) return;
      
      // 检查 MathJax 是否可用
      if (!window.MathJax) {
        const checkMathJax = setInterval(() => {
          if (window.MathJax?.typesetPromise) {
            clearInterval(checkMathJax);
            renderMath();
          }
        }, 100);
        setTimeout(() => clearInterval(checkMathJax), 5000);
        return;
      }
      
      if (!window.MathJax.typesetPromise) return;
      
      try {
        window.MathJax.typesetClear?.([spanRef.current]);
        await window.MathJax.typesetPromise([spanRef.current]);
      } catch (error) {
        console.warn('MathJax inline rendering error:', error);
      }
    };
    
    if (window.MathJax?.startup?.promise) {
      window.MathJax.startup.promise.then(renderMath);
    } else {
      renderMath();
    }
  }, [latex]);
  
  return (
    <span ref={spanRef} className={`math-inline ${className}`}>
      {'$' + processedLatex + '$'}
    </span>
  );
};
