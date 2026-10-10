import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { getPaymentMethods, submitPayment } from '../lib/api';
import { clean, isEmail, isPhone } from '../lib/validate';
import { Empty, Loading, SectionHead } from '../components/ui';

const PURPOSES = ['Project deposit', 'Milestone payment', 'Final payment', 'Consultation', 'Other'];

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch { /* clipboard blocked: the number is still visible to copy by hand */ }
  };
  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={`Copy ${label}`}>
      {done ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

export default function Pay() {
  const { data, loading } = useAsync(getPaymentMethods, []);
  const methods = data || [];
  const [methodId, setMethodId] = useState('');
  const [f, setF] = useState({
    payer_name: '', email: '', phone: '', purpose: PURPOSES[0], amount: '', currency: 'PKR',
    sender_account: '', transaction_id: '', note: '', website_hp: '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const [done, setDone] = useState(null);
  const openedAt = useRef(Date.now());
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const method = methods.find((m) => m.id === methodId);

  const submit = async (ev) => {
    ev.preventDefault();
    setFail('');
    const e = {};
    const amount = Number(f.amount);
    if (!method) e.method = 'Choose how you sent the payment.';
    if (clean(f.payer_name, 120).length < 2) e.payer_name = 'Please enter your name.';
    if (!isEmail(f.email)) e.email = 'Enter a valid email address.';
    if (!isPhone(f.phone)) e.phone = 'Enter a valid phone number or leave it empty.';
    if (!Number.isFinite(amount) || amount <= 0) e.amount = 'Enter the amount you sent.';
    else if (amount > 10000000) e.amount = 'That amount is too large. Please contact me instead.';
    if (clean(f.transaction_id, 60).length < 4) e.transaction_id = 'Enter the transaction ID from your receipt.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (Date.now() - openedAt.current < 2000) { setFail('Please take a moment to review and try again.'); return; }

    setBusy(true);
    const { data: code, error } = await submitPayment({
      method_id: method.id, payer_name: clean(f.payer_name, 120), email: clean(f.email, 254).toLowerCase(),
      phone: clean(f.phone, 40), purpose: f.purpose, amount: String(amount), currency: f.currency,
      sender_account: clean(f.sender_account, 60), transaction_id: clean(f.transaction_id, 60),
      note: clean(f.note, 1000), website_hp: f.website_hp,
    });
    setBusy(false);
    if (error) {
      const m = String(error.message || '');
      setFail(
        m.includes('duplicate_transaction') ? 'This transaction ID has already been submitted. Please check it, or contact me.'
          : m.includes('rate_limited') ? 'Too many submissions recently. Please try again later.'
            : m.includes('method_unavailable') ? 'That payment method is not available any more. Please choose another.'
              : m.includes('not_configured') ? 'Payments are not connected yet.'
                : 'Could not record your payment. Please try again.',
      );
      return;
    }
    setDone({ code, email: clean(f.email, 254).toLowerCase() });
  };

  return (
    <>
      <SEO title="Make a payment" description="Pay by Easypaisa, JazzCash, bank transfer or Raast, then confirm your payment with a short form." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead eyebrow="Payments" title="Make a payment">
            Send the amount using one of the methods below, then fill in the short form so I can match your payment.
          </SectionHead>
        </div>
      </section>

      <section className="section tight">
        <div className="wrap narrow">
          {done ? (
            <div className="card sent pay-done">
              <h2>Payment details received</h2>
              <p className="pay-code mono">{done.code}</p>
              <p className="muted">
                Your payment is recorded as <strong>pending</strong> until I verify it manually. Keep your receipt and this reference.
                I will use {done.email} if I need to confirm anything.
              </p>
              <Link to="/" className="btn btn-ghost">Back to home</Link>
            </div>
          ) : loading ? <Loading /> : methods.length === 0 ? (
            <Empty title="Online payments are not open yet">
              No payment methods are enabled right now. Please <Link to="/contact" className="link-arrow">contact me</Link> and we will arrange payment directly.
            </Empty>
          ) : (
            <form className="form pay-form" onSubmit={submit} noValidate>
              <ol className="pay-steps">
                <li><b>1</b> Choose a method and send the money</li>
                <li><b>2</b> Copy the transaction ID from your receipt</li>
                <li><b>3</b> Fill in the form below</li>
              </ol>

              <fieldset className="pay-methods">
                <legend className="field-label">How did you pay?<i> *</i></legend>
                <div className="pay-grid">
                  {methods.map((m) => (
                    <label key={m.id} className={`pay-method${methodId === m.id ? ' on' : ''}`}>
                      <input type="radio" name="method" value={m.id} checked={methodId === m.id} onChange={() => setMethodId(m.id)} />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
                {errors.method && <small className="err" role="alert">{errors.method}</small>}
              </fieldset>

              {method && (
                <div className="card pay-account" aria-live="polite">
                  <h3>Send your payment to</h3>
                  <dl>
                    {method.bank_name && <div><dt>Bank</dt><dd>{method.bank_name}</dd></div>}
                    {method.account_title && <div><dt>Account title</dt><dd>{method.account_title}</dd></div>}
                    {method.account_number && (
                      <div><dt>{method.slug === 'raast' ? 'Raast ID / number' : 'Account / number'}</dt>
                        <dd className="mono">{method.account_number} <CopyButton text={method.account_number} label="account number" /></dd></div>
                    )}
                  </dl>
                  {method.instructions && <p className="muted">{method.instructions}</p>}
                </div>
              )}

              <div className="form-grid">
                <label className={`field ${errors.payer_name ? 'has-error' : ''}`}>
                  <span className="field-label">Your name<i> *</i></span>
                  <input value={f.payer_name} onChange={set('payer_name')} maxLength={120} autoComplete="name" />
                  {errors.payer_name && <small className="err" role="alert">{errors.payer_name}</small>}
                </label>
                <label className={`field ${errors.email ? 'has-error' : ''}`}>
                  <span className="field-label">Email<i> *</i></span>
                  <input type="email" value={f.email} onChange={set('email')} maxLength={254} autoComplete="email" />
                  {errors.email && <small className="err" role="alert">{errors.email}</small>}
                </label>
                <label className={`field ${errors.phone ? 'has-error' : ''}`}>
                  <span className="field-label">Phone (optional)</span>
                  <input type="tel" value={f.phone} onChange={set('phone')} maxLength={40} autoComplete="tel" />
                  {errors.phone && <small className="err" role="alert">{errors.phone}</small>}
                </label>
                <label className="field">
                  <span className="field-label">What is this payment for?</span>
                  <select value={f.purpose} onChange={set('purpose')}>{PURPOSES.map((p) => <option key={p}>{p}</option>)}</select>
                </label>
                <label className={`field ${errors.amount ? 'has-error' : ''}`}>
                  <span className="field-label">Amount sent<i> *</i></span>
                  <div className="amount-row">
                    <select value={f.currency} onChange={set('currency')} aria-label="Currency"><option>PKR</option><option>USD</option></select>
                    <input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" />
                  </div>
                  {errors.amount && <small className="err" role="alert">{errors.amount}</small>}
                </label>
                <label className={`field ${errors.transaction_id ? 'has-error' : ''}`}>
                  <span className="field-label">Transaction ID<i> *</i></span>
                  <input value={f.transaction_id} onChange={set('transaction_id')} maxLength={60} autoComplete="off" />
                  {errors.transaction_id && <small className="err" role="alert">{errors.transaction_id}</small>}
                </label>
                <label className="field">
                  <span className="field-label">Your account / number you paid from (optional)</span>
                  <input value={f.sender_account} onChange={set('sender_account')} maxLength={60} autoComplete="off" />
                </label>
                <label className="field wide">
                  <span className="field-label">Note (optional)</span>
                  <textarea rows={3} value={f.note} onChange={set('note')} maxLength={1000} placeholder="Project name, invoice number, anything that helps me match it." />
                </label>
              </div>

              <div className="hp" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website_hp} onChange={set('website_hp')} /></label></div>
              {fail && <div className="banner err" role="alert">{fail}</div>}
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit payment details'}</button>
              <p className="muted fine">
                Payments are checked manually, so a payment stays pending until I verify it. This form does not move any money
                by itself: you send the payment from your own app or bank first.
              </p>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
