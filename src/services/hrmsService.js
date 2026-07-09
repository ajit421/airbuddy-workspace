/**
 * hrmsService.js
 * Data access layer for the HRMS (Human Resource Management System) module.
 * All reads/writes go through the shared `db` instance from firebase.js so
 * they automatically respect the project's existing Firestore security rules.
 */

import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { z } from 'zod';

// ─── Collection reference ────────────────────────────────────────────────────
const USERS_COLLECTION = 'users';

// ─── Zod schemas (LO-6 fix) ─────────────────────────────────────────────────
// Validate data at service boundaries before writing to Firestore.
// Unknown keys are stripped (z.object is strict-by-default on extra keys via .strip()).
const EmployeeCreateSchema = z.object({
  name:        z.string().min(1, 'Name is required'),
  email:       z.email('Must be a valid email'),
  role:        z.enum(['admin', 'employee']).default('employee'),
  department:  z.string().optional(),
  designation: z.string().optional(),
  salaryBase:  z.number().nonnegative().optional(),
  avatar:      z.string().optional(),
});

// Partial version for updates — all fields optional
const EmployeeUpdateSchema = EmployeeCreateSchema.partial();

// ─── getAllEmployees ─────────────────────────────────────────────────────────
/**
 * Fetches every document from the `users` collection.
 *
 * Existing fields per document: { uid, name, email, role, avatar }
 * Extended HRMS fields (may be absent on older docs):
 *   { department, designation, joinDate (Timestamp), salaryBase }
 *
 * @returns {Promise<Array<Object>>} Array of user objects, each with Firestore doc `id`.
 */
export async function getAllEmployees() {
  try {
    // ME-6 fix: add orderBy + limit to prevent unbounded full-collection scans.
    // 500 is a practical upper bound for any small-to-medium organisation.
    const q = query(
      collection(db, USERS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(500),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,       // Firestore document ID (= uid in this project)
      ...docSnap.data(),    // Spread all existing + HRMS fields
    }));
  } catch (err) {
    console.error('[hrmsService] getAllEmployees failed:', err);
    throw err;
  }
}

// ─── addEmployee ─────────────────────────────────────────────────────────────
/**
 * Creates a new document in the `users` collection for an already-existing
 * Firebase Auth account.
 *
 * ME-2 fix: The previous implementation used `addDoc` which auto-generates a
 * random Firestore ID — producing orphaned records that can never be linked to
 * a Google OAuth login. Now uses `setDoc(doc(db, 'users', uid), ...)` so the
 * Firestore document ID matches the Firebase Auth UID.
 *
 * ⚠️  IMPORTANT: `uid` MUST be a real Firebase Auth UID.
 * The preferred self-onboarding flow is: user signs in with Google → AuthContext
 * auto-creates their profile. Only use this function if you already have an Auth
 * UID (e.g., created server-side via Admin SDK).
 *
 * @param {string} uid  - Firebase Auth UID (document ID in `users` collection).
 * @param {Object} data - Employee data:
 *   { name, email, role, department, designation, salaryBase? }
 * @returns {Promise<void>}
 */
export async function addEmployee(uid, data) {
  if (!uid) throw new Error('[hrmsService] addEmployee: uid is required');
  try {
    // LO-6 fix: validate data before writing to Firestore
    const validated = EmployeeCreateSchema.parse(data);
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, USERS_COLLECTION, uid), {
      uid,
      ...validated,
      // Ensure role always has a safe default
      role: validated.role || 'employee',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[hrmsService] addEmployee failed:', err);
    throw err;
  }
}

// ─── updateEmployee ──────────────────────────────────────────────────────────
/**
 * Merges provided fields into an existing user document.
 * Uses updateDoc so unmentioned fields are preserved.
 *
 * @param {string} uid  - Firestore document ID of the user.
 * @param {Object} data - Fields to update (any subset of the user schema).
 * @returns {Promise<void>}
 */
export async function updateEmployee(uid, data) {
  try {
    // LO-6 fix: validate data before writing to Firestore
    const validated = EmployeeUpdateSchema.parse(data);
    const userRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(userRef, {
      ...validated,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(`[hrmsService] updateEmployee failed for uid "${uid}":`, err);
    throw err;
  }
}

// ─── deleteEmployee ──────────────────────────────────────────────────────────
/**
 * Hard-deletes a user document from Firestore.
 * Note: this does NOT delete the Firebase Auth account — only the Firestore record.
 *
 * @param {string} uid - Firestore document ID of the user to delete.
 * @returns {Promise<void>}
 */
export async function deleteEmployee(uid) {
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, uid));
  } catch (err) {
    console.error(`[hrmsService] deleteEmployee failed for uid "${uid}":`, err);
    throw err;
  }
}

// ─── updateEmployeeHRDetails (kept for backwards compatibility) ──────────────
/**
 * @deprecated Use updateEmployee() instead.
 * Kept so any existing callers don't break.
 */
export async function updateEmployeeHRDetails(uid, hrData) {
  return updateEmployee(uid, hrData);
}

// ─── Attendance sub-collection path helper ───────────────────────────────────
// Schema: attendance/{uid}/records/{recordId}
//   { punchIn: Timestamp, punchOut?: Timestamp, date: 'YYYY-MM-DD' }
const attendancePath = (uid) => collection(db, 'attendance', uid, 'records');

// ─── recordPunch ─────────────────────────────────────────────────────────────
/**
 * Toggles punch state for the current user.
 *  - If no open record for today exists → creates a new punch-in record.
 *  - If an open record exists (no punchOut) → writes the punchOut timestamp.
 *
 * @param {string} uid - The authenticated user's uid.
 * @returns {Promise<'in'|'out'>} Which action was recorded.
 */
export async function recordPunch(uid) {
  try {
    // HI-3 fix: toISOString() gives the UTC date which is wrong for UTC+ timezones
    // (e.g. IST users punching in at 00:15 IST = 18:45 UTC previous day → wrong date stored).
    // Reading local year/month/date is always timezone-correct.
    const now = new Date();
    const todayStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-'); // 'YYYY-MM-DD' in local timezone
    const col = attendancePath(uid);

    // Look for an open record for today (has punchIn, no punchOut)
    const q = query(col, where('date', '==', todayStr), where('punchOut', '==', null), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) {
      // No open record → Punch IN
      await addDoc(col, {
        date:      todayStr,
        punchIn:   serverTimestamp(),
        punchOut:  null,
        createdAt: serverTimestamp(),
      });
      return 'in';
    } else {
      // Open record found → Punch OUT
      const openDoc = snap.docs[0];
      await updateDoc(doc(db, 'attendance', uid, 'records', openDoc.id), {
        punchOut:  serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return 'out';
    }
  } catch (err) {
    console.error(`[hrmsService] recordPunch failed for uid "${uid}":`, err);
    throw err;
  }
}

// ─── getTodayAttendance ──────────────────────────────────────────────────────
/**
 * Returns today's attendance record for a user, or null if none.
 *
 * @param {string} uid
 * @returns {Promise<Object|null>} { id, date, punchIn, punchOut } or null
 */
export async function getTodayAttendance(uid) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const q = query(attendancePath(uid), where('date', '==', todayStr), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (err) {
    console.error(`[hrmsService] getTodayAttendance failed for uid "${uid}":`, err);
    throw err;
  }
}

// ─── getAttendanceLast30Days ─────────────────────────────────────────────────
/**
 * Fetches all attendance records for a user within the last 30 days.
 *
 * @param {string} uid
 * @returns {Promise<Array<Object>>} Array of records sorted by date desc.
 */
export async function getAttendanceLast30Days(uid) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().slice(0, 10); // 'YYYY-MM-DD'

    const q = query(
      attendancePath(uid),
      where('date', '>=', cutoff),
      orderBy('date', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`[hrmsService] getAttendanceLast30Days failed for uid "${uid}":`, err);
    throw err;
  }
}

// ─── getAttendanceDateRange ───────────────────────────────────────────────────
/**
 * Fetches attendance records for a user between startDate and endDate (inclusive).
 *
 * @param {string} uid
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} endDate   - 'YYYY-MM-DD'
 * @returns {Promise<Array<Object>>} Array of records sorted by date desc.
 */
export async function getAttendanceDateRange(uid, startDate, endDate) {
  try {
    const q = query(
      attendancePath(uid),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`[hrmsService] getAttendanceDateRange failed for uid "${uid}":`, err);
    throw err;
  }
}

// ─── getAllEmployeesAttendanceSummary ─────────────────────────────────────────
/**
 * Admin-only: fetches attendance for every employee in the given date range.
 *
 * HI-2 note: This is an inherent N+1 pattern — Firestore sub-collections
 * (attendance/{uid}/records) cannot be queried across users in a single request.
 * The proper long-term fix is a Cloud Function that pre-aggregates attendance
 * into a top-level `attendance_summary` collection on each punch event.
 * Until then, we limit concurrency to BATCH_SIZE parallel queries to avoid
 * quota exhaustion and rate limiting on large teams.
 *
 * @param {Array<{uid: string, name: string, email: string, avatar?: string}>} employees
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} endDate   - 'YYYY-MM-DD'
 * @returns {Promise<Array<{employee, records}>>}
 */
export async function getAllEmployeesAttendanceSummary(employees, startDate, endDate) {
  const BATCH_SIZE = 5; // max parallel Firestore queries at once
  const results = [];

  try {
    // Process employees in batches to avoid overwhelming Firestore
    for (let i = 0; i < employees.length; i += BATCH_SIZE) {
      const batch = employees.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (emp) => {
          const records = await getAttendanceDateRange(emp.uid || emp.id, startDate, endDate);
          return { employee: emp, records };
        })
      );
      results.push(...batchResults);
    }
    return results;
  } catch (err) {
    console.error('[hrmsService] getAllEmployeesAttendanceSummary failed:', err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE MANAGEMENT
// Collection: leaves/{leaveId}
// Schema: {
//   uid, applicantName, type, startDate, endDate, reason,
//   status: 'pending'|'approved'|'rejected',
//   createdAt, updatedAt, reviewedBy?
// }
// ─────────────────────────────────────────────────────────────────────────────
const LEAVES_COLLECTION = 'leaves';

// ─── applyForLeave ───────────────────────────────────────────────────────────
/**
 * Creates a new leave request for the given user.
 *
 * @param {{ uid, applicantName, type, startDate, endDate, reason }} data
 * @returns {Promise<string>} The new leave document ID.
 */
export async function applyForLeave(data) {
  try {
    const docRef = await addDoc(collection(db, LEAVES_COLLECTION), {
      uid:           data.uid,
      applicantName: data.applicantName || 'Unknown',
      type:          data.type,          // 'sick' | 'casual' | 'unpaid'
      startDate:     data.startDate,     // 'YYYY-MM-DD'
      endDate:       data.endDate,       // 'YYYY-MM-DD'
      reason:        data.reason || '',
      status:        'pending',
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    console.error('[hrmsService] applyForLeave failed:', err);
    throw err;
  }
}

// ─── getMyLeaves ─────────────────────────────────────────────────────────────
/**
 * Fetches all leave requests submitted by a specific user, newest first.
 *
 * @param {string} uid
 * @returns {Promise<Array<Object>>}
 */
export async function getMyLeaves(uid) {
  try {
    // NOTE: using only a single where() to avoid requiring a composite Firestore index.
    // Sorting is done client-side after fetch.
    const q = query(
      collection(db, LEAVES_COLLECTION),
      where('uid', '==', uid),
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort newest first by startDate string (YYYY-MM-DD string comparison is safe)
    return docs.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  } catch (err) {
    console.error(`[hrmsService] getMyLeaves failed for uid "${uid}":`, err);
    throw err;
  }
}

// ─── getAllPendingLeaves ──────────────────────────────────────────────────────
/**
 * Admin-only: fetches every leave request with status === 'pending', oldest first.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getAllPendingLeaves() {
  try {
    // NOTE: single where() avoids composite index requirement; sort client-side.
    const q = query(
      collection(db, LEAVES_COLLECTION),
      where('status', '==', 'pending'),
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort oldest first so earliest requests get reviewed first
    return docs.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  } catch (err) {
    console.error('[hrmsService] getAllPendingLeaves failed:', err);
    throw err;
  }
}

// ─── getAllLeaves ─────────────────────────────────────────────────────────────
/**
 * Admin-only: fetches every leave document across all users, newest first.
 * Used by the Calendar view to display all employees' leave blocks.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getAllLeaves() {
  try {
    // ME-6 fix: order by startDate desc + cap at 200 records.
    // Calendar rendering only needs recent leaves; old historical data
    // can be fetched separately if needed by a reporting feature.
    const q = query(
      collection(db, LEAVES_COLLECTION),
      orderBy('startDate', 'desc'),
      limit(200),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[hrmsService] getAllLeaves failed:', err);
    throw err;
  }
}

// ─── updateLeaveStatus ───────────────────────────────────────────────────────
/**
 * Admin action: update a leave request's status.
 *
 * @param {string} leaveId      - Firestore doc ID of the leave.
 * @param {'approved'|'rejected'} status
 * @param {string} reviewerUid  - Admin's uid.
 * @returns {Promise<void>}
 */
export async function updateLeaveStatus(leaveId, status, reviewerUid) {
  try {
    await updateDoc(doc(db, LEAVES_COLLECTION, leaveId), {
      status,
      reviewedBy: reviewerUid,
      updatedAt:  serverTimestamp(),
    });
  } catch (err) {
    console.error(`[hrmsService] updateLeaveStatus failed for "${leaveId}":`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECRUITMENT — CANDIDATES
// Collection: candidates/{candidateId}
// Schema: {
//   name, email, role, experience, resumeUrl?,
//   status: 'Applied'|'Interviewing'|'Hired'|'Rejected',
//   notes?, createdAt, updatedAt
// }
// ─────────────────────────────────────────────────────────────────────────────
const CANDIDATES_COLLECTION = 'candidates';

// ─── getCandidates ───────────────────────────────────────────────────────────
/**
 * Fetches all candidate documents.
 * Sorted client-side by createdAt to avoid composite index requirement.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getCandidates() {
  try {
    const snap = await getDocs(collection(db, CANDIDATES_COLLECTION));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // newest first — Firestore Timestamps have .toMillis(); fall back to 0
    return docs.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
  } catch (err) {
    console.error('[hrmsService] getCandidates failed:', err);
    throw err;
  }
}

// ─── addCandidate ────────────────────────────────────────────────────────────
/**
 * Creates a new candidate document in the 'Applied' stage.
 *
 * @param {{ name, email, role, experience, notes? }} data
 * @returns {Promise<string>} New document ID.
 */
export async function addCandidate(data) {
  try {
    const docRef = await addDoc(collection(db, CANDIDATES_COLLECTION), {
      name:       data.name,
      email:      data.email      || '',
      role:       data.role       || '',
      experience: data.experience || '',
      resumeUrl:  data.resumeUrl  || '',
      notes:      data.notes      || '',
      status:     'Applied',           // always starts in Applied column
      createdAt:  serverTimestamp(),
      updatedAt:  serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    console.error('[hrmsService] addCandidate failed:', err);
    throw err;
  }
}

// ─── updateCandidateStatus ───────────────────────────────────────────────────
/**
 * Moves a candidate to a new Kanban column (status).
 *
 * @param {string} candidateId
 * @param {'Applied'|'Interviewing'|'Hired'|'Rejected'} newStatus
 * @returns {Promise<void>}
 */
export async function updateCandidateStatus(candidateId, newStatus) {
  try {
    await updateDoc(doc(db, CANDIDATES_COLLECTION, candidateId), {
      status:    newStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(`[hrmsService] updateCandidateStatus failed for "${candidateId}":`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE — REVIEWS
// Collection: performances/{reviewId}
// Schema: {
//   uid:            string,          // employee uid
//   employeeName:   string,
//   reviewedBy:     string,          // admin uid who created the review
//   period:         string,          // 'Q1 2024' | 'Q2 2024' | ...
//   skills: {
//     communication: number (1–5),
//     technical:     number (1–5),
//     leadership:    number (1–5),
//     teamwork:      number (1–5),
//     punctuality:   number (1–5),
//   },
//   goalsAssigned:  number,
//   goalsCompleted: number,
//   notes:          string,
//   createdAt:      Timestamp,
// }
// ─────────────────────────────────────────────────────────────────────────────
const PERF_COLLECTION = 'performances';

// ─── getMyPerformanceReviews ─────────────────────────────────────────────────
/**
 * Fetches all performance reviews for the given employee.
 * Sorted oldest → newest (by period string) client-side to avoid composite index.
 *
 * @param {string} uid
 * @returns {Promise<Array<Object>>}
 */
export async function getMyPerformanceReviews(uid) {
  try {
    const q = query(
      collection(db, PERF_COLLECTION),
      where('uid', '==', uid),
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort oldest first so charts render chronologically
    return docs.sort((a, b) => (a.period ?? '').localeCompare(b.period ?? ''));
  } catch (err) {
    console.error(`[hrmsService] getMyPerformanceReviews failed for "${uid}":`, err);
    throw err;
  }
}

// ─── getAllPerformanceReviews ─────────────────────────────────────────────────
/**
 * Admin-only: fetches every performance review across all employees.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getAllPerformanceReviews() {
  try {
    const snap = await getDocs(collection(db, PERF_COLLECTION));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (a.period ?? '').localeCompare(b.period ?? ''));
  } catch (err) {
    console.error('[hrmsService] getAllPerformanceReviews failed:', err);
    throw err;
  }
}

// ─── addPerformanceReview ────────────────────────────────────────────────────
/**
 * Admin-only: creates a new performance review document.
 *
 * @param {{
 *   uid, employeeName, reviewedBy, period,
 *   skills: { communication, technical, leadership, teamwork, punctuality },
 *   goalsAssigned, goalsCompleted, notes
 * }} data
 * @returns {Promise<string>} New document ID.
 */
export async function addPerformanceReview(data) {
  try {
    const docRef = await addDoc(collection(db, PERF_COLLECTION), {
      uid:           data.uid,
      employeeName:  data.employeeName,
      reviewedBy:    data.reviewedBy,
      period:        data.period,
      skills: {
        communication: Number(data.skills.communication),
        technical:     Number(data.skills.technical),
        leadership:    Number(data.skills.leadership),
        teamwork:      Number(data.skills.teamwork),
        punctuality:   Number(data.skills.punctuality),
      },
      goalsAssigned:  Number(data.goalsAssigned),
      goalsCompleted: Number(data.goalsCompleted),
      notes:          data.notes || '',
      createdAt:      serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    console.error('[hrmsService] addPerformanceReview failed:', err);
    throw err;
  }
}

