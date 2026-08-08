import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';
import { MedicalRecord } from '../models/MedicalRecord';
import { answerMedicalQuestion } from '../services/assistantService';

const router = Router();

// All assistant routes require valid authentication
router.use(requireAuth);

const MAX_MESSAGE_LENGTH = 2000;

/**
 * POST /api/assistant/chat
 * AI Medical Assistant — answers questions grounded ONLY in the authenticated
 * user's own stored MedicalRecord documents. No chat history is persisted;
 * context is re-fetched and re-assembled from MongoDB on every request.
 */
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({
        success: false,
        error: { message: 'A non-empty message is required.' },
      });
      return;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({
        success: false,
        error: { message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` },
      });
      return;
    }

    // Scoped strictly to the authenticated user — identical isolation pattern to /api/records.
    const records = await MedicalRecord.find({ userId }).sort({ effectiveDate: -1, createdAt: -1 }).lean();

    const result = await answerMedicalQuestion(message.trim(), records);

    res.json({
      success: true,
      data: {
        answer: result.answer,
        recordCount: result.recordsAvailable,
        recordsConsidered: result.recordsConsidered,
      },
    });
  } catch (error: any) {
    console.error('Assistant chat route error:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to get a response from the AI Assistant.' },
    });
  }
});

export default router;
