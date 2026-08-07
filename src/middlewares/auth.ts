import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticatedUser } from '../types/express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  // Dev shortcut for testing user-isolation locally in development
  if (process.env.NODE_ENV === 'development' && req.headers['x-dev-user-id']) {
    req.user = {
      uid: String(req.headers['x-dev-user-id']),
      email: String(req.headers['x-dev-user-email'] || 'devuser@medicodocs.local'),
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
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUser;
    
    if (!decoded.uid) {
      res.status(401).json({
        success: false,
        error: { message: 'Unauthorized: Invalid token payload missing user ID.' },
      });
      return;
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized: Token verification failed.' },
    });
  }
}
