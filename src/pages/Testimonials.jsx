import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { getTestimonials, submitTestimonial } from '../lib/api';
import { Empty, Loading, SectionHead } from '../components/ui';
import { clean, isEmail, safeUrl } from '../lib/validate';
import { DISPLAY_OPTIONS, ORG_TYPES, RELATIONSHIPS } from '../lib/testimonials';


function ShareForm() {
  const [f, setF] = useState({
    name: '', role: '', organization: '', rating: '', message: '', consent: false, website_hp: '',
    relationship: '', organization_type: '', location: '', program: '', period: '', impact: '', website_url: '',
    display_as: 'full', contact_email: '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState('');
  const openedAt = useRef(Date.now());
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (ev) => {
    ev.preventDefault();
    setFail('');
    const e = {};
    if (clean(f.name, 120).length < 2) e.name = 'Please enter your name.';
    if (clean(f.message, 1500).length < 20) e.message = 'Please write at least a couple of sentences.';
    if (f.contact_email.trim() && !isEmail(f.contact_email)) e.contact_email = 'That email does not look right.';
    if (f.website_url.trim() && !/^https?:\/\/\S+\.\S+/i.test(f.website_url.trim())) e.website_url = 'Start with https://';
    if (!f.consent) e.consent = 'Please confirm so I can display your words.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (Date.now() - openedAt.current < 2500) { setFail('Please review your testimonial and try again.'); return; }
    setBusy(true);
    const { error } = await submitTestimonial({
      name: clean(f.name, 120), role: clean(f.role, 120), organization: clean(f.organization, 160),
      rating: f.rating ? Number(f.rating) : null, message: clean(f.message, 1500), consent: true, website_hp: f.website_hp,
      relationship: f.relationship, organization_type: f.organization_type, location: clean(f.location, 120),
      program: clean(f.program, 160), period: clean(f.period, 60), impact: clean(f.impact, 300),
      website_url: f.website_url.trim(), display_as: f.display_as, contact_email: f.contact_email.trim(),
    });
    setBusy(false);
    if (error) {
      const m = String(error.message || '');
      setFail(m.includes('rate_limited') ? 'Lots of submissions right now. Please try again a little later.'
        : m.includes('not_configured') ? 'Submissions are not connected yet.' : 'Could not send your testimonial. Please try again.');
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="card sent center" role="status">
        <h2>Thank you.</h2>
        <p className="muted">Your testimonial was received. It will appear here once I have reviewed and approved it.</p>
      </div>
    );
  }
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className={`field ${errors.name ? 'has-error' : ''}`}><span className="field-label">Name <i>*</i></span>
          <input value={f.name} onChange={set('name')} maxLength={120} autoComplete="name" />{errors.name && <small className="err" role="alert">{errors.name}</small>}</label>
        <label className="field"><span className="field-label">Role</span><input value={f.role} onChange={set('role')} maxLength={120} /></label>
        <label className="field"><span className="field-label">Organization</span><input value={f.organization} onChange={set('organization')} maxLength={160} autoComplete="organization" /></label>
        <label className="field"><span className="field-label">Rating</span>
          <select value={f.rating} onChange={set('rating')}><option value="">No rating</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label>
      </div>

      <fieldset className="form-group">
        <legend>About the service</legend>
        <p className="muted small">Optional, but it helps readers understand the context of your experience.</p>
        <div className="form-grid">
          <label className="field"><span className="field-label">How are you connected to the work?</span>
            <select value={f.relationship} onChange={set('relationship')}><option value="">Select…</option>{RELATIONSHIPS.map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="field"><span className="field-label">Type of organisation</span>
            <select value={f.organization_type} onChange={set('organization_type')}><option value="">Select…</option>{ORG_TYPES.map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="field"><span className="field-label">Service or programme involved</span>
            <input value={f.program} onChange={set('program')} maxLength={160} placeholder="e.g. Student portal, volunteer system" /></label>
          <label className="field"><span className="field-label">When</span>
            <input value={f.period} onChange={set('period')} maxLength={60} placeholder="e.g. 2025 or Jan–Jun 2025" /></label>
          <label className="field"><span className="field-label">Location</span>
            <input value={f.location} onChange={set('location')} maxLength={120} placeholder="City / area, country" autoComplete="address-level2" /></label>
          <label className={`field ${errors.website_url ? 'has-error' : ''}`}><span className="field-label">Organisation website</span>
            <input value={f.website_url} onChange={set('website_url')} maxLength={300} inputMode="url" placeholder="https://" />{errors.website_url && <small className="err" role="alert">{errors.website_url}</small>}</label>
        </div>
        <label className="field"><span className="field-label">What changed for you or your community? (one line)</span>
          <input value={f.impact} onChange={set('impact')} maxLength={300} placeholder="e.g. Registration time dropped from days to minutes" /></label>
      </fieldset>

      <label className={`field ${errors.message ? 'has-error' : ''}`}><span className="field-label">Your testimonial <i>*</i></span>
        <textarea rows={5} value={f.message} onChange={set('message')} maxLength={1500} />{errors.message && <small className="err" role="alert">{errors.message}</small>}</label>
      <fieldset className="form-group">
        <legend>Privacy</legend>
        <label className="field"><span className="field-label">How should your name appear?</span>
          <select value={f.display_as} onChange={set('display_as')}>{DISPLAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className={`field ${errors.contact_email ? 'has-error' : ''}`}><span className="field-label">Email (optional, never published)</span>
          <input type="email" value={f.contact_email} onChange={set('contact_email')} maxLength={254} autoComplete="email" />
          <small className="muted">Only used if I need to confirm the testimonial with you.</small>
          {errors.contact_email && <small className="err" role="alert">{errors.contact_email}</small>}</label>
      </fieldset>
      <div className="hp" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website_hp} onChange={set('website_hp')} /></label></div>
      <label className={`check-row ${errors.consent ? 'has-error' : ''}`}>
        <input type="checkbox" checked={f.consent} onChange={set('consent')} />
        <span>I am happy for my words and the details I chose above to be shown publicly on this site after approval.</span>
      </label>
      {errors.consent && <small className="err" role="alert">{errors.consent}</small>}
      {fail && <div className="banner err" role="alert">{fail}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit testimonial'}</button>
    </form>
  );
}

function Card({ t }) {
  const photo = safeUrl(t.photo_url);
  const site = safeUrl(t.website_url);
  const who = [t.role, t.organization].filter(Boolean).join(' · ');
  const context = [t.program, t.location, t.period].filter(Boolean).join(' · ');
  return (
    <figure className="card quote">
      {(t.relationship || t.organization_type || t.verified) && (
        <div className="tags" aria-label="About this testimonial">
          {t.relationship && <span className="tag">{t.relationship}</span>}
          {t.organization_type && <span className="tag">{t.organization_type}</span>}
          {t.verified && <span className="tag tag-ok" title="Confirmed directly with the author">✓ Verified</span>}
        </div>
      )}
      {t.rating && <div className="stars" aria-label={`${t.rating} out of 5`}>{'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}</div>}
      <blockquote>{t.message}</blockquote>
      {t.impact && <p className="impact"><strong>Impact</strong> {t.impact}</p>}
      <figcaption>
        {photo && <img src={photo} alt={`Photo of ${t.name}`} width="44" height="44" loading="lazy" decoding="async" />}
        <span><strong>{t.name}</strong>{who && <span className="muted">{who}</span>}{context && <span className="muted">{context}</span>}</span>
      </figcaption>
      <div className="quote-links">
        {site && <a className="link-arrow" href={site} target="_blank" rel="noopener nofollow noreferrer">Organisation website ↗</a>}
        {t.projects && <Link className="link-arrow" to={`/projects/${t.projects.slug}`}>{t.projects.name} →</Link>}
      </div>
    </figure>
  );
}

export default function Testimonials() {
  const { data, loading } = useAsync(getTestimonials, []);
  const list = data || [];
  const [filter, setFilter] = useState('');
  const kinds = useMemo(() => [...new Set(list.map((t) => t.relationship).filter(Boolean))], [list]);
  const shown = filter ? list.filter((t) => t.relationship === filter) : list;
  return (
    <>
      <SEO title="Testimonials" description="What people say about working with me." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead h1 eyebrow="Testimonials" title="In their words" />
        </div>
      </section>
      <section className="section tight">
        <div className="wrap">
          {loading ? <Loading /> : list.length === 0 ? (
            <Empty title="No testimonials published yet"
              action={<Link className="btn btn-ghost btn-sm" to="/start-project">Be the first project</Link>}>
              Only approved testimonials from real people appear here.
            </Empty>
          ) : (
            <>
              {kinds.length > 1 && (
                <div className="chips" role="group" aria-label="Filter testimonials">
                  <button type="button" className={`chip ${filter === '' ? 'on' : ''}`} aria-pressed={filter === ''} onClick={() => setFilter('')}>All</button>
                  {kinds.map((k) => (
                    <button key={k} type="button" className={`chip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k}</button>
                  ))}
                </div>
              )}
              <div className="grid grid-2">{shown.map((t) => <Card key={t.id} t={t} />)}</div>
            </>
          )}
        </div>
      </section>

      <section className="section alt" id="share">
        <div className="wrap narrow">
          <SectionHead eyebrow="Worked with me?" title="Share your experience">
            Testimonials are reviewed before they appear, and only approved ones are ever shown.
          </SectionHead>
          <ShareForm />
        </div>
      </section>
    </>
  );
}
