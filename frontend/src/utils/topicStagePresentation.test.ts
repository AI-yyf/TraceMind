import { describe, expect, it } from 'vitest'

import {
  pickStageBadgeLabel,
  isMechanicalStageTitle,
  pickStageChronologyLabel,
  pickStageNarrativeTitle,
} from './topicStagePresentation'

describe('topicStagePresentation', () => {
  it('detects generic stage titles across common localized forms', () => {
    expect(isMechanicalStageTitle('Stage 3')).toBe(true)
    expect(isMechanicalStageTitle('阶段 2')).toBe(true)
    expect(isMechanicalStageTitle('第 4 阶段')).toBe(true)
    expect(isMechanicalStageTitle('Étape 5')).toBe(true)
    expect(isMechanicalStageTitle('단계 6')).toBe(true)
  })

  it('keeps editorial stage titles visible', () => {
    expect(isMechanicalStageTitle('收束期')).toBe(false)
    expect(isMechanicalStageTitle('Signal Consolidation')).toBe(false)
  })

  it('prefers concrete chronology labels over generic stage numbering', () => {
    expect(
      pickStageChronologyLabel({
        dateLabel: '04.04',
        timeLabel: 'Apr 4',
        yearLabel: '2026',
      }),
    ).toBe('04.04')

    expect(
      pickStageChronologyLabel({
        timeLabel: 'Apr 4',
        yearLabel: '2026',
      }),
    ).toBe('Apr 4')

    expect(
      pickStageChronologyLabel({
        yearLabel: '2026',
      }),
    ).toBe('2026')
  })

  it('keeps only narrative stage titles visible when they add judgment', () => {
    expect(pickStageNarrativeTitle('Signal Consolidation')).toBe('Signal Consolidation')
    expect(pickStageNarrativeTitle('Stage 2')).toBe('')
    expect(pickStageNarrativeTitle('第 2 阶段')).toBe('')
  })

  it('prefers chronology, then narrative titles, before falling back to numbering', () => {
    expect(
      pickStageBadgeLabel({
        title: 'Signal Consolidation',
        dateLabel: '04.04',
        fallbackLabel: 'Stage 2',
      }),
    ).toBe('04.04')

    expect(
      pickStageBadgeLabel({
        title: 'Signal Consolidation',
        fallbackLabel: 'Stage 2',
      }),
    ).toBe('Signal Consolidation')

    expect(
      pickStageBadgeLabel({
        title: 'Stage 2',
        fallbackLabel: 'Stage 2',
      }),
    ).toBe('Stage 2')
  })
})
