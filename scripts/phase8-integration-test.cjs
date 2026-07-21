const admin = require('d:/Code/Work_flow/functions/node_modules/firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('d:/Code/Work_flow/airbuddy-workspace-firebase-adminsdk-fbsvc-6e16bf3b13.json')),
    projectId: 'airbuddy-workspace',
  });
}
const db = admin.firestore();

// Import our server helper directly
const {
  computeTaskProgress,
  recomputeNodeProgress,
  propagateProgressToAncestors,
} = require('d:/Code/Work_flow/functions/roadmapService.server');

const COL   = 'roadmapNodes';
const TASKS = 'tasks';
const UID   = 'integration-test-phase8';

function computeHierarchy(id, parent) {
  if (!parent) return { parentId: null, path: id, ancestorIds: [], depth: 0 };
  return {
    parentId: parent.id,
    path: parent.path + '/' + id,
    ancestorIds: parent.ancestorIds.concat([parent.id]),
    depth: parent.depth + 1,
  };
}

async function mkNode(title, parent, order) {
  var ref = db.collection(COL).doc();
  var id  = ref.id;
  var h   = computeHierarchy(id, parent);
  await ref.set(Object.assign({
    title: title, description: '', status: 'pending', priority: 'medium',
    startDate: null, dueDate: null, assignedTo: [], dependencies: [], tags: [],
    isArchived: false, progress: 0, childCount: 0, childCompletedCount: 0,
    createdBy: UID, updatedBy: UID, order: order || 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, h));
  if (parent) await db.collection(COL).doc(parent.id).update({
    childCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return Object.assign({ id: id, title: title, childCount: 0 }, h);
}

async function mkTask(nodeId, title, progress, status) {
  var ref = db.collection(COL).doc(nodeId).collection(TASKS).doc();
  await ref.set({
    title: title, status: status || 'in-progress', progress: progress,
    priority: 'medium', assignedTo: [], dueDate: null, completionNote: '',
    assignedBy: UID, createdBy: UID, updatedBy: UID, nodeId: nodeId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getProgress(id) {
  var snap = await db.collection(COL).doc(id).get();
  return snap.data().progress;
}

async function run() {
  console.log('\n=== Phase 8 Integration Test: Manual Cascade Simulation ===\n');

  // Build: L0 -> L1 -> L2 -> L3 -> L4 -> L5 (6 levels)
  var L0 = await mkNode('IT-L0 Root',  null, 200);
  var L1 = await mkNode('IT-L1',       L0,   0);
  var L2 = await mkNode('IT-L2',       L1,   0);
  var L3 = await mkNode('IT-L3',       L2,   0);
  var L4 = await mkNode('IT-L4',       L3,   0);
  var L5 = await mkNode('IT-L5 Leaf',  L4,   0);

  // Add tasks to L5: progress=60 and progress=40 -> avg=50
  await mkTask(L5.id, 'Task A', 60, 'in-progress');
  await mkTask(L5.id, 'Task B', 40, 'in-progress');
  console.log('Tasks created under L5 (expected avg progress: 50)');

  // Manually trigger what onRoadmapTaskWrite would do
  console.log('\n--- Step 1: recomputeNodeProgress(L5) ---');
  var r5 = await recomputeNodeProgress(L5.id, db, admin);
  console.log('L5 result:', r5);

  // Manually trigger what onRoadmapNodeProgressChange would do for L5
  console.log('\n--- Step 2: propagateProgressToAncestors(L5.ancestorIds) ---');
  await propagateProgressToAncestors(L5.ancestorIds, db, admin);

  // Read back all levels
  console.log('\n--- Verification ---');
  var p5 = await getProgress(L5.id);
  var p4 = await getProgress(L4.id);
  var p3 = await getProgress(L3.id);
  var p2 = await getProgress(L2.id);
  var p1 = await getProgress(L1.id);
  var p0 = await getProgress(L0.id);

  console.log('L5 progress:', p5, '(expected 50)');
  console.log('L4 progress:', p4, '(expected 50 - only child)');
  console.log('L3 progress:', p3, '(expected 50 - only child)');
  console.log('L2 progress:', p2, '(expected 50 - only child)');
  console.log('L1 progress:', p1, '(expected 50 - only child)');
  console.log('L0 progress:', p0, '(expected 50 - only child)');

  var allCorrect = [p5, p4, p3, p2, p1, p0].every(function(p) { return p === 50; });

  // Test loop guard: re-run propagation â€” no writes should happen
  console.log('\n--- Loop guard test: re-run propagation (should log unchanged) ---');
  await propagateProgressToAncestors(L5.ancestorIds, db, admin);

  if (allCorrect) {
    console.log('\n PASSED: All 6 levels correctly show progress=50. Cascade works.');
  } else {
    console.error('\n FAILED: Some levels do not show the expected progress.');
    process.exit(1);
  }
}

run().catch(function(e) { console.error(e); process.exit(1); });
