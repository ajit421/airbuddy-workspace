/**
 * teamMembersService.js
 * Data access layer for the Team Members feature.
 *
 * RULES:
 *  - Components NEVER import Firebase directly — they call these functions.
 *  - All writes include `updatedAt: serverTimestamp()`.
 *  - Complex queries are sorted client-side to avoid Firestore composite-index errors.
 *  - Every async function wraps its body in try/catch.
 */

import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

// ─── Collection helpers ───────────────────────────────────────────────────────
const usersCol = () => collection(db, 'users');
const attendanceRecordsCol = (uid) =>
  collection(db, 'attendance', uid, 'records');

// ─── 1. subscribeToAllUsers ───────────────────────────────────────────────────
/**
 * Sets up a real-time onSnapshot listener on the `users/` collection.
 * Results are sorted client-side by `name` (ascending) to avoid requiring a
 * Firestore orderBy index.
 *
 * @param {(users: Array<Object>) => void} callback - Called with the full mapped
 *   array every time Firestore data changes.
 * @returns {() => void} Unsubscribe function — call it in a useEffect cleanup.
 */
export function subscribeToAllUsers(onData, onError) {
  const unsubscribe = onSnapshot(
    usersCol(),
    (snapshot) => {
      const users = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          uid:         data.uid         ?? docSnap.id,
          name:        data.name        ?? '',
          email:       data.email       ?? '',
          role:        data.role        ?? 'employee',
          customRole:  data.customRole  ?? '',   // display-only label set by admin
          avatar:      data.avatar      ?? '',
          bio:         data.bio         ?? '',
          phone:       data.phone       ?? '',
          skills:      Array.isArray(data.skills) ? data.skills : [],
          socialLinks: data.socialLinks ?? {},
          department:  data.department  ?? '',
          designation: data.designation ?? '',
          joinDate:    data.joinDate    ?? null,
          createdAt:   data.createdAt   ?? null,
        };
      });

      // Client-side sort by name ascending — avoids Firestore orderBy index
      users.sort((a, b) => a.name.localeCompare(b.name));

      onData(users);
    },
    (error) => {
      console.error('[teamMembersService] subscribeToAllUsers error:', error);
      if (typeof onError === 'function') onError(error);
    }
  );

  return unsubscribe;
}

// ─── 2. getUserProfile ────────────────────────────────────────────────────────
/**
 * One-time fetch of a single user's full profile document.
 *
 * @param {string} uid - Firebase Auth UID / Firestore document ID.
 * @returns {Promise<Object|null>} Full user profile object, or null if not found.
 */
export async function getUserProfile(uid) {
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    return {
      uid:         data.uid         ?? docSnap.id,
      name:        data.name        ?? '',
      email:       data.email       ?? '',
      role:        data.role        ?? 'employee',
      customRole:  data.customRole  ?? '',
      avatar:      data.avatar      ?? '',
      bio:         data.bio         ?? '',
      phone:       data.phone       ?? '',
      skills:      Array.isArray(data.skills) ? data.skills : [],
      socialLinks: data.socialLinks ?? {},
      department:  data.department  ?? '',
      designation: data.designation ?? '',
      joinDate:    data.joinDate    ?? null,
      createdAt:   data.createdAt   ?? null,
    };
  } catch (error) {
    console.error(`[teamMembersService] getUserProfile failed for uid "${uid}":`, error);
    return null;
  }
}

// ─── 3. updateUserProfile ─────────────────────────────────────────────────────
/**
 * Merges safe personal profile fields into a user's Firestore document.
 * Only the fields in `profileData` are written; unmentioned fields are preserved.
 * Sensitive fields (role, email, uid, salaryBase, etc.) are NOT accepted here —
 * they are blocked both by this function and by Firestore security rules.
 *
 * @param {string} uid - Firestore document ID of the user to update.
 * @param {{
 *   avatar?:      string,
 *   bio?:         string,
 *   phone?:       string,
 *   skills?:      string[],
 *   socialLinks?: { github?: string, linkedin?: string, instagram?: string, portfolio?: string }
 * }} profileData - Only safe personal fields.
 * @returns {Promise<{ success: true }>}
 * @throws Will rethrow any Firestore error so the calling component can handle it.
 */
export async function updateUserProfile(uid, profileData) {
  // Whitelist: strip any fields that should never be self-editable
  const { avatar, bio, phone, skills, socialLinks } = profileData;
  const safePayload = {};
  if (avatar      !== undefined) safePayload.avatar      = avatar;
  if (bio         !== undefined) safePayload.bio         = bio;
  if (phone       !== undefined) safePayload.phone       = phone;
  if (skills      !== undefined) safePayload.skills      = skills;
  if (socialLinks !== undefined) safePayload.socialLinks = socialLinks;

  try {
    await updateDoc(doc(db, 'users', uid), {
      ...safePayload,
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error(`[teamMembersService] updateUserProfile failed for uid "${uid}":`, error);
    throw error;
  }
}

// ─── 3b. updateUserAdminFields ────────────────────────────────────────────────
/**
 * Admin-only: writes privileged HR fields (department, designation, role) that
 * employees are NOT allowed to write via updateUserProfile().
 * Called separately in EditProfileModal ONLY when isAdmin && viewingOtherUser.
 * Firestore security rules enforce the admin check server-side as a second layer.
 *
 * @param {string} uid - Firestore document ID of the target user.
 * @param {{ department?: string, designation?: string, role?: string }} adminData
 * @returns {Promise<{ success: true }>}
 * @throws Will rethrow so the calling component can show an error.
 */
export async function updateUserAdminFields(uid, adminData) {
  const { department, designation, role, customRole } = adminData;
  const payload = {};
  if (department  !== undefined) payload.department  = department;
  if (designation !== undefined) payload.designation = designation;
  if (role        !== undefined) payload.role        = role;
  if (customRole  !== undefined) payload.customRole  = customRole;

  try {
    await updateDoc(doc(db, 'users', uid), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error(`[teamMembersService] updateUserAdminFields failed for uid "${uid}":`, error);
    throw error;
  }
}

// ─── 4. getUserAttendanceSummary ──────────────────────────────────────────────
/**
 * One-time fetch of a user's full attendance history to compute a summary.
 * Uses getDocs (not onSnapshot) because this is a background stat calculation,
 * not a live-updating feed.
 *
 * @param {string} uid - The user whose attendance sub-collection to read.
 * @returns {Promise<{
 *   totalDays:       number,
 *   presentDays:     number,
 *   absentDays:      number,
 *   attendanceRate:  string   // e.g. "87%"
 * }>}
 */
export async function getUserAttendanceSummary(uid) {
  const defaultSummary = {
    totalDays:      0,
    presentDays:    0,
    absentDays:     0,
    attendanceRate: '0%',
  };

  try {
    const snapshot = await getDocs(attendanceRecordsCol(uid));
    if (snapshot.empty) return defaultSummary;

    const records = snapshot.docs.map((d) => d.data());

    // totalDays  = records that have a punchIn (i.e. the user actually clocked in)
    const totalDays   = records.filter((r) => r.punchIn != null).length;
    // presentDays = records with both punchIn AND punchOut (full shift recorded)
    const presentDays = records.filter((r) => r.punchIn != null && r.punchOut != null).length;
    const absentDays  = totalDays - presentDays;
    const attendanceRate =
      totalDays === 0 ? '0%' : `${Math.round((presentDays / totalDays) * 100)}%`;

    return { totalDays, presentDays, absentDays, attendanceRate };
  } catch (error) {
    console.error(
      `[teamMembersService] getUserAttendanceSummary failed for uid "${uid}":`,
      error
    );
    return defaultSummary;
  }
}

// ─── 5. getUserTaskStats ──────────────────────────────────────────────────────
/**
 * Pure synchronous function — no Firebase call.
 * Derives task statistics for a user from the already-fetched `allTasks` array
 * that lives in TaskContext. This avoids an extra Firestore query.
 *
 * @param {string}        uid      - The user to compute stats for.
 * @param {Array<Object>} allTasks - The `tasks` array from TaskContext (real-time data).
 * @returns {{
 *   totalTasks:      number,
 *   completedTasks:  number,
 *   inProgressTasks: number,
 *   pendingTasks:    number,
 *   completionRate:  string   // e.g. "73%"
 * }}
 */
export function getUserTaskStats(uid, allTasks) {
  const defaultStats = {
    totalTasks:      0,
    completedTasks:  0,
    inProgressTasks: 0,
    pendingTasks:    0,
    completionRate:  '0%',
  };

  if (!uid || !Array.isArray(allTasks) || allTasks.length === 0) {
    return defaultStats;
  }

  // Tasks where this user has any participation:
  // 1. Directly assigned (assignedTo is a string[] of UIDs)
  // 2. As a Work Partner (workPartnerUids is a flat string[] for rules + stats)
  const userTasks = allTasks.filter((task) => {
    const isAssigned = Array.isArray(task.assignedTo) && task.assignedTo.includes(uid);
    const isPartner  = Array.isArray(task.workPartnerUids) && task.workPartnerUids.includes(uid);
    return isAssigned || isPartner;
  });

  const totalTasks      = userTasks.length;
  const completedTasks  = userTasks.filter((t) => t.status === 'completed').length;
  const inProgressTasks = userTasks.filter((t) => t.status === 'in-progress').length;
  const pendingTasks    = userTasks.filter((t) => t.status === 'pending').length;
  const completionRate  =
    totalTasks === 0 ? '0%' : `${Math.round((completedTasks / totalTasks) * 100)}%`;

  return { totalTasks, completedTasks, inProgressTasks, pendingTasks, completionRate };
}
