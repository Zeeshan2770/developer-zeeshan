import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Drawer, StatusBadge, useToast } from './adminui';
import { ago, fmtDay, fmtDateTime, logActivity } from './lib';

export const LEAD_STATUSES = ['New', 'Contacted', 'Discussion', 'Proposal', 'Active Project', 'Completed', 'Archived', 'Rejected'];
const PRIORITIES = ['Low', 'Normal', 'High'];
const CHANNELS = ['Email', 'WhatsApp', 'Phone', 'Meeting', 'Other'];

export function useLeads() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('project_inquiries').select('*').order('created_at', { ascending: false });
    if (e) setError(e.message); else { setError(''); setRows(data); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { rows, error, load };
}

const Row = ({ k, v }) => (v ? <div className="kv"><span>{k}</span><p>{v}</p></div> : null);

export function LeadDrawer({ lead, onClose, onSaved }) {
  const [l, setL] = useState(lead);
  const [note, setNote] = useState('');
  const [hist, setHist] = useState({ channel: 'Email', summary: '' });
  const [tags, setTags] = useState((lead.tags || []).join(', '));
  const [toast, notify] = useToast();

  const save = async (changes, msg = 'Saved') => {
    const { error } = await supabase.from('project_inquiries').update(changes).eq('id', l.id);
    if (error) return notify(error.message, 'err');
    setL((x) => ({ ...x, ...changes }));
    logActivity('update lead', 'project_inquiries', l.id);
    notify(msg); onSaved?.();
  };

  const addNote = () => {
    if (!note.trim()) return;
    const notes = [{ at: new Date().toISOString(), text: note.trim() }, ...(l.notes || [])];
    save({ notes }, 'Note added'); setNote('');
  };
  const addHistory = () => {
    if (!hist.summary.trim()) return;
    const contact_history = [{ at: new Date().toISOString(), channel: hist.channel, summary: hist.summary.trim() }, ...(l.contact_history || [])];
    const changes = { contact_history };
    if (l.status === 'New') changes.status = 'Contacted';
    save(changes, 'Contact logged'); setHist({ ...hist, summary: '' });
  };

  return (
    <Drawer title={`${l.inquiry_code} · ${l.full_name}`} onClose={onClose} wide>
      <div className="lead-top">
        <label className="afield"><span>Status</span>
          <select className="ainput" value={l.status} onChange={(e) => save({ status: e.target.value }, `Moved to ${e.target.value}`)}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="afield"><span>Priority</span>
          <select className="ainput" value={l.priority} onChange={(e) => save({ priority: e.target.value })}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="afield"><span>Follow-up date</span>
          <input type="date" className="ainput" value={l.follow_up_date || ''} onChange={(e) => save({ follow_up_date: e.target.value || null })} />
        </label>
      </div>
      <label className="afield"><span>Tags (comma separated)</span>
        <input className="ainput" value={tags} onChange={(e) => setTags(e.target.value)}
          onBlur={() => save({ tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })} />
      </label>

      <h3 className="sec">Contact</h3>
      <div className="kv-grid">
        <Row k="Email" v={<a href={`mailto:${l.email}`}>{l.email}</a>} />
        <Row k="Phone / WhatsApp" v={l.phone} />
        <Row k="Organization" v={l.organization} />
        <Row k="Preferred contact" v={l.contact_method} />
        <Row k="Received" v={fmtDateTime(l.created_at)} />
      </div>

      <h3 className="sec">Inquiry</h3>
      <Row k="Project type" v={l.project_type} />
      <Row k="Description" v={l.description} />
      <Row k="Problem to solve" v={l.problem} />
      <Row k="Required features" v={l.features} />
      <div className="kv-grid">
        <Row k="Budget" v={l.budget} /><Row k="Timeline" v={l.timeline} /><Row k="Existing website" v={l.existing_website} />
      </div>
      <Row k="Additional info" v={l.additional_info} />

      <h3 className="sec">Contact history</h3>
      <div className="inline-add">
        <select className="ainput sm" value={hist.channel} onChange={(e) => setHist({ ...hist, channel: e.target.value })}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
        <input className="ainput" placeholder="What was discussed?" value={hist.summary} onChange={(e) => setHist({ ...hist, summary: e.target.value })} />
        <button className="abtn" onClick={addHistory}>Log</button>
      </div>
      <ul className="log">{(l.contact_history || []).map((h, i) => <li key={i}><b>{h.channel}</b> {h.summary}<time className="muted">{fmtDateTime(h.at)}</time></li>)}</ul>

      <h3 className="sec">Private notes</h3>
      <div className="inline-add">
        <textarea className="ainput" rows={2} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="abtn" onClick={addNote}>Add</button>
      </div>
      <ul className="log">{(l.notes || []).map((n, i) => <li key={i}>{n.text}<time className="muted">{fmtDateTime(n.at)}</time></li>)}</ul>
      {toast}
    </Drawer>
  );
}

export default function Leads({ onChange }) {
  const { rows, error, load } = useLeads();
  const [open, setOpen] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const [toast, notify] = useToast();

  const refresh = () => { load(); onChange?.(); };
  const move = async (lead, status) => {
    const { error: e } = await supabase.from('project_inquiries').update({ status }).eq('id', lead.id);
    if (e) notify(e.message, 'err'); else { logActivity('move lead', 'project_inquiries', lead.id); refresh(); }
  };

  const columns = LEAD_STATUSES.filter((s) => showClosed || !['Archived', 'Rejected'].includes(s));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="page-head">
        <div><h1>Leads</h1><p className="muted">Your lightweight CRM. Drag a card or use the card menu to change stage.</p></div>
        <label className="check-inline"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show archived & rejected</label>
      </div>
      {error && <div className="banner err">{error}</div>}
      {!rows ? <div className="state"><span className="spinner" /></div> : (
        <div className="board">
          {columns.map((status) => {
            const items = rows.filter((r) => r.status === status);
            return (
              <section key={status} className="col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { const id = e.dataTransfer.getData('text/plain'); const lead = rows.find((r) => r.id === id); if (lead && lead.status !== status) move(lead, status); }}>
                <header><StatusBadge value={status} /><span className="muted">{items.length}</span></header>
                {items.map((r) => (
                  <article key={r.id} className={`lcard pr-${r.priority}`} draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', r.id)} onClick={() => setOpen(r)}>
                    <b>{r.full_name}</b>
                    <span className="muted">{r.project_type || 'Project'}{r.organization ? ` · ${r.organization}` : ''}</span>
                    <div className="lmeta">
                      <span className="mono">{r.inquiry_code}</span>
                      {r.priority === 'High' && <span className="badge red">High</span>}
                      {r.follow_up_date && <span className={`badge ${r.follow_up_date <= today ? 'amber' : 'grey'}`}>↻ {fmtDay(r.follow_up_date)}</span>}
                      <span className="muted">{ago(r.created_at)}</span>
                    </div>
                    <select className="ainput xs" value={r.status} aria-label="Move to stage"
                      onClick={(e) => e.stopPropagation()} onChange={(e) => move(r, e.target.value)}>
                      {LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </article>
                ))}
                {items.length === 0 && <p className="muted small empty-col">Empty</p>}
              </section>
            );
          })}
        </div>
      )}
      {open && <LeadDrawer lead={open} onClose={() => setOpen(null)} onSaved={refresh} />}
      {toast}
    </div>
  );
}
