import { describe, expect, it } from 'vitest'

import {
  MIN_STAGE_WINDOW_MONTHS,
  normalizeStageWindowMonths,
  readStageWindowSearchParam,
  resolveStageWindowPresets,
} from './stageWindow'

describe('stage window normalization', () => {
  it('clamps sub-month values back to the supported monthly floor', () => {
    expect(MIN_STAGE_WINDOW_MONTHS).toBe(1)
    expect(normalizeStageWindowMonths(0.25)).toBe(1)
    expect(normalizeStageWindowMonths(0.5)).toBe(1)
    expect(normalizeStageWindowMonths(1)).toBe(1)
    expect(normalizeStageWindowMonths(3.9)).toBe(3)
  })

  it('normalizes stageMonths search params before page state trusts them', () => {
    expect(readStageWindowSearchParam(new URLSearchParams('stageMonths=0.5'))).toBe(1)
    expect(readStageWindowSearchParam(new URLSearchParams('stageMonths=6'))).toBe(6)
  })

  it('keeps preset resolution aligned to the supported month-only surface', () => {
    expect(resolveStageWindowPresets(6)).toEqual([1, 3, 6, 12, 24])
  })
})
