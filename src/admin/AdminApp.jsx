import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { supabase, isConfigured } from '../lib/supabase';
import SEO from '../components/SEO';
import ThemeToggle from '../components/ThemeToggle';
import { Resource } from './Resource';
import { RESOURCES } from './resources';
import './admin.css';

const Dashboard = lazy(() => import('./Dashboard'));
const Leads = lazy(() => import('./Leads'));
const Inquiries = lazy(() => import('./Inquiries'));
const Appointments = lazy(() => import('./Appointments'));
const Messages = lazy(() => import('./Messages'));
const Payments = lazy(() => import('./Payments'));
const Media = lazy(() => import('./Media'));
const Settings = lazy(() => import('./Settings'));

const NAV = [
  ['', 'Dashboard', null],
  ['projects', 'Projects'],
  ['services', 'Services'],
  ['journey', 'Journey'],
  ['leads', 'Leads'],
  ['inquiries', 'Project Inquiries', 'inquiries'],
  ['appointments', 'Appointments', 'appointments'],
  ['payments', 'Payments', 'payments'],
  ['payment-methods', 'Payment Methods'],
  ['messages', 'Messages', 'messages'],
  ['testimonials', 'Testimonials'],
  ['insights', 'Blogs'],
  ['media', 'Media'],
  ['settings', 'Settings'],
];

function SignIn({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg('Sign-in failed. Check your email and password.');
    else onDone();
  };
  return (
    <div className="admin-center">
      <form className="login" onSubmit={submit}>
        <span className="eyebrow">Admin</span>
        <h1>Sign in</h1>
        <label className="afield"><span>Email</span><input className="ainput" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="afield"><span>Password</span><input className="ainput" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {msg && <div className="banner err" role="alert">{msg}</div>}
        <button className="abtn solid" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/" className="muted back-link">← Back to site</Link>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [auth, setAuth] = useState({ loading: true, session: null, role: null });
  const [badges, setBadges] = useState({});
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isConfigured) return setAuth({ loading: false, session: null, role: null });
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    let role = null;
    if (session) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      role = prof?.role ?? 'none';
    }
    setAuth({ loading: false, session, role });
  }, []);

  useEffect(() => {
    load();
    const { data: sub } = supabase?.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT') load(); }) || {};
    return () => sub?.subscription?.unsubscribe();
  }, [load]);

  const refreshBadges = useCallback(async () => {
    const count = (q) => q.then((r) => r.count || 0, () => 0);
    const [inq, apt, msg, pay] = await Promise.all([
      count(supabase.from('project_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'New')),
      count(supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'Pending')),
      count(supabase.from('messages').select('id', { count: 'exact', head: true }).eq('status', 'Unread')),
      count(supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Pending')),
    ]);
    setBadges({ inquiries: inq, appointments: apt, messages: msg, payments: pay });
  }, []);
  useEffect(() => { if (auth.role === 'super_admin') refreshBadges(); }, [auth.role, refreshBadges]);

  const signOut = async () => { await supabase.auth.signOut(); load(); };

  if (auth.loading) return <div className="admin-center"><span className="spinner" /></div>;
  if (!isConfigured) return <div className="admin-center"><div className="banner err">Supabase is not configured. Add the environment variables first.</div></div>;
  if (!auth.session) return <><SEO title="Admin" noindex /><SignIn onDone={load} /></>;
  if (auth.role !== 'super_admin') {
    return (
      <div className="admin-center">
        <div className="login">
          <h1>Access denied</h1>
          <p className="muted">This account is signed in but is not authorized as an administrator.</p>
          <button className="abtn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin">
      <SEO title="Admin" noindex />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link to="/admin" className="side-brand">ZH<span>HQ</span></Link>
        <nav aria-label="Admin">
          {NAV.map(([to, label, badge]) => (
            <NavLink key={to} end={to === ''} to={`/admin${to ? `/${to}` : ''}`} onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'on' : '')}>
              {label}{badge && badges[badge] > 0 && <b className="count">{badges[badge]}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <Link to="/" target="_blank">View site ↗</Link>
          <ThemeToggle />
          <button onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="topbar">
          <button className="menu" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">☰</button>
          <span className="muted">{auth.session.user.email}</span>
        </header>
        <div className="admin-content">
          <Suspense fallback={<div className="state"><span className="spinner" /></div>}>
            <Routes>
              <Route index element={<Dashboard />} />
              {Object.entries(RESOURCES).map(([key, cfg]) => (
                <Route key={key} path={key} element={<Resource key={key} cfg={cfg} />} />
              ))}
              <Route path="leads" element={<Leads onChange={refreshBadges} />} />
              <Route path="inquiries" element={<Inquiries onChange={refreshBadges} />} />
              <Route path="appointments" element={<Appointments onChange={refreshBadges} />} />
              <Route path="payments" element={<Payments onChange={refreshBadges} />} />
              <Route path="messages" element={<Messages onChange={refreshBadges} />} />
              <Route path="media" element={<Media />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<div className="state empty"><strong>Not found</strong></div>} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
