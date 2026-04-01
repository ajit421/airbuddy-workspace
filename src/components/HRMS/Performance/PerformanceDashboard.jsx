/**
 * PerformanceDashboard.jsx
 * HRMS — Performance Tracker (100 % real Firestore data, zero mock data)
 *
 * Data source: `performances` collection in Firestore
 * Schema per review doc:
 *   { uid, employeeName, reviewedBy, period,
 *     skills: { communication, technical, leadership, teamwork, punctuality },
 *     goalsAssigned, goalsCompleted, notes, createdAt }
 *
 * Employee view   → their own reviews (Radar = latest skills, Bar = goals by period)
 * Admin view      → employee picker + "Add Review" modal + same charts for selected user
 *
 * NO mock/fake data anywhere. Empty states guide the admin to add the first review.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { Radar, Bar } from 'react-chartjs-2';
import { useAuth } from '../../../context/AuthContext';
import {
  getMyPerformanceReviews,
  getAllPerformanceReviews,
  addPerformanceReview,
  getAllEmployees,
} from '../../../services/hrmsService';

// Register Chart.js elements once at module level (safe for HMR)
ChartJS.register(
  RadialLinearScale, PointElement, LineElement, Filler,
  Tooltip, Legend, CategoryScale, LinearScale, BarElement,
);

// ─── Design tokens (RGBA — Canvas cannot read CSS custom properties) ──────────
const C = {
  orange:      'rgba(249,115,22,1)',
  orangeFill:  'rgba(249,115,22,0.18)',
  blue:        'rgba(99,179,237,1)',
  blueFill:    'rgba(99,179,237,0.55)',
  gridLine:    'rgba(255,255,255,0.06)',
  tickColor:   'rgba(148,163,184,0.8)',
  labelColor:  '#cbd5e1',
  tooltipBg:   'rgba(15,23,42,0.96)',
};

// ─── Skill meta ───────────────────────────────────────────────────────────────
const SKILL_KEYS   = ['communication', 'technical', 'leadership', 'teamwork', 'punctuality'];
const SKILL_LABELS = ['Communication', 'Technical', 'Leadership', 'Teamwork', 'Punctuality'];

// ─── Chart options ────────────────────────────────────────────────────────────
const RADAR_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: C.tooltipBg, borderColor: C.orange, borderWidth: 1,
      titleColor: '#f1f5f9', bodyColor: C.orange, padding: 10,
      callbacks: { label: (ctx) => ` ${ctx.parsed.r.toFixed(1)} / 5` },
    },
  },
  scales: {
    r: {
      min: 0, max: 5, beginAtZero: true,
      ticks: {
        stepSize: 1, color: C.tickColor, backdropColor: 'transparent',
        font: { size: 10 }, callback: (v) => (v === 0 ? '' : v),
      },
      pointLabels: { color: C.labelColor, font: { size: 11, weight: '600' } },
      angleLines: { color: C.gridLine },
      grid:       { color: C.gridLine },
    },
  },
};

const BAR_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top', align: 'end',
      labels: {
        color: C.tickColor, usePointStyle: true, pointStyle: 'rectRounded',
        boxWidth: 10, font: { size: 11 }, padding: 16,
      },
    },
    tooltip: {
      backgroundColor: C.tooltipBg, borderWidth: 1, borderColor: C.gridLine,
      titleColor: '#f1f5f9', bodyColor: '#94a3b8', padding: 10,
    },
  },
  scales: {
    x: { grid: { color: C.gridLine }, ticks: { color: C.tickColor, font: { size: 11 } } },
    y: {
      beginAtZero: true, grid: { color: C.gridLine },
      ticks: { color: C.tickColor, font: { size: 11 }, precision: 0, stepSize: 2 },
    },
  },
  borderRadius: 6, barPercentage: 0.65, categoryPercentage: 0.7,
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

/** Build radar dataset from a single review's skills object */
function buildRadarData(skills) {
  return {
    labels: SKILL_LABELS,
    datasets: [{
      label: 'Skill Score',
      data: SKILL_KEYS.map((k) => skills?.[k] ?? 0),
      backgroundColor: C.orangeFill,
      borderColor: C.orange,
      borderWidth: 2,
      pointBackgroundColor: C.orange,
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: C.orange,
      pointRadius: 4, pointHoverRadius: 6, fill: true,
    }],
  };
}

/** Build bar dataset from an array of reviews */
function buildBarData(reviews) {
  return {
    labels: reviews.map((r) => r.period),
    datasets: [
      {
        label: 'Goals Assigned',
        data: reviews.map((r) => r.goalsAssigned ?? 0),
        backgroundColor: C.blueFill, borderColor: C.blue, borderWidth: 1.5,
      },
      {
        label: 'Goals Completed',
        data: reviews.map((r) => r.goalsCompleted ?? 0),
        backgroundColor: C.orangeFill.replace('0.18','0.7'), borderColor: C.orange, borderWidth: 1.5,
      },
    ],
  };
}

// ─── Period options ───────────────────────────────────────────────────────────
function buildPeriodOptions() {
  const opts = [];
  const year = new Date().getFullYear();
  for (let y = year; y >= year - 2; y--) {
    for (const q of ['Q4', 'Q3', 'Q2', 'Q1']) opts.push(`${q} ${y}`);
  }
  return opts;
}
const PERIOD_OPTIONS = buildPeriodOptions();

// ─── Shared UI pieces ─────────────────────────────────────────────────────────
function Card({ title, subtitle, badge, children, className = '' }) {
  return (
    <div className={`bg-surface border border-border rounded-xl overflow-hidden ${className}`}>
      {(title || badge) && (
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-text-primary">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {badge}
        </div>
      )}
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
      <span className="text-4xl">{icon}</span>
      <p className="font-semibold text-text-primary">{title}</p>
      <p className="text-xs text-text-muted max-w-xs">{body}</p>
    </div>
  );
}

// ─── Score bar (under radar chart) ───────────────────────────────────────────
function ScoreBar({ label, value }) {
  const color = value >= 4 ? 'bg-green-500' : value >= 3 ? 'bg-orange' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-xs text-text-muted font-medium flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden">
        <div className={`${color} h-1.5 rounded-full transition-all duration-700`}
             style={{ width: `${((value ?? 0) / 5) * 100}%` }} />
      </div>
      <span className="w-6 text-xs font-bold text-text-primary text-right">{(value ?? 0).toFixed(1)}</span>
    </div>
  );
}

// ─── Review table row ──────────────────────────────────────────────────────── 
function ReviewRow({ review }) {
  const total = review.goalsAssigned ?? 0;
  const done  = review.goalsCompleted ?? 0;
  const rate  = total ? Math.round((done / total) * 100) : 0;
  const rateColor = rate >= 90 ? 'text-green-400' : rate >= 70 ? 'text-orange' : 'text-red-400';
  const avgScore  = avg(SKILL_KEYS.map((k) => review.skills?.[k] ?? 0)).toFixed(1);

  return (
    <tr className="hover:bg-surfaceHover transition-colors">
      <td className="px-5 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">{review.period}</td>
      <td className="px-5 py-3 font-bold text-orange text-sm text-center">{avgScore}</td>
      <td className="px-5 py-3 text-xs text-text-muted text-center">{total}</td>
      <td className="px-5 py-3 text-xs text-text-primary font-semibold text-center">{done}</td>
      <td className={`px-5 py-3 text-xs font-bold text-center ${rateColor}`}>{rate}%</td>
      {review.notes && (
        <td className="px-5 py-3 text-xs text-text-muted max-w-[180px]">
          <p className="truncate" title={review.notes}>{review.notes}</p>
        </td>
      )}
    </tr>
  );
}

// ─── Add Review Modal (admin only) ───────────────────────────────────────────
function AddReviewModal({ employees, reviewerUid, onClose, onSaved }) {
  const defaultSkills = { communication: 3, technical: 3, leadership: 3, teamwork: 3, punctuality: 3 };
  const [form, setForm] = useState({
    uid: '', period: PERIOD_OPTIONS[0],
    skills: { ...defaultSkills },
    goalsAssigned: '', goalsCompleted: '', notes: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  const setField = (k, v)    => setForm((p) => ({ ...p, [k]: v }));
  const setSkill = (k, v)    => setForm((p) => ({ ...p, skills: { ...p.skills, [k]: v } }));

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.uid)                             return setError('Please select an employee.');
    if (!form.period)                          return setError('Period is required.');
    if (form.goalsAssigned === '')             return setError('Goals Assigned is required.');
    if (form.goalsCompleted === '')            return setError('Goals Completed is required.');
    if (+form.goalsCompleted > +form.goalsAssigned)
                                               return setError('Completed cannot exceed Assigned.');

    const emp = employees.find((e) => e.uid === form.uid);
    setError(''); setBusy(true);
    try {
      const id = await addPerformanceReview({
        uid:           form.uid,
        employeeName:  emp?.name || emp?.email || form.uid,
        reviewedBy:    reviewerUid,
        period:        form.period,
        skills:        form.skills,
        goalsAssigned:  +form.goalsAssigned,
        goalsCompleted: +form.goalsCompleted,
        notes:          form.notes,
      });
      onSaved({ id, ...form, goalsAssigned: +form.goalsAssigned, goalsCompleted: +form.goalsCompleted,
        employeeName: emp?.name || emp?.email || form.uid, reviewedBy: reviewerUid });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg
                      max-h-[90vh] overflow-y-auto animate-fade-in">

        {/* Header */}
        <div className="sticky top-0 bg-surface flex items-center justify-between px-6 py-5
                        border-b border-border z-10">
          <div>
            <h2 className="font-bold text-text-primary">Add Performance Review</h2>
            <p className="text-xs text-text-muted mt-0.5">Skill scores are on a 1–5 scale</p>
          </div>
          <button onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg
                             bg-surfaceHover text-text-muted hover:text-text-primary transition-colors">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          {/* Employee + Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">Employee *</label>
              <select value={form.uid} onChange={(e) => setField('uid', e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2
                                 text-sm text-text-primary focus:outline-none focus:border-orange
                                 transition-colors">
                <option value="">Select employee</option>
                {employees.map((emp) => (
                  <option key={emp.uid} value={emp.uid}>{emp.name || emp.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">Period *</label>
              <select value={form.period} onChange={(e) => setField('period', e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2
                                 text-sm text-text-primary focus:outline-none focus:border-orange
                                 transition-colors">
                {PERIOD_OPTIONS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Skill sliders */}
          <div>
            <p className="text-xs font-semibold text-text-muted mb-3">Skill Scores (1 = Poor, 5 = Excellent)</p>
            <div className="space-y-3">
              {SKILL_KEYS.map((k, i) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-text-secondary font-medium flex-shrink-0">
                    {SKILL_LABELS[i]}
                  </span>
                  <input type="range" min={1} max={5} step={0.5}
                         value={form.skills[k]}
                         onChange={(e) => setSkill(k, +e.target.value)}
                         className="flex-1 accent-orange cursor-pointer" />
                  <span className="w-8 text-xs font-bold text-orange text-right">{form.skills[k]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Goals */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">Goals Assigned *</label>
              <input type="number" min={0} value={form.goalsAssigned}
                     onChange={(e) => setField('goalsAssigned', e.target.value)}
                     placeholder="e.g. 10"
                     className="w-full bg-background border border-border rounded-lg px-3 py-2
                                text-sm text-text-primary focus:outline-none focus:border-orange
                                transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">Goals Completed *</label>
              <input type="number" min={0} max={form.goalsAssigned || undefined} value={form.goalsCompleted}
                     onChange={(e) => setField('goalsCompleted', e.target.value)}
                     placeholder="e.g. 8"
                     className="w-full bg-background border border-border rounded-lg px-3 py-2
                                text-sm text-text-primary focus:outline-none focus:border-orange
                                transition-colors" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)}
                      placeholder="Optional reviewer notes…"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm
                                 text-text-primary focus:outline-none focus:border-orange
                                 transition-colors resize-none" />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20
                          rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
                    className="px-4 py-2 rounded-lg border border-border text-text-secondary
                               text-sm hover:bg-surfaceHover transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange text-white
                               text-sm font-bold hover:bg-orange-hover transition-colors
                               disabled:opacity-60 disabled:cursor-not-allowed">
              {busy && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white
                                        rounded-full animate-spin" />}
              {busy ? 'Saving…' : 'Save Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Charts section (shared between employee & admin view) ────────────────────
function ChartsSection({ reviews, selectedName }) {
  if (!reviews.length) {
    return (
      <EmptyState
        icon="📋"
        title="No reviews found"
        body={
          selectedName
            ? `No performance reviews have been added for ${selectedName} yet.`
            : 'No performance reviews have been added yet.'
        }
      />
    );
  }

  const latest   = reviews[reviews.length - 1];
  const radarDat = buildRadarData(latest.skills);
  const barDat   = buildBarData(reviews);

  // Summary stats from latest review
  const latestAvg   = avg(SKILL_KEYS.map((k) => latest.skills?.[k] ?? 0));
  const totalAsgn   = reviews.reduce((s, r) => s + (r.goalsAssigned  ?? 0), 0);
  const totalDone   = reviews.reduce((s, r) => s + (r.goalsCompleted ?? 0), 0);
  const compRate    = totalAsgn ? Math.round((totalDone / totalAsgn) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Avg Skill (latest)', value: latestAvg.toFixed(1) + '/5', color: 'text-orange',     bg: 'bg-orange/10'      },
          { label: 'Goals Assigned',     value: totalAsgn,                   color: 'text-blue-400',   bg: 'bg-blue-500/10'    },
          { label: 'Goals Completed',    value: totalDone,                   color: 'text-green-400',   bg: 'bg-green-500/10'  },
          { label: 'Completion Rate',    value: compRate + '%',              color: 'text-purple-400',  bg: 'bg-purple-500/10' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-border rounded-xl px-4 py-3`}>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-xs font-semibold text-text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Radar */}
        <Card title="🎯 Skill Assessment"
              subtitle={`Latest review: ${latest.period}`}
              badge={
                <span className="text-xs font-bold px-2.5 py-1 rounded-full
                                 bg-orange/10 text-orange border border-orange/30">
                  Avg {latestAvg.toFixed(1)}
                </span>
              }>
          <div className="p-6">
            <div className="h-64">
              <Radar data={radarDat} options={RADAR_OPTIONS} />
            </div>
            <div className="space-y-2.5 pt-4 border-t border-border mt-4">
              {SKILL_KEYS.map((k, i) => (
                <ScoreBar key={k} label={SKILL_LABELS[i]} value={latest.skills?.[k] ?? 0} />
              ))}
            </div>
          </div>
        </Card>

        {/* Bar */}
        <Card title="📊 Goals: Assigned vs Completed"
              subtitle={`${reviews.length} review period${reviews.length !== 1 ? 's' : ''}`}
              badge={
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border
                  ${compRate >= 90
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : compRate >= 70
                    ? 'bg-orange/10 text-orange border-orange/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                  {compRate}% completion
                </span>
              }>
          <div className="p-6">
            <div className="h-64">
              <Bar data={barDat} options={BAR_OPTIONS} />
            </div>

            {/* Per-period table */}
            <div className="mt-4 border-t border-border pt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-text-muted">
                    {['Period', 'Avg Score', 'Assigned', 'Done', 'Rate'].map((h) => (
                      <th key={h} className={`font-semibold pb-2 ${h === 'Period' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reviews.map((r) => <ReviewRow key={r.id} review={r} />)}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PerformanceDashboard() {
  const { userProfile, isAdmin } = useAuth();
  const uid = userProfile?.uid;

  // All reviews (admin) or own reviews (employee)
  const [allReviews, setAllReviews]     = useState([]);
  const [employees,  setEmployees]      = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedUid, setSelectedUid]   = useState('');   // admin picker
  const [showModal, setShowModal]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (isAdmin) {
        const [revs, emps] = await Promise.all([getAllPerformanceReviews(), getAllEmployees()]);
        setAllReviews(revs);
        setEmployees(emps);
        if (!selectedUid && emps.length) setSelectedUid(emps[0].uid);
      } else {
        const revs = await getMyPerformanceReviews(uid);
        setAllReviews(revs);
      }
    } catch (err) {
      setError(err.message || 'Failed to load performance data.');
    } finally {
      setLoading(false);
    }
  }, [uid, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Reviews visible in charts
  const viewUid      = isAdmin ? selectedUid : uid;
  const viewReviews  = allReviews.filter((r) => r.uid === viewUid);
  const viewEmployee = employees.find((e) => e.uid === viewUid);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 bg-background min-h-screen text-text-primary space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gradient">Performance Dashboard</h1>
          <p className="text-text-muted text-sm mt-1">
            {isAdmin ? 'Review and manage employee performance assessments' : 'Your performance history and skill scores'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border
                             text-text-secondary text-sm hover:bg-surface transition-colors
                             disabled:opacity-50">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
                   0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          {isAdmin && (
            <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange text-white
                               text-sm font-bold hover:bg-orange-hover transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Review
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 text-red-400 text-sm bg-red-500/10
                        border border-red-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0
              1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-300 hover:text-red-100">✕</button>
        </div>
      )}

      {/* Admin employee picker */}
      {isAdmin && !loading && employees.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-text-muted">Viewing:</span>
          <div className="flex flex-wrap gap-2">
            {employees.map((emp) => (
              <button key={emp.uid} onClick={() => setSelectedUid(emp.uid)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border
                        ${selectedUid === emp.uid
                          ? 'bg-orange text-white border-orange'
                          : 'bg-surfaceHover text-text-secondary border-border hover:text-text-primary'}`}>
                {emp.name || emp.email}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <Card>
          <Spinner />
        </Card>
      ) : (
        <ChartsSection reviews={viewReviews} selectedName={viewEmployee?.name || viewEmployee?.email} />
      )}

      {/* Add Review Modal */}
      {showModal && (
        <AddReviewModal
          employees={employees}
          reviewerUid={uid}
          onClose={() => setShowModal(false)}
          onSaved={(review) => {
            setAllReviews((prev) =>
              [...prev, review].sort((a, b) => (a.period ?? '').localeCompare(b.period ?? ''))
            );
          }}
        />
      )}
    </div>
  );
}
