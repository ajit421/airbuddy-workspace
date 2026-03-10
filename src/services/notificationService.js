/**
 * Notification Service
 * ─────────────────────────────────────────────────────────────────
 * Since we're on Firebase Spark (free tier) and Cloud Functions
 * require Blaze, we write notifications client-side to Firestore
 * AND fire a browser Web Notification immediately for instant alerts.
 *
 * Firestore path: notifications/{uid}/items/{notifId}
 * ─────────────────────────────────────────────────────────────────
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Request browser notification permission on app start.
 * Call this once after the user logs in.
 */
export const requestBrowserNotifPermission = async () => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
};

/**
 * Fire an instant browser notification (foreground alert).
 */
const fireBrowserNotif = (title, body, icon = '/icon-192.png') => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(title, { body, icon });
    } catch (e) {
        console.warn('Browser notification failed:', e);
    }
};

/**
 * Write a notification to Firestore for a specific user and
 * also fire an instant browser notification.
 *
 * @param {string} uid       - Recipient user's UID
 * @param {string} title     - Notification title
 * @param {string} message   - Notification body
 * @param {string} type      - 'task_assigned' | 'task_updated' | 'announcement' | 'task_completed'
 */
export const sendNotification = async (uid, title, message, type = 'general', eventLink = null) => {
    if (!uid) return;

    // 1. Persist in Firestore so the bell icon shows it (...always)
    try {
        await addDoc(collection(db, 'notifications', uid, 'items'), {
            title,
            message,
            type,
            read: false,
            ...(eventLink ? { eventLink } : {}),
            createdAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('Failed to write notification to Firestore:', err);
    }

    // 2. Instant browser popup (only fires for the current user's own session)
    fireBrowserNotif(title, message);
};

/**
 * Notify all users in an array (e.g. assignees).
 * Skips the sender's UID to avoid self-notifications.
 *
 * @param {string[]} uids        - List of recipient UIDs
 * @param {string}   senderUid   - The acting user's UID (will be excluded)
 * @param {string}   title
 * @param {string}   message
 * @param {string}   type
 */
export const notifyUsers = async (uids = [], senderUid, title, message, type = 'general') => {
    const recipients = uids.filter(uid => uid !== senderUid);
    await Promise.all(recipients.map(uid => sendNotification(uid, title, message, type)));
};
