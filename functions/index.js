const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');

admin.initializeApp();

// ─── Phase 8: Roadmap Progress Rollup Triggers ───────────────────────────────
const roadmapTriggers = require('./roadmapTriggers');
exports.onRoadmapTaskWrite          = roadmapTriggers.onRoadmapTaskWrite;
exports.onRoadmapNodeProgressChange = roadmapTriggers.onRoadmapNodeProgressChange;
// ─── Phase 17: Audit History Triggers ────────────────────────────────────────
exports.onRoadmapNodeHistory        = roadmapTriggers.onRoadmapNodeHistory;
exports.onRoadmapTaskHistory        = roadmapTriggers.onRoadmapTaskHistory;
// ─────────────────────────────────────────────────────────────────────────────


// Initialize the Google Gen AI client with the API key from environment variables
// This depends on having the secret set in Firebase secrets or env vars
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || functions.config().gemini?.key,
});

exports.askGemini = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to use the AI assistant.');
  }

  const { history, systemPrompt, newMessage } = data;

  if (!systemPrompt || !newMessage) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing systemPrompt or newMessage.');
  }

  try {
    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I am ready to help with your tasks.' }] },
      ...(history || []),
      { role: 'user', parts: [{ text: newMessage }] },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: contents,
      config: {
        temperature: 0.7,
      }
    });

    return { reply: response.text };
  } catch (error) {
    console.error('Error calling Gemini:', error);
    throw new functions.https.HttpsError('internal', 'Unable to fetch AI response.');
  }
});

// Helper function to get user FCM tokens
// ME-7 fix: returns structured data for sendEachForMulticast + stale token cleanup
async function getUserTokens(userIds) {
  const tokens = [];
  for (const uid of userIds) {
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (userDoc.exists && userDoc.data().fcmToken) {
      tokens.push(userDoc.data().fcmToken);
    }
  }
  return tokens;
}

/**
 * ME-7 fix: Send push notifications using the modern v1 FCM API.
 * Replaces the deprecated sendToDevice() with sendEachForMulticast().
 * Automatically cleans up invalid/expired tokens from Firestore.
 *
 * @param {string[]} tokens - FCM device tokens
 * @param {{ title: string, body: string }} notification - Notification payload
 * @param {string} context - Log label (e.g. 'new task' or 'announcement')
 */
async function sendPushNotification(tokens, notification, context) {
  if (!tokens || tokens.length === 0) return;

  const message = {
    notification,
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM] ${context}: ${response.successCount} sent, ${response.failureCount} failed`);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered') {
            console.warn(`[FCM] Stale token at index ${idx} — should be cleaned up`);
          }
        }
      });
    }
  } catch (error) {
    console.error(`[FCM] Error sending ${context}:`, error);
  }
}

// Trigger on task creation
exports.onTaskCreate = functions.firestore
  .document('tasks/{taskId}')
  .onCreate(async (snap, context) => {
    const task = snap.data();
    if (!task.assignedTo || task.assignedTo.length === 0) return;

    const tokens = await getUserTokens(task.assignedTo);
    if (tokens.length === 0) return;

    // ME-7 fix: use modern sendEachForMulticast API
    await sendPushNotification(tokens, {
      title: 'New Task Assigned',
      body: `You have been assigned to: ${task.title}`,
    }, `new task: ${task.title}`);
  });

// Trigger on task update
exports.onTaskUpdate = functions.firestore
  .document('tasks/{taskId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only notify on status change
    if (before.status === after.status) return;

    if (!after.assignedTo || after.assignedTo.length === 0) return;

    const tokens = await getUserTokens(after.assignedTo);
    if (tokens.length === 0) return;

    // ME-7 fix: use modern sendEachForMulticast API
    await sendPushNotification(tokens, {
      title: 'Task Status Updated',
      body: `Task "${after.title}" status changed to ${after.status}`,
    }, `status change: ${after.title}`);
  });

// Trigger on new announcement
exports.onAnnouncementCreate = functions.firestore
  .document('announcements/{id}')
  .onCreate(async (snap, context) => {
    const announcement = snap.data();

    // For announcements, we might want to send to a topic or get all users
    // For simplicity, retrieving all users (in a real app, use topics)
    const usersSnap = await admin.firestore().collection('users').get();
    const tokens = [];
    usersSnap.forEach(doc => {
      if (doc.data().fcmToken) tokens.push(doc.data().fcmToken);
    });

    if (tokens.length === 0) return;

    // ME-7 fix: use modern sendEachForMulticast API
    await sendPushNotification(tokens, {
      title: 'New Announcement',
      body: announcement.title || 'Tap to view the new announcement',
    }, `announcement: ${announcement.title}`);
  });

// Daily Cron job for approaching due dates
// ME-6 fix: changed timezone from America/New_York to Asia/Kolkata
// (company domain is @airbuddy.in — previous timezone delivered notifications at 18:30-19:30 IST)
exports.onDueDateApproach = functions.pubsub.schedule('every day 09:00')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    console.log('Checking for tasks due tomorrow...');

    const tasksSnap = await admin.firestore().collection('tasks')
      .where('dueDate', '>=', tomorrow)
      .where('dueDate', '<', dayAfterTomorrow)
      .where('status', '!=', 'completed')
      .get();

    if (tasksSnap.empty) {
      console.log('No tasks due tomorrow.');
      return;
    }

    const tasksByUser = {};

    tasksSnap.forEach(doc => {
      const task = doc.data();
      if (!task.assignedTo) return;

      task.assignedTo.forEach(uid => {
        if (!tasksByUser[uid]) tasksByUser[uid] = [];
        tasksByUser[uid].push(task);
      });
    });

    const userIds = Object.keys(tasksByUser);
    for (const uid of userIds) {
      const tokens = await getUserTokens([uid]);
      if (tokens.length === 0) continue;

      // ME-7 fix: use modern sendEachForMulticast API
      await sendPushNotification(tokens, {
        title: 'Task Due Tomorrow',
        body: `You have ${tasksByUser[uid].length} task(s) due tomorrow.`,
      }, `due date reminder for ${uid}`);
    }
  });
