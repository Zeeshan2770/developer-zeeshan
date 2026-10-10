// Fallbacks used until site_settings is loaded (or if Supabase is not configured yet).
// Real values live in the database — edit them there, not here.
export const DEFAULT_SETTINGS = {
  name: 'Muhammad Zeeshan Haider',
  title: 'Developer · Programmer · Digital Solutions Builder',
  tagline: 'Build. Solve. Evolve.',
  heroStatement: 'I build digital systems that turn ideas into practical, working solutions.',
  heroSupport:
    'Websites, full-stack applications, educational platforms, management systems and custom digital solutions.',
  availability: { open: true, label: 'Available for selected projects' },
  email: '',
  phone: '',
  whatsapp: '',
  waFloat: true, // show the floating WhatsApp chat button (needs a WhatsApp number above)
  waMessage: 'Hello! I found your website and would like to talk about a project.',
  social: { github: '', linkedin: '', extra: [] },  // extra: [{ label, url }] — X, YouTube, Instagram, …
  timezone: 'Asia/Karachi',
  seo: { defaultDescription: 'I build digital systems that turn ideas into working solutions.', ogImage: '' },
  footer: 'Build. Solve. Evolve.',
  copyright: 'Muhammad Zeeshan Haider',
  // Story sections (About page).
  story: [], // optional custom chapters; when empty the About page shows the written copy
};

export const SERVICE_ICONS = {
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2.4 3.8 5.4 3.8 9s-1.300 6.600-3.800 9m0-18C9.500 5.400 8.200 8.400 8.200 12s1.300 6.600 3.800 9M3 12h18',
  layers: 'M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5M3 16l9 5 9-5',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zm2 14h13v2H6',
  workflow: 'M4 4h6v6H4zM14 14h6v6h-6zM10 7h4a3 3 0 013 3v4',
  puzzle: 'M10 4a2 2 0 114 0v2h4v4h-2a2 2 0 100 4h2v4h-4v-2a2 2 0 10-4 0v2H6v-4h2a2 2 0 100-4H6V6h4V4z',
  rocket: 'M5 15c-1 1-1.500 4-1.500 4s3-.500 4-1.500M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-4-4 5-7zM9 11l-4 1 2-3',
  code: 'M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14',
};
