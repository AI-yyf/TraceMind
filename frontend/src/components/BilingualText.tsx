import React from 'react'
import { useI18n } from '@/i18n'

interface BilingualTextProps {
  /** 主要语言内容 */
  primary: string
  /** 次要语言内容（可选） */
  secondary?: string
  /** 自定义样式类名 */
  className?: string
  /** 是否强制显示双语（即使内容相同） */
  forceBilingual?: boolean
  /** 主次内容之间的分隔符 */
  separator?: React.ReactNode
  /** 主次内容的布局方向 */
  layout?: 'stack' | 'inline' | 'side-by-side'
  /** 主次内容的大小比例 */
  sizeRatio?: 'normal' | 'emphasize-primary' | 'equal'
}

/**
 * 双语文本显示组件
 * 
 * 根据用户语言偏好自动决定显示方式：
 * - 单语模式：只显示主要语言
 * - 双语模式：同时显示主次语言
 * 
 * 使用示例：
 * ```tsx
 * <BilingualText
 *   primary={topic.nameZh}
 *   secondary={topic.nameEn}
 *   layout="stack"
 * />
 * ```
 */
export function BilingualText({
  primary,
  secondary,
  className = '',
  forceBilingual = false,
  separator,
  layout = 'stack',
  sizeRatio = 'emphasize-primary',
}: BilingualTextProps) {
  const { preference } = useI18n()
  const isBilingual = preference.mode === 'bilingual'

  // 如果没有次要内容，或者主次相同，只显示主要语言
  if (!secondary || (primary === secondary && !forceBilingual)) {
    return <span className={className}>{primary}</span>
  }

  // 单语模式只显示主要语言
  if (!isBilingual) {
    return <span className={className}>{primary}</span>
  }

  // 双语显示
  const sizeClasses = {
    'normal': {
      primary: 'text-base',
      secondary: 'text-sm text-black/50',
    },
    'emphasize-primary': {
      primary: 'text-base font-medium',
      secondary: 'text-xs text-black/45',
    },
    'equal': {
      primary: 'text-sm',
      secondary: 'text-sm text-black/50',
    },
  }

  const defaultSeparator = (
    <span className="mx-1 text-black/30" aria-hidden="true">/</span>
  )

  if (layout === 'inline') {
    return (
      <span className={className}>
        <span className={sizeClasses[sizeRatio].primary}>{primary}</span>
        {separator ?? defaultSeparator}
        <span className={sizeClasses[sizeRatio].secondary}>{secondary}</span>
      </span>
    )
  }

  if (layout === 'side-by-side') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span className={sizeClasses[sizeRatio].primary}>{primary}</span>
        <span className={sizeClasses[sizeRatio].secondary}>{secondary}</span>
      </span>
    )
  }

  // 默认 stack 布局
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className={sizeClasses[sizeRatio].primary}>{primary}</span>
      <span className={sizeClasses[sizeRatio].secondary}>{secondary}</span>
    </span>
  )
}

/**
 * 智能双语文本组件
 * 
 * 自动根据当前语言偏好选择显示内容
 * 如果当前是中文用户，primary 显示中文，secondary 显示英文
 * 如果当前是英文用户，primary 显示英文，secondary 显示中文
 */
interface SmartBilingualTextProps {
  /** 中文内容 */
  zh: string
  /** 英文内容 */
  en: string
  /** 其他语言内容（可选） */
  ja?: string
  ko?: string
  de?: string
  fr?: string
  es?: string
  ru?: string
  className?: string
  layout?: 'stack' | 'inline' | 'side-by-side'
  sizeRatio?: 'normal' | 'emphasize-primary' | 'equal'
}

export function SmartBilingualText({
  zh,
  en,
  ja,
  ko,
  de,
  fr,
  es,
  ru,
  className = '',
  layout = 'stack',
  sizeRatio = 'emphasize-primary',
}: SmartBilingualTextProps) {
  const { preference } = useI18n()
  
  const contents: Record<string, string | undefined> = { zh, en, ja, ko, de, fr, es, ru }
  
  // 获取主要语言内容
  const primary = contents[preference.primary] || zh || en
  
  // 获取次要语言内容（双语模式下）
  const secondary = preference.mode === 'bilingual' 
    ? (contents[preference.secondary || 'en'] || en || zh)
    : undefined

  return (
    <BilingualText
      primary={primary}
      secondary={secondary}
      className={className}
      layout={layout}
      sizeRatio={sizeRatio}
    />
  )
}

/**
 * 双语标题组件
 * 
 * 用于页面标题、卡片标题等重要文本
 */
interface BilingualHeadingProps extends BilingualTextProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6
}

export function BilingualHeading({
  level = 2,
  sizeRatio = 'emphasize-primary',
  ...props
}: BilingualHeadingProps) {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements
  
  return (
    <Tag className="m-0">
      <BilingualText {...props} sizeRatio={sizeRatio} />
    </Tag>
  )
}

export default BilingualText
