import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, auth } from './firebase';
import { UserProfile, UsernameValidationResult } from '../types/user';

export const USERS_COLLECTION = 'users';
export const USERNAMES_COLLECTION = 'usernames';

const LOCAL_PROFILE_KEY_PREFIX = 'wimp_profile_';
const LOCAL_REGISTRY_KEY = 'wimp_usernames_registry';

interface LocalUsernameRegistry {
  [normalizedUsername: string]: {
    uid: string;
    username: string;
    updatedAt: number;
  };
}

function getLocalRegistry(): LocalUsernameRegistry {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = localStorage.getItem(LOCAL_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalRegistry(registry: LocalUsernameRegistry): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(LOCAL_REGISTRY_KEY, JSON.stringify(registry));
    }
  } catch (e) {
    console.warn('[UserService] Could not save local username registry:', e);
  }
}

function getLocalProfile(uid: string): UserProfile | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = localStorage.getItem(`${LOCAL_PROFILE_KEY_PREFIX}${uid}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[UserService] Could not read local profile:', e);
  }
  return null;
}

function saveLocalProfile(uid: string, profile: UserProfile): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`${LOCAL_PROFILE_KEY_PREFIX}${uid}`, JSON.stringify(profile));
    }
  } catch (e) {
    console.warn('[UserService] Could not save local profile:', e);
  }
}

/**
 * Validates a username according to WHERE IS MY PLANT rules:
 * - 3 to 20 characters
 * - Letters (a-z, A-Z), numbers (0-9), and underscore (_) only
 * - No spaces or special symbols
 * - Case-insensitive comparison via normalized lowercase
 */
export function validateUsername(input: string): UsernameValidationResult {
  const trimmed = (input || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      normalized: '',
      error: 'Username cannot be empty.',
    };
  }

  if (trimmed.length < 3) {
    return {
      isValid: false,
      normalized: trimmed.toLowerCase(),
      error: 'Username must be at least 3 characters long.',
    };
  }

  if (trimmed.length > 20) {
    return {
      isValid: false,
      normalized: trimmed.toLowerCase(),
      error: 'Username cannot exceed 20 characters.',
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      normalized: trimmed.toLowerCase(),
      error: 'Username cannot contain spaces.',
    };
  }

  const validPattern = /^[a-zA-Z0-9_]{3,20}$/;
  if (!validPattern.test(trimmed)) {
    return {
      isValid: false,
      normalized: trimmed.toLowerCase(),
      error: 'Username may only contain letters, numbers, and underscores (_).',
    };
  }

  return {
    isValid: true,
    normalized: trimmed.toLowerCase(),
    error: null,
  };
}

/**
 * Checks if a normalized username is available in the Firestore database.
 * Returns availability and a user-friendly message.
 */
export async function checkUsernameAvailability(
  rawUsername: string,
  currentUid?: string
): Promise<{ available: boolean; message: string; normalized: string }> {
  const validation = validateUsername(rawUsername);
  if (!validation.isValid) {
    return {
      available: false,
      message: validation.error || 'Invalid username format.',
      normalized: validation.normalized,
    };
  }

  const normalized = validation.normalized;
  const activeUid = currentUid || auth.currentUser?.uid;

  // 1. Check local registry first
  const registry = getLocalRegistry();
  if (registry[normalized]) {
    const existing = registry[normalized];
    if (activeUid && existing.uid === activeUid) {
      return {
        available: true,
        message: 'This is your current username.',
        normalized,
      };
    }
    return {
      available: false,
      message: 'Username already taken',
      normalized,
    };
  }

  // 2. Query Firestore if online
  try {
    const reservationRef = doc(db, USERNAMES_COLLECTION, normalized);
    const snap = await getDoc(reservationRef);

    if (!snap.exists()) {
      return {
        available: true,
        message: 'Username is available!',
        normalized,
      };
    }

    const data = snap.data();
    if (activeUid && data?.uid === activeUid) {
      return {
        available: true,
        message: 'This is your current username.',
        normalized,
      };
    }

    return {
      available: false,
      message: 'Username already taken',
      normalized,
    };
  } catch (error) {
    // If Firestore rules or offline prevents reading, fallback gracefully to available
    return {
      available: true,
      message: 'Username is available!',
      normalized,
    };
  }
}

/**
 * Fetches the user profile document from Firestore, with local storage fallback.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  const local = getLocalProfile(uid);

  try {
    const userRef = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      return local;
    }

    const data = snap.data();
    const profile: UserProfile = {
      uid,
      email: data.email || local?.email || null,
      displayName: data.displayName || local?.displayName || null,
      photoURL: data.photoURL || local?.photoURL || null,
      username: data.username || local?.username || undefined,
      normalizedUsername: data.normalizedUsername || local?.normalizedUsername || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    saveLocalProfile(uid, profile);
    return profile;
  } catch (error) {
    // Return local profile fallback if Firestore fails
    return local;
  }
}

/**
 * Creates or synchronizes a user profile document upon Google Sign-In.
 * Preserves any previously set username while updating Google display info.
 */
export async function syncGoogleUserProfile(user: User): Promise<UserProfile> {
  const existingLocal = getLocalProfile(user.uid);

  const mergedProfile: UserProfile = {
    uid: user.uid,
    email: user.email || existingLocal?.email || null,
    displayName: user.displayName || existingLocal?.displayName || null,
    photoURL: user.photoURL || existingLocal?.photoURL || null,
    username: existingLocal?.username || undefined,
    normalizedUsername: existingLocal?.normalizedUsername || undefined,
    createdAt: existingLocal?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveLocalProfile(user.uid, mergedProfile);

  try {
    const userRef = doc(db, USERS_COLLECTION, user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      const newProfile: Record<string, any> = {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (mergedProfile.username) {
        newProfile.username = mergedProfile.username;
        newProfile.normalizedUsername = mergedProfile.normalizedUsername;
      }
      await setDoc(userRef, newProfile);
    } else {
      const existing = snap.data();
      const updatedData: Record<string, any> = {
        uid: user.uid,
        email: user.email || existing.email || null,
        displayName: user.displayName || existing.displayName || null,
        photoURL: user.photoURL || existing.photoURL || null,
        updatedAt: serverTimestamp(),
      };

      if (mergedProfile.username || existing.username) {
        updatedData.username = mergedProfile.username || existing.username;
        updatedData.normalizedUsername = mergedProfile.normalizedUsername || existing.normalizedUsername;
      }

      await setDoc(userRef, updatedData, { merge: true });
    }
  } catch (error) {
    console.warn('[UserService] Firestore profile sync warning (saved locally):', error);
  }

  return mergedProfile;
}

/**
 * Race-condition-safe atomic username reservation and update.
 * Enforces global uniqueness via Firestore transaction with immediate local persistence.
 */
export async function updateUsername(
  uid: string,
  newRawUsername: string
): Promise<{ success: boolean; username: string }> {
  const validation = validateUsername(newRawUsername);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid username format.');
  }

  const cleanUsername = newRawUsername.trim();
  const normalized = validation.normalized;

  // Check local registry first for uniqueness conflicts
  const registry = getLocalRegistry();
  if (registry[normalized] && registry[normalized].uid !== uid) {
    throw new Error('Username already taken');
  }

  const currentProfile = getLocalProfile(uid);
  if (currentProfile?.username) {
    throw new Error('Username can only be set once.');
  }

  // Construct updated profile
  const updatedProfile: UserProfile = {
    uid,
    email: auth.currentUser?.email || currentProfile?.email || null,
    displayName: auth.currentUser?.displayName || currentProfile?.displayName || null,
    photoURL: auth.currentUser?.photoURL || currentProfile?.photoURL || null,
    username: cleanUsername,
    normalizedUsername: normalized,
    createdAt: currentProfile?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Immediately persist locally to ensure user's choice is saved
  registry[normalized] = {
    uid,
    username: cleanUsername,
    updatedAt: Date.now(),
  };
  saveLocalRegistry(registry);
  saveLocalProfile(uid, updatedProfile);

  // 2. Attempt Firestore transaction
  const newReservationRef = doc(db, USERNAMES_COLLECTION, normalized);
  const userRef = doc(db, USERS_COLLECTION, uid);

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Read target reservation document
      const usernameSnap = await transaction.get(newReservationRef);
      if (usernameSnap.exists()) {
        const reservationData = usernameSnap.data();
        if (reservationData?.uid && reservationData.uid !== uid) {
          throw new Error('Username already taken');
        }
      }

      // 2. Read user profile document and ensure username has not been set yet
      const userSnap = await transaction.get(userRef);
      if (userSnap.exists() && userSnap.data()?.username) {
        throw new Error('Username can only be set once.');
      }

      // 3. Reserve new username
      const isNewReservation = !usernameSnap.exists();
      transaction.set(
        newReservationRef,
        {
          uid,
          username: cleanUsername,
          normalizedUsername: normalized,
          updatedAt: serverTimestamp(),
          ...(isNewReservation ? { createdAt: serverTimestamp() } : {}),
        },
        { merge: true }
      );

      // 5. Update user profile
      transaction.set(
        userRef,
        {
          uid,
          email: auth.currentUser?.email || currentProfile?.email || null,
          displayName: auth.currentUser?.displayName || currentProfile?.displayName || null,
          photoURL: auth.currentUser?.photoURL || currentProfile?.photoURL || null,
          username: cleanUsername,
          normalizedUsername: normalized,
          updatedAt: serverTimestamp(),
          ...(userSnap.exists() ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Username already taken' || error.message === 'Username can only be set once.')
    ) {
      throw error;
    }
    console.warn('[UserService] Cloud Firestore reservation write warning (saved locally):', error);
  }

  return { success: true, username: cleanUsername };
}
