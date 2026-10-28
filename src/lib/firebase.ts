import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { AppUserProfile, AppPageId, UserRole } from '@/src/types';

// Firebase web configuration is supplied through the local .env file.
function requireFirebaseEnv(name: string): string {
  const value = import.meta.env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`[Firebase Config] Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export const firebaseConfig = {
  projectId: requireFirebaseEnv('VITE_FIREBASE_PROJECT_ID'),
  appId: requireFirebaseEnv('VITE_FIREBASE_APP_ID'),
  apiKey: requireFirebaseEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireFirebaseEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  firestoreDatabaseId: (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)').trim(),
  storageBucket: requireFirebaseEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireFirebaseEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '').trim(),
  recaptchaSiteKey: (import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY || '').trim(),
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID (Critical per skill)
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Authentication
export const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error('[Firebase Auth] Could not configure session persistence:', error);
});
// Enforce explicit Firebase authentication; do not auto-login anonymously
export async function ensureFirebaseAuth(): Promise<void> {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('Authentication is required for this operation.');
  }
}

/**
 * Retrieves the current Firebase ID Token (JWT) to cryptographically attest
 * identity to both Firestore and the Google Apps Script Web App.
 */
export async function getFirebaseIdToken(forceRefresh: boolean = false): Promise<string | null> {
  try {
    if (!auth.currentUser) {
      await ensureFirebaseAuth();
    }
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken(forceRefresh);
    }
  } catch (err) {
    console.warn('[Firebase Auth] Could not retrieve ID token:', err);
  }
  return null;
}

/**
 * Retrieves App Check token if configured.
 */
export async function getAppCheckToken(): Promise<string | null> {
  try {
    // In preview / browser environment, return active App Check token or placeholder header
    const token = (window as any).__WARSA_APP_CHECK_TOKEN__ || null;
    return token;
  } catch {
    return null;
  }
}

// Test connection on boot
export async function testFirestoreConnection() {
  try {
    await ensureFirebaseAuth();
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore: Client appears offline, local cache will be used.");
    }
  }
}
testFirestoreConnection();

/**
 * Sign In with Email and Password
 */
export async function signInWithEmail(email: string, pass: string): Promise<{ user: FirebaseUser; profile: AppUserProfile }> {
  await setPersistence(auth, browserSessionPersistence);
  const result = await signInWithEmailAndPassword(auth, email, pass);
  const fbUser = result.user;
  const profile = await mapFirebaseUserToProfile(fbUser);
  return { user: fbUser, profile };
}

export async function sendFirebasePasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Sign Out from Firebase Auth
 */
export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

/**
 * Maps a Firebase authenticated user to an AppUserProfile.
 * Uses only a trusted Firebase custom role claim. Missing claims are denied.
 */
export async function mapFirebaseUserToProfile(fbUser: FirebaseUser, overrideName?: string): Promise<AppUserProfile> {
  const email = (fbUser.email || '').toLowerCase().trim();
  const tokenClaims = (await fbUser.getIdTokenResult()).claims;
  const roleClaim = tokenClaims.role;
  const validRoles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'ASM', 'ORDER_BOOKER', 'SALESMAN', 'DRIVER', 'WAREHOUSE_MANAGER', 'ACCOUNTS', 'MANAGEMENT'];
  const role: UserRole | null = typeof roleClaim === 'string' && validRoles.includes(roleClaim as UserRole)
    ? roleClaim as UserRole
    : null;
  
  const allPages: AppPageId[] = [
    'dashboard', 
    'dispatch', 
    'reconciliation', 
    'cashSlipBook', 
    'inventory', 
    'sales', 
    'reports', 
    'outlets', 
    'ledger', 
    'orderBookers', 
    'settings'
  ];

  const roleTitle = role === 'SUPER_ADMIN' ? 'Super Administrator / Owner' : role ? role.replaceAll('_', ' ') : 'No access';
  const allowedPages = role === 'SUPER_ADMIN' || role === 'ADMIN' ? allPages : role ? ['dashboard'] as AppPageId[] : [];
  const defaultPage: AppPageId = allowedPages[0] || 'dashboard';

  return {
    id: fbUser.uid,
    name: overrideName || fbUser.displayName || (email ? email.split('@')[0] : 'Authenticated user'),
    role: role || 'UNASSIGNED',
    roleTitle,
    department: 'KFM Beverages (WARSA)',
    description: 'Authenticated via Firebase Auth Suite',
    responsibilities: ['Full system management', 'Cloud database security', 'Financial reconciliations', 'User credential management'],
    avatarColor: 'bg-red-600',
    iconName: 'ShieldCheck',
    allowedPages,
    defaultPage,
    username: email,
    twoFactorEnabled: false,
    email: fbUser.email || undefined
  };
}
