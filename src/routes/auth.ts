import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';
import { User } from '../models/User';

const router = Router();

/**
 * POST /api/auth/sync
 * Synchronizes verified Firebase authenticated identity with backend MongoDB User record
 */
router.post('/sync', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const firebaseUid = req.user!.uid;
    const email = req.user!.email || '';
    const { displayName, photoURL, provider } = req.body;

    let user = await User.findOne({ firebaseUid });

    if (!user) {
      user = new User({
        firebaseUid,
        email,
        displayName: displayName || req.user!.name || '',
        photoURL: photoURL || '',
        provider: provider || 'password',
      });
      await user.save();
    } else {
      let updated = false;
      if (email && user.email !== email) {
        user.email = email;
        updated = true;
      }
      if (displayName && user.displayName !== displayName) {
        user.displayName = displayName;
        updated = true;
      }
      if (photoURL && user.photoURL !== photoURL) {
        user.photoURL = photoURL;
        updated = true;
      }
      if (provider && user.provider !== provider) {
        user.provider = provider;
        updated = true;
      }
      if (updated) {
        await user.save();
      }
    }

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: user.provider,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Error synchronizing user:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to synchronize authenticated user.' },
    });
  }
});

/**
 * GET /api/auth/me
 * Returns currently authenticated user context from MongoDB
 */
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const firebaseUid = req.user!.uid;
    let user = await User.findOne({ firebaseUid });

    if (!user) {
      user = new User({
        firebaseUid,
        email: req.user!.email || '',
        displayName: req.user!.name || '',
        photoURL: '',
        provider: 'firebase',
      });
      await user.save();
    }

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: user.provider,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Error fetching user profile:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch authenticated user profile.' },
    });
  }
});

export default router;
