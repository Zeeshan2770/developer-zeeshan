import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Confirm, Drawer, StatusBadge, useToast } from './adminui';
import { fmtDateTime, logActivity } from './lib';

const STATUSES = ['Unread', 'Read', 'Replied', 'Archived'];

export default function Messages({ onChange }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('Unread');
  const [open, setOpen] = useState(null);
  const [toast, notify] = useToast();

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false });
    if (error) notify(error.message, 'err'); else setRows(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (m, status) => {
    const { error } = await supabase.from('messages').update({ status }).eq('id', m.id);
    if (error) return notify(error.message, 'err');
    logActivity(`message ${status.toLowerCase()}`, 'messages', m.id);
    setOpen((o) => (o && o.id === m.id ? { ...o, status } : o));
    load(); onChange?.();
  };
  const view = (m) => { setOpen(m); if (m.status === 'Unread') setStatus(m, 'Read'); };
  const remove = async (m) => {
    const { error } = await supabase.from('messages').delete().eq('id', m.id);
    if (error) return notify(error.message, 'err');
    setOpen(null); load(); onChange?.();
  };

  const list = (rows || []).filter((m) => filter === 'All' || m.status === filter);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, (rows || []).filter((m) => m.status === s).length]));

  return (
    <div>
      <div className="page-head"><div><h1>Messages</h1><p className="muted">From the contact form.</p></div></div>
      <div className="chips">
        {['All', ...STATUSES].map((s) => (
          <button key={s} className={`achip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
            {s}{s !== 'All' && counts[s] > 0 ? ` · ${counts[s]}` : ''}
          </button>
        ))}
      </div>
      {!rows ? <div className="state"><span className="spinner" /></div> : list.length === 0 ? (
        <div className="state empty"><strong>No {filter === 'All' ? '' : filter.toLowerCase()} messages</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="atable">
            <thead><tr><th>From</th><th>Subject</th><th>Status</th><th>Received</th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className={m.status === 'Unread' ? 'unread' : ''}>
                  <td><button className="linkish" onClick={() => view(m)}>{m.name}</button><div className="muted small">{m.email}</div></td>
                  <td>{m.subject || <span className="muted">(no subject)</span>}<div className="muted small clamp">{m.message}</div></td>
                  <td><StatusBadge value={m.status} /></td>
                  <td className="nowrap">{fmtDateTime(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Drawer title={open.subject || `Message from ${open.name}`} onClose={() => setOpen(null)}>
          <div className="kv-grid">
            <div className="kv"><span>From</span><p>{open.name}</p></div>
            <div className="kv"><span>Email</span><p><a href={`mailto:${open.email}`}>{open.email}</a></p></div>
            <div className="kv"><span>Received</span><p>{fmtDateTime(open.created_at)}</p></div>
            <div className="kv"><span>Status</span><p><StatusBadge value={open.status} /></p></div>
          </div>
          <div className="msg-body">{open.message}</div>
          <div className="editor-foot">
            <a className="abtn solid" href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: ${open.subject || 'Your message'}`)}`}
              onClick={() => setStatus(open, 'Replied')}>Reply by email</a>
            {open.status !== 'Archived' && <button className="abtn" onClick={() => setStatus(open, 'Archived')}>Archive</button>}
            {open.status !== 'Unread' && <button className="abtn" onClick={() => setStatus(open, 'Unread')}>Mark unread</button>}
            <Confirm onConfirm={() => remove(open)}>Delete</Confirm>
          </div>
        </Drawer>
      )}
      {toast}
    </div>
  );
}
