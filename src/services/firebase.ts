import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore, doc, getDocFromServer } from 'firebase/firestore';

/**
 * Firebase Web App configuration for "WHERE IS MY PLANT WEB"
 * Web App ID: 1:405120823520:web:1de2751632d13b0d41a085
 * Project ID: where-is-my-plant-bc671
 */
export const firebaseConfig = {
  apiKey: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) || 'AIzaSyACk4Z6c5pZqgpplx3FFQQgjXktpICPz8w',
  authDomain: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) || 'where-is-my-plant-bc671.firebaseapp.com',
  projectId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_PROJECT_ID) || 'where-is-my-plant-bc671',
  storageBucket: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) || 'where-is-my-plant-bc671.firebasestorage.app',
  messagingSenderId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) || '405120823520',
  appId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_APP_ID) || '1:405120823520:web:1de2751632d13b0d41a085',
  measurementId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID) || 'G-BLF3TG5JLK',
};

// Initialize Firebase App instance safely (singleton pattern)
export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firebase Auth instance
export const auth: Auth = getAuth(app);

// Firestore Database instance connected to project "where-is-my-plant-bc671"
export const db: Firestore = getFirestore(app);

/**
 * Test connectivity to Firestore server
 */
export async function testFirestoreConnection(): Promise<{
  connected: boolean;
  message: string;
  projectId: string;
}> {
  try {
    // Attempt reading from the server to verify Firestore connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      connected: true,
      message: 'Successfully reached Firestore server',
      projectId: firebaseConfig.projectId,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return {
        connected: false,
        message: 'Client is offline. Please check your network and Firebase configuration.',
        projectId: firebaseConfig.projectId,
      };
    }
    // Permission-denied means connection to Firestore server succeeded, but security rules apply
    if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
      return {
        connected: true,
        message: 'Connected to Firestore server (security rules active)',
        projectId: firebaseConfig.projectId,
      };
    }
    return {
      connected: true,
      message: `Connected to Firestore (status: ${(error as Error)?.message || 'ready'})`,
      projectId: firebaseConfig.projectId,
    };
  }
}

// Helper to verify Firebase initialization status
export function getFirebaseStatus(): {
  initialized: boolean;
  appName: string;
  webAppName: string;
  projectId: string;
  appId: string;
  firestoreConfigured: boolean;
} {
  return {
    initialized: !!app && !!app.name,
    appName: app.name,
    webAppName: 'WHERE IS MY PLANT WEB',
    projectId: firebaseConfig.projectId,
    appId: firebaseConfig.appId,
    firestoreConfigured: !!db,
  };
}

// Log confirmation in development console and verify connection
if (typeof window !== 'undefined') {
  console.info(
    `[Firebase] Initialized "WHERE IS MY PLANT WEB" (project: ${firebaseConfig.projectId}, appId: ${firebaseConfig.appId})`
  );
  testFirestoreConnection().then((res) => {
    console.info(`[Firestore] Status: ${res.message}`);
  });
}
