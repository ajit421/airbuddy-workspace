/**
 * permissionService.js
 * Admin-granted permissions on users/{uid}.permissions.
 *
 * The keys come from src/utils/permissionCatalog.js. firestore.rules lets
 * only admins write these fields (they are in the self-update deny list), and
 * enforces each key with its own can(key) helper.
 */

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { z } from 'zod';
import { PERMISSION_KEYS } from '../utils/permissionCatalog';

// Every catalog key, each a boolean, nothing else. Writing the complete map
// (rather than merging) means a box the admin unticks really is removed, and
// keys that have since left the catalog are dropped on the next save.
const PermissionsSchema = z
  .object(Object.fromEntries(PERMISSION_KEYS.map((k) => [k, z.boolean()])))
  .strict();

/**
 * Turns any selection into the complete stored shape: each catalog key
 * present, `true` only if it was literally `true`, unknown keys dropped.
 *
 * @param {Object<string, boolean>|undefined} selection
 * @returns {Object<string, boolean>}
 */
export function normalizePermissions(selection) {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, selection?.[k] === true]));
}

/**
 * Replaces a user's permissions. Admin-only — the rules reject anyone else.
 *
 * @param {string} uid            - users/{uid} to update
 * @param {Object<string, boolean>} selection - { '<key>': true } for each granted key
 * @param {string} adminUid       - effectiveUid of the admin making the change
 * @returns {Promise<void>}
 */
export async function updateUserPermissions(uid, selection, adminUid) {
  try {
    if (!uid) throw new Error('uid is required');
    if (!adminUid) throw new Error('adminUid is required');
    const permissions = PermissionsSchema.parse(normalizePermissions(selection));
    await updateDoc(doc(db, 'users', uid), {
      permissions,
      permissionsUpdatedBy: adminUid,
      permissionsUpdatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[permissionService] updateUserPermissions:', err);
    throw err;
  }
}
