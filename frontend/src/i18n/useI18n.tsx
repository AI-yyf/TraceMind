/* eslint-disable react-refresh/only-export-components */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { apiGet } from '@/utils/api'
import {
  APP_STATE_STORAGE_KEYS,
  readLocalStorageJson,
  writeLocalStorageJson,
} from '@/utils/appStateStorage'
import { clearLanguageSensitiveAppState } from '@/utils/bootstrapStorage'
import { assertGenerationRuntimeConfigContract } from '@/utils/contracts'
import { getBilingualTranslation, getTranslation } from './translations'
import type { DisplayMode, LanguageCode, LanguagePreference } from './types'
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  SUPPORTED_LANGUAGES,
  getLanguageMetadata,
  isLanguageSupported,
} from './types'

const LANGUAGE_PREFERENCE_STORAGE_KEY = APP_STATE_STORAGE_KEYS.languagePreference

function resolveNavigatorPrimaryLanguage(): LanguageCode | null {
  if (typeof navigator === 'undefined') return null

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase())

  for (const candidate of candidates) {
    const normalized = candidate.split('-')[0]
    if (normalized && isLanguageSupported(normalized)) {
      return normalized
    }
  }

  return null
}

function loadPreferenceFromStorage(): LanguagePreference {
  const parsed = readLocalStorageJson<Partial<LanguagePreference>>(LANGUAGE_PREFERENCE_STORAGE_KEY)

  const primary =
    typeof parsed?.primary === 'string' && isLanguageSupported(parsed.primary)
      ? parsed.primary
      : null

  if (primary) {
    const secondary =
      typeof parsed?.secondary === 'string' && isLanguageSupported(parsed.secondary)
        ? parsed.secondary
        : 'en'

    return {
      primary,
      secondary,
      mode: parsed?.mode === 'bilingual' ? 'bilingual' : 'monolingual',
    }
  }

  const navigatorPrimary = resolveNavigatorPrimaryLanguage()
  if (navigatorPrimary) {
    return {
      primary: navigatorPrimary,
      secondary: resolveFallbackSecondaryLanguage(navigatorPrimary),
      mode: DEFAULT_LANGUAGE_PREFERENCE.mode,
    }
  }

  return DEFAULT_LANGUAGE_PREFERENCE
}

function savePreferenceToStorage(preference: LanguagePreference): void {
  writeLocalStorageJson(LANGUAGE_PREFERENCE_STORAGE_KEY, preference)
}

function preferencesEqual(left: LanguagePreference, right: LanguagePreference) {
  return (
    left.primary === right.primary &&
    left.secondary === right.secondary &&
    left.mode === right.mode
  )
}

function resolveFallbackSecondaryLanguage(primary: LanguageCode) {
  return primary === 'zh' ? 'en' : 'zh'
}

async function fetchBackendDefaultLanguage(): Promise<LanguageCode | null> {
  try {
    const response = await apiGet<unknown>('/api/prompt-templates/runtime')
    assertGenerationRuntimeConfigContract(response)
    if (response && isLanguageSupported(response.defaultLanguage)) {
      return response.defaultLanguage
    }
  } catch {
    // Ignore backend sync failures and keep the local default.
  }

  return null
}

interface I18nContextValue {
  preference: LanguagePreference
  contentEpoch: number
  setPrimaryLanguage: (lang: LanguageCode) => void
  setSecondaryLanguage: (lang: LanguageCode) => void
  setDisplayMode: (mode: DisplayMode) => void
  toggleLanguage: () => void
  t: (key: string, fallback?: string) => string
  tb: (key: string) => { primary: string; secondary: string }
  primaryLanguage: ReturnType<typeof getLanguageMetadata>
  secondaryLanguage: ReturnType<typeof getLanguageMetadata>
  supportedLanguages: typeof SUPPORTED_LANGUAGES
  isInitialized: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<LanguagePreference>(loadPreferenceFromStorage)
  const preferenceRef = useRef(preference)
  const [contentEpoch, setContentEpoch] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    preferenceRef.current = preference
  }, [preference])

  useEffect(() => {
    const stored = readLocalStorageJson<Partial<LanguagePreference>>(
      LANGUAGE_PREFERENCE_STORAGE_KEY,
    )

    if (
      typeof stored?.primary === 'string' &&
      isLanguageSupported(stored.primary)
    ) {
      setIsInitialized(true)
      return
    }

    if (resolveNavigatorPrimaryLanguage()) {
      setIsInitialized(true)
      return
    }

    fetchBackendDefaultLanguage().then((backendLanguage) => {
      if (backendLanguage) {
        setPreference((prev) => {
          const next = { ...prev, primary: backendLanguage }
          preferenceRef.current = next
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

  const applyPreferenceUpdate = useCallback(
    (
      buildNext: (current: LanguagePreference) => LanguagePreference,
      options?: { resetContent?: boolean },
    ) => {
      const current = preferenceRef.current
      const next = buildNext(current)

      if (preferencesEqual(current, next)) return

      if (options?.resetContent ?? true) {
        clearLanguageSensitiveAppState()
      }

      preferenceRef.current = next
      savePreferenceToStorage(next)
      setPreference(next)
      setContentEpoch((currentEpoch) => currentEpoch + 1)
    },
    [],
  )

  const setPrimaryLanguage = useCallback((lang: LanguageCode) => {
    applyPreferenceUpdate((current) => {
      const next: LanguagePreference = {
        ...current,
        primary: lang,
      }

      if (!current.secondary || current.secondary === lang) {
        next.secondary = resolveFallbackSecondaryLanguage(lang)
      }

      return next
    })
  }, [applyPreferenceUpdate])

  const setSecondaryLanguage = useCallback((lang: LanguageCode) => {
    applyPreferenceUpdate((current) => ({ ...current, secondary: lang }))
  }, [applyPreferenceUpdate])

  const setDisplayMode = useCallback((mode: DisplayMode) => {
    applyPreferenceUpdate((current) => {
      const next: LanguagePreference = { ...current, mode }

      if (
        mode === 'bilingual' &&
        (!current.secondary || current.secondary === current.primary)
      ) {
        next.secondary = resolveFallbackSecondaryLanguage(current.primary)
      }

      return next
    })
  }, [applyPreferenceUpdate])

  const toggleLanguage = useCallback(() => {
    applyPreferenceUpdate((current) => {
      return {
        ...current,
        primary: current.primary === 'zh' ? 'en' : 'zh',
        secondary: current.secondary === 'zh' ? 'en' : 'zh',
      }
    })
  }, [applyPreferenceUpdate])

  const t = useCallback(
    (key: string, fallback?: string): string =>
      getTranslation(key, preference.primary, fallback),
    [preference.primary],
  )

  const tb = useCallback(
    (key: string): { primary: string; secondary: string } =>
      getBilingualTranslation(key, preference.primary, preference.secondary || 'en'),
    [preference.primary, preference.secondary],
  )

  const primaryLanguage = useMemo(
    () => getLanguageMetadata(preference.primary),
    [preference.primary],
  )

  const secondaryLanguage = useMemo(
    () => getLanguageMetadata(preference.secondary || 'en'),
    [preference.secondary],
  )

  const value = useMemo(
    () => ({
      preference,
      contentEpoch,
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
      contentEpoch,
      setPrimaryLanguage,
      setSecondaryLanguage,
      setDisplayMode,
      toggleLanguage,
      t,
      tb,
      primaryLanguage,
      secondaryLanguage,
      isInitialized,
    ],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }

  return context
}

export function useTranslation() {
  const { t, tb, preference } = useI18n()
  return { t, tb, isBilingual: preference.mode === 'bilingual' }
}
