/**
 * seed-roadmap-deep.cjs
 * Phase 8 — Emulator Cascade Test Seed
 *
 * Extends the Phase 6 tree with deeper levels (L4-L6) and adds tasks,
 * then verifies the cascade rollup across all levels.
 *
 * Usage (connect to EMULATOR):
 *   set FIRESTORE_EMULATOR_HOST=localhost:8080
 *   node scripts/seed-roadmap-deep.cjs
 *
 * Or for LIVE Firestore:
 *   node scripts/seed-roadmap-deep.cjs --live
 */

const admin = require('d:/Code/Work_flow/functions/node_modules/firebase-admin');

const USE_LIVE = process.argv.includes('--live');

if (!admin.apps.length) {
  if (USE_LIVE) {
    admin.initializeApp({
      credential: admin.credential.cert(
        require('d:/Code/Work_flow/airbuddy-workspace-firebase-adminsdk-fbsvc-6e16bf3b13.json')
      ),
      projectId: 'airbuddy-workspace',
    });
    console.log('Connected to LIVE Firestore: airbuddy-workspace');
  } else {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
    admin.initializeApp({ projectId: 'airbuddy-workspace' });
    console.log('Connected to EMULATOR at', process.env.FIRESTORE_EMULATOR_HOST);
  }
}

const db       = admin.firestore();
const COL      = 'roadmapNodes';
const TASKS    = 'tasks';
const SEED_UID = 'cascade-test';

function computeHierarchy(newId, parent) {
  if (!parent) return { parentId: null, path: newId, ancestorIds: [], depth: 0 };
  return {
    parentId:    parent.id,
    path:        parent.path + '/' + newId,
    ancestorIds: parent.ancestorIds.concat([parent.id]),
    depth:       parent.depth + 1,
  };
}

async function createNode(form, parent) {
  var ref = db.collection(COL).doc();
  var id  = ref.id;
  var h   = computeHierarchy(id, parent);
  await ref.set(Object.assign({
    title: form.title, description: '', status: 'pending', priority: 'medium',
    startDate: null, dueDate: null, assignedTo: [], dependencies: [], tags: [],
    isArchived: false, progress: 0, childCount: 0, childCompletedCount: 0,
    createdBy: SEED_UID, updatedBy: SEED_UID, order: form.order || 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, h));
  if (parent) {
    await db.collection(COL).doc(parent.id).update({
      childCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  var node = Object.assign({ id: id, title: form.title, childCount: 0 }, h);
  console.log('  [L' + h.depth + '] "' + form.title + '" id=' + id);
  return node;
}

async function createTask(nodeId, title, progress, status) {
  var ref = db.collection(COL).doc(nodeId).collection(TASKS).doc();
  await ref.set({
    title: title, description: '', status: status || 'in-progress',
    priority: 'medium', progress: progress, assignedTo: [],
    dueDate: null, completionNote: '',
    assignedBy: SEED_UID, createdBy: SEED_UID, updatedBy: SEED_UID,
    nodeId: nodeId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('  Task "' + title + '" (progress=' + progress + ') on node ' + nodeId);
  return ref.id;
}

async function waitForTrigger(ms) {
  console.log('Waiting ' + ms + 'ms for Cloud Function triggers to propagate...');
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function checkProgress(nodeId, label) {
  var snap = await db.collection(COL).doc(nodeId).get();
  var p = snap.data().progress;
  console.log('  CHECK ' + label + ': progress=' + p);
  return p;
}

async function run() {
  console.log('\n=== Phase 8 Cascade Test — 6-Level Tree ===\n');

  // Build a 6-level chain: L0 -> L1 -> L2 -> L3 -> L4 -> L5
  var L0 = await createNode({ title: 'L0 Root [cascade test]', order: 100 }, null);
  var L1 = await createNode({ title: 'L1 Child', order: 0 }, L0);
  var L2 = await createNode({ title: 'L2 Child', order: 0 }, L1);
  var L3 = await createNode({ title: 'L3 Child', order: 0 }, L2);
  var L4 = await createNode({ title: 'L4 Child', order: 0 }, L3);
  var L5 = await createNode({ title: 'L5 Leaf', order: 0 }, L4);

  console.log('\n--- Adding tasks to L5 (leaf) ---');
  await createTask(L5.id, 'Task A', 50, 'in-progress');
  await createTask(L5.id, 'Task B', 0, 'pending');

  if (USE_LIVE) {
    await waitForTrigger(8000);
    console.log('\n--- Verifying cascade (live functions) ---');
    await checkProgress(L5.id, 'L5');
    await checkProgress(L4.id, 'L4');
    await checkProgress(L3.id, 'L3');
    await checkProgress(L2.id, 'L2');
    await checkProgress(L1.id, 'L1');
    await checkProgress(L0.id, 'L0');
  } else {
    console.log('\nEmulator mode: check the Emulator UI at http://localhost:4000');
    console.log('Trigger the cascade by running functions emulator alongside Firestore emulator.');
    console.log('Then update a task progress and watch all ancestors update in the Firestore UI.');
  }

  console.log('\n=== Seed complete. L5 node id:', L5.id, '===\n');
}

run().catch(function(e) { console.error(e); process.exit(1); });