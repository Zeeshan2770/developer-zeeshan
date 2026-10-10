import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_SETTINGS } from '../lib/defaults';
import { ImageField, Toggle, useToast } from './adminui';
import { logActivity } from './lib';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BOOKING_DEFAULT = {
  enabled: true, timezone: 'Asia/Karachi', days: [1, 2, 3, 4, 5], start: '10:00', end: '17:00', durationMin: 30, bufferMin: 15,
  maxPerDay: 4, minNoticeHours: 12, horizonDays: 30,
  purposes: ['Discuss a project', 'Technical consultation', 'Collaboration', 'General question'], types: ['Video call', 'Phone call'],
};
const TIMEZONES = (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Karachi', 'UTC']);

const F = ({ label, children, hint }) => <label className="afield"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;

export default function Settings() {
  const [site, setSite] = useState(null);
  const [booking, setBooking] = useState(null);
  const [saving, setSaving] = useState('');
  const [tab, setTab] = useState('site');
  const [toast, notify] = useToast();

  useEffect(() => {
    supabase.from('site_settings').select('key,value').in('key', ['site', 'booking']).then(({ data }) => {
      const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      setSite({ ...DEFAULT_SETTINGS, ...(m.site || {}) });
      setBooking({ ...BOOKING_DEFAULT, ...(m.booking || {}) });
    });
  }, []);

  const save = async (key, value) => {
    setSaving(key);
    const { error } = await supabase.from('site_settings').upsert({ key, value });
    setSaving('');
    if (error) return notify(error.message, 'err');
    logActivity(`update ${key} settings`, 'site_settings', key);
    notify('Settings saved');
  };

  if (!site || !booking) return <div className="state"><span className="spinner" /></div>;
  const s = (patch) => setSite((x) => ({ ...x, ...patch }));
  const b = (patch) => setBooking((x) => ({ ...x, ...patch }));
  const lines = (v) => (v || []).join('\n');
  const toLines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);

  return (
    <div>
      <div className="page-head"><div><h1>Settings</h1><p className="muted">Everything personal on the site is edited here — nothing is hard-coded.</p></div></div>
      <div className="chips">
        {[['site', 'Site & brand'], ['story', 'About story'], ['booking', 'Booking'], ['seo', 'SEO & footer']].map(([k, l]) => (
          <button key={k} className={`achip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'site' && (
        <form className="editor narrow-ed" onSubmit={(e) => { e.preventDefault(); save('site', site); }}>
          <fieldset><legend>Identity</legend>
            <F label="Name"><input className="ainput" value={site.name} onChange={(e) => s({ name: e.target.value })} /></F>
            <F label="Title"><input className="ainput" value={site.title} onChange={(e) => s({ title: e.target.value })} /></F>
            <F label="Philosophy line"><input className="ainput" value={site.tagline} onChange={(e) => s({ tagline: e.target.value })} /></F>
            <F label="Hero statement"><textarea className="ainput" rows={2} value={site.heroStatement} onChange={(e) => s({ heroStatement: e.target.value })} /></F>
            <F label="Hero supporting text"><textarea className="ainput" rows={2} value={site.heroSupport} onChange={(e) => s({ heroSupport: e.target.value })} /></F>
            <F label="Profile image"><ImageField value={site.profileImage} onChange={(v) => s({ profileImage: v })} kind="profile" /></F>
            <F label="Logo"><ImageField value={site.logo} onChange={(v) => s({ logo: v })} kind="logo" /></F>
          </fieldset>
          <fieldset><legend>Availability</legend>
            <div className="afield inline"><span>Show “available” indicator</span>
              <Toggle on={site.availability?.open} label="Available" onChange={(v) => s({ availability: { ...site.availability, open: v } })} /></div>
            <F label="Indicator text"><input className="ainput" value={site.availability?.label || ''} onChange={(e) => s({ availability: { ...site.availability, label: e.target.value } })} /></F>
          </fieldset>
          <fieldset><legend>Contact & social</legend>
            <F label="Email"><input className="ainput" type="email" value={site.email} onChange={(e) => s({ email: e.target.value })} /></F>
            <F label="Phone"><input className="ainput" value={site.phone} onChange={(e) => s({ phone: e.target.value })} /></F>
            <F label="WhatsApp (international format, digits)" hint="Example: 923001234567"><input className="ainput" value={site.whatsapp} onChange={(e) => s({ whatsapp: e.target.value })} /></F>
            <div className="afield inline">
              <span>Floating WhatsApp button</span>
              <Toggle on={site.waFloat !== false} label="Show on every page" onChange={(v) => s({ waFloat: v })} />
              <small className="muted">A green chat button at the bottom-right. It only appears when a WhatsApp number is set above.</small>
            </div>
            <F label="Pre-filled WhatsApp message" hint="The first message visitors see when the chat opens. They can edit it before sending.">
              <input className="ainput" maxLength={300} value={site.waMessage ?? ''} onChange={(e) => s({ waMessage: e.target.value })} />
            </F>
            <F label="GitHub URL"><input className="ainput" value={site.social?.github || ''} onChange={(e) => s({ social: { ...site.social, github: e.target.value } })} /></F>
            <F label="LinkedIn URL"><input className="ainput" value={site.social?.linkedin || ''} onChange={(e) => s({ social: { ...site.social, linkedin: e.target.value } })} /></F>
            <F label="Other profiles (one per line: Label | URL)" hint="Example: YouTube | https://youtube.com/@name  — also X, Instagram, Facebook, etc. Only http(s) links are shown.">
              <textarea className="ainput mono" rows={4} value={(site.social?.extra || []).map((e) => `${e.label} | ${e.url}`).join('\n')}
                onChange={(e) => s({ social: { ...site.social, extra: e.target.value.split('\n').map((l) => { const [label = '', ...u] = l.split('|'); return { label: label.trim().slice(0, 40), url: u.join('|').trim() }; }).filter((x) => x.label || x.url) } })} />
            </F>
          </fieldset>
          <div className="editor-foot"><button className="abtn solid" disabled={saving === 'site'}>{saving === 'site' ? 'Saving…' : 'Save'}</button></div>
        </form>
      )}

      {tab === 'story' && (
        <form className="editor narrow-ed" onSubmit={(e) => { e.preventDefault(); save('site', site); }}>
          {(site.story || []).map((c, i) => (
            <fieldset key={i}>
              <legend>Chapter {i + 1}</legend>
              <F label="Title"><input className="ainput" value={c.title} onChange={(e) => s({ story: site.story.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /></F>
              <F label="Text"><textarea className="ainput" rows={4} value={c.body} onChange={(e) => s({ story: site.story.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} /></F>
              <button type="button" className="abtn danger xs" onClick={() => s({ story: site.story.filter((_, j) => j !== i) })}>Remove chapter</button>
            </fieldset>
          ))}
          <button type="button" className="abtn" onClick={() => s({ story: [...(site.story || []), { title: 'New chapter', body: '' }] })}>+ Add chapter</button>
          <div className="editor-foot"><button className="abtn solid" disabled={saving === 'site'}>Save story</button></div>
        </form>
      )}

      {tab === 'booking' && (
        <form className="editor narrow-ed" onSubmit={(e) => { e.preventDefault(); save('booking', booking); }}>
          <fieldset><legend>Availability</legend>
            <div className="afield inline"><span>Accept bookings</span><Toggle on={booking.enabled} label="Bookings" onChange={(v) => b({ enabled: v })} /></div>
            <F label="Timezone" hint="All working hours are evaluated in this timezone; visitors see slots converted to their own.">
              <select className="ainput" value={booking.timezone} onChange={(e) => b({ timezone: e.target.value })}>
                {(TIMEZONES.includes(booking.timezone) ? TIMEZONES : [booking.timezone, ...TIMEZONES]).map((z) => <option key={z}>{z}</option>)}
              </select>
            </F>
            <div className="afield"><span>Available days</span>
              <div className="chips">{DAYS.map((d, i) => (
                <button type="button" key={d} className={`achip ${booking.days.includes(i) ? 'on' : ''}`}
                  onClick={() => b({ days: booking.days.includes(i) ? booking.days.filter((x) => x !== i) : [...booking.days, i].sort() })}>{d}</button>
              ))}</div>
            </div>
            <div className="three">
              <F label="Start"><input className="ainput" type="time" value={booking.start} onChange={(e) => b({ start: e.target.value })} /></F>
              <F label="End"><input className="ainput" type="time" value={booking.end} onChange={(e) => b({ end: e.target.value })} /></F>
            </div>
          </fieldset>
          <fieldset><legend>Rules</legend>
            <div className="three">
              <F label="Duration (min)"><input className="ainput" type="number" min={10} max={240} value={booking.durationMin} onChange={(e) => b({ durationMin: Number(e.target.value) })} /></F>
              <F label="Buffer (min)"><input className="ainput" type="number" min={0} max={120} value={booking.bufferMin} onChange={(e) => b({ bufferMin: Number(e.target.value) })} /></F>
              <F label="Max bookings / day"><input className="ainput" type="number" min={1} max={50} value={booking.maxPerDay} onChange={(e) => b({ maxPerDay: Number(e.target.value) })} /></F>
              <F label="Minimum notice (hours)"><input className="ainput" type="number" min={0} value={booking.minNoticeHours} onChange={(e) => b({ minNoticeHours: Number(e.target.value) })} /></F>
              <F label="Bookable days ahead"><input className="ainput" type="number" min={1} max={365} value={booking.horizonDays} onChange={(e) => b({ horizonDays: Number(e.target.value) })} /></F>
            </div>
            <F label="Purposes (one per line)"><textarea className="ainput" rows={4} value={lines(booking.purposes)} onChange={(e) => b({ purposes: toLines(e.target.value) })} /></F>
            <F label="Appointment types (one per line)"><textarea className="ainput" rows={3} value={lines(booking.types)} onChange={(e) => b({ types: toLines(e.target.value) })} /></F>
            <p className="muted small">Blocked dates are managed on the Appointments page. Overlaps are blocked by the database itself.</p>
          </fieldset>
          <div className="editor-foot"><button className="abtn solid" disabled={saving === 'booking'}>{saving === 'booking' ? 'Saving…' : 'Save booking settings'}</button></div>
        </form>
      )}

      {tab === 'seo' && (
        <form className="editor narrow-ed" onSubmit={(e) => { e.preventDefault(); save('site', site); }}>
          <fieldset><legend>SEO defaults</legend>
            <F label="Default description"><textarea className="ainput" rows={2} value={site.seo?.defaultDescription || ''} onChange={(e) => s({ seo: { ...site.seo, defaultDescription: e.target.value } })} /></F>
            <F label="Default social sharing image"><ImageField value={site.seo?.ogImage} onChange={(v) => s({ seo: { ...site.seo, ogImage: v } })} kind="other" /></F>
            <F label="Favicon URL"><input className="ainput" value={site.favicon || ''} onChange={(e) => s({ favicon: e.target.value })} /></F>
          </fieldset>
          <fieldset><legend>Footer</legend>
            <F label="Footer line"><input className="ainput" value={site.footer} onChange={(e) => s({ footer: e.target.value })} /></F>
            <F label="Copyright name"><input className="ainput" value={site.copyright} onChange={(e) => s({ copyright: e.target.value })} /></F>
          </fieldset>
          <div className="editor-foot"><button className="abtn solid" disabled={saving === 'site'}>Save</button></div>
        </form>
      )}
      {toast}
    </div>
  );
}
