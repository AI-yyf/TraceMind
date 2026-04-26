// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { logger } from './logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stays silent in test mode', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logger.error('WebSocket', 'Connection error', new Error('boom'))
    logger.warn('WebSocket', 'Retrying connection')
    logger.info('WebSocket', 'Connected')

    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
  })
})
