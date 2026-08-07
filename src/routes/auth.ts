import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middlewares/auth';
import { env } from '../config/env';

const router = Router();

/**
 * GET /api/auth/me
 * Returns currently authenticated user context (protected)
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

/**
 * POST /api/auth/token
 * Generate a JWT token for testing/authentication
 */
router.post('/token', (req: Request, res: Response) => {
  const { uid, email, name } = req.body;

  if (!uid) {
    res.status(400).json({
      success: false,
      error: { message: 'Missing required field: uid' },
    });
    return;
  }

  const token = jwt.sign(
    { uid, email: email || 'user@medicodocs.local', name: name || 'MedicoDocs User' },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(200).json({
    success: true,
    token,
    user: { uid, email, name },
  });
});

export default router;
