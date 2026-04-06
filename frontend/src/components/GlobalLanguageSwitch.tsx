import { Check, ChevronDown, Languages } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'

const PANEL_STATE_STORAGE_KEY = 'arxiv-chronicle-language-switch-expanded'
const LANGUAGE_PANEL_ID = 'global-language-switch-panel'

function resolveSecondaryLanguage(primary: string) {
  return primary === 'zh' ? 'en' : 'zh'
}

function loadExpandedState() {
  if (typeof window === 'undefined') return false

  try {
    return JSON.parse(window.localStorage.getItem(PANEL_STATE_STORAGE_KEY) ?? 'false') === true
  } catch {
    return false
  }
}

export function GlobalLanguageSwitch() {
  const {
    preference,
    setPrimaryLanguage,
    setSecondaryLanguage,
    setDisplayMode,
    supportedLanguages,
    t,
  } = useI18n()
  const [expanded, setExpanded] = useState(loadExpandedState)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExpanded(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(expanded))
    } catch {
      // Ignore storage write failures.
    }
  }, [expanded])

  const currentLanguage = useMemo(
    () =>
      supportedLanguages.find((item) => item.code === preference.primary) ?? supportedLanguages[0],
    [preference.primary, supportedLanguages],
  )

  function selectLanguage(code: (typeof supportedLanguages)[number]['code']) {
    setPrimaryLanguage(code)
    if (!preference.secondary || preference.secondary === code) {
      setSecondaryLanguage(resolveSecondaryLanguage(code))
    }
    setExpanded(false)
  }

  return (
    <div
      ref={rootRef}
      data-testid="global-language-switch"
      data-state={expanded ? 'expanded' : 'collapsed'}
      className="pointer-events-none fixed left-1/2 z-[125] flex w-[calc(100vw-1.5rem)] max-w-[760px] -translate-x-1/2 justify-center px-2"
      style={{ bottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
    >
      <div
        className={cn(
          'pointer-events-auto border border-black/8 bg-white/94 shadow-[0_18px_42px_rgba(15,23,42,0.12)] backdrop-blur transition-all',
          expanded ? 'w-full rounded-[24px] p-3' : 'w-auto rounded-full p-2',
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              data-testid="language-menu-toggle"
              aria-expanded={expanded}
              aria-controls={LANGUAGE_PANEL_ID}
              onClick={() => setExpanded((current) => !current)}
              className="inline-flex min-w-0 items-center gap-2 rounded-full bg-[var(--surface-soft)] px-3 py-2 text-left transition hover:text-black"
            >
              <Languages className="h-4 w-4 shrink-0 text-black/56" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.14em] text-black/34">
                  {t('language.switchLabel', 'Interface language')}
                </div>
                <div className="truncate text-[12px] font-medium text-black">
                  {currentLanguage.nameLocal}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-black/52 transition',
                  expanded && 'rotate-180',
                )}
              />
            </button>

            {expanded ? (
              <button
                type="button"
                data-testid="language-collapse-button"
                onClick={() => setExpanded(false)}
                className="inline-flex items-center rounded-full border border-black/8 bg-white px-3 py-2 text-[12px] text-black/62 transition hover:text-black"
              >
                {t('common.less', 'Less')}
              </button>
            ) : null}
          </div>

          {expanded ? (
            <div
              id={LANGUAGE_PANEL_ID}
              data-testid="language-panel"
              role="region"
              aria-label={t('language.switchLabel', 'Interface language')}
              className="grid gap-3 border-t border-black/6 pt-3"
            >
              <div className="flex flex-wrap justify-center gap-1.5">
                <button
                  type="button"
                  data-testid="language-quick-zh"
                  onClick={() => selectLanguage('zh')}
                  className={cn(
                    'rounded-full px-3 py-2 text-[12px] font-medium transition',
                    preference.primary === 'zh'
                      ? 'bg-black text-white'
                      : 'bg-[var(--surface-soft)] text-black/66 hover:text-black',
                  )}
                >
                  {t('language.quickChinese', '中文')}
                </button>
                <button
                  type="button"
                  data-testid="language-quick-en"
                  onClick={() => selectLanguage('en')}
                  className={cn(
                    'rounded-full px-3 py-2 text-[12px] font-medium transition',
                    preference.primary === 'en'
                      ? 'bg-black text-white'
                      : 'bg-[var(--surface-soft)] text-black/66 hover:text-black',
                  )}
                >
                  {t('language.quickEnglish', 'English')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {supportedLanguages
                  .filter((language) => language.code !== 'zh' && language.code !== 'en')
                  .map((language) => {
                    const active = language.code === preference.primary
                    return (
                      <button
                        key={language.code}
                        type="button"
                        data-testid={`language-option-${language.code}`}
                        onClick={() => selectLanguage(language.code)}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-[16px] px-3 py-2 text-left text-[12px] transition',
                          active
                            ? 'bg-black text-white'
                            : 'bg-[var(--surface-soft)] text-black/68 hover:text-black',
                        )}
                      >
                        <span className="truncate">{language.nameLocal}</span>
                        {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                      </button>
                    )
                  })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-[var(--surface-soft)] px-3 py-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-black/34">
                    {t('language.modeLabel', 'Display mode')}
                  </div>
                  <div className="text-[12px] text-black/60">
                    {preference.mode === 'bilingual'
                      ? t('language.modeBilingual', 'Bilingual')
                      : t('language.modeMonolingual', 'Monolingual')}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    data-testid="language-mode-monolingual"
                    onClick={() => setDisplayMode('monolingual')}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-[11px] transition',
                      preference.mode === 'monolingual'
                        ? 'bg-black text-white'
                        : 'bg-white text-black/66',
                    )}
                  >
                    {t('language.modeMonolingual', 'Monolingual')}
                  </button>
                  <button
                    type="button"
                    data-testid="language-mode-bilingual"
                    onClick={() => {
                      if (!preference.secondary || preference.secondary === preference.primary) {
                        setSecondaryLanguage(resolveSecondaryLanguage(preference.primary))
                      }
                      setDisplayMode('bilingual')
                    }}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-[11px] transition',
                      preference.mode === 'bilingual'
                        ? 'bg-black text-white'
                        : 'bg-white text-black/66',
                    )}
                  >
                    {t('language.modeBilingual', 'Bilingual')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
