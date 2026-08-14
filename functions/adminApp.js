/**
 * adminApp.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single Admin SDK initialisation point for the whole functions codebase.
 *
 * Previously index.js and roadmapDeadlineCheck.js each called initializeApp()
 * independently, which throws (or silently creates a second app) depending on
 * module load order. Every module now requires this file instead.
 *
 * ── Modular imports only ─────────────────────────────────────────────────────
 * firebase-admin v14 REMOVED the legacy namespace entirely. On the installed
 * version, `require('firebase-admin')` still resolves but every namespaced
 * accessor is undefined:
 *
 *     admin.apps        -> undefined     admin.firestore -> undefined
 *     admin.messaging   -> undefined
 *
 * So `admin.apps.length` throws a TypeError at module load, and the whole
 * codebase fails deployment with "User code failed to load. Cannot determine
 * backend specification." Nothing in functions/ may use that namespace — always
 * import from 'firebase-admin/app', 'firebase-admin/firestore',
 * 'firebase-admin/messaging'.
 */

'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

module.exports = {
  db,
  FieldValue,
  Timestamp,
  getMessaging,
};
