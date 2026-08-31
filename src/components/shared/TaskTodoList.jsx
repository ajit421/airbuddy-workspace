/**
 * TaskTodoList.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Per-task checklist with full CRUD — add items, check/uncheck them, edit the
 *   text inline, delete them. Lives inside TaskDetailModal alongside the
 *   Progress, Work Partners and Activity Feed sections.
 *
 * DATA:
 *   Real-time via useTaskTodos(task) -> todoService. The whole work item is passed,
 *   not just its id, so a roadmap milestone resolves to roadmapNodes/{id} — see
 *   src/utils/workItemRef.js. The list is read from a
 *   live listener on the task document rather than from the `task` prop, because
 *   the detail modal is handed a snapshot captured at click time.
 *
 * PERMISSIONS:
 *   canManageTodos() gates every affordance (admins, creator, assignees, work
 *   partners). Everyone else gets the same list read-only. firestore.rules is
 *   the real boundary.
 *
 * MOBILE:
 *   Row actions are always visible — never hover-only — so they are reachable
 *   on touch devices, and every control is at least a 32px tap target.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTaskTodos } from '../../hooks/useTaskTodos';
import {
  addTodo,
  toggleTodo,
  updateTodoText,
  deleteTodo,
  getTodoStats,
  TODO_MAX_LENGTH,
} from '../../services/todoService';
import { canManageTodos } from '../../utils/permissions';

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const PencilIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/**
 * Turns a Firestore/permission error into something a user can act on.
 *
 * @param {Error} err
 * @returns {string}
 */
function friendlyError(err) {
  if (err?.code === 'permission-denied') {
    return 'You do not have permission to change this checklist.';
  }
  // Zod validation errors surface their first issue message
  if (err?.issues?.[0]?.message) return err.issues[0].message;
  return err?.message || 'Something went wrong. Please try again.';
}

// ─── Single row ───────────────────────────────────────────────────────────────

/**
 * Inline edit form. Deliberately a separate component: it mounts when editing
 * starts, so `useState(initialText)` always seeds from the current text. Keeping
 * the draft in TodoRow would seed it at row-mount time and go stale if someone
 * else edited the item in the meantime.
 */
function TodoEditForm({ initialText, busy, onSave, onCancel }) {
  const [draft, setDraft] = useState(initialText);

  const save = () => {
    const next = draft.trim();
    if (!next || next === initialText) {
      onCancel();
      return;
    }
    onSave(next);
  };

  return (
    <li className="flex items-start gap-2 py-1.5">
      <input
        type="text"
        className="input-field flex-1 min-w-0 text-sm py-1.5"
        value={draft}
        maxLength={TODO_MAX_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onCancel();
        }}
        aria-label="Edit todo item"
        autoFocus
      />
      <button
        onClick={save}
        disabled={busy || !draft.trim()}
        title="Save"
        aria-label="Save todo item"
        className="flex items-center justify-center w-8 h-8 rounded-lg text-green-400 hover:text-green-300 hover:bg-green-500/10 transition-colors disabled:opacity-40"
      >
        <CheckIcon />
      </button>
      <button
        onClick={onCancel}
        disabled={busy}
        title="Cancel"
        aria-label="Cancel editing"
        className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surfaceHover transition-colors disabled:opacity-40"
      >
        <CloseIcon />
      </button>
    </li>
  );
}

// ─── Single row ───────────────────────────────────────────────────────────────

function TodoRow({ todo, canEdit, busy, onToggle, onStartEdit, onDelete }) {
  return (
    <li className={`flex items-start gap-2 py-1.5 rounded-lg transition-opacity ${busy ? 'opacity-50' : ''}`}>
      {/* Checkbox — padded label so the tap target is ~32px on touch */}
      <label className="flex items-center justify-center w-8 h-8 -ml-1.5 flex-shrink-0 cursor-pointer">
        <input
          type="checkbox"
          checked={todo.done}
          disabled={!canEdit || busy}
          onChange={onToggle}
          className="w-4 h-4 accent-orange cursor-pointer disabled:cursor-not-allowed"
          aria-label={todo.done ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
        />
      </label>

      <p
        className={`flex-1 min-w-0 text-sm leading-relaxed break-words pt-1.5 ${
          todo.done ? 'text-text-muted line-through' : 'text-text-secondary'
        }`}
        title={
          todo.done && todo.completedByName
            ? `Completed by ${todo.completedByName}`
            : todo.createdByName
              ? `Added by ${todo.createdByName}`
              : undefined
        }
      >
        {todo.text}
      </p>

      {canEdit && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={onStartEdit}
            disabled={busy}
            title="Edit item"
            aria-label={`Edit "${todo.text}"`}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
          >
            <PencilIcon />
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            title="Delete item"
            aria-label={`Delete "${todo.text}"`}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export default function TaskTodoList({ task }) {
  const { userProfile, effectiveUid } = useAuth();
  const { todos, loading, error } = useTaskTodos(task);

  const [newText, setNewText]     = useState('');
  const [adding, setAdding]       = useState(false);
  const [busyId, setBusyId]       = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [writeError, setWriteError] = useState(null);
  // Optimistic done-state overrides, keyed by todo id. Toggles go through a
  // Firestore transaction, which — unlike updateDoc — does NOT update the local
  // cache before the server acks, so without this the checkbox would sit still
  // for a round trip. Each entry is dropped as soon as its write settles and the
  // subscription becomes the source of truth again.
  const [pendingDone, setPendingDone] = useState({});

  if (!task) return null;

  const canEdit = canManageTodos(task, userProfile);
  const actor   = { uid: effectiveUid || userProfile?.uid || '', name: userProfile?.name || userProfile?.email || 'Unknown' };

  const visibleTodos = todos.map((t) =>
    t.id in pendingDone ? { ...t, done: pendingDone[t.id] } : t
  );
  const stats = getTodoStats(visibleTodos);

  const clearPending = (todoId) =>
    setPendingDone(({ [todoId]: _dropped, ...rest }) => rest);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text || adding) return;
    setAdding(true);
    setWriteError(null);
    try {
      await addTodo(task, text, actor);
      setNewText('');
    } catch (err) {
      setWriteError(friendlyError(err));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (todo) => {
    setPendingDone((prev) => ({ ...prev, [todo.id]: !todo.done }));
    setWriteError(null);
    try {
      await toggleTodo(task, todo.id, actor);
    } catch (err) {
      setWriteError(friendlyError(err));
    } finally {
      // Hand control back to the live subscription, whether the write landed or not.
      clearPending(todo.id);
    }
  };

  const handleSaveEdit = async (todo, text) => {
    setBusyId(todo.id);
    setWriteError(null);
    try {
      await updateTodoText(task, todo.id, text);
      setEditingId(null);
    } catch (err) {
      setWriteError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (todo) => {
    setBusyId(todo.id);
    setWriteError(null);
    try {
      await deleteTodo(task, todo.id);
      if (editingId === todo.id) setEditingId(null);
    } catch (err) {
      setWriteError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {/* Header — title + completion count */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
          Todo List
          {stats.total > 0 && (
            <span className={`badge ${stats.done === stats.total ? 'badge-completed' : 'badge-orange'}`}>
              {stats.done}/{stats.total}
            </span>
          )}
        </h4>
        {stats.total > 0 && (
          <span className="text-xs font-bold text-text-primary flex-shrink-0">{stats.percent}%</span>
        )}
      </div>

      {/* Checklist completion bar — independent of task progress */}
      {stats.total > 0 && (
        <div className="progress-bar mb-3">
          <div
            className={`progress-fill ${stats.done === stats.total ? 'bg-green-500' : 'bg-orange'}`}
            style={{ width: `${stats.percent}%` }}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-muted italic py-1">Loading checklist...</p>
      ) : error ? (
        <p className="text-sm text-red-400 py-1">{error}</p>
      ) : (
        <>
          {visibleTodos.length === 0 ? (
            <p className="text-sm text-text-muted italic py-1">
              {canEdit
                ? 'No todos yet. Break this task down into smaller steps below.'
                : 'No todos yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-borderLight">
              {visibleTodos.map((todo) =>
                editingId === todo.id ? (
                  <TodoEditForm
                    key={todo.id}
                    initialText={todo.text}
                    busy={busyId === todo.id}
                    onSave={(text) => handleSaveEdit(todo, text)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    canEdit={canEdit}
                    busy={busyId === todo.id}
                    onToggle={() => handleToggle(todo)}
                    onStartEdit={() => { setEditingId(todo.id); setWriteError(null); }}
                    onDelete={() => handleDelete(todo)}
                  />
                )
              )}
            </ul>
          )}

          {/* Add form */}
          {canEdit && (
            <div className="flex items-start gap-2 mt-3">
              <input
                id="todo-new-input"
                type="text"
                className="input-field flex-1 min-w-0 text-sm py-1.5"
                placeholder="Add a checklist item..."
                value={newText}
                maxLength={TODO_MAX_LENGTH}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                aria-label="New todo item"
              />
              <button
                id="todo-add-btn"
                onClick={handleAdd}
                disabled={adding || !newText.trim()}
                className="btn-primary text-xs py-2 px-3 flex-shrink-0 disabled:opacity-50"
              >
                <PlusIcon />
                <span className="hidden sm:inline">{adding ? 'Adding...' : 'Add'}</span>
              </button>
            </div>
          )}

          {writeError && <p className="text-xs text-red-400 mt-2">{writeError}</p>}
        </>
      )}
    </div>
  );
}
