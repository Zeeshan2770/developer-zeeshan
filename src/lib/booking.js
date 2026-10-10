// Timezone-safe slot generation. Working hours are wall-clock times in the HOST timezone (booking.timezone);
// each slot is converted to an absolute UTC instant, so every visitor sees the correct moment in their own zone.

const dtf = (tz) => new Intl.DateTimeFormat('en-US', {
  timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

const parts = (ts, tz) => Object.fromEntries(dtf(tz).formatToParts(new Date(ts)).map((p) => [p.type, p.value]));

// Offset (ms) of `tz` from UTC at instant `ts`.
const tzOffset = (ts, tz) => {
  const p = parts(ts, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
};

// Wall-clock time in `tz` -> UTC instant (handles DST by re-checking the offset once).
export const zonedToUtc = (y, m, d, hh, mm, tz) => {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - tzOffset(guess, tz);
  const fix = tzOffset(utc, tz);
  utc = guess - fix;
  return utc;
};

export const dateKeyInTz = (ts, tz) => {
  const p = parts(ts, tz);
  return `${p.year}-${p.month}-${p.day}`;
};

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

/**
 * @returns {Array<{start:number,end:number}>} bookable slots (UTC ms), sorted
 */
export function generateSlots(cfg, booked = [], blockedDays = [], now = Date.now()) {
  if (!cfg?.enabled) return [];
  const tz = cfg.timezone;
  const dur = cfg.durationMin;
  const step = dur + (cfg.bufferMin || 0);
  const startMin = toMin(cfg.start);
  const endMin = toMin(cfg.end);
  const minTs = now + (cfg.minNoticeHours || 0) * 3600e3;
  const maxTs = now + (cfg.horizonDays || 30) * 86400e3;
  const blocked = new Set(blockedDays);

  const today = parts(now, tz);
  const base = Date.UTC(+today.year, +today.month - 1, +today.day);
  const perDay = {};
  booked.forEach((b) => { const k = dateKeyInTz(b.start, tz); perDay[k] = (perDay[k] || 0) + 1; });

  const out = [];
  for (let i = 0; i <= (cfg.horizonDays || 30) + 1; i += 1) {
    const day = new Date(base + i * 86400e3);
    if (!cfg.days.includes(day.getUTCDay())) continue;
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (blocked.has(key)) continue;
    let count = perDay[key] || 0;
    if (count >= (cfg.maxPerDay || 1000)) continue;
    for (let t = startMin; t + dur <= endMin; t += step) {
      const start = zonedToUtc(y, m, d, Math.floor(t / 60), t % 60, tz);
      const end = start + dur * 60e3;
      if (start < minTs || start > maxTs) continue;
      if (booked.some((b) => start < b.end && end > b.start)) continue;
      out.push({ start, end });
    }
  }
  return out;
}
