/**
 * announcementService.js
 * Data access layer for Announcements.
 *
 * HI-5 fix: AdminPanel.jsx previously imported Firestore directly for
 * announcement CRUD. All Firestore operations are now encapsulated here
 * so components stay decoupled from the database layer.
 *
 * HI-6 fix: The previous `handlePost` in AnnouncementsManager called
 * `getDocs(collection(db, 'users'))` inside the submit handler every time an
 * announcement was posted. This function accepts the already-loaded `users`
 * array from the parent component state (passed in via parameter) so no
 * extra Firestore round-trip is needed.
 */

import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { sendNotification } from './notificationService';
import { z } from 'zod';

const ANNOUNCEMENTS_COL = 'announcements';

const AnnouncementFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  priority: z.enum(['normal', 'medium', 'high']),
  meetingLink: z.string().url().or(z.literal('')).optional().nullable(),
  targetAudience: z.string(),
});

/**
 * Subscribe to real-time announcement updates.
 * Returns an unsubscribe function for useEffect cleanup.
 *
 * @param {(announcements: Array) => void} onData
 * @returns {() => void} unsubscribe
 */
export function subscribeToAnnouncements(onData) {
  const q = query(collection(db, ANNOUNCEMENTS_COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Create a new announcement and notify all provided users.
 *
 * HI-6 fix: `users` is now passed in from the caller (already loaded in component
 * state) instead of re-fetching with getDocs on every submit.
 *
 * @param {{ title: string, message: string, priority: string, meetingLink: string, targetAudience: string }} form
 * @param {{ uid: string, name: string, avatar: string }} adminProfile - acting admin
 * @param {Array<{ uid: string }>} users - pre-loaded user list (avoids extra Firestore read)
 * @returns {Promise<void>}
 */
export async function createAnnouncement(form, adminProfile, users = []) {
  // Validate schema at service boundaries (LO-6 fix)
  const validatedForm = AnnouncementFormSchema.parse(form);

  await addDoc(collection(db, ANNOUNCEMENTS_COL), {
    ...validatedForm,
    adminId:     adminProfile.uid,
    adminName:   adminProfile.name,
    adminAvatar: adminProfile.avatar,
    isRead:      [],
    createdAt:   serverTimestamp(),
  });

  // Notify all users except the admin who posted (HI-6: uses passed-in users list)
  await Promise.all(
    users
      .filter((u) => u.uid !== adminProfile.uid)
      .map((u) =>
        sendNotification(
          u.uid,
          '📣 New Announcement',
          `${adminProfile.name || 'Admin'}: "${form.title}"`,
          'announcement',
          null,
          adminProfile.uid  // CR-6: senderUid required by Firestore rule
        )
      )
  );
}

/**
 * Delete an announcement document by ID.
 *
 * @param {string} id - Firestore document ID
 * @returns {Promise<void>}
 */
export async function deleteAnnouncement(id) {
  await deleteDoc(doc(db, ANNOUNCEMENTS_COL, id));
}
