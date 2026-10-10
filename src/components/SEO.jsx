import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../lib/SettingsContext';

const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '');

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content || '');
}

// Dynamic title, description, Open Graph, canonical and optional JSON-LD per page.
export default function SEO({ title, description, image, type = 'website', jsonLd, noindex = false }) {
  const s = useSettings();
  const { pathname } = useLocation();

  useEffect(() => {
    const fullTitle = title ? `${title} — ${s.name}` : `${s.name} — ${s.title}`;
    const desc = description || s.seo?.defaultDescription || '';
    const img = image || s.seo?.ogImage || '';
    const url = SITE_URL ? `${SITE_URL}${pathname}` : window.location.href;

    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', img);
    setMeta('name', 'twitter:card', img ? 'summary_large_image' : 'summary');
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = url;

    if (/^https?:\/\//.test(s.favicon || '')) {
      let ic = document.head.querySelector('link[rel="icon"]');
      if (!ic) { ic = document.createElement('link'); ic.rel = 'icon'; document.head.appendChild(ic); }
      ic.removeAttribute('type');
      ic.href = s.favicon;
    }

    let script = document.getElementById('ld-json');
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'ld-json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) {
      script.remove();
    }
  }, [title, description, image, type, jsonLd, noindex, pathname, s]);

  return null;
}
