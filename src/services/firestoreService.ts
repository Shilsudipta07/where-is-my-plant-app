import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, auth, testFirestoreConnection } from './firebase';
import { Plant } from '../types/plant';
import { getCurrentUid } from './authService';
import { isWebsiteOwnerUid } from '../config/owner';

// Firestore collection name for plant observations
export const PLANTS_COLLECTION = 'plants';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Standardized Firestore error handler providing structured error diagnostics.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('[FirestoreService] Firestore Notice:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates Firestore database connectivity.
 */
export async function checkFirestoreConnection() {
  return testFirestoreConnection();
}

/**
 * Converts a Firestore document snapshot into a Plant domain model.
 */
function mapDocToPlant(docSnap: QueryDocumentSnapshot<DocumentData>): Plant {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    commonName: data.commonName || '',
    scientificName: data.scientificName || '',
    family: data.family || '',
    genus: data.genus || undefined,
    category: data.category || 'Wildflower',
    habitat: data.habitat || '',
    bloomSeason: data.bloomSeason || '',
    sunExposure: data.sunExposure || 'Full Sun',
    waterNeeds: data.waterNeeds || 'Moderate',
    difficulty: data.difficulty || 'Beginner',
    studentTip: data.studentTip || '',
    description: data.description || '',
    identificationKeys: data.identificationKeys || {
      leafShape: '',
      leafArrangement: '',
      flowerColor: '',
      growthHabit: '',
    },
    imageUrl: data.imageUrl || '',
    locationName: data.locationName || '',
    coordinates: data.coordinates || { lat: 0, lng: 0 },
    locationSource: data.locationSource || undefined,
    demoLocationDescription: data.demoLocationDescription || '',
    sightedCount: data.sightedCount || 1,
    isUserAdded: true,
    ownerUid: data.ownerUid || undefined,
    ownerUsername: data.ownerUsername || undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Fetches all plant records from Firestore.
 */
export async function getPlantsFromFirestore(): Promise<Plant[]> {
  const path = PLANTS_COLLECTION;
  try {
    const plantsRef = collection(db, PLANTS_COLLECTION);
    const q = query(plantsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q).catch(async () => {
      // Fallback query without orderBy if index is not yet built
      return await getDocs(plantsRef);
    });

    return snapshot.docs.map(mapDocToPlant);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Fetches a single plant by its Firestore document ID.
 */
export async function getPlantByIdFromFirestore(id: string): Promise<Plant | null> {
  const path = `${PLANTS_COLLECTION}/${id}`;
  try {
    const docRef = doc(db, PLANTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return mapDocToPlant(docSnap as QueryDocumentSnapshot<DocumentData>);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Adds a new plant record to the Firestore collection with ownerUid and server timestamp.
 */
export async function addPlantToFirestore(
  plantData: Omit<Plant, 'id'>,
  explicitOwnerUid?: string
): Promise<string> {
  const path = PLANTS_COLLECTION;
  const ownerUid = explicitOwnerUid || auth.currentUser?.uid || getCurrentUid();

  if (!plantData.commonName?.trim()) {
    throw new Error('Validation failed: commonName is required.');
  }
  if (!plantData.locationName?.trim()) {
    throw new Error('Validation failed: locationName is required.');
  }
  if (
    !plantData.coordinates ||
    typeof plantData.coordinates.lat !== 'number' ||
    typeof plantData.coordinates.lng !== 'number' ||
    isNaN(plantData.coordinates.lat) ||
    isNaN(plantData.coordinates.lng) ||
    plantData.coordinates.lat < -90 ||
    plantData.coordinates.lat > 90 ||
    plantData.coordinates.lng < -180 ||
    plantData.coordinates.lng > 180
  ) {
    throw new Error('Validation failed: Valid latitude (-90 to 90) and longitude (-180 to 180) are required.');
  }
  if (!ownerUid) {
    throw new Error('Authentication required: A valid user UID is required to save observation.');
  }

  try {
    const plantsRef = collection(db, PLANTS_COLLECTION);
    const docRef = await addDoc(plantsRef, {
      ...plantData,
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

/**
 * Updates an existing user-submitted plant in Firestore.
 * Verifies that the updating user is the owner of the document or the website owner.
 */
export async function updatePlantInFirestore(
  plantId: string,
  updatedData: Partial<Omit<Plant, 'id' | 'ownerUid' | 'createdAt'>>,
  userUid?: string
): Promise<void> {
  const path = `${PLANTS_COLLECTION}/${plantId}`;
  const currentUid = userUid || auth.currentUser?.uid || getCurrentUid();

  if (!plantId) {
    throw new Error('Plant ID is required for update.');
  }

  if (!currentUid) {
    throw new Error('Authentication required: You must be authenticated to edit an observation.');
  }

  try {
    const docRef = doc(db, PLANTS_COLLECTION, plantId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      throw new Error('Plant observation record not found in database.');
    }

    const data = snapshot.data();
    const isOwner = data.ownerUid && data.ownerUid === currentUid;
    const isFounder = isWebsiteOwnerUid(currentUid);

    if (!isOwner && !isFounder) {
      throw new Error('Unauthorized: You can only edit plant observations that you uploaded, unless you are the website owner.');
    }

    const cleanUpdate: Record<string, any> = {
      ...updatedData,
      updatedAt: serverTimestamp(),
    };

    // Strict guard: Never allow changing ownerUid, id, or createdAt through the edit form
    delete cleanUpdate.id;
    delete cleanUpdate.ownerUid;
    delete cleanUpdate.createdAt;

    // Remove any undefined values
    Object.keys(cleanUpdate).forEach((key) => {
      if (cleanUpdate[key] === undefined) {
        delete cleanUpdate[key];
      }
    });

    await updateDoc(docRef, cleanUpdate);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

/**
 * Securely deletes a user-submitted plant from Firestore.
 * Verifies that the deleting user is the owner of the document or the website owner.
 */
export async function deletePlantFromFirestore(
  plantId: string,
  userUid?: string
): Promise<void> {
  const path = `${PLANTS_COLLECTION}/${plantId}`;
  const currentUid = userUid || auth.currentUser?.uid || getCurrentUid();

  if (!plantId) {
    throw new Error('Plant ID is required for deletion.');
  }

  if (!currentUid) {
    throw new Error('Authentication required: You must be authenticated to delete an observation.');
  }

  try {
    const docRef = doc(db, PLANTS_COLLECTION, plantId);

    // Fetch the document first to verify ownership client-side before attempting deletion
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      throw new Error('Plant observation record not found in database.');
    }

    const data = snapshot.data();
    const isOwner = data.ownerUid && data.ownerUid === currentUid;
    const isFounder = isWebsiteOwnerUid(currentUid);

    if (!isOwner && !isFounder) {
      throw new Error('Unauthorized: You can only delete plant observations that you uploaded, unless you are the website owner.');
    }

    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

/**
 * Fetches all plant records submitted by a specific user UID.
 */
export async function getUserPlantsFromFirestore(ownerUid: string): Promise<Plant[]> {
  const path = PLANTS_COLLECTION;
  try {
    const allPlants = await getPlantsFromFirestore();
    return allPlants.filter((p) => p.ownerUid === ownerUid);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Subscribes to real-time updates for plants from Firestore.
 */
export function subscribeToPlants(
  onUpdate: (plants: Plant[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const plantsRef = collection(db, PLANTS_COLLECTION);

  return onSnapshot(
    plantsRef,
    (snapshot) => {
      const plants = snapshot.docs.map(mapDocToPlant);
      onUpdate(plants);
    },
    (error) => {
      console.warn('[FirestoreService] Real-time subscription notice:', error);
      if (onError) onError(error);
    }
  );
}
