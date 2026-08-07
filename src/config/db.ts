import mongoose from 'mongoose';
import { env } from './env';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // Ensures global cache persistence across serverless re-invocations & dev HMR
  var mongooseCache: MongooseCache | undefined;
}

let cached = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

/**
 * Connects to MongoDB using a serverless-safe cached connection & in-flight promise pattern.
 * Throws immediately if MONGO_URI environment variable is missing.
 */
export async function connectDB(): Promise<typeof mongoose> {
  const mongoUri = env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('[Database Error] MONGO_URI is missing from environment variables.');
  }

  // 1. Return existing established connection
  if (cached.conn) {
    return cached.conn;
  }

  // 2. If no connection promise is in-flight, initiate a new connection promise
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(mongoUri, opts).then((m) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Database] Connected successfully to host: ${m.connection.host}`);
      }
      return m;
    }).catch((err) => {
      cached.promise = null; // Clear cached promise on error to allow retries
      throw err;
    });
  }

  // 3. Await in-flight promise (handles concurrent invocations cleanly)
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}
