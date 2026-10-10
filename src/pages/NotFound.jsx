import { Link } from 'react-router-dom';
import SEO from '../components/SEO';

export default function NotFound() {
  return (
    <section className="page-hero">
      <SEO title="Page not found" />
      <div className="wrap center">
        <p className="mono kicker">404</p>
        <h1>This page does not exist.</h1>
        <p className="muted lead">It may have moved, or it was never built.</p>
        <Link to="/" className="btn btn-primary">Back home</Link>
      </div>
    </section>
  );
}
