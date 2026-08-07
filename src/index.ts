import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { connectDB } from './config/db';
import { initFirebaseAdmin } from './config/firebaseAdmin';
import { errorHandler } from './middlewares/errorHandler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import recordsRouter from './routes/records';

const app: Express = express();

// Initialize Firebase Admin SDK
try {
  initFirebaseAdmin();
} catch (err: any) {
  console.warn('Firebase Admin init warning:', err.message || err);
}

// Ensure MongoDB connection is ready for incoming requests
app.use(async (req, res, next) => {
  try {
    if (env.MONGO_URI) {
      await connectDB();
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Security middleware
app.use(helmet());

// CORS configuration (configured strictly per environment)
const allowedOrigins = (env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        const isPreview = origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app');
        if (isPreview) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked request from origin: ${origin}`));
        }
      }
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests, please try again later.' } },
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/records', recordsRouter);

// Centralized error handling
app.use(errorHandler);

// Guard app.listen for serverless compatibility
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const PORT = Number(env.PORT) || 5000;
  app.listen(PORT, () => {
    console.log(`[MedicoDocs Backend] Running on http://localhost:${PORT}`);
  });
}

export default app;
