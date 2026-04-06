import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler'
import { getModelCapabilitySummary } from '../services/omni/config-store'

const router = Router()

function resolveRequestUserId(req: { header(name: string): string | undefined }) {
  const candidate = req.header('x-alpha-user-id')?.trim()
  if (!candidate) return undefined
  const normalized = candidate.replace(/[^a-zA-Z0-9:_-]/gu, '').slice(0, 64)
  return normalized || undefined
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const capabilitySummary = await getModelCapabilitySummary(resolveRequestUserId(req))
    res.json({
      success: true,
      data: capabilitySummary,
    })
  }),
)

export default router
