import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { getServices } from '../lib/api';
import { Empty, Icon, Loading, Reveal, SectionHead } from '../components/ui';

const arr = (v) => (Array.isArray(v) ? v : []);

export default function Services() {
  const { data, loading } = useAsync(getServices, []);
  const list = data || [];
  return (
    <>
      <SEO title="Services" description="Website development, full-stack applications, educational platforms, management systems and custom digital solutions." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead eyebrow="Services" title="How I can help">
            Clear scope, a real process, and no invented pricing — every project starts with a conversation.
          </SectionHead>
        </div>
      </section>
      <section className="section tight">
        <div className="wrap stack">
          {loading ? <Loading /> : list.length === 0 ? <Empty title="Services coming soon" /> : list.map((s, i) => (
            <Reveal as="article" key={s.id} className="service card" >
              <div className="service-head">
                <span className="ico"><Icon name={s.icon} size={26} /></span>
                <span className="mono muted">{String(i + 1).padStart(2, '0')}</span>
                <h2>{s.title}</h2>
                <p className="muted lead">{s.summary}</p>
              </div>
              <div className="service-cols">
                <div><h4>What it is</h4><p>{s.what_it_is}</p><h4>Who it is for</h4><p>{s.who_for}</p></div>
                <div><h4>What is included</h4><ul className="ticks">{arr(s.includes).map((x) => <li key={x}>{x}</li>)}</ul></div>
                <div><h4>Typical workflow</h4><ol className="flow">{arr(s.workflow).map((x) => <li key={x}>{x}</li>)}</ol></div>
              </div>
              <Link to={s.cta_url || '/start-project'} className="btn btn-primary btn-sm">{s.cta_label || 'Start a Project'}</Link>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
