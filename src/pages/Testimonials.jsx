import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { getTestimonials, submitTestimonial } from '../lib/api';
import { Empty, Loading, SectionHead } from '../components/ui';
import { clean, safeUrl } from '../lib/validate';


function ShareForm() {
  const [f, setF] = useState({ name: '', role: '', organization: '', rating: '', message: '', consent: false, website_hp: '' });
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
    if (!f.consent) e.consent = 'Please confirm so I can display your words.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (Date.now() - openedAt.current < 2500) { setFail('Please review your testimonial and try again.'); return; }
    setBusy(true);
    const { error } = await submitTestimonial({
      name: clean(f.name, 120), role: clean(f.role, 120), organization: clean(f.organization, 160),
      rating: f.rating ? Number(f.rating) : null, message: clean(f.message, 1500), consent: true, website_hp: f.website_hp,
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
      <label className={`field ${errors.message ? 'has-error' : ''}`}><span className="field-label">Your testimonial <i>*</i></span>
        <textarea rows={5} value={f.message} onChange={set('message')} maxLength={1500} />{errors.message && <small className="err" role="alert">{errors.message}</small>}</label>
      <div className="hp" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website_hp} onChange={set('website_hp')} /></label></div>
      <label className={`check-row ${errors.consent ? 'has-error' : ''}`}>
        <input type="checkbox" checked={f.consent} onChange={set('consent')} />
        <span>I am happy for my words, name and role to be shown publicly on this site after approval.</span>
      </label>
      {errors.consent && <small className="err" role="alert">{errors.consent}</small>}
      {fail && <div className="banner err" role="alert">{fail}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit testimonial'}</button>
    </form>
  );
}

export default function Testimonials() {
  const { data, loading } = useAsync(getTestimonials, []);
  const list = data || [];
  return (
    <>
      <SEO title="Testimonials" description="What people say about working with me." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead eyebrow="Testimonials" title="In their words" />
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
            <div className="grid grid-2">
              {list.map((t) => {
                const photo = safeUrl(t.photo_url);
                return (
                  <figure key={t.id} className="card quote">
                    {t.rating && <div className="stars" aria-label={`${t.rating} out of 5`}>{'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}</div>}
                    <blockquote>{t.message}</blockquote>
                    <figcaption>
                      {photo && <img src={photo} alt="" loading="lazy" />}
                      <span><strong>{t.name}</strong><span className="muted">{[t.role, t.organization].filter(Boolean).join(' · ')}</span></span>
                    </figcaption>
                    {t.projects && <Link className="link-arrow" to={`/projects/${t.projects.slug}`}>{t.projects.name} →</Link>}
                  </figure>
                );
              })}
            </div>
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
