import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ago } from './lib';

const head = (q) => q.then((r) => r.count ?? 0, () => 0);
const cnt = (t) => supabase.from(t).select('id', { count: 'exact', head: true });

function Stat({ label, value, to, hint }) {
  const body = (<><span className="stat-n">{value ?? '…'}</span><span className="stat-l">{label}</span>{hint && <small className="muted">{hint}</small>}</>);
  return to ? <Link to={to} className="stat">{body}</Link> : <div className="stat">{body}</div>;
}

function Bars({ data }) {
  if (!data.length) return <p className="muted">No page views recorded yet.</p>;
  const max = Math.max(...data.map((d) => d.views), 1);
  const w = 100 / data.length;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="bars" role="img" aria-label="Daily page views">
      {data.map((d, i) => (
        <rect key={d.day} x={i * w + w * 0.15} width={w * 0.7} y={40 - (d.views / max) * 38} height={(d.views / max) * 38} rx="0.6">
          <title>{`${d.day}: ${d.views} views`}</title>
        </rect>
      ))}
    </svg>
  );
}

export default function Dashboard() {
  const [s, setS] = useState({});
  const [feed, setFeed] = useState([]);
  const [an, setAn] = useState(null);
  const [top, setTop] = useState([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    (async () => {
      const [projects, live, inquiries, leads, appts, unread, insights, testimonials] = await Promise.all([
        head(cnt('projects')),
        head(cnt('projects').eq('status', 'Live')),
        head(cnt('project_inquiries').eq('status', 'New')),
        head(cnt('project_inquiries').not('status', 'in', '("Archived","Rejected","Completed")')),
        head(cnt('appointments').in('status', ['Pending', 'Confirmed']).gte('starts_at', new Date().toISOString())),
        head(cnt('messages').eq('status', 'Unread')),
        head(cnt('insights').eq('published', true)),
        head(cnt('testimonials').eq('published', true)),
      ]);
      setS({ projects, live, inquiries, leads, appts, unread, insights, testimonials });
    })();
    supabase.from('notifications').select('id,kind,title,created_at').order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => setFeed(data || []));
    supabase.from('projects').select('name,slug,view_count').order('view_count', { ascending: false }).limit(5)
      .then(({ data }) => setTop((data || []).filter((p) => p.view_count > 0)));
  }, []);

  useEffect(() => {
    supabase.rpc('admin_analytics', { p_days: days }).then(({ data }) => setAn(data || null), () => setAn(null));
  }, [days]);

  const t = an?.totals || {};
  return (
    <div>
      <div className="page-head"><div><h1>Command center</h1><p className="muted">Everything happening across your site.</p></div></div>
      <div className="stats">
        <Stat label="Projects" value={s.projects} to="/admin/projects" />
        <Stat label="Live projects" value={s.live} to="/admin/projects" />
        <Stat label="New inquiries" value={s.inquiries} to="/admin/inquiries" />
        <Stat label="Active leads" value={s.leads} to="/admin/leads" />
        <Stat label="Upcoming appointments" value={s.appts} to="/admin/appointments" />
        <Stat label="Unread messages" value={s.unread} to="/admin/messages" />
        <Stat label="Published blog posts" value={s.insights} to="/admin/insights" />
        <Stat label="Testimonials" value={s.testimonials} to="/admin/testimonials" />
      </div>

      <div className="dash-grid">
        <section className="panel">
          <header>
            <h2>Traffic</h2>
            <select className="ainput sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Range">
              <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
            </select>
          </header>
          <Bars data={an?.daily || []} />
          <div className="mini-stats">
            <div><b>{t.page_view || 0}</b><span>Page views</span></div>
            <div><b>{t.project_view || 0}</b><span>Project views</span></div>
            <div><b>{t.inquiry_submitted || 0}</b><span>Inquiries</span></div>
            <div><b>{t.contact_submitted || 0}</b><span>Messages</span></div>
            <div><b>{t.appointment_requested || 0}</b><span>Booking requests</span></div>
          </div>
          {an && t.page_view > 0 && (
            <p className="muted small">Visit → inquiry conversion: <b>{((t.inquiry_submitted || 0) / t.page_view * 100).toFixed(1)}%</b> of page views</p>
          )}
        </section>

        <section className="panel">
          <header><h2>Popular projects</h2></header>
          {top.length === 0 ? <p className="muted">Views will appear as visitors open case studies.</p> : (
            <ol className="rank">{top.map((p) => <li key={p.slug}><span>{p.name}</span><b>{p.view_count}</b></li>)}</ol>
          )}
          <header className="sub"><h2>Top pages</h2></header>
          {(an?.topPages || []).length === 0 ? <p className="muted">No data yet.</p> : (
            <ol className="rank">{an.topPages.map((p) => <li key={p.path}><span className="mono">{p.path}</span><b>{p.views}</b></li>)}</ol>
          )}
        </section>

        <section className="panel wide">
          <header><h2>Recent activity</h2></header>
          {feed.length === 0 ? <p className="muted">New inquiries, messages and bookings will show up here.</p> : (
            <ul className="feed">{feed.map((n) => <li key={n.id}><span className={`kind ${n.kind}`}>{n.kind.replace(/_/g, ' ')}</span><span>{n.title}</span><time className="muted">{ago(n.created_at)}</time></li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
