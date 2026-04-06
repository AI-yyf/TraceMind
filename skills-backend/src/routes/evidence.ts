import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler'
import { getEvidenceByAnchorId } from '../services/topics/alpha-topic'

const router = Router()

router.get(
  '/:anchorId',
  asyncHandler(async (req, res) => {
    const evidence = await getEvidenceByAnchorId(req.params.anchorId)
    res.json({ success: true, data: evidence })
  }),
)

export default router
