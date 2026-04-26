import { describe, expect, it } from 'vitest'

import { SUPPORTED_LANGUAGES } from '../types'
import { QUALITY_MAINFLOW_TRANSLATION_KEYS } from './quality-mainflow'
import { QUALITY_LONGTAIL_TRANSLATION_KEYS } from './quality-longtail'
import { QUALITY_TRANSLATION_KEYS } from './quality'
import { getTranslation, looksCorruptedTranslation } from './index'

describe('translation registry', () => {
  it('resolves clean main-path translations for every supported language', () => {
    const supportedLanguages = SUPPORTED_LANGUAGES.map((language) => language.code)

    for (const key of [
      ...QUALITY_TRANSLATION_KEYS,
      ...QUALITY_MAINFLOW_TRANSLATION_KEYS,
      ...QUALITY_LONGTAIL_TRANSLATION_KEYS,
    ]) {
      for (const language of supportedLanguages) {
        const value = getTranslation(key, language, key)
        expect(value, `${key} missing ${language}`).toBeTruthy()
        expect(value.trim(), `${key} empty ${language}`).not.toBe('')
        expect(looksCorruptedTranslation(value), `${key} corrupted ${language}`).toBe(false)
      }
    }
  })

  it('falls back away from mojibake for non-primary locales', () => {
    expect(looksCorruptedTranslation(getTranslation('language.switchLabel', 'ko'))).toBe(false)
    expect(looksCorruptedTranslation(getTranslation('studio.currentConfigLabel', 'ja'))).toBe(false)
  })

  it('serves curated Chinese copy on the core user path', () => {
    expect(getTranslation('brand.title', 'zh')).toBe('溯知')
    expect(getTranslation('brand.subtitle', 'zh')).toBe('AI 研究工作台')
    expect(getTranslation('home.create', 'zh')).toBe('创建主题')
    expect(getTranslation('init.title', 'zh')).toBe('系统初始化')
    expect(getTranslation('workbench.guidanceReceiptTitle', 'zh')).toBe('建议回执')
    expect(getTranslation('research.title', 'zh')).toBe('全局研究编排')
    expect(getTranslation('search.title', 'zh')).toBe('全局搜索')
    expect(getTranslation('studio.models.rolesTitle', 'zh')).toBe('研究角色')
  })

  it('exposes clean native language names', () => {
    const languageNames = Object.fromEntries(
      SUPPORTED_LANGUAGES.map((language) => [language.code, language.nameLocal]),
    )

    expect(languageNames.zh).toBe('中文')
    expect(languageNames.ja).toBe('日本語')
    expect(languageNames.ko).toBe('한국어')
    expect(languageNames.fr).toBe('Français')
    expect(languageNames.es).toBe('Español')
    expect(languageNames.ru).toBe('Русский')
  })

  it('overrides node and workbench labels with clean Chinese copy', () => {
    expect(getTranslation('node.backTopic', 'zh')).toBe('返回主题')
    expect(getTranslation('node.evidenceBoardEyebrow', 'zh')).toBe('证据面板')
    expect(getTranslation('workbench.tabResearch', 'zh')).toBe('研究')
    expect(getTranslation('node.workbenchFocus', 'zh')).toBe('聚焦')
    expect(getTranslation('node.evidenceTypeFormula', 'zh')).toBe('公式')
    expect(getTranslation('topic.workbenchResearchViewEvidence', 'zh')).toBe('证据')
  })
})
