/* eslint-disable react-refresh/only-export-components */

import React, { createContext, useContext, useMemo } from 'react'
import { useI18n } from './useI18n'
import type { LanguageCode } from './types'

// 双语内容类型定义
export interface BilingualContent {
  /** 主要语言内容 */
  primary: string
  /** 次要语言内容（可选） */
  secondary?: string
  /** 内容来源语言 */
  sourceLanguage?: LanguageCode
}

// 多语言内容包（用于LLM生成内容）
export interface MultilingualContent {
  zh?: string
  en?: string
  ja?: string
  ko?: string
  de?: string
  fr?: string
  es?: string
  ru?: string
}

// 双语显示选项
export interface BilingualDisplayOptions {
  /** 布局方式 */
  layout?: 'stack' | 'inline' | 'side-by-side'
  /** 大小比例 */
  sizeRatio?: 'normal' | 'emphasize-primary' | 'equal'
  /** 分隔符 */
  separator?: React.ReactNode
  /** 是否强制显示双语 */
  forceBilingual?: boolean
}

// 双语上下文
interface BilingualContextValue {
  /** 当前是否双语模式 */
  isBilingual: boolean
  /** 主要语言 */
  primaryLanguage: LanguageCode
  /** 次要语言 */
  secondaryLanguage: LanguageCode
  /** 将多语言内容转换为双语显示格式 */
  toBilingual: (content: MultilingualContent) => BilingualContent
  /** 获取最佳匹配内容 */
  getBestMatch: (content: MultilingualContent) => string
}

const BilingualContext = createContext<BilingualContextValue | null>(null)

/**
 * 双语内容提供者
 * 
 * 为子组件提供双语显示能力
 */
export function BilingualProvider({ children }: { children: React.ReactNode }) {
  const { preference } = useI18n()

  const value = useMemo((): BilingualContextValue => {
    const primaryLanguage = preference.primary
    const secondaryLanguage = preference.secondary || 'en'
    const isBilingual = preference.mode === 'bilingual'

    /**
     * 将多语言内容转换为双语显示格式
     */
    const toBilingual = (content: MultilingualContent): BilingualContent => {
      const primary = content[primaryLanguage] || content['zh'] || content['en'] || ''
      const secondary = isBilingual 
        ? (content[secondaryLanguage] || content['en'] || content['zh'])
        : undefined

      return {
        primary,
        secondary,
        sourceLanguage: primaryLanguage,
      }
    }

    /**
     * 获取最佳匹配内容（根据用户偏好）
     */
    const getBestMatch = (content: MultilingualContent): string => {
      // 优先返回主要语言
      if (content[primaryLanguage]) return content[primaryLanguage]!
      
      // fallback 顺序：中文 -> 英文 -> 任意可用语言
      return content['zh'] || content['en'] || Object.values(content)[0] || ''
    }

    return {
      isBilingual,
      primaryLanguage,
      secondaryLanguage,
      toBilingual,
      getBestMatch,
    }
  }, [preference.primary, preference.secondary, preference.mode])

  return (
    <BilingualContext.Provider value={value}>
      {children}
    </BilingualContext.Provider>
  )
}

/**
 * 使用双语上下文
 */
export function useBilingual(): BilingualContextValue {
  const context = useContext(BilingualContext)
  if (!context) {
    throw new Error('useBilingual must be used within a BilingualProvider')
  }
  return context
}

/**
 * 双语文本渲染Hook
 * 
 * 用于将后端返回的多语言内容渲染为双语文本
 */
export function useBilingualText() {
  const { toBilingual, isBilingual } = useBilingual()

  return {
    /**
     * 渲染为多语言内容对象
     */
    render: (content: MultilingualContent) => toBilingual(content),
    
    /**
     * 判断是否显示双语
     */
    isBilingual,
    
    /**
     * 创建双语显示组件props
     */
    createProps: (
      content: MultilingualContent,
      options?: BilingualDisplayOptions
    ) => ({
      primary: toBilingual(content).primary,
      secondary: toBilingual(content).secondary,
      ...options,
    }),
  }
}

/**
 * 主题双语内容Hook
 * 
 * 专门用于处理主题相关的双语内容（支持8种语言）
 */
export function useTopicBilingual() {
  const { toBilingual, getBestMatch } = useBilingual()

  return {
    /**
     * 处理主题名称（支持8种语言）
     */
    name: (topic: { 
      nameZh?: string
      nameEn?: string
      nameJa?: string
      nameKo?: string
      nameDe?: string
      nameFr?: string
      nameEs?: string
      nameRu?: string
    }) => {
      const content: MultilingualContent = {
        zh: topic.nameZh,
        en: topic.nameEn,
        ja: topic.nameJa,
        ko: topic.nameKo,
        de: topic.nameDe,
        fr: topic.nameFr,
        es: topic.nameEs,
        ru: topic.nameRu,
      }
      return toBilingual(content)
    },

    /**
     * 处理主题描述（支持8种语言）
     */
    description: (topic: { 
      descriptionZh?: string
      descriptionEn?: string
      descriptionJa?: string
      descriptionKo?: string
      descriptionDe?: string
      descriptionFr?: string
      descriptionEs?: string
      descriptionRu?: string
    }) => {
      const content: MultilingualContent = {
        zh: topic.descriptionZh,
        en: topic.descriptionEn,
        ja: topic.descriptionJa,
        ko: topic.descriptionKo,
        de: topic.descriptionDe,
        fr: topic.descriptionFr,
        es: topic.descriptionEs,
        ru: topic.descriptionRu,
      }
      return toBilingual(content)
    },

    /**
     * 获取最佳匹配名称（支持8种语言）
     */
    getBestName: (topic: { 
      nameZh?: string
      nameEn?: string
      nameJa?: string
      nameKo?: string
      nameDe?: string
      nameFr?: string
      nameEs?: string
      nameRu?: string
    }) => {
      return getBestMatch({
        zh: topic.nameZh,
        en: topic.nameEn,
        ja: topic.nameJa,
        ko: topic.nameKo,
        de: topic.nameDe,
        fr: topic.nameFr,
        es: topic.nameEs,
        ru: topic.nameRu,
      })
    },
  }
}

export default BilingualProvider
