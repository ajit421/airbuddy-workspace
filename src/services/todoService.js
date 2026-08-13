/**
 * todoService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   All Firestore reads/writes for a task's Todo List (checklist) — the
 *   `todos` field on `tasks/{taskId}`. Full CRUD: create, read (real-time),
 *   update (text + done), delete.
 *
 * WHY AN ARRAY FIELD AND NOT A SUBCOLLECTION:
 *   The deployed task update rules are field-scoped (see firestore.rules):
 *   an assignee may write any field except the seven core metadata fields, and
 *   the creator of a personal task / an admin may write anything. `todos` is
 *   therefore already writable by the people who need it WITHOUT a rules
 *   deploy. A `tasks/{taskId}/todos/{id}` subcollection would inherit nothing
 *   and be denied for every client until new rules ship.
 *
 * WHY EVERY MUTATION IS A TRANSACTION:
 *   Editing an item means rewriting the whole `todos` array. Building that
 *   array from a value the caller already had in hand loses concurrent
 *   changes — two checkboxes ticked a second apart, and the second write
 *   silently reverts the first. This was observed in practice, not theorised.
 *   So toggle/edit/delete run inside runTransaction: the current array is read
 *   from the server inside the transaction and mutated there, which makes a
 *   lost update impossible and means callers never pass the array in.
 *   Adds use arrayUnion, which is already atomic.
 *
 * ITEM SHAPE:
 *   {
 *     id:              string   — client-generated, stable across edits
 *     text:            string   — 1..500 chars, trimmed
 *     done:            boolean
 *     createdAt:       string   — ISO 8601
 *     createdBy:       string   — uid (effectiveUid of the author)
 *     createdByName:   string   — denormalized display name
 *     completedAt:     string | null — ISO 8601
 *     completedBy:     string | null — uid
 *     completedByName: string | null
 *   }
 *
 *   serverTimestamp() is deliberately NOT used for the per-item timestamps —
 *   Firestore rejects sentinel values nested inside array elements. The
 *   document-level `updatedAt` still uses serverTimestamp().
 *
 * RULES:
 *   - No React imports — pure data/service layer.
 *   - Zod validation at every write boundary.
 *   - Every async function logs '[todoService] fn:' and rethrows.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  doc,
  updateDoc,
  onSnapshot,
  arrayUnion,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from './firebase';

const TASKS_COL = 'tasks';

/** Maximum characters allowed in a single todo item. */
export const TODO_MAX_LENGTH = 500;

/** Reference to a task document. */
const taskDoc = (taskId) => doc(db, TASKS_COL, taskId);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const TodoTextSchema = z
  .string()
  .trim()
  .min(1, 'Todo text is required')
  .max(TODO_MAX_LENGTH, `Todo must be ${TODO_MAX_LENGTH} characters or fewer`);

const TodoItemSchema = z.object({
  id:              z.string().min(1),
  text:            TodoTextSchema,
  done:            z.boolean(),
  createdAt:       z.string(),
  createdBy:       z.string(),
  createdByName:   z.string(),
  completedAt:     z.string().nullable(),
  completedBy:     z.string().nullable(),
  completedByName: z.string().nullable(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a stable id for a new todo item.
 * `crypto.randomUUID` needs a secure context; falls back to a
 * timestamp + random suffix which is unique enough for a per-task checklist.
 *
 * @returns {string}
 */
function makeTodoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normalizes whatever is stored on the task document into a clean todo array.
 * Tolerates legacy/partial shapes and non-array values so a malformed field can
 * never crash the modal.
 *
 * @param {unknown} raw - Value of the task's `todos` field
 * @returns {Array<Object>} Sorted oldest-first (checklist reading order)
 */
export function normalizeTodos(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((t) => t && typeof t === 'object' && typeof t.text === 'string')
    .map((t, i) => ({
      id:              typeof t.id === 'string' && t.id ? t.id : `legacy-${i}`,
      text:            t.text,
      done:            t.done === true,
      createdAt:       typeof t.createdAt === 'string' ? t.createdAt : '',
      createdBy:       typeof t.createdBy === 'string' ? t.createdBy : '',
      createdByName:   typeof t.createdByName === 'string' ? t.createdByName : '',
      completedAt:     typeof t.completedAt === 'string' ? t.completedAt : null,
      completedBy:     typeof t.completedBy === 'string' ? t.completedBy : null,
      completedByName: typeof t.completedByName === 'string' ? t.completedByName : null,
    }))
    // Oldest first. Items without a timestamp keep their stored position by
    // sorting as equal — Array.prototype.sort is stable in modern engines.
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

/**
 * Completion stats for a todo array. Pure — safe to call on every render.
 *
 * @param {Array<Object>} todos
 * @returns {{ total: number, done: number, percent: number }}
 *   `percent` is 0 when there are no items (not NaN).
 */
export function getTodoStats(todos) {
  const list  = Array.isArray(todos) ? todos : [];
  const total = list.length;
  const done  = list.filter((t) => t?.done === true).length;
  return {
    total,
    done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

// ─── 1. subscribeToTaskTodos (read) ───────────────────────────────────────────

/**
 * Real-time subscription to one task's todo list.
 *
 * Listens to the task document itself rather than taking `task.todos` from
 * props: the detail modal is handed a snapshot object captured at click time,
 * so props would go stale the moment anything is written.
 *
 * @param {string} taskId                              - Firestore task document ID
 * @param {(todos: Array<Object>) => void} onData       - Called with the normalized array
 * @param {(err: Error) => void} [onError]              - Optional error callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToTaskTodos(taskId, onData, onError) {
  if (!taskId) throw new Error('[todoService] subscribeToTaskTodos: taskId is required');

  return onSnapshot(
    taskDoc(taskId),
    (snap) => onData(normalizeTodos(snap.exists() ? snap.data().todos : [])),
    (err) => {
      console.error('[todoService] subscribeToTaskTodos:', err);
      if (onError) onError(err);
    }
  );
}

// ─── 2. addTodo (create) ──────────────────────────────────────────────────────

/**
 * Appends a todo item to a task.
 *
 * Uses arrayUnion so concurrent adds from different users both survive.
 *
 * @param {string} taskId
 * @param {string} text                                        - Raw user input; trimmed and validated
 * @param {{ uid: string, name?: string }} author              - Acting user (pass effectiveUid)
 * @returns {Promise<Object>} The item that was written
 */
export async function addTodo(taskId, text, author) {
  if (!taskId) throw new Error('[todoService] addTodo: taskId is required');

  const item = TodoItemSchema.parse({
    id:              makeTodoId(),
    text:            TodoTextSchema.parse(text),
    done:            false,
    createdAt:       new Date().toISOString(),
    createdBy:       author?.uid || '',
    createdByName:   author?.name || '',
    completedAt:     null,
    completedBy:     null,
    completedByName: null,
  });

  try {
    await updateDoc(taskDoc(taskId), {
      todos:     arrayUnion(item),
      updatedAt: serverTimestamp(),
    });
    return item;
  } catch (err) {
    console.error('[todoService] addTodo:', err);
    throw err;
  }
}

// ─── Transactional mutation helper ────────────────────────────────────────────

/**
 * Runs `mutate` against the task's CURRENT server-side todo array inside a
 * transaction and writes the result back. Every non-append mutation goes
 * through here so a concurrent edit can never be lost.
 *
 * @param {string} taskId
 * @param {string} label                                     - Caller name, for error logs
 * @param {(todos: Array<Object>) => Array<Object>} mutate    - Pure; may throw to abort
 * @returns {Promise<Array<Object>>} The array that was written
 */
async function mutateTodos(taskId, label, mutate) {
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(taskDoc(taskId));
      if (!snap.exists()) {
        throw new Error(`[todoService] ${label}: task ${taskId} no longer exists`);
      }

      const next = z.array(TodoItemSchema).parse(mutate(normalizeTodos(snap.data().todos)));

      tx.update(taskDoc(taskId), { todos: next, updatedAt: serverTimestamp() });
      return next;
    });
  } catch (err) {
    console.error(`[todoService] ${label}:`, err);
    throw err;
  }
}

// ─── 3. updateTodoText (update) ───────────────────────────────────────────────

/**
 * Rewrites the text of one todo item, leaving its done state and author intact.
 *
 * @param {string} taskId
 * @param {string} todoId
 * @param {string} text   - New text; trimmed and validated
 * @returns {Promise<Array<Object>>} The array that was written
 */
export async function updateTodoText(taskId, todoId, text) {
  if (!taskId) throw new Error('[todoService] updateTodoText: taskId is required');
  if (!todoId) throw new Error('[todoService] updateTodoText: todoId is required');

  // Validate before opening the transaction so bad input costs no round trip.
  const cleanText = TodoTextSchema.parse(text);

  return mutateTodos(taskId, 'updateTodoText', (current) => {
    if (!current.some((t) => t.id === todoId)) {
      throw new Error(`[todoService] updateTodoText: todo ${todoId} not found`);
    }
    return current.map((t) => (t.id === todoId ? { ...t, text: cleanText } : t));
  });
}

// ─── 4. toggleTodo (update) ───────────────────────────────────────────────────

/**
 * Flips one todo item between done and not-done, stamping who completed it and
 * when. Unchecking clears those fields again.
 *
 * The flip is computed from the server's current value inside the transaction,
 * so double-clicks and concurrent viewers can't desynchronise it.
 *
 * @param {string} taskId
 * @param {string} todoId
 * @param {{ uid: string, name?: string }} actor - Acting user (pass effectiveUid)
 * @returns {Promise<Array<Object>>} The array that was written
 */
export async function toggleTodo(taskId, todoId, actor) {
  if (!taskId) throw new Error('[todoService] toggleTodo: taskId is required');
  if (!todoId) throw new Error('[todoService] toggleTodo: todoId is required');

  return mutateTodos(taskId, 'toggleTodo', (current) => {
    const target = current.find((t) => t.id === todoId);
    if (!target) throw new Error(`[todoService] toggleTodo: todo ${todoId} not found`);

    const done = !target.done;
    return current.map((t) =>
      t.id === todoId
        ? {
            ...t,
            done,
            completedAt:     done ? new Date().toISOString() : null,
            completedBy:     done ? (actor?.uid || '') : null,
            completedByName: done ? (actor?.name || '') : null,
          }
        : t
    );
  });
}

// ─── 5. deleteTodo (delete) ───────────────────────────────────────────────────

/**
 * Removes one todo item.
 *
 * The array is rewritten rather than using arrayRemove — arrayRemove needs a
 * deep-equal copy of the element, which is brittle for arrays of maps (same
 * reason collaborationService rewrites workPartners on removal).
 *
 * @param {string} taskId
 * @param {string} todoId
 * @returns {Promise<Array<Object>>} The array that was written
 */
export async function deleteTodo(taskId, todoId) {
  if (!taskId) throw new Error('[todoService] deleteTodo: taskId is required');
  if (!todoId) throw new Error('[todoService] deleteTodo: todoId is required');

  return mutateTodos(taskId, 'deleteTodo', (current) =>
    current.filter((t) => t.id !== todoId)
  );
}
