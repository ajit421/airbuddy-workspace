const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Trigger on task creation
exports.onTaskCreate = functions.firestore
  .document('tasks/{taskId}')
  .onCreate(async (snap, context) => {
    const task = snap.data();
    console.log('Sending push notification for new task:', task.title);
    // FCM implementation would go here
  });

// Trigger on task update
exports.onTaskUpdate = functions.firestore
  .document('tasks/{taskId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status !== after.status) {
      console.log('Task status changed:', after.title, 'to', after.status);
      // FCM implementation would go here
    }
  });

// Trigger on new announcement
exports.onAnnouncementCreate = functions.firestore
  .document('announcements/{id}')
  .onCreate(async (snap, context) => {
    const announcement = snap.data();
    console.log('Sending push notification for announcement:', announcement.title);
    // FCM implementation would go here
  });

// Daily Cron job for approaching due dates
exports.onDueDateApproach = functions.pubsub.schedule('every day 09:00')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    console.log('Checking for tasks due tomorrow...');
    // Query tasks and send FCM messages
  });
