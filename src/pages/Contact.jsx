import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useSettings } from '../lib/SettingsContext';
import { submitMessage } from '../lib/api';
import { clean, isEmail, safeUrl, socialLinks } from '../lib/validate';
import SocialButtons from '../components/Social';
import { SectionHead } from '../components/ui';

export default function Contact() {
  const s = useSettings();
  const [f, setF] = useState({ name: '', email: '', subject: '', message: '', website_hp: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [fail, setFail] = useState('');
  const openedAt = useRef(Date.now());
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (ev) => {
    ev.preventDefault();
    setFail('');
    const e = {};
    if (clean(f.name, 120).length < 2) e.name = 'Please enter your name.';
    if (!isEmail(f.email)) e.email = 'Enter a valid email address.';
    if (clean(f.message, 4000).length < 10) e.message = 'Please write a short message.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (Date.now() - openedAt.current < 2000) { setFail('Please take a moment to review and try again.'); return; }
    setBusy(true);
    const { error } = await submitMessage({
      name: clean(f.name, 120), email: clean(f.email, 254).toLowerCase(),
      subject: clean(f.subject, 200), message: clean(f.message, 4000), website_hp: f.website_hp,
    });
    setBusy(false);
    if (error) {
      const m = String(error.message || '');
      setFail(m.includes('rate_limited') ? 'Too many messages recently. Please try again later.'
        : m.includes('not_configured') ? 'The contact form is not connected yet.' : 'Could not send your message. Please try again.');
      return;
    }
    setSent(true);
  };

  const socials = socialLinks(s.social);
  const wa = s.whatsapp ? `https://wa.me/${String(s.whatsapp).replace(/\D/g, '')}` : null;

  return (
    <>
      <SEO title="Contact" description={`Get in touch with ${s.name}.`} />
      <section className="page-hero">
        <div className="wrap"><SectionHead h1 eyebrow="Contact" title="Let's talk">A message, a project, or a quick session — pick what suits you.</SectionHead></div>
      </section>
      <section className="section tight">
        <div className="wrap contact-layout">
          <div>
            {sent ? (
              <div className="card sent"><h2>Message sent</h2><p className="muted">Thank you — I will reply to {f.email} soon.</p></div>
            ) : (
              <form className="form" onSubmit={submit} noValidate>
                {['name', 'email', 'subject'].map((k) => (
                  <label key={k} className={`field ${errors[k] ? 'has-error' : ''}`}>
                    <span className="field-label">{k[0].toUpperCase() + k.slice(1)}{k !== 'subject' && <i> *</i>}</span>
                    <input type={k === 'email' ? 'email' : 'text'} value={f[k]} onChange={set(k)} maxLength={k === 'email' ? 254 : 200} autoComplete={k === 'subject' ? 'off' : k} />
                    {errors[k] && <small className="err" role="alert">{errors[k]}</small>}
                  </label>
                ))}
                <label className={`field ${errors.message ? 'has-error' : ''}`}>
                  <span className="field-label">Message<i> *</i></span>
                  <textarea rows={6} value={f.message} onChange={set('message')} maxLength={4000} />
                  {errors.message && <small className="err" role="alert">{errors.message}</small>}
                </label>
                <div className="hp" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website_hp} onChange={set('website_hp')} /></label></div>
                {fail && <div className="banner err" role="alert">{fail}</div>}
                <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
              </form>
            )}
          </div>
          <aside className="contact-side">
            <div className="card">
              <h3>Prefer a direct line?</h3>
              <ul className="plain">
                {s.email && <li><span className="muted">Email</span><a href={`mailto:${s.email}`}>{s.email}</a></li>}
                {wa && <li><span className="muted">WhatsApp</span><a href={wa} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a></li>}
                {!s.email && !wa && socials.length === 0 && <li className="muted">Contact details are managed from Admin settings.</li>}
              </ul>
              <SocialButtons links={socials} large className="contact-social" />
            </div>
            <div className="card">
              <h3>Or take the next step</h3>
              <div className="btn-row">
                <Link to="/book" className="btn btn-ghost btn-sm">Book a Session</Link>
                <Link to="/start-project" className="btn btn-primary btn-sm">Start a Project</Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
