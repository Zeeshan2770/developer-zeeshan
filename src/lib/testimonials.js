// Shared option lists for community-service testimonials.
// KEEP IN SYNC with supabase/phase10_testimonials.sql (the database whitelists these values;
// tests/unit.test.mjs fails if the two drift apart).

export const RELATIONSHIPS = [
  'Beneficiary / service user',
  'Volunteer',
  'Partner organisation',
  'Client',
  'Donor / supporter',
  'Staff / team member',
  'Parent / guardian',
  'Community member',
  'Other',
];

export const ORG_TYPES = [
  'NGO / non-profit',
  'Community organisation',
  'School / educational institution',
  'Government / public body',
  'Healthcare / clinic',
  'Faith-based organisation',
  'Youth / student group',
  'Small business',
  'Individual (no organisation)',
  'Other',
];

// How the person wants their name shown. Applied in the database when the testimonial is submitted,
// so a private full name is never published by accident.
export const DISPLAY_OPTIONS = [
  ['full', 'Show my full name'],
  ['first', 'Show first name and last initial (e.g. Hina M.)'],
  ['anonymous', 'Keep me anonymous (shown as “Anonymous”)'],
];

// "Hina Malik" -> "Hina M."  (mirrors the SQL used on submission; used for the preview hint only)
export const shortName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
};
