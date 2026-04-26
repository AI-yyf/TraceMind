// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import {
  APP_STATE_STORAGE_KEYS,
  LEGACY_APP_STATE_STORAGE_KEYS,
  getTopicSearchRecentStorageKey,
  getTrackerStorageKey,
} from './appStateStorage'
import { clearLanguageSensitiveAppState, resetPersistedAppStateOnce } from './bootstrapStorage'

const RESET_MARKER_KEY = 'tracemind-storage-reset'

describe('bootstrapStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('keeps retired legacy storage keys out of the active app state surface', () => {
    expect(APP_STATE_STORAGE_KEYS).not.toHaveProperty('legacyTopicRegistry')
    expect(APP_STATE_STORAGE_KEYS).not.toHaveProperty('legacyWorkbenchDrawer')
    expect(LEGACY_APP_STATE_STORAGE_KEYS.topicRegistry).toBe('topic-registry')
    expect(LEGACY_APP_STATE_STORAGE_KEYS.workbenchDrawer).toBe('topic-workbench:drawer-open')
  })

  it('clears language-sensitive state while preserving stable preferences, identity, and saved notes', () => {
    localStorage.setItem(APP_STATE_STORAGE_KEYS.languagePreference, JSON.stringify({ primary: 'en' }))
    localStorage.setItem(APP_STATE_STORAGE_KEYS.languageSwitchExpanded, JSON.stringify(true))
    localStorage.setItem(APP_STATE_STORAGE_KEYS.alphaUserId, 'alpha-user')
    localStorage.setItem(APP_STATE_STORAGE_KEYS.config, JSON.stringify({ theme: 'system' }))
    localStorage.setItem(APP_STATE_STORAGE_KEYS.globalSearchRecent, JSON.stringify(['retrieval']))
    localStorage.setItem(
      getTrackerStorageKey(APP_STATE_STORAGE_KEYS.favoriteExcerpts),
      JSON.stringify(['excerpt-1']),
    )
    localStorage.setItem(LEGACY_APP_STATE_STORAGE_KEYS.workbenchDrawer, '1')
    localStorage.setItem(`${APP_STATE_STORAGE_KEYS.topicChatPrefix}topic-1`, JSON.stringify({ threads: [] }))
    localStorage.setItem(getTopicSearchRecentStorageKey('topic-1'), JSON.stringify(['graph rag']))
    localStorage.setItem(`${APP_STATE_STORAGE_KEYS.trackerPrefix}paper-1`, JSON.stringify({ seen: true }))
    localStorage.setItem('keep-local', '1')

    sessionStorage.setItem(APP_STATE_STORAGE_KEYS.readingWorkspace, JSON.stringify({ open: true }))
    sessionStorage.setItem(APP_STATE_STORAGE_KEYS.errorReports, JSON.stringify([{ id: 'err-1' }]))
    sessionStorage.setItem(APP_STATE_STORAGE_KEYS.topicContextQueue, JSON.stringify([{ topicId: 'topic-1' }]))
    sessionStorage.setItem('keep-session', '1')

    clearLanguageSensitiveAppState()

    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.languagePreference)).toContain('"primary":"en"')
    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.languageSwitchExpanded)).toBe('true')
    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.alphaUserId)).toBe('alpha-user')
    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.config)).toContain('"theme":"system"')
    expect(localStorage.getItem('keep-local')).toBe('1')

    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.globalSearchRecent)).toBeNull()
    expect(
      localStorage.getItem(getTrackerStorageKey(APP_STATE_STORAGE_KEYS.favoriteExcerpts)),
    ).toContain('excerpt-1')
    expect(localStorage.getItem(LEGACY_APP_STATE_STORAGE_KEYS.workbenchDrawer)).toBeNull()
    expect(localStorage.getItem(`${APP_STATE_STORAGE_KEYS.topicChatPrefix}topic-1`)).toBeNull()
    expect(localStorage.getItem(getTopicSearchRecentStorageKey('topic-1'))).toBeNull()
    expect(localStorage.getItem(`${APP_STATE_STORAGE_KEYS.trackerPrefix}paper-1`)).toBeNull()

    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.readingWorkspace)).toBeNull()
    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.errorReports)).toBeNull()
    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.topicContextQueue)).toBeNull()
    expect(sessionStorage.getItem('keep-session')).toBe('1')
  })

  it('applies the bootstrap reset only once and records the reset marker', () => {
    localStorage.setItem(LEGACY_APP_STATE_STORAGE_KEYS.topicRegistry, JSON.stringify({ topics: [] }))
    localStorage.setItem(APP_STATE_STORAGE_KEYS.config, JSON.stringify({ mode: 'legacy' }))
    localStorage.setItem(APP_STATE_STORAGE_KEYS.languagePreference, JSON.stringify({ primary: 'zh' }))
    localStorage.setItem(APP_STATE_STORAGE_KEYS.globalSearchRecent, JSON.stringify(['legacy query']))
    localStorage.setItem(LEGACY_APP_STATE_STORAGE_KEYS.workbenchDrawer, '1')
    localStorage.setItem(getTopicSearchRecentStorageKey('topic-1'), JSON.stringify(['legacy topic query']))
    localStorage.setItem(`${APP_STATE_STORAGE_KEYS.trackerPrefix}paper-1`, JSON.stringify({ seen: true }))
    localStorage.setItem(`${APP_STATE_STORAGE_KEYS.topicChatPrefix}topic-1`, JSON.stringify({ threads: [] }))
    localStorage.setItem(APP_STATE_STORAGE_KEYS.alphaUserId, 'alpha-user')

    sessionStorage.setItem(APP_STATE_STORAGE_KEYS.readingWorkspace, JSON.stringify({ open: true }))
    sessionStorage.setItem(APP_STATE_STORAGE_KEYS.errorReports, JSON.stringify([{ id: 'err-1' }]))
    sessionStorage.setItem(APP_STATE_STORAGE_KEYS.topicContextQueue, JSON.stringify([{ topicId: 'topic-1' }]))
    sessionStorage.setItem('keep-session', '1')

    resetPersistedAppStateOnce()

    expect(localStorage.getItem(RESET_MARKER_KEY)).toBe('2026-04-15-managed-app-state')
    expect(localStorage.getItem(LEGACY_APP_STATE_STORAGE_KEYS.topicRegistry)).toBeNull()
    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.config)).toBeNull()
    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.languagePreference)).toBeNull()
    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.globalSearchRecent)).toBeNull()
    expect(localStorage.getItem(LEGACY_APP_STATE_STORAGE_KEYS.workbenchDrawer)).toBeNull()
    expect(localStorage.getItem(getTopicSearchRecentStorageKey('topic-1'))).toBeNull()
    expect(localStorage.getItem(`${APP_STATE_STORAGE_KEYS.trackerPrefix}paper-1`)).toBeNull()
    expect(localStorage.getItem(`${APP_STATE_STORAGE_KEYS.topicChatPrefix}topic-1`)).not.toBeNull()
    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.alphaUserId)).toBe('alpha-user')

    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.readingWorkspace)).toBeNull()
    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.errorReports)).toBeNull()
    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.topicContextQueue)).toBeNull()
    expect(sessionStorage.getItem('keep-session')).toBe('1')

    localStorage.setItem(APP_STATE_STORAGE_KEYS.config, JSON.stringify({ mode: 'new' }))
    sessionStorage.setItem(APP_STATE_STORAGE_KEYS.readingWorkspace, JSON.stringify({ open: false }))

    resetPersistedAppStateOnce()

    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.config)).toContain('"mode":"new"')
    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.readingWorkspace)).toContain('"open":false')
  })
})
