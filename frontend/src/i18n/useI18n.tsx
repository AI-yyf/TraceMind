/* eslint-disable react-refresh/only-export-components */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'

import type { LanguageCode, LanguagePreference, DisplayMode } from './types'
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  SUPPORTED_LANGUAGES,
  getLanguageMetadata,
  isLanguageSupported,
} from './types'
import { getBilingualTranslation, getTranslation } from './translations'
import { apiGet } from '@/utils/api'

// 本地存储键
const STORAGE_KEY = 'arxiv-chronicle-language-preference'

// 读取本地存储的语言偏好
function loadPreferenceFromStorage(): LanguagePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (isLanguageSupported(parsed.primary)) {
        return {
          primary: parsed.primary,
          secondary: parsed.secondary && isLanguageSupported(parsed.secondary) ? parsed.secondary : 'en',
          mode: parsed.mode === 'bilingual' ? 'bilingual' : 'monolingual',
        }
      }
    }
  } catch {
    // 忽略存储错误
  }
  return DEFAULT_LANGUAGE_PREFERENCE
}

// 保存语言偏好到本地存储
function savePreferenceToStorage(preference: LanguagePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // 忽略存储错误
  }
}

// 后端运行时配置类型
interface GenerationRuntimeConfig {
  defaultLanguage: LanguageCode
}

// 获取后端默认语言配置
async function fetchBackendDefaultLanguage(): Promise<LanguageCode | null> {
  try {
    const response = await apiGet<GenerationRuntimeConfig>('/api/prompt-templates/runtime')
    if (response && isLanguageSupported(response.defaultLanguage)) {
      return response.defaultLanguage
    }
  } catch {
    // 如果 API 调用失败，返回 null 使用本地默认值
  }
  return null
}

// I18n Context 类型
interface I18nContextValue {
  // 当前语言偏好
  preference: LanguagePreference
  // 设置主要语言
  setPrimaryLanguage: (lang: LanguageCode) => void
  // 设置次要语言
  setSecondaryLanguage: (lang: LanguageCode) => void
  // 设置显示模式
  setDisplayMode: (mode: DisplayMode) => void
  // 切换语言
  toggleLanguage: () => void
  // 获取翻译
  t: (key: string, fallback?: string) => string
  // 获取双语翻译
  tb: (key: string) => { primary: string; secondary: string }
  // 获取当前语言元数据
  primaryLanguage: ReturnType<typeof getLanguageMetadata>
  secondaryLanguage: ReturnType<typeof getLanguageMetadata>
  // 支持的语言列表
  supportedLanguages: typeof SUPPORTED_LANGUAGES
  // 是否已完成初始化（包括后端语言同步）
  isInitialized: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

// I18n Provider
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<LanguagePreference>(loadPreferenceFromStorage)
  const [isInitialized, setIsInitialized] = useState(false)

  // 初始化时同步后端默认语言配置
  useEffect(() => {
    // 只有在本地没有存储偏好时，才从后端同步
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setIsInitialized(true)
      return
    }

    fetchBackendDefaultLanguage().then((backendLanguage) => {
      if (backendLanguage) {
        setPreference((prev) => {
          const next = { ...prev, primary: backendLanguage }
          savePreferenceToStorage(next)
          return next
        })
      }
      setIsInitialized(true)
    })
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = preference.primary
    document.documentElement.dataset.language = preference.primary
    document.documentElement.dataset.displayMode = preference.mode
  }, [preference.mode, preference.primary])

  const setPrimaryLanguage = useCallback((lang: LanguageCode) => {
    setPreference((prev) => {
      const next = { ...prev, primary: lang }
      savePreferenceToStorage(next)
      return next
    })
  }, [])

  const setSecondaryLanguage = useCallback((lang: LanguageCode) => {
    setPreference((prev) => {
      const next = { ...prev, secondary: lang }
      savePreferenceToStorage(next)
      return next
    })
  }, [])

  const setDisplayMode = useCallback((mode: DisplayMode) => {
    setPreference((prev) => {
      const next = { ...prev, mode }
      savePreferenceToStorage(next)
      return next
    })
  }, [])

  const toggleLanguage = useCallback(() => {
    setPreference((prev) => {
      const next: LanguagePreference = {
        ...prev,
        primary: prev.primary === 'zh' ? 'en' : 'zh',
        secondary: prev.secondary === 'zh' ? 'en' : 'zh',
      }
      savePreferenceToStorage(next)
      return next
    })
  }, [])

  const t = useCallback(
    (key: string, fallback?: string): string => {
      return getTranslation(key, preference.primary, fallback)
    },
    [preference.primary]
  )

  const tb = useCallback(
    (key: string): { primary: string; secondary: string } => {
      return getBilingualTranslation(key, preference.primary, preference.secondary || 'en')
    },
    [preference.primary, preference.secondary]
  )

  const primaryLanguage = useMemo(
    () => getLanguageMetadata(preference.primary),
    [preference.primary]
  )

  const secondaryLanguage = useMemo(
    () => getLanguageMetadata(preference.secondary || 'en'),
    [preference.secondary]
  )

  const value = useMemo(
    () => ({
      preference,
      setPrimaryLanguage,
      setSecondaryLanguage,
      setDisplayMode,
      toggleLanguage,
      t,
      tb,
      primaryLanguage,
      secondaryLanguage,
      supportedLanguages: SUPPORTED_LANGUAGES,
      isInitialized,
    }),
    [
      preference,
      setPrimaryLanguage,
      setSecondaryLanguage,
      setDisplayMode,
      toggleLanguage,
      t,
      tb,
      primaryLanguage,
      secondaryLanguage,
      isInitialized,
    ]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// useI18n Hook
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

// 便捷 Hook：仅获取翻译函数
export function useTranslation() {
  const { t, tb, preference } = useI18n()
  return { t, tb, isBilingual: preference.mode === 'bilingual' }
}
