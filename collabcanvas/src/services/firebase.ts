import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, enableNetwork, disableNetwork } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator, goOnline, goOffline } from 'firebase/database';
import type { Database } from 'firebase/database';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Debug: Log the config to see what's being loaded (only in development)
if (import.meta.env.DEV) {
  console.log('Firebase Config:', firebaseConfig);
  console.log('Environment Variables:', {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    useEmulators: import.meta.env.VITE_USE_FIREBASE_EMULATORS
  });
}

// Initialize Firebase app
export const app: FirebaseApp = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth: Auth = getAuth(app);
export const firestore: Firestore = getFirestore(app);
export const rtdb: Database = getDatabase(app);
export const functions: Functions = getFunctions(app, 'us-central1');
export const storage: FirebaseStorage = getStorage(app);

// Export network control functions for offline handling
export const enableFirestoreNetwork = () => enableNetwork(firestore);
export const disableFirestoreNetwork = () => disableNetwork(firestore);
export const enableRTDBNetwork = () => goOnline(rtdb);
export const disableRTDBNetwork = () => goOffline(rtdb);

// Connect to emulators if in development mode
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

if (useEmulators) {
  console.log('🔧 Using Firebase Emulators');
  
  try {
    // Use localhost (not 127.0.0.1) to avoid subtle CORS/origin mismatches in browsers.
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, 'localhost', 8081);
    connectDatabaseEmulator(rtdb, 'localhost', 9000);
    connectFunctionsEmulator(functions, 'localhost', 5001);
    connectStorageEmulator(storage, 'localhost', 9199);
    console.log('✅ Connected to Firebase Emulators');
  } catch (error) {
    console.warn('⚠️ Emulator connection may already be initialized:', error);
  }
}

export default app;

