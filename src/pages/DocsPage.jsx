/**
 * A full-screen documentation viewer with:
 *  - Left sidebar: sticky, scrollable navigation with page links and auto-generated anchor links
 *  - Right main area: markdown rendered with react-markdown + remark-gfm + rehype-raw + rehype-slug
 *  - Active section tracking: IntersectionObserver highlights the current section in the sidebar
 *  - Smooth scrolling: clicking a sidebar anchor scrolls smoothly to the heading
 *  - Mobile drawer: sidebar is hidden on mobile and toggled with a menu button
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// HI-10 fix: rehype-raw removed — it allowed raw HTML in markdown which is an
// XSS vector. react-markdown's default sanitization is applied instead.
import rehypeSlug from 'rehype-slug';
import { docsConfig } from '../docs/config';

import GithubSlugger from 'github-slugger';

// ─── Utility: extract headings from markdown text ────────────────────────────
// Returns array of { id, text, level } derived from # headings
function extractHeadings(markdownText) {
  const lines = markdownText.split('\n');
  const headings = [];
  const slugger = new GithubSlugger();
  
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const rawText = match[2].trim();
      const text = rawText.replace(/`/g, '');
      const id = slugger.slug(text);
      headings.push({ id, text, level });
    }
  }
  return headings;
}

// ─── Syntax highlighting and code blocks ─────────────────────────────────────
// Inline code is styled via CSS (.markdown-body :not(pre) > code).
// Block code is handled by the custom `pre` component.

// ─── Custom markdown components mapping ──────────────────────────────────────
const markdownComponents = {
  pre: ({ children, ...props }) => {
    let codeText = '';
    let language = '';

    if (children && children.props) {
      codeText = String(children.props.children || '').replace(/\n$/, '');
      const match = /language-(\w+)/.exec(children.props.className || '');
      if (match) language = match[1];
    } else {
      codeText = String(children).replace(/\n$/, '');
    }

    return (
      <div className="relative group my-4">
        {language && (
          <span className="absolute top-3 right-3 text-[10px] font-mono text-text-muted uppercase tracking-wider opacity-60">
            {language}
          </span>
        )}
        <pre className="bg-[#0D1117] border border-[#30363D] rounded-xl p-4 overflow-x-auto text-sm font-mono leading-relaxed" {...props}>
          {children}
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(codeText)}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-[#30363D] hover:bg-[#484F58] text-text-muted hover:text-text-primary"
          title="Copy code"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    );
  },
  h1: ({ children, id }) => (
    <h1 id={id} className="text-3xl font-black text-text-primary mt-0 mb-6 pb-3 border-b border-[#30363D]">
      {children}
    </h1>
  ),
  h2: ({ children, id }) => (
    <h2 id={id} className="text-2xl font-bold text-text-primary mt-10 mb-4 pb-2 border-b border-[#21262D]">
      {children}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3 id={id} className="text-lg font-bold text-text-primary mt-8 mb-3">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-text-secondary leading-7 mb-4">{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
       className="text-orange hover:text-orange-hover underline underline-offset-2 transition-colors">
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-none my-4 space-y-1 pl-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside my-4 space-y-1 text-text-secondary">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-text-secondary leading-7 flex items-start gap-2">
      <span className="text-orange mt-2 flex-shrink-0">›</span>
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-orange bg-orange/5 px-4 py-2 my-4 rounded-r-lg italic text-text-muted">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-6 rounded-xl border border-[#30363D]">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#161B22]">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-[#21262D]">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-[#1C2128] transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-3 text-text-secondary">{children}</td>
  ),
  hr: () => <hr className="border-[#30363D] my-8" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
};

// ─── Main DocsPage component ──────────────────────────────────────────────────
export default function DocsPage() {
  const { docId } = useParams();
  const navigate = useNavigate();

  const [content, setContent] = useState('');
  const [headings, setHeadings] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const contentRef = useRef(null);
  const observerRef = useRef(null);

  // Active doc derived from URL param, defaulting to the first doc
  const activeDocId = docId || docsConfig[0].id;
  const activeDoc = docsConfig.find(d => d.id === activeDocId) || docsConfig[0];

  // ── Load markdown content whenever the active doc changes ────────────────
  useEffect(() => {
    setLoading(true);
    setContent('');
    setHeadings([]);
    setActiveId('');
    window.scrollTo(0, 0);

    activeDoc.file().then(mod => {
      // Vite ?raw imports return the default export as a string
      const text = mod.default || mod;
      setContent(text);
      setHeadings(extractHeadings(text));
      setLoading(false);
    });
  }, [activeDocId]);

  // ── IntersectionObserver for active heading tracking ─────────────────────
  useEffect(() => {
    if (loading || !headings.length) return;

    let isMounted = true;

    // Small delay to ensure the DOM has rendered the new content
    const timer = setTimeout(() => {
      if (!isMounted) return;

      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      const handleIntersection = (entries) => {
        // Find the topmost visible heading
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      };

      observerRef.current = new IntersectionObserver(handleIntersection, {
        rootMargin: '-80px 0px -70% 0px',
        threshold: 0,
      });

      headings.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (el) observerRef.current.observe(el);
      });
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [headings, loading, content]);

  // ── Smooth scroll on anchor click ─────────────────────────────────────────
  const scrollToHeading = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 80; // account for sticky navbar
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
      setActiveId(id);
    }
    setMobileOpen(false);
  }, []);

  // ── Navigate to a different doc page ──────────────────────────────────────
  const navigateToDoc = useCallback((docId) => {
    navigate(`/docs/${docId}`);
    setMobileOpen(false);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0D1117] text-text-primary">

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="max-w-screen-xl mx-auto flex">

        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        <aside
          className={`
            fixed top-0 left-0 h-full w-64 bg-[#0D1117] border-r border-[#21262D] z-40
            flex flex-col overflow-hidden
            transition-transform duration-300
            lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:flex-shrink-0
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          {/* Sidebar header */}
          <div className="h-16 flex items-center px-4 border-b border-[#21262D] flex-shrink-0">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white shadow-md p-0.5 flex-shrink-0">
                <img src="/airbuddyin_logo.png" alt="AirBuddy" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium">AirBuddy</p>
                <p className="text-sm font-bold text-text-primary leading-tight">Docs</p>
              </div>
            </Link>
          </div>

          {/* Scrollable nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">

            {/* Doc pages */}
            <div className="mb-6">
              <p className="text-xs text-text-muted font-semibold uppercase tracking-wider px-3 mb-2">
                Documentation
              </p>
              <ul className="space-y-0.5">
                {docsConfig.map(doc => (
                  <li key={doc.id}>
                    <button
                      onClick={() => navigateToDoc(doc.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                        activeDocId === doc.id
                          ? 'bg-orange/10 text-orange border border-orange/20'
                          : 'text-text-secondary hover:text-text-primary hover:bg-[#1C2128]'
                      }`}
                    >
                      <span className="text-base">{doc.icon}</span>
                      <span>{doc.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* On this page — anchor links from headings */}
            {headings.length > 0 && (
              <div>
                <p className="text-xs text-text-muted font-semibold uppercase tracking-wider px-3 mb-2">
                  On this page
                </p>
                <ul className="space-y-0.5">
                  {headings.map(({ id, text, level }) => (
                    <li key={id}>
                      <button
                        onClick={() => scrollToHeading(id)}
                        className={`
                          w-full text-left px-3 py-1.5 rounded-md text-xs transition-all leading-snug
                          ${level === 1 ? 'font-semibold' : level === 2 ? 'pl-5 font-medium' : 'pl-8 font-normal'}
                          ${activeId === id
                            ? 'text-orange bg-orange/8'
                            : 'text-text-muted hover:text-text-secondary hover:bg-[#1C2128]'
                          }
                        `}
                      >
                        {text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>

          {/* Sidebar footer */}
          <div className="px-3 py-4 border-t border-[#21262D] flex-shrink-0">
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-[#1C2128] transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to App</span>
            </Link>
          </div>
        </aside>

        {/* ── Main content area ─────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">

          {/* Sticky top bar for mobile toggle + breadcrumb */}
          <div className="sticky top-0 z-20 h-16 bg-[#0D1117]/90 backdrop-blur-sm border-b border-[#21262D] flex items-center px-4 lg:px-8 gap-4">
            <button
              onClick={() => setMobileOpen(p => !p)}
              className="lg:hidden p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-[#1C2128] transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm overflow-hidden">
              <Link to="/docs" className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0">
                Docs
              </Link>
              <svg className="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-text-primary font-medium truncate">{activeDoc.title}</span>
            </div>
          </div>

          {/* Article content */}
          <article
            ref={contentRef}
            className="px-6 py-10 lg:px-12 lg:py-12 max-w-3xl markdown-body"
          >
            <style>{`
              .markdown-body :not(pre) > code {
                background-color: #0D1117;
                border: 1px solid #30363D;
                color: #F97316;
                padding: 0.125rem 0.375rem;
                border-radius: 0.25rem;
                font-size: 0.85em;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
              }
              .markdown-body pre > code {
                color: #E6EDF3;
              }
            `}</style>
            {loading ? (
              /* Loading skeleton */
              <div className="space-y-4 animate-pulse">
                <div className="h-9 bg-[#1C2128] rounded-lg w-2/3" />
                <div className="h-4 bg-[#1C2128] rounded w-full" />
                <div className="h-4 bg-[#1C2128] rounded w-5/6" />
                <div className="h-4 bg-[#1C2128] rounded w-4/6" />
                <div className="h-8 bg-[#1C2128] rounded-lg w-1/2 mt-8" />
                <div className="h-4 bg-[#1C2128] rounded w-full" />
                <div className="h-4 bg-[#1C2128] rounded w-3/4" />
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug]} // HI-10 fix: rehypeRaw removed (XSS vector)
                components={markdownComponents}
              >
                {content}
              </ReactMarkdown>
            )}

            {/* Page navigation footer */}
            {!loading && (
              <div className="mt-16 pt-8 border-t border-[#21262D] flex items-center justify-between gap-4">
                {/* Previous page */}
                {(() => {
                  const currentIdx = docsConfig.findIndex(d => d.id === activeDocId);
                  const prev = docsConfig[currentIdx - 1];
                  return prev ? (
                    <button
                      onClick={() => navigateToDoc(prev.id)}
                      className="flex items-center gap-2 text-sm text-text-muted hover:text-orange transition-colors group"
                    >
                      <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      <span>{prev.title}</span>
                    </button>
                  ) : <div />;
                })()}

                {/* Next page */}
                {(() => {
                  const currentIdx = docsConfig.findIndex(d => d.id === activeDocId);
                  const next = docsConfig[currentIdx + 1];
                  return next ? (
                    <button
                      onClick={() => navigateToDoc(next.id)}
                      className="flex items-center gap-2 text-sm text-text-muted hover:text-orange transition-colors group ml-auto"
                    >
                      <span>{next.title}</span>
                      <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  ) : <div />;
                })()}
              </div>
            )}
          </article>
        </main>
      </div>
    </div>
  );
}
