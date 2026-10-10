import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Confirm, Drawer, StatusBadge, useToast } from './adminui';
import { fmtDateTime, fmtDay, logActivity } from './lib';
import { useSettings } from '../lib/SettingsContext';

const STATUSES = ['Pending', 'Confirmed', 'Rescheduled', 'Completed', 'Cancelled', 'No-show'];

// datetime-local <-> UTC ISO in the configured timezone would need a tz library; we use the browser's
// local zone for rescheduling and show every time with the site timezone label for clarity.
const toLocalInput = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function Appointments({ onChange }) {
  const s = useSettings();
  const [rows, setRows] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [filter, setFilter] = useState('Upcoming');
  const [open, setOpen] = useState(null);
  const [resched, setResched] = useState('');
  const [newBlock, setNewBlock] = useState({ day: '', reason: '' });
  const [toast, notify] = useToast();

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('appointments').select('*').order('starts_at', { ascending: true }),
      supabase.from('blocked_dates').select('*').order('day'),
    ]);
    if (a.error) notify(a.error.message, 'err'); else setRows(a.data);
    setBlocked(b.data || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = async (a, changes, msg = 'Saved') => {
    const { error } = await supabase.from('appointments').update(changes).eq('id', a.id);
    if (error) return notify(error.code === '23P01' ? 'That time overlaps another appointment.' : error.message, 'err');
    logActivity('update appointment', 'appointments', a.id);
    setOpen((o) => (o && o.id === a.id ? { ...o, ...changes } : o));
    notify(msg); load(); onChange?.();
  };

  const reschedule = (a) => {
    if (!resched) return;
    const start = new Date(resched);
    const dur = new Date(a.ends_at) - new Date(a.starts_at);
    update(a, { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + dur).toISOString(), status: 'Rescheduled' }, 'Rescheduled');
  };

  const addBlock = async () => {
    if (!newBlock.day) return;
    const { error } = await supabase.from('blocked_dates').insert({ day: newBlock.day, reason: newBlock.reason || null });
    if (error) return notify(error.code === '23505' ? 'Already blocked.' : error.message, 'err');
    setNewBlock({ day: '', reason: '' }); load();
  };

  const now = Date.now();
  const list = (rows || []).filter((a) =>
    filter === 'All' ? true
      : filter === 'Upcoming' ? new Date(a.starts_at) >= now && ['Pending', 'Confirmed', 'Rescheduled'].includes(a.status)
        : a.status === filter);

  return (
    <div>
      <div className="page-head"><div><h1>Appointments</h1><p className="muted">Times shown in your device's timezone. Booking timezone: {s.timezone}.</p></div></div>
      <div className="chips">
        {['Upcoming', ...STATUSES, 'All'].map((f) => <button key={f} className={`achip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
      </div>

      {!rows ? <div className="state"><span className="spinner" /></div> : list.length === 0 ? (
        <div className="state empty"><strong>No appointments here</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="atable">
            <thead><tr><th>When</th><th>Who</th><th>Purpose</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className={a.status === 'Pending' ? 'unread' : ''}>
                  <td className="nowrap">{fmtDateTime(a.starts_at)}</td>
                  <td><button className="linkish" onClick={() => { setOpen(a); setResched(toLocalInput(a.starts_at)); }}>{a.name}</button><div className="muted small">{a.email}</div></td>
                  <td>{a.purpose}<div className="muted small">{a.appointment_type}</div></td>
                  <td><StatusBadge value={a.status} /></td>
                  <td className="nowrap right">
                    {a.status === 'Pending' && <button className="abtn solid xs" onClick={() => update(a, { status: 'Confirmed' }, 'Confirmed')}>Confirm</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="panel" style={{ marginTop: 28 }}>
        <header><h2>Blocked dates</h2></header>
        <div className="inline-add">
          <input type="date" className="ainput sm" value={newBlock.day} onChange={(e) => setNewBlock({ ...newBlock, day: e.target.value })} />
          <input className="ainput" placeholder="Reason (optional)" value={newBlock.reason} onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })} />
          <button className="abtn" onClick={addBlock}>Block</button>
        </div>
        <ul className="log">
          {blocked.map((b) => (
            <li key={b.id}><b>{fmtDay(b.day)}</b> {b.reason}
              <button className="abtn xs danger" onClick={async () => { await supabase.from('blocked_dates').delete().eq('id', b.id); load(); }}>Remove</button></li>
          ))}
          {blocked.length === 0 && <li className="muted">No blocked dates.</li>}
        </ul>
        <p className="muted small">Working days, hours, duration, buffer and limits are in Settings → Booking.</p>
      </section>

      {open && (
        <Drawer title={`${open.name} · ${fmtDateTime(open.starts_at)}`} onClose={() => setOpen(null)}>
          <div className="kv-grid">
            <div className="kv"><span>Status</span><p><StatusBadge value={open.status} /></p></div>
            <div className="kv"><span>Purpose</span><p>{open.purpose}</p></div>
            <div className="kv"><span>Type</span><p>{open.appointment_type || '—'}</p></div>
            <div className="kv"><span>Email</span><p><a href={`mailto:${open.email}`}>{open.email}</a></p></div>
            <div className="kv"><span>Phone</span><p>{open.phone || '—'}</p></div>
          </div>
          {open.message && <div className="msg-body">{open.message}</div>}
          <h3 className="sec">Status</h3>
          <div className="chips">{STATUSES.map((st) => <button key={st} className={`achip ${open.status === st ? 'on' : ''}`} onClick={() => update(open, { status: st })}>{st}</button>)}</div>
          <h3 className="sec">Reschedule</h3>
          <div className="inline-add">
            <input type="datetime-local" className="ainput" value={resched} onChange={(e) => setResched(e.target.value)} />
            <button className="abtn" onClick={() => reschedule(open)}>Move</button>
          </div>
          <div className="editor-foot">
            <Confirm onConfirm={async () => { await supabase.from('appointments').delete().eq('id', open.id); setOpen(null); load(); onChange?.(); }}>Delete</Confirm>
          </div>
        </Drawer>
      )}
      {toast}
    </div>
  );
}
