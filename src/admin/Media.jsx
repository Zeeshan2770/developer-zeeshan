import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Confirm, useToast } from './adminui';
import { logActivity, uploadImage, uploadVideo } from './lib';

const KINDS = ['project', 'profile', 'article', 'testimonial', 'logo', 'other'];
const isVid = (m) => String(m.mime_type || '').startsWith('video/');
const posterPath = (p) => p.replace(/\.(mp4|webm)$/i, '-poster.webp');
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Media() {
  const [rows, setRows] = useState(null);
  const [kind, setKind] = useState('project');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [toast, notify] = useToast();
  const input = useRef(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('media').select('*').order('created_at', { ascending: false });
    if (error) notify(error.message, 'err'); else setRows(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const urlOf = (m) => supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of files) {
      try { await (f.type.startsWith('video/') ? uploadVideo(f, kind) : uploadImage(f, kind)); ok += 1; } catch (x) { notify(`${f.name}: ${x.message || 'failed'}`, 'err'); }
    }
    setBusy(false); e.target.value = '';
    if (ok) notify(`${ok} file${ok > 1 ? 's' : ''} uploaded & optimized`);
    load();
  };

  const copyLine = async (m) => {
    try { await navigator.clipboard.writeText(`${urlOf(m)} | Short screen recording | video`); notify('Project media line copied. Paste it into the project’s Media box.'); } catch { notify('Copy failed', 'err'); }
  };
  const copy = async (m) => {
    try { await navigator.clipboard.writeText(urlOf(m)); notify('URL copied'); } catch { notify('Copy failed', 'err'); }
  };
  const remove = async (m) => {
    await supabase.storage.from(m.bucket).remove([m.path]);
    const { error } = await supabase.from('media').delete().eq('id', m.id);
    if (error) return notify(error.message, 'err');
    if (isVid(m)) { // a clip owns its automatic poster image
      const pp = posterPath(m.path);
      await supabase.storage.from(m.bucket).remove([pp]);
      await supabase.from('media').delete().eq('path', pp);
    }
    logActivity('delete media', 'media', m.path);
    notify('Deleted'); load();
  };
  const setAlt = async (m, alt) => {
    await supabase.from('media').update({ alt_text: alt || null }).eq('id', m.id);
  };

  const list = (rows || []).filter((m) => !m.path.endsWith('-poster.webp') && (filter === 'all' || m.kind === filter));

  return (
    <div>
      <div className="page-head">
        <div><h1>Media</h1><p className="muted">Images: JPG, PNG, WebP, AVIF or SVG up to 5 MB (resized to 1920px and converted to WebP). Short screen recordings: MP4 or WebM, up to 12 MB and 30 seconds (aim for 1–4 MB); a preview image is created automatically.</p></div>
        <div className="upload-bar">
          <select className="ainput sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Upload as">{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml,video/mp4,video/webm" onChange={onFiles} />
          <button className="abtn solid" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Upload images or clips'}</button>
        </div>
      </div>
      <div className="chips">
        {['all', ...KINDS].map((k) => <button key={k} className={`achip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{k}</button>)}
      </div>
      {!rows ? <div className="state"><span className="spinner" /></div> : list.length === 0 ? (
        <div className="state empty"><strong>No media yet</strong><p className="muted">Uploaded files are organized in folders by type.</p></div>
      ) : (
        <div className="media-grid">
          {list.map((m) => (
            <figure key={m.id} className="mcard">
              {isVid(m)
                ? <video src={urlOf(m)} poster={urlOf({ ...m, path: posterPath(m.path) })} muted loop playsInline preload="metadata" controls />
                : <img src={urlOf(m)} alt={m.alt_text || ''} loading="lazy" />}
              <figcaption>
                <span className="mono small clamp">{m.path}</span>
                <span className="muted small">{m.kind} · {kb(m.size_bytes)}</span>
                <input className="ainput xs" placeholder="Alt text" defaultValue={m.alt_text || ''} onBlur={(e) => setAlt(m, e.target.value)} />
                <div className="mbtns"><button className="abtn xs" onClick={() => copy(m)}>Copy URL</button>{isVid(m) && <button className="abtn xs" onClick={() => copyLine(m)}>Copy project line</button>}<Confirm onConfirm={() => remove(m)}>Delete</Confirm></div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {toast}
    </div>
  );
}
