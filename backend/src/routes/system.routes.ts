import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getAppReleases } from '../services/appReleases.service.js';

const router = Router();
router.get('/releases', authenticate, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getAppReleases(req.query.refresh === '1'));
  } catch (error) { next(error); }
});

export { router as systemRouter };
