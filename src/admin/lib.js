import { supabase } from '../lib/supabase';
import { slugify } from '../lib/validate';

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—');

export const ago = (d) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Best-effort audit trail. Never blocks the UI.
export const logActivity = (action, ref_table, ref_id) => {
  supabase.auth.getUser().then(({ data }) =>
    supabase.from('admin_activity').insert({ actor: data?.user?.id ?? null, action, ref_table, ref_id: ref_id ? String(ref_id) : null })
      .then(() => {}, () => {}),
  );
};

// ---- uploads: MIME + size validation, safe filenames, folder per kind, client-side optimization ----
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];
export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1920;

export const safeName = (name) => {
  const base = name.replace(/\.[^.]+$/, '');
  return `${slugify(base).slice(0, 60) || 'file'}-${Date.now().toString(36)}`;
};

async function optimize(file) {
  // SVG and AVIF stay untouched; raster images are downscaled and converted to WebP.
  if (file.type === 'image/svg+xml' || file.type === 'image/avif') return { blob: file, ext: file.type === 'image/svg+xml' ? 'svg' : 'avif', type: file.type };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.84));
    if (blob && blob.size < file.size) return { blob, ext: 'webp', type: 'image/webp' };
  } catch { /* fall through to original */ }
  return { blob: file, ext: file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1], type: file.type };
}

// ---- short screen recordings ----
export const ALLOWED_VIDEO = ['video/mp4', 'video/webm'];
export const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;

// Reads the clip's length and grabs a still frame to use as its poster image.
function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    const done = (r) => { URL.revokeObjectURL(url); resolve(r); };
    const fail = () => { URL.revokeObjectURL(url); reject(new Error('This video could not be read. Try MP4 (H.264) or WebM.')); };
    const timer = setTimeout(() => done({ duration: v.duration || 0, poster: null }), 10000);
    v.onerror = () => { clearTimeout(timer); fail(); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = async () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, 1280 / (v.videoWidth || 1280));
        const c = document.createElement('canvas');
        c.width = Math.round((v.videoWidth || 1280) * scale); c.height = Math.round((v.videoHeight || 720) * scale);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        const poster = await new Promise((res) => c.toBlob(res, 'image/webp', 0.82));
        done({ duration: v.duration, poster });
      } catch { done({ duration: v.duration, poster: null }); }
    };
  });
}

// Uploads a clip as-is (no re-encoding) plus an automatic poster named <clip>-poster.webp next to it.
export async function uploadVideo(file, kind = 'project') {
  if (!ALLOWED_VIDEO.includes(file.type)) throw new Error('Unsupported video. Use MP4 or WebM.');
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`Video is larger than ${MAX_VIDEO_BYTES / 1048576} MB. Compress it first (see the guide).`);
  const { duration, poster } = await probeVideo(file);
  if (duration > MAX_VIDEO_SECONDS) throw new Error(`Video is ${Math.round(duration)} s long. Keep clips under ${MAX_VIDEO_SECONDS} s.`);
  const ext = file.type === 'video/webm' ? 'webm' : 'mp4';
  const base = safeName(file.name);
  const path = `${kind}/${base}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  await supabase.from('media').insert({ path, kind, mime_type: file.type, size_bytes: file.size, alt_text: null });
  if (poster) {
    const ppath = `${kind}/${base}-poster.webp`;
    const { error: pe } = await supabase.storage.from('media').upload(ppath, poster, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
    if (!pe) await supabase.from('media').insert({ path: ppath, kind, mime_type: 'image/webp', size_bytes: poster.size, alt_text: null });
  }
  logActivity('upload video', 'media', path);
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

export async function uploadImage(file, kind = 'other', alt = '') {
  if (!ALLOWED_MIME.includes(file.type)) throw new Error('Unsupported file type. Use JPG, PNG, WebP, AVIF or SVG.');
  if (file.size > MAX_BYTES) throw new Error('File is larger than 5 MB.');
  const { blob, ext, type } = await optimize(file);
  const path = `${kind}/${safeName(file.name)}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: type, upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
  await supabase.from('media').insert({ path, kind, mime_type: type, size_bytes: blob.size, alt_text: alt || null });
  logActivity('upload media', 'media', path);
  return pub.publicUrl;
}
