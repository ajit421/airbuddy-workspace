import {
  collection, addDoc, deleteDoc, doc,
  query, orderBy, onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { z } from 'zod';

const TASKS_COL = 'tasks';

const TaskFormSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  module: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending', 'in-progress', 'completed']),
  progress: z.number().min(0).max(100),
  startDate: z.string().or(z.date()).optional().nullable(),
  dueDate: z.string().or(z.date()).optional().nullable(),
  assignedTo: z.array(z.string()).nonempty('At least one employee must be assigned'),
  links: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
});

/**
 * Create a new admin-assigned task in Firestore.
 *
 * @param {{
 *   title:       string,
 *   description: string,
 *   module:      string,
 *   priority:    string,
 *   status:      string,
 *   progress:    number,
 *   startDate:   Date,
 *   dueDate:     Date,
 *   assignedTo:  string[],
 *   links:       string[],
 *   attachments: string[],
 * }} form - Task form data from AdminPanel
 * @param {string} adminUid - UID of the admin creating the task
 * @returns {Promise<string>} Firestore document ID of the created task
 */
export async function createAdminTask(form, adminUid) {
  // Validate schema at service boundaries (LO-6 fix)
  const validatedForm = TaskFormSchema.parse(form);

  const docRef = await addDoc(collection(db, TASKS_COL), {
    ...validatedForm,
    assignedBy:  adminUid,
    isAdminTask: true,
    startDate:   form.startDate ? new Date(form.startDate) : new Date(),
    dueDate:     form.dueDate   ? new Date(form.dueDate)   : new Date(),
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
    createdBy:   adminUid,
  });
  return docRef.id;
}

/**
 * NEW-1 fix: Delete a task by its Firestore document ID.
 * Completes the HI-5 service-layer refactor — AdminPanel no longer
 * needs to import deleteDoc from firebase/firestore directly.
 *
 * @param {string} taskId - Firestore document ID of the task to delete
 * @returns {Promise<void>}
 */
export async function deleteTask(taskId) {
  if (!taskId) throw new Error('[taskService] deleteTask: taskId is required');
  await deleteDoc(doc(db, TASKS_COL, taskId));
}

/**
 * NEW-1 fix: Subscribe to all tasks (admin view), ordered newest first.
 * Returns the unsubscribe function. Completes the HI-5 service-layer
 * refactor — AdminPanel no longer needs to call onSnapshot directly.
 *
 * @param {(tasks: Array<Object>) => void} onData - Callback with task array
 * @param {(err: Error) => void} [onError]        - Optional error callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToAdminTasks(onData, onError) {
  const q = query(collection(db, TASKS_COL), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('[taskService] subscribeToAdminTasks error:', err);
      if (onError) onError(err);
    }
  );
}


/**
 * Zod schema for a self-created personal task (the "New Personal Task" modal).
 *
 * Narrower than TaskFormSchema: an employee only picks title, description,
 * priority and an optional due date — status/progress/assignee/isAdminTask are
 * fixed by createPersonalTask below, not chosen in the form.
 */
const PersonalTaskFormSchema = z.object({
  title:       z.string().trim().min(1, 'Task title is required'),
  description: z.string().optional().default(''),
  priority:    z.enum(['low', 'medium', 'high']),
  dueDate:     z.string().or(z.date()).optional().nullable(),
});

/**
 * Create a personal (self-assigned, non-admin) task.
 *
 * `uid` MUST be the effectiveUid from useAuth() — firestore.rules checks
 * `createdBy == getEffectiveUid()` on create, and TaskContext's employee
 * listener queries `assignedTo array-contains effectiveUid`, so a secondary
 * mapped account passing its own user.uid would have the write rejected and
 * the task would never appear on its Dashboard.
 *
 * @param {{title: string, description?: string, priority: string, dueDate?: string}} form
 * @param {string} uid - effectiveUid of the creating user
 * @returns {Promise<string>} Firestore document ID of the created task
 */
export async function createPersonalTask(form, uid) {
  if (!uid) throw new Error('[taskService] createPersonalTask: uid is required');

  const validatedForm = PersonalTaskFormSchema.parse(form);

  try {
    const docRef = await addDoc(collection(db, TASKS_COL), {
      title:       validatedForm.title,
      description: validatedForm.description ?? '',
      priority:    validatedForm.priority,
      status:      'pending',
      progress:    0,
      assignedTo:  [uid],
      assignedBy:  uid,
      createdBy:   uid,
      isAdminTask: false, // personal task — see the create rule in firestore.rules
      startDate:   new Date(),
      dueDate:     validatedForm.dueDate
        ? new Date(validatedForm.dueDate)
        : new Date(Date.now() + 86400000), // default: tomorrow
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    console.error('[taskService] createPersonalTask:', err);
    throw err;
  }
}
