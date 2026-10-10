import { useMemo, useState } from 'react';
import { LEAD_STATUSES, LeadDrawer, useLeads } from './Leads';
import { StatusBadge } from './adminui';
import { fmtDateTime } from './lib';

// The raw inbox of everything submitted through /start-project. Leads is the pipeline view of the same records.
export default function Inquiries({ onChange }) {
  const { rows, error, load } = useLeads();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [open, setOpen] = useState(null);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || []).filter((r) =>
      (status === 'All' || r.status === status) &&
      (!n || `${r.full_name} ${r.email} ${r.organization || ''} ${r.inquiry_code} ${r.description}`.toLowerCase().includes(n)));
  }, [rows, q, status]);

  return (
    <div>
      <div className="page-head"><div><h1>Project inquiries</h1><p className="muted">Every submission from the Start a Project form.</p></div></div>
      <div className="toolbar">
        <input className="ainput" type="search" placeholder="Search name, email, code…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ainput sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>All</option>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {error && <div className="banner err">{error}</div>}
      {!rows ? <div className="state"><span className="spinner" /></div> : list.length === 0 ? (
        <div className="state empty"><strong>No inquiries found</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="atable">
            <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Budget</th><th>Status</th><th>Received</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className={r.status === 'New' ? 'unread' : ''}>
                  <td className="mono">{r.inquiry_code}</td>
                  <td><button className="linkish" onClick={() => setOpen(r)}>{r.full_name}</button><div className="muted small">{r.email}</div></td>
                  <td>{r.project_type || '—'}</td><td>{r.budget || '—'}</td>
                  <td><StatusBadge value={r.status} /></td><td className="nowrap">{fmtDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <LeadDrawer lead={open} onClose={() => setOpen(null)} onSaved={() => { load(); onChange?.(); }} />}
    </div>
  );
}
