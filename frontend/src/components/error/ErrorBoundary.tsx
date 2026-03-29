/**
 * ErrorBoundary - 鲁棒的错误边界组件
 *
 * 功能：
 * 1. 捕获子组件渲染错误
 * 2. 提供优雅的降级展示
 * 3. 支持错误恢复（重试）
 * 4. 错误上报（可扩展）
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';

// ============ 类型 ============

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 降级组件，渲染失败时显示 */
  fallback?: ReactNode;
  /** 自定义错误页面渲染函数 */
  renderError?: (error: Error, errorInfo: ErrorInfo, retry: () => void) => ReactNode;
  /** 错误回调 */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** 组件名称（用于错误上报） */
  name?: string;
  /** 是否显示重试按钮 */
  showRetry?: boolean;
  /** 自定义重试逻辑 */
  onRetry?: () => void;
  /** 是否阻止错误冒泡 */
  quiet?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

// ============ 主组件 ============

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, name } = this.props;

    this.setState({ errorInfo });

    // 错误回调
    onError?.(error, errorInfo);

    // 记录到控制台
    const prefix = name ? `[ErrorBoundary: ${name}]` : '[ErrorBoundary]';
    console.error(`${prefix} 渲染错误:`, error);
    console.error(`${prefix} 组件堆栈:`, errorInfo.componentStack);

    // 发送到错误上报服务（可扩展）
    this.reportError(error, errorInfo);
  }

  private reportError(error: Error, errorInfo: ErrorInfo): void {
    // 扩展点：可以接入 Sentry、LogRocket 等服务
    // 这里暂时只记录到控制台
    const report = {
      timestamp: new Date().toISOString(),
      name: this.props.name || 'Unknown',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: typeof window !== 'undefined' ? window.location.href : '',
    };

    // 存储到 sessionStorage，方便调试
    try {
      const existing = JSON.parse(sessionStorage.getItem('error_reports') || '[]');
      existing.push(report);
      sessionStorage.setItem('error_reports', JSON.stringify(existing.slice(-20))); // 保留最近 20 条
    } catch {
      // 忽略
    }
  }

  handleRetry = (): void => {
    this.setState(prev => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));

    // 调用自定义重试逻辑
    this.props.onRetry?.();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  handleGoBack = (): void => {
    window.history.back();
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // 1. 自定义错误渲染
      if (this.props.renderError) {
        return this.props.renderError(
          this.state.error,
          this.state.errorInfo!,
          this.handleRetry
        );
      }

      // 2. 自定义降级组件
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 3. 默认错误页面
      return <DefaultErrorPage error={this.state.error} onRetry={this.handleRetry} onGoHome={this.handleGoHome} onGoBack={this.handleGoBack} showRetry={this.props.showRetry ?? true} />;
    }

    return this.props.children;
  }
}

// ============ 默认错误页面 ============

interface DefaultErrorPageProps {
  error: Error;
  onRetry: () => void;
  onGoHome: () => void;
  onGoBack: () => void;
  showRetry: boolean;
}

const DefaultErrorPage: React.FC<DefaultErrorPageProps> = ({
  error,
  onRetry,
  onGoHome,
  onGoBack,
  showRetry,
}) => {
  // 根据错误类型选择展示
  const isNetworkError = error.message.includes('fetch') || error.message.includes('network');
  const isChunkError = error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk');

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* 错误图标 */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        {/* 错误标题 */}
        <h1 className="text-xl font-semibold text-neutral-900 mb-2">
          {isChunkError ? '页面版本已更新' : isNetworkError ? '网络连接异常' : '内容加载失败'}
        </h1>

        {/* 错误描述 */}
        <p className="text-sm text-neutral-500 mb-6">
          {isChunkError
            ? '检测到页面有新版本，请刷新页面获取最新内容。'
            : isNetworkError
              ? '无法连接到服务器，请检查网络后重试。'
              : '页面渲染过程中发生了意外错误。'}
        </p>

        {/* 错误详情（仅开发环境） */}
        {import.meta.env.DEV && (
          <details className="mb-6 text-left">
            <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600 mb-2">
              错误详情
            </summary>
            <pre className="text-xs text-red-500 bg-red-50 rounded-lg p-3 overflow-auto max-h-40">
              {error.message}
              {'\n\n'}
              {error.stack?.slice(0, 500)}
            </pre>
          </details>
        )}

        {/* 操作按钮 */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isChunkError ? (
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新页面
            </button>
          ) : (
            <>
              {showRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  重试
                </button>
              )}
              <button
                onClick={onGoBack}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-100 text-neutral-700 text-sm font-medium rounded-full hover:bg-neutral-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </button>
              <button
                onClick={onGoHome}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-neutral-500 text-sm font-medium rounded-full hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <Home className="w-4 h-4" />
                首页
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ 轻量级 Fallback 组件 ============

interface InlineFallbackProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * 内联降级组件 - 用于局部区域错误展示
 * 例：时间线某一块加载失败，只显示一个降级占位
 */
export const InlineFallback: React.FC<InlineFallbackProps> = ({
  message = '内容加载失败',
  onRetry,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-8 px-4 text-center ${className}`}>
      <AlertTriangle className="w-6 h-6 text-neutral-300 mb-2" />
      <p className="text-sm text-neutral-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-xs text-neutral-500 hover:text-neutral-700 underline underline-offset-2"
        >
          重试
        </button>
      )}
    </div>
  );
};

/**
 * 骨架屏降级 - 加载状态展示
 */
export const SkeletonFallback: React.FC<{ className?: string; lines?: number }> = ({
  className = '',
  lines = 3,
}) => {
  // 使用确定性宽度避免每次渲染闪烁
  const widths = [75, 100, 85, 90, 70, 95, 80, 65, 88, 92];
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      <div className="h-6 bg-neutral-100 rounded-lg w-3/4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-neutral-100 rounded"
          style={{ width: `${widths[i % widths.length]}%` }}
        />
      ))}
    </div>
  );
};

export default ErrorBoundary;
