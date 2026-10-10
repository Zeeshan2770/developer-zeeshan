import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { getProjects } from '../lib/api';

const PAGES = [
  { label: 'Home', hint: 'Page', to: '/' },
  { label: 'Projects and case studies', hint: 'Page', to: '/projects' },
  { label: 'Services', hint: 'Page', to: '/services' },
  { label: 'About me', hint: 'Page', to: '/about' },
  { label: 'Journey', hint: 'Page', to: '/experience' },
  { label: 'Blogs', hint: 'Page', to: '/blog' },
  { label: 'Contact', hint: 'Page', to: '/contact' },
  { label: 'Start a project', hint: 'Action', to: '/start-project' },
  { label: 'Book a meeting', hint: 'Action', to: '/book' },
  { label: 'Make a payment', hint: 'Action', to: '/pay' },
];

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const projects = useAsync(getProjects, []);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const returnTo = useRef(null);

  const items = useMemo(
    () => [...PAGES, ...(projects.data || []).map((p) => ({ label: p.name, hint: 'Project', to: `/projects/${p.slug}` }))],
    [projects.data],
  );
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => !needle || `${i.label} ${i.hint}`.toLowerCase().includes(needle)).slice(0, 9);
  }, [items, q]);

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement;
      setQ(''); setIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
    if (returnTo.current && returnTo.current.focus) returnTo.current.focus();
    return undefined;
  }, [open]);

  useEffect(() => setIdx(0), [q]);

  if (!open) return null;

  const go = (item) => { onClose(); navigate(item.to); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && list[idx]) { e.preventDefault(); go(list[idx]); }
  };

  return (
    <div className="cmd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Search the site" onKeyDown={onKey}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search pages and projects…"
          aria-label="Search pages and projects"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={list[idx] ? `cmd-${idx}` : undefined}
        />
        <ul id="cmd-list" role="listbox">
          {list.length === 0 && <li className="cmd-empty">Nothing matches “{q}”.</li>}
          {list.map((it, i) => (
            <li
              key={it.to}
              id={`cmd-${i}`}
              role="option"
              aria-selected={i === idx}
              className={i === idx ? 'on' : ''}
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(it)}
            >
              <span>{it.label}</span><span className="cmd-hint">{it.hint}</span>
            </li>
          ))}
        </ul>
        <div className="cmd-foot muted mono">↑↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}
