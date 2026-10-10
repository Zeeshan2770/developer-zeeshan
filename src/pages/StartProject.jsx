import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { submitInquiry } from '../lib/api';
import { clean, isEmail, isPhone, isUrlish } from '../lib/validate';
import { SectionHead } from '../components/ui';

const TYPES = ['Website', 'Web application', 'Educational platform', 'Management system', 'Custom solution', 'Digital product', 'Not sure yet'];
const BUDGETS = ['Not sure yet', 'Small project', 'Medium project', 'Large project', 'Let\'s discuss'];
const TIMELINES = ['Flexible', 'Within 1 month', '1–3 months', '3+ months'];
const METHODS = ['Email', 'WhatsApp', 'Phone call'];

const INITIAL = {
  full_name: '', email: '', phone: '', organization: '', project_type: '', description: '', problem: '',
  features: '', budget: '', timeline: '', existing_website: '', additional_info: '', contact_method: 'Email',
  consent: false, website_hp: '',
};

function Field({ label, error, required, children, hint }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}{required && <i aria-hidden="true"> *</i>}</span>
      {children}
      {hint && !error && <small className="muted">{hint}</small>}
      {error && <small className="err" role="alert">{error}</small>}
    </label>
  );
}

export default function StartProject() {
  const [f, setF] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [fail, setFail] = useState('');
  const openedAt = useRef(Date.now());

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const validate = () => {
    const e = {};
    if (clean(f.full_name, 120).length < 2) e.full_name = 'Please enter your name.';
    if (!isEmail(f.email)) e.email = 'Enter a valid email address.';
    if (!isPhone(f.phone)) e.phone = 'Enter a valid phone / WhatsApp number.';
    if (clean(f.description, 4000).length < 20) e.description = 'Describe your project in at least a couple of sentences.';
    if (!isUrlish(f.existing_website)) e.existing_website = 'Enter a valid website address.';
    if (!f.consent) e.consent = 'Please agree so I can contact you about this inquiry.';
    return e;
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    setFail('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { document.querySelector('.has-error input, .has-error textarea')?.focus(); return; }
    if (Date.now() - openedAt.current < 2500) { setFail('That was quick! Please review your answers and try again.'); return; }

    setBusy(true);
    const payload = {
      full_name: clean(f.full_name, 120), email: clean(f.email, 254).toLowerCase(), phone: clean(f.phone, 40),
      organization: clean(f.organization, 160), project_type: clean(f.project_type, 80),
      description: clean(f.description, 4000), problem: clean(f.problem, 3000), features: clean(f.features, 3000),
      budget: clean(f.budget, 80), timeline: clean(f.timeline, 80), existing_website: clean(f.existing_website, 300),
      additional_info: clean(f.additional_info, 3000), contact_method: clean(f.contact_method, 40),
      consent: true, website_hp: f.website_hp,
    };
    const { data, error } = await submitInquiry(payload);
    setBusy(false);
    if (error) {
      const m = String(error.message || '');
      setFail(m.includes('rate_limited') ? 'Too many inquiries from this email recently. Please try again in a while.'
        : m.includes('not_configured') ? 'The inquiry system is not connected yet. Please use the contact page.'
        : 'Something went wrong while sending. Please try again or use the contact page.');
      return;
    }
    setDone({ code: data, name: payload.full_name.split(' ')[0], email: payload.email });
  };

  if (done) {
    return (
      <>
        <SEO title="Inquiry received" />
        <section className="section confirm">
          <div className="wrap narrow center">
            <div className="check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.500 4.500L19 7.500" /></svg></div>
            <span className="eyebrow">Inquiry received</span>
            <h1>Thank you, {done.name}.</h1>
            <p className="muted lead">Your project inquiry is in. I will read it personally and reply to {done.email}.</p>
            <div className="ticket mono">
              <span className="muted">Inquiry ID</span>
              <strong>{done.code}</strong>
              <span className="muted">Status</span>
              <strong>New</strong>
              <span className="muted">Received</span>
              <strong>{new Date().toLocaleString()}</strong>
            </div>
            <p className="muted">Keep your inquiry ID if you want to follow up.</p>
            <div className="btn-row center-row">
              <Link to="/projects" className="btn btn-ghost">Explore my projects</Link>
              <Link to="/book" className="btn btn-primary">Book a Session</Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SEO title="Start a Project" description="Tell me about the problem you want to solve and I will get back to you." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead eyebrow="Start a project" title="Tell me what you want to build">
            The more context you share, the better my first reply will be. Required fields are marked *.
          </SectionHead>
        </div>
      </section>
      <section className="section tight">
        <form className="wrap narrow form" onSubmit={onSubmit} noValidate>
          <fieldset>
            <legend>About you</legend>
            <div className="form-grid">
              <Field label="Full name" required error={errors.full_name}><input value={f.full_name} onChange={set('full_name')} autoComplete="name" maxLength={120} /></Field>
              <Field label="Email" required error={errors.email}><input type="email" value={f.email} onChange={set('email')} autoComplete="email" maxLength={254} /></Field>
              <Field label="Phone / WhatsApp" error={errors.phone}><input value={f.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} /></Field>
              <Field label="Organization"><input value={f.organization} onChange={set('organization')} autoComplete="organization" maxLength={160} /></Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>The project</legend>
            <Field label="Project type">
              <select value={f.project_type} onChange={set('project_type')}><option value="">Select…</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </Field>
            <Field label="Project description" required error={errors.description} hint="What do you want to build, and for whom?">
              <textarea rows={5} value={f.description} onChange={set('description')} maxLength={4000} />
            </Field>
            <Field label="Problem to solve" hint="What is painful or broken today?"><textarea rows={3} value={f.problem} onChange={set('problem')} maxLength={3000} /></Field>
            <Field label="Required features"><textarea rows={3} value={f.features} onChange={set('features')} maxLength={3000} /></Field>
            <Field label="Existing website" error={errors.existing_website}><input value={f.existing_website} onChange={set('existing_website')} placeholder="example.com" maxLength={300} /></Field>
          </fieldset>

          <fieldset>
            <legend>Scope & preferences</legend>
            <div className="form-grid">
              <Field label="Estimated budget"><select value={f.budget} onChange={set('budget')}><option value="">Select…</option>{BUDGETS.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Expected timeline"><select value={f.timeline} onChange={set('timeline')}><option value="">Select…</option>{TIMELINES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Preferred contact method"><select value={f.contact_method} onChange={set('contact_method')}>{METHODS.map((t) => <option key={t}>{t}</option>)}</select></Field>
            </div>
            <Field label="Additional information"><textarea rows={3} value={f.additional_info} onChange={set('additional_info')} maxLength={3000} /></Field>
          </fieldset>

          {/* Honeypot: hidden from people, irresistible to bots. */}
          <div className="hp" aria-hidden="true">
            <label>Website<input tabIndex={-1} autoComplete="off" value={f.website_hp} onChange={set('website_hp')} /></label>
          </div>

          <label className={`check-row ${errors.consent ? 'has-error' : ''}`}>
            <input type="checkbox" checked={f.consent} onChange={set('consent')} />
            <span>I agree that my details may be stored and used to respond to this inquiry.</span>
          </label>
          {errors.consent && <small className="err" role="alert">{errors.consent}</small>}

          {fail && <div className="banner err" role="alert">{fail}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send inquiry'}</button>
        </form>
      </section>
    </>
  );
}
