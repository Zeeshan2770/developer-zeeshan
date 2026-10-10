import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { slugify } from '../lib/validate';
import { Confirm, Drawer, ImageField, StatusBadge, Toggle, useToast } from './adminui';
import { fmtDay, logActivity } from './lib';
import { fromForm, toForm } from './resources';

function FieldInput({ fd, form, set, projects }) {
  const v = form[fd.k];
  const id = `f-${fd.k}`;
  switch (fd.type) {
    case 'textarea':
      return <textarea id={id} className="ainput" rows={fd.rows || 4} value={v ?? ''} onChange={(e) => set(fd.k, e.target.value)} />;
    case 'lines': case 'mediaitems':
      return <textarea id={id} className="ainput mono" rows={5} value={v ?? ''} onChange={(e) => set(fd.k, e.target.value)} />;
    case 'select':
      return <select id={id} className="ainput" value={v ?? ''} onChange={(e) => set(fd.k, e.target.value)}>{fd.options.map((o) => <option key={o}>{o}</option>)}</select>;
    case 'number':
      return <input id={id} className="ainput" type="number" min={fd.min} max={fd.max} value={v ?? ''} onChange={(e) => set(fd.k, e.target.value)} />;
    case 'checkbox':
      return <Toggle on={Boolean(v)} onChange={(x) => set(fd.k, x)} label={fd.label} />;
    case 'image':
      return <ImageField value={v} onChange={(x) => set(fd.k, x)} kind={fd.kind} />;
    case 'datetime':
      return <input id={id} className="ainput" type="datetime-local" value={v ?? ''} onChange={(e) => set(fd.k, e.target.value)} />;
    case 'slug':
      return (
        <div className="slug-row">
          <input id={id} className="ainput mono" value={v ?? ''} onChange={(e) => set(fd.k, slugify(e.target.value))} />
          <button type="button" className="abtn" onClick={() => set(fd.k, slugify(form[fd.from]))}>Generate</button>
        </div>
      );
    case 'techgroups':
      return (
        <div className="techgrid">
          {fd.keys.map((k) => (
            <label key={k} className="afield"><span>{k}</span>
              <input className="ainput" value={v?.[k] ?? ''} onChange={(e) => set(fd.k, { ...v, [k]: e.target.value })} placeholder="React, Vite" />
            </label>
          ))}
        </div>
      );
    case 'sections': {
      const list = Array.isArray(v) ? v : [];
      const upd = (i, patch) => set(fd.k, list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
      const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const c = [...list]; [c[i], c[j]] = [c[j], c[i]]; set(fd.k, c); };
      return (
        <div className="sections-ed">
          {list.map((s, i) => (
            <div key={i} className="feat-row">
              <input className="ainput" placeholder="Section title" aria-label={`Section ${i + 1} title`} maxLength={120} value={s.title} onChange={(e) => upd(i, { title: e.target.value })} />
              <textarea className="ainput" rows={4} placeholder="Section text (blank line = new paragraph)" aria-label={`Section ${i + 1} text`} maxLength={5000} value={s.body} onChange={(e) => upd(i, { body: e.target.value })} />
              <div className="row-actions">
                <button type="button" className="abtn" onClick={() => move(i, -1)} aria-label="Move section up">↑</button>
                <button type="button" className="abtn" onClick={() => move(i, 1)} aria-label="Move section down">↓</button>
                <button type="button" className="abtn danger" onClick={() => set(fd.k, list.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </div>
          ))}
          <button type="button" className="abtn" disabled={list.length >= 20} onClick={() => set(fd.k, [...list, { title: '', body: '' }])}>+ Add section</button>
        </div>
      );
    }
    case 'projectref':
      return (
        <select id={id} className="ainput" value={v ?? ''} onChange={(e) => set(fd.k, e.target.value)}>
          <option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      );
    default:
      return <input id={id} className="ainput" type="text" value={v ?? ''} onChange={(e) => set(fd.k, e.target.value)} />;
  }
}

function FeatureEditor({ rows, setRows }) {
  const upd = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const c = [...rows]; [c[i], c[j]] = [c[j], c[i]]; setRows(c);
  };
  return (
    <div className="features-ed">
      {rows.map((r, i) => (
        <div key={r.id || `n${i}`} className="feat-row">
          <div className="feat-fields">
            <input className="ainput" placeholder="Feature title" value={r.title} onChange={(e) => upd(i, { title: e.target.value })} />
            <input className="ainput" placeholder="Short description" value={r.description || ''} onChange={(e) => upd(i, { description: e.target.value })} />
          </div>
          <div className="feat-btns">
            <button type="button" className="abtn" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="abtn" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="abtn danger" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove">×</button>
          </div>
        </div>
      ))}
      <button type="button" className="abtn" onClick={() => setRows([...rows, { title: '', description: '' }])}>+ Add feature</button>
    </div>
  );
}

export function Resource({ cfg }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { id|null, form, features }
  const [projects, setProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, notify] = useToast();

  const load = useCallback(async () => {
    let q = supabase.from(cfg.table).select(cfg.select);
    cfg.order.forEach(([col, asc]) => { q = q.order(col, { ascending: asc }); });
    const { data, error: e } = await q;
    if (e) setError(e.message); else { setError(''); setRows(data); }
  }, [cfg]);

  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => {
    if (cfg.groups.flatMap(([, f]) => f).some((f) => f.type === 'projectref')) {
      supabase.from('projects').select('id,name').order('name').then(({ data }) => setProjects(data || []));
    }
  }, [cfg]);

  const openEditor = async (row) => {
    const base = row || cfg.defaults;
    let features = [];
    if (row && cfg.children) {
      const { data } = await supabase.from(cfg.children.table).select('*').eq(cfg.children.fk, row.id).order('sort_order');
      features = data || [];
    }
    setEditing({ id: row?.id || null, form: toForm(cfg, base), features });
  };

  const patch = async (row, changes, msg) => {
    const { error: e } = await supabase.from(cfg.table).update(changes).eq('id', row.id);
    if (e) return notify(e.message, 'err');
    logActivity(`update ${cfg.singular}`, cfg.table, row.id);
    notify(msg || 'Saved'); load();
  };

  const togglePublish = (row) => {
    const next = !row[cfg.publishField];
    const changes = { [cfg.publishField]: next };
    if (next && cfg.onPublish && !row[cfg.onPublish]) changes[cfg.onPublish] = new Date().toISOString();
    patch(row, changes, next ? (cfg.publishLabel ? 'Enabled' : 'Published') : (cfg.publishLabel ? 'Disabled' : 'Unpublished'));
  };

  const move = async (row, dir) => {
    const idx = rows.findIndex((r) => r.id === row.id);
    const other = rows[idx + dir];
    if (!other) return;
    const f = cfg.reorderField;
    if (row[f] === other[f]) {
      // Tie: nudge just this row past its neighbour.
      await supabase.from(cfg.table).update({ [f]: row[f] + dir }).eq('id', row.id);
    } else {
      await Promise.all([
        supabase.from(cfg.table).update({ [f]: other[f] }).eq('id', row.id),
        supabase.from(cfg.table).update({ [f]: row[f] }).eq('id', other.id),
      ]);
    }
    load();
  };

  const remove = async (row) => {
    const { error: e } = await supabase.from(cfg.table).delete().eq('id', row.id);
    if (e) return notify(e.message, 'err');
    logActivity(`delete ${cfg.singular}`, cfg.table, row.id);
    notify('Deleted'); load();
  };

  const save = async (ev) => {
    ev.preventDefault();
    const { id, form, features } = editing;
    const payload = fromForm(cfg, form);
    const nameVal = payload[cfg.nameField];
    if (!nameVal) return notify(`${cfg.nameField} is required`, 'err');
    if (cfg.groups.flatMap(([, f]) => f).some((f) => f.type === 'slug')) {
      if (!payload.slug) payload.slug = slugify(nameVal);
      if (!payload.slug) return notify('Slug is required', 'err');
    }
    if (payload.sort_order == null && 'sort_order' in cfg.defaults) payload.sort_order = 100;
    if (cfg.table === 'insights') {
      if (!payload.reading_minutes) payload.reading_minutes = Math.max(1, Math.round((payload.content || '').split(/\s+/).length / 200));
      if (payload.published && !payload.published_at) payload.published_at = new Date().toISOString();
    }
    setSaving(true);
    const res = id
      ? await supabase.from(cfg.table).update(payload).eq('id', id).select('id').single()
      : await supabase.from(cfg.table).insert(payload).select('id').single();
    if (res.error) {
      setSaving(false);
      return notify(res.error.code === '23505' ? 'That slug is already used. Choose another.' : res.error.message, 'err');
    }
    const rowId = res.data.id;
    if (cfg.children) {
      const { table, fk } = cfg.children;
      await supabase.from(table).delete().eq(fk, rowId);
      const clean = features.filter((f) => f.title?.trim()).map((f, i) => ({ [fk]: rowId, title: f.title.trim(), description: f.description?.trim() || null, sort_order: (i + 1) * 10 }));
      if (clean.length) {
        const { error: ce } = await supabase.from(table).insert(clean);
        if (ce) notify(`Saved, but features failed: ${ce.message}`, 'err');
      }
    }
    logActivity(`${id ? 'update' : 'create'} ${cfg.singular}`, cfg.table, rowId);
    setSaving(false); setEditing(null); notify(id ? 'Saved' : 'Created'); load();
  };

  const set = (k, v) => setEditing((e) => ({ ...e, form: { ...e.form, [k]: v } }));

  return (
    <div>
      <div className="page-head">
        <div><h1>{cfg.title}</h1><p className="muted">{rows ? `${rows.length} total` : 'Loading…'}</p></div>
        <button className="abtn solid" onClick={() => openEditor(null)}>+ New {cfg.singular}</button>
      </div>
      {error && <div className="banner err">{error}</div>}
      {rows && rows.length === 0 && <div className="state empty"><strong>Nothing here yet</strong><p className="muted">Create your first {cfg.singular}.</p></div>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="atable">
            <thead>
              <tr>
                {cfg.reorderField && <th style={{ width: 70 }}>Order</th>}
                {cfg.columns.map(([, label]) => <th key={label}>{label}</th>)}
                {cfg.featureField && <th>Featured</th>}
                <th>{cfg.publishLabel || 'Published'}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  {cfg.reorderField && (
                    <td className="nowrap">
                      <button className="abtn xs" disabled={i === 0} onClick={() => move(r, -1)} aria-label="Move up">↑</button>
                      <button className="abtn xs" disabled={i === rows.length - 1} onClick={() => move(r, 1)} aria-label="Move down">↓</button>
                    </td>
                  )}
                  {cfg.columns.map(([k, label, kind], ci) => (
                    <td key={k}>
                      {ci === 0 ? <button className="linkish" onClick={() => openEditor(r)}>{r[k] || '—'}</button>
                        : k === 'status' ? <StatusBadge value={r[k]} />
                        : kind === 'date' ? fmtDay(r[k]) : (r[k] ?? '—')}
                    </td>
                  ))}
                  {cfg.featureField && <td><Toggle on={r[cfg.featureField]} label="Featured" onChange={(x) => patch(r, { [cfg.featureField]: x }, x ? 'Featured' : 'Unfeatured')} /></td>}
                  <td><Toggle on={r[cfg.publishField]} label="Published" onChange={() => togglePublish(r)} /></td>
                  <td className="nowrap right">
                    {cfg.previewPath && r.slug && (
                      <a className="abtn" href={`${cfg.previewPath}${r.slug}?preview=1`} target="_blank" rel="noopener noreferrer"
                        title={r[cfg.publishField] ? 'Open live page' : 'Preview this draft'}>{r[cfg.publishField] ? 'View' : 'Preview'}</a>
                    )}{' '}
                    <button className="abtn" onClick={() => openEditor(r)}>Edit</button>{' '}
                    <Confirm onConfirm={() => remove(r)}>Delete</Confirm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Drawer title={editing.id ? `Edit ${cfg.singular}` : `New ${cfg.singular}`} onClose={() => setEditing(null)} wide>
          <form onSubmit={save} className="editor">
            {cfg.groups.map(([gname, fields]) => (
              <fieldset key={gname}>
                <legend>{gname}</legend>
                {fields.map((fd) => (
                  <label key={fd.k} className={`afield ${fd.type === 'checkbox' ? 'inline' : ''}`} htmlFor={`f-${fd.k}`}>
                    <span>{fd.label}{fd.required && <i> *</i>}</span>
                    <FieldInput fd={{ ...fd, kind: cfg.imageKind }} form={editing.form} set={set} projects={projects} />
                  </label>
                ))}
                {gname === 'Case study' && cfg.children && (
                  <div className="afield"><span>{cfg.children.label}</span>
                    <FeatureEditor rows={editing.features} setRows={(f) => setEditing((e) => ({ ...e, features: f }))} />
                  </div>
                )}
              </fieldset>
            ))}
            <div className="editor-foot">
              <button type="button" className="abtn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="abtn solid" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Drawer>
      )}
      {toast}
    </div>
  );
}
