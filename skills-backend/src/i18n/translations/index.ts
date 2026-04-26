/**
 * Translation registry - exports all translation dictionaries.
 */

import type { TranslationDictionary } from '../index'

import research from './research'
import errors from './errors'
import content from './content'
import extraction from './extraction'

// Export all dictionaries
export { research, errors, content, extraction }

// Combined dictionary for convenience
export const allDictionaries: Record<string, TranslationDictionary> = {
  research,
  errors,
  content,
  extraction,
}

// Initialize function to register all dictionaries
export function initializeAllDictionaries(): void {
  const { initializeI18n } = require('../index')
  initializeI18n(allDictionaries)
}

export default allDictionaries
