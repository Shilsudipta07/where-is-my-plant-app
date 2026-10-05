/**
 * Authentication Service for WHERE IS MY PLANT
 * 
 * Manages Firebase Authentication for student/community naturalists:
 * - Initializes Anonymous Firebase Authentication by default (no email or password required)
 * - Supports Google Sign-In with Firebase Authentication
 * - Links anonymous guest accounts to Google accounts to preserve uploaded observations
 * - Assigns and tracks unique Firebase UIDs for plant observation ownership
 * - Ensures ownerUid is attached to all Firestore uploads
 * - Synchronizes User Profile documents with unique usernames
 */

import {
  signInAnonymously,
  signInWithPopup,
  linkWithPopup,
  signOut as fbSignOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { auth } from './firebase';
import { UserProfile } from '../types/user';
import { getUserProfile, syncGoogleUserProfile } from './userService';

const LOCAL_ANON_UID_KEY = 'where_is_my_plant_local_uid_v1';

export interface AuthState {
  user: User | null;
  uid: string;
  isAnonymous: boolean;
  isLoading: boolean;
  error: string | null;
  firebaseConnected: boolean;
  profile: UserProfile | null;
}

// Memory cache of current state
let currentAuthState: AuthState = {
  user: null,
  uid: getOrCreateLocalFallbackUid(),
  isAnonymous: true,
  isLoading: true,
  error: null,
  firebaseConnected: false,
  profile: null,
};

const listeners = new Set<(state: AuthState) => void>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn({ ...currentAuthState });
    } catch (e) {
      console.error('[AuthService] Listener notification error:', e);
    }
  });
}

/**
 * Returns a stable local UID as a fallback when client is offline or
 * before anonymous Firebase auth completes.
 */
function getOrCreateLocalFallbackUid(): string {
  if (typeof window === 'undefined') return 'server-botanist';
  try {
    let id = localStorage.getItem(LOCAL_ANON_UID_KEY);
    if (!id) {
      id = `botanist-${Math.random().toString(36).substring(2, 10)}-${Date.now().toString(36)}`;
      localStorage.setItem(LOCAL_ANON_UID_KEY, id);
    }
    return id;
  } catch {
    return 'local-botanist';
  }
}

/**
 * Initializes authentication with Firebase.
 * Restores existing sessions or sets up anonymous authentication.
 */
export async function initAuth(): Promise<AuthState> {
  return new Promise((resolve) => {
    let resolved = false;

    const unsubscribe: Unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        let profile: UserProfile | null = null;
        if (!user.isAnonymous) {
          try {
            profile = await getUserProfile(user.uid);
            if (!profile) {
              profile = await syncGoogleUserProfile(user);
            }
          } catch (e) {
            console.warn('[AuthService] Could not fetch profile on auth state change:', e);
          }
        }

        currentAuthState = {
          user,
          uid: user.uid,
          isAnonymous: user.isAnonymous,
          isLoading: false,
          error: null,
          firebaseConnected: true,
          profile,
        };
        notifyListeners();
        if (!resolved) {
          resolved = true;
          resolve({ ...currentAuthState });
        }
      } else {
        // Attempt anonymous sign in if no session exists
        try {
          const cred = await signInAnonymously(auth);
          currentAuthState = {
            user: cred.user,
            uid: cred.user.uid,
            isAnonymous: cred.user.isAnonymous,
            isLoading: false,
            error: null,
            firebaseConnected: true,
            profile: null,
          };
          notifyListeners();
          if (!resolved) {
            resolved = true;
            resolve({ ...currentAuthState });
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errCode = (err as any)?.code || '';
          console.warn('[AuthService] Anonymous auth initialization warning:', errCode, errMsg);

          const fallbackUid = getOrCreateLocalFallbackUid();
          currentAuthState = {
            user: null,
            uid: fallbackUid,
            isAnonymous: true,
            isLoading: false,
            error: errCode.includes('configuration-not-found')
              ? 'Firebase Anonymous Authentication is not yet enabled in Firebase Console.'
              : errMsg,
            firebaseConnected: false,
            profile: null,
          };
          notifyListeners();
          if (!resolved) {
            resolved = true;
            resolve({ ...currentAuthState });
          }
        }
      }
    });

    // Timeout safety net (3 seconds)
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        currentAuthState = {
          ...currentAuthState,
          isLoading: false,
        };
        notifyListeners();
        resolve({ ...currentAuthState });
      }
    }, 3000);
  });
}

/**
 * Signs in with Google using Firebase Authentication.
 * If the user was currently an anonymous guest, links the credentials so
 * their existing UID and previously uploaded plants are preserved.
 */
export async function signInWithGoogle(): Promise<{ user: User; linked: boolean }> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const currentUser = auth.currentUser;
  let resultUser: User;
  let linked = false;

  try {
    if (currentUser && currentUser.isAnonymous) {
      try {
        // Attempt linking anonymous account to Google account to preserve ownerUid!
        const linkResult = await linkWithPopup(currentUser, provider);
        resultUser = linkResult.user;
        linked = true;
      } catch (linkError: any) {
        // If Google account already exists on a different credential, sign in normally
        if (linkError.code === 'auth/credential-already-in-use' || linkError.code === 'auth/email-already-in-use') {
          const signResult = await signInWithPopup(auth, provider);
          resultUser = signResult.user;
        } else {
          throw linkError;
        }
      }
    } else {
      const signResult = await signInWithPopup(auth, provider);
      resultUser = signResult.user;
    }

    // Sync or create user profile document
    let profile: UserProfile | null = null;
    try {
      profile = await syncGoogleUserProfile(resultUser);
    } catch (profileError) {
      console.warn('[AuthService] Failed to sync profile document:', profileError);
    }

    currentAuthState = {
      user: resultUser,
      uid: resultUser.uid,
      isAnonymous: resultUser.isAnonymous,
      isLoading: false,
      error: null,
      firebaseConnected: true,
      profile,
    };
    notifyListeners();

    return { user: resultUser, linked };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[AuthService] Google Sign-In failed:', err);
    throw err;
  }
}

/**
 * Refreshes the currently loaded user profile document from Firestore.
 */
export async function refreshUserProfile(): Promise<UserProfile | null> {
  const activeUid = auth.currentUser?.uid;
  if (!activeUid || auth.currentUser?.isAnonymous) {
    currentAuthState.profile = null;
    notifyListeners();
    return null;
  }

  try {
    const profile = await getUserProfile(activeUid);
    currentAuthState.profile = profile;
    notifyListeners();
    return profile;
  } catch (err) {
    console.warn('[AuthService] Could not refresh profile:', err);
    return null;
  }
}

/**
 * Signs the user out of their Google account and cleanly transitions back
 * to an anonymous session so they can still browse and submit as a guest.
 */
export async function signOutUser(): Promise<void> {
  try {
    await fbSignOut(auth);
    // Re-sign in anonymously so the application always has a valid session for botanical reads/uploads
    try {
      const anonCred = await signInAnonymously(auth);
      currentAuthState = {
        user: anonCred.user,
        uid: anonCred.user.uid,
        isAnonymous: true,
        isLoading: false,
        error: null,
        firebaseConnected: true,
        profile: null,
      };
      notifyListeners();
    } catch {
      // Fallback if anonymous sign-in fails
      const fallbackUid = getOrCreateLocalFallbackUid();
      currentAuthState = {
        user: null,
        uid: fallbackUid,
        isAnonymous: true,
        isLoading: false,
        error: null,
        firebaseConnected: false,
        profile: null,
      };
      notifyListeners();
    }
  } catch (err) {
    console.error('[AuthService] Sign out error:', err);
    throw err;
  }
}

/**
 * Returns the current authenticated UID or stable local UID.
 */
export function getCurrentUid(): string {
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }
  return currentAuthState.uid || getOrCreateLocalFallbackUid();
}

/**
 * Returns whether current user is authenticated with Firebase.
 */
export function isFirebaseAuthenticated(): boolean {
  return !!auth.currentUser;
}

/**
 * Subscribes to authentication state changes.
 */
export function subscribeToAuth(callback: (state: AuthState) => void): () => void {
  listeners.add(callback);
  callback({ ...currentAuthState });

  return () => {
    listeners.delete(callback);
  };
}

// Auto-boot authentication in browser environment
if (typeof window !== 'undefined') {
  initAuth().catch((err) => {
    console.warn('[AuthService] Boot notice:', err);
  });
}
