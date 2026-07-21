/**
 * seed-roadmap.cjs
 * Phase 6 — Seed Script
 * Creates a 4-level test tree in roadmapNodes and verifies hierarchy invariants.
 *
 * TEST TREE:
 *   L0: "Company Vision 2026"         (root)
 *   L1: "Product Launch"              (child of L0)
 *   L1: "Infrastructure Upgrade"      (child of L0)
 *   L2: "APAC Marketing Campaign"     (child of L1-Product Launch)
 *   L2: "Cloud Migration"             (child of L1-Infrastructure)
 *   L3: "Press Kit Preparation"       (child of L2-APAC)
 */

const admin = require('d:/Code/Work_flow/functions/node_modules/firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('d:/Code/Work_flow/airbuddy-workspace-firebase-adminsdk-fbsvc-6e16bf3b13.json')),
    projectId:  'airbuddy-workspace',
  });
}

const db       = admin.firestore();
const COL      = 'roadmapNodes';
const SEED_UID = 'seed-script-phase6';

function computeHierarchy(newNodeId, parentNode) {
  if (!parentNode) {
    return { parentId: null, path: newNodeId, ancestorIds: [], depth: 0 };
  }
  return {
    parentId:    parentNode.id,
    path:        `${parentNode.path}/${newNodeId}`,
    ancestorIds: [...(parentNode.ancestorIds ?? []), parentNode.id],
    depth:       (parentNode.depth ?? 0) + 1,
  };
}

async function createNode(form, parentNode) {
  const ref = db.collection(COL).doc();
  const id  = ref.id;
  const h   = computeHierarchy(id, parentNode);

  await ref.set({
    title:               form.title,
    description:         form.description ?? '',
    status:              form.status ?? 'pending',
    priority:            form.priority ?? 'medium',
    startDate:           null,
    dueDate:             form.dueDate ? new Date(form.dueDate) : null,
    assignedTo:          form.assignedTo ?? [],
    dependencies:        [],
    tags:                form.tags ?? [],
    isArchived:          false,
    progress:            0,
    childCount:          0,
    childCompletedCount: 0,
    createdBy:           SEED_UID,
    updatedBy:           SEED_UID,
    order:               form.order ?? 0,
    ...h,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (parentNode) {
    await db.collection(COL).doc(parentNode.id).update({
      childCount: admin.firestore.FieldValue.increment(1),
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const node = { id, title: form.title, ...h,
    childCount: 0, childCompletedCount: 0, progress: 0,
    isArchived: false, assignedTo: [], dependencies: [], tags: form.tags ?? [] };
  console.log(`  [depth=${h.depth}] "${form.title}"  id=${id}`);
  console.log(`           path:        ${h.path}`);
  console.log(`           ancestorIds: [${h.ancestorIds.join(', ')}]`);
  return node;
}

async function run() {
  console.log('\n=== Phase 6 Seed Script — roadmapNodes ===\n');
  console.log('Creating test tree...\n');

  const L0   = await createNode({ title: 'Company Vision 2026', priority: 'critical', status: 'in-progress', tags: ['vision'], order: 0 }, null);
  const L1a  = await createNode({ title: 'Product Launch', priority: 'high', status: 'in-progress', order: 0 }, L0);
  const L1b  = await createNode({ title: 'Infrastructure Upgrade', priority: 'high', status: 'pending', order: 1 }, L0);
  const L2a  = await createNode({ title: 'APAC Marketing Campaign', priority: 'medium', status: 'pending', order: 0 }, L1a);
  const L2b  = await createNode({ title: 'Cloud Migration', priority: 'high', status: 'in-progress', order: 0 }, L1b);
  const L3   = await createNode({ title: 'Press Kit Preparation', priority: 'medium', status: 'pending', order: 0 }, L2a);

  console.log('\n=== Verifying invariants (reading back from Firestore) ===\n');

  const snap = await db.collection(COL).where('createdBy', '==', SEED_UID).get();
  let allOk = true;

  for (const d of snap.docs) {
    const data = d.data();
    const id   = d.id;
    let ok = true;

    if (data.ancestorIds.length !== data.depth) {
      console.error(`  FAIL [${id}] "${data.title}": ancestorIds.length=${data.ancestorIds.length} != depth=${data.depth}`);
      ok = false; allOk = false;
    }
    if (!data.path.endsWith(id)) {
      console.error(`  FAIL [${id}] "${data.title}": path "${data.path}" does not end with id`);
      ok = false; allOk = false;
    }
    if (data.depth === 0 && data.parentId !== null) {
      console.error(`  FAIL [${id}] root node has parentId=${data.parentId}`);
      ok = false; allOk = false;
    }
    if (ok) {
      console.log(`  OK   [depth=${data.depth}] "${data.title}"`);
      console.log(`       path="${data.path}"`);
      console.log(`       ancestorIds=[${data.ancestorIds.join(', ')}]`);
    }
  }

  if (allOk) {
    console.log('\n✅  All hierarchy invariants passed! 6 nodes seeded successfully.\n');
  } else {
    console.error('\n❌  Some invariants FAILED.\n');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Seed script failed:', err.message);
  process.exit(1);
});
