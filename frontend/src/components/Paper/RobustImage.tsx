/**
 * RobustImage — 鲁棒的论文图片渲染组件
 *
 * 降级链：
 *   1. 主路径加载
 *   2. 路径变体尝试（.png → .jpg → .pdf-fallback-cover.png）
 *   3. 加载中骨架屏
 *   4. 加载失败：显示占位 + "下载 PDF 查看" 链接
 *   5. 错误上报（静默）
 */

import React, { useState, useCallback, useRef } from 'react';
import { ImageOff, Download, ZoomIn, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RobustImageProps {
  src: string;
  alt?: string;
  paperId?: string;
  pdfUrl?: string;
  className?: string;
  containerClassName?: string;
  onClick?: () => void;
  showZoom?: boolean;
}

const FALLBACK_SUFFIXES = [
  '',                     // 原始路径
  '.jpg',                 // 尝试 jpg
  '.jpeg',                // 尝试 jpeg
  '-hs.png',              // 高清变体
  '.png',                 // 尝试 png
  '-crop.png',            // 裁剪变体
  '/pdf-fallback-cover.png',  // PDF 降级封面
];

/**
 * 从 src 路径推断 paperId（取路径中的 ID 部分）
 */
function inferPaperId(src: string): string {
  const match = src.match(/\/papers\/([\d.]+)\//);
  return match ? match[1] : '';
}

export const RobustImage: React.FC<RobustImageProps> = ({
  src,
  alt = '',
  paperId,
  pdfUrl,
  className = 'max-w-full max-h-[450px] lg:max-h-[550px] object-contain',
  containerClassName = '',
  onClick,
  showZoom = true,
}) => {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [triedPaths, setTriedPaths] = useState<Set<string>>(new Set());
  const [currentSrc, setCurrentSrc] = useState(src);
  const imgRef = useRef<HTMLImageElement>(null);
  const retryIndex = useRef(0);

  const effectivePaperId = paperId || inferPaperId(src);
  const effectivePdfUrl = pdfUrl || (effectivePaperId ? `https://arxiv.org/pdf/${effectivePaperId}` : '');

  // 构建候选路径列表
  const buildCandidates = useCallback((basePath: string): string[] => {
    // basePath 如 "/papers/1604.07316/cnn-architecture.png"
    const lastDot = basePath.lastIndexOf('.');
    if (lastDot === -1) return [basePath];

    const base = basePath.substring(0, lastDot);
    const ext = basePath.substring(lastDot);
    const candidates: string[] = [basePath];

    // 不同扩展名
    for (const newExt of FALLBACK_SUFFIXES.filter((suffix) => ['.png', '.jpg', '.jpeg'].includes(suffix))) {
      if (newExt !== ext) candidates.push(base + newExt);
    }

    // 常见变体后缀
    const baseNoExt = basePath.substring(0, lastDot);
    for (const suffix of ['-hs', '-crop', '_new', '_hs']) {
      candidates.push(`${baseNoExt}${suffix}${ext}`)
      candidates.push(`${baseNoExt}${suffix}.png`)
      candidates.push(`${baseNoExt}${suffix}.jpg`)
    }

    // PDF fallback
    const paperDir = basePath.substring(0, basePath.lastIndexOf('/'));
    candidates.push(`${paperDir}/pdf-fallback-cover.png`);

    return candidates;
  }, []);

  const handleError = useCallback(() => {
    if (triedPaths.has(currentSrc)) return;

    triedPaths.add(currentSrc);
    retryIndex.current++;

    // 尝试下一个候选路径
    const candidates = buildCandidates(src);
    const nextIndex = retryIndex.current;

    if (nextIndex < candidates.length) {
      const nextSrc = candidates[nextIndex];
      if (!triedPaths.has(nextSrc)) {
        setCurrentSrc(nextSrc);
        return;
      }
    }

    // 所有候选都失败
    setLoadState('error');
  }, [currentSrc, triedPaths, src, buildCandidates]);

  const handleLoad = useCallback(() => {
    setLoadState('loaded');
  }, []);

  return (
    <div className={`relative ${containerClassName}`}>
      {/* 加载中骨架屏 */}
      {loadState === 'loading' && (
        <div className="animate-pulse bg-gradient-to-br from-neutral-100 to-neutral-50 rounded-lg flex items-center justify-center min-h-[250px] lg:min-h-[350px]">
          <div className="flex flex-col items-center gap-3 text-neutral-300">
            <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-sm">图片加载中...</span>
          </div>
        </div>
      )}

      {/* 加载成功 */}
      {loadState === 'loaded' && (
        <div className="relative group">
          <img
            ref={imgRef}
            src={currentSrc}
            alt={alt}
            className={`${className} transition-transform duration-300 group-hover:scale-[1.02]`}
            loading="lazy"
          />
          {showZoom && onClick && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 flex items-center justify-center cursor-pointer" onClick={onClick}>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
                <ZoomIn className="w-4 h-4 text-neutral-600" />
                <span className="text-sm text-neutral-600">点击放大</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 加载失败降级 */}
      {loadState === 'error' && (
        <div className="flex flex-col items-center justify-center min-h-[250px] lg:min-h-[350px] bg-gradient-to-br from-neutral-50 to-neutral-100/50 rounded-lg border border-dashed border-neutral-200">
          <ImageOff className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-400 mb-1">图片无法加载</p>
          <p className="text-xs text-neutral-300 mb-4 break-all max-w-xs text-center">{currentSrc.split('/').pop()}</p>

          {/* 降级选项 */}
          <div className="flex flex-col sm:flex-row gap-2">
            {effectivePdfUrl && (
              <a
                href={effectivePdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm rounded-lg transition-colors border border-red-100"
              >
                <Download className="w-4 h-4" />
                下载 PDF 查看
              </a>
            )}
            <button
              onClick={() => {
                setLoadState('loading');
                retryIndex.current = 0;
                setTriedPaths(new Set());
                setCurrentSrc(src);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-500 text-sm rounded-lg transition-colors border border-neutral-200"
            >
              重试加载
            </button>
          </div>
        </div>
      )}

      {/* 隐藏的预加载图（用于路径变体尝试） */}
      {loadState === 'loading' && (
        <img
          src={currentSrc}
          alt=""
          className="hidden"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
};

// ============ 图片放大模态框 ============

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  caption?: string;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ isOpen, onClose, src, caption }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10"
            onClick={onClose}
          >
            <X className="w-6 h-6" />
          </motion.button>

          <motion.img
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            src={src}
            alt={caption || '放大视图'}
            className="max-w-[95vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
            onError={() => {
              // 降级：直接打开 PDF
              const paperId = inferPaperId(src);
              if (paperId) {
                window.open(`https://arxiv.org/pdf/${paperId}`, '_blank');
              }
            }}
          />

          {caption && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md rounded-full px-6 py-3 text-white text-sm max-w-[80vw] text-center"
            >
              {caption}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
