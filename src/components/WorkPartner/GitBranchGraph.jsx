/**
 * GitBranchGraph.jsx — v3 (Authentic GitHub Network Graph)
 *
 * Visual layout (matches uploaded reference images precisely):
 *
 *  ┌─────────────┬────────────────────────────────────────────────────────┐
 *  │  master     │─────●══════════●══════════●══════════●─────────> HEAD  │
 *  │  (orange)   │      ↑ fork arc         merge arc ↑                    │
 *  │  partner1   │ - - - - ●══════●  - - - - - - - - - - - - - - - - - - │
 *  │  (blue)     │                                                        │
 *  │  partner2   │ - - - - - - - - - - ●══════● - - - - - - - - - - - - │
 *  └─────────────┴────────────────────────────────────────────────────────┘
 *
 * Each branch forks from master with an S-curve bezier and merges back.
 * Commit nodes are large filled circles with a dark inner ring (GitHub style).
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { timeFromNow } from '../../utils/dateHelpers';
import { addWorkPartner, checkCanAddPartner } from '../../services/collaborationService';
import WorkPartnerSelector from './WorkPartnerSelector';

// ─── Layout constants ─────────────────────────────────────────────────────────
const L_W    = 122;   // left panel width (label badges)
const G_PL   = 18;    // graph: left padding after label column
const G_PR   = 64;    // graph: right padding (for HEAD tag + add node)
const LANE_H = 60;    // vertical distance between lane centers
const Y_TOP  = 36;    // SVG top padding
const Y_BOT  = 28;    // SVG bottom padding
const NR     = 12;    // commit node outer radius  (big like GitHub)
const IDR    = 4.5;   // inner dark ring radius
const SL     = 82;    // slot width (px per commit node horizontal slot)

// ─── Branch color palette ─────────────────────────────────────────────────────
const COLORS = [
  { c: '#f97316', bg: 'rgba(249,115,22,0.14)', bd: 'rgba(249,115,22,0.38)' }, // orange – master
  { c: '#3b82f6', bg: 'rgba(59,130,246,0.14)',  bd: 'rgba(59,130,246,0.38)'  }, // blue
  { c: '#a855f7', bg: 'rgba(168,85,247,0.14)',  bd: 'rgba(168,85,247,0.38)'  }, // purple
  { c: '#10b981', bg: 'rgba(16,185,129,0.14)',  bd: 'rgba(16,185,129,0.38)'  }, // green
  { c: '#f59e0b', bg: 'rgba(245,158,11,0.14)',  bd: 'rgba(245,158,11,0.38)'  }, // amber
  { c: '#ec4899', bg: 'rgba(236,72,153,0.14)',  bd: 'rgba(236,72,153,0.38)'  }, // pink
];

// Event type icon map
const TYPE_ICON = {
  commit:           '◉',
  partner_added:    '👤',
  status_changed:   '⚡',
  progress_updated: '📊',
};

// ─────────────────────────────────────────────────────────────────────────────
// CommitNode — hover-aware SVG group
// ─────────────────────────────────────────────────────────────────────────────
function CommitNode({ cx, cy, r, idr, color, event, onEnter, onLeave }) {
  const [hov, setHov] = useState(false);

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={(e) => { setHov(true);  onEnter(event, e.clientX, e.clientY); }}
      onMouseLeave={() =>  { setHov(false); onLeave(); }}
    >
      {/* Outer glow ring (on hover) */}
      {hov && (
        <circle cx={cx} cy={cy} r={r + 7}
          fill="none" stroke={color} strokeWidth={1.5} opacity={0.35}
        />
      )}
      {/* Main circle — filled with branch color */}
      <circle
        cx={cx} cy={cy}
        r={hov ? r + 1.5 : r}
        fill={color}
        stroke="#0d1117"
        strokeWidth={hov ? 3 : 2.5}
        style={{ transition: 'all 0.18s ease' }}
      />
      {/* Inner dark ring — creates the hollow/"donut" look */}
      <circle
        cx={cx} cy={cy}
        r={idr}
        fill="#0d1117"
        opacity={hov ? 0 : 0.45}
        style={{ transition: 'opacity 0.18s ease' }}
      />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AddNode — dashed circle at end of master for adding partners
// ─────────────────────────────────────────────────────────────────────────────
function AddNode({ cx, cy, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <g style={{ cursor: 'pointer' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
    >
      <circle
        cx={cx} cy={cy} r={hov ? 14 : 12}
        fill={hov ? 'rgba(249,115,22,0.2)' : '#0d1117'}
        stroke="#f97316"
        strokeWidth={hov ? 2 : 1.5}
        strokeDasharray={hov ? '0' : '4 2.5'}
        style={{ transition: 'all 0.18s ease' }}
      />
      <text x={cx} y={cy + 5} textAnchor="middle"
        fontSize="16" fill="#f97316" fontWeight="700"
        style={{ userSelect: 'none', transition: 'all 0.18s ease' }}
      >+</text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip — fixed-position popup
// ─────────────────────────────────────────────────────────────────────────────
function Tooltip({ tip }) {
  if (!tip.visible || !tip.event) return null;
  const e = tip.event;
  const typeLabel = {
    commit: 'Commit', partner_added: 'Partner Added',
    status_changed: 'Status Changed', progress_updated: 'Progress Update',
  }[e.type] || e.type;

  return (
    <div style={{
      position: 'fixed', left: tip.x + 18, top: tip.y - 12,
      zIndex: 9999, pointerEvents: 'none',
    }}>
      <div style={{
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: 10, padding: '12px 14px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        minWidth: 230, maxWidth: 290,
      }}>
        {/* Type + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#f97316', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {TYPE_ICON[e.type] || '◉'} {typeLabel}
          </span>
          <span style={{ fontSize: 10, color: '#7d8590', marginLeft: 'auto' }}>
            {e.createdAt ? timeFromNow(e.createdAt) : 'just now'}
          </span>
        </div>

        {/* Message */}
        {e.message && (
          <p style={{ fontSize: 13, color: '#e6edf3', lineHeight: 1.5, margin: '0 0 10px' }}>
            {e.message}
          </p>
        )}

        {/* Status delta */}
        {e.type === 'status_changed' && e.metadata && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#7d8590', textTransform: 'capitalize' }}>{e.metadata.fromStatus}</span>
            <span style={{ color: '#f97316', fontSize: 13 }}>→</span>
            <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, textTransform: 'capitalize' }}>{e.metadata.toStatus}</span>
          </div>
        )}

        {/* Progress delta */}
        {e.type === 'progress_updated' && e.metadata && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#7d8590' }}>{e.metadata.fromProgress ?? 0}%</span>
            <span style={{ color: '#f97316', fontSize: 13 }}>→</span>
            <span style={{ fontSize: 13, color: '#10b981', fontWeight: 700 }}>{e.metadata.toProgress ?? 0}%</span>
          </div>
        )}

        {/* Drive link */}
        {e.metadata?.driveLink && (
          <a href={e.metadata.driveLink} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3b82f6', fontSize: 11, pointerEvents: 'auto', marginBottom: 8 }}
          >📎 {e.metadata.driveLinkLabel || 'View Document'}</a>
        )}

        {/* Author */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid #21262d', paddingTop: 8 }}>
          {e.authorAvatar
            ? <img src={e.authorAvatar} style={{ width: 18, height: 18, borderRadius: '50%' }} alt="" />
            : <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>
                {e.authorName?.[0]?.toUpperCase()}
              </div>
          }
          <span style={{ fontSize: 11, color: '#7d8590' }}>{e.authorName || 'System'}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GitProgressBar — segmented, GitHub-merge style
// ─────────────────────────────────────────────────────────────────────────────
function GitProgressBar({ progress = 0 }) {
  const col = progress >= 100 ? '#10b981' : progress >= 60 ? '#3b82f6' : progress >= 30 ? '#f59e0b' : '#f97316';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#7d8590', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            Task Completion
          </span>
          {progress >= 100 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '1px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
              background: 'rgba(16,185,129,0.1)', color: '#10b981',
              border: '1px solid rgba(16,185,129,0.2)',
            }}>
              ✓ Merged
            </span>
          )}
        </div>
        <span style={{ fontSize: 15, fontWeight: 900, color: col, fontVariantNumeric: 'tabular-nums' }}>
          {progress}%
        </span>
      </div>

      {/* Track */}
      <div style={{ position: 'relative', height: 7, background: '#21262d', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${col}88, ${col})`,
          boxShadow: `0 0 10px ${col}44`,
          borderRadius: 99,
          transition: 'width 0.7s cubic-bezier(.4,0,.2,1)',
        }} />
        {/* Segment dividers */}
        {[20, 40, 60, 80].map(s => (
          <div key={s} style={{
            position: 'absolute', top: 0, bottom: 0, width: 1,
            left: `${s}%`, background: 'rgba(13,17,23,0.6)',
          }} />
        ))}
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {[0, 20, 40, 60, 80, 100].map(s => (
          <span key={s} style={{ fontSize: 9, color: progress >= s ? col : '#7d8590', transition: 'color 0.5s', fontVariantNumeric: 'tabular-nums' }}>
            {s}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main GitBranchGraph component
// ─────────────────────────────────────────────────────────────────────────────
export default function GitBranchGraph({ task, events = [], loading = false, onAddPartner }) {
  const { userProfile, isAdmin } = useAuth();
  const { allUsers } = useTasks();

  const [tip,          setTip]          = useState({ visible: false, event: null, x: 0, y: 0 });
  const [showSelector, setShowSelector] = useState(false);
  const [adding,       setAdding]       = useState(false);
  const [addError,     setAddError]     = useState(null);

  const partners    = Array.isArray(task?.workPartners) ? task.workPartners : [];
  const assignees   = Array.isArray(task?.assignedTo)  ? task.assignedTo  : [];
  const canAdd      = isAdmin || checkCanAddPartner(task, userProfile?.uid);

  // ── Build lane list ─────────────────────────────────────────────────────────
  // Lane 0 = master: task creator; Lane 1, 2… = work partners / other assignees
  const masterUid  = task?.createdBy || assignees[0];
  const otherUids  = [...new Set([
    ...assignees.filter(u => u !== masterUid),
    ...partners.map(p => p.uid).filter(u => u !== masterUid),
  ])];
  const laneUids   = [masterUid, ...otherUids].filter(Boolean);

  const getLaneInfo = (uid) => {
    const u = allUsers[uid] || {};
    const p = partners.find(q => q.uid === uid) || {};
    return {
      name:      u.name   || p.name   || uid?.slice(0, 8) || '?',
      avatar:    u.avatar || p.avatar || '',
      isMaster:  uid === masterUid,
      isCurrent: uid === userProfile?.uid,
    };
  };

  // ── Position events ────────────────────────────────────────────────────────
  // For `partner_added` events: place the node on the TARGET partner's lane
  // so their branch visually shows a "joined" commit.
  const getLaneIdx = (uid) => {
    const i = laneUids.indexOf(uid);
    return i >= 0 ? i : 0;
  };

  const getEventLaneIdx = (e) => {
    // partner_added: the event belongs on the new partner's lane
    if (e.type === 'partner_added' && e.metadata?.targetUid) {
      const idx = laneUids.indexOf(e.metadata.targetUid);
      if (idx > 0) return idx;
    }
    return getLaneIdx(e.authorUid);
  };

  const posEvents = events.map((e, i) => {
    const laneIdx = getEventLaneIdx(e);
    return {
      ...e,
      laneIdx,
      slotIdx: i,
      col: COLORS[laneIdx % COLORS.length],
    };
  });

  // ── SVG dimensions ─────────────────────────────────────────────────────────
  const numLanes = Math.max(1, laneUids.length);
  const numSlots = events.length;
  const graphW   = G_PL + Math.max(3, numSlots + 2) * SL + G_PR;
  const svgW     = L_W + graphW;
  const svgH     = Y_TOP + numLanes * LANE_H + Y_BOT;

  const gX  = (slot) => L_W + G_PL + (slot + 1) * SL;  // node x
  const gY  = (lane) => Y_TOP + lane * LANE_H;           // lane y
  const mY  = gY(0);                                      // master Y
  const eX  = gX(numSlots);                               // end X (after last node)

  // ── Fork/merge extents per branch lane ────────────────────────────────────
  const branchInfo = laneUids.slice(1).map((uid, i) => {
    const li = i + 1;
    const le = posEvents.filter(e => e.laneIdx === li);
    if (!le.length) return null;
    return { li, firstX: gX(le[0].slotIdx), lastX: gX(le[le.length - 1].slotIdx) };
  }).filter(Boolean);

  // ── S-curve path helper ────────────────────────────────────────────────────
  // Creates a smooth bezier curve between (x1,y1) and (x2,y2)
  const scurve = (x1, y1, x2, y2) => {
    const dy   = Math.abs(y2 - y1);
    const cp   = Math.min(dy * 0.55, SL * 0.52);
    return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;
  };

  // ── Event handlers ─────────────────────────────────────────────────────────
  const showTip = useCallback((ev, cx, cy) => setTip({ visible: true, event: ev, x: cx, y: cy }), []);
  const hideTip = useCallback(() => setTip(p => ({ ...p, visible: false })), []);

  const handleSelect = async (sel) => {
    setShowSelector(false);
    setAdding(true);
    setAddError(null);
    try {
      await addWorkPartner(
        task.id,
        { uid: sel.uid, name: sel.name, avatar: sel.avatar || '' },
        { uid: userProfile.uid, name: userProfile.name, avatar: userProfile.avatar || '' }
      );
      onAddPartner?.();
    } catch {
      setAddError('Could not add partner. Try again.');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 12, padding: 20 }}>
        <div style={{ height: 14, background: '#21262d', borderRadius: 6, width: '30%', marginBottom: 14 }} />
        <div style={{ height: 100, background: '#161b22', borderRadius: 10 }} />
      </div>
    );
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #21262d',
      borderRadius: 12,
      overflow: 'hidden',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
    }}>

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '11px 16px',
        borderBottom: '1px solid #21262d',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Git branch icon */}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="#f97316">
            <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z" />
          </svg>
          <span style={{ color: '#e6edf3', fontWeight: 700, fontSize: 13 }}>Network Graph</span>
          <span style={{
            background: '#21262d', border: '1px solid #30363d',
            borderRadius: 12, padding: '1px 8px', fontSize: 11, color: '#7d8590',
          }}>
            {events.length} commits
          </span>
        </div>

        {/* Add Branch button */}
        {canAdd && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSelector(v => !v)}
              disabled={adding}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 6,
                border: '1px solid rgba(249,115,22,0.4)',
                background: 'rgba(249,115,22,0.1)',
                color: '#f97316', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', outline: 'none',
              }}
            >
              {adding
                ? <svg style={{ width: 12, height: 12, animation: 'spin 0.8s linear infinite' }} fill="none" viewBox="0 0 24 24">
                    <circle opacity=".25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path opacity=".75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                : <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                  </svg>
              }
              Add Branch
            </button>
            {showSelector && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, zIndex: 9999 }}>
                <WorkPartnerSelector
                  currentPartners={partners}
                  currentUserUid={userProfile?.uid}
                  onSelect={handleSelect}
                  onClose={() => setShowSelector(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SVG graph area ─────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', background: '#0d1117' }}>
        {events.length === 0 ? (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 10 }}>
            <svg width="38" height="38" viewBox="0 0 16 16" fill="#21262d">
              <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/>
            </svg>
            <p style={{ color: '#7d8590', fontSize: 13 }}>No commits yet — push your first update!</p>
            {canAdd && (
              <button
                onClick={() => setShowSelector(true)}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px dashed rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.08)', color: '#f97316', fontSize: 12, cursor: 'pointer' }}
              >+ Add first work partner</button>
            )}
          </div>
        ) : (
          /* The SVG graph */
          <svg
            width={svgW} height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ display: 'block', minWidth: svgW }}
          >
            <defs>
              {/* Per-lane glow filter */}
              {COLORS.map((col, i) => (
                <filter key={i} id={`g${i}`} x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="2.5" result="b"/>
                  <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              ))}
              {/* Clip graph area (right of label column) */}
              <clipPath id="gc">
                <rect x={L_W} y={0} width={graphW} height={svgH}/>
              </clipPath>
            </defs>

            {/* ── Left label column ────────────────────────────────────────── */}
            {/* Background */}
            <rect x={0} y={0} width={L_W} height={svgH} fill="#0d1117" />
            {/* Right border of label column */}
            <line x1={L_W - 0.5} y1={Y_TOP - 10} x2={L_W - 0.5} y2={svgH - Y_BOT + 10}
              stroke="#21262d" strokeWidth={1} />

            {/* Branch label badges */}
            {laneUids.map((uid, i) => {
              const info = getLaneInfo(uid);
              const col  = COLORS[i % COLORS.length];
              const y    = gY(i);
              const lx   = 8, ly = y - 13, lw = L_W - 18, lh = 26;
              const label = info.isMaster
                ? (info.isCurrent ? 'master (you)' : 'master')
                : (info.isCurrent ? `${info.name.split(' ')[0]} (you)` : info.name.split(' ')[0]);

              return (
                <g key={uid}>
                  {/* Label badge rectangle */}
                  <rect
                    x={lx} y={ly} width={lw} height={lh} rx={5}
                    fill={col.bg} stroke={col.bd} strokeWidth={1.2}
                  />
                  {/* Label text */}
                  <text
                    x={lx + lw / 2} y={y + 5}
                    textAnchor="middle"
                    fontSize="10.5" fontWeight="700"
                    fill={col.c}
                    fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
                  >
                    {label.length > 13 ? label.slice(0, 12) + '…' : label}
                  </text>
                  {/* Connector dot (label → track join) */}
                  <circle cx={L_W - 1} cy={y} r={3} fill={col.c} opacity={0.6} />
                </g>
              );
            })}

            {/* ── Graph area (clipped) ──────────────────────────────────────── */}
            <g clipPath="url(#gc)">

              {/* Dotted background tracks for each lane */}
              {laneUids.map((uid, i) => {
                const col = COLORS[i % COLORS.length];
                const y   = gY(i);
                if (i === 0) {
                  // Master: solid line full width
                  return (
                    <line key={uid}
                      x1={L_W} y1={y} x2={svgW - G_PR / 2} y2={y}
                      stroke={col.c} strokeWidth={1.5} strokeOpacity={0.22}
                    />
                  );
                }
                // Branch: dashed, only in active range
                const bd = branchInfo.find(b => b.li === i);
                if (!bd) return null;
                return (
                  <line key={uid}
                    x1={bd.firstX - SL * 0.2} y1={y}
                    x2={bd.lastX  + SL * 0.2} y2={y}
                    stroke={col.c} strokeWidth={1.2} strokeOpacity={0.22}
                    strokeDasharray="5 5"
                  />
                );
              })}

              {/* Fork arcs (master → branch) */}
              {branchInfo.map(bd => {
                const col   = COLORS[bd.li % COLORS.length];
                const ly    = gY(bd.li);
                const forkX = bd.firstX - SL * 0.6;
                return (
                  <path key={`fk-${bd.li}`}
                    d={scurve(forkX, mY, bd.firstX, ly)}
                    fill="none"
                    stroke={col.c} strokeWidth={2} strokeOpacity={0.85}
                    filter={`url(#g${bd.li % COLORS.length})`}
                  />
                );
              })}

              {/* Merge arcs (branch → master) */}
              {branchInfo.map(bd => {
                const col    = COLORS[bd.li % COLORS.length];
                const ly     = gY(bd.li);
                const mergeX = bd.lastX + SL * 0.6;
                return (
                  <path key={`mg-${bd.li}`}
                    d={scurve(bd.lastX, ly, mergeX, mY)}
                    fill="none"
                    stroke={col.c} strokeWidth={2} strokeOpacity={0.85}
                    filter={`url(#g${bd.li % COLORS.length})`}
                  />
                );
              })}

              {/* Horizontal connecting lines between consecutive events on same lane */}
              {laneUids.map((uid, i) => {
                const le  = posEvents.filter(e => e.laneIdx === i);
                const col = COLORS[i % COLORS.length];
                const y   = gY(i);
                if (le.length < 2) return null;
                return le.slice(0, -1).map((ev, j) => (
                  <line key={`seg-${i}-${j}`}
                    x1={gX(ev.slotIdx)} y1={y}
                    x2={gX(le[j + 1].slotIdx)} y2={y}
                    stroke={col.c} strokeWidth={2.5} strokeOpacity={0.9}
                    filter={`url(#g${i % COLORS.length})`}
                  />
                ));
              })}

              {/* Commit nodes */}
              {posEvents.map(e => (
                <CommitNode
                  key={e.id}
                  cx={gX(e.slotIdx)}
                  cy={gY(e.laneIdx)}
                  r={NR}
                  idr={IDR}
                  color={e.col.c}
                  event={e}
                  onEnter={showTip}
                  onLeave={hideTip}
                />
              ))}

              {/* Add-partner dashed node at end of master */}
              {canAdd && (
                <AddNode
                  cx={eX}
                  cy={mY}
                  onClick={() => setShowSelector(v => !v)}
                />
              )}

              {/* HEAD tag */}
              <g>
                <rect
                  x={eX + NR + 7} y={mY - 12}
                  width={38} height={24} rx={5}
                  fill="#161b22" stroke="#30363d" strokeWidth={1}
                />
                <text
                  x={eX + NR + 7 + 19} y={mY + 5}
                  textAnchor="middle"
                  fontSize="9.5" fontWeight="700"
                  fill="#f97316"
                  fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
                >HEAD</text>
              </g>

              {/* Version / milestone labels below master commit nodes */}
              {posEvents
                .filter(e => e.laneIdx === 0 && (e.type === 'progress_updated' || e.type === 'status_changed'))
                .map(e => {
                  const x = gX(e.slotIdx);
                  const label =
                    e.type === 'progress_updated'
                      ? `${e.metadata?.toProgress ?? 0}%`
                      : (e.metadata?.toStatus || '').slice(0, 6);
                  return (
                    <g key={`lbl-${e.id}`}>
                      <rect
                        x={x - 18} y={mY + NR + 4}
                        width={36} height={18} rx={3}
                        fill="#161b22" stroke="#30363d" strokeWidth={1}
                      />
                      <text
                        x={x} y={mY + NR + 17}
                        textAnchor="middle"
                        fontSize="9" fontWeight="600"
                        fill="#7d8590"
                        fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
                      >{label}</text>
                    </g>
                  );
                })
              }
            </g>
          </svg>
        )}
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #21262d' }}>
        <GitProgressBar progress={task?.progress || 0} />
      </div>

      {/* Error */}
      {addError && (
        <div style={{ margin: '0 16px 14px', padding: '8px 12px', borderRadius: 8, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149', fontSize: 12 }}>
          {addError}
        </div>
      )}

      {/* Tooltip */}
      <Tooltip tip={tip} />
    </div>
  );
}
