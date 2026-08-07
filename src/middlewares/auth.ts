import { Request, Response, NextFunction } from 'express';
import { getAuth } from '../config/firebaseAdmin';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // Development bypass helper if explicitly header-flagged in local dev testing
  if (process.env.NODE_ENV === 'development' && req.headers['x-dev-user-id'] && !authHeader) {
    req.user = {
      uid: String(req.headers['x-dev-user-id']),
      email: String(req.headers['x-dev-user-email'] || 'devuser@medicodocs.local'),
      name: String(req.headers['x-dev-user-name'] || 'Dev User'),
    };
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized: Missing or invalid Bearer token.' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);

    if (!decodedToken || !decodedToken.uid) {
      res.status(401).json({
        success: false,
        error: { message: 'Unauthorized: Invalid token payload missing user ID.' },
      });
      return;
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || '',
    };

    next();
  } catch (error: any) {
    console.error('Firebase token verification error:', error.message || error);
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized: Token verification failed or expired.' },
    });
  }
}
