import { Component } from 'react';

// Last line of defence: a rendering error shows a calm recovery screen instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Intentionally console-only: no third-party error reporting, no personal data leaves the browser.
    console.error('UI error:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="state" role="alert" style={{ minHeight: '70vh', justifyContent: 'center' }}>
        <h1 style={{ fontSize: '2.4rem' }}>Something broke.</h1>
        <p className="muted">An unexpected error occurred. Reloading usually fixes it.</p>
        <div className="btn-row center-row">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
          <a className="btn btn-ghost" href="/">Go home</a>
        </div>
      </div>
    );
  }
}
