import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler
);

const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#8B949E',
        font: { family: 'Inter', size: 12 },
        padding: 16,
      },
    },
    tooltip: {
      backgroundColor: '#1C2128',
      borderColor: '#30363D',
      borderWidth: 1,
      titleColor: '#E6EDF3',
      bodyColor: '#8B949E',
      padding: 10,
      cornerRadius: 8,
    },
  },
};

// Donut Chart — Task status distribution
export const DonutChart = ({ tasks }) => {
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;

  const data = {
    labels: ['Pending', 'In Progress', 'Completed'],
    datasets: [{
      data: [pending, inProgress, completed],
      backgroundColor: ['#F97316', '#3B82F6', '#22C55E'],
      borderColor: ['#161B22', '#161B22', '#161B22'],
      borderWidth: 3,
      hoverOffset: 6,
    }],
  };

  const options = {
    ...defaultOptions,
    cutout: '68%',
    plugins: {
      ...defaultOptions.plugins,
      legend: {
        ...defaultOptions.plugins.legend,
        position: 'bottom',
      },
    },
  };

  return (
    <div className="relative" style={{ height: '220px' }}>
      <Doughnut data={data} options={options} />
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-text-primary">{total}</span>
        <span className="text-xs text-text-muted">Total Tasks</span>
      </div>
    </div>
  );
};

// Bar Chart — Workload (tasks by day)
export const BarChart = ({ tasks }) => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Count tasks by day of week of their startDate
  const dayCounts = Array(7).fill(0);
  tasks.forEach(t => {
    const d = t.startDate?.toDate ? t.startDate.toDate() : new Date(t.startDate);
    if (!isNaN(d)) dayCounts[d.getDay()]++;
  });

  const data = {
    labels: dayNames,
    datasets: [{
      label: 'Tasks',
      data: dayCounts,
      backgroundColor: 'rgba(249,115,22,0.7)',
      borderColor: '#F97316',
      borderWidth: 1,
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  const options = {
    ...defaultOptions,
    scales: {
      x: {
        ticks: { color: '#8B949E', font: { family: 'Inter', size: 11 } },
        grid: { color: '#21262D' },
        border: { color: '#30363D' },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#8B949E', font: { family: 'Inter', size: 11 }, stepSize: 1 },
        grid: { color: '#21262D' },
        border: { color: '#30363D' },
      },
    },
    plugins: {
      ...defaultOptions.plugins,
      legend: { display: false },
    },
  };

  return (
    <div style={{ height: '200px' }}>
      <Bar data={data} options={options} />
    </div>
  );
};

// Line Chart — Progress trend (cumulative completions)
export const LineChart = ({ tasks, timeRange = 'month' }) => {
  const numDays = timeRange === 'week' ? 7 : timeRange === 'day' ? 1 : 30;

  const days = Array.from({ length: numDays }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (numDays - 1 - i));
    return d;
  });

  const dayLabels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

  // Cumulative completions per day
  const cumulativeData = days.map(day => {
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const completedOnOrBefore = tasks.filter(t => {
      if (t.status !== 'completed') return false;
      const updated = t.updatedAt?.toDate ? t.updatedAt.toDate() : new Date(t.updatedAt);
      return !isNaN(updated) && updated <= dayEnd;
    }).length;
    return completedOnOrBefore;
  });

  // Filter labels for huge 30-day views to prevent crowding
  const labelFilter = (val, i) => {
    if (numDays <= 7) return true; // Show all for week/day
    return i % 5 === 0 || i === numDays - 1; // Sparse view for month
  };

  const data = {
    labels: dayLabels.filter(labelFilter),
    datasets: [{
      label: 'Completed Tasks',
      data: cumulativeData.filter(labelFilter),
      borderColor: '#22C55E',
      backgroundColor: 'rgba(34,197,94,0.08)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#22C55E',
      pointBorderColor: '#161B22',
      pointBorderWidth: 2,
      pointRadius: numDays <= 7 ? 6 : 4,
    }],
  };

  const options = {
    ...defaultOptions,
    scales: {
      x: {
        ticks: { color: '#8B949E', font: { family: 'Inter', size: 10 } },
        grid: { color: '#21262D' },
        border: { color: '#30363D' },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#8B949E', font: { family: 'Inter', size: 11 }, stepSize: 1 },
        grid: { color: '#21262D' },
        border: { color: '#30363D' },
      },
    },
    plugins: {
      ...defaultOptions.plugins,
      legend: { display: false },
    },
  };

  return (
    <div style={{ height: '200px' }}>
      <Line data={data} options={options} />
    </div>
  );
};

// ─── ProgressMeter ────────────────────────────────────────────────────────────
/**
 * A horizontal progress bar used throughout the KPI panels.
 *
 * Props:
 *   value      {number}  0–100  — fill percentage (clamped internally).
 *   color      {string}  hex    — fill color. Defaults to orange #F97316.
 *   showValue  {boolean}        — render the numeric value label. Default true.
 */
export const ProgressMeter = ({ value = 0, color = '#F97316', showValue = true }) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-border rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {showValue && (
        <span className="text-xs text-text-muted w-8 text-right flex-shrink-0">
          {clamped}%
        </span>
      )}
    </div>
  );
};
