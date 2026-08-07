import mongoose from 'mongoose';
import dns from 'dns';
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
 * Explicitly targets the exact database name 'MedicoDocs' (case-sensitive).
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

  // 2. Initiate connection promise if not already in-flight
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      dbName: 'MedicoDocs', // Target exact case-sensitive database name: MedicoDocs
    };

    cached.promise = mongoose
      .connect(mongoUri, opts)
      .then((m) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Database] Connected successfully to db '${m.connection.name}' on host: ${m.connection.host}`);
        }
        return m;
      })
      .catch(async (err) => {
        // Fallback DNS handling if Node c-ares DNS resolver returns ECONNREFUSED on querySrv
        if (err && (err.code === 'ECONNREFUSED' || String(err.message).includes('querySrv ECONNREFUSED'))) {
          try {
            dns.setServers(['8.8.8.8', '1.1.1.1']);
            const fallbackConn = await mongoose.connect(mongoUri, opts);
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Database] Connected successfully with DNS fallback to db '${fallbackConn.connection.name}' on host: ${fallbackConn.connection.host}`);
            }
            return fallbackConn;
          } catch (fallbackErr) {
            cached.promise = null;
            throw fallbackErr;
          }
        }
        cached.promise = null;
        throw err;
      });
  }

  // 3. Await in-flight promise
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}
