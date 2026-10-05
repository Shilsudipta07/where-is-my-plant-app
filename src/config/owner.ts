/**
 * Website Owner & Founder Permission Configuration
 * Sudipta Shil — Founder & Creator of WHERE IS MY PLANT
 *
 * Security Model:
 * - Identification is strictly based on the website owner's Firebase Authentication UID.
 * - Does NOT use displayName, username, or email for security validation.
 */

// Website Owner's Firebase Authentication UID.
// Can be configured via VITE_WEBSITE_OWNER_UID environment variable,
// or defaults to the website owner's Firebase UID.
export const WEBSITE_OWNER_UID: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WEBSITE_OWNER_UID) ||
  'Ssyb5F9eskReAh6q86HpXtn3bBk1';

/**
 * Checks if a given Firebase Authentication UID belongs to the website owner.
 */
export function isWebsiteOwnerUid(uid?: string | null): boolean {
  if (!uid) return false;
  return uid === WEBSITE_OWNER_UID;
}

/**
 * Determines whether a user with currentUid has permission to edit a plant.
 * - Website owner can edit ANY plant.
 * - Normal user can edit ONLY their own plant (where plant.ownerUid === currentUid).
 * - Unauthorized users cannot edit.
 */
export function canEditPlant(
  plantOwnerUid?: string,
  currentUid?: string | null
): boolean {
  if (!currentUid) return false;
  if (isWebsiteOwnerUid(currentUid)) return true;
  return Boolean(plantOwnerUid && plantOwnerUid === currentUid);
}

/**
 * Determines whether a user with currentUid has permission to delete a plant.
 * - Website owner can delete ANY plant.
 * - Normal user can delete ONLY their own plant (where plant.ownerUid === currentUid).
 * - Unauthorized users cannot delete.
 */
export function canDeletePlant(
  plantOwnerUid?: string,
  currentUid?: string | null
): boolean {
  if (!currentUid) return false;
  if (isWebsiteOwnerUid(currentUid)) return true;
  return Boolean(plantOwnerUid && plantOwnerUid === currentUid);
}
