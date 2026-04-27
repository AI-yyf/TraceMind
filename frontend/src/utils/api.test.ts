import { describe, expect, it } from 'vitest'

import { normalizeApiBase, buildApiUrl } from './api'

describe('api utils', () => {
  it('normalizes an api base that incorrectly includes /api', () => {
    expect(normalizeApiBase('http://127.0.0.1:3303/api')).toBe('http://127.0.0.1:3303')
    expect(normalizeApiBase('http://127.0.0.1:3303/api/')).toBe('http://127.0.0.1:3303')
  })

  it('never duplicates the /api segment when building request URLs', () => {
    expect(buildApiUrl('/api/topics')).not.toContain('/api/api/')
  })
})
