import { useState } from 'react';

const Section = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-surface hover:bg-surfaceHover transition-colors text-left"
        onClick={() => setOpen(p => !p)}
      >
        <span className="font-semibold text-text-primary text-sm">{title}</span>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-border bg-background text-sm text-text-secondary leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
};

const FAQItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 bg-surface hover:bg-surfaceHover transition-colors text-left"
        onClick={() => setOpen(p => !p)}
      >
        <span className="text-sm text-text-primary font-medium">{q}</span>
        <svg className={`w-4 h-4 text-text-muted transition-transform duration-200 flex-shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 py-3.5 border-t border-border bg-background text-sm text-text-secondary leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
};

const features = [
  {
    title: '📊 How to view your tasks',
    content: 'Navigate to the Dashboard page from the sidebar. You will see all tasks assigned to you in the Upcoming Tasks section below the charts. Click any task card to view full details including description, due date, progress, links, and attachments.',
  },
  {
    title: '✏️ How to update task progress',
    content: 'Open a task detail modal by clicking on any task card (Dashboard, Calendar, or List View). If you are the task creator or an admin, you will see a progress slider at the bottom of the task detail. Drag the slider to the desired percentage and click "Save Progress". The task status will automatically update.',
  },
  {
    title: '📅 How to sync with Google Calendar',
    content: 'When you first sign in with Google, your AirBuddy tasks are available on the Calendar page. To sync with your personal Google Calendar, ensure you grant Calendar API permission during sign-in. Tasks will appear as events color-coded by priority. Any updates in AirBuddy are reflected in Google Calendar.',
  },
  {
    title: '🤝 How to see your Work Partners',
    content: 'Navigate to "Work Partner" in the sidebar. This page displays tasks that you share with one or more colleagues. You can see their avatars, the shared task details, and current progress. This helps coordinate work on collaborative assignments.',
  },
  {
    title: '🤖 How to use the AI Assistant',
    content: 'Click the orange 🤖 button in the bottom-right corner of any page. The AI Assistant (powered by Claude) knows your current task list and can help you prioritize, understand requirements, suggest timelines, or answer questions about your work. Press Enter to send messages.',
  },
];

const faqs = [
  { q: 'How do I update my profile information?', a: 'Your profile information (name, avatar) is synced from your Google account. To update it, change your Google profile and sign out/in again.' },
  { q: 'Can I create my own tasks?', a: 'Currently, tasks are assigned by your admin. If you need a personal task, speak with your admin to have them create one assigned to you.' },
  { q: 'What does the orange dot on the notification bell mean?', a: 'The orange dot indicates you have unread notifications. Click the bell icon to see all notifications. Clicking a notification marks it as read.' },
  { q: 'Why can I not see certain tasks?', a: 'Tasks are shown based on your assignment. Admin tasks are only visible to assigned employees. If you believe you should see a task, contact your admin.' },
  { q: 'Is the AI Assistant private?', a: 'Yes, the AI assistant receives your task list as context but does not store any conversation data. Each session starts fresh.' },
  { q: 'How does task priority affect the calendar?', a: 'On the calendar, tasks are color-coded by priority: Red = High, Yellow/Orange = Medium, Blue = Low. This helps you visually identify urgent tasks at a glance.' },
];

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-text-primary">About & Help</h1>
        <p className="text-sm text-text-secondary mt-1">Platform overview, feature guides, and support</p>
      </div>

      {/* Platform Overview */}
      <div className="card p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange to-orange-hover glow-orange flex items-center justify-center">
            <span className="text-white font-black text-2xl">AB</span>
          </div>
          <div>
            <h2 className="text-xl font-black text-text-primary">AirBuddy Aerospace WorkSpace</h2>
            <p className="text-sm text-text-secondary">Workforce Management Platform v1.0</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed mb-4">
          WorkSpace is the central hub for the AirBuddy Aerospace team — a 15-member aerospace engineering company. 
          It provides task management, real-time collaboration, calendar integration, AI-powered assistance, 
          and team announcements in one unified dark-themed platform.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { icon: '📋', label: 'Task Management' },
            { icon: '📅', label: 'Smart Calendar' },
            { icon: '🤝', label: 'Work Partners' },
            { icon: '📣', label: 'Announcements' },
            { icon: '🤖', label: 'AI Assistant' },
            { icon: '🔔', label: 'Notifications' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-2 bg-background rounded-lg px-3 py-2.5">
              <span className="text-lg">{f.icon}</span>
              <span className="text-xs font-medium text-text-secondary">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Guide */}
      <div>
        <h2 className="text-lg font-bold text-text-primary mb-3">Feature Guide</h2>
        <div className="space-y-2">
          {features.map(f => <Section key={f.title} title={f.title}>{f.content}</Section>)}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-lg font-bold text-text-primary mb-3">Frequently Asked Questions</h2>
        <div className="space-y-2">
          {faqs.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </div>

      {/* Contact */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-text-primary mb-3">Contact & Support</h2>
        <p className="text-sm text-text-secondary mb-4">
          For platform issues, task assignments, or account access questions, contact your admin:
        </p>
        <div className="flex items-center gap-3 bg-background rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-orange-muted border border-orange/30 flex items-center justify-center text-orange font-bold text-sm">
            HR
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">AirBuddy HR Admin</p>
            <a href="mailto:admin@airbuddyaerospace.com" className="text-xs text-orange hover:underline">
              admin@airbuddyaerospace.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
