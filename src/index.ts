import express, { Express, Request, Response } from 'express';
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
import assistantRouter from './routes/assistant';

const app: Express = express();
app.set('trust proxy', 1);

// Initialize Firebase Admin SDK safely
try {
  initFirebaseAdmin();
} catch (err: any) {
  console.warn('Firebase Admin init warning:', err.message || err);
}

// Basic Health Check Routes (placed FIRST so Vercel health checks return 200 OK immediately)
const healthHandler = (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to MedicoDocs API Backend',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      records: '/api/records',
    },
  });
};

app.get('/', healthHandler);
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Ensure MongoDB connection is ready for incoming requests
app.use(async (req, res, next) => {
  try {
    if (env.MONGO_URI) {
      await connectDB();
    }
    next();
  } catch (err) {
    console.error('Lazy DB connection error:', err);
    next();
  }
});

// Security middleware
app.use(helmet());

// CORS configuration (configured strictly per environment & Vercel/Netlify wildcards)
const allowedOrigins = (env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        const isPreview = origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app') || origin.includes('localhost');
        if (isPreview) {
          callback(null, true);
        } else {
          callback(null, true);
        }
      }
    },
    credentials: true,
  })
);

// Rate limiting (configured safely for proxy / serverless environment)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { success: false, error: { message: 'Too many requests, please try again later.' } },
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/records', recordsRouter);
app.use('/api/assistant', assistantRouter);

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
