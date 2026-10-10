import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Confirm, Drawer, StatusBadge, useToast } from './adminui';
import { fmtDateTime, logActivity } from './lib';

const FILTERS = ['Pending', 'Verified', 'Rejected', 'Refunded', 'All'];
const money = (n, cur) => `${cur} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function Payments({ onChange }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('Pending');
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [toast, notify] = useToast();

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (error) notify(error.message, 'err'); else setRows(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (p, status) => {
    const changes = { status, admin_note: note.trim() || null };
    const { error } = await supabase.from('payments').update(changes).eq('id', p.id);
    if (error) return notify(error.message, 'err');
    logActivity(`payment ${status.toLowerCase()}`, 'payments', p.id);
    setOpen((o) => (o ? { ...o, ...changes } : o));
    notify(`Marked ${status.toLowerCase()}`);
    load(); onChange?.();
  };

  const remove = async (p) => {
    const { error } = await supabase.from('payments').delete().eq('id', p.id);
    if (error) return notify(error.message, 'err');
    logActivity('delete payment', 'payments', p.id);
    setOpen(null); load(); onChange?.();
  };

  // Real totals only: money from payments you have marked Verified.
  const verified = useMemo(() => {
    const t = {};
    (rows || []).filter((r) => r.status === 'Verified').forEach((r) => { t[r.currency] = (t[r.currency] || 0) + Number(r.amount); });
    return Object.entries(t);
  }, [rows]);

  const list = (rows || []).filter((r) => filter === 'All' || r.status === filter);
  const pending = (rows || []).filter((r) => r.status === 'Pending').length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p className="muted">
            Payers send money from their own app or bank, then submit the transaction ID here. Check it against your account,
            then mark it Verified. Set up the methods under Payment Methods.
          </p>
        </div>
      </div>

      <div className="kv-grid" style={{ marginBottom: 18 }}>
        <div className="kv"><span>Waiting for verification</span><p>{pending}</p></div>
        <div className="kv"><span>Verified total</span><p>{verified.length ? verified.map(([c, n]) => money(n, c)).join(' · ') : '—'}</p></div>
      </div>

      <div className="chips">
        {FILTERS.map((f) => <button key={f} className={`achip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
      </div>

      {!rows ? <div className="state"><span className="spinner" /></div> : list.length === 0 ? (
        <div className="state empty"><strong>No {filter === 'All' ? '' : filter.toLowerCase()} payments</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="atable">
            <thead><tr><th>Reference</th><th>Payer</th><th>Method</th><th>Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.status === 'Pending' ? 'unread' : ''}>
                  <td className="nowrap"><button className="linkish" onClick={() => { setOpen(p); setNote(p.admin_note || ''); }}>{p.payment_code}</button><div className="muted small">{fmtDateTime(p.created_at)}</div></td>
                  <td>{p.payer_name}<div className="muted small">{p.purpose}</div></td>
                  <td>{p.method_name}<div className="muted small mono">{p.transaction_id}</div></td>
                  <td className="nowrap">{money(p.amount, p.currency)}</td>
                  <td><StatusBadge value={p.status} /></td>
                  <td className="nowrap right">
                    {p.status === 'Pending' && <button className="abtn solid xs" onClick={() => { setNote(''); setStatus(p, 'Verified'); }}>Verify</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Drawer title={`${open.payment_code} · ${money(open.amount, open.currency)}`} onClose={() => setOpen(null)}>
          <div className="kv-grid">
            <div className="kv"><span>Status</span><p><StatusBadge value={open.status} /></p></div>
            <div className="kv"><span>Received</span><p>{fmtDateTime(open.created_at)}</p></div>
            <div className="kv"><span>Payer</span><p>{open.payer_name}</p></div>
            <div className="kv"><span>Email</span><p><a href={`mailto:${open.email}`}>{open.email}</a></p></div>
            <div className="kv"><span>Phone</span><p>{open.phone || '—'}</p></div>
            <div className="kv"><span>Purpose</span><p>{open.purpose}</p></div>
            <div className="kv"><span>Method</span><p>{open.method_name}</p></div>
            <div className="kv"><span>Transaction ID</span><p className="mono">{open.transaction_id}</p></div>
            <div className="kv"><span>Paid from</span><p>{open.sender_account || '—'}</p></div>
          </div>
          {open.note && <div className="msg-body">{open.note}</div>}

          <h3 className="sec">Your note (private)</h3>
          <textarea className="ainput" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: how you checked it, invoice number…" />

          <h3 className="sec">Decision</h3>
          <div className="chips">
            {['Verified', 'Rejected', 'Refunded', 'Pending'].map((st) => (
              <button key={st} className={`achip ${open.status === st ? 'on' : ''}`} onClick={() => setStatus(open, st)}>{st}</button>
            ))}
          </div>
          <p className="muted small">“Refunded” only records that you returned the money. It does not send any money.</p>
          <div className="editor-foot"><Confirm onConfirm={() => remove(open)}>Delete record</Confirm></div>
        </Drawer>
      )}
      {toast}
    </div>
  );
}
