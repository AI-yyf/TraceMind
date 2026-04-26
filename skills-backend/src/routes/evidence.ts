import { Router } from 'express'

import { AppError, asyncHandler } from '../middleware/errorHandler'
import { getEvidenceByAnchorId } from '../services/topics/alpha-topic'
import { assertEvidencePayloadContract } from '../services/topics/topic-contracts'

const router = Router()

function enforceRouteContract<T>(
  value: T,
  validator: (payload: unknown) => void,
  context: string,
) {
  try {
    validator(value)
    return value
  } catch (error) {
    throw new AppError(
      500,
      `${context} ${error instanceof Error ? error.message : 'Unknown contract validation failure.'}`,
    )
  }
}

router.get(
  '/:anchorId',
  asyncHandler(async (req, res) => {
    const evidence = enforceRouteContract(
      await getEvidenceByAnchorId(req.params.anchorId),
      assertEvidencePayloadContract,
      'Evidence payload contract drifted before reaching the client.',
    )
    res.json({ success: true, data: evidence })
  }),
)

export default router
