import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth as getAdminAuth, Auth } from 'firebase-admin/auth';

let firebaseApp: App | null = null;

export function initFirebaseAdmin(): App {
  if (firebaseApp) return firebaseApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0]!;
    return firebaseApp;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      firebaseApp = initializeApp({
        credential: cert(parsed),
      });
      console.log('[Firebase Admin] Initialized with SERVICE_ACCOUNT_JSON');
      return firebaseApp;
    } catch (err) {
      console.error('[Firebase Admin] Failed to parse SERVICE_ACCOUNT_JSON:', err);
    }
  }

  if (projectId && clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    firebaseApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log('[Firebase Admin] Initialized with cert credentials');
    return firebaseApp;
  }

  if (projectId) {
    firebaseApp = initializeApp({ projectId });
    console.log(`[Firebase Admin] Initialized with projectId: ${projectId}`);
    return firebaseApp;
  }

  firebaseApp = initializeApp();
  console.log('[Firebase Admin] Initialized with default application credentials');
  return firebaseApp;
}

export const getAuth = (): Auth => {
  initFirebaseAdmin();
  return getAdminAuth();
};
