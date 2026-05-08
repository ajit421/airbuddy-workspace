import { useState, useEffect, useRef } from 'react';

function EmployeeDropdown({ value, onChange, employeeList }) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const selectedEmployee = employeeList.find(e => e.uid === value);

  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      return;
    }
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const optionsLength = employeeList.length + 1; // +1 for "All employees"

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < optionsLength - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex === 0) {
        onChange('all');
      } else if (focusedIndex > 0) {
        onChange(employeeList[focusedIndex - 1].uid);
      }
      setIsOpen(false);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusedIndex, isOpen]);

  return (
    <div className="relative min-w-[160px]" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="
          flex items-center gap-2 bg-surface border border-border rounded-lg
          pl-3 pr-8 py-1.5 text-xs font-medium text-text-primary
          focus:outline-none focus:border-orange focus:ring-1 focus:ring-orange
          cursor-pointer transition-colors hover:border-orange/30 w-full
        "
      >
        {value === 'all' || !selectedEmployee ? (
          <>
            <div className="w-4 h-4 rounded-full bg-border flex items-center justify-center flex-shrink-0 text-text-muted">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <span className="truncate">All employees</span>
          </>
        ) : (
          <>
            <img src={selectedEmployee.avatar} alt="" className="w-4 h-4 rounded-full flex-shrink-0 object-cover" />
            <span className="truncate">{selectedEmployee.name}</span>
          </>
        )}
        <svg className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          className="
            absolute top-full mt-1 left-0 z-50 w-56 min-w-full
            bg-surface border border-border rounded-xl shadow-lg overflow-y-auto max-h-56
          "
        >
          <li
            role="option"
            aria-selected={value === 'all'}
            onClick={() => { onChange('all'); setIsOpen(false); }}
            className={`
              flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors
              hover:bg-surfaceHover
              ${value === 'all' ? 'bg-orange/10 text-orange' : 'text-text-primary'}
              ${focusedIndex === 0 ? 'bg-surfaceHover' : ''}
            `}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${value === 'all' ? 'bg-orange/20 text-orange' : 'bg-border text-text-muted'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <span className="truncate">All employees</span>
            {value === 'all' && <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
          </li>
          
          {employeeList.map((emp, index) => {
            const isSelected = value === emp.uid;
            const isFocused = focusedIndex === index + 1;
            return (
              <li
                key={emp.uid}
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(emp.uid); setIsOpen(false); }}
                className={`
                  flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors
                  hover:bg-surfaceHover
                  ${isSelected ? 'bg-orange/10 text-orange' : 'text-text-primary'}
                  ${isFocused ? 'bg-surfaceHover' : ''}
                `}
              >
                <img src={emp.avatar} alt="" className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                <span className="truncate">{emp.name}</span>
                {isSelected && <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * @param {{
 *   state: any,
 *   isAdmin: boolean,
 *   workPartners: {uid: string, name: string, avatar: string}[],
 *   employeeList: {uid: string, name: string, avatar: string}[],
 *   isFilterActive: boolean,
 *   setSortOrder: function,
 *   togglePriority: function,
 *   setWorkPartner: function,
 *   setEmployee: function,
 *   resetFilters: function
 * }} props
 */
export default function TaskFilterBar({
  state,
  isAdmin,
  workPartners,
  employeeList,
  isFilterActive,
  setSortOrder,
  togglePriority,
  setWorkPartner,
  setEmployee,
  resetFilters,
}) {
  return (
    <div 
      className={`transition-all duration-300 ease-in-out ${state.filtersOpen ? 'max-h-96 opacity-100 mb-4 overflow-visible' : 'max-h-0 opacity-0 mb-0 overflow-hidden'}`}
    >
      <div className="bg-surface border border-border rounded-xl p-3 flex flex-col sm:flex-row gap-3 sm:items-center">
        
        {/* Priority Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { id: 'high', label: 'High', color: 'bg-red-500' },
            { id: 'medium', label: 'Medium', color: 'bg-yellow-500' },
            { id: 'low', label: 'Low', color: 'bg-blue-500' },
          ].map(p => {
            const isSelected = state.priorities.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePriority(p.id)}
                aria-pressed={isSelected}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all border focus:outline-none focus:ring-1 focus:ring-orange
                  ${isSelected
                    ? 'bg-orange/15 border-orange/40 text-orange'
                    : 'bg-surface border-border text-text-muted hover:border-orange/30 hover:text-text-secondary'
                  }
                `}
              >
                <span className={`w-2 h-2 rounded-full ${p.color}`} />
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Spacing for desktop */}
        <div className="hidden sm:block flex-1" />

        {/* Dropdowns */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          
          {/* Employee Dropdown (Admin only) */}
          {isAdmin && (
            <EmployeeDropdown
              value={state.employeeUid}
              onChange={setEmployee}
              employeeList={employeeList}
            />
          )}

          {/* Work Partner Dropdown */}
          <div className="relative min-w-[140px]">
            <select
              value={state.workPartnerUid}
              onChange={e => setWorkPartner(e.target.value)}
              disabled={workPartners.length === 0}
              className="
                appearance-none bg-surface border border-border rounded-lg
                pl-3 pr-8 py-1.5 text-xs font-medium text-text-primary w-full
                focus:outline-none focus:border-orange focus:ring-1 focus:ring-orange
                cursor-pointer transition-colors hover:border-orange/30
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <option value="all">All partners</option>
              {workPartners.length === 0 ? (
                <option value="" disabled>No partners</option>
              ) : (
                workPartners.map(wp => (
                  <option key={wp.uid} value={wp.uid}>{wp.name}</option>
                ))
              )}
            </select>
            <svg className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Sort Order Dropdown */}
          <div className="relative min-w-[140px]">
            <select
              value={state.sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              className="
                appearance-none bg-surface border border-border rounded-lg
                pl-3 pr-8 py-1.5 text-xs font-medium text-text-primary w-full
                focus:outline-none focus:border-orange focus:ring-1 focus:ring-orange
                cursor-pointer transition-colors hover:border-orange/30
              "
            >
              <option value="status_asc">Status (default)</option>
              <option value="due_asc">Due date ↑</option>
              <option value="due_desc">Due date ↓</option>
              <option value="created_desc">Newest first</option>
              <option value="created_asc">Oldest first</option>
            </select>
            <svg className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Reset Filters */}
          {isFilterActive && (
            <button
              onClick={resetFilters}
              aria-label="Reset all filters"
              className="text-text-muted hover:text-text-primary p-1 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-orange self-end sm:self-auto"
              title="Reset filters"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
