import { useRef, useState } from 'react';
import { uploadImage } from './lib';

export function Toggle({ on, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><span /></button>
  );
}

export function Drawer({ title, onClose, children, wide }) {
  return (
    <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="drawer-bg" onClick={onClose} />
      <aside className={`drawer ${wide ? 'wide' : ''}`}>
        <header><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Confirm({ label, onConfirm, danger = true, children }) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <button type="button" className={`abtn ${danger ? 'danger' : ''}`} onClick={() => setArmed(true)}>{children || label}</button>;
  return (
    <span className="confirm-inline">
      <button type="button" className="abtn danger solid" onClick={() => { setArmed(false); onConfirm(); }}>Confirm</button>
      <button type="button" className="abtn" onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}

export function StatusBadge({ value }) {
  const tone = {
    New: 'blue', Unread: 'blue', Pending: 'amber', Proposal: 'amber', Discussion: 'amber', Contacted: 'amber',
    'Active Project': 'green', Confirmed: 'green', Completed: 'green', Replied: 'green', Live: 'green',
    Rejected: 'red', Verified: 'green', Refunded: 'grey', Cancelled: 'red', 'No-show': 'red', Archived: 'grey', Read: 'grey', Rescheduled: 'amber',
  }[value] || 'grey';
  return <span className={`badge ${tone}`}>{value}</span>;
}

export function ImageField({ value, onChange, kind = 'project' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr('');
    try { onChange(await uploadImage(file, kind)); } catch (x) { setErr(x.message || 'Upload failed'); }
    setBusy(false); e.target.value = '';
  };
  return (
    <div className="imgfield">
      {value ? <img src={value} alt="" /> : <div className="img-ph">No image</div>}
      <div className="img-actions">
        <input className="ainput" placeholder="https://… or upload" value={value || ''} onChange={(e) => onChange(e.target.value)} />
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml" hidden onChange={pick} />
        <button type="button" className="abtn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Upload'}</button>
        {value && <button type="button" className="abtn" onClick={() => onChange('')}>Remove</button>}
      </div>
      {err && <small className="err">{err}</small>}
    </div>
  );
}

// const [toast, notify] = useToast();  notify('Saved'); notify('Failed', 'err'); render {toast}
export function useToast() {
  const [t, setT] = useState(null);
  const timer = useRef(null);
  const notify = (msg, kind = 'ok') => {
    clearTimeout(timer.current);
    setT({ msg, kind });
    timer.current = setTimeout(() => setT(null), 3200);
  };
  const node = t ? <div className={`toast ${t.kind}`} role="status">{t.msg}</div> : null;
  return [node, notify];
}
