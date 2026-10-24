// Blog tags -> clean URL slugs and tag archives. Pure functions, shared by the React app, the build-time prerender,
// the sitemap function and the tests. A tag page only becomes indexable when it groups at least MIN_TAG_POSTS posts,
// so Google never sees thin one-article "archive" pages.
export const MIN_TAG_POSTS = 2;

export const tagSlug = (t) =>
  String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** posts -> [{ slug, name, count, posts }] sorted by count (desc), then name. */
export function collectTags(posts = []) {
  const map = new Map();
  for (const p of posts) {
    const seen = new Set();
    for (const raw of Array.isArray(p.tags) ? p.tags : []) {
      const name = String(raw || '').trim();
      const slug = tagSlug(name);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      if (!map.has(slug)) map.set(slug, { slug, name, count: 0, posts: [] });
      const e = map.get(slug);
      e.count += 1;
      e.posts.push(p);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const indexableTags = (posts) => collectTags(posts).filter((t) => t.count >= MIN_TAG_POSTS);
