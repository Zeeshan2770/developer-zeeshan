// Image helpers: accessible alt text and (optional) resized copies.
//
// altText(): always returns a meaningful description. A hand-written alt wins; otherwise a sensible one is built from
// the context so no content image is ever left without alt text. Decorative images keep alt="".
export const altText = (custom, fallback) => {
  const c = String(custom || '').trim();
  return (c || String(fallback || '')).replace(/\s+/g, ' ').slice(0, 160);
};

// Supabase can resize images on the fly (Image Transformations, a Pro-plan feature). It is OFF by default so nothing
// breaks on the free plan; set VITE_IMG_TRANSFORM=1 in Netlify to switch it on and the hero portrait is served at the
// size the screen needs instead of the full upload.
const TRANSFORM = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_IMG_TRANSFORM === '1';
const PUBLIC_PATH = '/storage/v1/object/public/';

export function resized(url, width, quality = 75) {
  if (!TRANSFORM || !url || !url.includes(PUBLIC_PATH)) return url;
  return `${url.replace(PUBLIC_PATH, '/storage/v1/render/image/public/').split('?')[0]}?width=${width}&quality=${quality}&resize=contain`;
}

export function srcSet(url, widths = [480, 720, 960]) {
  if (!TRANSFORM || !url || !url.includes(PUBLIC_PATH)) return undefined;
  return widths.map((w) => `${resized(url, w)} ${w}w`).join(', ');
}
