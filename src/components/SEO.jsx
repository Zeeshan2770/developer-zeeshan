import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../lib/SettingsContext';
import { resolveSeo } from '../lib/seo';
import { buildJsonLd, ldToString } from '../lib/jsonld';

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
export default function SEO({ title, description, image, imageAlt, keywords, type = 'website', schema = null, noindex = false, record = null, article = null }) {
  const s = useSettings();
  const { pathname } = useLocation();

  useEffect(() => {
    const m = resolveSeo({ settings: s, path: pathname, title, description, image, imageAlt, keywords, noindex, record });
    const img = m.image && m.image.startsWith('/') ? window.location.origin + m.image : m.image;
    const url = SITE_URL ? `${SITE_URL}${pathname}` : window.location.href;

    document.title = m.title;
    setMeta('name', 'description', m.description);
    setMeta('property', 'og:title', m.title);
    setMeta('property', 'og:description', m.description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:image:alt', img ? m.imageAlt : '');
    setMeta('name', 'twitter:image:alt', img ? m.imageAlt : '');
    setMeta('name', 'author', m.author);
    setMeta('property', 'og:site_name', s.name);
    setMeta('property', 'og:locale', m.locale);
    setMeta('name', 'twitter:card', img ? 'summary_large_image' : 'summary');
    setMeta('name', 'twitter:title', m.title);
    setMeta('name', 'twitter:description', m.description);
    setMeta('name', 'twitter:image', img);
    if (m.twitterSite) setMeta('name', 'twitter:site', m.twitterSite);
    setMeta('name', 'robots', m.robots);
    setMeta('name', 'keywords', m.keywords);
    setMeta('name', 'google-site-verification', m.verification.google);
    setMeta('name', 'msvalidate.01', m.verification.bing);
    m.customMeta.forEach((c) => setMeta('name', c.name, c.content));

    // Article extras (publish/modify time, section and one article:tag per tag); removed again on every re-run.
    document.head.querySelectorAll('meta[data-seo-extra]').forEach((n) => n.remove());
    if (article) {
      const add = (property, content) => {
        if (!content) return;
        const el = document.createElement('meta');
        el.setAttribute('property', property); el.setAttribute('content', content); el.setAttribute('data-seo-extra', '1');
        document.head.appendChild(el);
      };
      add('article:published_time', article.published);
      add('article:modified_time', article.modified);
      add('article:section', article.section);
      add('article:author', article.author);
      (article.tags || []).forEach((t) => add('article:tag', t));
    }

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

    const ld = buildJsonLd({ settings: s, site: SITE_URL || window.location.origin, path: pathname, kind: schema?.kind || 'page', data: schema?.data || {} });
    let script = document.getElementById('ld-json');
    if (!noindex) {
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'ld-json';
        document.head.appendChild(script);
      }
      script.textContent = ldToString(ld);
    } else if (script) {
      script.remove();
    }
  }, [title, description, image, imageAlt, keywords, type, schema, noindex, record, article, pathname, s]);

  return null;
}
