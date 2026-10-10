import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { supabase, isConfigured } from '../lib/supabase';
import { track } from '../lib/api';
import { clean, isEmail, isPhone } from '../lib/validate';
import { generateSlots } from '../lib/booking';
import { Loading, SectionHead } from '../components/ui';

const visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA'); // YYYY-MM-DD in visitor's zone
const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const fmtFull = (ts) => new Date(ts).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });

export default function Book() {
  const [cfg, setCfg] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(null);
  const [slot, setSlot] = useState(null);
  const [f, setF] = useState({ purpose: '', appointment_type: '', name: '', email: '', phone: '', message: '', website_hp: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const [done, setDone] = useState(null);
  const openedAt = useRef(Date.now());

  const loadSlots = useCallback(async () => {
    if (!isConfigured) { setLoading(false); return; }
    const { data } = await supabase.from('site_settings').select('value').eq('key', 'booking').maybeSingle();
    const c = data?.value;
    setCfg(c || null);
    if (c?.enabled) {
      const from = new Date();
      const to = new Date(Date.now() + ((c.horizonDays || 30) + 2) * 86400e3);
      const [{ data: booked }, { data: blocked }] = await Promise.all([
        supabase.rpc('get_booked_slots', { p_from: from.toISOString(), p_to: to.toISOString() }),
        supabase.from('blocked_dates').select('day'),
      ]);
      const b = (booked || []).map((x) => ({ start: new Date(x.starts_at).getTime(), end: new Date(x.ends_at).getTime() }));
      setSlots(generateSlots(c, b, (blocked || []).map((x) => x.day)));
    }
    setLoading(false);
  }, []);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  const days = useMemo(() => {
    const m = new Map();
    slots.forEach((s) => { const k = dayKey(s.start); if (!m.has(k)) m.set(k, []); m.get(k).push(s); });
    return [...m.entries()];
  }, [slots]);

  useEffect(() => { if (!day && days.length) setDay(days[0][0]); }, [days, day]);
  useEffect(() => {
    if (cfg) setF((x) => ({ ...x, purpose: x.purpose || cfg.purposes?.[0] || '', appointment_type: x.appointment_type || cfg.types?.[0] || '' }));
  }, [cfg]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (ev) => {
    ev.preventDefault();
    setFail('');
    const e = {};
    if (!slot) e.slot = 'Choose a time.';
    if (clean(f.name, 120).length < 2) e.name = 'Please enter your name.';
    if (!isEmail(f.email)) e.email = 'Enter a valid email address.';
    if (!isPhone(f.phone)) e.phone = 'Enter a valid phone number.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (Date.now() - openedAt.current < 2500) { setFail('Please review your details and try again.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('request_appointment', {
      payload: {
        purpose: clean(f.purpose, 120), appointment_type: clean(f.appointment_type, 60), starts_at: new Date(slot.start).toISOString(),
        name: clean(f.name, 120), email: clean(f.email, 254).toLowerCase(), phone: clean(f.phone, 40), message: clean(f.message, 2000), website_hp: f.website_hp,
      },
    });
    setBusy(false);
    if (error) {
      const m = String(error.message || '');
      if (m.includes('slot_taken') || m.includes('slot_unavailable') || m.includes('day_full')) {
        setFail('That time was just taken or is no longer available. Please pick another.');
        setSlot(null); loadSlots();
      } else if (m.includes('rate_limited')) setFail('Too many requests from this email. Please try again later.');
      else setFail('Could not complete the booking. Please try again or contact me directly.');
      return;
    }
    track('appointment_requested', '/book');
    setDone({ code: data, when: slot.start });
  };

  if (done) {
    return (
      <>
        <SEO title="Booking requested" />
        <section className="section confirm">
          <div className="wrap narrow center">
            <div className="check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
            <span className="eyebrow">Request received</span>
            <h1>You are on the calendar.</h1>
            <p className="muted lead">I will confirm your session by email shortly.</p>
            <div className="ticket mono">
              <span className="muted">Reference</span><strong>{done.code}</strong>
              <span className="muted">When</span><strong>{fmtFull(done.when)}</strong>
              <span className="muted">Your timezone</span><strong>{visitorTz}</strong>
              <span className="muted">Status</span><strong>Pending</strong>
            </div>
            <div className="btn-row center-row"><Link to="/projects" className="btn btn-ghost">Explore my projects</Link><Link to="/" className="btn btn-primary">Back home</Link></div>
          </div>
        </section>
      </>
    );
  }

  const daySlots = days.find(([k]) => k === day)?.[1] || [];

  return (
    <>
      <SEO title="Book a Session" description="Book a session to discuss your project." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead eyebrow="Book a session" title="Pick a time that suits you">
            Times are shown in your timezone ({visitorTz}).
          </SectionHead>
        </div>
      </section>
      <section className="section tight">
        <div className="wrap narrow">
          {loading ? <Loading /> : !cfg?.enabled ? (
            <div className="state empty"><strong>Booking is currently closed</strong>
              <p className="muted">Please send a message or a project inquiry instead.</p>
              <div className="btn-row center-row"><Link to="/contact" className="btn btn-primary btn-sm">Contact</Link><Link to="/start-project" className="btn btn-ghost btn-sm">Start a Project</Link></div>
            </div>
          ) : (
            <form className="form" onSubmit={submit} noValidate>
              <fieldset>
                <legend>1 · What is it about?</legend>
                <div className="form-grid">
                  <label className="field"><span className="field-label">Purpose</span>
                    <select value={f.purpose} onChange={set('purpose')}>{(cfg.purposes || []).map((p) => <option key={p}>{p}</option>)}</select></label>
                  <label className="field"><span className="field-label">Session type</span>
                    <select value={f.appointment_type} onChange={set('appointment_type')}>{(cfg.types || []).map((p) => <option key={p}>{p}</option>)}</select></label>
                </div>
              </fieldset>

              <fieldset>
                <legend>2 · Choose a date & time</legend>
                {days.length === 0 ? <p className="muted">No open slots right now. Please check back soon or send a message.</p> : (
                  <>
                    <div className="day-strip" role="tablist" aria-label="Dates">
                      {days.map(([k, list]) => (
                        <button type="button" role="tab" aria-selected={day === k} key={k} className={`day ${day === k ? 'on' : ''}`}
                          onClick={() => { setDay(k); setSlot(null); }}>
                          <span>{fmtDay(list[0].start)}</span><small>{list.length} open</small>
                        </button>
                      ))}
                    </div>
                    <div className="slot-grid" role="listbox" aria-label="Times">
                      {daySlots.map((s) => (
                        <button type="button" role="option" aria-selected={slot?.start === s.start} key={s.start}
                          className={`slot ${slot?.start === s.start ? 'on' : ''}`} onClick={() => setSlot(s)}>{fmtTime(s.start)}</button>
                      ))}
                    </div>
                    {errors.slot && <small className="err" role="alert">{errors.slot}</small>}
                    <small className="muted">Host timezone: {cfg.timezone} · {cfg.durationMin} minute session</small>
                  </>
                )}
              </fieldset>

              <fieldset>
                <legend>3 · Your details</legend>
                <div className="form-grid">
                  <label className={`field ${errors.name ? 'has-error' : ''}`}><span className="field-label">Name <i>*</i></span>
                    <input value={f.name} onChange={set('name')} autoComplete="name" maxLength={120} />{errors.name && <small className="err">{errors.name}</small>}</label>
                  <label className={`field ${errors.email ? 'has-error' : ''}`}><span className="field-label">Email <i>*</i></span>
                    <input type="email" value={f.email} onChange={set('email')} autoComplete="email" maxLength={254} />{errors.email && <small className="err">{errors.email}</small>}</label>
                  <label className={`field ${errors.phone ? 'has-error' : ''}`}><span className="field-label">Phone / WhatsApp</span>
                    <input value={f.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} />{errors.phone && <small className="err">{errors.phone}</small>}</label>
                </div>
                <label className="field"><span className="field-label">Message</span>
                  <textarea rows={3} value={f.message} onChange={set('message')} maxLength={2000} /></label>
              </fieldset>

              <div className="hp" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website_hp} onChange={set('website_hp')} /></label></div>
              {slot && <div className="banner">Selected: <strong>{fmtFull(slot.start)}</strong></div>}
              {fail && <div className="banner err" role="alert">{fail}</div>}
              <button className="btn btn-primary" disabled={busy || days.length === 0}>{busy ? 'Booking…' : 'Request this time'}</button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
