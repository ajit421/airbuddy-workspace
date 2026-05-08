import { useReducer, useMemo } from 'react';
import { toDate } from '../utils/dateHelpers';

const initialState = {
  statusFilter: 'all',
  sortOrder: 'status_asc',
  priorities: ['high', 'medium', 'low'],
  workPartnerUid: 'all',
  employeeUid: 'all',
  filtersOpen: false,
};

function filterReducer(state, action) {
  switch (action.type) {
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.payload };
    case 'SET_SORT_ORDER':
      return { ...state, sortOrder: action.payload };
    case 'TOGGLE_PRIORITY': {
      const newPriorities = state.priorities.includes(action.payload)
        ? state.priorities.filter(p => p !== action.payload)
        : [...state.priorities, action.payload];
      return { ...state, priorities: newPriorities };
    }
    case 'SET_WORK_PARTNER':
      return { ...state, workPartnerUid: action.payload };
    case 'SET_EMPLOYEE':
      return { ...state, employeeUid: action.payload };
    case 'TOGGLE_FILTERS_OPEN':
      return { ...state, filtersOpen: !state.filtersOpen };
    case 'RESET_FILTERS':
      return { ...initialState, filtersOpen: state.filtersOpen, statusFilter: state.statusFilter };
    default:
      return state;
  }
}

export function useTaskFilters(tasks, allUsers, isAdmin) {
  const [state, dispatch] = useReducer(filterReducer, initialState);

  // Derived data
  const employeeList = useMemo(() => {
    return Object.entries(allUsers || {})
      .map(([uid, u]) => ({ uid: u.uid || uid, name: u.name, avatar: u.avatar }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allUsers]);

  const { filteredTasks, workPartners, taskCountByStatus } = useMemo(() => {
    // Add original index for stable sort tiebreaker
    let processed = tasks.map((t, index) => ({ ...t, _origIndex: index }));

    // Step 1 - Employee filter (admin only)
    if (isAdmin && state.employeeUid !== 'all') {
      processed = processed.filter(t => {
        const assignees = Array.isArray(t.assignedTo) 
          ? t.assignedTo 
          : t.assignedTo ? [t.assignedTo] : [];
        const partnerUids = Array.isArray(t.workPartnerUids) ? t.workPartnerUids : [];
        const partnerObjs = Array.isArray(t.workPartners) ? t.workPartners.map(p => p.uid) : [];
        
        return assignees.includes(state.employeeUid) || 
               t.createdBy === state.employeeUid ||
               partnerUids.includes(state.employeeUid) ||
               partnerObjs.includes(state.employeeUid);
      });
    }

    // Step 6 (derived from step 1 output) - Derive workPartners list
    const wpMap = new Map();
    processed.forEach(t => {
      if (Array.isArray(t.workPartners)) {
        t.workPartners.forEach(p => {
          if (p && p.uid) wpMap.set(p.uid, p);
        });
      }
    });
    const derivedWorkPartners = Array.from(wpMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Step 2 - Priority filter
    if (state.priorities.length < 3) {
      processed = processed.filter(t => state.priorities.includes(t.priority));
    }

    // Step 3 - Work-partner filter
    if (state.workPartnerUid !== 'all') {
      processed = processed.filter(t => 
        Array.isArray(t.workPartners) && 
        t.workPartners.some(p => p.uid === state.workPartnerUid)
      );
    }

    // Compute taskCountByStatus AFTER filters (except status filter)
    const countByStatus = {
      all: processed.length,
      'in-progress': 0,
      'pending': 0,
      'completed': 0,
    };
    processed.forEach(t => {
      if (countByStatus[t.status] !== undefined) {
        countByStatus[t.status]++;
      }
    });

    // Step 4 - Status tab filter
    if (state.statusFilter !== 'all') {
      processed = processed.filter(t => t.status === state.statusFilter);
    }

    // Precompute dates for sorting
    const dueDateMap = new Map();
    const createdMap = new Map();
    processed.forEach(t => {
      try { dueDateMap.set(t.id, toDate(t.dueDate)?.getTime() ?? null); } catch { dueDateMap.set(t.id, null); }
      try { createdMap.set(t.id, toDate(t.createdAt)?.getTime() ?? null); } catch { createdMap.set(t.id, null); }
    });

    const STATUS_ORDER = { 'in-progress': 0, 'pending': 1, 'completed': 2 };

    // Step 5 - Sort
    processed.sort((a, b) => {
      let cmp = 0;
      const dueA = dueDateMap.get(a.id);
      const dueB = dueDateMap.get(b.id);
      const aDue = dueA !== null ? dueA : Infinity;
      const bDue = dueB !== null ? dueB : Infinity;

      const createdA = createdMap.get(a.id);
      const createdB = createdMap.get(b.id);

      switch (state.sortOrder) {
        case 'status_asc':
          if (state.statusFilter === 'all') {
            const statA = STATUS_ORDER[a.status] ?? 99;
            const statB = STATUS_ORDER[b.status] ?? 99;
            if (statA !== statB) {
              cmp = statA - statB;
            } else {
              cmp = aDue - bDue;
            }
          } else {
            cmp = aDue - bDue;
          }
          break;
        case 'due_asc':
          cmp = aDue - bDue;
          break;
        case 'due_desc': {
          const aDueD = dueA !== null ? dueA : -Infinity;
          const bDueD = dueB !== null ? dueB : -Infinity;
          cmp = bDueD - aDueD;
          break;
        }
        case 'created_asc': {
          const aCA = createdA !== null ? createdA : Infinity;
          const bCA = createdB !== null ? createdB : Infinity;
          cmp = aCA - bCA;
          break;
        }
        case 'created_desc': {
          const aCD = createdA !== null ? createdA : 0;
          const bCD = createdB !== null ? createdB : 0;
          cmp = bCD - aCD;
          break;
        }
        default:
          break;
      }

      if (cmp === 0) {
        return a._origIndex - b._origIndex;
      }
      return cmp;
    });

    return {
      filteredTasks: processed,
      workPartners: derivedWorkPartners,
      taskCountByStatus: countByStatus
    };
  }, [tasks, state, isAdmin]);

  const setStatusFilter = (val) => dispatch({ type: 'SET_STATUS_FILTER', payload: val });
  const setSortOrder = (val) => dispatch({ type: 'SET_SORT_ORDER', payload: val });
  const togglePriority = (val) => dispatch({ type: 'TOGGLE_PRIORITY', payload: val });
  const setWorkPartner = (val) => dispatch({ type: 'SET_WORK_PARTNER', payload: val });
  const setEmployee = (val) => dispatch({ type: 'SET_EMPLOYEE', payload: val });
  const toggleFiltersOpen = () => dispatch({ type: 'TOGGLE_FILTERS_OPEN' });
  const resetFilters = () => dispatch({ type: 'RESET_FILTERS' });

  const isFilterActive = 
    state.sortOrder !== 'status_asc' ||
    state.priorities.length !== 3 ||
    state.workPartnerUid !== 'all' ||
    (isAdmin && state.employeeUid !== 'all');

  return {
    state,
    filteredTasks,
    workPartners,
    employeeList,
    setStatusFilter,
    setSortOrder,
    togglePriority,
    setWorkPartner,
    setEmployee,
    toggleFiltersOpen,
    resetFilters,
    isFilterActive,
    taskCountByStatus,
  };
}
